import { Tree } from "../tree.js";

beforeEach(function () {
  console.log("...next!!!");
});
describe("Tree tests", function () {
  describe("Tree creation", function () {
    console.log("TREE CREATE...");
    let myTree = new Tree();
    it("should be defined", function () {
      assert.isOk(myTree);
    });
    it("should have keys currentNode", function () {
      assert.containsAllKeys(myTree, ["currentNode"]);
    });
    it("the current node should be the root node ... ", function () {
      console.log("x1", myTree.rootNode, myTree.currentNode, myTree.currentNode === myTree.rootNode);
      assert.strictEqual(myTree.currentNode, myTree.rootNode);
    });
  });
  describe("Adding elements to the Tree", function () {
    let myTree = new Tree();
    console.log("TREE CREATE...");

    it("the current node should be the root node ... ", function () {
      console.log("x1a", myTree.rootNode, myTree.currentNode);
      assert.strictEqual(myTree.currentNode, myTree.rootNode, "the current node does not equal the root node");
      assert.lengthOf(myTree.rootNode.children, 0);
    });

    it("should be possible to add a value to the tree", function () {
      myTree.add("First node");
      assert.lengthOf(myTree.rootNode.children, 1, "the root should only have 1 value");
      assert.strictEqual(myTree.rootNode.children[0].value, "First node", "the value should be First Node");
      assert.strictEqual(myTree.currentNode, myTree.rootNode);
      assert.strictEqual(myTree.rootNode.children[0].parent, myTree.rootNode);
    });

    it("next should return a value", function () {
      let nextCalled = myTree.next();
      assert.isOk(nextCalled, "next() should not return a falsy object");
      assert.containsAllKeys(nextCalled, ["value", "done"], "next() should return an object with keys value and done");
      assert.isFalse(nextCalled.done, "done should be false now");
      assert.notStrictEqual(myTree.currentNode, myTree.rootNode, "the current node should not be the root");
    });

    it("should have still be at the first node", function () {
      myTree.add("Second node");
      myTree.add("Third node");
      assert.strictEqual(myTree.currentNode.value, "First node", "the first node should be the current node...");
      assert.strictEqual(myTree.currentNode.children.length, 2, "the first node should have two children");
      assert.strictEqual(myTree.currentNode.children[0].value, "Second node", "the first node's first child should be Second node");
      assert.strictEqual(myTree.currentNode.children[1].value, "Third node", "the first node's first child should be Third node");
    });

    it("next should return the correct nodes..", function () {
      let nextCalled = myTree.next();
      assert.isFalse(nextCalled.done, "next().done should be false");
      assert.strictEqual(nextCalled.value.value, "Second node", "The second node should be the next node");
      assert.strictEqual(myTree.currentNode.value, "Second node", "The second node should be the next node");

      nextCalled = myTree.next();
      assert.isFalse(nextCalled.done, "next().done should be false");
      assert.strictEqual(nextCalled.value.value, "Third node", "The third node should be the next node");
      assert.strictEqual(myTree.currentNode.value, "Third node", "The third node should be the next node");

      nextCalled = myTree.next();
      assert.isTrue(nextCalled.done, "next().done should be true.");
      assert.isUndefined(nextCalled.value);
    });

    it("previous should return the correct nodes", function () {
      try {
        let prevCalled = myTree.previous();
      } catch (error) {
        assert.fail(error);
      }
    });
    it("Finished Unit test", function () {
      assert.isOk("1");
    });
  });
});
