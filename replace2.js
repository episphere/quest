import { questionQueue, nextClick, previousClicked, moduleParams, rbAndCbClick, textBoxInput, handleXOR, displayQuestion, parseSSN, parsePhoneNumber, submitQuestionnaire, textboxinput, math, radioAndCheckboxUpdate } from "./questionnaire.js";
import { restoreResults } from "./localforageDAO.js";
import { parseGrid, grid_replace_regex } from "./buildGrid.js";
import { clearValidationError } from "./validate.js";
import { responseRequestedModal, responseRequiredModal, responseErrorModal, submitModal  } from "./common.js";

import en from "./i18n/en.json" with {type: 'json'};
import es from "./i18n/es.json" with {type: 'json'};



export let transform = function () {
  // init
};
transform.rbAndCbClick = rbAndCbClick

let questName = "Questionnaire";
let rootElement;

let paramSplit = (str) =>
  [...str.matchAll(/(\w+)=(\s?.+?)\s*(?=\w+=|$)/gm)].reduce((pv, cv) => {
    pv[cv[1]] = encodeURIComponent(cv[2]);
    return pv
  }, {})

let reduceObj = (obj) => {
  //replace options with split values (uri encoded)
  return Object.entries(obj).reduce((pv, cv) => {
    return pv += ` ${cv[0]}=${cv[1]}`
  }, "").trim()
}

