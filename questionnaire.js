import { Tree } from "./tree.js";
import { knownFunctions } from "./knownFunctions.js";
import { removeQuestion } from "./localforageDAO.js";
import { replace } from './replace2.js'

export const moduleParams = {};

let script = document.createElement("script");
script.src = "https://episphere.github.io/quest/math.min.js";
document.body.appendChild(script);

// The questionQueue is an Tree which contains
// the question ids in the order they should be displayed.
export const questionQueue = new Tree();

export function isFirstQuestion() {
  return questionQueue.isEmpty() || questionQueue.isFirst();
}

function numberOfInputs(element) {
  let resps = Array.from(
    element.querySelectorAll("input, textarea, select")
  ).reduce((acc, current) => {
    //if (["submit", "button"].includes(current.type)) return acc;
    if (current.type == "submit" || current.type == "hidden") return acc;
    if (["radio", "checkbox"].includes(current.type)) {
      acc[current.name] = true;
    } else {
      acc[current.id] = true;
    }
    return acc;
  }, {});
  return Object.keys(resps).length;
}

function setFormValue(form, value, id) {
  if (numberOfInputs(form) == 1) {
    form.value = value;
  } else {
    if (!form.value) {
      form.value = {};
    }
    form.value[id] = value;
  }
}

// here are function that handle the
// user selection and attach the
// selected value to the form (question)
export function textBoxInput(event) {
  let inputElement = event.target;
  textboxinput(inputElement);
}

export function parseSSN(event) {
  console.log("SSN EVENT ", event);
  if (event.type == "keyup") {
    let element = event.target;
    let val = element.value.replace(/\D/g, "");
    let newVal = "";

    if (val.length >= 3 && val.length < 5 && event.code != "Backspace") {
      //reformat and return SSN
      newVal += val.replace(/(\d{3})/, "$1-");
      element.value = newVal;
    }

    if (val.length >= 5 && event.code != "Backspace") {
      //reformat and return SSN
      newVal += val.replace(/(\d{3})(\d{2})/, "$1-$2-");
      element.value = newVal;
    }
    return null;
  }
}

export function parsePhoneNumber(event) {
  if (event.type == "keyup") {
    let element = event.target;
    let phone = element.value.replace(/\D/g, "");
    let newVal = "";

    if (phone.length >= 3 && phone.length < 6 && event.code != "Backspace") {
      //reformat and return phone number
      newVal += phone.replace(/(\d{3})/, "$1-");
      element.value = newVal;
    }

    if (phone.length >= 6 && event.code != "Backspace") {
      //reformat and return phone number
      newVal += phone.replace(/(\d{3})(\d{3})/, "$1-$2-");
      element.value = newVal;
    }

    return null;
  }
  //   let newVal = "";

  //   if (val.length > 4) {
  //     element.value = val;
  //   }
  //   if (val.length > 3 && val.length < 6) {
  //     newVal += val.substr(0, 3) + "-";
  //     val = val.substr(3);
  //   }
  //   if (val.length > 5) {
  //     debugger;
  //     newVal += val.substr(0, 3) + "-";
  //     newVal += val.substr(3, 3) + "-";
  //     val = val.substr(6);
  //   }
  //   newVal += val;
  //   element.value = newVal;
  // }
}

