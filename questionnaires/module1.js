console.log("in module1.js");
console.log(myCallbacks);
config = {
  markdown: "https://jonasalmeida.github.io/privatequest/demo2.txt",
  WORK3: function () {
    return `<form class="question" id="WORK3">
        <b>What is your current job title? Please be descriptive. For example, high school math teacher, emergency room nurse, automobile painter.</b><input type="text" name="WORK3" id="jobtitle" />
        <input type="button" value="Enter Job" onclick="config.OCCUPTN1(this)">
        <div id="q1"></div>
      </form>`;
  },
  OCCUPTN1: async function (inputElement) {
    function buildHtml(x, jobtitle) {
      if (x && x.length > 0) {
        let qText = `<b>Which occupation best describes your job [${jobtitle}]?</b>`;
        x.forEach((soc, indx) => {
          qText = `${qText} <br><input type="radio" id="EMPLOY_${indx}" value=${soc.code} name="SOCcerResult" onclick=myCallbacks.radio(this)> <label for="EMPLOY_${indx}">${soc.label}</label>\n`;
        });
        qText = `${qText} <br><br> <input type="submit" class="previous" value="BACK"> <input type="submit" class="next" data-target="#softModal" value="NEXT">`;
        document.getElementById("q1").innerHTML = qText;
        console.log(qText);
      }
    }

    let jobtitleElement = inputElement.previousElementSibling;
    myCallbacks.text(jobtitleElement);

    let jobtitle = jobtitleElement.value;
    let cache = await localforage.getItem("soccer");
    if (!cache) cache = {};
    if (cache[jobtitle]) {
      buildHtml(cache[jobtitle], jobtitle);
      console.log("built from CACHE...");
      return;
    }
    if (!jobtitle) return;
    let URL = `https://sitf-cwlcji5kxq-uc.a.run.app/soccer/code?title=${jobtitle}`;
    fetch(URL)
      .then((x) => x.json())
      .then((x) => {
        console.log(x);
        buildHtml(x, jobtitle);
        console.log("build from API");
        cache[jobtitle] = x;
        localforage.setItem("soccer", cache);
      });
  },
};
