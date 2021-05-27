import {
  questionQueue,
  nextClick,
  previousClicked,
  moduleParams,
  rbAndCbClick,
  textBoxInput,
  // handleXOR, 
  displayQuestion,
  parseSSN,
  parsePhoneNumber,
  submitQuestionnaire,
  evaluateCondition
} from "./questionnaire.js";
import { restoreResults } from "./localforageDAO.js";
import { parseGrid, grid_replace_regex, toggle_grid } from "./buildGrid.js";
export let transform = function () {
  // init
};

const validation = {};
let questName = "Questionnaire";
let rootElement;

// list of sub modules contains the links to the sub modules
let list_of_sub_modules = [];
// current sub module stores the number of the sub module that is currrently being rendered
let current_sub_module = 1;

// total sub modules
let total_sub_modules;
// opened sub module stores the boolean value for each of the sub modules representing whether the sub modules were ever opened
let opened_sub_module;
let contents = "";


transform.render = async (obj, divId, previousResults = {}) => {

  moduleParams.renderObj = obj;
  moduleParams.previousResults = previousResults;
  moduleParams.soccer = obj.soccer;
  rootElement = divId;
  
  let list_of_contents = []
  
  
  let content = ""
  if (obj.text) contents = obj.text;
  if (obj.url) {
    moduleParams.config = await (await fetch(obj.url)).text();


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
    let isSubModule = false;
    try {
      JSON.parse(moduleParams.config);
      isSubModule = true;
    } catch (e) {
      isSubModule = false;
    }
    // not a submodule obj.url
    if (!isSubModule) {
      contents = moduleParams.config;
    } else {

      // populate the list of sub modules with the respective links
      let s = Object.values(JSON.parse(await (await fetch(obj.url)).text()))[1]
      s.forEach(m => list_of_sub_modules.push(Object.values(m)[0]))


      total_sub_modules = list_of_sub_modules.length
      // currently none of the sub modules are open
      opened_sub_module = new Array(total_sub_modules).fill(false)

      let a = Object.values(JSON.parse(await (await fetch(obj.url)).text()))
      // if there is a name for the sub module, populate the questname

      if (a[0].length !== 0) {
        questName = a[0];
        moduleParams.questName = questName;
      }
      let end_vals = []
      // populate the end values for each sub module
      s.forEach(m => end_vals.push(Object.values(m)[1]))
    }

  

  }

  // update the contents and opened_sub_module only if there are sub modules in the list
  if (list_of_sub_modules.length > 0) {
    contents = await get_sub_module(list_of_sub_modules)

    opened_sub_module[current_sub_module-1] = true
  }

  async function get_sub_module(sub_modules) {
    let next_sub_module = sub_modules[current_sub_module-1];
    let content = await (await fetch(next_sub_module)).text();
    return content;
  }

  await replace(divId, obj, contents, current_sub_module, opened_sub_module, previousResults);


  // if you have reached the end of the sub modules, then return true
  if (list_of_sub_modules.length === current_sub_module) return true
  
  
};