export function textboxinput(inputElement) {
  /////////// To change all max attributes to input element ///////////
  // [...inputElement.parentElement.parentElement.children]
  //   .filter((x) => x.hasAttribute("max"))
  //   .map((x) =>
  //     x.getAttribute("max").replace(x.getAttribute("max"), inputElement.value)
  //   );
  ///////////////////////////////////////////////////////////////////////
  let evalBool = "";
  if (inputElement.getAttribute("modalif") && inputElement.value != "") {
    evalBool = math.evaluate(
      inputElement.getAttribute("modalif").replace(/value/, inputElement.value)
    );
  }
  if (inputElement.getAttribute("softedit") == "true" && evalBool == true) {
    if (inputElement.getAttribute("modalvalue")) {
      document.getElementById(
        "modalResponseBody"
      ).innerText = inputElement.getAttribute("modalvalue");
      $("#softModalResponse").modal("show");
    }
  }
  if (inputElement.className == "SSN") {
    // handles SSN auto-format
    parseSSN(inputElement);
  }
  let span1 = null;
  let div1 = null;
  if (inputElement && inputElement.nextElementSibling && inputElement.nextElementSibling.firstChild){
    span1 = inputElement.nextElementSibling.firstChild;
    div1 = inputElement.nextElementSibling;
  }

  
  // if (span1 != null) {
  //   span1.style.color = "red";
  if (['text', 'number', 'email', 'tel', 'date', 'time'].includes(inputElement.type)) {
    console.log(inputElement.type);

    switch (inputElement.type) {
      //Please fill out this field.
      case "number":
        if (inputElement.value != "") {
          if (
            inputElement.dataset.min &&
            math.evaluate(
              `${inputElement.value} < ${inputElement.getAttribute("data-min")}`
            )
          ) {
            if (!span1) {
              let div = document.createElement("div");
              let span = document.createElement("span");
              span.innerText = " ";
              span.style.height = "inherit";
              div.appendChild(span);
              div.style.minHeight = "30px";
              inputElement.insertAdjacentElement("afterend", div);
              span1 = inputElement.nextElementSibling.firstChild;
              span1.style.color = "red";
            }
            
            span1.innerText =
              `Value must be greater than or equal to ` +
              inputElement.getAttribute("data-min") +
              ".";
            inputElement.classList.add("invalid");
            inputElement.form.classList.add("invalid");
          } else if (
            inputElement.dataset.max &&
            math.evaluate(
              `${inputElement.value} > ${inputElement.getAttribute("data-max")}`
            )
          ) {
            if (!span1) {
              let div = document.createElement("div");
              let span = document.createElement("span");
              span.innerText = " ";
              span.style.height = "inherit";
              div.appendChild(span);
              div.style.minHeight = "30px";
              inputElement.insertAdjacentElement("afterend", div);
              span1 = inputElement.nextElementSibling.firstChild;
              span1.style.color = "red";
            }
            span1.innerText =
              `Value must be less than or equal to ` +
              inputElement.getAttribute("data-max") +
              ".";
            inputElement.classList.add("invalid");
            inputElement.form.classList.add("invalid");
          } else {
            if (span1) {
              div1.parentNode.removeChild(div1);
            }
            if ([...inputElement.classList].includes("invalid")) {
              inputElement.classList.remove("invalid");
              inputElement.form.classList.remove("invalid");
            }
          }
        } else {
          if (span1) {
            div1.parentNode.removeChild(div1);
          }
          if ([...inputElement.classList].includes("invalid")) {
            inputElement.classList.remove("invalid");
            inputElement.form.classList.remove("invalid");
          }
        }
        break;

      case "email":
        let emailRegEx = /\S+@\S+\.\S+/;
        if (inputElement.value != "" && !emailRegEx.test(inputElement.value)) {
          if (!span1) {
            let div = document.createElement("div");
            let span = document.createElement("span");
            span.innerText = " ";
            span.style.height = "inherit";
            div.appendChild(span);
            div.style.minHeight = "30px";
            inputElement.insertAdjacentElement("afterend", div);
            span1 = inputElement.nextElementSibling.firstChild;
            span1.style.color = "red";
          }
          span1.innerText =
            "Please enter an email address in this format: user@example.com.";
          inputElement.classList.add("invalid");
          inputElement.form.classList.add("invalid");
          inputElement.form.noValidate = true;
        } else {
          if (span1) {
            div1.parentNode.removeChild(div1);
          }
          if ([...inputElement.classList].includes("invalid")) {
            inputElement.classList.remove("invalid");
            inputElement.form.classList.remove("invalid");
          }
          //inputElement.form.noValidate = false;
        }
        break;

      case "tel":
        if (inputElement.value != "" && inputElement.value.length < 12) {
          if (!span1) {
            let div = document.createElement("div");
            let span = document.createElement("span");
            span.innerText = " ";
            span.style.height = "inherit";
            div.appendChild(span);
            div.style.minHeight = "30px";
            inputElement.insertAdjacentElement("afterend", div);
            span1 = inputElement.nextElementSibling.firstChild;
            span1.style.color = "red";
          }
          span1.innerText =
            "Please enter a phone number in this format: 999-999-9999.";
          inputElement.classList.add("invalid");
          inputElement.form.classList.add("invalid");
          inputElement.form.noValidate = true;
        } else {
          if (span1) {
            div1.parentNode.removeChild(div1);
          }
          if ([...inputElement.classList].includes("invalid")) {
            inputElement.classList.remove("invalid");
            inputElement.form.classList.remove("invalid");
          }
          //inputElement.form.noValidate = false;
        }
        break;

      case "text":
        if (
          inputElement.value != "" &&
          [...inputElement.classList].includes("SSN") &&
          !inputElement.value.match("[0-9]{3}-?[0-9]{2}-?[0-9]{4}")
        ) {
          if (!span1) {
            let div = document.createElement("div");
            let span = document.createElement("span");
            span.innerText = " ";
            span.style.height = "inherit";
            div.appendChild(span);
            div.style.minHeight = "30px";
            inputElement.insertAdjacentElement("afterend", div);
            span1 = inputElement.nextElementSibling.firstChild;
            span1.style.color = "red";
          }
          span1.innerText =
            "Please enter a Social Security Number in this format: 999-99-9999.";
          inputElement.classList.add("invalid");
          inputElement.form.classList.remove("invalid");
          inputElement.form.noValidate = true;
        } else if (
          inputElement.value != "" &&
          [...inputElement.classList].includes("SSNsm") &&
          !inputElement.value.match("[0-9]{4}")
        ) {
          if (!span1) {
            let div = document.createElement("div");
            let span = document.createElement("span");
            span.innerText = " ";
            span.style.height = "inherit";
            div.appendChild(span);
            div.style.minHeight = "30px";
            inputElement.insertAdjacentElement("afterend", div);
            span1 = inputElement.nextElementSibling.firstChild;
            span1.style.color = "red";
          }
          span1.innerText =
            "Please enter the last four digits of a Social Security Number in this format: 9999.";
          inputElement.classList.add("invalid");
          inputElement.form.classList.remove("invalid");
          inputElement.form.noValidate = true;
        } else {
          if (span1) {
            div1.parentNode.removeChild(div1);
          }
          if ([...inputElement.classList].includes("invalid")) {
            inputElement.classList.remove("invalid");
            inputElement.form.classList.remove("invalid");
          }
          //inputElement.form.noValidate = false;
        }
        break;
    }
  }

  // what is going on here...
  // we are checking if we should click the checkbox/radio button..
  // first see if the parent is a div and the first child is a checkbox...
  if (
    inputElement.parentElement &&
    inputElement.parentElement.tagName == "LABEL"
  ) {
    let rbCb = inputElement.parentElement.previousSibling;
    rbCb.checked = inputElement.value.length > 0;
    radioAndCheckboxUpdate(rbCb);
  }

  clearSelection(inputElement);
  let value = handleXOR(inputElement);
  let id = inputElement.getAttribute("xor")
    ? inputElement.getAttribute("xor")
    : inputElement.id;
  value = value ? value : inputElement.value;

  setFormValue(inputElement.form, value, id);
}

