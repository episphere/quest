import { transform } from "./replace2.js";
import { questionQueue, moduleParams } from "./questionnaire.js";
import { Tree } from "./tree.js";

console.log("in quest.js");
let prevRes = {};

//  let script = document.createElement("script");
//  script.src = q;
//  document.getElementsByTagName("body")[0].appendChild(script);

async function startUp() {
  if (location.hash.startsWith("#config=")) {
    let q = location.hash.replace(/#/, "").split("=")[1];
    // create a script tag and add it to the DOM...
    // NOTE: it will not be run now.  Wait until window.onLoad...

    let txt = await (await fetch(q)).text();
    eval(txt);
    console.log(config);
    moduleParams.config = config;
  }
  config = moduleParams.config;
  var ta = document.getElementById("ta");
  ta.onkeyup = (ev) => {
    transform.tout(() => {
      transform.render(
        {
          text: ta.value,
        },
        "rendering",
        prevRes
      ); // <-- this is where quest.js is engaged
      // transform.render({url: 'https://jonasalmeida.github.io/privatequest/demo2.txt&run'}, 'rendering') // <-- this is where quest.js is engaged
      if (document.querySelector(".question") != null) {
        document.querySelector(".question").classList.add("active");
      }
    });
  };

  ta.innerHTML = "// type, paste, or upload questionnair/e markup\n\n";
  var q = (location.search + location.hash).replace(/[\#\?]/g, "");
  if (q.length > 3) {
    if (!q.startsWith("config")) {
      ta.value = await (await fetch(q.split("&")[0])).text(); // getting the first of markup&css
    } else {
      moduleParams.config = config;
      ta.value = await (await fetch(config.markdown)).text();
    }
    ta.onkeyup();
  }
  ta.style.width = parseInt(ta.parentElement.style.width.slice(0, -1)) - 5 + "%";

  document.getElementById("increaseSizeButton").onclick = increaseSize;
  document.getElementById("decreaseSizeButton").onclick = decreaseSize;
  document.getElementById("clearMem").onclick = clearLocalForage;
  myTree = questionQueue;
}

function increaseSize() {
  let ta = document.getElementById("ta");
  let style = window.getComputedStyle(ta, null).getPropertyValue("font-size");
  let fontSize = parseFloat(style);
  ta.style.fontSize = fontSize + 1 + "px";
}

function decreaseSize() {
  let ta = document.getElementById("ta");
  let style = window.getComputedStyle(ta, null).getPropertyValue("font-size");
  let fontSize = parseFloat(style);
  ta.style.fontSize = fontSize - 1 + "px";
}

function clearLocalForage() {
  localforage
    .clear()
    .then(() => {
      loaddisplay.innerHTML = "local forage cleared";
      console.log("lf cleared");
    })
    .catch((err) => {
      loaddisplay.innerHTML = "caught error" + err;
      console.log("error while clearing lf.  ", err);
    });

  console.log("clearing the in-memory tree");
  questionQueue.clear();
}

// document.addEventListener("readystatechange", (event) => {
//   if (event.target.readystate == "complete") {
//     console.log("in quest.js:readystatechangelistener");
//     startUp();
//   }
// });
window.onload = function () {
  console.log("in quest.js:window.onload");
  startUp();
};
