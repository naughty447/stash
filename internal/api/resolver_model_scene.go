package api

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/stashapp/stash/internal/api/loaders"
	"github.com/stashapp/stash/internal/api/urlbuilders"
	"github.com/stashapp/stash/internal/manager"
	"github.com/stashapp/stash/pkg/file"
	"github.com/stashapp/stash/pkg/models"
	"github.com/stashapp/stash/pkg/utils"
)

func (r *sceneResolver) getPrimaryFile(ctx context.Context, obj *models.Scene) (*file.VideoFile, error) {
	if obj.PrimaryFileID != nil {
		f, err := loaders.From(ctx).FileByID.Load(*obj.PrimaryFileID)
		if err != nil {
			return nil, err
		}

		ret, ok := f.(*file.VideoFile)
		if !ok {
			return nil, fmt.Errorf("file %T is not an image file", f)
		}

		obj.Files.SetPrimary(ret)

		return ret, nil
	} else {
		_ = obj.LoadPrimaryFile(ctx, r.repository.File)
	}

	return nil, nil
}

func (r *sceneResolver) getFiles(ctx context.Context, obj *models.Scene) ([]*file.VideoFile, error) {
	fileIDs, err := loaders.From(ctx).SceneFiles.Load(obj.ID)
	if err != nil {
		return nil, err
	}

	files, errs := loaders.From(ctx).FileByID.LoadAll(fileIDs)
	ret := make([]*file.VideoFile, len(files))
	for i, bf := range files {
		f, ok := bf.(*file.VideoFile)
		if !ok {
			return nil, fmt.Errorf("file %T is not a video file", f)
		}

		ret[i] = f
	}

	obj.Files.Set(ret)

	return ret, firstError(errs)
}

func (r *sceneResolver) FileModTime(ctx context.Context, obj *models.Scene) (*time.Time, error) {
	f, err := r.getPrimaryFile(ctx, obj)
	if err != nil {
		return nil, err
	}

	if f != nil {
		return &f.ModTime, nil
	}
	return nil, nil
}

func (r *sceneResolver) Date(ctx context.Context, obj *models.Scene) (*string, error) {
	if obj.Date != nil {
		result := obj.Date.String()
		return &result, nil
	}
	return nil, nil
}

// File is deprecated
func (r *sceneResolver) File(ctx context.Context, obj *models.Scene) (*models.SceneFileType, error) {
	f, err := r.getPrimaryFile(ctx, obj)
	if err != nil {
		return nil, err
	}
	if f == nil {
		return nil, nil
	}

	bitrate := int(f.BitRate)
	size := strconv.FormatInt(f.Size, 10)

	return &models.SceneFileType{
		Size:       &size,
		Duration:   handleFloat64(f.Duration),
		VideoCodec: &f.VideoCodec,
		AudioCodec: &f.AudioCodec,
		Width:      &f.Width,
		Height:     &f.Height,
		Framerate:  handleFloat64(f.FrameRate),
		Bitrate:    &bitrate,
	}, nil
}

func (r *sceneResolver) Files(ctx context.Context, obj *models.Scene) ([]*VideoFile, error) {
	files, err := r.getFiles(ctx, obj)
	if err != nil {
		return nil, err
	}

	ret := make([]*VideoFile, len(files))

	for i, f := range files {
		ret[i] = &VideoFile{
			ID:             strconv.Itoa(int(f.ID)),
			Path:           f.Path,
			Basename:       f.Basename,
			ParentFolderID: strconv.Itoa(int(f.ParentFolderID)),
			ModTime:        f.ModTime,
			Format:         f.Format,
			Size:           f.Size,
			Duration:       handleFloat64Value(f.Duration),
			VideoCodec:     f.VideoCodec,
			AudioCodec:     f.AudioCodec,
			Width:          f.Width,
			Height:         f.Height,
			FrameRate:      handleFloat64Value(f.FrameRate),
			BitRate:        int(f.BitRate),
			CreatedAt:      f.CreatedAt,
			UpdatedAt:      f.UpdatedAt,
			Fingerprints:   resolveFingerprints(f.Base()),
		}

		if f.ZipFileID != nil {
			zipFileID := strconv.Itoa(int(*f.ZipFileID))
			ret[i].ZipFileID = &zipFileID
		}
	}

	return ret, nil
}