// onInput/Change handler for radio/checkboxex
export function rbAndCbClick(event) {
  let inputElement = event.target;
  // when we programatically click, the input element is null.
  // however we call radioAndCheckboxUpdate directly..
  if (inputElement) {
    radioAndCheckboxUpdate(inputElement);
    radioAndCheckboxClearTextInput(inputElement);
  }
}

//for when radio/checkboxes have input fields, only enable input fields when they are selected
export function radioAndCheckboxClearTextInput(inputElement) {
  let parent = document.getElementById(inputElement.name);

  for (var i = 0; i < parent.childNodes.length; i++) {
    if (parent.childNodes[i].className == "response") {
      let radioLevel = parent.childNodes[i];
      for (var j = 0; j < radioLevel.childNodes.length; j++) {
        if ((radioLevel.childNodes[j].type == "radio" || radioLevel.childNodes[j].type == "checkbox") && !radioLevel.childNodes[j].checked) {
          let inputBox = radioLevel.getElementsByTagName('input');
          if (inputBox[1]) {
            inputBox[1].value = "";
            inputBox[1].disabled = true;
          }
        } else if ((radioLevel.childNodes[j].type == "radio" || radioLevel.childNodes[j].type == "checkbox") && radioLevel.childNodes[j].checked) {
          let inputBox = radioLevel.getElementsByTagName('input');
          if (inputBox[1]) {
            inputBox[1].disabled = false;
          }
        }
      }
    }        
}


}
export function radioAndCheckboxUpdate(inputElement) {
  if (!inputElement) return;
  clearSelection(inputElement);

  let selectedValue = {};
  if (inputElement.type == "checkbox") {
    // get all checkboxes with the same name attribute...
    selectedValue = Array.from(
      inputElement.form.querySelectorAll(
        `input[type="checkbox"][name=${inputElement.name}]`
      )
    )
      .filter((x) => x.checked)
      .map((x) => x.value);
  } else {
    // we have a radio button..  just get the selected value...
    selectedValue = inputElement.value;
  }

  setFormValue(inputElement.form, selectedValue, inputElement.name);
}

function clearSelection(inputElement) {
  if (!inputElement.form || !inputElement.name) return;
  let sameName = [
    ...inputElement.form.querySelectorAll(`input[name=${inputElement.name}]`),
  ].filter((x) => x.type != "hidden");
  if (inputElement.value == 99 || inputElement.value == 88 || inputElement.value == 77 
    || inputElement.value == 746038746 || inputElement.value == 178420302 ) {
    sameName.forEach((element) => {
      switch (element.type) {
        case "checkbox":
          element.checked = element == inputElement ? element.checked : false;
          break;
        case "radio":
          break;
        default:
          element.value = element == inputElement ? inputElement.value : "";
          setFormValue(element.form, element.value, element.id);
          if (element.nextElementSibling && element.nextElementSibling.children.length !== 0) element.nextElementSibling.children[0].innerText = "";
          element.form.classList.remove("invalid");
      }
    });
  } else {
    sameName.forEach((element) => {
      if (["checkbox", "radio"].includes(element.type))
        element.checked = element.value == 99 || element.value == 88  || element.value == 77 || element.value == 746038746 || element.value == 178420302 ? false : element.checked;
    });
  }
}

