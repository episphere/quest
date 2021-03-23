import { transform } from "./replace2.js";
import { questionQueue, moduleParams } from "./questionnaire.js";

let prevRes = {};
let final_obj = {};
async function startUp() {
  var ta = document.getElementById("ta");
  ta.onkeyup = (ev) => {
    let temp = ta.value;

    let regEx = new RegExp(
      "\\[([A-Z_][A-Z0-9_#]*[\\?\\!]?)(?:\\|([^,\\|\\]]+)\\|)?(,.*?)?\\](.*?)(?=$|\\[[_A-Z]|<form)",
      "g"
    );
  
    console.log(temp);
    temp = temp.replace(regEx, function (
      page,
      questID,
      questOpts,
      questArgs,
      questText
    ) {
  
  
      console.log(page);
      console.log(questID);
      console.log(questOpts);
      console.log(questArgs);
      console.log(questText);
      console.log(final_obj);
      if (!final_obj[questID]) {
        final_obj[questID] = {}
        final_obj[questID]['page'] = page;
        final_obj[questID]['questOpts'] = questOpts;
        final_obj[questID]['questArgs'] = questArgs;
        final_obj[questID]['questText'] = questText;
      }
      console.log(final_obj);
    });
    console.log(ta.value);

    transform.tout((previousResults) => {
      // let temp = ta.value;

      // let regEx = new RegExp(
      //   "\\[([A-Z_][A-Z0-9_#]*[\\?\\!]?)(?:\\|([^,\\|\\]]+)\\|)?(,.*?)?\\](.*?)(?=$|\\[[_A-Z]|<form)",
      //   "g"
      // );
    
      // console.log(temp);
      // temp = temp.replace(regEx, function (
      //   page,
      //   questID,
      //   questOpts,
      //   questArgs,
      //   questText
      // ) {
    
    
      //   console.log(page);
      //   console.log(questID);
      //   console.log(questOpts);
      //   console.log(questArgs);
      //   console.log(questText);
      //   console.log(final_obj);
      //   if (!final_obj[questID]) {
      //     final_obj[questID] = {}
      //     final_obj[questID]['page'] = page;
      //     final_obj[questID]['questOpts'] = questOpts;
      //     final_obj[questID]['questArgs'] = questArgs;
      //     final_obj[questID]['questText'] = questText;
      //   }
      //   console.log(final_obj)
      // });
      transform.render(
        {
          text: ta.value,
        },
        "rendering",
        previousResults
      ); // <-- this is where quest.js is engaged
      // transform.render({url: 'https://jonasalmeida.github.io/privatequest/demo2.txt&run'}, 'rendering') // <-- this is where quest.js is engaged
      if (document.querySelector(".question") != null) {
        document.querySelector(".question").classList.add("active");
      }
    });
  };

  ta.innerHTML = "// type, paste, or upload questionnaire markup\n\n";
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
  ta.style.width =
    parseInt(ta.parentElement.style.width.slice(0, -1)) - 5 + "%";

  document.getElementById("increaseSizeButton").onclick = increaseSize;
  document.getElementById("decreaseSizeButton").onclick = decreaseSize;
  document.getElementById("clearMem").onclick = clearLocalForage;

  document.getElementById("updater").onclick = function (event) {
    let txt = "";
    try {
      prevRes = JSON.parse(json_input.value);
      txt = "added json... ";
    } catch (err) {
      txt = "caught error: " + err;
    }
    loaddisplay.innerText = txt;
  };
  let myTree = questionQueue;
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
    })
    .catch((err) => {
      loaddisplay.innerHTML = "caught error" + err;
      console.log("error while clearing lf.  ", err);
    });

  questionQueue.clear();

  prevRes ={};
}

transform.tout = function (fun, tt = 500) {
  if (transform.tout.t) {
    clearTimeout(transform.tout.t);
  }
  transform.tout.t = setTimeout(fun(prevRes), tt);
};

window.onload = function () {
  startUp();
};
