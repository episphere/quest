import { Tree } from "./tree.js";
import { knownFunctions } from "./knownFunctions.js";

export const moduleParams = {};

// The questionQueue is an Tree which contains
// the question ids in the order they should be displayed.
const questionQueue = new Tree();

export function isFirstQuestion() {
  return questionQueue.isEmpty() || questionQueue.isFirst();
}

export function textBoxInput(event) {
  let inputElement = event.target;
  if (inputElement.previousElementSibling.firstElementChild != null) {
    if (inputElement.previousElementSibling.firstElementChild.type == "checkbox") {
      inputElement.previousElementSibling.firstElementChild.checked = inputElement.value.length > 0;
      rbAndCbClick(inputElement.previousElementSibling.firstElementChild);
    }
  } else {
    inputElement.previousElementSibling.previousElementSibling.checked = inputElement.value.length > 0;
    rbAndCbClick(inputElement.previousElementSibling.previousElementSibling);
  }
  handleXOR(inputElement);
  inputElement.parentElement.value = inputElement.value;
}

export function numberInput(event) {
  let inputElement = event.target;
  if ([...inputElement.parentElement.querySelectorAll("input[type=number]")].filter((x) => x != inputElement).length >= 1) {
    [...inputElement.parentElement.querySelectorAll("input[type=number]")]
      .filter((x) => x != inputElement)
      .map((x) => (x.value = ""));
  }
  inputElement.parentElement.value = inputElement.value;
}

export function rbAndCbClick(event) {
  let inputElement = event.target;
  clearSelection(inputElement);
  if (inputElement.type == "checkbox") {
    inputElement.parentElement.parentElement.value = [
      ...inputElement.parentElement.parentElement.querySelectorAll("input[type='checkbox']"),
    ]
      .filter((x) => x.checked)
      .map((x) => x.value);
  } else {
    inputElement.parentElement.parentElement.value = [...inputElement.value];
  }
}

function clearSelection(inputElement) {
  if (!inputElement.form) return;
  var state = inputElement.checked;
  var cb = inputElement.form.querySelectorAll("input[type='checkbox'], input[type='radio']");
  if (inputElement.value == 99) {
    for (var x of cb) {
      if (x != inputElement) {
        x.checked = false;
        x.clear = inputElement.id;
        x.onclick = function () {
          clearElement = document.getElementById(this.clear);
          clearElement.checked = false;
        };
      }
    }
  }
}

function handleXOR(inputElement) {
  console.log("inhandleXOR");
  let sibs = [...inputElement.parentElement.querySelectorAll("input")];
  sibs = sibs.filter(
    (x) => x.hasAttribute("xor") && x.getAttribute("xor") == inputElement.getAttribute("xor") && x.id != inputElement.id
  );
  sibs.forEach((x) => {
    x.value = "";
  });
}

export function nextClick(norp, store) {
  // Because next button does not have ID, modal will pass-in ID of question
  // norp needs to be next button element
  if (typeof norp == "string") {
    norp = document.getElementById(norp).querySelector(".next");
  }

  if (norp.hasAttribute("data-toggle")) {
    norp.removeAttribute("data-toggle");
  }
  if (norp.parentElement.lastChild.id == "softModalContainer") {
    norp.parentElement.removeChild(norp.parentElement.lastChild);
  }
  if (norp.parentElement.lastChild.id == "hardModalContainer") {
    norp.parentElement.removeChild(norp.parentElement.lastChild);
  }

  if (
    norp.parentElement.getAttribute("softedit") == "true" &&
    getSelected(norp.parentElement).filter((x) => x.type !== "hidden").length == 0
  ) {
    // console.log(norp.parentElement);
    norp.setAttribute("data-toggle", "modal");
    norp.setAttribute("data-target", "#softModal");
    document.getElementById(
      "softModalFooter"
    ).innerHTML = `<button type="button" class="btn btn-light" data-dismiss="modal" onclick="nextPage('${norp.parentElement.id}', ${store})">Continue Without Answering</button>
     <button type="button" class="btn btn-light" data-dismiss="modal">Answer the Question</button>`;
  } else if (norp.parentElement.getAttribute("hardedit") == "true" && getSelected(norp.parentElement) == 0) {
    norp.setAttribute("data-toggle", "modal");
    norp.setAttribute("data-target", "#hardModal");
  } else {
    nextPage(norp, store);
  }
}