export function handleXOR(inputElement) {
  if (!inputElement.hasAttribute("xor")) {
    return inputElement.value;
  }

  let valueObj = {};
  valueObj[inputElement.id] = inputElement.value;
  let sibs = [...inputElement.parentElement.querySelectorAll("input")];
  sibs = sibs.filter(
    (x) =>
      x.hasAttribute("xor") &&
      x.getAttribute("xor") == inputElement.getAttribute("xor") &&
      x.id != inputElement.id
  );

  sibs.forEach((x) => {
    if (["checkbox", "radio"].includes(x.type)) {
      x.checked = x.value == 99 || x.value == 88 || x.value == 77 || x.value == 746038746 || x.value == 178420302 ? false : x.checked;
    } else {
      x.value = "";
      if (x.nextElementSibling.children.length !== 0 && x.nextElementSibling.children[0].tagName == "SPAN") {
        if (x.nextElementSibling.children[0].innerText.length != 0) {
          x.nextElementSibling.children[0].innerText = "";
          x.classList.remove("invalid");
        }
      }
      valueObj[x.id] = x.value;
    }
  });
  return valueObj;
}

export function nextClick(norp, store, rootElement, obj, previousResults, list_of_sub_modules, current_sub_module, opened_sub_module) {
  // Because next button does not have ID, modal will pass-in ID of question
  // norp needs to be next button element
  if (typeof norp == "string") {
    norp = document.getElementById(norp).querySelector(".next");
  }
  console.log(norp.form)
  let reqElms = [];
  reqElms = [...norp.form.children].filter((elm) => elm.dataset.required);
  console.log(reqElms)
  if (reqElms.length > 0) {
    reqElms.forEach((elm) => {
      let span = elm.nextElementSibling.firstChild;
      console.log(span)
      if (elm.value.length == 0) {
        span.style.color = "red";
        span.innerText = "Please fill out this field.";
        elm.focus();
        return null;
      } else {
        //handle the soft and hard edits...
        showModal(norp, store, rootElement, obj, previousResults, list_of_sub_modules, current_sub_module, opened_sub_module);
      }
    });
  } else {
    showModal(norp, store, rootElement, obj, previousResults, list_of_sub_modules, current_sub_module, opened_sub_module);
  }
}

function setNumberOfQuestionsInModal(num, norp, store, soft) {
  let prompt = `There ${num > 1 ? "are" : "is"} ${num} question${
    num > 1 ? "s" : ""
  } unanswered on this page. `;
  if (!soft) {
    document.getElementById(
      "hardModalBodyText"
    ).innerText = `${prompt} Please answer the question${num > 1 ? "s" : ""}.`;
    $("#hardModal").modal("toggle");
    return null;
  }
  let f1 = nextPage;
  f1 = f1.bind(f1, norp, store);
  document.getElementById(
    "modalBodyText"
  ).innerText = `${prompt} Would you like to continue?`;
  document.getElementById("modalContinueButton").onclick = f1;
  $("#softModal").modal("toggle");
}
// show modal function
function showModal(norp, store, rootElement, obj, previousResults, list_of_sub_modules, current_sub_module, opened_sub_module) {
  if (
    norp.form.getAttribute("softedit") == "true" ||
    norp.form.getAttribute("hardedit") == "true"
  ) {
    let numBlankReponses = [...norp.form.children]
      .filter(
        (x) =>
          x.type &&
          x.type != "hidden" &&
          !x.hasAttribute("xor") &&
          x.style.display != "none"
      )
      .reduce((t, x) => (x.value.length == 0 ? t + 1 : t), 0);
    let hasNoResponses =
      getSelected(norp.form).filter((x) => x.type !== "hidden").length == 0;

    if (norp.form.hasAttribute("radioCheckboxAndInput")){
      if (!radioCbHasAllAnswers(norp.form)){
        hasNoResponses = true;
      }
    }

    if (norp.form.hasAttribute("grid")){
      if (!gridHasAllAnswers(norp.form)){
        hasNoResponses = true;
      }
      
    }
    // let tempVal = 0;
    // if (hasNoResponses) {
    //   tempVal = 0;
    // } else {
    //   tempVal = 1;
    // }
    if (numBlankReponses == 0 && hasNoResponses == true) {
      numBlankReponses = 1;
    } else if ((numBlankReponses == 0) == true && hasNoResponses == false) {
      numBlankReponses = 0;
    } else if ((numBlankReponses == 0) == false && hasNoResponses == true) {
      numBlankReponses = numBlankReponses;
    } else {
      numBlankReponses = 0;
    }
    // numBlankReponses =
    //   numBlankReponses == 0 && hasNoResponses ? tempVal : numBlankReponses;

    if (numBlankReponses > 0) {
      setNumberOfQuestionsInModal(
        numBlankReponses,
        norp,
        store,
        norp.form.getAttribute("softedit") == "true"
      );
      return null;
    }
    // if (
    //   norp.getAttribute("data-target") == "#hardModal" &&
    //   getSelected(norp.form) == 0
    // ) {
    //   $("#hardModal").modal("toggle");
    //   return null;
    // } else {
    //   nextPage(norp, store);
    // }
  }
  nextPage(norp, store, rootElement, obj, previousResults, list_of_sub_modules, current_sub_module, opened_sub_module);
}

let questRes = {};
let tempObj = {};

async function updateTreeInLocalForage(opened_sub_module) {

  // update the questname.treejson and opened_sub_module(status whether ever opened or not) in localforage
  let questName = moduleParams.questName;
  await localforage.setItem(questName + ".treeJSON", questionQueue);
  console.log(opened_sub_module)
  if (opened_sub_module) await localforage.setItem("opened_sub_module", opened_sub_module);
}

