export class Tree {
  constructor() {
    this.rootNode = new TreeNode(null);
    this.currentNode = this.rootNode;

    this[Symbol.iterator] = function () {
      return this;
    };
  }

  add(value) {
    console.log(value);
    console.trace();
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
      child.setParent(this.currentNode);
      this.currentNode.addChild(child);
    });
    //console.log(this.currentNode.children, this.rootNode.children);
  }

  hasNext() {
    return !!this.nextNode.value;
  }

  isFirst() {
    return this.currentNode.parent === this.rootNode;
  }

  // ask the current TreeNode what is the next value...
  next() {
    let tmp = this.currentNode.next();

    if (!tmp.done) {
      this.currentNode = tmp.value;
    }

    return tmp;
  }

  // ask the TreeNode what is your previous value....
  // if you cannot go back, the returned element
  // is undefined!
  previous() {
    let tmp = this.currentNode.previous();
    if (!tmp.done) {
      this.currentNode = tmp.value;
    }
    return tmp;
  }

  isEmpty() {
    return this.rootNode.children.length == 0;
  }
  toJSON() {
    function nodeJSON(child) {
      let value = child.value;
      let kidsValue = child.children.map((x) => nodeJSON(x));
      return { value: value, children: kidsValue };
    }

    let obj = nodeJSON(this.rootNode);
    obj.currentNode = this.currentNode.value;
    let json = JSON.stringify(obj);
    console.log(obj);
    console.log(json);
    return json;
  }

  static fromJSON(json) {
    let object = JSON.parse(json);
    let newTree = new Tree();

    function addKids(node, kidsArray) {
      console.log("FROM JSON/ADD KIDS--->", kidsArray);
      if (kidsArray.length == 0) return;
      kidsArray.map((kid) => {
        let kidNode = new TreeNode(kid.value);
        if (object.currentNode == kidNode.value) {
          newTree.currentNode = kidNode;
        }
        node.addChild(kidNode);
        addKids(kidNode, kid.children);
      });
    }
    addKids(newTree.rootNode, object.children);

    return newTree;
  }
}

class TreeNode {
  constructor(value) {
    this.value = value;
    this.parent = null;
    this.children = [];
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
      return { done: false, value: this.children[0] };
    }
    if (this.parent == null) return { done: true, value: undefined };
    if (this.parent.value == null) return { done: true };
    let myNext = this.parent.lookForNext(this);
    if (myNext.done) {
      return { done: true, value: undefined };
    }
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
