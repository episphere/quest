import { Tree } from "./tree.js";
import { knownFunctions } from "./knownFunctions.js";
import { removeQuestion } from "./localforageDAO.js";
import { validateInput, validationError } from "./validate.js"

export const moduleParams = {};

let script = document.createElement("script");
script.src = "https://cdnjs.cloudflare.com/ajax/libs/mathjs/11.2.0/math.js"
document.body.appendChild(script);



// create a class YearMonth custom datatype for use in mathjs to handle
// the month class...
export function YearMonth(str) {
  if (str?.isYearMonth) {
    this.month = str.month
    this.year = str.year
  } else {
    let x = str.match(/^(\d+)\-(\d+)$/)
    this.month = parseInt(x[2]).toLocaleString(navigator.language, { minimumIntegerDigits: 2 })
    this.year = x[1]
  }
}
YearMonth.prototype.isYearMonth = true
YearMonth.prototype.toString = function () {
  return `${this.year}-${this.month}`
}
// create an add function.  Note: YearMonth + integer = String
YearMonth.prototype.add = function (n) {
  let m = parseInt(this.month) + n
  let yr = parseInt(this.year) + ((m > 12) ? 1 : 0);
  // if month == 0, set it to 12
  let mon = (m % 12) || 12
  return new YearMonth(`${yr}-${mon}`).toString()
}

// Note: YearMonth - n = String
YearMonth.prototype.subtract = function (n) {
  let m = parseInt(this.month) - n
  let yr = parseInt(this.year) - ((m > 0) ? 0 : 1);
  let mon = ((m + 12) % 12) || 12
  return new YearMonth(`${yr}-${mon}`).toString()
}

// Note: YearMonth - YearMonth = integer
YearMonth.prototype.subMonth = function(ym){
  return (12*(parseInt(this.year)-parseInt(ym.year)) + parseInt(this.month)-parseInt(ym.month));
}

// This works in all cases except x=new String(),
//  which you should never do anyway...
let isString = (value) => typeof value == 'string'