async function getNextQuestionId(currentFormElement, obj, rootElement, previousResults, list_of_sub_modules, current_sub_module, opened_sub_module) {
  // get the next question from the questionQueue
  // if it exists... otherwise get the next look at the
  // markdown and get the question follows.
  console.log(questionQueue)
  let nextQuestionNode = questionQueue.next();
  console.log(nextQuestionNode)
  if (nextQuestionNode.done) {
    // We are at the end of the question queue...
    // get the next element from the markdown...
    let tmp = currentFormElement.nextElementSibling;
    console.log(tmp.id)

    // if it is the last question of a sub_module, then call the next sub module, update the status of opened sub module in the localforage and add the first question to the question queue
    if (tmp.id === 'softModal') {
      opened_sub_module[current_sub_module] = true
      updateTreeInLocalForage(opened_sub_module);
      await call_next_sub_module(obj, rootElement, previousResults, list_of_sub_modules, current_sub_module, opened_sub_module)
      let p = document.getElementById('root')
      console.log(p)
      let nextElement = p.firstChild
      questionQueue.add(nextElement.id);
    } else {
      questionQueue.add(tmp.id);
    }

    // we are at a question that should be displayed add it to the queue and
    // make it the current node.
    // questionQueue.add(tmp.id);
    nextQuestionNode = questionQueue.next();
    console.log(nextQuestionNode)
    console.log(nextQuestionNode.value)
  }

  return nextQuestionNode.value;
}

// norp == next or previous button (which ever is clicked...)
async function nextPage(norp, store, rootElement, obj, previousResults, list_of_sub_modules, current_sub_module, opened_sub_module) {
  // The root is defined as null, so if the question is not the same as the
  // current value in the questionQueue. Add it.  Only the root should be effected.
  // NOTE: if the root has no children, add the current question to the queue
  // and call next().
  let questionElement = norp.form;
  // console.group(questionElement)
  if (checkValid(questionElement) == false) {
    return null;
  }
  console.log(questionQueue)
  if (questionQueue.isEmpty()) {
    questionQueue.add(questionElement.id);
    questionQueue.next();
  }
  let questName = moduleParams.questName;
  let responses;
  tempObj[questionElement.id] = questionElement.value;
  questRes = tempObj;
  if (store && questionElement.value) {
    let formData = {};
    formData[`${questName}.${questionElement.id}`] = questionElement.value;
    
    previousResults[questionElement.id] = questionElement.value;  //added this so results carry from one submodule to next
    store(formData);
  } else {
    let tmp = await localforage
      .getItem(questName)
      .then((allResponses) => {
        // if their is not an object in LF create one that we will add later...
        if (!allResponses) {
          allResponses = {};
        }
        // set the value for the questionId...
        allResponses[questionElement.id] = questionElement.value;

        return allResponses;
      })
      .then((allResponses) => {
        // allResposes really should be defined at this point. If it wasn't
        // previously in LF, the previous block should have created it...
        responses = allResponses;
        
        localforage.setItem(questName, allResponses, () => {
          console.log(
            "... Response stored in LF: " + questName,
            JSON.stringify(allResponses)
          );
        });
      });

    
  }

  // check if we need to add questions to the question queue
  checkForSkips(questionElement, obj, rootElement, previousResults, list_of_sub_modules, current_sub_module, opened_sub_module);
  console.log(questionElement.value)
  
  let nextQuestionId = await getNextQuestionId(questionElement, obj, rootElement, previousResults, list_of_sub_modules, current_sub_module, opened_sub_module);
  // get the actual HTML element.
  console.log(nextQuestionId.value)
  let nextElement;

  // if we don't find the next element in the document, then call the next sub module, update the status of opened sub module in the localforage and add the first question to the question queue

  if (!document.getElementById(nextQuestionId.value)) {
    opened_sub_module[current_sub_module] = true
    updateTreeInLocalForage(opened_sub_module);
    await call_next_sub_module(obj, rootElement, previousResults, list_of_sub_modules, current_sub_module, opened_sub_module)
    let p = document.getElementById('root')
    console.log(p)
    nextElement = p.firstChild
  } else {
    nextElement = document.getElementById(nextQuestionId.value);
  }


  console.log(nextElement)
  nextElement = exitLoop(nextElement);

  // before we add the next question to the queue...
  // check for the displayif status...
  while (nextElement && nextElement.hasAttribute("displayif")) {
    // not sure what to do if the next element is is not a question ...
    if (nextElement.classList.contains("question")) {
      let display = evaluateCondition(nextElement.getAttribute("displayif"));
      if (display) break;
      if (nextElement.id.substring(0, 9) != "_CONTINUE") questionQueue.pop();
      let nextQuestionId = await getNextQuestionId(nextElement, obj, rootElement, previousResults, list_of_sub_modules, current_sub_module);
      nextElement = document.getElementById(nextQuestionId.value);
      nextElement = exitLoop(nextElement);
    } else {
      console.log(
        " ============= next element is not a question...  not sure what went wrong..."
      );
      console.trace();
    }
  }
  //hide the current question
  questionElement.classList.remove("active");
  // nextElement.scrollIntoView();

  displayQuestion(nextElement, opened_sub_module);
  // nextElement.scrollIntoView();
  // document.getElementById(rootElement).scrollIntoView();
  window.scrollTo(0,0);
}

