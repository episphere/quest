import { transform } from "../replace2.js";

let div1 = document.createElement("div");
div1.id = "myDiv";
document.body.appendChild(div1);

describe("Replace Tests", function () {
  describe("Transform Test", function () {
    it("Should render URL into myDiv", function () {
      transform
        .render(
          {
            url: "https://jonasalmeida.github.io/privatequest/demo2.txt",
            activate: true,
          },
          "myDiv",
          {}
        )
        .then(() => {
          console.log("lalala");
          console.log(div1.innerText.length);
          assert.isAtLeast(
            div1.innerText.length,
            1,
            "myDiv should have at least one character"
          );
        });
    });
    it("Should render text into myDiv2", function () {
      let div2 = document.createElement("div");
      div2.id = "myDiv2";
      document.body.appendChild(div2);
      transform
        .render(
          {
            text: `[SEX] What is your sex?
            (1) Male 
            (2) Female
            (3) Other`,
            activate: true,
          },
          "myDiv2",
          {}
        )
        .then(() => {
          console.log("lalala");
          assert.isAtLeast(
            div2.innerText.length,
            1,
            "myDiv should have at least one character"
          );
        });
    });
  });
});