let questRes = {};
let tempObj = {};

// norp == next or previous button (which ever is clicked...)
async function nextPage(norp, store) {
  // The root is defined as null, so if the question is not the same as the
  // current value in the questionQueue. Add it.  Only the root should be effected.
  // NOTE: if the root has no children, add the current question to the queue
  // and call next().
  if (questionQueue.isEmpty) {
    console.log("==> the tree is empty... add first element", norp.parentElement, norp.parentElement.id);
    questionQueue.add(norp.parentElement.id);
    questionQueue.next();
  }
  let questName = moduleParams.questName;

  tempObj[norp.parentElement.id] = norp.parentElement.value;
  questRes = tempObj;
  if (store && norp.parentElement.value) {
    let formData = {};
    formData[`${questName}.${norp.parentElement.id}`] = norp.parentElement.value;
    store(formData);
  } else {
    if (await localforage.getItem(questName)) {
      let tempObj = {};
      tempObj = await localforage.getItem(questName);
      if (tempObj[norp.parentElement.id]) {
        tempObj[norp.parentElement.id] = norp.parentElement.value;
      } else {
        tempObj[norp.parentElement.id] = {};
        tempObj[norp.parentElement.id] = norp.parentElement.value;
      }
      localforage.setItem(questName, tempObj);
    } else {
      localforage.setItem(questName, questRes);
    }
  }

  // check if we need to add questions to the question queue
  checkForSkips(norp.parentElement);
  checkValid(norp.parentElement);

  if (checkValid(norp.parentElement) == false) {
    return null;
  } else {
    // get the next question from the questionQueue
    // if it exists... otherwise get the next look at the
    // markdown and get the question follows.
    let nextQuestionNode = questionQueue.next();
    if (nextQuestionNode.done) {
      // We are at the end of the question queue...
      //
      // if the next element is a question add the next
      // question to the queue and set the nextQuestion variable
      // not sure what to do if it is not...
      let tmp = norp.parentElement.nextElementSibling;
      if (tmp.classList.contains("question")) {
        questionQueue.add(tmp.id);
        nextQuestionNode = questionQueue.next();
      }
    }

    // at this point the we have have the next question from the question queue...
    // get the actual element.
    let nextElement = document.getElementById(nextQuestionNode.value.value);
    [...nextElement.querySelectorAll("span[forid]")].map((x) => {
      let elm = document.getElementById(x.getAttribute("forid"));
      x.innerHTML = elm.value != undefined ? elm.value : elm.innerText;
    });
    Array.from(nextElement.querySelectorAll("input[data-max-validation-dependency]")).map(
      (x) => (x.max = document.getElementById(x.dataset.maxValidationDependency).value)
    );
    Array.from(nextElement.querySelectorAll("input[data-min-validation-dependency]")).map(
      (x) => (x.min = document.getElementById(x.dataset.minValidationDependency).value)
    );
    // what if there is a "displayif"...
    let doNotDisplay = false;
    do {
      if (nextElement.hasAttribute("displayif")) {
        // if the displayif is false, do not display....
        doNotDisplay = !parse(nextElement.getAttribute("displayif"));

        if (doNotDisplay) {
          norp.parentElement.classList.remove("active");
          // this should remove the "nextQuestion from the questionQueue"
          questionQueue.previous();
          let nextNorp = nextElement.querySelector("input[value='NEXT']");
          if (nextNorp) {
            return nextPage(nextNorp);
          }
        }
      }
    } while (doNotDisplay);

    // check all responses for next question
    [...nextElement.children]
      .filter((x) => x.hasAttribute("displayif"))
      .map((elm) => {
        f = parse(elm.getAttribute("displayif"));

        elm.style.display = f ? "block" : "none";
      });

    // hide the current question and move to the next...
    norp.parentElement.classList.remove("active");
    nextElement.classList.add("active");

    return nextElement;
  }
}