// function to call the next sub module
async function call_next_sub_module(obj, rootElement, previousResults, sub_modules, current_sub_module, opened_sub_module) {

  // get link for the next sub module and update the number of the opened sub module
  let next_sub_module = sub_modules[current_sub_module];
  current_sub_module++;
  console.log(opened_sub_module)
  console.log(current_sub_module)

  // fetch the contents for the next sub module and send it to the replace function 
  let content = await (await fetch(next_sub_module)).text();
  console.log(content)
  await replace(rootElement, obj, content, current_sub_module, opened_sub_module, previousResults)
}

export async function submitQuestionnaire(store, questName){
  console.log("submit questionnaire clicked!");
  if (store) {
    let formData = {};
    formData[`${questName}.COMPLETED`] = true;
    formData[`${questName}.COMPLETED_TS`] = new Date();
    try{
      store(formData).then(()=>{
        location.reload();
      });
    } catch (e){
      console.log("Store failed", e);
    }

  } 
}
function exitLoop(nextElement) {
  if (nextElement && nextElement.hasAttribute("firstquestion")) {
    let loopMax = document.getElementById(nextElement.getAttribute("loopmax"))
      .value;
    let firstQuestion = nextElement.getAttribute("firstquestion");
    let loopIndex = nextElement.getAttribute("loopindx");
    if (math.evaluate(firstQuestion > loopMax)) {
      questionQueue.pop();
      questionQueue.add(`_CONTINUE${loopIndex}_DONE`);
      let nextQuestionId = questionQueue.next().value;
      nextElement = document.getElementById(nextQuestionId.value);
    }
  }
  return nextElement;
}

export function displayQuestion(nextElement, opened_sub_module) {
  [...nextElement.querySelectorAll("span[forid]")].map((x) => {
    let elm = document.getElementById(x.getAttribute("forid"));
    if (elm && elm.tagName == "LABEL") {
      x.innerHTML = elm.innerHTML;
    } else {
      x.innerHTML = elm.value != "" ? elm.value : x.getAttribute("optional");
    }
  });

  Array.from(
    nextElement.querySelectorAll("input[data-max-validation-dependency]")
  ).map(
    (x) =>
      (x.max = document.getElementById(x.dataset.maxValidationDependency).value)
  );
  Array.from(
    nextElement.querySelectorAll("input[data-min-validation-dependency]")
  ).map(
    (x) =>
      (x.min = document.getElementById(x.dataset.minValidationDependency).value)
  );

  // check all responses for next question
  [...nextElement.children]
    .filter((x) => {
      return x.hasAttribute("displayif");
    })
    .map((elm) => {
      let f = evaluateCondition(elm.getAttribute("displayif"));
      elm.style.display = f ? "inline" : "none";
    });

  //check if grid elements needs to be shown
  [...nextElement.children]
    .filter((x) => {
      return x.hasAttribute("redertypegrid");
    })
    .map((elm) => {
      for (let child of elm.children) {
        if (child.getAttribute("displayif")) {
          let f = evaluateCondition(child.getAttribute("displayif"));
          if (!f) {
            child.setAttribute("style", "display:none !important");
          } else {
            child.setAttribute("style", "display:inline");
          }
        }
      }
    });

  // check min/max for variable substitution in validation
  function exchangeValue(element, attrName, newAttrName) {
    let attr = element.getAttribute(attrName);
    if (attr) {
      let isnum = /^[\d\.]+$/.test(attr);
      if (!isnum) {
        let tmpVal = evaluateCondition(attr);
        element.setAttribute(newAttrName, tmpVal);
      }
    }
    return element;
  }
  //Replacing all default HTML form validations with datasets

  [...nextElement.querySelectorAll("input[required]")].forEach((element) => {
    if (element.hasAttribute("required")) {
      element.removeAttribute("required");
      element.dataset.required = "true";
    }
  });

  [...nextElement.querySelectorAll("input[minval]")].forEach((element) => {
    exchangeValue(element, "minval", "data-min");
  });
  [...nextElement.querySelectorAll("input[maxval]")].forEach((element) =>
    exchangeValue(element, "maxval", "data-max")
  );

  [...nextElement.querySelectorAll("input[data-min]")].forEach((element) =>
    exchangeValue(element, "data-min", "data-min")
  );
  [...nextElement.querySelectorAll("input[data-max]")].forEach((element) => {
    exchangeValue(element, "data-max", "data-max");
  });

  //move to the next question...
  nextElement.classList.add("active");

  // FINALLY...  update the tree in localForage...
  // First let's try NOT waiting for the function to return.
  updateTreeInLocalForage();

  questionQueue.ptree();
  return nextElement;
}