func (r *sceneResolver) Rating(ctx context.Context, obj *models.Scene) (*int, error) {
	if obj.Rating != nil {
		rating := models.Rating100To5(*obj.Rating)
		return &rating, nil
	}
	return nil, nil
}

func (r *sceneResolver) Rating100(ctx context.Context, obj *models.Scene) (*int, error) {
	return obj.Rating, nil
}

func resolveFingerprints(f *file.BaseFile) []*Fingerprint {
	ret := make([]*Fingerprint, len(f.Fingerprints))

	for i, fp := range f.Fingerprints {
		ret[i] = &Fingerprint{
			Type:  fp.Type,
			Value: formatFingerprint(fp.Fingerprint),
		}
	}

	return ret
}

func formatFingerprint(fp interface{}) string {
	switch v := fp.(type) {
	case int64:
		return strconv.FormatUint(uint64(v), 16)
	default:
		return fmt.Sprintf("%v", fp)
	}
}

func (r *sceneResolver) Paths(ctx context.Context, obj *models.Scene) (*ScenePathsType, error) {
	baseURL, _ := ctx.Value(BaseURLCtxKey).(string)
	config := manager.GetInstance().Config
	builder := urlbuilders.NewSceneURLBuilder(baseURL, obj.ID)
	builder.APIKey = config.GetAPIKey()
	screenshotPath := builder.GetScreenshotURL(obj.UpdatedAt)
	previewPath := builder.GetStreamPreviewURL()
	streamPath := builder.GetStreamURL().String()
	webpPath := builder.GetStreamPreviewImageURL()
	vttPath := builder.GetSpriteVTTURL()
	spritePath := builder.GetSpriteURL()
	chaptersVttPath := builder.GetChaptersVTTURL()
	funscriptPath := builder.GetFunscriptURL()
	captionBasePath := builder.GetCaptionURL()
	interactiveHeatmap := builder.GetInteractiveHeatmapURL()

	return &ScenePathsType{
		Screenshot:         &screenshotPath,
		Preview:            &previewPath,
		Stream:             &streamPath,
		Webp:               &webpPath,
		Vtt:                &vttPath,
		ChaptersVtt:        &chaptersVttPath,
		Sprite:             &spritePath,
		Funscript:          &funscriptPath,
		InteractiveHeatmap: &interactiveHeatmap,
		Caption:            &captionBasePath,
	}, nil
}

func (r *sceneResolver) SceneMarkers(ctx context.Context, obj *models.Scene) (ret []*models.SceneMarker, err error) {
	if err := r.withTxn(ctx, func(ctx context.Context) error {
		ret, err = r.repository.SceneMarker.FindBySceneID(ctx, obj.ID)
		return err
	}); err != nil {
		return nil, err
	}

	return ret, nil
}

func (r *sceneResolver) Captions(ctx context.Context, obj *models.Scene) (ret []*models.VideoCaption, err error) {
	primaryFile, err := r.getPrimaryFile(ctx, obj)
	if err != nil {
		return nil, err
	}
	if primaryFile == nil {
		return nil, nil
	}

	if err := r.withTxn(ctx, func(ctx context.Context) error {
		ret, err = r.repository.File.GetCaptions(ctx, primaryFile.Base().ID)
		return err
	}); err != nil {
		return nil, err
	}

	return ret, err
}

func (r *sceneResolver) Galleries(ctx context.Context, obj *models.Scene) (ret []*models.Gallery, err error) {
	if !obj.GalleryIDs.Loaded() {
		if err := r.withTxn(ctx, func(ctx context.Context) error {
			return obj.LoadGalleryIDs(ctx, r.repository.Scene)
		}); err != nil {
			return nil, err
		}
	}

	var errs []error
	ret, errs = loaders.From(ctx).GalleryByID.LoadAll(obj.GalleryIDs.List())
	return ret, firstError(errs)
}

func (r *sceneResolver) Studio(ctx context.Context, obj *models.Scene) (ret *models.Studio, err error) {
	if obj.StudioID == nil {
		return nil, nil
	}

	return loaders.From(ctx).StudioByID.Load(*obj.StudioID)
}

