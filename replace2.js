import {
  questionQueue,
  moduleParams,
} from "./questionnaire.js";
import { restoreResults } from "./localforageDAO.js";
import { parseGrid, grid_replace_regex, toggle_grid } from "./buildGrid.js";
import { clearValidationError } from "./validate.js";
import { renderQuestion,addModals } from "./renderQuestion.js";
export let transform = function () {
  // init
};

let questName = "Questionnaire";

let paramSplit = (str) =>
  [...str.matchAll(/(\w+)=(\s?.+?)\s*(?=\w+=|$)/gm)].reduce((pv, cv) => {
    pv[cv[1]] = encodeURIComponent(cv[2]);
    return pv
  }, {})

let reduceObj = (obj) => {
  //replace options with split values (uri encoded)
  return Object.entries(obj).reduce((pv, cv) => {
    return pv += ` ${cv[0]}=${cv[1]}`
  }, "").trim()
}


async function setup(obj,divId,previousResults){
  moduleParams.renderObj = obj;
  moduleParams.previousResults = previousResults;
  moduleParams.soccer = obj.soccer;
  moduleParams.rootElement = divId
  let contents = "";

  // get contents
  if (obj.text) {
    contents = obj.text;
  } else if (obj.url){
    contents = await (await fetch(obj.url)).text();
  }

  // remove comments...
  let commentRegex = /\/\/.*$/gm
  contents = contents.replace(commentRegex,'')

  //get module name if it exists:
  let nameRegex=/{.*?"?name"?\s*:\s*"(.*?)".*?}/s
  let found = contents.match(nameRegex)
  moduleParams.questName=found?.[1]?found[1]:"questionnaire"
  moduleParams.localforage = await localforage.createInstance({
    name: "Quest",
    storeName: moduleParams.questName,
  });

  moduleParams.config = contents
  if (obj.activate) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "ActiveLogic.css";
    document.head.appendChild(link);
    const link2 = document.createElement("link");
    link2.rel = "stylesheet";
    link2.href = "Style1.css";
    document.head.appendChild(link2);
  }




  if (obj.treeJSON){
    questionQueue.loadFromJSON(obj.treeJSON)
  } else{
    let treeJSON = await localforage.getItem(`${moduleParams.questName}.treeJSON`)
    if (treeJSON) {
      questionQueue.loadFromVanillaObject(treeJSON)
    }else{
      questionQueue.clear();
    }
  }

  return contents;
}

async function fillForm(retrieve) {
  console.log("... in fillForm ...")
  let questObj = {};
  let tempObj = {};

  if (retrieve) {
    const response = await retrieve();
    if (response.code === 200) {
      const userData = response.data;
      console.log("retrieve module name===", moduleParams.questName);
      if (userData[moduleParams.questName]) {
        questObj = userData[moduleParams.questName];
        console.log("questObj===", questObj);
        await restoreResults(questObj);
      }
    }
  } else {
    // a retrieve function is not defined use
    // the default which pull the values out of
    // localforage...
    let results = await localforage.getItem(questName);

    if (results == null) results = {};
    await restoreResults(results);
  }
}

