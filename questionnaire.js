class Tree {
  constructor() {
    this.prevNode = new TreeNode(null);
    this.nextNode = new TreeNode(null);
    this.rootNode = this.prevNode;

    this[Symbol.iterator] = function() {
      return this;
    };
  }

  addChildren(newChildren) {
    if (newChildren.length == 0) return;
    // console.log("in addChildren: ", newChildren);

    // each child has to be a TreeNode...
    newChildren = newChildren.map(x => new TreeNode(x));
    this.prevNode.setChildren(newChildren);
    this.nextNode = this.prevNode.next().value;
  }

  add(value) {
    this.prevNode.addChild(new TreeNode(value));
    this.nextNode = this.prevNode.next().value;
  }

  hasNext() {
    return !!this.nextNode.value;
  }
  next() {
    if (!this.nextNode.value) {
      return { done: true, value: undefined };
    }

    let tmp = this.nextNode.next();
    this.prevNode = this.nextNode;
    if (!tmp.done) {
      this.nextNode = tmp.value;
    } else {
      this.nextNode = new TreeNode(null);
    }
    return { done: false, value: this.prevNode.value };
  }

  previous() {
    this.nextNode = new TreeNode(null);
    this.prevNode = this.prevNode.prev;
    this.prevNode.children = [];
    return this.prevNode;
  }
}

class TreeNode {
  constructor(value) {
    this.value = value;
    this.parent = null;
    this.children = [];
    this.prev = undefined;
  }

  setParent(parent) {
    this.parent = parent;
  }

  addChild(child) {
    child.parent = this;
    this.children.push(child);
  }

  setChildren(children) {
    // if you pass an array, it clears out the current children
    // and set it to the new children...
    if (Array.isArray(children)) {
      this.children = [];
      this.children = [...children];
      children.forEach(x => {
        x.setParent(this);
      });
      this.nextNode = this.next().value;
    } else {
      // BUT IT MUST BE AN ARRAY!!!
      throw new Error("in Tree::addChildren, newChildren must be an array.");
    }
  }

  lookForNext(child) {
    // child asked for the next node ...
    // lets find his index....
    let childIndex = this.children.indexOf(child);
    // not sure how the index could not be found...
    // unless misused...
    if (childIndex == -1) {
      return { done: true, value: undefined };
    }

    // get the next index and if
    // it is still a valid index
    if (++childIndex < this.children.length) {
      //return this.children[childIndex];
      this.children[childIndex].prev = this;
      return { done: false, value: this.children[childIndex] };
    }
    // child was the last element of the array,
    // so ask our parent for the next element...
    // but if we are the root..  return null...
    if (this.parent == null) {
      return { done: true, value: undefined };
    }
    return this.parent.lookForNext(this);
  }

  next() {
    if (this.children.length > 0) {
      this.children[0].prev = this;
      return { done: false, value: this.children[0] };
    }
    if (this.parent.value == null) return { done: true };
    let myNext = this.parent.lookForNext(this);
    if (myNext.done) {
      return { done: true, value: undefined };
    }
    myNext.value.prev = this;
    return myNext;
  }

  iterator() {
    return new Tree(this);
  }
}

function textBoxInput(inputElement) {
  if (inputElement.previousElementSibling.firstElementChild != null) {
    if (
      inputElement.previousElementSibling.firstElementChild.type == "checkbox"
    ) {
      inputElement.previousElementSibling.firstElementChild.checked =
        inputElement.value.length > 0;
      rbAndCbClick(inputElement.previousElementSibling.firstElementChild);
    }
  } else {
    inputElement.previousElementSibling.previousElementSibling.checked =
      inputElement.value.length > 0;
    rbAndCbClick(inputElement.previousElementSibling.previousElementSibling);
  }
}

function numberInput(inputElement) {
  if (
    [
      ...inputElement.parentElement.querySelectorAll("input[type=number]")
    ].filter(x => x != inputElement).length >= 1
  ) {
    [...inputElement.parentElement.querySelectorAll("input[type=number]")]
      .filter(x => x != inputElement)
      .map(x => (x.value = ""));
  }
  inputElement.parentElement.value = inputElement.value;
}

