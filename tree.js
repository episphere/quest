export class Tree {
  constructor() {
    this.rootNode = new TreeNode(null);
    this.currentNode = this.rootNode;

    this[Symbol.iterator] = function () {
      return this;
    };
  }

  add(value) {
    // dont add empty/null
    if (!value) throw "adding a falsy value to the tree.";

    // if value is not an array, make it one.
    if (!Array.isArray(value)) {
      value = [value];
    }

    // filter out any falsy values...
    value = value.filter((x) => x);
    if (value.length == 0) throw "cannot add an empty or falsy array to the tree";
    value.forEach((x) => {
      let child = new TreeNode(x);
      this.currentNode.addChild(child);
    });
    console.log(this.currentNode.children, this.rootNode.children);
  }

  hasNext() {
    return !!this.nextNode.value;
  }

  // ask the current TreeNode what is the next value...
  next() {
    console.log("in next (1): current node: ", this.currentNode, this.currentNode == this.rootNode);
    let tmp = this.currentNode.next();
    console.log(tmp);

    if (!tmp.done) {
      this.currentNode = tmp.value;
    }

    console.log("in next (2): current node: ", this.currentNode, this.currentNode == this.rootNode);
    return tmp;
  }

  // ask the TreeNode what is your previous value....
  previous() {
    console.log("in previous (1): current node: ", this.currentNode, this.currentNode.value);
    let tmp = this.currentNode.previous();
    if (!tmp.done) {
      this.currentNode = tmp.value;
    }
    console.log("in previous (2): current node: ", this.currentNode, this.currentNode.value);
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
    console.log("in TN next() ", this.value, this.parent, this.children, this.children.length);
    if (this.children.length > 0) {
      this.children[0].prev = this;
      return { done: false, value: this.children[0] };
    }
    if (this.parent == null) return { done: true, value: undefined };
    if (this.parent.value == null) return { done: true };
    let myNext = this.parent.lookForNext(this);
    if (myNext.done) {
      return { done: true, value: undefined };
    }
    myNext.value.prev = this;
    return myNext;
  }

  lookForPreviousNode(child) {
    // my child asked my to look for his previous sibling...
    // first get the index of my child
    let childIndex = this.children.indexOf(child);

    // not sure how the index could not be found...
    // unless misused...  Should I throw an exception?
    if (childIndex == -1) {
      return { done: true, value: undefined };
    }

    if (childIndex > 0) {
      return { done: false, value: this.children[childIndex - 1] };
    }

    // Mu first child is calling, return me...
    // unless I am the root, we never return the root.
    if (this.parent == null) {
      return { done: true, value: undefined };
    }

    return { done: false, value: this };
  }

  previous() {
    // ask my parent for the previous sibling (or if I am the first, it's my parent)
    if (this.parent) {
      return this.parent.lookForPreviousNode(this);
    }

    // if you are at the root, you wont have a parent
    // and you cannot go back...
    return { done: true, value: undefined };
  }

  iterator() {
    return new Tree(this);
  }
}
