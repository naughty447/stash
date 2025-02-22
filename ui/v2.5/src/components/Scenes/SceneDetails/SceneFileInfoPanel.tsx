import React, { useMemo, useState } from "react";
import { Accordion, Button, Card } from "react-bootstrap";
import { FormattedMessage, FormattedNumber, useIntl } from "react-intl";
import { useHistory } from "react-router-dom";
import { TruncatedText } from "src/components/Shared";
import DeleteFilesDialog from "src/components/Shared/DeleteFilesDialog";
import ReassignFilesDialog from "src/components/Shared/ReassignFilesDialog";
import * as GQL from "src/core/generated-graphql";
import { mutateSceneSetPrimaryFile } from "src/core/StashService";
import { useToast } from "src/hooks";
import { NavUtils, TextUtils, getStashboxBase } from "src/utils";
import { TextField, URLField } from "src/utils/field";

interface IFileInfoPanelProps {
  sceneID: string;
  file: GQL.VideoFileDataFragment;
  primary?: boolean;
  ofMany?: boolean;
  onSetPrimaryFile?: () => void;
  onDeleteFile?: () => void;
  onReassign?: () => void;
  loading?: boolean;
}

const FileInfoPanel: React.FC<IFileInfoPanelProps> = (
  props: IFileInfoPanelProps
) => {
  const intl = useIntl();
  const history = useHistory();

  function renderFileSize() {
    const { size, unit } = TextUtils.fileSize(props.file.size);

    return (
      <TextField id="filesize">
        <span className="text-truncate">
          <FormattedNumber
            value={size}
            // eslint-disable-next-line react/style-prop-object
            style="unit"
            unit={unit}
            unitDisplay="narrow"
            maximumFractionDigits={2}
          />
        </span>
      </TextField>
    );
  }

  // TODO - generalise fingerprints
  const oshash = props.file.fingerprints.find((f) => f.type === "oshash");
  const phash = props.file.fingerprints.find((f) => f.type === "phash");
  const checksum = props.file.fingerprints.find((f) => f.type === "md5");

  function onSplit() {
    history.push(
      `/scenes/new?from_scene_id=${props.sceneID}&file_id=${props.file.id}`
    );
  }

  return (
    <div>
      <dl className="container scene-file-info details-list">
        {props.primary && (
          <>
            <dt></dt>
            <dd className="primary-file">
              <FormattedMessage id="primary_file" />
            </dd>
          </>
        )}
        <TextField id="media_info.hash" value={oshash?.value} truncate />
        <TextField id="media_info.checksum" value={checksum?.value} truncate />
        <URLField
          id="media_info.phash"
          abbr="Perceptual hash"
          value={phash?.value}
          url={NavUtils.makeScenesPHashMatchUrl(phash?.value)}
          target="_self"
          truncate
          trusted
        />
        <URLField
          id="path"
          url={`file://${props.file.path}`}
          value={`file://${props.file.path}`}
          truncate
        />
        {renderFileSize()}
        <TextField
          id="duration"
          value={TextUtils.secondsToTimestamp(props.file.duration ?? 0)}
          truncate
        />
        <TextField
          id="dimensions"
          value={`${props.file.width} x ${props.file.height}`}
          truncate
        />
        <TextField id="framerate">
          <FormattedMessage
            id="frames_per_second"
            values={{ value: intl.formatNumber(props.file.frame_rate ?? 0) }}
          />
        </TextField>
        <TextField id="bitrate">
          <FormattedMessage
            id="megabits_per_second"
            values={{
              value: intl.formatNumber((props.file.bit_rate ?? 0) / 1000000, {
                maximumFractionDigits: 2,
              }),
            }}
          />
        </TextField>
        <TextField
          id="media_info.video_codec"
          value={props.file.video_codec ?? ""}
          truncate
        />
        <TextField
          id="media_info.audio_codec"
          value={props.file.audio_codec ?? ""}
          truncate
        />
      </dl>
      {props.ofMany && props.onSetPrimaryFile && !props.primary && (
        <div>
          <Button
            className="edit-button"
            disabled={props.loading}
            onClick={props.onSetPrimaryFile}
          >
            <FormattedMessage id="actions.make_primary" />
          </Button>
          <Button
            className="edit-button"
            disabled={props.loading}
            onClick={props.onReassign}
          >
            <FormattedMessage id="actions.reassign" />
          </Button>
          <Button className="edit-button" onClick={onSplit}>
            <FormattedMessage id="actions.split" />
          </Button>
          <Button
            variant="danger"
            disabled={props.loading}
            onClick={props.onDeleteFile}
          >
            <FormattedMessage id="actions.delete_file" />
          </Button>
        </div>
      )}
    </div>
  );
};

