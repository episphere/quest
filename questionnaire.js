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

function clearSelection(inputElement) {
  var state = inputElement.checked;
  var cb = inputElement.parentElement.querySelectorAll(
    "input[type='checkbox'], input[type='radio']"
  );
  if (inputElement.value == 99) {
    for (var x of cb) {
      if (x != inputElement) {
        x.checked = false;
        x.clear = inputElement.id;
        x.nextSibling.nextSibling.value = "";
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

function nextClick(norp) {
  if (norp.hasAttribute("data-toggle")) {
    norp.removeAttribute("data-toggle");
  }
  //   debugger;
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
  debugger;
  [...nextElement.getElementsByTagName("span")].map(
    x => (x.innerHTML = document.getElementById(x.getAttribute("forid")).value)
  );

  // hide the current question and move to the next...
  norp.parentElement.classList.remove("active");
  nextElement.classList.add("active");
  return nextElement;
}

function prev(norp) {
  // get the previousElement...
  let prevElement = questionQueue.previous();
  norp.parentElement.classList.remove("active");
  prevElement.value.classList.add("active");

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
  var rv = [
    ...questionElement.querySelectorAll(
      "input[type='radio'],input[type='checkbox'],input[type='hidden'"
    )
  ];
  rv = rv.filter(x => x.checked);
  // we may need to guarentee that the hidden comes last.
  return rv;
}

// // this is the user profile
// var userProfile = { firstName: "Daniel", lastName: "Russ", age: "40" };
// console.log(userProfile)
// for (var v in userProfile) {
//     console.log(v + "  " + userProfile[v]);
//     document.querySelectorAll('[name=' + v + ']').forEach(x => x.innerHTML = userProfile[v]);
// }
// document.querySelector(".question").classList.add("active");
