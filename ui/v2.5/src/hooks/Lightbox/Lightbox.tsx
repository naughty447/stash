import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Col,
  InputGroup,
  Overlay,
  Popover,
  Form,
  Row,
} from "react-bootstrap";
import cx from "classnames";
import Mousetrap from "mousetrap";
import debounce from "lodash-es/debounce";

import { Icon, LoadingIndicator } from "src/components/Shared";
import { useInterval, usePageVisibility, useToast } from "src/hooks";
import { FormattedMessage, useIntl } from "react-intl";
import { LightboxImage } from "./LightboxImage";
import { ConfigurationContext } from "../Config";
import { Link } from "react-router-dom";
import { OCounterButton } from "src/components/Scenes/SceneDetails/OCounterButton";
import {
  mutateImageIncrementO,
  mutateImageDecrementO,
  mutateImageResetO,
  useImageUpdate,
} from "src/core/StashService";
import * as GQL from "src/core/generated-graphql";
import { useInterfaceLocalForage } from "../LocalForage";
import { imageLightboxDisplayModeIntlMap } from "src/core/enums";
import { ILightboxImage } from "./types";
import {
  faArrowLeft,
  faArrowRight,
  faChevronLeft,
  faChevronRight,
  faCog,
  faExpand,
  faPause,
  faPlay,
  faSearchMinus,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
import { RatingSystem } from "src/components/Shared/Rating/RatingSystem";

const CLASSNAME = "Lightbox";
const CLASSNAME_HEADER = `${CLASSNAME}-header`;
const CLASSNAME_LEFT_SPACER = `${CLASSNAME_HEADER}-left-spacer`;
const CLASSNAME_INDICATOR = `${CLASSNAME_HEADER}-indicator`;
const CLASSNAME_OPTIONS = `${CLASSNAME_HEADER}-options`;
const CLASSNAME_OPTIONS_ICON = `${CLASSNAME_OPTIONS}-icon`;
const CLASSNAME_OPTIONS_INLINE = `${CLASSNAME_OPTIONS}-inline`;
const CLASSNAME_RIGHT = `${CLASSNAME_HEADER}-right`;
const CLASSNAME_FOOTER = `${CLASSNAME}-footer`;
const CLASSNAME_FOOTER_LEFT = `${CLASSNAME_FOOTER}-left`;
const CLASSNAME_DISPLAY = `${CLASSNAME}-display`;
const CLASSNAME_CAROUSEL = `${CLASSNAME}-carousel`;
const CLASSNAME_INSTANT = `${CLASSNAME_CAROUSEL}-instant`;
const CLASSNAME_IMAGE = `${CLASSNAME_CAROUSEL}-image`;
const CLASSNAME_NAVBUTTON = `${CLASSNAME}-navbutton`;
const CLASSNAME_NAV = `${CLASSNAME}-nav`;
const CLASSNAME_NAVIMAGE = `${CLASSNAME_NAV}-image`;
const CLASSNAME_NAVSELECTED = `${CLASSNAME_NAV}-selected`;

const DEFAULT_SLIDESHOW_DELAY = 5000;
const SECONDS_TO_MS = 1000;
const MIN_VALID_INTERVAL_SECONDS = 1;

interface IProps {
  images: ILightboxImage[];
  isVisible: boolean;
  isLoading: boolean;
  initialIndex?: number;
  showNavigation: boolean;
  slideshowEnabled?: boolean;
  pageHeader?: string;
  pageCallback?: (direction: number) => void;
  hide: () => void;
}

export const LightboxComponent: React.FC<IProps> = ({
  images,
  isVisible,
  isLoading,
  initialIndex = 0,
  showNavigation,
  slideshowEnabled = false,
  pageHeader,
  pageCallback,
  hide,
}) => {
  const [updateImage] = useImageUpdate();

  const [index, setIndex] = useState<number | null>(null);
  const [movingLeft, setMovingLeft] = useState(false);
  const oldIndex = useRef<number | null>(null);
  const [instantTransition, setInstantTransition] = useState(false);
  const [isSwitchingPage, setIsSwitchingPage] = useState(true);
  const [isFullscreen, setFullscreen] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const oldImages = useRef<ILightboxImage[]>([]);

  const [zoom, setZoom] = useState(1);
  const [resetPosition, setResetPosition] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlayTarget = useRef<HTMLButtonElement | null>(null);
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<HTMLDivElement | null>(null);
  const clearIntervalCallback = useRef<() => void>();
  const resetIntervalCallback = useRef<() => void>();

  const allowNavigation = images.length > 1 || pageCallback;

  const Toast = useToast();
  const intl = useIntl();
  const { configuration: config } = React.useContext(ConfigurationContext);
  const [
    interfaceLocalForage,
    setInterfaceLocalForage,
  ] = useInterfaceLocalForage();

  const lightboxSettings = interfaceLocalForage.data?.imageLightbox;

  function setLightboxSettings(v: Partial<GQL.ConfigImageLightboxInput>) {
    setInterfaceLocalForage((prev) => {
      return {
        ...prev,
        imageLightbox: {
          ...prev.imageLightbox,
          ...v,
        },
      };
    });
  }

  function setScaleUp(value: boolean) {
    setLightboxSettings({ scaleUp: value });
  }

  function setResetZoomOnNav(v: boolean) {
    setLightboxSettings({ resetZoomOnNav: v });
  }

  function setScrollMode(v: GQL.ImageLightboxScrollMode) {
    setLightboxSettings({ scrollMode: v });
  }

  const configuredDelay = config?.interface.imageLightbox.slideshowDelay
    ? config.interface.imageLightbox.slideshowDelay * SECONDS_TO_MS
    : undefined;

  const savedDelay = lightboxSettings?.slideshowDelay
    ? lightboxSettings.slideshowDelay * SECONDS_TO_MS
    : undefined;

  const slideshowDelay =
    savedDelay ?? configuredDelay ?? DEFAULT_SLIDESHOW_DELAY;

  const scrollAttemptsBeforeChange = Math.max(
    0,
    config?.interface.imageLightbox.scrollAttemptsBeforeChange ?? 0
  );

  function setSlideshowDelay(v: number) {
    setLightboxSettings({ slideshowDelay: v });
  }

  const displayMode =
    lightboxSettings?.displayMode ?? GQL.ImageLightboxDisplayMode.FitXy;
  const oldDisplayMode = useRef(displayMode);

  function setDisplayMode(v: GQL.ImageLightboxDisplayMode) {
    setLightboxSettings({ displayMode: v });
  }

  // slideshowInterval is used for controlling the logic
  // displaySlideshowInterval is for display purposes only
  // keeping them separate and independant allows us to handle the logic however we want
  // while still displaying something that makes sense to the user
  const [slideshowInterval, setSlideshowInterval] = useState<number | null>(
    null
  );

  const [
    displayedSlideshowInterval,
    setDisplayedSlideshowInterval,
  ] = useState<string>((slideshowDelay / SECONDS_TO_MS).toString());

  useEffect(() => {
    if (images !== oldImages.current && isSwitchingPage) {
      oldImages.current = images;
      if (index === -1) setIndex(images.length - 1);
      setIsSwitchingPage(false);
    }
  }, [isSwitchingPage, images, index]);

  const disableInstantTransition = debounce(
    () => setInstantTransition(false),
    400
  );

  const setInstant = useCallback(() => {
    setInstantTransition(true);
    disableInstantTransition();
  }, [disableInstantTransition]);

  useEffect(() => {
    if (images.length < 2) return;
    if (index === oldIndex.current) return;
    if (index === null) return;

    // reset zoom status
    // setResetZoom((r) => !r);
    // setZoomed(false);
    if (lightboxSettings?.resetZoomOnNav) {
      setZoom(1);
    }
    setResetPosition((r) => !r);

    if (carouselRef.current)
      carouselRef.current.style.left = `${index * -100}vw`;
    if (indicatorRef.current)
      indicatorRef.current.innerHTML = `${index + 1} / ${images.length}`;
    if (navRef.current) {
      const currentThumb = navRef.current.children[index + 1];
      if (currentThumb instanceof HTMLImageElement) {
        const offset =
          -1 *
          (currentThumb.offsetLeft - document.documentElement.clientWidth / 2);
        navRef.current.style.left = `${offset}px`;

        const previouslySelected = navRef.current.getElementsByClassName(
          CLASSNAME_NAVSELECTED
        )?.[0];
        if (previouslySelected)
          previouslySelected.className = CLASSNAME_NAVIMAGE;

        currentThumb.className = `${CLASSNAME_NAVIMAGE} ${CLASSNAME_NAVSELECTED}`;
      }
    }

    oldIndex.current = index;
  }, [index, images.length, lightboxSettings?.resetZoomOnNav]);

  useEffect(() => {
    if (displayMode !== oldDisplayMode.current) {
      // reset zoom status
      // setResetZoom((r) => !r);
      // setZoomed(false);
      if (lightboxSettings?.resetZoomOnNav) {
        setZoom(1);
      }
      setResetPosition((r) => !r);
    }
    oldDisplayMode.current = displayMode;
  }, [displayMode, lightboxSettings?.resetZoomOnNav]);

  const selectIndex = (e: React.MouseEvent, i: number) => {
    setIndex(i);
    e.stopPropagation();
  };

  useEffect(() => {
    if (isVisible) {
      if (index === null) setIndex(initialIndex);
      document.body.style.overflow = "hidden";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Mousetrap as any).pause();
    }
  }, [initialIndex, isVisible, setIndex, index]);

  const toggleSlideshow = useCallback(() => {
    if (slideshowInterval) {
      setSlideshowInterval(null);
    } else {
      setSlideshowInterval(slideshowDelay);
    }
  }, [slideshowInterval, slideshowDelay]);

  // stop slideshow when the page is hidden
  usePageVisibility((hidden: boolean) => {
    if (hidden) {
      setSlideshowInterval(null);
    }
  });

  const close = useCallback(() => {
    if (!isFullscreen) {
      hide();
      document.body.style.overflow = "auto";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Mousetrap as any).unpause();
    } else document.exitFullscreen();
  }, [isFullscreen, hide]);

  const handleClose = (e: React.MouseEvent<HTMLDivElement>) => {
    const { className } = e.target as Element;
    if (className && className.includes && className.includes(CLASSNAME_IMAGE))
      close();
  };

  const handleLeft = useCallback(
    (isUserAction = true) => {
      if (isSwitchingPage || index === -1) return;

      setMovingLeft(true);

      if (index === 0) {
        // go to next page, or loop back if no callback is set
        if (pageCallback) {
          pageCallback(-1);
          setIndex(-1);
          setIsSwitchingPage(true);
        } else setIndex(images.length - 1);
      } else setIndex((index ?? 0) - 1);

      if (isUserAction && resetIntervalCallback.current) {
        resetIntervalCallback.current();
      }
    },
    [images, pageCallback, isSwitchingPage, resetIntervalCallback, index]
  );

  const handleRight = useCallback(
    (isUserAction = true) => {
      if (isSwitchingPage) return;

      setMovingLeft(false);

      if (index === images.length - 1) {
        // go to preview page, or loop back if no callback is set
        if (pageCallback) {
          pageCallback(1);
          setIsSwitchingPage(true);
          setIndex(0);
        } else setIndex(0);
      } else setIndex((index ?? 0) + 1);

      if (isUserAction && resetIntervalCallback.current) {
        resetIntervalCallback.current();
      }
    },
    [
      images,
      setIndex,
      pageCallback,
      isSwitchingPage,
      resetIntervalCallback,
      index,
    ]
  );

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.repeat && (e.key === "ArrowRight" || e.key === "ArrowLeft"))
        setInstant();
      if (e.key === "ArrowLeft") handleLeft();
      else if (e.key === "ArrowRight") handleRight();
      else if (e.key === "Escape") close();
    },
    [setInstant, handleLeft, handleRight, close]
  );
  const handleFullScreenChange = () => {
    if (clearIntervalCallback.current) {
      clearIntervalCallback.current();
    }
    setFullscreen(document.fullscreenElement !== null);
  };

  const [clearCallback, resetCallback] = useInterval(
    () => {
      handleRight(false);
    },
    slideshowEnabled ? slideshowInterval : null
  );

  resetIntervalCallback.current = resetCallback;
  clearIntervalCallback.current = clearCallback;

  useEffect(() => {
    if (isVisible) {
      document.addEventListener("keydown", handleKey);
      document.addEventListener("fullscreenchange", handleFullScreenChange);
    }
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("fullscreenchange", handleFullScreenChange);
    };
  }, [isVisible, handleKey]);

  const toggleFullscreen = useCallback(() => {
    if (!isFullscreen) containerRef.current?.requestFullscreen();
    else document.exitFullscreen();
  }, [isFullscreen]);

  const navItems = images.map((image, i) => (
    <img
      src={image.paths.thumbnail ?? ""}
      alt=""
      className={cx(CLASSNAME_NAVIMAGE, {
        [CLASSNAME_NAVSELECTED]: i === index,
      })}
      onClick={(e: React.MouseEvent) => selectIndex(e, i)}
      role="presentation"
      loading="lazy"
      key={image.paths.thumbnail}
    />
  ));

  const onDelayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let numberValue = Number.parseInt(e.currentTarget.value, 10);
    setDisplayedSlideshowInterval(e.currentTarget.value);

    // Without this exception, the blocking of updates for invalid values is even weirder
    if (e.currentTarget.value === "-" || e.currentTarget.value === "") {
      return;
    }

    numberValue =
      numberValue >= MIN_VALID_INTERVAL_SECONDS
        ? numberValue
        : MIN_VALID_INTERVAL_SECONDS;

    setSlideshowDelay(numberValue);

    if (slideshowInterval !== null) {
      setSlideshowInterval(numberValue * SECONDS_TO_MS);
    }
  };

  const currentIndex = index === null ? initialIndex : index;

  // #2451: making OptionsForm an inline component means it
  // get re-rendered each time. This makes the text
  // field lose focus on input. Use function instead.
  function renderOptionsForm() {
    return (
      <>
        {slideshowEnabled ? (
          <Form.Group controlId="delay" as={Row} className="form-container">
            <Col xs={4}>
              <Form.Label className="col-form-label">
                <FormattedMessage id="dialogs.lightbox.delay" />
              </Form.Label>
            </Col>
            <Col xs={8}>
              <Form.Control
                type="number"
                className="text-input"
                min={1}
                value={displayedSlideshowInterval ?? 0}
                onChange={onDelayChange}
                size="sm"
              />
            </Col>
          </Form.Group>
        ) : undefined}

        <Form.Group controlId="displayMode" as={Row}>
          <Col xs={4}>
            <Form.Label className="col-form-label">
              <FormattedMessage id="dialogs.lightbox.display_mode.label" />
            </Form.Label>
          </Col>
          <Col xs={8}>
            <Form.Control
              as="select"
              onChange={(e) =>
                setDisplayMode(e.target.value as GQL.ImageLightboxDisplayMode)
              }
              value={displayMode}
              className="btn-secondary mx-1 mb-1"
            >
              {Array.from(imageLightboxDisplayModeIntlMap.entries()).map(
                (v) => (
                  <option key={v[0]} value={v[0]}>
                    {intl.formatMessage({
                      id: v[1],
                    })}
                  </option>
                )
              )}
            </Form.Control>
          </Col>
        </Form.Group>
        <Form.Group>
          <Form.Group controlId="scaleUp" as={Row} className="mb-1">
            <Col>
              <Form.Check
                type="checkbox"
                label={intl.formatMessage({
                  id: "dialogs.lightbox.scale_up.label",
                })}
                checked={lightboxSettings?.scaleUp ?? false}
                disabled={displayMode === GQL.ImageLightboxDisplayMode.Original}
                onChange={(v) => setScaleUp(v.currentTarget.checked)}
              />
            </Col>
          </Form.Group>
          <Form.Text className="text-muted">
            {intl.formatMessage({
              id: "dialogs.lightbox.scale_up.description",
            })}
          </Form.Text>
        </Form.Group>
        <Form.Group>
          <Form.Group controlId="resetZoomOnNav" as={Row} className="mb-1">
            <Col>
              <Form.Check
                type="checkbox"
                label={intl.formatMessage({
                  id: "dialogs.lightbox.reset_zoom_on_nav",
                })}
                checked={lightboxSettings?.resetZoomOnNav ?? false}
                onChange={(v) => setResetZoomOnNav(v.currentTarget.checked)}
              />
            </Col>
          </Form.Group>
        </Form.Group>
        <Form.Group controlId="scrollMode">
          <Form.Group as={Row} className="mb-1">
            <Col xs={4}>
              <Form.Label className="col-form-label">
                <FormattedMessage id="dialogs.lightbox.scroll_mode.label" />
              </Form.Label>
            </Col>
            <Col xs={8}>
              <Form.Control
                as="select"
                onChange={(e) =>
                  setScrollMode(e.target.value as GQL.ImageLightboxScrollMode)
                }
                value={
                  lightboxSettings?.scrollMode ??
                  GQL.ImageLightboxScrollMode.Zoom
                }
                className="btn-secondary mx-1 mb-1"
              >
                <option
                  value={GQL.ImageLightboxScrollMode.Zoom}
                  key={GQL.ImageLightboxScrollMode.Zoom}
                >
                  {intl.formatMessage({
                    id: "dialogs.lightbox.scroll_mode.zoom",
                  })}
                </option>
                <option
                  value={GQL.ImageLightboxScrollMode.PanY}
                  key={GQL.ImageLightboxScrollMode.PanY}
                >
                  {intl.formatMessage({
                    id: "dialogs.lightbox.scroll_mode.pan_y",
                  })}
                </option>
              </Form.Control>
            </Col>
          </Form.Group>
          <Form.Text className="text-muted">
            {intl.formatMessage({
              id: "dialogs.lightbox.scroll_mode.description",
            })}
          </Form.Text>
        </Form.Group>
      </>
    );
  }

  if (!isVisible) {
    return <></>;
  }

  if (images.length === 0 || isLoading || isSwitchingPage) {
    return <LoadingIndicator />;
  }

  const currentImage: ILightboxImage | undefined = images[currentIndex];

  function setRating(v: number | null) {
    if (currentImage?.id) {
      updateImage({
        variables: {
          input: {
            id: currentImage.id,
            rating100: v,
          },
        },
      });
    }
  }

  async function onIncrementClick() {
    if (currentImage?.id === undefined) return;
    try {
      await mutateImageIncrementO(currentImage.id);
    } catch (e) {
      Toast.error(e);
    }
  }

  async function onDecrementClick() {
    if (currentImage?.id === undefined) return;
    try {
      await mutateImageDecrementO(currentImage.id);
    } catch (e) {
      Toast.error(e);
    }
  }

  async function onResetClick() {
    if (currentImage?.id === undefined) return;
    try {
      await mutateImageResetO(currentImage?.id);
    } catch (e) {
      Toast.error(e);
    }
  }

  return (
    <div
      className={CLASSNAME}
      role="presentation"
      ref={containerRef}
      onClick={handleClose}
    >
      <div className={CLASSNAME_HEADER}>
        <div className={CLASSNAME_LEFT_SPACER} />
        <div className={CLASSNAME_INDICATOR}>
          <span>{pageHeader}</span>
          {images.length > 1 ? (
            <b ref={indicatorRef}>{`${currentIndex + 1} / ${images.length}`}</b>
          ) : undefined}
        </div>
        <div className={CLASSNAME_RIGHT}>
          <div className={CLASSNAME_OPTIONS}>
            <div className={CLASSNAME_OPTIONS_ICON}>
              <Button
                ref={overlayTarget}
                variant="link"
                title={intl.formatMessage({
                  id: "dialogs.lightbox.options",
                })}
                onClick={() => setShowOptions(!showOptions)}
              >
                <Icon icon={faCog} />
              </Button>
              <Overlay
                target={overlayTarget.current}
                show={showOptions}
                placement="bottom"
                container={containerRef}
                rootClose
                onHide={() => setShowOptions(false)}
              >
                {({ placement, arrowProps, show: _show, ...props }) => (
                  <div
                    className="popover"
                    {...props}
                    style={{ ...props.style }}
                  >
                    <Popover.Title>
                      {intl.formatMessage({
                        id: "dialogs.lightbox.options",
                      })}
                    </Popover.Title>
                    <Popover.Content>{renderOptionsForm()}</Popover.Content>
                  </div>
                )}
              </Overlay>
            </div>
            <InputGroup className={CLASSNAME_OPTIONS_INLINE}>
              {renderOptionsForm()}
            </InputGroup>
          </div>
          {slideshowEnabled && (
            <Button
              variant="link"
              onClick={toggleSlideshow}
              title="Toggle Slideshow"
            >
              <Icon icon={slideshowInterval !== null ? faPause : faPlay} />
            </Button>
          )}
          {zoom !== 1 && (
            <Button
              variant="link"
              onClick={() => {
                setResetPosition(!resetPosition);
                setZoom(1);
              }}
              title="Reset zoom"
            >
              <Icon icon={faSearchMinus} />
            </Button>
          )}
          {document.fullscreenEnabled && (
            <Button
              variant="link"
              onClick={toggleFullscreen}
              title="Toggle Fullscreen"
            >
              <Icon icon={faExpand} />
            </Button>
          )}
          <Button variant="link" onClick={() => close()} title="Close Lightbox">
            <Icon icon={faTimes} />
          </Button>
        </div>
      </div>
      <div className={CLASSNAME_DISPLAY}>
        {allowNavigation && (
          <Button
            variant="link"
            onClick={handleLeft}
            className={`${CLASSNAME_NAVBUTTON} d-none d-lg-block`}
          >
            <Icon icon={faChevronLeft} />
          </Button>
        )}

        <div
          className={cx(CLASSNAME_CAROUSEL, {
            [CLASSNAME_INSTANT]: instantTransition,
          })}
          style={{ left: `${currentIndex * -100}vw` }}
          ref={carouselRef}
        >
          {images.map((image, i) => (
            <div className={`${CLASSNAME_IMAGE}`} key={image.paths.image}>
              {i >= currentIndex - 1 && i <= currentIndex + 1 ? (
                <LightboxImage
                  src={image.paths.image ?? ""}
                  displayMode={displayMode}
                  scaleUp={lightboxSettings?.scaleUp ?? false}
                  scrollMode={
                    lightboxSettings?.scrollMode ??
                    GQL.ImageLightboxScrollMode.Zoom
                  }
                  onLeft={handleLeft}
                  onRight={handleRight}
                  alignBottom={movingLeft}
                  zoom={i === currentIndex ? zoom : 1}
                  current={i === currentIndex}
                  scrollAttemptsBeforeChange={scrollAttemptsBeforeChange}
                  setZoom={(v) => setZoom(v)}
                  resetPosition={resetPosition}
                />
              ) : undefined}
            </div>
          ))}
        </div>

        {allowNavigation && (
          <Button
            variant="link"
            onClick={handleRight}
            className={`${CLASSNAME_NAVBUTTON} d-none d-lg-block`}
          >
            <Icon icon={faChevronRight} />
          </Button>
        )}
      </div>
      {showNavigation && !isFullscreen && images.length > 1 && (
        <div className={CLASSNAME_NAV} ref={navRef}>
          <Button
            variant="link"
            onClick={() => setIndex(images.length - 1)}
            className={CLASSNAME_NAVBUTTON}
          >
            <Icon icon={faArrowLeft} className="mr-4" />
          </Button>
          {navItems}
          <Button
            variant="link"
            onClick={() => setIndex(0)}
            className={CLASSNAME_NAVBUTTON}
          >
            <Icon icon={faArrowRight} className="ml-4" />
          </Button>
        </div>
      )}
      <div className={CLASSNAME_FOOTER}>
        <div className={CLASSNAME_FOOTER_LEFT}>
          {currentImage?.id !== undefined && (
            <>
              <div>
                <OCounterButton
                  onDecrement={onDecrementClick}
                  onIncrement={onIncrementClick}
                  onReset={onResetClick}
                  value={currentImage?.o_counter ?? 0}
                />
              </div>
              <RatingSystem
                value={currentImage?.rating100 ?? undefined}
                onSetRating={(v) => {
                  setRating(v ?? null);
                }}
              />
            </>
          )}
        </div>
        <div>
          {currentImage?.title && (
            <Link to={`/images/${currentImage.id}`} onClick={() => close()}>
              {currentImage.title ?? ""}
            </Link>
          )}
        </div>
        <div></div>
      </div>
    </div>
  );
};

export default LightboxComponent;
