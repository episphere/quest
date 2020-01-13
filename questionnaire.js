function clearSelection(inputElement) {
    var state = inputElement.checked;
    var cb = inputElement.parentElement.querySelectorAll("input[type='checkbox']");
    if (inputElement.value == 99) {
        for (var x of cb) {
            if (x != inputElement) {
                x.checked = false;
                x.clear = inputElement.id;
                x.onclick = function() {
                    clearElement = document.getElementById(this.clear);
                    clearElement.checked = false;
                }
            }
        }
    }
}


// The questionQueue is an array which contains
// the question we should go to next.
const questionQueue = []

// norp == next or previous button (which ever is clicked...)
function next(norp) {

    // check if we need to add questions to the question queue
    checkForSkips(norp.parentElement);

    // get the next question from the questionQueue
    // if it exists... otherwise get the next Element
    var nextElement = null;
    if (questionQueue.length > 0){
        nextElement = questionQueue.shift()
    } else {
        nextElement = norp.parentElement.nextElementSibling
    }


    // hide the current question and move to the next...
    norp.parentElement.classList.remove("active");
    nextElement.classList.add("active");

    // by the way...  set the next question's previous button's skipTo element...
    var prevButtonList = nextElement.getElementsByClassName("previous");
    if (prevButtonList.length>0) {
        prevButtonList[0].skipTo=norp.parentElement.id;
    }

    return (nextElement)
}

function prev(norp) {
    if (norp.hasAttribute("skipTo")){
        var prevElement = document.getElementById(norp.skipTo);
        norp.parentElement.classList.remove("active")
        prevElement.classList.add("active")
    }


    var skipTo = checkForSkips(norp.parentElement);
    if (skipTo != null) {
        prevElement = document.getElementById(skipTo);
    }
    return (prevElement);
}

// this function just adds questions to the
// question queue.  It always returns null;
function checkForSkips(questionElement) {
    // get selected responses
    selectedElements = getSelected(questionElement);

    // if there is a skipTo attribute, add them to the beginning of the queue...
    // add the selected responses to the question queue
    selectedElements = selectedElements.filter( x => x.hasAttribute("skipTo")); 
    
    // add all the selected elements with the skipTo attribute to the question queue
    questionQueue.unshift(...selectedElements)

    return (null);
}

function getSelected(questionElement) {

    // look for radio boxes, checkboxes, and  hidden elements
    // for checked items.  Return all checked items.
    // If nothing is checked, an empty array should be returned.
    var cb = [...questionElement.querySelectorAll("input[type='radio'],input[type='checkbox'],input[type='hidden'")];
    cb = cb.filter( x => x.checked)
    return (rv)
}

class Tree{
    constructor(root){
        this.current = root;

        this[Symbol.iterator] = function() { 
            return this;
        };
    }


    next(){
        let tmp = this.current.next();
        if (!tmp.done){
            let rv = {done: false, value:this.current}
            this.current = tmp.value;
            return(rv);
        }

        return(tmp);
    }
}

class TreeNode {

    constructor(value){
        this.value = value;
        this.parent = null;
        this.children = [];

    }

    setParent(parent){
        this.parent=parent;
    }

    addChild(child){
        child.parent=this;
        this.children.push(child);
    }

    lookForNext(child){
        // child asked for the next node ...
        // lets find his index....
        let childIndex = this.children.indexOf(child)
        // not sure how the index could not be found...
        // unless misused...
        if (childIndex == -1) {
            return undefined;
        }

        // get the next index and if
        // it is still a valid index
        if ( ++childIndex < this.children.length){
            //return this.children[childIndex];
            return {done: false, value: this.children[childIndex]}
        }
        // child was the last element of the array,
        // so ask our parent for the next element...
        // but if we are the root..  return null...
        if (this.parent == null){
            return {done: true, value: undefined};
        }
        return this.parent.lookForNext(this);
    }

    next(){
        if (this.children.length>0){
            return {done: false, value: this.children[0]};
        }
        if (this.parent == null) return {done: true}; 
        return this.parent.lookForNext(this);
    }
    
   iterator(){
       return new Tree(this);
   }
}



// // this is the user profile
// var userProfile = { firstName: "Daniel", lastName: "Russ", age: "40" };
// console.log(userProfile)
// for (var v in userProfile) {
//     console.log(v + "  " + userProfile[v]);
//     document.querySelectorAll('[name=' + v + ']').forEach(x => x.innerHTML = userProfile[v]);
// }
// document.querySelector(".question").classList.add("active");