export async function previousClicked(norp, retrieve) {
  // get the previousElement...
  let prevElement = document.getElementById(questionQueue.previous().value.value);
  norp.parentElement.classList.remove("active");
  prevElement.classList.add("active");

  if (retrieve) {
    const response = await retrieve();
    console.log(response);
  } else localforage.removeItem(norp.parentElement.id);

  return prevElement;
}

// this function just adds questions to the
// question queue.  It always returns null;
function checkForSkips(questionElement) {
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
    selectedElements = selectedElements.filter((x) => !x.classList.contains("noresponse"));
  }

  // if there is a skipTo attribute, add them to the beginning of the queue...
  // add the selected responses to the question queue
  selectedElements = selectedElements.filter((x) => x.hasAttribute("skipTo"));

  // make an array of the Elements, not the input elments...
  var ids = selectedElements.map((x) => x.getAttribute("skipTo"));
  //selectedElements = ids.map((x) => document.getElementById(x));

  // add all the ids for the selected elements with the skipTo attribute to the question queue
  //var ids = selectedElements.map(x => x.id);
  //questionQueue.addChildren(ids);

  // add all the selected elements with the skipTo attribute to the question queue
  if (ids.length > 0) {
    questionQueue.add(ids);
  }

  return null;
}

function checkValid(questionElement) {
  if (questionElement.checkValidity() == false) {
    return false;
  } else {
    return true;
  }
}

function getSelected(questionElement) {
  // look for radio boxes, checkboxes, and  hidden elements
  // for checked items.  Return all checked items.
  // If nothing is checked, an empty array should be returned.
  // var rv = [
  //   ...questionElement.querySelectorAll(
  //     "input[type='radio'],input[type='checkbox'],input[type='hidden'],input[type='number']"
  //   )
  // ];

  var rv1 = [...questionElement.querySelectorAll("input[type='radio'],input[type='checkbox']")];

  var rv2 = [
    ...questionElement.querySelectorAll(
      "input[type='number'], input[type='text'], input[type='date'], input[type='email'], input[type='tel'], textarea, option"
    ),
  ];

  var rv3 = [...questionElement.querySelectorAll("input[type='hidden']")];

  rv1 = rv1.filter((x) => x.checked);
  rv2 = rv2.filter((x) => x.value.length > 0);
  rv3 = rv3.filter((x) => x.checked);

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
  cb = allResponses.filter((x) => x.type == "checkbox").map((x) => (tmpRes[x.value] = x.checked));

  // get all the text and radio elements...
  rd = allResponses
    .filter((x) => (x.type == "radio" && x.checked) || ["text", "date", "email", "number", "tel"].includes(x.type))
    .map((x) => (tmpRes[x.name] = x.value));
}

// x is the questionnaire text

function parse(txt) {
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
    var callEnd = stack.indexOf(")");
    if (stack[callEnd - 4] == "(" && stack[callEnd - 2] == "," && stack[callEnd - 5] in knownFunctions) {
      // it might hurt performance, but for debugging
      // expliciting setting the variables are helpful...
      fun = stack[callEnd - 5];
      arg1 = stack[callEnd - 3];
      // arg1 one should be a id or a boolean...
      // either from a element in the document or
      // from the currently undefined last module...
      if (typeof arg1 === "string") {
        var element = document.getElementById(arg1);
        if (element != null) {
          arg1 = document.getElementById(arg1).value;
        } else {
          //look up by name
          temp1 = [...document.getElementsByName(arg1)].filter((x) => x.checked)[0];
          arg1 = temp1 ? temp1.value : arg1;
          // ***** if it's neither... look in the previous module *****
        }
      }
      arg2 = stack[callEnd - 1];
      var tmpValue = knownFunctions[fun](arg1, arg2);
      // replace from callEnd-5 to callEnd with  the results...
      // splice start at callEnd-5, remove 6, add the calculated value...
      stack.splice(callEnd - 5, 6, tmpValue);
    } else {
      return console.log(stack);
    }
  }
  return stack[0];
}

function ptree() {
  let node = questionQueue.rootNode;
  do {
    console.log(node);
    node = node.next().value;
  } while (node);
}
