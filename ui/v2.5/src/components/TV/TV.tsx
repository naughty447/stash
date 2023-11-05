import React, { useEffect, useLayoutEffect, useState } from "react";
import { ListFilterModel } from "src/models/list-filter/filter";
import { Button, ButtonGroup, Form, ToggleButton } from "react-bootstrap";
import * as GQL from "src/core/generated-graphql";
import { useFindScene, useFindScenes } from "src/core/StashService";
import ScenePlayer from "../ScenePlayer/ScenePlayer";
import { SceneItemList } from "../Scenes/SceneList";
import { SceneMarkerItemList } from "../Scenes/SceneMarkerList";

localStorage.setItem("VLC", "false");

interface ITv {
  filterHook?: (filter: ListFilterModel) => ListFilterModel;
}
interface IPlayer {
  sceneId: string;
  onNext: () => void;
  onPrev: () => void;
  initialTimestamp?: number;
  isMarker: boolean;
}
interface IRandomScenePlayer {
  scenesData: GQL.FindScenesQuery;
}
interface IRandomMarkerPlayer {
  markersData: GQL.FindSceneMarkersQuery;
}

const radios = [
  { name: " Scene", value: "Scene" },
  { name: " Marker", value: "Marker" },
];

const Tv: React.FC<ITv> = ({ filterHook }) => {
  const [showPlayer, setShowPlayer] = useState(false);
  const [tvType, setTvType] = useState(radios[0].value);
  const onPlay = () => {
    setShowPlayer(true);
  };

  function renderScenesContent(
    result: GQL.FindScenesQueryResult,
    filter: ListFilterModel,
    selectedIds: Set<string>,
    onSelectChange: (id: string, selected: boolean, shiftKey: boolean) => void
  ) {
    if (!showPlayer || !result.data?.findScenes) return;

    return (
      <>
        <RandomScenePlayer scenesData={result.data} />
      </>
    );
  }

  function renderMarkersContent(
    result: GQL.FindSceneMarkersQueryResult,
    filter: ListFilterModel
  ) {
    if (!showPlayer || !result.data?.findSceneMarkers) return;
    console.log(result.data?.findSceneMarkers);

    return (
      <>
        <RandomMarkerPlayer markersData={result.data} />
      </>
    );
  }

  return (
    <>
      {tvType === radios[0].value ? (
        <SceneItemList
          filterHook={filterHook}
          renderContent={renderScenesContent}
        />
      ) : (
        <SceneMarkerItemList
          filterHook={filterHook}
          renderContent={renderMarkersContent}
        />
      )}

      <div style={{ float: "right", marginLeft: 10 }}>
        <Button style={{ float: "right" }} onClick={onPlay}>
          Play
        </Button>
        <ButtonGroup>
          {radios.map((radio, idx) => (
            <ToggleButton
              key={idx}
              id={`radio-${idx}`}
              type="radio"
              name="radio"
              value={radio.value}
              checked={tvType === radio.value}
              onChange={(e) => setTvType(e.currentTarget.value)}
            >
              {radio.name}
            </ToggleButton>
          ))}
        </ButtonGroup>
        <Form.Check // prettier-ignore
          type="switch"
          id="custom-switch"
          label="Play on VLC"
          onClick={() => {
            localStorage.setItem(
              "VLC",
              `${!(localStorage.getItem("VLC") === "true")}`
            );
          }}
        />
      </div>
    </>
  );
};

const RandomScenePlayer: React.FC<IRandomScenePlayer> = ({ scenesData }) => {
  const [index, setIndex] = useState(0);
  const scenes = scenesData.findScenes.scenes;

  const incrementIndex = () => {
    setIndex((index + 1) % scenesData.findScenes.count);
  };
  const decrementIndex = () => {
    setIndex(index - 1);
  };

  return (
    <>
      <Player
        sceneId={scenes[index].id}
        onNext={incrementIndex}
        onPrev={decrementIndex}
        isMarker={false}
      />
    </>
  );
};

const RandomMarkerPlayer: React.FC<IRandomMarkerPlayer> = ({ markersData }) => {
  const [index, setIndex] = useState(0);
  const markers = markersData.findSceneMarkers.scene_markers;

  const incrementIndex = () => {
    setIndex((index + 1) % markersData.findSceneMarkers.count);
  };
  const decrementIndex = () => {
    setIndex(index - 1);
  };

  return (
    <>
      <Player
        sceneId={markers[index].scene.id}
        onNext={incrementIndex}
        onPrev={decrementIndex}
        initialTimestamp={markers[index].seconds}
        isMarker={true}
      />
    </>
  );
};

const Player: React.FC<IPlayer> = ({
  sceneId,
  onNext,
  onPrev,
  initialTimestamp,
  isMarker,
}) => {
  const [scene, setScene] = useState(null);
  const [timestamp, setTimestamp] = useState(
    initialTimestamp ? initialTimestamp : 0
  );
  const { data, loading, error } = useFindScene(sceneId);

  useLayoutEffect(() => {
    if (!loading) {
      setScene(data?.findScene);

      if (!initialTimestamp) {
        if (data?.findScene?.files.length === 0) {
          return;
        }
        const duration = data?.findScene?.files[0].duration || 0;
        setTimestamp(Math.floor(Math.random() * duration));
      }
    }
  }, [loading, data]);
  if (scene && localStorage.getItem("VLC") === "true") {
    playOnVLC(scene, isMarker ? initialTimestamp : timestamp);
  }
  return (
    <>
      {scene && localStorage.getItem("VLC") !== "true" ? (
        <ScenePlayer
          key="ScenePlayer"
          hideScrubberOverride={true}
          scene={scene}
          initialTimestamp={isMarker ? initialTimestamp : timestamp}
          autoplay={true}
          permitLoop={true}
          sendSetTimestamp={(value) => {}}
          onNext={onNext}
          onPrevious={onPrev}
          onComplete={onNext}
        />
      ) : (
        <Button onClick={onNext}>NEXT</Button>
      )}
    </>
  );
};

function playOnVLC(scene: any, timestamp: number) {
  fetch(
    `http://${VLC_IP}:4001/join?input=${scene.paths.stream}&command=in_play`,
    {
      headers: {
        Authorization: "Basic " + btoa(":1234"),
      },
    }
  ).then((e) =>
    setTimeout(
      () =>
        fetch(
          `http://${VLC_IP}:4001/join?val=${Math.floor(
            timestamp
          )}&command=seek`,
          {
            headers: {
              Authorization: "Basic " + btoa(":1234"),
            },
          }
        ),
      1000
    )
  );
}

export default Tv;
