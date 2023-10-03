import { displayQuestion, moduleParams, nextClick, 
    parsePhoneNumber, parseSSN, previousClicked,
    questionQueue, rbAndCbClick, submitQuestionnaire, 
    textBoxInput,textboxinput} from "./questionnaire.js";
import { clearValidationError } from "./validate.js";


const buttons = {
    BACK : "BACK",
    RESET : "RESET ANSWER",
    NEXT : "NEXT",
    SUBMIT : "SUBMIT SURVEY"
}
export function renderQuestion(event) {
    let questionObject = {
        questionId: event.detail.question[1],
        editType: event.detail.question[2],
        qOpts: event.detail.question[3],
        content: event.detail.question[4],
        index: event.detail.index,
        length: event.detail.length
    }
    //console.log(questionObject.questionId)

    let formElement = createQuestionForm(questionObject)
    questionObject.formElement = formElement
    // handle soft/hard edits
    if (questionObject.editType){
        formElement.dataset.target=(questionObject.editType=="!")?"#hardModal":"#softModal"
        formElement.setAttribute("hardedit",formElement.dataset.target=="#hardModal")
        formElement.setAttribute("softedit",formElement.dataset.target=="#softModal")
    }
    // handle other qOptions...
    let opts = paramSplit(questionObject.qOpts)
    Object.entries(opts).forEach(([key, value]) => {
        formElement.setAttribute(key,value)
    });

    // add a header div -- remove later...
    let headerElement = document.createElement("div")
    headerElement.innerText = `${questionObject.index}: ${questionObject.questionId}`
    headerElement.classList.add("text-monospace", "border-bottom")
    formElement.insertAdjacentElement("beforeend", headerElement)

    // add a div for the actual markdown
    let markdownElement = document.createElement("div")
    markdownElement.innerHTML = convertMarkdownToHTML(questionObject)
    formElement.insertAdjacentElement("beforeend", markdownElement)

    // add handler for the various input types..
    addHandlers(markdownElement)

    // Add the button at the bottom
    // add a div for the buttons...
    let buttonDiv = document.createElement("div")
    buttonDiv.classList.add("row", "justify-content-between", "mx-3", "px-2")
    let backButton = createButton(buttons.BACK,questionObject)
    let middleButton = ""
    if (questionObject.questionId != "END"){
        middleButton = createButton(buttons.RESET,questionObject)
    }  else {
        middleButton = createButton(buttons.SUBMIT,questionObject)
    }
    let nextButton = createButton(buttons.NEXT,questionObject)
    
    buttonDiv.insertAdjacentElement("beforeend", backButton)
    buttonDiv.insertAdjacentElement("beforeend", middleButton)
    buttonDiv.insertAdjacentElement("beforeend", nextButton)
    formElement.insertAdjacentElement("beforeend", buttonDiv)

    event.target.insertAdjacentElement("beforeend", formElement)

    if (questionQueue.isEmpty()) {
        questionQueue.add(questionObject.questionId)
        questionQueue.next();
    } 
    if (questionQueue.currentNode.value == questionObject.questionId){
        setActive(questionObject.questionId)
        
    }
}

function setActive(id) {
    let active = document.getElementById(id);
    if (!active) return;

    // remove active from all questions...
    document.querySelectorAll("active").forEach(
        (element) => {
            element.classList.remove("active");
        }
    );
    // make the id active...
    displayQuestion(active);
}



export function addModals(questDiv) {
    let modalsHTML = `
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
    `
    questDiv.insertAdjacentHTML("beforeend", modalsHTML)

    document.getElementById("submitModalButton").onclick = (event) => {
        let formElement = questDiv.querySelector(".active")
        if (!formElement) {console.warn("ON SUMBIT: CANNOT GET THE ACTIVE FORM!")}

        let lastBackButton = formElement?.querySelector(`[value='${buttons.BACK}']`)
        if (lastBackButton) {
          lastBackButton.remove();
        }
        let submitButton = formElement?.querySelector(`[value='${buttons.SUBMIT}']`)
        if (submitButton) {
          submitButton.remove();
        }
        submitQuestionnaire(moduleParams.renderObj.store, moduleParams.questName);
      };
}