export async function previousClicked(norp, retrieve, rootElement, obj, previousResults, list_of_sub_modules, current_sub_module, opened_sub_module) {
  // get the previousElement...

  console.log(questionQueue)
  let pv = questionQueue.previous();
  while (pv.value.value.substring(0, 9) == "_CONTINUE") {
    pv = questionQueue.previous();
  }
  console.log(pv.value.value)
  let prevElement

  // if the previous question id is 'END' or the previous question is not present in the document, then it is the last question of the previous sub module, hence, call the previous sub module

  if (pv.value.value === 'END' || !document.getElementById(pv.value.value)) {
    // CALL PREVIOUS SUB MODULE
    console.log(moduleParams.questName)
    updateTreeInLocalForage(opened_sub_module);
    await call_previous_sub_module(obj, rootElement, previousResults, list_of_sub_modules, current_sub_module, opened_sub_module)
    prevElement = document.getElementById(pv.value.value)
    console.log(prevElement)
  }
  else {
  prevElement = document.getElementById(pv.value.value);
  } 

  norp.form.classList.remove("active");
  prevElement.classList.add("active");

  if (retrieve) {
    const response = await retrieve();
  } else removeQuestion(moduleParams.questName, norp.form.id);

  updateTreeInLocalForage();
  // prevElement.parentElement.scrollIntoView();
  //document.getElementById(rootElement).scrollIntoView();
  window.scrollTo(0,0);
  return prevElement;
}

// function to call the previous sub module

async function call_previous_sub_module(obj, rootElement, previousResults, sub_modules, current_sub_module, opened_sub_module) {
   // update the currently open sub module number
  current_sub_module--;
  console.log(opened_sub_module)
  let next_sub_module = sub_modules[current_sub_module-1];

  // fetch the contents of the previous sub module and send it to the replace function to render it
  let content = await (await fetch(next_sub_module)).text();
  console.log(content)
  await replace(rootElement, obj, content, current_sub_module, opened_sub_module, previousResults)
}


// this function just adds questions to the
// question queue.  It always returns null;
function checkForSkips(questionElement, obj, rootElement, previousResults, list_of_sub_modules, current_sub_module, opened_sub_module) {
  // get selected responses
  let selectedElements = getSelected(questionElement);

  let numSelected = selectedElements.filter((x) => x.type != "hidden").length;
  // if there are NO non-hidden responses ...
  if (numSelected == 0) {
    // there may be either a noResponse, a default response
    // or both or neither...

    // sort array so that noResponse comes first..
    // noResponse has a classlist length of 1/default =0
    let classSort = function (a, b) {
      return b.length - a.length;
    };
    selectedElements.sort(classSort);
  } else {
    // something was selected... remove the no response hidden tag..
    selectedElements = selectedElements.filter(
      (x) => !x.classList.contains("noresponse")
    );
  }

  // if there is a skipTo attribute, add them to the beginning of the queue...
  // add the selected responses to the question queue
  selectedElements = selectedElements.filter((x) => x.hasAttribute("skipTo"));

  // if there is an if attribute, check to see if condition is true and leave it in the selectedElements
  // otherwise, remove it from the selectedElements
  selectedElements = selectedElements.filter((x) => {
    if (!x.hasAttribute("if")) {
      return true;
    }
    return evaluateCondition(x.getAttribute("if"));
  });

  // make an array of the Elements, not the input elments...
  var ids = selectedElements.map((x) => x.getAttribute("skipTo"));
  //selectedElements = ids.map((x) => document.getElementById(x));

  // add all the ids for the selected elements with the skipTo attribute to the question queue
  //var ids = selectedElements.map(x => x.id);
  //questionQueue.addChildren(ids);

  // add all the selected elements with the skipTo attribute to the question queue
  if (ids.length > 0) {
    console.log(ids)


    questionQueue.add(ids);
  }

  return null;
}

function checkValid(questionElement) {
  if (questionElement.classList.contains("invalid")) {
    return false;
  } else {
    return questionElement.checkValidity();
  }
}

