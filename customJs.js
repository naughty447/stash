const VLC_IP = "192.168.29.24";
const CURRENT_PORT = window.location.port;

function playThisOnVlc() {
  const sceneId =
    window.location.pathname.split("/")[
      window.location.pathname.split("/").length - 1
    ];
  const streamPath = `http://${VLC_IP}:${CURRENT_PORT}/scene/${sceneId}/stream`;
  fetch(`http://${VLC_IP}:4001/join?input=${streamPath}&command=in_play`, {
    headers: {
      Authorization: "Basic " + btoa(":1234"),
    },
  })
    .then(console.log)
    .catch(console.error);
}

function createPlayOnVlcButton() {
  const playOnVlc = document.createElement("div");
  playOnVlc.innerText = "VLC";
  playOnVlc.style.border = "2px solid #48aff0";
  playOnVlc.style.padding = "2px";
  playOnVlc.style.width = "fit-content";
  playOnVlc.style.borderRadius = "5px";
  playOnVlc.onclick = playThisOnVlc;
  return playOnVlc;
}

function start() {
  if (window.location.pathname.startsWith("/scenes")) {
    const appendTo = document.querySelector(
      "#root > div.main.container-fluid > div > div.scene-tabs div.o-counter"
    ).parentElement;

    appendTo.append(createPlayOnVlcButton());
  }
}

window.onload = function () {
  let workDone = false;
  let work = undefined;
  let currentPathName = window.location.pathname;
  setInterval(() => {
    if (currentPathName !== window.location.pathname) {
      currentPathName = window.location.pathname;
      workDone = false;
    }
    if (!workDone) {
      start();
      workDone = true;
    }
  }, 1000);
};