// Note: these function make explicit
// use of the fact that the DOM stores information.
// be careful  the DOM and the localforage become
// mis-aligned.
export const myFunctions = {
  exists: function (x) {
    if (!x) return false;
    if (x.toString().includes('.')) {
      return !math.isUndefined( getKeyedValue(x) )
    }
    let element = document.getElementById(x);

    // handle the array case (checkboxes)...
    if (Array.isArray(element?.value)) return !!element.value.length

    // note !! converts "truthy" values
    return (!!element && !!element.value) || moduleParams.previousResults.hasOwnProperty(x)
  },
  doesNotExist: function (x) {
    return !math.exists(x)
  },
  noneExist: function (...ids) {
    // if you give me no ids, none of them exist therefore true...
    // loop through all the ids of any exists then return false...
    return ids.every(id => math.doesNotExist(id))
  },
  someExist: function (...ids) {
    return ids.some(id => math.exists(id))
  },
  allExist: function (...ids) {
    return ids.every(id => math.exists(id))
  },
  _value: function (x) {
    if (!math.exists(x)) return null

    if (x.toString().includes('.')) {
      return getKeyedValue(x)
    }

    let element = document.getElementById(x);
    let returnValue = (element) ? element.value : moduleParams.previousResults[x]
    return returnValue
  },
  valueEquals: function (id, value) {
    // if id is not passed in return FALSE
    if (math.doesNotExist(id)) return false;
    let element_value = math._value(id);
    // if the element does not exist return FALSE
    return (element_value == value)
  },
  equals: function(id, value){
    return math.valueEquals(id,value)
  },
  valueIsOneOf: function (id, ...values) {
    if (myFunctions.doesNotExist(id)) return false;
    // compare as strings so "1" == "1"
    values = values.map(v => v.toString())

    let test_values = math._value(id);
    // catch if we have a combobox...
    if (test_values[id]) {
      test_values = test_values[id]
    }
    if (Array.isArray(test_values)) {
      return (test_values.some(v => values.includes(v.toString())))
    }
    return values.includes(test_values.toString())
  },
  /**
   * checks whether the value for id is 
   * between the values of lowerLimit and upperLimit inclusively
   * lowerLimit <= value(id) <= upperlimit
   * 
   * if you pass in an array of ids, it uses the first id that exists.  The
   * array is passed into valueOrDefault.
   * 
   * @param  {Number} lowerLimit The lowest acceptable value
   * @param  {Number} upperLimit the highest acceptable value
   * @param  {Array}  ids   An array of values, passed into valueOrDefault.
   * @return {boolean}     is lowerLimit <= value(id) <= upperLimit
   */
  valueIsBetween: function (lowerLimit, upperLimit, ...ids) {
    console.log(`VIB:  ${lowerLimit} <= ${ids}  <= ${upperLimit}`)
    if (lowerLimit === undefined || upperLimit === undefined || ids === undefined) return false;

    let value = undefined;
    value = (ids.length > 1) ? myFunctions.valueOrDefault(ids.shift(), ids) : myFunctions._value(ids.shift())
    // for this function to work, value, lowerLimit, and 
    // upperLimit MUST be numeric....
    if (!isNaN(value) && !isNaN(lowerLimit) && !isNaN(value)) {
      return (parseFloat(lowerLimit) <= value && value <= parseFloat(upperLimit))
    }
    return false
  },
  /**
   * Given a comma separated value of Conditions and values, returns a string of all the values that exist.
   * separated by a comma or the optional separator
   * 
   * i.e. existingValues(exists("ID1"),displaytext,exists("ID2"),displaytext)
   * 
   * @param  {args}  the args should be condition1, VAL1, condition2, VAL2, (optional)sep=,
   * 
   */
  existingValues: function (args) {
    if (!args) return ""

    let argArray = math.parse(args).args

    let sep = ", "
    if (argArray[argArray.length - 1].name == "sep") {
      sep = argArray.pop().evaluate()
    }
    // we better have (id/value PAIRS)
    argArray = argArray.reduce((prev, current, index, array) => {
      // skip the ids...
      if (index % 2 == 0) return prev

      // see if the id exists, if so keep the value
      if (array[index - 1].evaluate()) prev.push(math.valueOrDefault(current.evaluate(), current.evaluate()))

      return prev
    }, [])
    return argArray.join(sep)
  },
  // if the value of id is a string
  // return the string length, otherwise
  // return -1
  valueLength: function(id){
    // if id is not passed in return FALSE
    if (math.doesNotExist(id)) return false;
    let element_value = math._value(id);
    if (isString(element_value)){
      return element_value.length
    }
    return -1;
  },
  dateCompare: function (month1, year1, month2, year2) {
    if (
      [month1, month2].some((m) => { let m1 = parseInt(m); m1 < 0 || m1 > 11 })
    ) {
      throw 'DateCompareError:months need to be from 0 (Jan) to 11 (Dec)'
    }
    if (
      [year1, year2].some((yr) => isNaN(yr))
    ) {
      throw 'DateCompareError:years need to be numeric'
    }

    let date1 = (new Date(year1, month1)).getTime()
    let date2 = (new Date(year2, month2)).getTime()
    return (date1 < date2) ? -1 : (date1 == date2) ? 0 : 1
  },
  isSelected: function (id) {
    // if the id doesnt exist, the ?.checked returns undefined.
    // !!undefined == false.
    return (!!document.getElementById(id)?.checked)
  },
  someSelected: function (...ids) {
    return (ids.some(id => math.isSelected(id)))
  },
  // defaultValue accepts an Id and a value or a Id/Value
  // If only 1 default value is given, first it looks it up
  // if it does not exist assume it is a value...
  // If 2 default values are given, look up the first, if it
  // does not exist, return the second as a value...
  valueOrDefault: function (x, ...defaultValue) {
    let v = math._value(x)

    let indx = 0;
    while (v == null && defaultValue.length > indx) {
      v = math._value(defaultValue[indx])
      if (v == null) indx++
    }
    if (v == null) v = defaultValue[defaultValue.length - 1]
    return (v)
  },
  selectionCount: function(x){
    let [questionId,name] = x.split(':')
    name = name ?? questionId

    if (!math.exists(questionId)) return 0
    let v = math._value(questionId)

    // BUG FIX:  if the data-reset ("none of the above") is selected
    let questionElement = document.getElementById(questionId)
    if ( Array.isArray(v)  || Array.isArray(v[name]) ) {
      v = Array.isArray(v)?v:v[name]
      // there is a chance that nothing is selected (v.length==0) in that case you will the 
      // selector will find nothing.  Use the "?" because you cannot find the dataset on a null object.  
      return questionElement.querySelector(`input[type="checkbox"][name="${name}"]:checked`)?.dataset["reset"]?0:v.length
    }

    // if we want object to return the number of keys
    // Object.keys(v).length
    // otherwise:
    return 0;
  },
  // For a question in a loop, does the value of the response
  // for ANY ITERATION equal a value from a given set. 
  loopQuestionValueIsOneOf: function (id, ...values) {
    // Loops append _n_n to the id, where n is an
    // integer starting from 1...
    for (let i = 1; ; i = i + 1) {
      let tmp_qid = `${id}_${i}_${i}`
      // the Id does not exist, we've gone through
      // all potential question and have not found
      // a value in the set of "acceptable" values...
      if (math.doesNotExist(tmp_qid)) return false;
      if (math.valueIsOneOf(tmp_qid, ...values)) return true
    }
  },
  gridQuestionsValueIsOneOf: function (gridId, ...values) {
    if (math.doesNotExist(gridId)) return false
    let gridElement = document.getElementById(gridId)
    if (!gridElement.hasAttribute("grid")) return false

    values = values.map(v => v.toString())
    let gridValues = math._value(gridId)
    for (const gridQuestionId in gridValues) {
      // even if there is only one value, force it into
      // an array.  flatten it to make sure that it's a 1-d array
      let test_values = [gridValues[gridQuestionId]].flat()
      if (test_values.some(v => values.includes(v.toString()))) {
        return true;
      }

    }
    return false;
  },
  yearMonth: function (str) {
    let isYM = /^(\d+)\-(\d+)$/.test(str)
    if (isYM) {
      return new YearMonth(str)
    }
    let value = math._value(str)
    isYM = /^(\d+)\-(\d+)$/.test(value)
    if (isYM) {
      return new YearMonth(value)
    }
    return false;
  },
  YearMonth: YearMonth,
}

function getKeyedValue(x) {
  let array = x.toString().split('.')
  // convert null or undefined to undefined...
  let obj = math._value(`${array.splice(0, 1)}`) ?? undefined
  return array.reduce((prev, curr) => {
    if ( math.isUndefined(prev) ) return prev
    return prev[curr] ?? undefined
  }, obj)

  /*
  if (math.exists(`${array[0]}`)) {
    // we need to get the object and see
    // if the object has the appropriate keys.
    let obj = math._value(`${array.splice(0, 1)}`)
    let tst = array.reduce((prev, curr) => {
      if (math.isUndefined(prev)) return prev
      return prev[curr]
    }, obj)
    tst
  } else {
    return false
  }
  */
}

window.addEventListener("load", (event) => {
  // Tell mathjs about the YearMonth class
  math.typed.addType({
    name: 'YearMonth',
    test: function (x) {
      return x && x.isYearMonth
    }
  })

  // Tell math.js how to add a YearMonth with a number
  const add = math.typed('add', {
    'YearMonth, number': function (dte, m) {
      return dte.add(m)
    },
    'number, YearMonth': function (m, dte) {
      return dte.add(m)
    }
  })
  const subtract = math.typed('subtract', {
    'YearMonth, number': function (dte, m) {
      return dte.subtract(m)
    },
    'YearMonth, YearMonth': function(dte2,dte1){
      return dte2.subMonth(dte1)
    }
  })

  myFunctions.add = add;
  myFunctions.subtract = subtract
  window.myFunctions = myFunctions;

  math.import({
    myFunctions
  })
})

// The questionQueue is an Tree which contains
// the question ids in the order they should be displayed.
export const questionQueue = new Tree();

export function isFirstQuestion() {
  return questionQueue.isEmpty() || questionQueue.isFirst();
}