function rbAndCbClick(inputElement) {
  clearSelection(inputElement);
  if (inputElement.type == "checkbox") {
    inputElement.parentElement.parentElement.value = [
      ...inputElement.parentElement.parentElement.querySelectorAll(
        "input[type='checkbox']"
      )
    ]
      .filter(x => x.checked)
      .map(x => x.value);
  } else {
    inputElement.parentElement.value = [...inputElement.value];
  }
}

function clearSelection(inputElement) {
  var state = inputElement.checked;
  var cb = inputElement.form.querySelectorAll(
    "input[type='checkbox'], input[type='radio']"
  );
  if (inputElement.value == 99) {
    for (var x of cb) {
      if (x != inputElement) {
        x.checked = false;
        x.clear = inputElement.id;
        x.onclick = function() {
          clearElement = document.getElementById(this.clear);
          clearElement.checked = false;
        };
      }
    }
  }
}

// The questionQueue is an array which contains
// the question we should go to next.
const questionQueue = new Tree(null);

function continueQuestion(norp) {
  if (questionQueue.rootNode.children.length == 0) {
    questionQueue.add(norp.parentElement);
    questionQueue.next();
  }

  // check if we need to add questions to the question queue
  checkForSkips(norp.parentElement);

  // get the next question from the questionQueue
  // if it exists... otherwise get the next Element
  let nextQuestion = questionQueue.next();
  if (nextQuestion.done) {
    // if the next element is a question add the next
    // question to the queue and set the nextQuestion variable
    let tmp = norp.parentElement.nextElementSibling;
    if (tmp.classList.contains("question")) {
      questionQueue.add(norp.parentElement.nextElementSibling);
      nextQuestion = questionQueue.next();
    }
  }
  nextElement = nextQuestion.value;

  // hide the current question and move to the next...
  norp.parentElement.classList.remove("active");
  nextElement.classList.add("active");
  return nextElement;
}

// hello

function nextClick(norp) {
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
    getSelected(norp.parentElement).filter(x => x.type !== "hidden").length == 0
  ) {
    // console.log(norp.parentElement);
    norp.setAttribute("data-toggle", "modal");
    norp.setAttribute("data-target", "#softModal");
    document.getElementById(
      "softModalFooter"
    ).innerHTML = `<button type="button" class="btn btn-light" data-dismiss="modal" onclick="nextPage('${norp.parentElement.id}')">Continue Without Answering</button>
     <button type="button" class="btn btn-light" data-dismiss="modal">Answer the Question</button>`;
  } else if (
    norp.parentElement.getAttribute("hardedit") == "true" &&
    getSelected(norp.parentElement) == 0
  ) {
    norp.setAttribute("data-toggle", "modal");
    norp.setAttribute("data-target", "#hardModal");
  } else {
    nextPage(norp);
  }
}

