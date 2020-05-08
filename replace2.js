transform = function() {
  // ini
};

const validation = {};
let questName = "Questionnaire";

transform.render = async (obj, divId, previousResults = {}) => {
  let contents = "";
  if (obj.text) contents = obj.text;
  if (obj.url) {
    contents = await (await fetch(obj.url.split("&")[0])).text();
    if (obj.url.split("&").includes("run")) {
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

  let regEx = new RegExp(
    "\\[([A-Z_][A-Z0-9_#]*[\\?\\!]?)(,.*?)?\\](.*?)(?=$|\\[[_A-Z])",
    "g"
  );

  // because firefox cannot handle the "s" tag, encode all newlines
  // as a unit seperator ASCII code 1f (decimal: 31)
  contents = contents.replace(/\n/g, "\u001f");

  contents = contents.replace(regEx, function(page, questID, d, questText) {
    //  console.log("page: ", page, "\nd: ", d, "\ny: ", questID, "\nz: ", questText);

    // questText = questText.replace(/\/\*[\s\S]+\*\//g, "");
    // questText = questText.replace(/\/\/.*\n/g, "");

    questText = questText.replace(/\u001f/g, "\n");

    questText = questText.replace(/\n/g, "<br>");

    questText = questText.replace(/\[_#\]/g, "");

    questID = questID.replace(/\[DISPLAY IF .*\]/g, "");

    // handle displayif on the question...
    // if d is undefined set it to blank.
    d = d ? d : "";

    // make sure that this is a "displayif"
    var displayifMatch = d.match(/,\s*(displayif\s*=\s*.*)/);
    // if so, remove the comma and go.  if not, set d to blank...
    d = displayifMatch ? displayifMatch[1] : "";

    let hardBool = questID.endsWith("!");
    let softBool = questID.endsWith("?");
    if (hardBool || softBool) {
      questID = questID.slice(0, -1);
    }

    // replace user profile variables...
    questText = questText.replace(/\{\$u:(\w+)}/, (all, varid) => {
      return `<span name='${varid}'>${previousResults[varid]}</span>`;
    });

    // replace {$id} with span tag
    questText = questText.replace(
      /\{\$(\w+)\}/g,
      `<span forId='$1'>${"$1"}</span>`
    );

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

    // replace (###)-###-#### with SSN input
    questText = questText.replace(
      /\|###-##-####\|/g,
      `<input type='text' id='${questID}_SSN'pattern='[0-9]{3}-[0-9]{2}-[0-9]{4}' required></input>`
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
    questText = questText.replace(
      /\|image\|(.*?)\|(?:([0-9]+),([0-9]+)\|)?/g,
      "<img src=https://$1 height=$2 width=$3>"
    );
    // replace |__|__|  with a number box...
    questText = questText.replace(/\|(?:__\|){2,}(?:([^|]+)\|)?/g, fNum);
    function fNum(fullmatch, opts) {
      // make sure that the element id is set...
      const { options, elementId } = guaranteeIdSet(opts, "num");
      console.log(`
      <input oninput='numberInput(this)' name='${questID}' ${options}></input>
      <label id='${elementId}_label' for='${elementId}'></label>
      `);

      return `<input type='number' oninput='numberInput(this)' name='${questID}' ${options}></input>`;
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
        elementIdId = option;
      }
      return `<input type='text' oninput='textBoxInput(this)' name='${questID}' id=${elementId}></input>`;
    }
    questText = questText.replace(/\|(?:__\|)(?:([^|]+)\|)?/g, fText);
    function fText(fullmatch, opts) {
      const { options, elementId } = guaranteeIdSet(opts, "txt");
      return `<input type='text' oninput='textBoxInput(this)' name='${questID}' ${options}></input>`;
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

    // replace (XX) with a radio button...
    questText = questText.replace(
      /\((\d+)(?:\:(\w+))?(?:\|(\w+))?(?:,(displayif=.+?\)))?\)([^<\n]*)|\(\)/g,
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
      return `<div class='response' style='margin-top:15px' ${displayIf}><input type='radio' name='${elVar}' value='${value}' id='${elVar}_${value}' onchange='rbAndCbClick(this)'></input><label id='${labelID}' style='font-weight: normal; padding-left:5px' for='${elVar}_${value}'>${label}</label></div>`;
    }

    // replace [a-zXX] with a checkbox box...
    questText = questText.replace(
      /\s*\[(\w*)(?:\:(\w+))?(?:\|(\w+))?(?:,(displayif=.+?))?\]([^<\n]*)|\[\]|\*/g,
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
      return `<div class='response' style='margin-top:15px' ${displayIf}><input type='checkbox' name='${elVar}' value='${value}' id='${elVar}_${value}' onclick='rbAndCbClick(this)'></input><label id='${labelID}' style='font-weight: normal; padding-left:5px' for='${elVar}_${value}'>${label}</label></div>`;
    }

    questText = questText.replace(/\|(displayif=.+?)\|(.*?)\|/g, fDisplayIf);
    function fDisplayIf(containsGroup, condition, text) {
      return `<span ${condition}>${text}</span>`;
    }

    // replace next question  < -> > with hidden...
    questText = questText.replace(
      /<\s*->\s*([A-Z_][A-Z0-9_#]*)\s*>/g,
      "<input type='hidden' id='" +
        questID +
        "_default' name='" +
        questID +
        "' skipTo=$1 checked>"
    );

    // replace next question  < #NR -> > with hidden...
    questText = questText.replace(
      /<\s*#NR\s*->\s*([A-Z_][A-Z0-9_#]*)\s*>/g,
      "<input type='hidden' class='noresponse' id='" +
        questID +
        "_default' name='" +
        questID +
        "' skipTo=$1 checked>"
    );

    // handle skips
    questText = questText.replace(
      /<input ([^>]*?)><\/input><label([^>]*?)>([^>]*?)\s*->\s*([^>]*?)<\/label>/g,
      "<input $1 skipTo='$4'></input><label $2>$3</label>"
    );

    rv = `<form class='question' onsubmit='stopSubmit(event,${obj.store})' style='font-weight: bold' id='${questID}' ${d} hardEdit='
      ${hardBool}' softEdit='${softBool}'> ${questText} <input type='button' onclick='prev(this)' class='previous' value='BACK'></input>\n
      <input type='submit' class='next' value='NEXT'></input>
      </form>`;

    return rv;
  });

  // handle the display if case...
  contents = contents.replace(
    /\[DISPLAY IF\s*([A-Z][A-Z0-9+]*)\s*=\s*\(([\w,\s]+)\)\s*\]\s*<div (.*?)>/g,
    "<div $3 showIfId='$1' values='$2'>"
  );

  // remove the first previous button...
  contents = contents.replace(
    /<input type='button'.*?class='previous'.*?\n/,
    ""
  );
  // remove the last next button...
  contents = contents.replace(
    /<input type='button'.*class='next'.*?><\/input><\/form>\[END\]/,
    "<input type='button' class='submit' value='Submit'>"
  );

  // remove the hidden end tag...
  contents = contents.replace("[END]", "");

  // add the HTML/HEAD/BODY tags...
  document.getElementById(divId).innerHTML =
    contents +
    '\n<script src="questionnaire.js"></script>' +
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
  if (obj.url && obj.url.split("&").includes("run")) {
    if (document.querySelector(".question") != null) {
      document.querySelector(".question").classList.add("active");
    }
  }

  let questObj = {};

  async function fillForm(retrieve) {
    let tempObj = {};
    if (
      localforage.keys().then(res => {
        res.includes(questName);
      })
    ) {
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
        await localforage.keys().then(res => {
          tempObj = res.filter(key => key == questName)[0];
        });
        await localforage.getItem(tempObj).then(res => {
          questObj = res;
        });
      }

      // go through the form and fill in all the values...
      if (questObj != null) {
        Object.getOwnPropertyNames(questObj).forEach(element => {
          let formElement = document.getElementById(element);
          // get input elements with name="element"
          let selector = "input[name='" + element + "']";
          if (formElement == null) {
            return null;
          } else {
            let inputElements = [...formElement.querySelectorAll(selector)];
            if (questObj[element] == undefined) {
              return null;
            } else {
              let value = questObj[element];
              console.log(inputElements);
              if (Array.isArray(questObj[element]) == true) {
                if (inputElements.length > 1) {
                  // we have either a radio button or checkbox...
                  console.log("rb or cb");
                  value.forEach(v => {
                    selector = "input[value='" + v + "']";
                    inputElements
                      .filter(x => x.value == v)
                      .forEach(x => {
                        x.checked = true;
                        if (
                          [...document.querySelectorAll("form")].includes(
                            x.parentElement.parentElement
                          )
                        ) {
                          x.parentElement.parentElement.value = value;
                        } else {
                          x.parentElement.value = value;
                        }
                      });
                  });
                } else {
                  if (Array.isArray(value)) {
                    if (value.length == 1) inputElements[0].value = value[0];
                  } else {
                    inputElements[0].value = value;
                  }
                  // we have something else...
                  // set the value...
                }
              } else {
                selector = "input[value='" + questObj[element] + "']";
                inputElements
                  .filter(elm => elm.type == "number")
                  .forEach(elm => {
                    elm.value = value;
                    if (
                      [...document.querySelectorAll("form")].includes(
                        elm.parentElement.parentElement
                      )
                    ) {
                      elm.parentElement.parentElement.value = value;
                    } else {
                      elm.parentElement.value = value;
                    }
                  });
              }
            }
          }
        });
        if (
          Object.entries(questObj)
            .map(([key, value]) => document.getElementById(key))
            .slice(-1)[0] != null
        ) {
          Array.from(
            document.getElementsByClassName("active")
          ).forEach(element => element.classList.remove("active"));
          Object.entries(questObj)
            .map(([key, value]) => document.getElementById(key))
            .slice(-1)[0]
            .classList.add("active");
        }
      } else {
        if (document.querySelector(".question") != null) {
          document.querySelector(".question").classList.add("active");
        }
      }
    }
  }
  fillForm(obj.retrieve);
};

transform.tout = function(fun, tt = 500) {
  if (transform.tout.t) {
    clearTimeout(transform.tout.t);
  }
  transform.tout.t = setTimeout(fun, tt);
};