func (r *sceneResolver) Movies(ctx context.Context, obj *models.Scene) (ret []*SceneMovie, err error) {
	if !obj.Movies.Loaded() {
		if err := r.withTxn(ctx, func(ctx context.Context) error {
			qb := r.repository.Scene

			return obj.LoadMovies(ctx, qb)
		}); err != nil {
			return nil, err
		}
	}

	loader := loaders.From(ctx).MovieByID

	for _, sm := range obj.Movies.List() {
		movie, err := loader.Load(sm.MovieID)
		if err != nil {
			return nil, err
		}

		sceneIdx := sm.SceneIndex
		sceneMovie := &SceneMovie{
			Movie:      movie,
			SceneIndex: sceneIdx,
		}

		ret = append(ret, sceneMovie)
	}

	return ret, nil
}

func (r *sceneResolver) Tags(ctx context.Context, obj *models.Scene) (ret []*models.Tag, err error) {
	if !obj.TagIDs.Loaded() {
		if err := r.withTxn(ctx, func(ctx context.Context) error {
			return obj.LoadTagIDs(ctx, r.repository.Scene)
		}); err != nil {
			return nil, err
		}
	}

	var errs []error
	ret, errs = loaders.From(ctx).TagByID.LoadAll(obj.TagIDs.List())
	return ret, firstError(errs)
}

func (r *sceneResolver) Performers(ctx context.Context, obj *models.Scene) (ret []*models.Performer, err error) {
	if !obj.PerformerIDs.Loaded() {
		if err := r.withTxn(ctx, func(ctx context.Context) error {
			return obj.LoadPerformerIDs(ctx, r.repository.Scene)
		}); err != nil {
			return nil, err
		}
	}

	var errs []error
	ret, errs = loaders.From(ctx).PerformerByID.LoadAll(obj.PerformerIDs.List())
	return ret, firstError(errs)
}

func stashIDsSliceToPtrSlice(v []models.StashID) []*models.StashID {
	ret := make([]*models.StashID, len(v))
	for i, vv := range v {
		c := vv
		ret[i] = &c
	}

	return ret
}

func (r *sceneResolver) StashIds(ctx context.Context, obj *models.Scene) (ret []*models.StashID, err error) {
	if err := r.withTxn(ctx, func(ctx context.Context) error {
		return obj.LoadStashIDs(ctx, r.repository.Scene)
	}); err != nil {
		return nil, err
	}

	return stashIDsSliceToPtrSlice(obj.StashIDs.List()), nil
}

func (r *sceneResolver) Phash(ctx context.Context, obj *models.Scene) (*string, error) {
	f, err := r.getPrimaryFile(ctx, obj)
	if err != nil {
		return nil, err
	}

	if f == nil {
		return nil, nil
	}

	val := f.Fingerprints.Get(file.FingerprintTypePhash)
	if val == nil {
		return nil, nil
	}

	phash, _ := val.(int64)

	if phash != 0 {
		hexval := utils.PhashToString(phash)
		return &hexval, nil
	}
	return nil, nil
}

func (r *sceneResolver) SceneStreams(ctx context.Context, obj *models.Scene) ([]*manager.SceneStreamEndpoint, error) {
	// load the primary file into the scene
	_, err := r.getPrimaryFile(ctx, obj)
	if err != nil {
		return nil, err
	}

	config := manager.GetInstance().Config

	baseURL, _ := ctx.Value(BaseURLCtxKey).(string)
	builder := urlbuilders.NewSceneURLBuilder(baseURL, obj.ID)
	builder.APIKey = config.GetAPIKey()

	return manager.GetSceneStreamPaths(obj, builder.GetStreamURL(), config.GetMaxStreamingTranscodeSize())
}

func (r *sceneResolver) Interactive(ctx context.Context, obj *models.Scene) (bool, error) {
	primaryFile, err := r.getPrimaryFile(ctx, obj)
	if err != nil {
		return false, err
	}
	if primaryFile == nil {
		return false, nil
	}

	return primaryFile.Interactive, nil
}

func (r *sceneResolver) InteractiveSpeed(ctx context.Context, obj *models.Scene) (*int, error) {
	primaryFile, err := r.getPrimaryFile(ctx, obj)
	if err != nil {
		return nil, err
	}
	if primaryFile == nil {
		return nil, nil
	}

	return primaryFile.InteractiveSpeed, nil
}