// norp == next or previous button (which ever is clicked...)
function nextPage(norp) {
  // Because next button does not have ID, modal will pass-in ID of question
  // norp needs to be next button element

  // The root is defined as null, so if the question is not the same as the
  // current value in the questionQueue. Add it.  Only the root should be effected.
  // NOTE: if the root has no children, add the current question to the queue
  // and call next().
  if (typeof norp == "string") {
    norp = document.getElementById(norp).querySelector(".next");
  }
  if (questionQueue.rootNode.children.length == 0) {
    questionQueue.add(norp.parentElement);
    questionQueue.next();
  }

  localforage.setItem(norp.parentElement.id, norp.parentElement.value);

  // check if we need to add questions to the question queue
  checkForSkips(norp.parentElement);

  // get the next question from the questionQueue
  // if it exists... otherwise get the next Element
  let nextQuestion = questionQueue.next();
  if (nextQuestion.done) {
    // if the next element is a question add the next
    // question to the queue and set the nextQuestion variable
    let tmp = norp.parentElement.nextElementSibling;
    if (tmp.classList.contains("question")) {
      questionQueue.add(norp.parentElement.nextElementSibling);
      nextQuestion = questionQueue.next();
    }
  }
  nextElement = nextQuestion.value;
  [...nextElement.querySelectorAll("span[forid]")].map(
    x => (x.innerHTML = document.getElementById(x.getAttribute("forid")).value)
  );

  // what if we are in a loop and there is a "displayif"...
  if (nextElement.hasAttribute("displayif")) {
    f = parse(nextElement.getAttribute("displayif"));
    //console.log("should I display the next question? " + f);

    // if the displayif is false, skip the current element...
    if (!f) {
      norp.parentElement.classList.remove("active");
      // this should remove the "nextQuestion from the questionQueue"
      questionQueue.previous();
      let nextNorp = nextElement.querySelector("input[value='Next']");
      if (nextNorp) {
        return nextPage(nextNorp);
      }
    }
  }

  // check all responses for next question
  [...nextElement.children]
    .filter(x => x.hasAttribute("displayif"))
    .map(elm => {
      f = parse(elm.getAttribute("displayif"));

      elm.style.display = f ? "block" : "none";
    });

  // hide the current question and move to the next...
  norp.parentElement.classList.remove("active");
  nextElement.classList.add("active");

  localforage.setItem("_tree", {
    prevNode: norp.parentElement.id,
    currentNode: nextElement.id
  });
  return nextElement;
}

function prev(norp) {
  // get the previousElement...
  let prevElement = questionQueue.previous();
  norp.parentElement.classList.remove("active");
  prevElement.value.classList.add("active");

  localforage.removeItem(norp.parentElement.id);
  localforage.setItem("_tree", {
    prevNode: questionQueue.prevNode.prev.value.id,
    currentNode: questionQueue.prevNode.value.id
  });

  return prevElement;
}

// this function just adds questions to the
// question queue.  It always returns null;
function checkForSkips(questionElement) {
  // get selected responses
  selectedElements = getSelected(questionElement);

  // if there is a skipTo attribute, add them to the beginning of the queue...
  // add the selected responses to the question queue
  selectedElements = selectedElements.filter(x => x.hasAttribute("skipTo"));

  // make an array of the Elements, not the input elments...
  var ids = selectedElements.map(x => x.getAttribute("skipTo"));
  selectedElements = ids.map(x => document.getElementById(x));

  // add all the ids for the selected elements with the skipTo attribute to the question queue
  //var ids = selectedElements.map(x => x.id);
  //questionQueue.addChildren(ids);

  // add all the selected elements with the skipTo attribute to the question queue
  questionQueue.addChildren(selectedElements);

  return null;
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

  var rv1 = [
    ...questionElement.querySelectorAll(
      "input[type='radio'],input[type='checkbox']"
    )
  ];

  var rv2 = [
    ...questionElement.querySelectorAll(
      "input[type='number'], input[type='text'], input[type='date'], input[type='email'], input[type='tel'], textarea, option"
    )
  ];

  var rv3 = [...questionElement.querySelectorAll("input[type='hidden']")];

  rv1 = rv1.filter(x => x.checked);
  rv2 = rv2.filter(x => x.value.length > 0);
  rv3 = rv3.filter(x => x.checked);

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
    .filter(x => x.type == "checkbox")
    .map(x => (tmpRes[x.value] = x.checked));

  // get all the text and radio elements...
  rd = allResponses
    .filter(
      x =>
        (x.type == "radio" && x.checked) ||
        ["text", "date", "email", "number", "tel"].includes(x.type)
    )
    .map(x => (tmpRes[x.name] = x.value));
}