transform.render = async (obj, divId, previousResults = {}) => {
  
  moduleParams.renderObj = obj;
  moduleParams.previousResults = previousResults;
  moduleParams.soccer = obj.soccer;
  moduleParams.i18n = obj.lang === 'es' ? es : en;

  rootElement = divId;
  let contents = "";

  // allow the client to reset the tree...

  if (obj.text) contents = obj.text;

  if (obj.url) {
    contents = await (await fetch(obj.url)).text();
    moduleParams.config = contents
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
  // first... build grids...
  contents = contents.replace(grid_replace_regex, parseGrid);

  // then we must unroll the loops...

  contents = unrollLoops(contents);

  // #issue 378, note: getMonth 0=Jan,  need to add 1
  // months

  contents = contents.replace(/#currentMonthStr/g, 
  [
    moduleParams.i18n.januaryShort,
    moduleParams.i18n.februaryShort,
    moduleParams.i18n.marchShort,
    moduleParams.i18n.aprilShort,
    moduleParams.i18n.mayShort,
    moduleParams.i18n.juneShort,
    moduleParams.i18n.julyShort,
    moduleParams.i18n.augustShort,
    moduleParams.i18n.septemberShort,
    moduleParams.i18n.octoberShort,
    moduleParams.i18n.novemberShort,
    moduleParams.i18n.decemberShort
  ][new Date().getMonth()]);

  let current_date = new Date()
  Date.prototype.toQuestFormat = function () { return `${this.getFullYear()}-${this.getMonth() + 1}-${this.getDate()}` }
  contents = contents.replace(/#currentMonth/g, current_date.getMonth() + 1);
  contents = contents.replace(/#currentYear/g, current_date.getFullYear());
  // issue #405 need #today and today+/- n days...
  contents = contents.replace(/#today(\s*[+\-]\s*\d+)?/g, function (match, offset) {
    // if no (+/- offset) we want today...
    if (!offset || offset.trim().length == 0) {
      return current_date.toQuestFormat()
    }

    // otherwise +/- the offset in number of days...
    offset = parseInt(offset.replace(/\s/g, ""));
    let offset_date = new Date()
    offset_date.setDate(offset_date.getDate() + offset)
    return offset_date.toQuestFormat()
  })

  // questionnarie 

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
    questName = "Questionnaire";
    moduleParams.questName = questName;
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
    "\\[([A-Z_][A-Z0-9_#]*[\\?\\!]?)(?:\\|([^,\\|\\]]+)\\|?)?(,.*?)?\\](.*?)(?=$|\\[[_A-Z]|<form)",
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
    questOpts = questOpts.replaceAll(/(min|max)-count\s*=\s*(\d+)/g,'data-$1-count=$2')

    // handle displayif on the question...
    // if questArgs is undefined set it to blank.
    questArgs = questArgs ? questArgs : "";

    // make sure that this is a "displayif"
    var displayifMatch = questArgs.match(/displayif\s*=\s*.*/);
    let endMatch = questArgs.match(/end\s*=\s*(.*)?/);
    // if so, remove the comma and go.  if not, set questArgs to blank...
    if (displayifMatch) {
      questArgs = displayifMatch[0];
      questArgs = `displayif=${encodeURIComponent(displayifMatch[0].slice(displayifMatch[0].indexOf('=') + 1))}`
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

    let prevButton = (endMatch && endMatch[1]) === "noback"
      ? ""
      : `<input type='submit' class='previous w-100' data-clicktype='back' ${questID === 'END' ? `id='lastBackButton'` : ""} value='${moduleParams.i18n.backButton}'></input>`;

    let resetButton = questID === 'END'
      ? `<input type='submit' class='reset w-100' data-clicktype='submit' id='submitButton' value='${moduleParams.i18n.submitSurveyButton}'></input>`
      : `<input type='submit' class='reset w-100' data-clicktype='reset' value='${moduleParams.i18n.resetAnswerButton}'></input>`;

    let nextButton = endMatch
      ? ""
      : `<input type='submit' class='next w-100' data-clicktype='next' ${target} value=${moduleParams.i18n.nextButton}></input>`;

    // replace user profile variables...
    questText = questText.replace(/\{\$u:(\w+)}/g, (all, varid) => {
      return `<span name='${varid}'>${math._value(varid)}</span>`;
    });

    // replace {$id} with span tag
    questText = questText.replace(/\{\$(\w+(?:\.\w+)?):?([a-zA-Z0-9 ,.!?"-]*)\}/g, fID);
    function fID(fullmatch, forId, optional) {
      if (optional == undefined) {
        optional = "";
      } else {
        optional = optional;
      }
      return `<span forId='${forId}' optional='${optional}'>${forId}</span>`;
    }
    // replace {#id} with span tag
    questText=questText.replace(/\{\#([^}#]+)\}/g,fHash)
    function fHash(fullmatch,expr){
      return `<span data-encoded-expression=${encodeURIComponent(expr)}>${expr}</span>`
    }


    //adding displayif with nested questions. nested display if uses !| to |!
    questText = questText.replace(/!\|(displayif=.+?)\|(.*?)\|!/g, fDisplayIf);
    function fDisplayIf(containsGroup, condition, text) {
      text = text.replace(/\|(?:__\|){2,}(?:([^\|\<]+[^\|]+)\|)?/g, fNum);
      text = text.replace(/\|popup\|([^|]+)\|(?:([^|]+)\|)?([^|]+)\|/g, fPopover);
      text = text.replace(/\|@\|(?:([^\|\<]+[^\|]+)\|)?/g, fEmail);
      text = text.replace(/\|date\|(?:([^\|\<]+[^\|]+)\|)?/g, fDate);
      text = text.replace(/\|tel\|(?:([^\|\<]+[^\|]+)\|)?/g, fPhone);
      text = text.replace(/\|SSN\|(?:([^\|\<]+[^\|]+)\|)?/g, fSSN);
      text = text.replace(/\|state\|(?:([^\|\<]+[^\|]+)\|)?/g, fState);
      text = text.replace(/\((\d*)(?:\:(\w+))?(?:\|(\w+))?(?:,(displayif=.+\))?)?\)(.*?)(?=(?:\(\d)|\n|<br>|$)/g, fRadio);
      text = text.replace(/\[(\d*)(\*)?(?:\:(\w+))?(?:\|(\w+))?(?:,(displayif=.+?\))?)?\]\s*(.*?)\s*(?=(?:\[\d)|\n|<br>|$)/g, fCheck);
      text = text.replace(/\[text\s?box(?:\s*:\s*(\w+))?\]/g, fTextBox);
      text = text.replace(/\|(?:__\|)(?:([^\s<][^|<]+[^\s<])\|)?\s*(.*?)/g, fText);
      text = text.replace(/\|___\|((\w+)\|)?/g, fTextArea);
      text = text.replace(/\|time\|(?:([^\|\<]+[^\|]+)\|)?/g, fTime);
      text = text.replace(/#YNP/g, translate('yesNoPrefer')); //check
      text = questText.replace(/#YN/g, translate('yesNo')); //check

      return `<span class='displayif' ${condition}>${text}</span>`;
    }

    //replace |popup|buttonText|Title|text| with a popover
    questText = questText.replace(
      /\|popup\|([^|]+)\|(?:([^|]+)\|)?([^|]+)\|/g,
      fPopover
    );
    function fPopover(fullmatch, buttonText, title, popText) {
      title = title ? title : "";
      popText = popText.replace(/"/g, "&quot;")
      return `<a tabindex="0" class="popover-dismiss btn" role="button" title="${title}" data-toggle="popover" data-bs-toggle="popover" data-trigger="focus" data-bs-trigger="focus" data-content="${popText}" data-bs-content="${popText}">${buttonText}</a>`;
    }

    // replace |hidden|value| 
    questText = questText.replace(/\|hidden\|\s*id\s*=\s*([^\|]+)\|?/g, fHide);
    function fHide(fullmatch, id) {
      return `<input type="text" data-hidden=true id=${id}>`
    }

    // replace |@| with an email input
    questText = questText.replace(/\|@\|(?:([^\|\<]+[^\|]+)\|)?/g, fEmail);
    function fEmail(fullmatch, opts) {
      const { options, elementId } = guaranteeIdSet(opts, "email");
      return `<input type='email' ${options} placeholder="user@example.com"></input>`;
    }

    // replace |date| with a date input
    questText = questText.replace(/\|date\|(?:([^\|\<]+[^\|]+)\|)?/g, fDate);
    questText = questText.replace(/\|month\|(?:([^\|]+)\|)?/g, fDate);
    function fDate(fullmatch, opts) {
      let type = fullmatch.match(/[^|]+/)
      let { options, elementId } = guaranteeIdSet(opts, type);
      let optionObj = paramSplit(options)
      // can't have the value uri encoded... 
      if (optionObj.hasOwnProperty("value")) {
        optionObj.value = decodeURIComponent(optionObj.value)
      }

      options = reduceObj(optionObj)
      // not sure why we need a data-min-date but allow it to be evaluateable.
      //      if (optionObj.hasOwnProperty("min") && !isNaN(Date.parse(optionObj.min)) ) {
      if (optionObj.hasOwnProperty("min")) {
        options = options + ` data-min-date-uneval=${optionObj.min}`
      }
      if (optionObj.hasOwnProperty("max")) {
        options = options + `  data-max-date-uneval=${optionObj.max}`
      }
      return `<input type='${type}' ${options} lang="es"></input>`;
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
        <option value='' disabled selected>${moduleParams.i18n.chooseState}: </option>
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

    questText = questText.replace(/<br>/g, "<br>\n");

    // replace (XX) with a radio button...

    // buttons can have a displayif that contains recursive
    // parentheses.  Regex in JS currently does not support
    // recursive pattern matching.  So, I look for the start
    // of the radio button, a left parenthesis, with a digit
    // along with other optional arguments.  the handleButton
    // function returns the entire string that gets matched, 
    // similar to string.replace
    function handleButton(match) {
      let value = match[1];
      let radioElementName = !!match[2] ? match[2] : questID;
      let labelID = !!match[3] ? match[3] : `${radioElementName}_${value}_label`;

      // finds real end
      let cnt = 0;
      let end = 0;
      for (let i = match.index; i < match.input.length; i++) {
        if (match.input[i] == "(") cnt++;
        if (match.input[i] == ")") cnt--;
        if (match.input[i] == "\n") break;

        end = i + 1;
        if (cnt == 0) break;
      }

      // need to have the displayif=... in the variable display_if otherwise if
      // you have displayif={displayif} displayif will be false if empty.
      let radioButtonMetaData = match.input.substring(match.index, end);
      let display_if = !!match[4] ? radioButtonMetaData.substring(radioButtonMetaData.indexOf(match[4]), radioButtonMetaData.length - 1).trim() : "";
      display_if = (!!display_if) ? `displayif=${encodeURIComponent(display_if)}` : ""
      let label_end = match.input.substring(end).search(/\n|(?:<br>|$)/) + end;
      let label = match.input.substring(end, label_end);
      let replacement = `<div class='response' ${display_if}><input type='radio' name='${radioElementName}' value='${value}' id='${radioElementName}_${value}'></input><label id='${labelID}' for='${radioElementName}_${value}'>${label}</label></div>`;

      return match.input.substring(0, match.index) + replacement + match.input.substring(label_end);
    }
    /*
      \((\d+)       Required: (value
      (?:\:(\w+))?  an optional :name for the input
      (?:\|(\w+))?  an optional |label
      (?:,displayif=([^)]*))?  an optional display if.. up to the first close parenthesis
      (\s*\))     Required: close paren with optional space in front.
    */
    let buttonRegex = /\((\d+)(?:\:(\w+))?(?:\|(\w+))?(?:,displayif=([^)]*))?(\s*\))/;
    for (let match = questText.match(buttonRegex); !!match; match = questText.match(buttonRegex)) {
      questText = handleButton(match);
    }

    // replace [XX] with checkbox
    // The "displayif" is reading beyond the end of the pattern ( displayif=.... )
    // let cbRegEx = new RegExp(''
    //   + /\[(d*)(\*)?(?:\:(\w+))?/.source              // (digits with a potential * and :name
    //   + /(?:\|(\w+))?/.source                         // an optional id for the label
    //   + /(?:,(displayif=.+?\))?)?/.source             // an optional displayif
    //   + /\]\s*(.*?)\s*(?=(?:\[\d)|\n|<br>|$)/         // go to the end of the line or next [
    // )
    //questText = questText.replace(cbRegEx, fCheck)
    questText = questText.replace(
      /\[(\d*)(\*)?(?:\:(\w+))?(?:\|(\w+))?(?:,(displayif\s*=\s*.+?\)\s*)?)?\]\s*(.*?)\s*(?=(?:\[\d)|\n|<br>|$)/g,
      fCheck
    );
    function fCheck(containsGroup, value, noneOfTheOthers, name, labelID, condition, label) {
      let displayIf = "";
      let clearValues = noneOfTheOthers ? "data-reset=true" : "";
      if (condition == undefined) {
        displayIf = "";
      } else {
        displayIf = `displayif=${encodeURIComponent(condition.slice(condition.indexOf('=') + 1))}`;
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
      return `<div class='response' ${displayIf}><input type='checkbox' name='${elVar}' value='${value}' id='${elVar}_${value}' ${clearValues}></input><label id='${labelID}' for='${elVar}_${value}'>${label}</label></div>`;
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

      let value = questText.startsWith('<br>') ? questText.split('<br>')[0] : ''

      // make sure that the element id is set...
      let { options, elementId } = guaranteeIdSet(opts, "num");

      options = options.replaceAll('\"', "\'");
      //instead of replacing max and min with data-min and data-max, they need to be added, as the up down buttons are needed for input type number
      let optionObj = paramSplit(options)

      //replace options with split values (uri encoded)
      options = reduceObj(optionObj)

      if (optionObj.hasOwnProperty("min")) {
        options = options + ` data-min="${optionObj.min}"`
      }
      if (optionObj.hasOwnProperty("max")) {
        options = options + ` data-max="${optionObj.max}"`
      }
      //onkeypress forces whole numbers
      return `<input type='number' aria-label='${value}' step='any' onkeypress='return (event.charCode == 8 || event.charCode == 0 || event.charCode == 13) ? null : event.charCode >= 48 && event.charCode <= 57' name='${questID}' ${options} ></input>`;
    }

    // replace |__| or [text box:xxx] with an input box...
    questText = questText.replace(/\[text\s?box(?:\s*:\s*(\w+))?\]/g, fTextBox);
    function fTextBox(fullmatch, options) {
      let id = options ? options : `${questID}_text`;
      return `|__|id=${id} name=${questID}|`;
    }


    questText = questText.replace(
      // /\|(?:__\|)(?:([^\s<][^|<]+[^\s<])\|)?\s*(.*)?/g,
      /(.*)?\|(?:__\|)(?:([^\s<][^|<]+[^\s<])\|)?(.*)?/g,
      fText
    );

    function fText(fullmatch, value1, opts, value2) {
      let { options, elementId } = guaranteeIdSet(opts, "txt");
      options = options.replaceAll(/(min|max)len\s*=\s*(\d+)/g,'data-$1len=$2')
      // if value1 or 2 contains an apostrophe, convert it to
      // and html entity.  This may need to be preformed in other parts
      // the code. As it turns out.  This causes a problem.  Only change the values in the aria-label.
      // if you have (1) xx |__| text with  ' in it.
      // then the apostrophe is put in the aria-label screwing up the rendering 
      // value1 = value1?.replace(/'/g, "&apos;")
      // value2 = value2?.replace(/'/g, "&apos;")

      // this is really ugly..  What is going on here?
      if (value1 && value1.includes('div')) return `${value1}<input type='text' aria-label='${value1.split('>').pop().replace(/'/g, "&apos;")}'name='${questID}' ${options}></input>${value2}`
      if (value1 && value2) return `<span>${value1}</span><input type='text' aria-label='${value1.replace(/'/g, "&apos;")} ${value2.replace(/'/g, "&apos;")}' name='${questID}' ${options}></input><span>${value2}</span>`;
      if (value1) return `<span>${value1}</span><input type='text' aria-label='${value1.replace(/'/g, "&apos;")}' name='${questID}' ${options}></input>`;
      if (value2) return `<input type='text' aria-label='${value2.replace(/'/g, "&apos;")}' name='${questID}' ${options}></input><span>${value2}</span>`;

      return `<input type='text' aria-label='${questText.split('<br>')[0]}' name='${questID}' ${options}></input>`;
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

      return `<textarea id='${elId}' ${options} style="resize:auto;"></textarea>`;
    }

    //check
    // replace #YNP with Yes No input
    questText = questText.replace(
      /#YNP/g, 
        `<div class='response'>
          <input type='radio' id="${questID}_1" name="${questID}" value="yes"></input>
          <label for='${questID}_1'>${moduleParams.i18n.yes}</label>
        </div>
        
        <div class='response'>
          <input type='radio' id="${questID}_0" name="${questID}" value="no"></input>
          <label for='${questID}_0'>${moduleParams.i18n.no}</label>
        </div>
        
        <div class='response'>
          <input type='radio' id="${questID}_99" name="${questID}" value="prefer not to answer"></input>
          <label for='${questID}_99'>${moduleParams.i18n.preferNotToAnswer}</label>
        </div>`
    );

    //check
    // replace #YN with Yes No input
    questText = questText.replace(
      /#YN/g, 
        `<div class='response'>
          <input type='radio' id="${questID}_1" name="${questID}" value="yes"></input>
          <label for='${questID}_1'>Yes</label>
        </div>
        <div class='response'>
          <input type='radio' id="${questID}_0" name="${questID}" value="no"></input>
          <label for='${questID}_0'>No</label>
        </div>`
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
      let rv = `<div class='response'><input type='${inputType}' ${forceId} ${name} ${value} ${cbArgs} ${skipTo}></input><label for='${id}'>${labelText}${textBox}</label></div>`;
      return rv;
    }
    // SAME thing but this time with a textarea...


    //displayif with just texts
    // the : changes the standard span to a div.
    questText = questText.replace(/\|displayif=(.+?)(:)?\|(.*?)\|/g, fDisplayIf);
    function fDisplayIf(containsGroup, condition, nl, text) {
      condition = condition.replaceAll('\"', "\'");
      let tag = (nl) ? "div" : "span"
      return `<${tag} class='displayif' displayif="${condition}">${text}</${tag}>`;
    }

    //displaylist...
    questText = questText.replace(/\|(displayList\(.+?\))\s*(:)?\|/g, fDisplayList);
    function fDisplayList(all,args,nl) {
      args = args.replaceAll('\'', "\"");
      let tag = (nl) ? "div" : "span"
      return `<${tag} class='displayList' data-displayList-args='${args}'>${args}</${tag}>`;
    }

    // replace next question  < -> > with hidden...
    questText = questText.replace(
      /<\s*(?:\|if\s*=\s*([^|]+)\|)?\s*->\s*([A-Z_][A-Z0-9_#]*)\s*>/g,
      fHidden
    );
    function fHidden(containsGroup, ifArgs, skipTo) {
      ifArgs = ifArgs == undefined ? "" : ` if=${encodeURIComponent(ifArgs)}`;
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
      //      /<input ([^>]*?)><\/input><label([^>]*?)>(.*?)\s*->\s*([^>]*?)<\/label>/g,
      /<input ([^>]*?)><\/input><label([^>]*?)>(.*?)\s*->\s*([^<\s]*?)\s*<\/label>/g,
      "<input $1 skipTo='$4'></input><label $2>$3</label>"
    );
    questText = questText.replace(
      /<textarea ([^>]*)><\/textarea>\s*->\s*([^\s<]+)/g,
      "<textarea $1 skipTo=$2></textarea>"
    );
    questText = questText.replace(/<\/div><br>/g, "</div>");

    // If reset is needed only for radio buttons then uncomment out the next lines

    if (!questText.includes('input') && (questID !== 'END')) {
      resetButton = '';
    }


    let rv = `<form class='question' id='${questID}' ${questOpts} ${questArgs} novalidate hardEdit='${hardBool}' softEdit='${softBool}'>${questText}<div>
    <div class="container">
      <div class="row">
        <div class="col-md-3 col-sm-12">
          ${prevButton}
        </div>
        <div class="col-md-6 col-sm-12">
          ${resetButton}
        </div>
        <div class=" col-md-3 col-sm-12">
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
  document.getElementById(divId).innerHTML = contents + responseRequestedModal() + responseRequiredModal() + responseErrorModal() + submitModal();


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

    if (retrieve) {
      const response = await retrieve();
      if (response.code === 200) {
        const userData = response.data;
        console.log("retrieve module name===", moduleParams.questName);
        if (userData[moduleParams.questName]) {
          questObj = userData[moduleParams.questName];
          console.log("questObj===", questObj);
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

  function resetTree() {
    // make the appropriate question active...
    // don't bother if there are no questions...
    if (questions.length > 0) {
      let currentId = questionQueue.currentNode.value;
      console.log("currentId", currentId);
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

  // get the tree from either 1) the client or 2) localforage..
  // either way, we always use the version in LF...
  if (obj.treeJSON) {
    questionQueue.loadFromJSON(obj.treeJSON)
  } else {
    await localforage.getItem(questName + ".treeJSON").then((tree) => {
      // if this is the first time the user attempt
      // the questionnaire, the tree will not be in
      // the localForage...
      if (tree) {
        questionQueue.loadFromVanillaObject(tree);
      } else {
        questionQueue.clear();
      }
      // not sure this is needed.  resetTree set it active...
      setActive(questionQueue.currentNode.value);
    });
  }

  

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
  divElement
    .querySelectorAll("input[type='submit']")
    .forEach((submitButton) => {
      submitButton.addEventListener("click", (event) => {
        event.target.form.clickType = event.target.clickType;
      });
    });

  [...divElement.querySelectorAll("input")].forEach((inputElement) => {
    inputElement.addEventListener("keydown", (event) => {
      if (event.keyCode == 13) {
        event.preventDefault();
      }
    });
  });

  // Firefox does not alway GRAB focus when the arrows are clicked.
  // If a changeEvent fires, grab focus.
  let numberInput = divElement.querySelectorAll("input[type='number']").forEach( (inputElement)=> {
    inputElement.addEventListener("change",(event)=>{
      if (event.target!=document.activeElement) event.target.focus()      
    });
  })

  let textInputs = [
    ...divElement.querySelectorAll(
      "input[type='text'],input[type='number'],input[type='email'],input[type='tel'],input[type='date'],input[type='month'],input[type='time'],textarea,select"
    ),
  ];

  textInputs.forEach((inputElement) => {
    inputElement.onblur = textBoxInput;
    inputElement.setAttribute("style", "size: 20 !important");
  });

  // for each element with an xor, handle the xor on keydown
  Array.from(document.querySelectorAll("[xor]")).forEach(xorElement => {
    xorElement.addEventListener("keydown", () => handleXOR(xorElement));
  })

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
 
  [...divElement.querySelectorAll("[data-hidden]")].forEach((x) => {
    x.style.display = "none";
  });

  // handle text in combobox label...
  [...divElement.querySelectorAll("label input,label textarea")].forEach(inputElement => {
      let radioCB = document.getElementById(inputElement.closest('label').htmlFor) 
      let callback = (event)=>{
          let nchar = event.target.value.length
          //radioCB.checked = nchar>0;
          // select if typed in box, DONT UNSELECT
          if (nchar > 0) radioCB.checked = true
          radioAndCheckboxUpdate(radioCB)
          inputElement.dataset.lastValue=inputElement.value
      }
      inputElement.addEventListener("keyup",callback);
      inputElement.addEventListener("input",callback);
      radioCB.addEventListener("click",(event=>{
          console.log("click")
          if (!radioCB.checked){
              inputElement.dataset.lastValue=inputElement.value
              inputElement.value=''
          }else if ('lastValue' in inputElement.dataset){
              inputElement.value=inputElement.dataset.lastValue
          }
          textboxinput(inputElement)
      }))
  })


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

  resetTree();
  
  if (moduleParams.soccer instanceof Function)
    moduleParams.soccer();
  moduleParams.questName = questName;


  // add an event listener to validate confirm...
  // if the user was lazy and used confirm instead of data-confirm, fix it now
  document.querySelectorAll("[confirm]").forEach( (element) => {
    element.dataset.confirm = element.getAttribute("confirm")
    element.removeAttribute("confirm")
  })
  document.querySelectorAll("[data-confirm]").forEach( (element) => {
    console.log(element.dataset.confirm)
    if (!document.getElementById(element.dataset.confirm)) {
      console.warn(`... cannot confirm ${element.id}. `)      
      delete element.dataset.confirm
    }
    let otherElement = document.getElementById(element.dataset.confirm)
    otherElement.dataset.conformationFor=element.id
  })

  // enable all popovers...
  console.log("...")
  const popoverTriggerList = document.querySelectorAll('[data-bs-toggle="popover"]')
  const popoverList = [...popoverTriggerList].map(popoverTriggerEl => {
    console.log("... ",popoverTriggerEl)
    new bootstrap.Popover(popoverTriggerEl)
  })


  return true;
};

function ordinal(a, lang) {
  
  if (Number.isInteger(a)) {
    if (lang === "es") {
      return `${a}o`;
    }
    else {
      switch (a % 10) {
        case 1: return ((a % 100) == 11 ? `${a}th` : `${a}st`);
        case 2: return ((a % 100) == 12 ? `${a}th` : `${a}nd`);
        case 3: return ((a % 100) == 13 ? `${a}th` : `${a}rd`);
        default: return (`${a}th`)
      } 
    }
  }
  
  return "";
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

    // combobox and radiobuttons may have been renamed...
    let rb_cb_regex = /(?:[\(\[])\d+:(.*?)[\,\)\]]/g

    // goto from 1-> max for human consumption... need <=
    let loopText = "";
    for (var loopIndx = 1; loopIndx <= x.cnt; loopIndx++) {
      var currentText = x.txt;
      // replace all instances of the question ids with id_#
      ids.map(
        (id) =>
        (currentText = currentText.replace(
          new RegExp("\\b" + id.id + "\\b(?!\#)", "g"),
          `${id.id}_${loopIndx}_${loopIndx}`
        ))
      );
      //replace all idsInLoop in the loop with {$id_$loopIndx}
      idsInLoop.forEach(id => {
        currentText = currentText.replace(new RegExp(`\\b${id}\\b`, "g"), `${id}_${loopIndx}_${loopIndx}`);
      })

      //replace all user-named combo and radio boxes
      currentText = currentText.replaceAll(rb_cb_regex,(all,g1)=>all.replace(g1,`${g1}_${loopIndx}`))

      currentText = currentText.replace(/\{##\}/g, `${ordinal(loopIndx, moduleParams.i18n)}`)

      ids.map(
        (id) => (currentText = currentText.replace(/#loop/g, "" + loopIndx))
      );


      // replace  _\d_\d#prev with _{$loopIndex-1}
      // we do it twice to match a previous bug..
      currentText = currentText.replace(/_\d+_\d+#prev/g, `_${loopIndx - 1}_${loopIndx - 1}`)
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

function stopSubmit(event) {
  event.preventDefault();

  switch (event.submitter.dataset.clicktype) {

    case "back":
      resetChildren(event.target.elements);
      event.target.value = undefined;

      let prevButtonClicked = event.target.getElementsByClassName("previous")[0];
      previousClicked(prevButtonClicked, moduleParams.renderObj.retrieve, moduleParams.renderObj.store, rootElement);

      break;

    case "reset":
      resetChildren(event.target.elements);
      event.target.value = undefined;

      break;
    
    case "next":
      let nextButtonClicked = event.target.getElementsByClassName("next")[0];
      nextClick(nextButtonClicked, moduleParams.renderObj.retrieve, moduleParams.renderObj.store, rootElement);

      break;

    case "submit":
      new bootstrap.Modal(document.getElementById('submitModal')).show();

      break;

    default:

  }
}

function resetChildren(nodes) {
  if (nodes == null) {
    return;
  }

  for (let node of nodes) {
    if (node.type === "radio" || node.type === "checkbox") {
      node.checked = false;
    } else if (node.type === "text" || node.type === "time" || node.type === "date" || node.type === "month" || node.type === "number") {
      node.value = "";
      clearValidationError(node)
    }
  }
}