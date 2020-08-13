import { transform } from "../replace2.js";
import { Tree } from "../tree.js";

let div1 = document.createElement("div");
div1.id = "myDiv";
let button1 = document.createElement("button");
button1.innerText = "Toggle Text";
button1.onclick = hideDiv;
document.body.appendChild(button1);

function hideDiv() {
  let x = document.getElementById("myDiv");
  if (x.style.display === "none") {
    x.style.display = "block";
  } else {
    x.style.display = "none";
  }
}
document.body.appendChild(div1);

let div2 = document.createElement("div");
div2.id = "myDiv2";
div2.style.paddingTop = "20px";
document.body.appendChild(div2);

let div3 = document.createElement("div");
div3.id = "myDiv3";
document.body.appendChild(div3);

describe("Replace Tests", function () {
  describe("Transform Tests", function () {
    it("Should render URL into div1", async function () {
      this.timeout(4000);
      await transform.render(
        {
          url: "https://jonasalmeida.github.io/privatequest/demo2.txt",
        },
        "myDiv",
        {}
      );
      // .then(() => {
      //   div1.innerHTML =
      //     "<a href='https://jonasalmeida.github.io/privatequest/demo2.txt'><h4>Module 1</h4></a><br><br>";
      // });
      console.log("here1");
      console.log(div1.innerText.length);
      assert.isAtLeast(
        div1.innerText.length,
        1,
        "myDiv should have at least one character"
      );
    });
    it("Should render text into div2", async function () {
      await transform.render(
        {
          text: `[SEX] What is your sex?
            (1) Male
            (2) Female
            (3) Other`,
          activate: true,
        },
        "myDiv2",
        {}
      );
      console.log("here2");
      console.log(div2.innerText.length);
      assert.isAtLeast(
        div2.innerText.length,
        1,
        "myDiv2 should have at least one character"
      );
    });
    it("Should render a number input in div3", async function () {
      const res = await transform.render(
        {
          text: `[AGE] What is your age?
                |__|__|`,
          activate: true,
        },
        "myDiv3",
        {}
      );
      console.log("here3");
      console.log(div3.innerText.length);
      assert.isAtLeast(
        div3.innerText.length,
        1,
        "myDiv3 should have at least one character"
      );
    });
  });
});