function numberOfInputs(element) {
  let resps = Array.from(
    element.querySelectorAll("input, textarea, select")
  ).reduce((acc, current) => {
    //if (["submit", "button"].includes(current.type)) return acc;
    if (current.type == "submit" || current.type == "hidden" || current.type =="button" ) return acc;
    if (["radio", "checkbox"].includes(current.type)) {
      acc[current.name] = true;
    } else {
      acc[current.id] = true;
    }
    return acc;
  }, {});
  return Object.keys(resps).length;
}

function setFormValue(form, value, id) {
  if (value === "") {
    value = undefined
  }
  if (numberOfInputs(form) == 1) {
    form.value = value;
  } else {
    if (!form.value) {
      form.value = {};
    }
    form.value[id] = value;
    if (value == undefined) {
      delete form.value[id]
    }

  }
}

// here are function that handle the
// user selection and attach the
// selected value to the form (question)
export function textBoxInput(event) {
  let inputElement = event.target;
  textboxinput(inputElement);
}

export function parseSSN(event) {
  console.log("SSN EVENT ", event);
  if (event.type == "keyup") {
    let element = event.target;
    let val = element.value.replace(/\D/g, "");
    let newVal = "";

    if (val.length >= 3 && val.length < 5 && event.code != "Backspace") {
      //reformat and return SSN
      newVal += val.replace(/(\d{3})/, "$1-");
      element.value = newVal;
    }

    if (val.length >= 5 && event.code != "Backspace") {
      //reformat and return SSN
      newVal += val.replace(/(\d{3})(\d{2})/, "$1-$2-");
      element.value = newVal;
    }
    return null;
  }
}

export function parsePhoneNumber(event) {
  if (event.type == "keyup") {
    let element = event.target;
    let phone = element.value.replace(/\D/g, "");
    let newVal = "";

    if (phone.length >= 3 && phone.length < 6 && event.code != "Backspace") {
      //reformat and return phone number
      newVal += phone.replace(/(\d{3})/, "$1-");
      element.value = newVal;
    }

    if (phone.length >= 6 && event.code != "Backspace") {
      //reformat and return phone number
      newVal += phone.replace(/(\d{3})(\d{3})/, "$1-$2-");
      element.value = newVal;
    }

    return null;
  }
  //   let newVal = "";

  //   if (val.length > 4) {
  //     element.value = val;
  //   }
  //   if (val.length > 3 && val.length < 6) {
  //     newVal += val.substr(0, 3) + "-";
  //     val = val.substr(3);
  //   }
  //   if (val.length > 5) {
  //     debugger;
  //     newVal += val.substr(0, 3) + "-";
  //     newVal += val.substr(3, 3) + "-";
  //     val = val.substr(6);
  //   }
  //   newVal += val;
  //   element.value = newVal;
  // }
}

export function callExchangeValues(nextElement) {
  console.log("... cev In", nextElement.getAttribute("maxval"), nextElement.dataset.max, nextElement)
  exchangeValue(nextElement, "min", "data-min");
  exchangeValue(nextElement, "max", "data-max")
  exchangeValue(nextElement, "minval", "data-min");
  exchangeValue(nextElement, "maxval", "data-max")
  exchangeValue(nextElement, "data-min", "data-min")
  exchangeValue(nextElement, "data-max", "data-max");
  console.log("... cev Out", nextElement.getAttribute("maxval"), nextElement.dataset.max, nextElement)
}

function exchangeValue(element, attrName, newAttrName) {
  let attr = element.getAttribute(attrName)?.trim();

  // !!! DONT EVALUATE 2020-01 to 2019
  // !!! DONT EVALUATE 2023-07-19-to 1997
  // may have to do this for dates too.  <- yeah, had to!
  // Firefox thinks <input type="month"> has type="text"...
  // so element.type return "text"
  if ( (element.getAttribute("type") == "month" && /^\d{4}-\d{1,2}$/.test(attr)) || 
       (element.getAttribute("type") == "date" && /^\d{4}-\d{1,2}-\d{1,2}$/.test(attr)) ){
    element.setAttribute(newAttrName, attr)
    return element;
  }

  if (attr) {
    let isnum = /^[\d\.]+$/.test(attr);
    if (!isnum) {
      let tmpVal = evaluateCondition(attr);
      // note: tmpVal==tmpVal means that tmpVal is Not Nan
      if (tmpVal == undefined || tmpVal == null || tmpVal != tmpVal) {
        console.error(`Module Coding Error: Evaluating ${element.id}:${attrName} expression ${attr}  => ${tmpVal}`)
        validationError(element, `Module Coding Error: ${element.id}:${attrName}`)
        return
      }
      console.log('------------exchanged Vals-----------------')
      console.log(`${element}, ${attrName}, ${newAttrName}, ${tmpVal}`)
      element.setAttribute(newAttrName, tmpVal);
    } else {
      element.setAttribute(newAttrName, attr);
    }
  }
  return element;
}

export function textboxinput(inputElement, validate = true) {
  /////////// To change all max attributes to input element ///////////
  // [...inputElement.parentElement.parentElement.children]
  //   .filter((x) => x.hasAttribute("max"))
  //   .map((x) =>
  //     x.getAttribute("max").replace(x.getAttribute("max"), inputElement.value)
  //   );
  ///////////////////////////////////////////////////////////////////////
  let evalBool = "";
  if (inputElement.getAttribute("modalif") && inputElement.value != "") {
    evalBool = math.evaluate(
      decodeURIComponent(inputElement.getAttribute("modalif").replace(/value/, inputElement.value))
    );
  }
  if (inputElement.getAttribute("softedit") == "true" && evalBool == true) {
    if (inputElement.getAttribute("modalvalue")) {
      document.getElementById(
        "modalResponseBody"
      ).innerText = decodeURIComponent(inputElement.getAttribute("modalvalue"));
      $("#softModalResponse").modal("show");
    }
  }
  if (inputElement.className == "SSN") {
    // handles SSN auto-format
    parseSSN(inputElement);
  }

  if (['text', 'number', 'email', 'tel', 'date', 'month', 'time'].includes(inputElement.type)) {
    console.log(inputElement.type);
    if (validate) {
      validateInput(inputElement)
    }
  }


  // THIS IS CHECKED VIA A EVENT LISTENER...  No need to check now..
  // what is going on here...
  // we are checking if we should click the checkbox/radio button..
  // first see if the parent is a div and the first child is a checkbox...
  // if (
  //   inputElement.parentElement &&
  //   inputElement.parentElement.tagName == "LABEL"
  // ) {
  //   let rbCb = inputElement.parentElement.previousSibling;
  //   rbCb.checked = inputElement.value.length > 0;
  //   radioAndCheckboxUpdate(rbCb);
  // }

  // BUG 423: radio button not changing value
  let radioWithText = inputElement.closest(".response")?.querySelector("input[type='radio']")
  if (radioWithText ){
    radioWithText.click()
    radioAndCheckboxUpdate(radioWithText)
  }

  clearSelection(inputElement);
  let value = handleXOR(inputElement);
  let id = inputElement.id
  value = value ? value : inputElement.value;
  setFormValue(inputElement.form, value, id);
}

