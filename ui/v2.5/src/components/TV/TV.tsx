import React, { useEffect, useState } from "react";
import { Route, Switch } from "react-router-dom";
import { useIntl } from "react-intl";
import { Helmet } from "react-helmet";
import { TITLE_SUFFIX } from "src/components/Shared";
import { PersistanceLevel, useScenesList } from "src/hooks/ListHook";
import {
  useFindScene,
  useFindSceneMarkers,
  useFindScenes,
} from "src/core/StashService";
import { ListFilterModel } from "src/models/list-filter/filter";
import {
  FilterMode,
  FindScenesQueryResult,
  Scene,
  SceneMarker,
  useFindScenesQuery,
} from "src/core/generated-graphql";
import { ListFilter } from "../List/ListFilter";
import { ListFilterOptions } from "src/models/list-filter/filter-options";
import { Button, ButtonToolbar } from "react-bootstrap";
import { ScenePlayer } from "../ScenePlayer";
import { TaggerContext } from "../Tagger/context";

let VLC = false;
let onlyScenes = false;
const VLC_IP = "192.168.0.243";

interface ITv {
  filterHook?: (filter: ListFilterModel) => ListFilterModel;
}

function shuffle(array: Clip[]) {
  let currentIndex = array.length,
    randomIndex;
  // While there remain elements to shuffle.
  while (currentIndex != 0) {
    // Pick a remaining element.
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    // if (array[currentIndex].id === array[randomIndex].id) {
    //   currentIndex++;
    //   continue;
    // }
    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }
  return array;
}