export async function replace(divId, obj, contents, curr_sub_module = 0, opened_sub_module, previousResults) {


  

  if (curr_sub_module !== current_sub_module) {
current_sub_module = curr_sub_module
  }


    // get the status of the opened sub modules from the localforage
    moduleParams.opened_sub_module = await localforage.getItem('opened_sub_module')

    // if there is no status of the opened sub modules in the localforage
    if (!moduleParams.opened_sub_module) moduleParams.opened_sub_module = opened_sub_module

  // first... build grids...
  contents = contents.replace(grid_replace_regex, parseGrid);

  // then we must unroll the loops...
  
  contents = unrollLoops(contents);

  contents = contents.replace(/#currentYear/g, new Date().getFullYear());
  // hey, lets de-lint the contents..
  // convert (^|\n{2,}Q1. to [Q1]
  // note:  the first question wont have the
  // \n\n so we need to look at start of string(^)

  contents = contents.replace(/\/\*.*\*\//g, "");
  contents = contents.replace(/\/\/.*/g, "");
  // contents = contents.replace(/\[DISPLAY IF .*\]/gms, "");
  let nameRegex = new RegExp(/{"name":"(\w*)"}/);
  if (nameRegex.test(contents)) {
    contents = contents.replace(/{"name":"(\w*)"}/, fQuestName);
    function fQuestName(group, name) {
      questName = name;
      moduleParams.questName = name;
      return "";
    }
  } else {

    // if there is no questname defined, use 'questionnaire' to store in localforage, else use the existing one
    if (!moduleParams.questName) {
      questName = "Questionnaire";
      moduleParams.questName = questName;
    } else {
      questName = moduleParams.questName
    }
     
  }
  
  // first let's deal with breaking up questions..
  // a question starts with the [ID1] regex pattern
  // and end with the next pattern or the end of string...

  // start with a '['
  // then the first character must be a capital letter
  // followed by zero or more capital letters/digits or an _
  // note: we want this possessive (NOT greedy) so add a ?
  //       otherwise it would match the first and last square bracket

  let regEx = new RegExp(
    "\\[([A-Z_][A-Z0-9_#]*[\\?\\!]?)(?:\\|([^,\\|\\]]+)\\|)?(,.*?)?\\](.*?)(?=$|\\[[_A-Z]|<form)",
    "g"
  );
  
  // because firefox cannot handle the "s" tag, encode all newlines
  // as a unit seperator ASCII code 1f (decimal: 31)
  contents = contents.replace(/(?:\r\n|\r|\n)/g, "\u001f");
  contents = contents.replace(regEx, function (
    page,
    questID,
    questOpts,
    questArgs,
    questText
  ) {
    

    // questText = questText.replace(/\/\*[\s\S]+\*\//g, "");
    // questText = questText.replace(/\/\/.*\n/g, "");
    questText = questText.replace(/\u001f/g, "\n");
    questText = questText.replace(/(?:\r\n|\r|\n)/g, "<br>");
    questText = questText.replace(/\[_#\]/g, "");
    let counter = 1;
    questText = questText.replace(/\[\]/g, function (x) {
      let t = "[" + counter.toString() + "]";
      counter = counter + 1;
      return t;
    });

    //handle options for question
    questOpts = questOpts ? questOpts : "";

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


 

    // if we reach the end of the sub modules, then it is the lastbackbutton
    let prevButton =
      (endMatch && endMatch[1]) === "noback"
        ? ""
        : (questID === 'END' && list_of_sub_modules.length === curr_sub_module) ? "<input type='submit' class='previous' id='lastBackButton' value='BACK'></input>" : "<input type='submit' class='previous' value='BACK'></input>";

    let nextButton = endMatch
      ? ""
      : `<input type='submit' class='next' ${target} value='NEXT'></input>`;


    // if it is a single sub module, or we reach the end of sub modules, then reset button is replaced by 'submit survey' button
    let resetButton = (questID === 'END' && (list_of_sub_modules.length === 0 || list_of_sub_modules.length === curr_sub_module)) ? "<input type='submit' class='reset' id='submitButton' value='Submit Survey'></input>" : "<input type='submit' class='reset' value='RESET ANSWER'></input>";

    

    // replace user profile variables...
    questText = questText.replace(/\{\$u:(\w+)}/g, (all, varid) => {
      return `<span name='${varid}'>${previousResults[varid]}</span>`;
    });

    // replace {$id} with span tag
    questText = questText.replace(/\{\$(\w+):?([a-zA-Z0-9 ,.!?"-]*)\}/g, fID);
    function fID(fullmatch, forId, optional) {
      if (optional == undefined) {
        optional = "";
      } else {
        optional = optional;
      }
      return `<span forId='${forId}' optional='${optional}'>${forId}</span>`;
    }
    //adding displayif with nested questions. nested display if uses !| to |!
    questText = questText.replace(/!\|(displayif=.+?)\|(.*?)\|!/g, fDisplayIf);
    function fDisplayIf(containsGroup, condition, text) {
      text = text.replace(/\|(?:__\|){2,}(?:([^\|\<]+[^\|]+)\|)?/g, fNum);
      text = text.replace(/\|popup\|([\S][^|]+[\S])\|(?:([\S][^|]+[\S])\|)?([\S][^|]+[\S])\|/g, fPopover);
      text = text.replace(/\|@\|(?:([^\|\<]+[^\|]+)\|)?/g, fEmail);
      text = text.replace(/\|date\|(?:([^\|\<]+[^\|]+)\|)?/g, fDate);
      text = text.replace(/\|tel\|(?:([^\|\<]+[^\|]+)\|)?/g, fPhone);
      text = text.replace(/\|SSN\|(?:([^\|\<]+[^\|]+)\|)?/g, fSSN);
      text = text.replace(/\|state\|(?:([^\|\<]+[^\|]+)\|)?/g, fState);
      text = text.replace(/\((\d*)(?:\:(\w+))?(?:\|(\w+))?(?:,(displayif=.+\))?)?\)(.*?)(?=(?:\(\d)|\n|<br>|$)/g, fRadio);
      text = text.replace(/\[(\d*)(?:\:(\w+))?(?:\|(\w+))?(?:,(displayif=.+?\))?)?\]\s*(.*?)\s*(?=(?:\[\d)|\n|<br>|$)/g, fCheck);
      text = text.replace(/\[text\s?box(?:\s*:\s*(\w+))?\]/g, fTextBox);
      text = text.replace(/\|(?:__\|)(?:([^\s<][^|<]+[^\s<])\|)?/g, fText);
      text = text.replace(/\|___\|((\w+)\|)?/g, fTextArea);
      text = text.replace(/\|time\|(?:([^\|\<]+[^\|]+)\|)?/g, fTime);
      text = text.replace(
        /#YNP/g,
        `(1) Yes
         (0) No
         (99) Prefer not to answer`
      );
      text = questText.replace(
        /#YN/g,
        `(1) Yes
         (0) No`
      );
      return `<span class='displayif' ${condition}>${text}</span>`;
    }

    //replace |popup|buttonText|Title|text| with a popover
    questText = questText.replace(
      /\|popup\|([\S][^|]+[\S])\|(?:([\S][^|]+[\S])\|)?([\S][^|]+[\S])\|/g,
      fPopover
    );
    function fPopover(fullmatch, buttonText, title, popText) {
      title = title ? title : "";
      popText = popText.replace(/"/g, "&quot;")
      return `<a tabindex="0" class="popover-dismiss btn btn" role="button" data-toggle="popover" data-trigger="focus" title="${title}" data-content="${popText}">${buttonText}</a>`;
    }

    // replace |@| with an email input
    questText = questText.replace(/\|@\|(?:([^\|\<]+[^\|]+)\|)?/g, fEmail);
    function fEmail(fullmatch, opts) {
      const { options, elementId } = guaranteeIdSet(opts, "email");
      return `<input type='email' ${options} placeholder="user@example.com"></input>`;
    }

    // replace |date| with a date input
    questText = questText.replace(/\|date\|(?:([^\|\<]+[^\|]+)\|)?/g, fDate);
    function fDate(fullmatch, opts) {
      const { options, elementId } = guaranteeIdSet(opts, "date");
      return `<input type='date' ${options}></input>`;
    }

    // replace |tel| with phone input

    questText = questText.replace(/\|tel\|(?:([^\|\<]+[^\|]+)\|)?/g, fPhone);
    function fPhone(fullmatch, opts) {
      const { options, elementId } = guaranteeIdSet(opts, "tel");
      return `<input type='tel' ${options} pattern="[0-9]{3}-?[0-9]{3}-?[0-9]{4}" maxlength="12" placeholder='###-###-####'></input>`;
    }

    // replace |SSN| with SSN input
    questText = questText.replace(/\|SSN\|(?:([^\|\<]+[^\|]+)\|)?/g, fSSN);
    function fSSN(fullmatch, opts) {
      const { options, elementId } = guaranteeIdSet(opts, "SSN");
      return `<input type='text' ${options} id="SSN" class="SSN" inputmode="numeric" maxlength="11" pattern="[0-9]{3}-?[0-9]{2}-?[0-9]{4}"   placeholder="_ _ _-_ _-_ _ _ _"></input>`;
    }



    // replace |SSNsm| with SSN input
    questText = questText.replace(/\|SSNsm\|(?:([^\|\<]+[^\|]+)\|)?/g, fSSNsm);
    function fSSNsm(fullmatch, opts) {
      const { options, elementId } = guaranteeIdSet(opts, "SSNsm");
      return `<input type='text' ${options} class="SSNsm" inputmode="numeric" maxlength="4" pattern='[0-9]{4}'placeholder="_ _ _ _"></input>`;
    }

    // replace |state| with state dropdown
    questText = questText.replace(/\|state\|(?:([^\|\<]+[^\|]+)\|)?/g, fState);
    function fState(fullmatch, opts) {
      const { options, elementId } = guaranteeIdSet(opts, "state");
      return `<select ${options}>
        <option value='' disabled selected>Choose a state: </option>
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
      </select>`;
    }


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
    questText = questText.replace(
      /\|image\|(.*?)\|(?:([0-9]+),([0-9]+)\|)?/g,
      "<img src=https://$1 height=$2 width=$3>"
    );

    //regex to test if there are input as a part of radio or checkboxes
    //    /(\[|\()(\d*)(?:\:(\w+))?(?:\|(\w+))?(?:,(displayif=.+?\))?)?(\)|\])\s*(.*?\|_.*?\|)\s*(?=(?:\[\d)|\n|<br>|$)/g
    var radioCheckboxAndInput = false;
    if (questText.match(/(\[|\()(\d*)(?:\:(\w+))?(?:\|(\w+))?(?:,(displayif=.+?\))?)?(\)|\])\s*(.*?\|_.*?\|)/g)) {
      radioCheckboxAndInput = true;
      questOpts = questOpts + " radioCheckboxAndInput";
    }
    // replace (XX) with a radio button...
    questText = questText.replace(/<br>/g, "<br>\n");
    questText = questText.replace(
      /\((\d*)(?:\:(\w+))?(?:\|(\w+))?(?:,(displayif=.+\))?)?\)(.*?)(?=(?:\(\d*)\)|\n|<br>|$)/g,
      fRadio
    );
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


    // replace [XX] with checkbox
    questText = questText.replace(
      /\[(\d*)(?:\:(\w+))?(?:\|(\w+))?(?:,(displayif=.+?\))?)?\]\s*(.*?)\s*(?=(?:\[\d)|\n|<br>|$)/g,
      fCheck
    );
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

    // replace |time| with a time input
    questText = questText.replace(/\|time\|(?:([^\|\<]+[^\|]+)\|)?/g, fTime);
    function fTime(x, opts) {
      const { options, elementId } = guaranteeIdSet(opts, "time");
      return `<input type='time' ${options}>`;
    }

    // replace |__|__|  with a number box...
    questText = questText.replace(
      /\|(?:__\|){2,}(?:([^\|\<]+[^\|]+)\|)?/g,
      fNum
    );
    function fNum(fullmatch, opts) {
      // make sure that the element id is set...
      let { options, elementId } = guaranteeIdSet(opts, "num");
      let maxRegex = /max(?![(a-z])/g;
      let minRegex = /min(?![(a-z])/g;

      //let maxReplace = evalueateCondition("isDefined(AGE,5)");
      //instead of replacing max and min with data-min and data-max, they need to be added, as the up down buttons are needed for input type number
      let optionList = options.split(" ");
      for (let i = 0; i < optionList.length; i++) {
        let o = optionList[i];
        if (minRegex.test(o)) {

          // let minReplace = o.replace("min=", "");
          // let existingVal = o;
          // if (isNaN(parseInt(minReplace))){   //if the max min values are a method then evaluate it 
          //   let renderedVal = "min="+evaluateCondition(minReplace);
          //   options = options.replace(existingVal, renderedVal);
          //   o=renderedVal;
          // }
          o = o.replace(minRegex, "data-min");
          options = options + " " + o;
        }
        if (maxRegex.test(o)) {
          // let maxReplace = o.replace("max=", "");
          // let existingVal = o;
          // if (isNaN(parseInt(maxReplace))){ //if the max min values are a method then evaluate it 
          //   let renderedVal = "max="+evaluateCondition(maxReplace);
          //   options = options.replace(existingVal, renderedVal);
          //   o=renderedVal;
          // }

          o = o.replace(maxRegex, "data-max");
          options = options + " " + o;
        }
      }
      if (radioCheckboxAndInput) {
        options = options + " disabled ";
      }
      //onkeypress forces whole numbers
      return `<input type='number' step='any' onkeypress='return (event.charCode == 8 || event.charCode == 0 || event.charCode == 13) ? null : event.charCode >= 48 && event.charCode <= 57' name='${questID}' ${options} ></input>`;
    }

    // replace |__| or [text box:xxx] with an input box...
    questText = questText.replace(/\[text\s?box(?:\s*:\s*(\w+))?\]/g, fTextBox);
    function fTextBox(fullmatch, options) {
      let id = options ? options : `${questID}_text`;
      return `|__|id=${id} name=${questID}|`;
    }
    questText = questText.replace(
      /\|(?:__\|)(?:([^\s<][^|<]+[^\s<])\|)?/g,
      fText
    );
    function fText(fullmatch, opts) {
      let { options, elementId } = guaranteeIdSet(opts, "txt");

      if (radioCheckboxAndInput) {
        options = options + " disabled ";
      }
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
      let options = "";
      if (radioCheckboxAndInput) {
        options = options + " disabled ";
      }
      return `<textarea id='${elId}' ${options} style="resize:auto;"></textarea>`;
    }

    // replace #YNP with Yes No input
    questText = questText.replace(
      /#YNP/g, `<div class='response' style='margin-top:15px'><input type='radio' id="${questID}_1" name="${questID}" value="yes"></input><label for='${questID}_1'>Yes</label></div><div class='response' style='margin-top:15px'><input type='radio' id="${questID}_0" name="${questID}" value="no"></input><label for='${questID}_0'>No</label></div><div class='response' style='margin-top:15px'><input type='radio' id="${questID}_99" name="${questID}" value="prefer not to answer"></input><label for='${questID}_99'>Prefer not to answer</label></div>`
      // `(1) Yes
      //  (0) No
      //  (99) Prefer not to answer`
    );

    // replace #YN with Yes No input
    questText = questText.replace(
      /#YN/g,  `<div class='response' style='margin-top:15px'><input type='radio' id="${questID}_1" name="${questID}" value="yes"></input><label for='${questID}_1'>Yes</label></div><div class='response' style='margin-top:15px'><input type='radio' id="${questID}_0" name="${questID}" value="no"></input><label for='${questID}_0'>No</label></div>`
      // `(1) Yes
      //  (0) No`
    );
    // replace [a-zXX] with a checkbox box...
    // handle CB/radio + TEXT + TEXTBOX + ARROW + Text...
    questText = questText.replace(
      /([\[\(])(\w+)(?::(\w+))?(?:\|([^\|]+?))?[\]\)]([^<\n]+)?(<(?:input|textarea).*?<\/(?:input|textarea)>)(?:\s*->\s*(\w+))/g,
      cb1
    );
    function cb1(
      completeMatch,
      bracket,
      cbValue,
      cbName,
      cbArgs,
      labelText,
      textBox,
      skipToId
    ) {
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
      let rv = `<div class='response' style='margin-top:15px'><input type='${inputType}' ${forceId} ${name} ${value} ${cbArgs} ${skipTo}></input><label for='${id}'>${labelText}${textBox}</label></div>`;
      return rv;
    }
    // SAME thing but this time with a textarea...


    //displayif with just texts
    questText = questText.replace(/\|(displayif=.+?)\|(.*?)\|/g, fDisplayIf);
    function fDisplayIf(containsGroup, condition, text) {
      return `<span class='displayif' ${condition}>${text}</span>`;
    }

    // replace next question  < -> > with hidden...
    questText = questText.replace(
      /<\s*(?:\|if\s*=\s*([^|]+)\|)?\s*->\s*([A-Z_][A-Z0-9_#]*)\s*>/g,
      fHidden
    );
    function fHidden(containsGroup, ifArgs, skipTo) {
      ifArgs = ifArgs == undefined ? "" : ` if=${ifArgs}`;
      return `<input type='hidden'${ifArgs} id='${questID}_skipto_${skipTo}' name='${questID}' skipTo=${skipTo} checked>`;
    }

    // replace next question  < #NR -> > with hidden...
    questText = questText.replace(
      /<\s*#NR\s*->\s*([A-Z_][A-Z0-9_#]*)\s*>/g,
      "<input type='hidden' class='noresponse' id='" +
      questID +
      "_NR' name='" +
      questID +
      "' skipTo=$1 checked>"
    );

    // handle skips
    questText = questText.replace(
      /<input ([^>]*?)><\/input><label([^>]*?)>(.*?)\s*->\s*([^>]*?)<\/label>/g,
      "<input $1 skipTo='$4'></input><label $2>$3</label>"
    );
    questText = questText.replace(
      /<textarea ([^>]*)><\/textarea>\s*->\s*([^\s<]+)/g,
      "<textarea $1 skipTo=$2></textarea>"
    );
    questText = questText.replace(/<\/div><br>/g, "</div>");

    // If reset is needed only for radio buttons then uncomment out the next lines

    if (!questText.includes('input') && (questID !== 'END')){
      resetButton = '';
    }

    
    let rv = `<form class='question' id='${questID}' ${questOpts} ${questArgs} novalidate hardEdit='${hardBool}' softEdit='${softBool}'>${questText}<div>
    <div class="container">
      <div class="row">
        <div class="col-lg-5 col-md-3 col-sm-3">
          ${prevButton}
        </div>
        <div class="col-lg-6 col-md-6 col-sm-6">
          ${resetButton}
        </div>
        <div class="col-lg-1 col-md-3 col-sm-3">
          ${nextButton}
        </div>
      </div>
    </div>
    </div><div class="spacePadding"></div></form>`;

    return rv;
  });


  // handle the display if case...
  contents = contents.replace(
    /\[DISPLAY IF\s*([A-Z][A-Z0-9+]*)\s*=\s*\(([\w,\s]+)\)\s*\]\s*<div (.*?)>/g,
    "<div $3 showIfId='$1' values='$2'>"
  );

  //removing random &#x1f; unit separator chars
  contents = contents.replace(//g, "");
  // add the HTML/HEAD/BODY tags...
  document.getElementById(divId).innerHTML =/*html*/
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
          <div id="modalBody" class="modal-body">
              <p id="modalBodyText">There is 1 unanswered question on this page. Would you like to continue?</p>
          </div>
          <div id="softModalFooter" class="modal-footer">
              <button type="button" id=modalContinueButton class="btn btn-light" data-dismiss="modal">Continue Without Answering</button>
              <button type="button" id=modalCloseButton class="btn btn-light" data-dismiss="modal">Answer the Question</button>
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
              <p id="hardModalBodyText">There is 1 unanswered question on this page. Please answer this question.</p>
          </div>
          <div class="modal-footer">
              <button type="button" class="btn btn-danger" data-dismiss="modal">Answer the Question</button>
          </div>
          </div>
      </div>
  </div>
  <div class="modal" id="softModalResponse" tabindex="-1" role="dialog">
      <div class="modal-dialog" role="document">
          <div class="modal-content">
          <div class="modal-header">
              <h5 class="modal-title">Response Requested</h5>
              <button type="button" class="close" data-dismiss="modal" aria-label="Close">
              <span aria-hidden="true">&times;</span>
              </button>
          </div>
          <div id="modalResponseBody" class="modal-body">
              <p>There is an error with this response. Is this correct?</p>
          </div>
          <div id="softModalResponseFooter" class="modal-footer">
              <button type="button" id=modalResponseContinueButton class="btn btn-success" data-dismiss="modal">Correct</button>
              <button type="button" id=modalResponseCloseButton class="btn btn-danger" data-dismiss="modal">Incorrect</button>
          </div>
          </div>
      </div>
  </div>
  
    <div class="modal" id="submitModal" tabindex="-1" role="dialog">
    <div class="modal-dialog" role="document">
        <div class="modal-content">
        <div class="modal-header">
            <h5 class="modal-title">Submit Answers</h5>
            <button type="button" class="close" data-dismiss="modal" aria-label="Close">
            <span aria-hidden="true">&times;</span>
            </button>
        </div>
        <div class="modal-body">
            <p id="submitModalBodyText">Are you sure you want to submit your answers?</p>
        </div>
        <div class="modal-footer">
          <button type="button" id="submitModalButton" class="btn btn-success" data-dismiss="modal">Submit</button>
          <button type="button" id="cancelModal" class="btn btn-danger" data-dismiss="modal">Cancel</button>
        </div>
        </div>
    </div>
  </div>
  `;

  // if (obj.url && obj.url.split("&").includes("run")) {
  //   if (document.querySelector(".question") != null) {
  //     document.querySelector(".question").classList.add("active");
  //   }
  // }

  function setActive(id) {

    let active = document.getElementById(id);

    if (!active) return;

    // remove active from all questions...
    Array.from(divElement.getElementsByClassName("active")).forEach(
      (element) => {
        console.log(`removing active from ${element.id}`);
        element.classList.remove("active");
      }
    );
    // make the id active...
    console.log(`setting ${id} active`);
    displayQuestion(active);
  }

  // If a user starts a module takes a break
  // and comes back...  get the tree out of the
  // local forage if it exists and fill out
  // the forms.  This functionality is needed
  // for the back/next functionality.
  async function fillForm(retrieve) {
    let questObj = {};
    let tempObj = {};

    if (retrieve) {
      const response = await retrieve();
      if (response.code === 200) {
        const userData = response.data;
        

        if (userData[moduleParams.questName]) {
          questObj = userData[moduleParams.questName];
          await restoreResults(questObj);
        }
      }
    } else {
      // a retrieve function is not defined use
      // the default which pull the values out of
      // localforage...
      let results = await localforage.getItem(questName);

      if (results == null) results = {};
      await restoreResults(results);
    }
  }

  async function resetTree() {
    // make the appropriate question active...
    // don't bother if there are no questions...
    if (questions.length > 0) {
      let currentId = questionQueue.currentNode.value;
      let currentQuestion = divElement.querySelector(`[id=${currentId}]`);
      let curr_element = document.getElementById(currentId)

      let status_sub_module = await localforage.getItem("opened_sub_module")
        // if we do not find the next element from the document and we had opened the next sub module earlier(by checking the status of sub module from localforage), then call the next sub module
        if (currentId && !curr_element && status_sub_module && status_sub_module.length > curr_sub_module && status_sub_module[curr_sub_module]) {
        console.log('I am nowhere to be found')
        call_next_sub_module()
        
      }


      async function call_next_sub_module() {
        console.log("call_next_sub_module call_next_sub_module call_next_sub_module")

        // get the link to the next sub module
        let next_sub_module = list_of_sub_modules[curr_sub_module];
        // update the number of sub module currently open
        curr_sub_module++;
        let content = await (await fetch(next_sub_module)).text();
        // fetch the content and call replace with the new content

        await replace(rootElement, obj, content, curr_sub_module)
      }
      if (currentId) {
        console.log(` ==============>>>>  setting ${currentId} active`);
        setActive(currentId);
      } else {
        console.log(
          ` ==============>>>>  setting the first question ${questions[0].id} active`
        );

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
  await fillForm(obj.retrieve);
  // get the tree from localforage...
  await localforage.getItem(questName + ".treeJSON").then((tree) => {
    // if this is the first time the user attempt
    // the questionnaire, the tree will not be in
    // the localForage...
    if (tree) {
      questionQueue.loadFromVanillaObject(tree);
    } else {
      // console.log('isnide ')
      questionQueue.clear();
    }
    // console.log(questionQueue)
    setActive(questionQueue.currentNode.value);
  });

  resetTree();
  // console.log(list_of_sub_modules)
  if (questions.length > 0) {
    let buttonToRemove = questions[0].querySelector(".previous");

    // remove the previous button if it is the first question of the first sub module
    if (buttonToRemove && curr_sub_module === 1) {
      buttonToRemove.remove();
    }
    buttonToRemove = [...questions].pop().querySelector(".next");

    // remove the next button if it is the last question of the last sub module or if its a stand alone module so list_of_sub_modules.length == 0
    if (buttonToRemove && list_of_sub_modules.length <= curr_sub_module) {
      buttonToRemove.remove();
    }
  }



  questions.forEach((question) => {
    question.onsubmit = stopSubmit;
  });
  divElement
    .querySelectorAll("input[type='submit']")
    .forEach((submitButton) => {
      submitButton.addEventListener("click", (event) => {
        event.target.form.clickType = event.target.value;
      });
    });

  [...divElement.querySelectorAll("input")].forEach((inputElement) => {
    inputElement.addEventListener("keydown", (event) => {
      if (event.keyCode == 13) {
        event.preventDefault();
      }
    });
  });

  let textInputs = [
    ...divElement.querySelectorAll(
      "input[type='text'],input[type='number'],input[type='email'],input[type='tel'],input[type='date'],input[type='time'],textarea,select"
    ),
  ];

  textInputs.forEach((inputElement) => {
    // let div = document.createElement("div");
    // let span = document.createElement("span");
    // span.innerText = " ";
    // span.style.height = "inherit";
    // div.appendChild(span);
    // div.style.minHeight = "30px";
    // inputElement.onfocus = handleXOR(inputElement);
    inputElement.onfocusout = textBoxInput;
    inputElement.setAttribute("style", "size: 20 !important");
    // inputElement.insertAdjacentElement("afterend", div);
  });

  let SSNInputs = [...divElement.querySelectorAll(".SSN")];
  SSNInputs.forEach((inputElement) => {
    inputElement.addEventListener("keyup", parseSSN);

  });

  let phoneInputs = [...divElement.querySelectorAll("input[type='tel']")];
  phoneInputs.forEach((inputElement) =>
    inputElement.addEventListener("keyup", parsePhoneNumber)
  );

  let rbCb = [
    ...divElement.querySelectorAll(
      "input[type='radio'],input[type='checkbox'] "
    ),
  ];
  rbCb.forEach((rcElement) => {
    rcElement.onchange = rbAndCbClick;
  });

  [...divElement.querySelectorAll(".grid-input-element")].forEach((x) => {
    x.addEventListener("change", toggle_grid);
  });

  $(".popover-dismiss").popover({
    trigger: "focus",
  });

  // [...document.querySelectorAll(".response")].map((elm) => {
  //   if (elm.nextSibling.tagName == "BR") {
  //     elm.nextSibling.remove();
  //   }
  // });

  document.getElementById("submitModalButton").onclick = () => {
    let lastBackButton = document.getElementById('lastBackButton');
    if (lastBackButton) {
      lastBackButton.remove();
    }
    let submitButton = document.getElementById('submitButton');
    if (submitButton) {
      submitButton.remove();
    }
    submitQuestionnaire(moduleParams.renderObj.store, questName);
  };


  if (moduleParams.soccer instanceof Function )
    moduleParams.soccer();
  // moduleParams.questName = questName;
  return true;
}

function unrollLoops(txt) {
  // all the questions in the loops...
  // each element in res is a loop in the questionnaire...
  let loopRegex = /<loop max=(\d+)\s*>(.*?)<\/loop>/gm;
  txt = txt.replace(/(?:\r\n|\r|\n)/g, "\xa9");
  let res = [...txt.matchAll(loopRegex)].map(function (x, indx) {
    return { cnt: x[1], txt: x[2], indx: indx + 1, orig: x[0] };
  });

  let idRegex = /\[([A-Z_][A-Z0-9_#]*)[?!]?(?:\|([^,\|\]]+)\|)?(,.*?)?\]/gm;
  let disIfRegex = /displayif=.*?\(([A-Z_][A-Z0-9_#]*),.*?\)/g;
  // we have an array of objects holding the text..
  // get all the ids...
  let cleanedText = res.map(function (x) {
    x.txt = x.txt.replace("firstquestion", `loopindx=${x.indx} firstquestion`);
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

    // find all ids defined within the loop,
    // note: textboxes are an outlier that needs
    //       to be fixed.
    let idsInLoop = Array.from(x.txt.matchAll(/\|[\w\s=]*id=(\w+)|___\|\s*(\w+)|textbox:\s*(\w+)/g)).map(x => {
      return x[1] ? x[1] : (x[2] ? x[2] : x[3])
    })


    // goto from 1-> max for human consumption... need <=
    let loopText = "";
    for (var loopIndx = 1; loopIndx <= x.cnt; loopIndx++) {
      var currentText = x.txt;
      // replace all instances of the question ids with id_#
      ids.map(
        (id) =>
        (currentText = currentText.replace(
          new RegExp("\\b" + id.id + "\\b", "g"),
          `${id.id}_${loopIndx}`
        ))
      );
      ids.map(
        (id) =>
        (currentText = currentText.replace(
          new RegExp("\\b" + id.id + "_", "g"),
          `${id.id}_${loopIndx}_`
        ))
      );

      //replace all idsInLoop in the loop with {$id_$loopIndx}
      idsInLoop.forEach(id => {
        currentText = currentText.replace(new RegExp(`${id}`, "g"), `${id}_${loopIndx}`);
      })


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

      ids.map(
        (id) => (currentText = currentText.replace(/#loop/g, "" + loopIndx))
      );

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
    loopText +=
      "[_CONTINUE" + x.indx + "_DONE" + ",displayif=setFalse(-1,#loop)]";
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

  if (event.target.clickType == "BACK") {
    let buttonClicked = event.target.getElementsByClassName("previous")[0];
    previousClicked(buttonClicked, moduleParams.renderObj.retrieve, rootElement, moduleParams.renderObj, moduleParams.previousResults, list_of_sub_modules, current_sub_module, moduleParams.opened_sub_module);
  } else if (event.target.clickType == "RESET ANSWER") {
    resetChildren(event.target.elements);
    event.target.value = undefined;
  } else if (event.target.clickType == "Submit Survey") {
    $("#submitModal").modal("toggle");

  } else {
    let buttonClicked = event.target.getElementsByClassName("next")[0];
    nextClick(buttonClicked, moduleParams.renderObj.store, rootElement, moduleParams.renderObj, moduleParams.previousResults, list_of_sub_modules, current_sub_module, moduleParams.opened_sub_module);
  }
}

function resetChildren(nodes) {
  if (nodes == null) {
    return;
  }

  for (let node of nodes) {
    if (node.type === "radio" || node.type === "checkbox") {
      node.checked = false;
    } else if (node.type === "text" || node.type === "time" || node.type === "date") {
      node.value = "";
    }
  }
}