// onInput/Change handler for radio/checkboxex
export function rbAndCbClick(event) {
  let inputElement = event.target;
  // when we programatically click, the input element is null.
  // however we call radioAndCheckboxUpdate directly..
  if (inputElement) {
    validateInput(inputElement)
    radioAndCheckboxUpdate(inputElement);
    radioAndCheckboxClearTextInput(inputElement);
  }
}

//for when radio/checkboxes have input fields, only enable input fields when they are selected
export function radioAndCheckboxClearTextInput(inputElement) {
  // this fails when the element name is not the same as the question id...
  //let parent = document.getElementById(inputElement.name);
  let parent = inputElement.form

  // get all responses that have an input text box (can be number, date ..., not radio/checkbox)
  let responses = [...parent.querySelectorAll(".response")]
    .filter(resp => resp.querySelectorAll("input:not([type=radio]):not([type=checkbox])").length)
    .filter(resp => resp.querySelectorAll("input[type=radio],input[type=checkbox]").length)

  // if the checkbox is selected, make sure the input box is enable
  // if the checkbox is not selected, make disable it and clear the value...
  // Note: things that can go wrong.. if a response has more than one text box.
  responses.forEach(resp => {
    let text_box = resp.querySelector("input:not([type=radio]):not([type=checkbox])")
    let checkbox = resp.querySelector("input[type=radio],input[type=checkbox]")
    //text_box.disabled = !checkbox.checked
    if (!checkbox.checked) {
      text_box.value = ""
      delete inputElement.form.value[text_box.id]
    }
  })
}

export function radioAndCheckboxUpdate(inputElement) {
  if (!inputElement) return;
  clearSelection(inputElement);

  let selectedValue = {};
  if (inputElement.type == "checkbox") {
    // get all checkboxes with the same name attribute...
    selectedValue = Array.from(
      inputElement.form.querySelectorAll(
        `input[type = "checkbox"][name = ${inputElement.name}]`
      )
    )
      .filter((x) => x.checked)
      .map((x) => x.value);
  } else {
    // we have a radio button..  just get the selected value...
    selectedValue = inputElement.value;
  }

  setFormValue(inputElement.form, selectedValue, inputElement.name);
}

function clearSelection(inputElement) {
  if (!inputElement.form || !inputElement.name) return;
  let sameName = [
    ...inputElement.form.querySelectorAll(`input[name = ${inputElement.name}],input[name = ${inputElement.name}] + label > input`)
//    ...inputElement.form.querySelectorAll(`input[name = ${inputElement.name}]`),
//    ...inputElement.form.querySelectorAll(`input:not([type="submit"])`),
  ].filter((x) => x.type != "hidden");

  /* 
  if this is a "none of the above", go through all elements with the same name
  and mark them as "false" or clear the text values
  */

  if (inputElement.dataset.reset) {
    sameName.forEach((element) => {

      switch (element.type) {
        case "checkbox":
          element.checked = element == inputElement ? element.checked : false;
          break;
        case "radio":
          break;
        default:
          element.value = element == inputElement ? inputElement.value : "";
          setFormValue(element.form, element.value, element.id);
          if (element.nextElementSibling && element.nextElementSibling.children.length !== 0) element.nextElementSibling.children[0].innerText = "";
          element.form.classList.remove("invalid");
          if (inputElement.form.value) {
            delete inputElement.form.value[element.id];
          }
          break;
      }


    });
  } else {
    // otherwise if this as another element with the same name and is marked as "none of the above"  clear that.
    // don't clear everything though because you are allowed to have multiple choices.
    sameName.forEach((element) => {
      if (element.dataset.reset) {
        //uncheck reset value
        element.checked = false

        //removing speciically the reset value from the array of checkboxes checked
        //removing from forms.value
        const key1 = element.name;
        const elementValue = element.value;
        const vals = element.form?.value ?? {};
        if (vals.hasOwnProperty(key1) && Array.isArray(vals[key1])) {
          let index = vals[key1].indexOf(elementValue)
          if (index != -1) {
            vals[key1].splice(index, 1)
          }
          if (vals[key1].length == 0) {
            delete vals[key1]
          }
        }
      }
    });
  }
}

export function handleXOR(inputElement) {
  if (!inputElement.hasAttribute("xor")) {
    return inputElement.value;
  }
  // if the user tabbed through the xor, Dont clear anything
  if (!["checkbox", "radio"].includes(inputElement.type) && inputElement.value.length == 0) {
    return null;
  }


  let valueObj = {};
  valueObj[inputElement.id] = inputElement.value;
  let sibs = [...inputElement.parentElement.querySelectorAll("input")];
  sibs = sibs.filter(
    (x) =>
      x.hasAttribute("xor") &&
      x.getAttribute("xor") == inputElement.getAttribute("xor") &&
      x.id != inputElement.id
  );

  sibs.forEach((x) => {
    if (inputElement.form.value) {
      delete inputElement.form.value[x.id]
    }
    if (["checkbox", "radio"].includes(x.type)) {
      x.checked = x.dataset.reset ? false : x.checked;
    } else {
      x.value = "";
      if (x.nextElementSibling.children.length !== 0 && x.nextElementSibling.children[0].tagName == "SPAN") {
        if (x.nextElementSibling.children[0].innerText.length != 0) {
          x.nextElementSibling.children[0].innerText = "";
          x.classList.remove("invalid");
          x.form.classList.remove('invalid');
          x.nextElementSibling.remove();
        }
      }
      valueObj[x.id] = x.value;
    }
  });
  return valueObj[inputElement.id];
}