const filterOptions = new ListFilterOptions("name", [], [], []);
function xmur3(str: string) {
  for (var i = 0, h = 1779033703 ^ str.length; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function sfc32(a, b, c, d) {
  return function () {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    var t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
function mulberry32(a) {
  return function () {
    var t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randomSeed = Math.floor(Math.random() * 10000);
const seed = xmur3("" + randomSeed);
function random(min: number, max: number): number {
  const end = Math.floor(mulberry32(seed())() * (max - min + 1) + min);
  const start = Math.floor(
    sfc32(seed(), seed(), seed(), seed())() * (max - min + 1) + min
  );
  return (start + end) / 2;
}
const dummyFilter = new ListFilterModel(FilterMode.SceneMarkers);
dummyFilter.searchTerm = "";
dummyFilter.itemsPerPage = 1000;

let FILTER: ListFilterModel = dummyFilter;

const Tv: React.FC<ITv> = () => {
  const intl = useIntl();

  const title_template = `${intl.formatMessage({
    id: "tv",
  })} ${TITLE_SUFFIX}`;

  const [filter, setFilter] = useState<ListFilterModel>(dummyFilter);
  const [showPlayer, setShowPlayer] = useState(false);
  const [runningFilter, setRunningFilter] = useState<string>(
    filter.searchTerm + ""
  );

  const onFilterUpdate = (newFilter: ListFilterModel) => {
    setFilter(newFilter);
  };

  const onPlay = () => {
    setRunningFilter(filter.searchTerm + "");
    setShowPlayer(true);
  };

  function renderContent(
    result: FindScenesQueryResult,
    filter: ListFilterModel,
    selectedIds: Set<string>
  ) {
    return <>{showPlayer && <MarkerPlayer searchTerm={runningFilter} />}</>;
  }
  const listData = useScenesList({
    zoomable: true,
    selectable: true,
    renderContent,
    filterHook: (filter: ListFilterModel) => {
      FILTER.criteria = filter.criteria;
      FILTER.searchTerm = filter.searchTerm;
      FILTER.itemsPerPage = 1000;
      return filter;
    },
  });

  return (
    <>
      <Helmet
        defaultTitle={title_template}
        titleTemplate={`%s | ${title_template}`}
      />
      <Button style={{ float: "right" }} onClick={onPlay}>
        Play
      </Button>
      <ButtonToolbar className="align-items-center justify-content-center mb-2">
        <TaggerContext>{listData.template}</TaggerContext>
      </ButtonToolbar>
      <Button style={{ float: "right", marginLeft:10 }} onClick={()=>{onlyScenes=false;}}>only markers</Button>
      <Button style={{ float: "right", marginLeft:10 }} onClick={()=>{onlyScenes=true;}}>only scenes</Button>
      <Button style={{ float: "right", marginLeft:10 }} onClick={()=>{VLC=!VLC;setShowPlayer(!showPlayer)}}>{VLC?"disable":"enable"} VLC</Button>
    </>
  );
};

interface IMarkerPlayer {
  searchTerm: string;
}

interface Clip {
  id: string;
  timestamp: number;
}

const MarkerPlayer: React.FC<IMarkerPlayer> = ({ searchTerm }) => {
  const [markers, setMarkers] = useState<Clip[]>([]);
  const [index, setIndex] = useState<number>(0);
  const [sceneId, setSceneId] = useState<string>("");
  const [timestamp, setTimestamp] = useState<number>(0);
  const [search, setSearch] = useState<string>("");

  const getMarkers = (): Clip[] | undefined => {
    const data = useFindSceneMarkers(FILTER).data?.findSceneMarkers
      .scene_markers;
    if (data) {
      return data.map((e) => ({ id: e.scene.id, timestamp: e.seconds }));
    } else {
      return undefined;
    }
  };

  const getScenes = (): Clip[] | undefined => {
    const data = useFindScenes(FILTER).data?.findScenes.scenes;
    if (data) {
      return data.map((e) => ({
        id: e.id,
        timestamp: random(120, (e.file.duration ? e.file.duration : 240) - 240),
        duration: e.file.duration,
      }));
    } else {
      return undefined;
    }
  };
  const ms = onlyScenes?[]:getMarkers();
  const ss = onlyScenes?getScenes():[];

  let _markers = shuffle(ms && ss ? [...ms, ...ss] : []);

  useEffect(() => {
    if (
      (searchTerm !== search || markers.length == 0) &&
      ms !== undefined &&
      ss !== undefined
    ) {
      console.log("playing from ", _markers.length);
      if (_markers.length == 0) {
        _markers = [{ id: "1", timestamp: 1 }];
      }
      setMarkers(_markers);
      setSearch(searchTerm + "");
      setIndex(0);
    }
  });
  useEffect(() => {
    onQueueRandom();
  }, [markers]);

  const onQueueRandom = () => {
    if (index >= markers.length) return;
    if (index + 1 == markers.length && markers.length>1) {
      setMarkers(
        shuffle([...markers]).map((e) => ({
          id: e.id,
          timestamp: random(120, (e.duration ? e.duration : 240) - 240),
          duration: e.duration,
        }))
      );
    }
    const num = (index + 1) % markers.length;
    setIndex(num);
    setTimestamp(markers[num].timestamp);
    setSceneId(markers[num].id);
  };

  return (
    <div className="hehe">
      {sceneId !== "" && (
        <Player
          id={sceneId}
          timestamp={timestamp}
          onQueueRandom={onQueueRandom}
        />
      )}
    </div>
  );
};

interface IPlayer {
  id: string;
  timestamp: number;
  onQueueRandom: () => void;
}
const Player: React.FC<IPlayer> = ({ id, timestamp, onQueueRandom }) => {
  console.log(id, timestamp);

  const { data, loading, refetch } = useFindScene(id ?? "");
  const scene = data?.findScene;
  if (scene && VLC)
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
  useEffect(() => {
    if (document.getElementById("vjs-next-btn")) {
      document.getElementById("vjs-next-btn").ontouchend = () => {
        // console.log("next");
        onQueueRandom();
      };
    }
  });
  return (
    <>
      <div style={{ display: "flex", justifyContent: "end" }}>
        <a href={`/scenes/${id}`}>Go to Scene</a>
        <Button id="playNext" onClick={onQueueRandom}>
          Next
        </Button>
      </div>
      {scene && !loading && !VLC && (
        <ScenePlayer
          key="ScenePlayer"
          className="w-100 m-sm-auto no-gutter"
          scene={scene}
          timestamp={timestamp}
          autoplay={false}
          onNext={onQueueRandom}
          onPrevious={onQueueRandom}
        />
      )}
    </>
  );
};
export default Tv;
