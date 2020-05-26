import {
  questionQueue,
  nextClick,
  previousClicked,
  moduleParams,
  rbAndCbClick,
  numberInput,
  textBoxInput,
} from "./questionnaire.js";
import { retrieveFromLocalForage } from "./localforageDAO.js";

export let transform = function () {
  // init
};

const validation = {};
let questName = "Questionnaire";

transform.render = async (obj, divId, previousResults = {}) => {
  moduleParams.renderObj = obj;
  let contents = "";
  if (obj.text) contents = obj.text;
  if (obj.url) {
    moduleParams.config = await (await fetch(obj.url)).text();
    console.log(moduleParams.config);
  }
  if (obj.url) {
    contents = await (await fetch(obj.url)).text();
    if (obj.activate) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://episphere.github.io/quest/ActiveLogic.css";
      document.head.appendChild(link);
      const link2 = document.createElement("link");
      link2.rel = "stylesheet";
      link2.href = "https://episphere.github.io/quest/Style1.css";
      document.head.appendChild(link2);
    }
  }
  // first thing we must do is unroll the loops...
  contents = unrollLoops(contents);
  // hey, lets de-lint the contents..
  // convert (^|\n{2,}Q1. to [Q1]
  // note:  the first question wont have the
  // \n\n so we need to look at start of string(^)
  //    contents = contents.replace(/(\n{2,})(\w+)\./msg, "$1[$2]")

  // contents = contents.replace(/(?<=\n{2,})(\w+)\./gms, "[$1]");
  //contents = contents.replace(/(\n{2,})([^\[])/gms, "$1[_#]$2");

  contents = contents.replace(/\/\*.*\*\//g, "");
  contents = contents.replace(/\/\/.*/g, "");
  // contents = contents.replace(/\[DISPLAY IF .*\]/gms, "");
  let nameRegex = new RegExp(/{"name":"(\w*)"}/);
  if (nameRegex.test(contents)) {
    contents = contents.replace(/{"name":"(\w*)"}/, fQuestName);
    function fQuestName(group, name) {
      questName = name;
      return "";
    }
  } else {
    questName = "Questionnaire";
  }
  //console.log(contents)
  // first let's deal with breaking up questions..
  // a question starts with the [ID1] regex pattern
  // and end with the next pattern or the end of string...

  // start with a '['
  // then the first character must be a capital letter
  // followed by zero or more capital letters/digits or an _
  // note: we want this possessive (NOT greedy) so add a ?
  //       otherwise it would match the first and last square bracket

  let regEx = new RegExp("\\[([A-Z_][A-Z0-9_#]*[\\?\\!]?)(,.*?)?\\](.*?)(?=$|\\[[_A-Z])", "g");

  // because firefox cannot handle the "s" tag, encode all newlines
  // as a unit seperator ASCII code 1f (decimal: 31)
  contents = contents.replace(/\n/g, "\u001f");

  contents = contents.replace(regEx, function (page, questID, questArgs, questText) {
    //console.log("page: ", page, "\nd: ", d, "\ny: ", questID, "\nz: ", questText);

    // questText = questText.replace(/\/\*[\s\S]+\*\//g, "");
    // questText = questText.replace(/\/\/.*\n/g, "");
    questText = questText.replace(/\u001f/g, "\n");
    questText = questText.replace(/\n/g, "<br>");
    questText = questText.replace(/\[_#\]/g, "");
    let counter = 1;
    questText = questText.replace(/\[\]/g, function (x) {
      let t = "[" + counter.toString() + "]";
      counter = counter + 1;
      return t;
    });

    // handle displayif on the question...
    // if questArgs is undefined set it to blank.
    questArgs = questArgs ? questArgs : "";

    // make sure that this is a "displayif"
    var displayifMatch = questArgs.match(/displayif\s*=\s*.*/);
    let endMatch = questArgs.match(/end\s*=\s*(.*)?/);
    // if so, remove the comma and go.  if not, set questArgs to blank...
    if (displayifMatch) {
      questArgs = displayifMatch[0];
    } else if (endMatch) {
      questArgs = endMatch[0];
    } else {
      questArgs = "";
    }

    let target = "";

    let hardBool = questID.endsWith("!");
    let softBool = questID.endsWith("?");
    if (hardBool || softBool) {
      questID = questID.slice(0, -1);
      if (hardBool) {
        target = "data-target='#hardModal'";
      } else {
        target = "data-target='#softModal'";
      }
    }

    let prevButton = (endMatch && endMatch[1]) === "noback" ? "" : "<input type='submit' class='previous' value='BACK'></input>";

    let nextButton = endMatch ? "" : `<input type='submit' class='next' ${target} value='NEXT'></input>`;

    // replace user profile variables...
    questText = questText.replace(/\{\$u:(\w+)}/, (all, varid) => {
      return `<span name='${varid}'>${previousResults[varid]}</span>`;
    });

    // replace {$id} with span tag
    questText = questText.replace(/\{\$(\w+)(?::([^\s]+.*))?\}/g, fID);
    function fID(fullmatch, forId, optional) {
      if (optional == undefined) {
        optional = "";
      } else {
        optional = optional;
      }
      return `<span forId='${forId}' optional='${optional}'>${forId}</span>`;
    }

    //replace |popup|buttonText|Title|text| with a popover
    questText = questText.replace(/\|popup\|([\S][^|]+[\S])\|(?:([\S][^|]+[\S])\|)?([\S][^|]+[\S])\|/g, fPopover);
    function fPopover(fullmatch, buttonText, title, popText) {
      title = title ? title : "";
      return `<a tabindex="0" class="popover-dismiss btn btn" role="button" data-toggle="popover" data-trigger="focus" title="${title}" data-content="${popText}">${buttonText}</a>`;
    }

    // replace |@| with an email input
    questText = questText.replace(/\|@\|((\w+)\|)?/g, fEmail);
    function fEmail(x1, y1, z1) {
      let elId = "";
      if (z1 == undefined) {
        elId = questID + "_email";
      } else {
        elId = z1;
      }
      return `<input type='email' id='${elId}'></input>`;
    }

    // replace __/__/__ with a date input
    questText = questText.replace(/\_\_\/\_\_\/\_\_((\w+)\|)?/g, fDate);
    function fDate(x1, y1, z1) {
      let elId = "";
      if (z1 == undefined) {
        elId = questID + "_date";
      } else {
        elId = z1;
      }
      return `<input type='date' id='${elId}'></input>`;
    }

    // replace (###)-###-#### with phone input

    questText = questText.replace(/\(###\)-###-####((\w+)\|)?/g, fPhone);
    function fPhone(x1, y1, z1) {
      let elId = "";
      if (z1 == undefined) {
        elId = questID + "_phone";
      } else {
        elId = z1;
      }
      return `<input type='tel' name='phone' id='${elId}' pattern='(([0-9]{3})|[0-9]{3})-[0-9]{3}-[0-9]{4}' required></input>`;
    }

    // replace |###-##-####| with SSN input
    questText = questText.replace(
      /\|###-##-####\|/g,
      `<input type='text' id='${questID}_SSN'pattern='[0-9]{3}-[0-9]{2}-[0-9]{4}'placeholder="_ _ _-_ _-_ _ _ _"></input>`
    );

    // replace |####| with SSN input
    questText = questText.replace(
      /\|####\|/g,
      `<input type='text' id='${questID}_SSN_Min'pattern='[0-9]{4}'placeholder="_ _ _ _"></input>`
    );

    // replace |state| with state dropdown
    questText = questText.replace(
      /\|state\|((\w+)\|)?/g,
      `<select id='$2'>
      <option value='' disabled selected>Chose a state: </option>
      <option value='AL'>Alabama</option>
      <option value='AK'>Alaska</option>
      <option value='AZ'>Arizona</option>
      <option value='AR'>Arkansas</option>
      <option value='CA'>California</option>
      <option value='CO'>Colorado</option>
      <option value='CT'>Connecticut</option>
      <option value='DE'>Delaware</option>
      <option value='DC'>District Of Columbia</option>
      <option value='FL'>Florida</option>
      <option value='GA'>Georgia</option>
      <option value='HI'>Hawaii</option>
      <option value='ID'>Idaho</option>
      <option value='IL'>Illinois</option>
      <option value='IN'>Indiana</option>
      <option value='IA'>Iowa</option>
      <option value='KS'>Kansas</option>
      <option value='KY'>Kentucky</option>
      <option value='LA'>Louisiana</option>
      <option value='ME'>Maine</option>
      <option value='MD'>Maryland</option>
      <option value='MA'>Massachusetts</option>
      <option value='MI'>Michigan</option>
      <option value='MN'>Minnesota</option>
      <option value='MS'>Mississippi</option>
      <option value='MO'>Missouri</option>
      <option value='MT'>Montana</option>
      <option value='NE'>Nebraska</option>
      <option value='NV'>Nevada</option>
      <option value='NH'>New Hampshire</option>
      <option value='NJ'>New Jersey</option>
      <option value='NM'>New Mexico</option>
      <option value='NY'>New York</option>
      <option value='NC'>North Carolina</option>
      <option value='ND'>North Dakota</option>
      <option value='OH'>Ohio</option>
      <option value='OK'>Oklahoma</option>
      <option value='OR'>Oregon</option>
      <option value='PA'>Pennsylvania</option>
      <option value='RI'>Rhode Island</option>
      <option value='SC'>South Carolina</option>
      <option value='SD'>South Dakota</option>
      <option value='TN'>Tennessee</option>
      <option value='TX'>Texas</option>
      <option value='UT'>Utah</option>
      <option value='VT'>Vermont</option>
      <option value='VA'>Virginia</option>
      <option value='WA'>Washington</option>
      <option value='WV'>West Virginia</option>
      <option value='WI'>Wisconsin</option>
      <option value='WY'>Wyoming</option>
    </select>`
    );

    function guaranteeIdSet(options, inputType = "inp") {
      if (options == undefined) {
        options = "";
      }
      options = options.trim();
      let elementId = options.match(/id=([^\s]+)/);
      if (!elementId) {
        elementId = `${questID}_${inputType}`;
        options = `${options} id=${elementId}`;
      } else {
        elementId = elementId[1];
      }
      return { options: options, elementId: elementId };
    }

    // replace |image|URL|height,width| with a html img tag...
    questText = questText.replace(/\|image\|(.*?)\|(?:([0-9]+),([0-9]+)\|)?/g, "<img src=https://$1 height=$2 width=$3>");
    // replace |__|__|  with a number box...
    questText = questText.replace(/\|(?:__\|){2,}(?:([^|]+)\|)?/g, fNum);
    function fNum(fullmatch, opts) {
      // make sure that the element id is set...
      const { options, elementId } = guaranteeIdSet(opts, "num");

      return `<input type='number' name='${questID}' ${options}></input>`;
    }

    // -------------
    // questText = questText.replace(/\_{4,}/g, "<input name='" + questID + "'></input>");
    // -------------

    // replace |__| or [text box:xxx] with an input box...
    //questText = questText.replace(/(?:\[text\s?box(?:\s*:\s*(\w+))?\]|\|__\|(?:(\w+)?\|)?)(?:(.*?)(?:<br>))/g, fText);
    questText = questText.replace(/\[text\s?box(?:\s*:\s*(\w+))?\]/g, fTextBox);
    function fTextBox(fullmatch, option) {
      let elementId = `${questID}_text`;
      if (option != undefined) {
        elementId = option;
      }
      return `<input type='text' name='${questID}' id=${elementId}></input>`;
    }
    questText = questText.replace(/\|(?:__\|)(?:([\S][^|]+[\S])\|)?/g, fText);
    function fText(fullmatch, opts) {
      const { options, elementId } = guaranteeIdSet(opts, "txt");
      return `<input type='text'  name='${questID}' ${options}></input>`;
    }

    // replace |___| with a textarea...
    questText = questText.replace(/\|___\|((\w+)\|)?/g, fTextArea);
    function fTextArea(x1, y1, z1) {
      let elId = "";
      if (z1 == undefined) {
        elId = questID + "_ta";
      } else {
        elId = z1;
      }
      return `<textarea id='${elId}'></textarea>`;
    }
    // replace #YN with Yes No input
    questText = questText.replace(
      /#YN/g,
      `(1) Yes
       (0) No`
    );

    // replace [a-zXX] with a checkbox box...
    // handle CB/radio + TEXT + TEXTBOX + ARROW + Text...
    questText = questText.replace(
      /([\[\(])(\w+)(?::(\w+))?(?:\|([^\|]+?))?[\]\)]([\w\s:]+)?(<input.*?<\/input>)(?:\s*->\s*(\w+))?/g,
      cb1
    );
    function cb1(completeMatch, bracket, cbValue, cbName, cbArgs, labelText, textBox, skipToId) {
      let inputType = bracket == "[" ? "checkbox" : "radio";
      cbArgs = cbArgs ? cbArgs : "";

      // first look in the args for the name [v|name=lala], if not there,
      // look for cbName [v:name], otherwise use the question id.
      let name = cbArgs.match(/name=['"]?(\w+)['"]?/);
      if (!name) {
        name = cbName ? `name="${cbName}"` : `name="${questID}"`;
      }

      let id = cbArgs.match(/id=['"]?(\w+)/);
      // if the user does supply the id in the cbArgs, we add it to.
      // otherwise it is in the cbArgs...
      let forceId = "";
      if (id) {
        id = id[1];
      } else {
        id = cbName ? cbName : `${questID}_${cbValue}`;
        forceId = `id=${id}`;
      }

      let skipTo = skipToId ? `skipTo=${skipToId}` : "";
      let value = cbValue ? `value=${cbValue}` : "";
      let rv = `<div class='response' style='margin-top:15px'><input type='${inputType}' ${forceId} ${name} ${value} ${cbArgs} ${skipTo}></input><label for='${id}'>${labelText}</label>${textBox}</div>`;
      return rv;
    }
    // SAME thing but this time with a textarea...

    // replace (XX) with a radio button...
    questText = questText.replace(/\((\d+)(?:\:(\w+))?(?:\|(\w+))?(?:,(displayif=.+?\)))?\)([^<\n]*)|\(\)/g, fRadio);
    function fRadio(containsGroup, value, name, labelID, condition, label) {
      let displayIf = "";
      if (condition == undefined) {
        displayIf = "";
      } else {
        displayIf = `${condition}`;
      }
      let elVar = "";
      if (name == undefined) {
        elVar = questID;
      } else {
        elVar = name;
      }
      if (labelID == undefined) {
        labelID = `${elVar}_${value}_label`;
      }
      return `<div class='response' style='margin-top:15px' ${displayIf}><input type='radio' name='${elVar}' value='${value}' id='${elVar}_${value}'></input><label id='${labelID}' style='font-weight: normal; padding-left:5px;' for='${elVar}_${value}'>${label}</label></div>`;
    }

    // replace [a-zXX] with a checkbox box...
    questText = questText.replace(/\s*\[(\w*)(?:\:(\w+))?(?:\|(\w+))?(?:,(displayif=.+?))?\]([^<\n]*)|\[\]|\*/g, fCheck);
    function fCheck(containsGroup, value, name, labelID, condition, label) {
      let displayIf = "";
      if (condition == undefined) {
        displayIf = "";
      } else {
        displayIf = `${condition}`;
      }
      let elVar = "";
      if (name == undefined) {
        elVar = questID;
      } else {
        elVar = name;
      }
      if (labelID == undefined) {
        labelID = `${elVar}_${value}_label`;
      }
      return `<div class='response' style='margin-top:15px' ${displayIf}><input type='checkbox' name='${elVar}' value='${value}' id='${elVar}_${value}'></input><label id='${labelID}' style='font-weight: normal; padding-left:5px;' for='${elVar}_${value}'>${label}</label></div>`;
    }

    questText = questText.replace(/\|(displayif=.+?)\|(.*?)\|/g, fDisplayIf);
    function fDisplayIf(containsGroup, condition, text) {
      return `<span ${condition}>${text}</span>`;
    }

    // replace next question  < -> > with hidden...
    questText = questText.replace(
      /<\s*->\s*([A-Z_][A-Z0-9_#]*)\s*>/g,
      "<input type='hidden' id='" + questID + "_default' name='" + questID + "' skipTo=$1 checked>"
    );

    // replace next question  < #NR -> > with hidden...
    questText = questText.replace(
      /<\s*#NR\s*->\s*([A-Z_][A-Z0-9_#]*)\s*>/g,
      "<input type='hidden' class='noresponse' id='" + questID + "_default' name='" + questID + "' skipTo=$1 checked>"
    );

    // handle skips
    questText = questText.replace(
      /<input ([^>]*?)><\/input><label([^>]*?)>([^>]*?)\s*->\s*([^>]*?)<\/label>/g,
      "<input $1 skipTo='$4'></input><label $2>$3</label>"
    );

    let rv = `<form class='question' style='font-weight: bold' id='${questID}' ${questArgs} hardEdit='${hardBool}' softEdit='${softBool}'> ${questText} ${prevButton}\n${nextButton}</form>`;
    return rv;
  });

  // handle the display if case...
  contents = contents.replace(
    /\[DISPLAY IF\s*([A-Z][A-Z0-9+]*)\s*=\s*\(([\w,\s]+)\)\s*\]\s*<div (.*?)>/g,
    "<div $3 showIfId='$1' values='$2'>"
  );

  // add the HTML/HEAD/BODY tags...
  document.getElementById(divId).innerHTML =
    contents +
    `
  <div class="modal" id="softModal" tabindex="-1" role="dialog">
      <div class="modal-dialog" role="document">
          <div class="modal-content">
          <div class="modal-header">
              <h5 class="modal-title">Response Requested</h5>
              <button type="button" class="close" data-dismiss="modal" aria-label="Close">
              <span aria-hidden="true">&times;</span>
              </button>
          </div>
          <div class="modal-body">
              <p>There is 1 unanswered question on this page. Would you like to continue?</p>
          </div>
          <div id="softModalFooter" class="modal-footer">
              <button type="button" class="btn btn-light" data-dismiss="modal">Continue Without Answering</button>
              <button type="button" class="btn btn-light" data-dismiss="modal">Answer the Question</button>
          </div>
          </div>
      </div>
  </div>
  <div class="modal" id="hardModal" tabindex="-1" role="dialog">
      <div class="modal-dialog" role="document">
          <div class="modal-content">
          <div class="modal-header">
              <h5 class="modal-title">Response Required</h5>
              <button type="button" class="close" data-dismiss="modal" aria-label="Close">
              <span aria-hidden="true">&times;</span>
              </button>
          </div>
          <div class="modal-body">
              <p>There is 1 unanswered question on this page. Please answer this question.</p>
          </div>
          <div class="modal-footer">
              <button type="button" class="btn btn-danger" data-dismiss="modal">Answer the Question</button>
          </div>
          </div>
      </div>
  </div>`;

  // if (obj.url && obj.url.split("&").includes("run")) {
  //   if (document.querySelector(".question") != null) {
  //     document.querySelector(".question").classList.add("active");
  //   }
  // }

  function setActive(id) {
    let active = document.getElementById(id);
    if (!active) return;

    // remove active from all questions...
    Array.from(divElement.getElementsByClassName("active")).forEach((element) => {
      console.log(`removing active from ${element.id}`);
      element.classList.remove("active");
    });
    // make the id active...
    console.log(`setting ${id} active`);
    document.getElementById(id).classList.add("active");
  }

  // If a user starts a module takes a break
  // and comes back...  get the tree out of the
  // local forage if it exists and fill out
  // the forms.  This functionality is needed
  // for the back/next functionality.
  async function fillForm(retrieve) {
    let questObj = {};
    let tempObj = {};

    console.log("in fillForm... ret fun:", retrieve);

    // get the tree from localforage...
    await localforage.getItem(questName + ".treeJSON").then((tree) => {
      // if this is the first time the user attempt
      // the questionnaire, the tree will not be in
      // the localForage...
      if (tree) {
        questionQueue.loadFromVanillaObject(tree);
      }
      console.log(`the current node is ${questionQueue.currentNode.value}`);
      setActive(questionQueue.currentNode.value);
    });

    if (retrieve) {
      const response = await retrieve();
      if (response.code === 200) {
        const userData = response.data;
        console.log(userData);
        if (userData[questName]) {
          questObj = userData[questName];
        }
      }
    } else {
      // a retrieve function is not defined use
      // the default which pull the values out of
      // localforage...
      await retrieveFromLocalForage(questName);
    }
  }
  function resetTree() {
    // make the appropriate question active...
    // don't bother if there are no questions...
    if (questions.length > 0) {
      let currentId = questionQueue.currentNode.value;
      let currentQuestion = divElement.querySelector(`[id=${currentId}]`);
      console.log("currentId", currentId);
      if (currentId) {
        console.log(` ==============>>>>  setting ${currentId} active`);
        setActive(currentId);
      } else {
        console.log(` ==============>>>>  setting the first question ${questions[0].id} active`);

        // if the tree is empty add the first question to the tree...
        // and make it active...
        questionQueue.add(questions[0].id);
        questionQueue.next();
        setActive(questions[0].id);
      }
    }
  }
  let questions = [...document.getElementsByClassName("question")];
  let divElement = document.getElementById(divId);

  // wait for the objects to be retrieved,
  // then reset the tree.
  fillForm(obj.retrieve).then(resetTree());

  if (questions.length > 0) {
    let buttonToRemove = questions[0].querySelector(".previous");
    if (buttonToRemove) {
      buttonToRemove.remove();
    }
    buttonToRemove = [...questions].pop().querySelector(".next");
    if (buttonToRemove) {
      buttonToRemove.remove();
    }
  }

  questions.forEach((question) => {
    question.onsubmit = stopSubmit;
  });

  let textInputs = [...divElement.querySelectorAll("input[type='text'],textarea")];
  textInputs.forEach((inputElement) => {
    inputElement.oninput = textBoxInput;
  });

  let rbCb = [...divElement.querySelectorAll("input[type='radio'],input[type='checkbox'] ")];
  rbCb.forEach((rcElement) => {
    rcElement.onchange = rbAndCbClick;
  });

  let numberInputs = [...divElement.querySelectorAll("input[type='number']")];
  numberInputs.forEach((inputElement) => {
    inputElement.oninput = numberInput;
  });

  $(".popover-dismiss").popover({
    trigger: "focus",
  });

  moduleParams.questName = questName;
  return true;
};

transform.tout = function (fun, tt = 500) {
  if (transform.tout.t) {
    clearTimeout(transform.tout.t);
  }
  transform.tout.t = setTimeout(fun, tt);
};

function unrollLoops(txt) {
  // all the questions in the loops...
  // each element in res is a loop in the questionnaire...
  let loopRegex = /<loop max=(\d+)\s*>(.*?)<\/loop>/gm;
  txt = txt.replace(/\n/g, "\xa9");
  let res = [...txt.matchAll(loopRegex)].map(function (x, indx) {
    return { cnt: x[1], txt: x[2], indx: indx + 1, orig: x[0] };
  });

  let idRegex = /\[([A-Z_][A-Z0-9_#]*)[?!]?(,.*?)?\]/gm;
  let disIfRegex = /displayif=.*?\(([A-Z_][A-Z0-9_#]*),.*?\)/g;
  // we have an array of objects holding the text..
  // get all the ids...
  let cleanedText = res.map(function (x) {
    x.txt += "[_CONTINUE" + x.indx + ",displayif=setFalse(-1,#loop)]";
    x.txt = x.txt.replace(/->\s*_CONTINUE\b/g, "-> _CONTINUE" + x.indx);
    let ids = [...x.txt.matchAll(idRegex)].map((y) => ({
      label: y[0],
      id: y[1],
      indx: x.indx,
    }));
    let disIfIDs = [...x.txt.matchAll(disIfRegex)].map((disIfID) => ({
      label: disIfID[0],
      id: disIfID[1],
    }));
    disIfIDs = disIfIDs.map((x) => x.id);
    let newIds = ids.map((x) => x.id);

    // goto from 1-> max for human consumption... need <=
    let loopText = "";
    for (var loopIndx = 1; loopIndx <= x.cnt; loopIndx++) {
      var currentText = x.txt;
      // replace all instances of the question ids with id_#
      ids.map((id) => (currentText = currentText.replace(new RegExp("\\b" + id.id + "\\b", "g"), `${id.id}_${loopIndx}`)));
      ids.map((id) => (currentText = currentText.replace(new RegExp("\\b" + id.id + "_", "g"), `${id.id}_${loopIndx}_`)));
      // ids.map((id) => (currentText = currentText.replace(id.label, id.label.replace(id.id, id.id + "_" + loopIndx))));

      // disIfIDs = disIfIDs.filter((x) => newIds.includes(x));
      // disIfIDs.map((id) => (currentText = currentText.replace(new RegExp(id + "\\b", "g"), id + "_" + loopIndx)));

      // // replace all -> Id with -> Id_#
      // ids.map(
      //   (id) => (currentText = currentText.replace(new RegExp("->\\s*" + id.id + "\\b", "g"), "-> " + id.id + "_" + loopIndx))
      // );

      // // replace all |__(|__)|xxxx|  xxxx= id=questionid_xxx xor=questionid
      // // |__|id=lalala_3_txt xor=lalala_3|  |xor= lalala id=lalala_txt|
      // ids.map((id) => (currentText = currentText.replace(/(\|__(?:\|__)*\|[^|\s][^|]\b)(${id.id})(\b[^|]*\|)/g, `$1$2_${loopIndx}$3`)));

      ids.map((id) => (currentText = currentText.replace(/#loop/g, "" + loopIndx)));

      // if (currentText.search(/->\s*_continue/g) >= 0) {
      //   ;
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
  txt = txt.replace(/\xa9/g, "\n");
  return txt;
}

export function stopSubmit(event) {
  event.preventDefault();
  console.log(event.target.id);

  if (event.submitter.value == "BACK") {
    previousClicked(event.submitter, moduleParams.renderObj.retrieve);
  } else {
    nextClick(event.submitter, moduleParams.renderObj.store);
  }
}