export function nextClick(norp, retrieve, store, rootElement) {
  // Because next button does not have ID, modal will pass-in ID of question
  // norp needs to be next button element
  if (typeof norp == "string") {
    norp = document.getElementById(norp).querySelector(".next");
  }

  // check that each required element is set...
  norp.form.querySelectorAll("[data-required]").forEach((elm) => {
    validateInput(elm)
  });

  showModal(norp, retrieve, store, rootElement);
}

function setNumberOfQuestionsInModal(num, norp, retrieve, store, soft) {
  let prompt = `There ${num > 1 ? "are" : "is"} ${num} question${num > 1 ? "s" : ""
    } unanswered on this page. `;
  if (!soft) {
    document.getElementById(
      "hardModalBodyText"
    ).innerText = `${prompt} Please answer the question${num > 1 ? "s" : ""}.`;
    $("#hardModal").modal("toggle");
    return null;
  }
  let f1 = nextPage;
  f1 = f1.bind(f1, norp, retrieve, store);
  document.getElementById(
    "modalBodyText"
  ).innerText = `${prompt} Would you like to continue?`;
  document.getElementById("modalContinueButton").onclick = f1;
  $("#softModal").modal("toggle");
}
// show modal function
function showModal(norp, retrieve, store, rootElement) {
  if (
    norp.form.getAttribute("softedit") == "true" ||
    norp.form.getAttribute("hardedit") == "true"
  ) {
    let numBlankReponses = [...norp.form.children]
      .filter(
        (x) =>
          x.type &&
          x.type != "hidden" &&
          !x.hasAttribute("xor") &&
          x.style.display != "none"
      )
      .reduce((t, x) => (x.value.length == 0 ? t + 1 : t), 0);
    let hasNoResponses =
      getSelected(norp.form).filter((x) => x.type !== "hidden").length == 0;

    if (norp.form.hasAttribute("radioCheckboxAndInput")) {
      if (!radioCbHasAllAnswers(norp.form)) {
        hasNoResponses = true;
      }
    }

    if (norp.form.hasAttribute("grid")) {
      if (!gridHasAllAnswers(norp.form)) {
        hasNoResponses = true;
      }

    }
    // let tempVal = 0;
    // if (hasNoResponses) {
    //   tempVal = 0;
    // } else {
    //   tempVal = 1;
    // }
    if (numBlankReponses == 0 && hasNoResponses == true) {
      numBlankReponses = 1;
    } else if ((numBlankReponses == 0) == true && hasNoResponses == false) {
      numBlankReponses = 0;
    } else if ((numBlankReponses == 0) == false && hasNoResponses == true) {
      numBlankReponses = numBlankReponses;
    } else {
      numBlankReponses = 0;
    }
    // numBlankReponses =
    //   numBlankReponses == 0 && hasNoResponses ? tempVal : numBlankReponses;

    if (numBlankReponses > 0) {
      setNumberOfQuestionsInModal(
        numBlankReponses,
        norp,
        retrieve,
        store,
        norp.form.getAttribute("softedit") == "true"
      );
      return null;
    }
    // if (
    //   norp.getAttribute("data-target") == "#hardModal" &&
    //   getSelected(norp.form) == 0
    // ) {
    //   $("#hardModal").modal("toggle");
    //   return null;
    // } else {
    //   nextPage(norp, store);
    // }
  }
  nextPage(norp, retrieve, store, rootElement);
}

let tempObj = {};

async function updateTree() {
  if (moduleParams?.renderObj?.updateTree) {
    moduleParams.renderObj.updateTree(moduleParams.questName, questionQueue)
  }
  updateTreeInLocalForage()
}

async function updateTreeInLocalForage() {
  // We dont have questName yet, don't bother saving the tree yet...
  if (!('questName' in moduleParams)) {
    return
  }

  let questName = moduleParams.questName;
  // do you want a JSON string or a JS Object in LF???
  // await localforage.setItem(questName + ".treeJSON", questionQueue.JSON());
  await localforage.setItem(questName + ".treeJSON", questionQueue.toVanillaObject());
}

function getNextQuestionId(currentFormElement) {
  // get the next question from the questionQueue
  // if it exists... otherwise get the next look at the
  // markdown and get the question follows.
  let nextQuestionNode = questionQueue.next();
  if (nextQuestionNode.done) {
    // We are at the end of the question queue...
    // get the next element from the markdown...
    let tmp = currentFormElement.nextElementSibling;
    // we are at a question that should be displayed add it to the queue and
    // make it the current node.
    questionQueue.add(tmp.id);
    nextQuestionNode = questionQueue.next();
  }

  return nextQuestionNode.value;
}