// x is the questionnaire text
function unrollLoops(txt) {
  // all the questions in the loops...
  // each element in res is a loop in the questionnaire...
  let loopRegex = /<loop max=(\d+)\s*>(.*?)<\/loop>/gms;
  let res = [...txt.matchAll(loopRegex)].map(function(x, indx) {
    return { cnt: x[1], txt: x[2], indx: indx + 1, orig: x[0] };
  });

  let idRegex = /\[([A-Z_][A-Z0-9_#]*)[?!]?(,.*?)?\]/gms;
  let disIfRegex = /displayif=.*?\(([A-Z_][A-Z0-9_#]*),.*?\)/g;
  // we have an array of objects holding the text..
  // get all the ids...
  let cleanedText = res.map(function(x) {
    x.txt += "[_CONTINUE" + x.indx + ",displayif=setFalse(-1,#loop)]";
    x.txt = x.txt.replace(/->\s*_CONTINUE\b/g, "-> _CONTINUE" + x.indx);
    let ids = [...x.txt.matchAll(idRegex)].map(y => ({
      label: y[0],
      id: y[1],
      indx: x.indx
    }));
    let disIfIDs = [...x.txt.matchAll(disIfRegex)].map(disIfID => ({
      label: disIfID[0],
      id: disIfID[1]
    }));
    disIfIDs = disIfIDs.map(x => x.id);
    let newIds = ids.map(x => x.id);

    // goto from 1-> max for human consumption... need <=
    let loopText = "";
    for (var loopIndx = 1; loopIndx <= x.cnt; loopIndx++) {
      var currentText = x.txt;
      // replace all instances of the question ids with id_#
      ids.map(
        id =>
          (currentText = currentText.replace(
            id.label,
            id.label.replace(id.id, id.id + "_" + loopIndx)
          ))
      );

      disIfIDs = disIfIDs.filter(x => newIds.includes(x));
      disIfIDs.map(
        id =>
          (currentText = currentText.replace(
            new RegExp(id + "\\b", "g"),
            id + "_" + loopIndx
          ))
      );

      // replace all -> Id with -> Id_#
      ids.map(
        id =>
          (currentText = currentText.replace(
            new RegExp("->\\s*" + id.id + "\\b", "g"),
            "-> " + id.id + "_" + loopIndx
          ))
      );

      // replace all |__(|__)|ID with |__(|__)|ID_#
      ids.map(
        id =>
          (currentText = currentText.replace(
            /(\|__(\|__)*\|)([A-Za-z0-9]\w+)\|/g,
            "$1$3_" + loopIndx + "|"
          ))
      );

      ids.map(
        id => (currentText = currentText.replace(/#loop/g, "" + loopIndx))
      );

      // if (currentText.search(/->\s*_continue/g) >= 0) {
      //   debugger;
      //   if (loopIndx < x.cnt) {
      //     currentText = currentText.replace(/->\s*_continue\s*/g, "-> " + ids[0].id + "_" + (loopIndx + 1));
      //   } else {
      //     currentText = currentText.replace(
      //       /->\s*_continue\s*/g,
      //       "-> " + document.getElementById(ids.slice(-1)[0].id + "_" + loopIndx).nextElementSibling.id
      //     );
      //   }
      // }

      loopText = loopText + "\n" + currentText;
    }
    return loopText;
  });

  for (var loopIndx = 0; loopIndx < cleanedText.length; loopIndx++) {
    txt = txt.replace(res[loopIndx].orig, cleanedText[loopIndx]);
  }
  return txt;
}

const knownFunctions = {
  and: function(x, y) {
    return x && y;
  },
  or: function(x, y) {
    return x || y;
  },
  equals: function(x, y) {
    return Array.isArray(x) ? x.includes(y) : x == y;
  },
  lessThan: function(x, y) {
    return parseFloat(x) < parseFloat(y);
  },
  lessThanOrEqual: function(x, y) {
    return parseFloat(x) <= parseFloat(y);
  },
  greaterThan: function(x, y) {
    return parseFloat(x) > parseFloat(y);
  },
  greaterThanOrEqual: function(x, y) {
    return parseFloat(x) >= parseFloat(y);
  },
  setFalse: function(x, y) {
    return false;
  }
};

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
  stack = stack.filter(x => x != "");

  while (stack.indexOf(")") > 0) {
    var callEnd = stack.indexOf(")");
    if (
      stack[callEnd - 4] == "(" &&
      stack[callEnd - 2] == "," &&
      stack[callEnd - 5] in knownFunctions
    ) {
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
          temp1 = [...document.getElementsByName(arg1)].filter(
            x => x.checked
          )[0];
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