transform.render = async (obj, divId, previousResults = {}) => {
  let T0 = performance.now()

  let contents = await setup(obj,divId,previousResults)

  // unroll grids/loops
  let t0 = performance.now()
  contents = contents.replace(grid_replace_regex, parseGrid);
  contents = unrollLoops(contents);
  let t1 = performance.now()
  console.log(`time to handle grids/unroll loops: ${(t1-t0)} ms`)

  t0 = performance.now()
  let questionRegex = /(?:\<form|\[([A-Z|_][A-Za-z0-9_]*)([!?])?(.*?)\])(.*?)(?=\[[A-Z_]|$|\<form)/gs
  let questions = Array.from(contents.matchAll(questionRegex))
  t1 = performance.now()
  console.log(`time to parse: ${(t1-t0)} ms`)

  let questDiv=document.getElementById(divId);
  questDiv.innerText=""
  questDiv.removeEventListener("renderQuestion",renderQuestion)
  questDiv.addEventListener("renderQuestion",renderQuestion)

  // add all the question to the event queue...
  questions.forEach( (question,index,array) => {
    let qEvent = new CustomEvent("renderQuestion",{detail:{
      question:question,
      index:index,
      length:array.length}});
    //requestAnimationFrame(()=>questDiv.dispatchEvent(qEvent))
    setTimeout(()=>questDiv.dispatchEvent(qEvent),0 )
  })

  addModals(questDiv)


  //  needs to be added to the event queue to avoid be run before the questions finish
  //requestAnimationFrame(()=>fillForm(moduleParams.renderObj.retrieves))
  setTimeout(()=> fillForm(),0)

  let TF=performance.now()
  console.log(`time to completely render: ${(TF-T0)} ms`)

  $(".popover-dismiss").popover({
    trigger: "focus",
  });
};

function ordinal(a) {
  if (Number.isInteger(a)) {
    switch (a % 10) {
      case 1: return ((a % 100) == 11 ? `${a}th` : `${a}st`);
      case 2: return ((a % 100) == 12 ? `${a}th` : `${a}nd`);
      case 3: return ((a % 100) == 13 ? `${a}th` : `${a}rd`);
      default: return (`${a}th`)
    }
  }
  return ""

}
function unrollLoops(txt) {
  // all the questions in the loops...
  // each element in res is a loop in the questionnaire...
  let loopRegex = /<loop max=(\d+)\s*>(.*?)<\/loop>/gm;
  txt = txt.replace(/(?:\r\n|\r|\n)/g, "\xa9");
  let res = [...txt.matchAll(loopRegex)].map(function (x, indx) {
    return { cnt: x[1], txt: x[2], indx: indx + 1, orig: x[0] };
  });

  let idRegex = /\[([A-Z_][A-Z0-9_#]*)[?!]?(?:\|([^,\|\]]+)\|)?(,.*?)?\]/gm;
  let disIfRegex = /displayif=.*?\(([A-Z_][A-Z0-9_#]*),.*?\)/g;
  // we have an array of objects holding the text..
  // get all the ids...
  let cleanedText = res.map(function (x) {
    x.txt = x.txt.replace("firstquestion", `loopindx=${x.indx} firstquestion`);
    x.txt += "[_CONTINUE" + x.indx + ",displayif=setFalse(-1,#loop)]";
    x.txt = x.txt.replace(/->\s*_CONTINUE\b/g, "-> _CONTINUE" + x.indx);
    let ids = [...x.txt.matchAll(idRegex)].map((y) => ({
      label: y[0],
      id: y[1],
      indx: x.indx,
    }));
    let disIfIDs = [...x.txt.matchAll(disIfRegex)].map((disIfID) => ({
      label: disIfID[0],
      id: disIfID[1],
    }));
    disIfIDs = disIfIDs.map((x) => x.id);
    let newIds = ids.map((x) => x.id);

    // find all ids defined within the loop,
    // note: textboxes are an outlier that needs
    //       to be fixed.
    let idsInLoop = Array.from(x.txt.matchAll(/\|[\w\s=]*id=(\w+)|___\|\s*(\w+)|textbox:\s*(\w+)/g)).map(x => {
      return x[1] ? x[1] : (x[2] ? x[2] : x[3])
    })

    // goto from 1-> max for human consumption... need <=
    let loopText = "";
    for (var loopIndx = 1; loopIndx <= x.cnt; loopIndx++) {
      var currentText = x.txt;
      // replace all instances of the question ids with id_#
      ids.map(
        (id) =>
        (currentText = currentText.replace(
          new RegExp("\\b" + id.id + "\\b(?!\#)", "g"),
          `${id.id}_${loopIndx}_${loopIndx}`
        ))
      );
      //replace all idsInLoop in the loop with {$id_$loopIndx}
      idsInLoop.forEach(id => {
        currentText = currentText.replace(new RegExp(`\\b${id}\\b`, "g"), `${id}_${loopIndx}_${loopIndx}`);
      })

      currentText = currentText.replace(/\{##\}/g, `${ordinal(loopIndx)}`)
      // ids.map((id) => (currentText = currentText.replace(id.label, id.label.replace(id.id, id.id + "_" + loopIndx))));

      // disIfIDs = disIfIDs.filter((x) => newIds.includes(x));
      // disIfIDs.map((id) => (currentText = currentText.replace(new RegExp(id + "\\b", "g"), id + "_" + loopIndx)));

      // // replace all -> Id with -> Id_#
      // ids.map(
      //   (id) => (currentText = currentText.replace(new RegExp("->\\s*" + id.id + "\\b", "g"), "-> " + id.id + "_" + loopIndx))
      // );

      // // replace all |__(|__)|xxxx|  xxxx= id=questionid_xxx xor=questionid
      // // |__|id=lalala_3_txt xor=lalala_3|  |xor= lalala id=lalala_txt|
      // ids.map((id) => (currentText = currentText.replace(/(\|__(?:\|__)*\|[^|\s][^|]\b)(${id.id})(\b[^|]*\|)/g, `$1$2_${loopIndx}$3`)));

      ids.map(
        (id) => (currentText = currentText.replace(/#loop/g, "" + loopIndx))
      );

      // if (currentText.search(/->\s*_continue/g) >= 0) {
      //   ;
      //   if (loopIndx < x.cnt) {
      //     currentText = currentText.replace(/->\s*_continue\s*/g, "-> " + ids[0].id + "_" + (loopIndx + 1));
      //   } else {
      //     currentText = currentText.replace(
      //       /->\s*_continue\s*/g,
      //       "-> " + document.getElementById(ids.slice(-1)[0].id + "_" + loopIndx).nextElementSibling.id
      //     );
      //   }
      // }

      // replace  _\d_\d#prev with _{$loopIndex-1}
      // we do it twice to match a previous bug..
      currentText = currentText.replace(/_\d+_\d+#prev/g, `_${loopIndx - 1}_${loopIndx - 1}`)
      loopText = loopText + "\n" + currentText;
    }
    loopText +=
      "[_CONTINUE" + x.indx + "_DONE" + ",displayif=setFalse(-1,#loop)]";
    return loopText;
  });

  for (var loopIndx = 0; loopIndx < cleanedText.length; loopIndx++) {
    txt = txt.replace(res[loopIndx].orig, cleanedText[loopIndx]);
  }
  txt = txt.replace(/\xa9/g, "\n");
  return txt;
}

/*
// replace by button event listener
export function stopSubmit(event) {
  event.preventDefault();

  if (event.target.clickType == "BACK") {
    resetChildren(event.target.elements);
    event.target.value = undefined;
    let buttonClicked = event.target.getElementsByClassName("previous")[0];
    previousClicked(buttonClicked, moduleParams.renderObj.retrieve, moduleParams.renderObj.store, rootElement);
  } else if (event.target.clickType == "RESET ANSWER") {
    resetChildren(event.target.elements);
    event.target.value = undefined;
  } else if (event.target.clickType == "Submit Survey") {

    $("#submitModal").modal("toggle");

  } else {
    let buttonClicked = event.target.getElementsByClassName("next")[0];
    nextClick(buttonClicked, moduleParams.renderObj.retrieve, moduleParams.renderObj.store, rootElement);
  }
}
*/
/*
// replace with form.reset
function resetChildren(nodes) {
  if (nodes == null) {
    return;
  }

  for (let node of nodes) {
    if (node.type === "radio" || node.type === "checkbox") {
      node.checked = false;
    } else if (node.type === "text" || node.type === "time" || node.type === "date" || node.type === "month" || node.type === "number") {
      node.value = "";
      clearValidationError(node)
    }
  }
}
*/