// norp == next or previous button (which ever is clicked...)
async function nextPage(norp, retrieve, store, rootElement) {
  // The root is defined as null, so if the question is not the same as the
  // current value in the questionQueue. Add it.  Only the root should be effected.
  // NOTE: if the root has no children, add the current question to the queue
  // and call next().

  let questionElement = norp.form;
  questionElement.querySelectorAll("[data-hidden]").forEach((x) => {
    x.value = "true"
    setFormValue(questionElement, x.value, x.id)
  });

  if (checkValid(questionElement) == false) {
    return null;
  }
  if (questionQueue.isEmpty()) {
    questionQueue.add(questionElement.id);
    questionQueue.next();
  }
  let questName = moduleParams.questName;
  tempObj[questionElement.id] = questionElement.value;

  //Check if questionElement exists first so its not pushing undefineds
  //TODO if store is not defined, call lfstore -> redefine store to be store or lfstore
  //if (questionElement.value) {
  if (store) {
    let formData = {};
    formData[`${questName}.${questionElement.id}`] = questionElement.value;
    console.log(formData)
    await store(formData)
  } else {
    let tmp = await localforage
      .getItem(questName)
      .then((allResponses) => {
        // if their is not an object in LF create one that we will add later...
        if (!allResponses) {
          allResponses = {};
        }
        // set the value for the questionId...
        allResponses[questionElement.id] = questionElement.value;
        if (questionElement.value === undefined) {
          delete allResponses[questionElement.id]
        }
        return allResponses;
      })
      .then((allResponses) => {
        // allResposes really should be defined at this point. If it wasn't
        // previously in LF, the previous block should have created it...
        localforage.setItem(questName, allResponses, () => {
          console.log(
            "... Response stored in LF: " + questName,
            JSON.stringify(allResponses)
          );
        });
      });
  }
  //}


  // check if we need to add questions to the question queue
  checkForSkips(questionElement);

  let nextQuestionId = getNextQuestionId(questionElement);
  // get the actual HTML element.
  let nextElement = document.getElementById(nextQuestionId.value);

  nextElement = exitLoop(nextElement);

  // before we add the next question to the queue...
  // check for the displayif status...
  while (nextElement.hasAttribute("displayif")) {
    // not sure what to do if the next element is is not a question ...
    if (nextElement.classList.contains("question")) {
      let display = evaluateCondition(nextElement.getAttribute("displayif"));
      if (display) break;
      if (nextElement.id.substring(0, 9) != "_CONTINUE") questionQueue.pop();

      let nextQuestionId = nextElement.dataset.nodisplay_skip;
      if (nextElement.dataset.nodisplay_skip) {
        questionQueue.add(nextElement.dataset.nodisplay_skip);
      }
      nextQuestionId = getNextQuestionId(nextElement);

      nextElement = document.getElementById(nextQuestionId.value);
      nextElement = exitLoop(nextElement);
    } else {
      console.log(
        " ============= next element is not a question...  not sure what went wrong..."
      );
      console.trace();
    }
  }
  //hide the current question
  questionElement.classList.remove("active");
  // nextElement.scrollIntoView();

  displayQuestion(nextElement);
  // nextElement.scrollIntoView();
  // document.getElementById(rootElement).scrollIntoView();
  window.scrollTo(0, 0);
}

export async function submitQuestionnaire(store, questName) {
  console.log("submit questionnaire clicked!");
  if (store) {
    let formData = {};
    formData[`${questName}.COMPLETED`] = true;
    formData[`${questName}.COMPLETED_TS`] = new Date();
    try {
      store(formData).then(() => {
        location.reload();
      });
    } catch (e) {
      console.log("Store failed", e);
    }

  }
}
function exitLoop(nextElement) {
  if (nextElement?.hasAttribute("firstquestion")) {
    let loopMax = parseInt(document.getElementById(nextElement.getAttribute("loopmax")).value)
    let firstQuestion = parseInt(nextElement.getAttribute("firstquestion"));
    let loopIndex = parseInt(nextElement.getAttribute("loopindx"));
    if (math.evaluate(firstQuestion > loopMax)) {
      questionQueue.pop();
      questionQueue.add(`_CONTINUE${loopIndex}_DONE`);
      let nextQuestionId = questionQueue.next().value;
      nextElement = document.getElementById(nextQuestionId.value);
    }
  }
  return nextElement;
}

export function displayQuestion(nextElement) {
  [...nextElement.querySelectorAll("span[forid]")].map((x) => {
    let defaultValue = x.getAttribute("optional")
    x.innerHTML = math.valueOrDefault(decodeURIComponent(x.getAttribute("forid")), defaultValue)
  });

  Array.from(
    nextElement.querySelectorAll("input[data-max-validation-dependency]")
  ).map(
    (x) =>
      (x.max = document.getElementById(x.dataset.maxValidationDependency).value)
  );
  Array.from(
    nextElement.querySelectorAll("input[data-min-validation-dependency]")
  ).map(
    (x) =>
      (x.min = document.getElementById(x.dataset.minValidationDependency).value)
  );

  // check all responses for next question
  nextElement.querySelectorAll("[displayif]")
    .forEach((elm) => {
      let f = evaluateCondition(elm.getAttribute("displayif"));
      elm.style.display = f ? null : "none";
    });
  // check for displayif spans...
  Array.from(nextElement.querySelectorAll("span[displayif],div[displayif]"))
    .map(elm => {
      let f = evaluateCondition(elm.getAttribute("displayif"));
      elm.style.display = f ? null : "none";
    });
  Array.from(nextElement.querySelectorAll("span[data-encoded-expression]"))
  .map(elm=>{
      let f = evaluateCondition(decodeURIComponent(elm.dataset.encodedExpression))
      elm.innerText=f;
  })

  //Sets the brs after non-displays to not show as well
  nextElement.querySelectorAll(`[style*="display: none"]+br`).forEach((e) => {
    e.style = "display: none"
  })

  // ISSUE: 403
  // update {$e:}/{$u} and and {$} elements in grids when the user displays the question ...
  Array.from(nextElement.querySelectorAll("[data-gridreplace]")).forEach((e) => {
    if (e.dataset.gridreplacetype == "_val") {
      e.innerText = math._value(decodeURIComponent(e.dataset.gridreplace))
    } else {
      e.innerText = math.evaluate(decodeURIComponent(e.dataset.gridreplace))
    }
  });
  //check if grid elements needs to be shown
  // concern:: in the grid you can have style:none and class="d-flex"
  // currently this SHOWS the row.  If this changes in the future,
  // it may have to be fixed.
  Array.from(nextElement.querySelectorAll("[data-gridrow][displayif]"))
    .map((elm) => {
      let f = evaluateCondition(elm.getAttribute("displayif"));
      elm.classList.add((f) ? "d-flex" : "collapse")
      elm.classList.remove((f) ? "collapse" : "d-flex")
    });

  // check min/max for variable substitution in validation
  /*function exchangeValue(element, attrName, newAttrName) {
    let attr = element.getAttribute(attrName);
    if (attr) {
      let isnum = /^[\d\.]+$/.test(attr);
      if (!isnum) {
        let tmpVal = evaluateCondition(attr);
        console.log('------------exchanged Vals-----------------')
        console.log(`${element} , ${attrName} , ${newAttrName} , ${tmpVal}`)
        element.setAttribute(newAttrName, tmpVal);
      }
    }
    return element;
  }*/
  //Replacing all default HTML form validations with datasets

  [...nextElement.querySelectorAll("input[required]")].forEach((element) => {
    if (element.hasAttribute("required")) {
      element.removeAttribute("required");
      element.dataset.required = "true";
    }
  });

  [...nextElement.querySelectorAll("input[min]")].forEach((element) => {
    exchangeValue(element, "min", "data-min");
  });
  [...nextElement.querySelectorAll("input[max]")].forEach((element) =>
    exchangeValue(element, "max", "data-max")
  );
  // supporting legacy code... dont use minval
  [...nextElement.querySelectorAll("input[minval]")].forEach((element) => {
    exchangeValue(element, "minval", "data-min");
  });
  [...nextElement.querySelectorAll("input[maxval]")].forEach((element) =>
    exchangeValue(element, "maxval", "data-max")
  );

  [...nextElement.querySelectorAll("input[data-min]")].forEach((element) =>
    exchangeValue(element, "data-min", "data-min")
  );
  [...nextElement.querySelectorAll("input[data-max]")].forEach((element) => {
    exchangeValue(element, "data-max", "data-max");
  });

  // rewrite the data-(min|max)-date-uneval with a calulated value
  [...nextElement.querySelectorAll("input[data-min-date-uneval]")].forEach((element) => {
    exchangeValue(element, "data-min-date-uneval", "data-min-date");
    exchangeValue(element, "data-min-date-uneval", "min");
  });
  [...nextElement.querySelectorAll("input[data-max-date-uneval]")].forEach((element) => {
    exchangeValue(element, "data-max-date-uneval", "data-max-date");
    exchangeValue(element, "data-max-date-uneval", "max");
  });
  nextElement.querySelectorAll("[data-displaylist-args]").forEach(element => {
    console.log(element)
    element.innerHTML = math.existingValues(element.dataset.displaylistArgs)
  })

  //move to the next question...
  nextElement.classList.add("active");

  // FINALLY...  update the tree in localForage...
  // First let's try NOT waiting for the function to return.
  updateTree();

  questionQueue.ptree();
  return nextElement;
}