interface ISceneFileInfoPanelProps {
  scene: GQL.SceneDataFragment;
}

export const SceneFileInfoPanel: React.FC<ISceneFileInfoPanelProps> = (
  props: ISceneFileInfoPanelProps
) => {
  const Toast = useToast();

  const [loading, setLoading] = useState(false);
  const [deletingFile, setDeletingFile] = useState<
    GQL.VideoFileDataFragment | undefined
  >();
  const [reassigningFile, setReassigningFile] = useState<
    GQL.VideoFileDataFragment | undefined
  >();

  function renderStashIDs() {
    if (!props.scene.stash_ids.length) {
      return;
    }

    return (
      <>
        <dt>StashIDs</dt>
        <dd>
          <dl>
            {props.scene.stash_ids.map((stashID) => {
              const base = getStashboxBase(stashID.endpoint);
              const link = base ? (
                <a
                  href={`${base}scenes/${stashID.stash_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {stashID.stash_id}
                </a>
              ) : (
                stashID.stash_id
              );
              return (
                <dd key={stashID.stash_id} className="row no-gutters">
                  {link}
                </dd>
              );
            })}
          </dl>
        </dd>
      </>
    );
  }

  function renderFunscript() {
    if (props.scene.interactive) {
      return (
        <URLField
          name="Funscript"
          url={props.scene.paths.funscript}
          value={props.scene.paths.funscript}
          truncate
        />
      );
    }
  }

  function renderInteractiveSpeed() {
    if (props.scene.interactive_speed) {
      return (
        <TextField id="media_info.interactive_speed">
          <FormattedNumber value={props.scene.interactive_speed} />
        </TextField>
      );
    }
  }

  const filesPanel = useMemo(() => {
    if (props.scene.files.length === 0) {
      return;
    }

    if (props.scene.files.length === 1) {
      return (
        <FileInfoPanel sceneID={props.scene.id} file={props.scene.files[0]} />
      );
    }

    async function onSetPrimaryFile(fileID: string) {
      try {
        setLoading(true);
        await mutateSceneSetPrimaryFile(props.scene.id, fileID);
      } catch (e) {
        Toast.error(e);
      } finally {
        setLoading(false);
      }
    }

    return (
      <Accordion defaultActiveKey={props.scene.files[0].id}>
        {deletingFile && (
          <DeleteFilesDialog
            onClose={() => setDeletingFile(undefined)}
            selected={[deletingFile]}
          />
        )}
        {reassigningFile && (
          <ReassignFilesDialog
            onClose={() => setReassigningFile(undefined)}
            selected={reassigningFile}
          />
        )}
        {props.scene.files.map((file, index) => (
          <Card key={file.id} className="scene-file-card">
            <Accordion.Toggle as={Card.Header} eventKey={file.id}>
              <TruncatedText text={TextUtils.fileNameFromPath(file.path)} />
            </Accordion.Toggle>
            <Accordion.Collapse eventKey={file.id}>
              <Card.Body>
                <FileInfoPanel
                  sceneID={props.scene.id}
                  file={file}
                  primary={index === 0}
                  ofMany
                  onSetPrimaryFile={() => onSetPrimaryFile(file.id)}
                  onDeleteFile={() => setDeletingFile(file)}
                  onReassign={() => setReassigningFile(file)}
                  loading={loading}
                />
              </Card.Body>
            </Accordion.Collapse>
          </Card>
        ))}
      </Accordion>
    );
  }, [props.scene, loading, Toast, deletingFile, reassigningFile]);

  return (
    <>
      <dl className="container scene-file-info details-list">
        <URLField
          id="media_info.stream"
          url={props.scene.paths.stream}
          value={props.scene.paths.stream}
          truncate
        />
        {renderFunscript()}
        {renderInteractiveSpeed()}
        <URLField
          id="media_info.downloaded_from"
          url={props.scene.url}
          value={props.scene.url}
          truncate
        />
        {renderStashIDs()}
      </dl>

      {filesPanel}
    </>
  );
};

export default SceneFileInfoPanel;