beforeEach(function () {
  console.log("...next!!!");
});
describe("Tree Tests", function () {
  describe("Tree creation", function () {
    console.log("TREE CREATE...");
    let myTree = new Tree();
    it("Should be defined", function () {
      assert.isOk(myTree);
    });
    it("Should have keys currentNode", function () {
      assert.containsAllKeys(myTree, ["currentNode"]);
    });
    it("The current node should be the root node ... ", function () {
      console.log(
        "x1",
        myTree.rootNode,
        myTree.currentNode,
        myTree.currentNode === myTree.rootNode
      );
      assert.strictEqual(myTree.currentNode, myTree.rootNode);
    });
  });
  describe("Adding elements to the Tree", function () {
    let myTree = new Tree();
    console.log("TREE CREATE...");

    it("The current node should be the root node ... ", function () {
      console.log("x1a", myTree.rootNode, myTree.currentNode);
      assert.strictEqual(
        myTree.currentNode,
        myTree.rootNode,
        "the current node does not equal the root node"
      );
      assert.lengthOf(myTree.rootNode.children, 0);
    });

    it("Should be possible to add a value to the tree", function () {
      myTree.add("First node");
      assert.lengthOf(
        myTree.rootNode.children,
        1,
        "the root should only have 1 value"
      );
      assert.strictEqual(
        myTree.rootNode.children[0].value,
        "First node",
        "the value should be First Node"
      );
      assert.strictEqual(myTree.currentNode, myTree.rootNode);
      assert.strictEqual(myTree.rootNode.children[0].parent, myTree.rootNode);
    });

    it("Next should return a value", function () {
      let nextCalled = myTree.next();
      assert.isOk(nextCalled, "next() should not return a falsy object");
      assert.containsAllKeys(
        nextCalled,
        ["value", "done"],
        "next() should return an object with keys value and done"
      );
      assert.isFalse(nextCalled.done, "done should be false now");
      assert.notStrictEqual(
        myTree.currentNode,
        myTree.rootNode,
        "the current node should not be the root"
      );
    });

    it("Should have still be at the first node", function () {
      myTree.add("Second node");
      myTree.add("Third node");
      assert.strictEqual(
        myTree.currentNode.value,
        "First node",
        "the first node should be the current node..."
      );
      assert.strictEqual(
        myTree.currentNode.children.length,
        2,
        "the first node should have two children"
      );
      assert.strictEqual(
        myTree.currentNode.children[0].value,
        "Second node",
        "the first node's first child should be Second node"
      );
      assert.strictEqual(
        myTree.currentNode.children[1].value,
        "Third node",
        "the first node's first child should be Third node"
      );
    });

    it("Next should return the correct nodes..", function () {
      let nextCalled = myTree.next();
      assert.isFalse(nextCalled.done, "next().done should be false");
      assert.strictEqual(
        nextCalled.value.value,
        "Second node",
        "The second node should be the next node"
      );
      assert.strictEqual(
        myTree.currentNode.value,
        "Second node",
        "The second node should be the next node"
      );

      nextCalled = myTree.next();
      assert.isFalse(nextCalled.done, "next().done should be false");
      assert.strictEqual(
        nextCalled.value.value,
        "Third node",
        "The third node should be the next node"
      );
      assert.strictEqual(
        myTree.currentNode.value,
        "Third node",
        "The third node should be the next node"
      );

      nextCalled = myTree.next();
      assert.isTrue(nextCalled.done, "next().done should be true.");
      assert.isUndefined(nextCalled.value);
    });

    it("Previous should return the correct nodes", function () {
      let prevCalled = myTree.previous();
      console.log(prevCalled);
      assert.isFalse(prevCalled.done, "previous().done should be false");
      assert.strictEqual(
        prevCalled.value.value,
        "Second node",
        "The second node should be the previous node"
      );
      assert.strictEqual(
        myTree.currentNode.value,
        "Second node",
        "The second node should now be the current node"
      );

      prevCalled = myTree.previous();
      assert.isFalse(prevCalled.done, "previous().done should be false");
      assert.strictEqual(
        prevCalled.value.value,
        "First node",
        "The first node should be the previous node"
      );
      assert.strictEqual(
        myTree.currentNode.value,
        "First node",
        "The first node should now be the current node"
      );

      prevCalled = myTree.previous();
      assert.isTrue(prevCalled.done, "previous().done should be true.");
      assert.isUndefined(prevCalled.value);
    });
    it("Finished Unit test", function () {
      assert.isOk("1");
    });
  });

  describe("Tree Serialization ", function () {
    let myTree = new Tree();
    myTree.add("Q1");
    myTree.next();
    myTree.add("Q2");
    myTree.next();
    myTree.add("Q3");
    myTree.previous();
    // it("should be at Q1", function () {
    //   assert.strictEqual(myTree.currentNode.value, "Q1");
    //   let json = myTree.toJSON();
    //   let tree2 = Tree.fromJSON(json);
    //   assert.isOk(tree2);
    //   let tree2JSON = tree2.toJSON();
    //   assert.strictEqual(
    //     tree2JSON,
    //     json,
    //     "The two serialized trees should be identical..."
    //   );
    // });
  });

  describe("Should be able to serialize the tree to localforage", async function () {
    let myTree = new Tree();
    myTree.add("Q1");
    myTree.next();
    myTree.add(["Q2", "Q3", "Q4"]);
    myTree.next();
    myTree.add("Q2A");
    myTree.next();
    myTree.next();
    myTree.next();
    myTree.add("Q5");
    myTree.next(); // Q5 is the currentNode...

    await localforage.clear();
    await localforage.setItem("QuestionTree", myTree.toJSON());
    const json = await localforage.getItem("QuestionTree");
    assert.strictEqual(json, myTree.toJSON());
    console.log(json, "\n", myTree.toJSON());
  });
});

describe("GitHub ISSUE 86: Previous Node", function () {
  let myTree = new Tree();

  myTree.add(["Q1", "Q2", "Q3"]);
  myTree.next();
  let x1 = myTree.currentNode.value;
  it("Should be at Q1", function () {
    assert.strictEqual(x1, "Q1");
  });
  myTree.add("Q1a");
  myTree.next();
  myTree.add("Q1b");
  myTree.next();
  myTree.add("Q1c");
  myTree.next();
  myTree.ptree();
  let x2 = myTree.currentNode.value;
  it("Should be at Q1c", function () {
    assert.strictEqual(x2, "Q1c");
  });
  myTree.next();
  let x3 = myTree.currentNode.value;
  it("Should be at Q2", function () {
    assert.strictEqual(x3, "Q2");
  });
  myTree.previous();
  let x4 = myTree.currentNode.value;
  it("Should be at Q1c", function () {
    assert.strictEqual(x4, "Q1c");
  });

  myTree = null;
});