export async function previousClicked(norp, retrieve, store, rootElement) {
  // get the previousElement...
  let pv = questionQueue.previous();
  while (pv.value.value.substring(0, 9) == "_CONTINUE") {
    pv = questionQueue.previous();
  }
  let prevElement = document.getElementById(pv.value.value);
  norp.form.classList.remove("active");
  displayQuestion(prevElement)

  if (store) {
    console.log("setting... ", moduleParams.questName, "=== UNDEFINED")
    let formData = {};
    formData[`${moduleParams.questName}.${norp.form.id}`] = undefined;
    store(formData);
  } else removeQuestion(moduleParams.questName, norp.form.id);

  updateTree();
  // prevElement.parentElement.scrollIntoView();
  //document.getElementById(rootElement).scrollIntoView();
  window.scrollTo(0, 0);
  return prevElement;
}

// this function just adds questions to the
// question queue.  It always returns null;
function checkForSkips(questionElement) {
  // get selected responses
  let selectedElements = getSelected(questionElement);

  let numSelected = selectedElements.filter((x) => x.type != "hidden").length;
  // if there are NO non-hidden responses ...
  if (numSelected == 0) {
    // there may be either a noResponse, a default response
    // or both or neither...

    // sort array so that noResponse comes first..
    // noResponse has a classlist length of 1/default =0
    let classSort = function (a, b) {
      return b.length - a.length;
    };
    selectedElements.sort(classSort);
  } else {
    // something was selected... remove the no response hidden tag..
    selectedElements = selectedElements.filter(
      (x) => !x.classList.contains("noresponse")
    );
  }

  // if there is a skipTo attribute, add them to the beginning of the queue...
  // add the selected responses to the question queue
  selectedElements = selectedElements.filter((x) => x.hasAttribute("skipTo"));

  // if there is an if attribute, check to see if condition is true and leave it in the selectedElements
  // otherwise, remove it from the selectedElements
  selectedElements = selectedElements.filter((x) => {
    if (!x.hasAttribute("if")) {
      return true;
    }
    return evaluateCondition(x.getAttribute("if"));
  });

  // make an array of the Elements, not the input elments...
  var ids = selectedElements.map((x) => x.getAttribute("skipTo"));
  //selectedElements = ids.map((x) => document.getElementById(x));

  // add all the ids for the selected elements with the skipTo attribute to the question queue
  //var ids = selectedElements.map(x => x.id);
  //questionQueue.addChildren(ids);

  // add all the selected elements with the skipTo attribute to the question queue
  if (ids.length > 0) {
    questionQueue.add(ids);
  }

  return null;
}

function checkValid(questionElement) {
  if (questionElement.classList.contains("invalid")) {
    return false;
  } else {
    return questionElement.checkValidity();
  }
}