//check if grids has all answers
export function gridHasAllAnswers(questionElement) {
  let gridRows = questionElement.querySelectorAll("[gridrow]");
  for (let i =0; i<gridRows.length; i++){
    if (gridRows[i].style.display != "none") {
      let gridCells = gridRows[i].querySelectorAll("[gridcell]");
      let rowHasAnswer = false;
      for (let j =0; j<gridCells.length; j++){
        if (gridCells[j].checked){
          rowHasAnswer = true;
        }
      }
      if (!rowHasAnswer){
        return false;
      }
    }

    
  }
  return true;
}
//check if radio/checkboxes with inputs attached has all of the required values
//does a double loop through of each radio/checbox, if checked then the following inputs must not have a empty value
export function radioCbHasAllAnswers(questionElement) {
  let hasAllAnswers = false;
  for (let i=0; i<questionElement.length-1;i++){
      if ((questionElement[i].type === "checkbox" || questionElement[i].type === "radio") && questionElement[i].checked){
        for (let j=i+1; j<questionElement.length-1;j++){
          if (questionElement[j].type === "checkbox" || questionElement[j].type === "radio" || questionElement[j].type === "submit") {
            hasAllAnswers = true;
            break;
          } else if ((questionElement[j].type === "number" || questionElement[j].type === "text" || questionElement[j].type === "date" || questionElement[j].type === "email") && questionElement[j].value==="" && questionElement[i].style.display != "none"){
            return false;
          }
        }
      }
  }
  return hasAllAnswers;
}
export function getSelected(questionElement) {
  // look for radio boxes, checkboxes, and  hidden elements
  // for checked items.  Return all checked items.
  // If nothing is checked, an empty array should be returned.
  // var rv = [
  //   ...questionElement.querySelectorAll(
  //     "input[type='radio'],input[type='checkbox'],input[type='hidden'],input[type='number']"
  //   )
  // ];

  var rv1 = [
    ...questionElement.querySelectorAll(
      "input[type='radio'],input[type='checkbox']"
    ),
  ];

  var rv2 = [
    ...questionElement.querySelectorAll(
      "input[type='number'], input[type='text'], input[type='date'], input[type='email'], input[type='time'], input[type='tel'], textarea, option"
    ),
  ];

  var rv3 = [...questionElement.querySelectorAll("input[type='hidden']")];

  rv1 = rv1.filter((x) => x.checked);
  rv2 = rv2.filter((x) => x.value.length > 0);
  rv3 = rv3.filter((x) => x.hasAttribute("checked"));

  // rv = rv.filter(x =>
  //   x.type == "radio" || x.type == "checkbox" || x.type == "hidden"
  //     ? x.checked
  //     : x.value.length > 0
  // );

  // we may need to guarentee that the hidden comes last.
  rv1 = rv1.concat(rv2);
  return rv1.concat(rv3);
}

// create a blank object for collecting
// the questionnaire results...
const res = {};
// on submit of the question(a <form> tag)
// call this function...
function getResults(element) {
  // clear old results or create a blank object in the results to
  // hold these results...
  res[element.id] = {};
  // when we add to the tmpRes object, only the correct
  // object in the results are touched...
  let tmpRes = res[element.id];

  let allResponses = [...element.querySelectorAll(".response")];
  // get all the checkboxes
  cb = allResponses
    .filter((x) => x.type == "checkbox")
    .map((x) => (tmpRes[x.value] = x.checked));

  // get all the text and radio elements...
  rd = allResponses
    .filter(
      (x) =>
        (x.type == "radio" && x.checked) ||
        ["text", "date", "email", "number", "tel"].includes(x.type)
    )
    .map((x) => (tmpRes[x.name] = x.value));
}

// x is the questionnaire text

export function evaluateCondition(txt) {
  //refactored to displayIf from parse
  function replaceValue(x) {
    if (typeof x === "string") { 
      let element = document.getElementById(x); 
      if (element != null) {
          if (element.hasAttribute('grid') && (element.type === "radio" || element.type === "checkbox")){
            //for displayif conditions with grid elements
              x = element.checked ? 1 : 0;
          }
          else {
            let tmpVal = x;
            x = document.getElementById(x).value;
            if (typeof x == "object" && Array.isArray(x) != true) {
              x = x[tmpVal];
            }
          }

      } else {
        //look up by name
        let temp1 = [...document.getElementsByName(x)].filter(
          (y) => y.checked
        )[0];
        x = temp1 ? temp1.value : x;
        // ***** if it's neither... look in the previous module *****
        if (!temp1) {
          temp1 = moduleParams.previousResults[x];
          x = temp1 ? temp1 : x;
        }
      }
    }
    return x;

  }
  //https://stackoverflow.com/questions/6323417/regex-to-extract-all-matches-from-string-using-regexp-exec
  var re = /[\(\),]/g;
  var stack = [];
  var lastMatch = 0;
  for (const match of txt.matchAll(re)) {
    stack.push(match.input.substr(lastMatch, match.index - lastMatch));
    stack.push(match.input.charAt(match.index));
    lastMatch = match.index + 1;
  }
  // remove all blanks...
  stack = stack.filter((x) => x != "");

  while (stack.indexOf(")") > 0) {
    let callEnd = stack.indexOf(")");
    if (
      stack[callEnd - 4] == "(" &&
      stack[callEnd - 2] == "," &&
      stack[callEnd - 5] in knownFunctions
    ) {
      // it might hurt performance, but for debugging
      // expliciting setting the variables are helpful...
      let fun = stack[callEnd - 5];
      let arg1 = stack[callEnd - 3];
      // arg1 one should be a id or a boolean...
      // either from a element in the document or
      // from the currently undefined last module...
      arg1 = replaceValue(arg1);
      let arg2 = stack[callEnd - 1];
      arg2 = replaceValue(arg2);
      let tmpValue = knownFunctions[fun](arg1, arg2);
      // replace from callEnd-5 to callEnd with  the results...
      // splice start at callEnd-5, remove 6, add the calculated value...
      stack.splice(callEnd - 5, 6, tmpValue);
    } else {
      throw { Message: "Bad Displayif Function: " + txt, Stack: stack };
    }
  }
  return stack[0];
}
