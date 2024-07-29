import { transform } from "./replace2.js";
import { questionQueue, moduleParams } from "./questionnaire.js";


let prevRes = {};

// Make it easier to create a TH.
HTMLTableRowElement.prototype.insertHead = function(html){
  let cell = document.createElement("th")
  cell.innerHTML=html
  this.insertAdjacentElement("beforeend",cell)
  return cell
}

const questLF = await localforage.createInstance({
  name:"questParams",
  storeName:"params"
})

async function fetchModule(url){
  let response = await fetch(url)
  if (!response.ok){
    return `<h3>Problem retrieving questionnaire module <i>${url}</i>:</h3> HTTP response code: ${response.status}`
  }
  return await response.text()
}

async function startUp() {


  let searchParams = new URLSearchParams(location.search)
  if (location.hash.split('&').includes('run') || searchParams.has('run')) {
      document.getElementById('logic').checked=true;
      document.getElementById("styling").checked = styling
      document.getElementById('questNavbar').style.display = 'none';
      document.getElementById('markup').style.display = 'none';
      document.getElementById('renderText').style.display = 'none';
  } else {
    let logic = await questLF.getItem("logic") ?? false;
    let styling = await questLF.getItem("styling") ?? false
    document.getElementById("logic").checked = logic
    document.getElementById("styling").checked = styling
  }
  setStylingAndLogic()

  let cachedPreviousResults = await questLF.getItem("previousResults") ?? "";
  // prevRes is a ugh.. global variable
  // if there is key that is not in [run,style,url]
  searchParams.forEach( (value,key) =>{
    if (!["run","style","url"].includes(key)){
      prevRes[key] = value
    }
  } ) 
  if (Object.keys(prevRes).length==0){
    prevRes = cachedPreviousResults.length>0?JSON.parse(cachedPreviousResults):{}
  }
  document.getElementById("json_input").innerText=JSON.stringify(prevRes,null,3);

  var ta = document.getElementById("ta");
  ta.onkeyup = (ev) => {
    transform.tout((previousResults) => {
      transform.render(
        {
          text: ta.value,
          lang: document.getElementById("langSelect").value
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

  // handle the Search params with the URLSearchParam API instead of a string...
  let params = new URLSearchParams(location.search)
  if (params.has("config")) {
    moduleParams.config = config;
    ta.value = await fetchModule(confirm.markdown)
    //ta.value = await (await fetch(config.markdown)).text();
  }
  if (params.has("url")) {
    let url = params.get("url")
    console.log(url)
    //ta.value = await (await fetch(url)).text();
    ta.value = await fetchModule(url)
    ta.onkeyup()
  } else if (location.hash.length > 1) {
    console.log(location.hash.substring(1))
    ta.value = await fetchModule( location.hash.substring(1) ) 
    //ta.value = await (await fetch(location.hash.substring(1))).text();
    ta.onkeyup()
  }
  if(params.has("style")) {
    document.getElementById("logic").dataset.sheetOn=params.get("style")
  }

  if (params.has("run")){
    let parentElement = document.getElementById("rendering").parentElement
    parentElement.classList.remove("col-12","col-md-6")
    if (!params.has("style")){
      document.getElementById("pagestyle").setAttribute("href", "Style1.css")
    }
  }
  document.getElementById("increaseSizeButton").onclick = increaseSize;
  document.getElementById("decreaseSizeButton").onclick = decreaseSize;
  document.getElementById("clearMem").addEventListener("click",clearLocalForage)

  document.getElementById("updater").onclick = function (event) {
    let txt = "";
    try {
      prevRes = (json_input.value.length>0)?JSON.parse(json_input.value):{};
      questLF.setItem("previousResults",json_input.value);
      txt = "added json... ";
    } catch (err) {
      txt = "caught error: " + err;
    }
    loaddisplay.innerText = txt;
  };

  let myTree = questionQueue;

  document.querySelectorAll('#logic,#styling').forEach( (el) => {
    el.addEventListener("change",(event)=>{
      console.log(event.target.id,event.target.checked)
      questLF.setItem(event.target.id,event.target.checked)
      setStylingAndLogic()
    })
  })
  document.querySelector("#hide-markup").addEventListener("change",(event)=>{
    console.log(event.target.checked)
    document.getElementById("markup").style.display=(event.target.checked)?"none":"initial"
    document.getElementById("renderText").style.display=(event.target.checked)?"none":"initial"
  })
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

// needed for testing...
window.getLF = async function(){
  let responses = {}
  if (moduleParams.questName){
    responses = await localforage.getItem(moduleParams.questName)
  }
  return responses;
}

async function getCachedResponses(){
  let responses = {}
  if (moduleParams.questName){
    responses = await localforage.getItem(moduleParams.questName)
  }
  console.log(`${moduleParams.questName}`,responses)
  let tableElement=document.getElementById("cacheTable")
  tableElement.innerText=""
  // create head..
  let tableHeadElement = tableElement.createTHead();
  let row=tableHeadElement.insertRow()
  row.insertHead("Id")
  row.insertHead("Value")
  // create the rows...
  let tableBodyElement = tableElement.createTBody();
  Object.entries(responses).forEach( ([key, value]) => {
    row = tableBodyElement.insertRow()
    let cell = row.insertCell()
    cell.innerText = key;
    cell = row.insertCell()
    cell.innerHTML = `<pre>${JSON.stringify(value,null,3)}</pre>`;
  })
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

  prevRes = {};
}

transform.tout = function (fun, tt = 500) {
  if (transform.tout.t) {
    clearTimeout(transform.tout.t);
  }
  transform.tout.t = setTimeout(fun(prevRes), tt);
};

function setStylingAndLogic(){
  function setValue(cssId,inputId){
    let inputElement = document.getElementById(inputId)
    let cssElement = document.getElementById(cssId)
    cssElement.setAttribute("href",inputElement.checked?inputElement.dataset.sheetOn:inputElement.dataset.sheetOff)
  }
  setValue("pagestyle","styling")
  setValue("pagelogic","logic")
}


document.getElementById("viewCache").addEventListener("click",()=>{
  getCachedResponses()
})

if (document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded",startUp)
} else {
  startUp()
};