//check if grids has all answers
export function gridHasAllAnswers(questionElement) {
  let gridRows = questionElement.querySelectorAll("[data-gridrow]");
  for (let i = 0; i < gridRows.length; i++) {
    if (gridRows[i].style.display != "none") {
      let gridCells = gridRows[i].querySelectorAll("[gridcell]");
      let rowHasAnswer = false;
      for (let j = 0; j < gridCells.length; j++) {
        if (gridCells[j].checked) {
          rowHasAnswer = true;
        }
      }
      if (!rowHasAnswer) {
        return false;
      }
    }


  }
  return true;
}
//check if radio/checkboxes with inputs attached has all of the required values
//does a double loop through of each radio/checbox, if checked then the following inputs must not have a empty value
export function radioCbHasAllAnswers(questionElement) {
  let hasAllAnswers = false;
  for (let i = 0; i < questionElement.length - 1; i++) {
    if ((questionElement[i].type === "checkbox" || questionElement[i].type === "radio") && questionElement[i].checked) {
      for (let j = i + 1; j < questionElement.length - 1; j++) {
        if (questionElement[j].type === "checkbox" || questionElement[j].type === "radio" || questionElement[j].type === "submit") {
          hasAllAnswers = true;
          break;
        } else if ((questionElement[j].type === "number" || questionElement[j].type === "text" || questionElement[j].type === "date" || questionElement[j].type === "email") && questionElement[j].value === "" && questionElement[i].style.display != "none") {
          return false;
        }
      }
    }
  }
  return hasAllAnswers;
}
export function getSelected(questionElement) {
  // look for radio boxes, checkboxes, and  hidden elements
  // for checked items.  Return all checked items.
  // If nothing is checked, an empty array should be returned.
  // var rv = [
  //   ...questionElement.querySelectorAll(
  //     "input[type='radio'],input[type='checkbox'],input[type='hidden'],input[type='number']"
  //   )
  // ];

  var rv1 = [
    ...questionElement.querySelectorAll(
      "input[type='radio'],input[type='checkbox']"
    ),
  ];

  var rv2 = [
    ...questionElement.querySelectorAll(
      "input[type='number'], input[type='text'], input[type='date'], input[type='month'], input[type='email'], input[type='time'], input[type='tel'], textarea, option"
    ),
  ];

  var rv3 = [...questionElement.querySelectorAll("input[type='hidden']")];

  rv1 = rv1.filter((x) => x.checked);
  rv2 = rv2.filter((x) => x.value.length > 0);
  rv3 = rv3.filter((x) => x.hasAttribute("checked"));

  // rv = rv.filter(x =>
  //   x.type == "radio" || x.type == "checkbox" || x.type == "hidden"
  //     ? x.checked
  //     : x.value.length > 0
  // );

  // we may need to guarentee that the hidden comes last.
  rv1 = rv1.concat(rv2);
  return rv1.concat(rv3);
}

// create a blank object for collecting
// the questionnaire results...
const res = {};
// on submit of the question(a <form> tag)
// call this function...
function getResults(element) {
  // clear old results or create a blank object in the results to
  // hold these results...
  res[element.id] = {};
  // when we add to the tmpRes object, only the correct
  // object in the results are touched...
  let tmpRes = res[element.id];

  let allResponses = [...element.querySelectorAll(".response")];
  // get all the checkboxes
  cb = allResponses
    .filter((x) => x.type == "checkbox")
    .map((x) => (tmpRes[x.value] = x.checked));

  // get all the text and radio elements...
  rd = allResponses
    .filter(
      (x) =>
        (x.type == "radio" && x.checked) ||
        ["text", "date", "email", "number", "tel"].includes(x.type)
    )
    .map((x) => (tmpRes[x.name] = x.value));
}

// x is the questionnaire text

export function evaluateCondition(txt) {
  let mjsfun = Object.getOwnPropertyNames(myFunctions)

  txt = decodeURIComponent(txt)
  console.log("evaluateCondition: ===>", txt)
  // if someone passes (#currentYear - 2), this becomes 2022 - 2.
  // we need to evaluate this to 2020...
  //  if (mjsfun.some(f => txt.includes(f)) ||
  //    (/^\s*[\(\d][\(\)\s\+\-\*\/\d]+[\d\)]$/.test(txt))) {
  //    let v = math.evaluate(txt)
  //    console.log(`${txt} ==> ${v}`)
  //    return v
  //  }

  // try to evaluate using mathjs...
  // if we fail, fall back to old evaluation...
  try {
    let v = math.evaluate(txt)
    console.log(`${txt} ==> ${v}`)
    return v
  } catch (err) {
    console.log("--- falling back to old evaluation ---")

    //refactored to displayIf from parse
    function replaceValue(x) {
      if (typeof x === "string") {
        let element = document.getElementById(x);
        if (element != null) {
          if (element.hasAttribute('grid') && (element.type === "radio" || element.type === "checkbox")) {
            //for displayif conditions with grid elements
            x = element.checked ? 1 : 0;
          }
          else {
            let tmpVal = x;
            x = document.getElementById(x).value;
            if (typeof x == "object" && Array.isArray(x) != true) {
              x = x[tmpVal];
            }
          }

        } else {
          //look up by name
          let temp1 = [...document.getElementsByName(x)].filter(
            (y) => y.checked
          )[0];
          x = temp1 ? temp1.value : x;
          // ***** if it's neither... look in the previous module *****
          if (!temp1) {
            // ISSUE 383: when moduleParams.previousResults[x] is 0.  It is FALSE and you 
            // dont replace the key with the value.
            x = moduleParams.previousResults.hasOwnProperty(x) ? moduleParams.previousResults[x] : x;
          }
        }
      }
      return x;

    }
    //https://stackoverflow.com/questions/6323417/regex-to-extract-all-matches-from-string-using-regexp-exec
    var re = /[\(\),]/g;
    var stack = [];
    var lastMatch = 0;
    for (const match of txt.matchAll(re)) {
      stack.push(match.input.substr(lastMatch, match.index - lastMatch));
      stack.push(match.input.charAt(match.index));
      lastMatch = match.index + 1;
    }
    // remove all blanks...
    stack = stack.filter((x) => x != "");

    while (stack.indexOf(")") > 0) {
      let callEnd = stack.indexOf(")");
      if (
        stack[callEnd - 4] == "(" &&
        stack[callEnd - 2] == "," &&
        stack[callEnd - 5] in knownFunctions
      ) {
        // it might hurt performance, but for debugging
        // expliciting setting the variables are helpful...
        let fun = stack[callEnd - 5];
        let arg1 = stack[callEnd - 3];
        // arg1 one should be a id or a boolean...
        // either from a element in the document or
        // from the currently undefined last module...
        arg1 = replaceValue(arg1);
        let arg2 = stack[callEnd - 1];
        arg2 = replaceValue(arg2);
        let tmpValue = knownFunctions[fun](arg1, arg2);
        // replace from callEnd-5 to callEnd with  the results...
        // splice start at callEnd-5, remove 6, add the calculated value...
        stack.splice(callEnd - 5, 6, tmpValue);
      } else {
        throw { Message: "Bad Displayif Function: " + txt, Stack: stack };
      }
    }
    return stack[0];
  }
}
window.evaluateCondition = evaluateCondition
window.questionQueue = questionQueue