function guaranteeIdSet(options, inputType = "inp", questID) {
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

function buttonEventListener(event) {
    event.preventDefault()
    if (!event.target.form.classList.contains("active")){
        console.warn(" -- not active question -- ")
        return
    }
    switch (event.target.value) {
        case buttons.BACK:
            previousClicked(event.target, moduleParams.renderObj.retrieve, moduleParams.renderObj.store, moduleParams.rootElement)
            break;
        case buttons.NEXT:
            nextClick(event.target, moduleParams.renderObj.retrieve, moduleParams.renderObj.store, moduleParams.rootElement);
            break;
        case buttons.RESET:
            event.target.form.reset()
            event.target.form.querySelectorAll(".invalid").forEach( invalidElement => (clearValidationError(invalidElement)))
            break;
        case buttons.SUBMIT:
            break;
        default:
            console.warn("unhandled button event", event.target)
    }
}


function createQuestionForm(questionObject) {
    let formElement = document.createElement("form")
    formElement.classList.add("question")
    formElement.id = questionObject.questionId
    // need to add the option
    formElement.dataset.hardEdit = questionObject.editType == "!"
    formElement.dataset.softEdit = questionObject.editType == "?"
    formElement.dataset.qargs = questionObject.qOpts
    formElement.noValidate = true

    return formElement;
}
function createButton(value, question) {


    if ((value == buttons.BACK && question.index == 0) ||
        (value == buttons.NEXT && question.index == (question.length - 1)) ||
//        (value == buttons.RESET && !question.formElement.querySelector("input[type='radio']"))
        (value == buttons.RESET && !question.formElement.querySelector("input")) 
    ) {
        let btnDiv = document.createElement("div")
        btnDiv.classList.add("col")
        return btnDiv
    }

    let btn = document.createElement("input")
    btn.classList.add("mx-3", "col")
    btn.type = "button"
    btn.value = value
    if (value == buttons.SUBMIT){
        btn.dataset.toggle="modal";
        btn.dataset.target="#submitModal"
    } else {
        btn.addEventListener("click", buttonEventListener)
    }
    return btn


}

// convert markdown text => html text
function convertMarkdownToHTML(questionObject) {
    let content = questionObject.content
    let questID = questionObject.questionId
    let questOpts = questionObject.qOpts

    content = content.replace(/(?:\r\n|\r|\n)/g, '<br>');

    // replace [] with default values 1,2,3...
    let counter = 1;
    content = content.replace(/\[\]/g, function (x) {
      let t = "[" + counter.toString() + "]";
      counter = counter + 1;
      return t;
    });

    //replace |popup|buttonText|Title|text| with a popover
    content = content.replace(
        /\|popup\|([^|]+)\|(?:([^|]+)\|)?([^|]+)\|/g, fPopover);
    function fPopover(fullmatch, buttonText, title, popText) {
        title = title ? title : "";
        popText = popText.replace(/"/g, "&quot;")
        return `<a tabindex="0" class="popover-dismiss btn btn" role="button" data-toggle="popover" data-trigger="focus" title="${title}" data-content="${popText}">${buttonText}</a>`;
    }
    // replace user profile variables...
    content = content.replace(/\{\$u:(\w+)}/g, (all, varid) => {
        return `<span name='${varid}'>${moduleParams.previousResults[varid]}</span>`;
    });
    // replace {$id} with span tag
    content = content.replace(/\{\$(\w+(?:\.\w+)?):?([a-zA-Z0-9 ,.!?"-]*)\}/g, fID);
    function fID(fullmatch, forId, optional) {
        if (optional == undefined) {
            optional = "";
        } else {
            optional = optional;
        }
        return `<span forId='${forId}' optional='${optional}'>${forId}</span>`;
    }
    // replace {#id} with span tag
    content = content.replace(/\{\#([^}#]+)\}/g, fHash)
    function fHash(fullmatch, expr) {
        return `<span data-encoded-expression=${encodeURIComponent(expr)}>${expr}</span>`
    }

    // Not sure why this is here??
    //adding displayif with nested questions. nested display if uses !| to |!
    content = content.replace(/!\|(displayif=.+?)\|(.*?)\|!/g, fDisplayIf);
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

    // #issue 378, note: getMonth 0=Jan,  need to add 1
    content = content.replace(/#currentMonthStr/g, ["Jan", "Feb", "Mar", 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][new Date().getMonth()]);
    let current_date = new Date()
    Date.prototype.toQuestFormat = function () { return `${this.getFullYear()}-${this.getMonth() + 1}-${this.getDate()}` }
    content = content.replace(/#currentMonth/g, current_date.getMonth() + 1);
    content = content.replace(/#currentYear/g, current_date.getFullYear());
    // issue #405 need #today and today+/- n days...
    content = content.replace(/#today(\s*[+\-]\s*\d+)?/g, function (match, offset) {
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


    // replace |hidden|value| 
    content = content.replace(/\|hidden\|\s*id\s*=\s*([^\|]+)\|?/g, fHide);
    function fHide(fullmatch, id) {
        return `<input type="text" data-hidden=true id=${id}>`
    }

    // replace |@| with an email input
    content = content.replace(/\|@\|(?:([^\|\<]+[^\|]+)\|)?/g, fEmail);
    function fEmail(fullmatch, opts) {
        const { options, elementId } = guaranteeIdSet(opts, "email", questID);
        return `<input type='email' ${options} placeholder="user@example.com"></input>`;
    }

    // replace |date| with a date input
    content = content.replace(/\|date\|(?:([^\|\<]+[^\|]+)\|)?/g, fDate);
    content = content.replace(/\|month\|(?:([^\|]+)\|)?/g, fDate);
    function fDate(fullmatch, opts) {
        let type = fullmatch.match(/[^|]+/)
        let { options, elementId } = guaranteeIdSet(opts, type, questID);
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
        return `<input type='${type}' ${options}></input>`;
    }


    // replace |tel| with phone input

    content = content.replace(/\|tel\|(?:([^\|\<]+[^\|]+)\|)?/g, fPhone);
    function fPhone(fullmatch, opts) {
        const { options, elementId } = guaranteeIdSet(opts, "tel", questID);
        return `<input type='tel' ${options} pattern="[0-9]{3}-?[0-9]{3}-?[0-9]{4}" maxlength="12" placeholder='###-###-####'></input>`;
    }

    // replace |SSN| with SSN input
    content = content.replace(/\|SSN\|(?:([^\|\<]+[^\|]+)\|)?/g, fSSN);
    function fSSN(fullmatch, opts) {
        const { options, elementId } = guaranteeIdSet(opts, "SSN", questID);
        return `<input type='text' ${options} id="SSN" class="SSN" inputmode="numeric" maxlength="11" pattern="[0-9]{3}-?[0-9]{2}-?[0-9]{4}"   placeholder="_ _ _-_ _-_ _ _ _"></input>`;
    }



    // replace |SSNsm| with SSN input
    content = content.replace(/\|SSNsm\|(?:([^\|\<]+[^\|]+)\|)?/g, fSSNsm);
    function fSSNsm(fullmatch, opts) {
        const { options, elementId } = guaranteeIdSet(opts, "SSNsm", questID);
        return `<input type='text' ${options} class="SSNsm" inputmode="numeric" maxlength="4" pattern='[0-9]{4}'placeholder="_ _ _ _"></input>`;
    }

    // replace |state| with state dropdown
    content = content.replace(/\|state\|(?:([^\|\<]+[^\|]+)\|)?/g, fState);
    function fState(fullmatch, opts) {
        const { options, elementId } = guaranteeIdSet(opts, "state", questID);
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

    // replace |image|URL|height,width| with a html img tag...
    content = content.replace(
        /\|image\|(.*?)\|(?:([0-9]+),([0-9]+)\|)?/g,
        "<img src=https://$1 height=$2 width=$3>"
    );

    //regex to test if there are input as a part of radio or checkboxes
    //    /(\[|\()(\d*)(?:\:(\w+))?(?:\|(\w+))?(?:,(displayif=.+?\))?)?(\)|\])\s*(.*?\|_.*?\|)\s*(?=(?:\[\d)|\n|<br>|$)/g
    var radioCheckboxAndInput = false;
    if (content.match(/(\[|\()(\d*)(?:\:(\w+))?(?:\|(\w+))?(?:,(displayif=.+?\))?)?(\)|\])\s*(.*?\|_.*?\|)/g)) {
        radioCheckboxAndInput = true;
        questOpts = questOpts + " radioCheckboxAndInput";
    }

    content = content.replace(/<br>/g, "<br>\n");

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
            //if (match.input[i] == "\n")throw new SyntaxError("parenthesis mismatch near ", match[0]);

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
        let replacement = `<div class='response' style='margin-top:15px' ${display_if}><input type='radio' name='${radioElementName}' value='${value}' id='${radioElementName}_${value}'></input><label id='${labelID}' style='font-weight: normal; padding-left:5px;' for='${radioElementName}_${value}'>${label}</label></div>`;

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
    for (let match = content.match(buttonRegex); !!match; match = content.match(buttonRegex)) {
        content = handleButton(match);
    }

    // replace [XX] with checkbox
    // The "displayif" is reading beyond the end of the pattern ( displayif=.... )
    // let cbRegEx = new RegExp(''
    //   + /\[(d*)(\*)?(?:\:(\w+))?/.source              // (digits with a potential * and :name
    //   + /(?:\|(\w+))?/.source                         // an optional id for the label
    //   + /(?:,(displayif=.+?\))?)?/.source             // an optional displayif
    //   + /\]\s*(.*?)\s*(?=(?:\[\d)|\n|<br>|$)/         // go to the end of the line or next [
    // )
    content = content.replace(
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
        return `<div class='response' style='margin-top:15px' ${displayIf}><input type='checkbox' name='${elVar}' value='${value}' id='${elVar}_${value}' ${clearValues}></input><label id='${labelID}' style='font-weight: normal; padding-left:5px;' for='${elVar}_${value}'>${label}</label></div>`;
    }

    // replace |time| with a time input
    content = content.replace(/\|time\|(?:([^\|\<]+[^\|]+)\|)?/g, fTime);
    function fTime(x, opts) {
        const { options, elementId } = guaranteeIdSet(opts, "time", questID);
        return `<input type='time' ${options}>`;
    }

    // replace |__|__|  with a number box...
    content = content.replace(
        /\|(?:__\|){2,}(?:([^\|\<]+[^\|]+)\|)?/g,
        fNum
    );
    function fNum(fullmatch, opts) {

        let value = content.startsWith('<br>') ? content.split('<br>')[0] : ''

        // make sure that the element id is set...
        let { options, elementId } = guaranteeIdSet(opts, "num", questID);

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
    content = content.replace(/\[text\s?box(?:\s*:\s*(\w+))?\]/g, fTextBox);
    function fTextBox(fullmatch, options) {
        let id = options ? options : `${questID}_text`;
        return `|__|id=${id} name=${questID}|`;
    }


    content = content.replace(
        // /\|(?:__\|)(?:([^\s<][^|<]+[^\s<])\|)?\s*(.*)?/g,
        /(.*)?\|(?:__\|)(?:([^\s<][^|<]+[^\s<])\|)?(.*)?/g,
        fText
    );

    function fText(fullmatch, value1, opts, value2) {
        let { options, elementId } = guaranteeIdSet(opts, "txt", questID);
        options = options.replaceAll(/(min|max)len\s*=\s*(\d+)/g, 'data-$1len=$2')
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

        return `<input type='text' aria-label='${content.split('<br>')[0]}' name='${questID}' ${options}></input>`;
    }

    // replace |___| with a textarea...
    content = content.replace(/\|___\|((\w+)\|)?/g, fTextArea);
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

    // replace #YNP with Yes No input
    content = content.replace(
        /#YNP/g, `<div class='response' style='margin-top:15px'><input type='radio' id="${questID}_1" name="${questID}" value="yes"></input><label for='${questID}_1'>Yes</label></div><div class='response' style='margin-top:15px'><input type='radio' id="${questID}_0" name="${questID}" value="no"></input><label for='${questID}_0'>No</label></div><div class='response' style='margin-top:15px'><input type='radio' id="${questID}_99" name="${questID}" value="prefer not to answer"></input><label for='${questID}_99'>Prefer not to answer</label></div>`
        // `(1) Yes
        //  (0) No
        //  (99) Prefer not to answer`
    );

    // replace #YN with Yes No input
    content = content.replace(
        /#YN/g, `<div class='response' style='margin-top:15px'><input type='radio' id="${questID}_1" name="${questID}" value="yes"></input><label for='${questID}_1'>Yes</label></div><div class='response' style='margin-top:15px'><input type='radio' id="${questID}_0" name="${questID}" value="no"></input><label for='${questID}_0'>No</label></div>`
        // `(1) Yes
        //  (0) No`
    );
    // replace [a-zXX] with a checkbox box...
    // handle CB/radio + TEXT + TEXTBOX + ARROW + Text...
    content = content.replace(
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
    // the : changes the standard span to a div.
    content = content.replace(/\|displayif=(.+?)(:)?\|(.*?)\|/g, fDisplayIf);
    function fDisplayIf(containsGroup, condition, nl, text) {
        condition = condition.replaceAll('\"', "\'");
        let tag = (nl) ? "div" : "span"
        return `<${tag} class='displayif' displayif="${condition}">${text}</${tag}>`;
    }

    //displaylist...
    content = content.replace(/\|(displayList\(.+?\))\s*(:)?\|/g, fDisplayList);
    function fDisplayList(all, args, nl) {
        args = args.replaceAll('\'', "\"");
        let tag = (nl) ? "div" : "span"
        return `<${tag} class='displayList' data-displayList-args='${args}'>${args}</${tag}>`;
    }

    // replace next question  < -> > with hidden...
    content = content.replace(
        /<\s*(?:\|if\s*=\s*([^|]+)\|)?\s*->\s*([A-Z_][A-Z0-9_#]*)\s*>/g,
        fHidden
    );
    function fHidden(containsGroup, ifArgs, skipTo) {
        ifArgs = ifArgs == undefined ? "" : ` if=${encodeURIComponent(ifArgs)}`;
        return `<input type='hidden'${ifArgs} id='${questID}_skipto_${skipTo}' name='${questID}' skipTo=${skipTo} checked>`;
    }

    // replace next question  < #NR -> > with hidden...
    content = content.replace(
        /<\s*#NR\s*->\s*([A-Z_][A-Z0-9_#]*)\s*>/g,
        "<input type='hidden' class='noresponse' id='" +
        questID +
        "_NR' name='" +
        questID +
        "' skipTo=$1 checked>"
    );

    // handle skips
    content = content.replace(
        //      /<input ([^>]*?)><\/input><label([^>]*?)>(.*?)\s*->\s*([^>]*?)<\/label>/g,
        /<input ([^>]*?)><\/input><label([^>]*?)>(.*?)\s*->\s*([^<\s]*?)\s*<\/label>/g,
        "<input $1 skipTo='$4'></input><label $2>$3</label>"
    );
    content = content.replace(
        /<textarea ([^>]*)><\/textarea>\s*->\s*([^\s<]+)/g,
        "<textarea $1 skipTo=$2></textarea>"
    );
    content = content.replace(/<\/div><br>/g, "</div>");
    return content
}

function addHandlers(markdownElement){
    // Firefox does not alway GRAB focus when the arrows are clicked.
    // If a changeEvent fires, grab focus.
    markdownElement.querySelectorAll("input[type='number']").forEach((inputElement) => {
        inputElement.addEventListener("change", (event) => {
            if (event.target != document.activeElement) event.target.focus()
        });
    })

    // all text inputs need to call textBoxInput
    markdownElement.querySelectorAll(
        "input[type='text'],input[type='number'],input[type='email'],input[type='tel'],input[type='date'],input[type='month'],input[type='time'],textarea,select"
    ).forEach((textInputElement) => {
        textInputElement.onblur = textBoxInput;
        //textInputElement.setAttribute("style", "size: 20 !important");
    })

    // Add handlers to the
    // handle the xors...
    markdownElement.querySelectorAll("[xor]").forEach(xorElement => {
        xorElement.addEventListener("keydown", () => handleXOR(xorElement));
    })

    //handle the SSN
    markdownElement.querySelectorAll(".SSN").forEach((inputElement) => {
        inputElement.addEventListener("keyup", parseSSN);
    });

    //handle phone numbers
    markdownElement.querySelectorAll("input[type='tel']").forEach((inputElement) => {
        inputElement.addEventListener("keyup", parsePhoneNumber)
    });

    // handle radio button and combo boxes
    markdownElement.querySelectorAll("input[type='radio'],input[type='checkbox']").forEach((inputElement) => {
        inputElement.onchange = rbAndCbClick;
    });
    
    // toggle the grids???
    markdownElement.querySelectorAll(".grid-input-element").forEach((x) => {
        x.addEventListener("change", toggle_grid);
    });

    // hide elements
    markdownElement.querySelectorAll("[data-hidden]").forEach((x) => {
        x.style.display = "none";
    });

    // handle text in combobox label...
    markdownElement.querySelectorAll("label input,label textarea").forEach(inputElement => {
        // the markdown element has not yet been attached to the DOM,
        // so dont use document.getElementById()
        let radioCB = markdownElement.querySelector(`#${inputElement.closest('label').htmlFor}`)
        if (!radioCB){
            console.error("no radio button/combo box for ")
            console.log(inputElement)
            return
        }
        let callback = (event) => {
            let nchar = event.target.value.length
            // select if typed in box, DONT UNSELECT
            if (nchar > 0) radioCB.checked = true
            inputElement.dataset.lastValue = inputElement.value
        }
        inputElement.addEventListener("keyup", callback);
        inputElement.addEventListener("input", callback);
        radioCB.addEventListener("click", (event => {
            console.log("click")
            if (!radioCB.checked) {
                inputElement.dataset.lastValue = inputElement.value
                inputElement.value = ''
            } else if ('lastValue' in inputElement.dataset) {
                inputElement.value = inputElement.dataset.lastValue
            }
            textboxinput(inputElement)
        }))
    })
    $(".popover-dismiss").popover({
        trigger: "focus",
      });
}