import { Tree } from "./tree.js";
import { clearValidationError, validateInput, validationError } from "./validate.js"
import { hideLoadingIndicator, translate, showLoadingIndicator } from "./common.js";
import { math } from './customMathJSImplementation.js';
import { restoreResponses } from "./restoreResponses.js";
import { getStateManager } from "./stateManager.js";
import { evaluateCondition } from "./evaluateConditions.js";
import { manageAccessibleQuestion } from "./accessibleQuestionTextBuilder.js";
export const moduleParams = {};

// The questionQueue is a Tree. It contains the question ids in the order they should be displayed.
export const questionQueue = new Tree();

/**
 * Determine the storage format for the response data.
 * Grid questions are stored as objects. Ensure each key is stored with the response.
 * Single response (radio) input questions are stored as primitives.
 * Multi-selection (checkbox) input questions are stored as arrays.
 * @param {HTMLElement} form - the form element being evaluated.
 * @returns {number} - the number of response keys.
 */

function countResponseInputs(form) {
  const responseInputs = new Set();

  form.querySelectorAll("input, textarea, select").forEach((current) => {
    if (current.type !== "submit" && current.type !== "hidden") {
      if (["radio", "checkbox"].includes(current.type)) {
        responseInputs.add(current.name);
      } else {
        responseInputs.add(current.id);
      }
    }
  });

  // Cache the number of response keys for the form so it doesn't re-evaluate every keystroke.
  const appState = getStateManager();
  appState.setNumResponseInputs(form.id, responseInputs.size);
  appState.clearOtherResponseInputEntries(form.id);
  return responseInputs.size;
}

/**
 * Update the state manager with the response value(s).
 * @param {HTMLElement} form - the form element being evaluated (the active survey quesiton).
 * @param {string} value - the response value.
 * @param {string} id - the response id.
 * @returns {void} - sets the response value in the state manager.
 */

function setResponsesInState(form, value, id) {
  const appState = getStateManager();
  const numResponses = appState?.getNumResponseInputs(form.id) || countResponseInputs(form);
  
  // Validate and sanitize inputs.
  if (!id || id.trim() === "") return;

  // Normalize value to undefined if it is an empty string or an empty array.
  // This is necessary to ensure that the value is removed from the store.
  if (value === "" || (Array.isArray(value) && value.length === 0)) {
    value = undefined;
  }

  switch (numResponses) {
    case 0:
      break;

    default:
      if (value === undefined || value === null) {
        appState.removeResponseItem(form.id, id, numResponses);
      } else {
        appState.setResponse(form.id, id, numResponses, value);
      }
      break;
  }
}

export function parseSSN(event) {
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
}

export function callExchangeValues(nextElement) {
  exchangeValue(nextElement, "min", "data-min");
  exchangeValue(nextElement, "max", "data-max")
  exchangeValue(nextElement, "minval", "data-min");
  exchangeValue(nextElement, "maxval", "data-max")
  exchangeValue(nextElement, "data-min", "data-min")
  exchangeValue(nextElement, "data-max", "data-max");
}

function exchangeValue(element, attrName, newAttrName) {
  let attr = element.getAttribute(attrName)?.trim();

  // !!! DONT EVALUATE 2020-01 to 2019
  // !!! DONT EVALUATE 2023-07-19-to 1997
  // may have to do this for dates too.  <- yeah, had to!
  // Firefox and Safari for MacOS think <input type="month"> has type="text"...
  // so month selection calendar is not shown.
  if ( (element.getAttribute("type") === "month" && /^\d{4}-\d{1,2}$/.test(attr)) || 
       (element.getAttribute("type") === "date" && /^\d{4}-\d{1,2}-\d{1,2}$/.test(attr)) ){
    
    // if leading zero for single digit month was stripped by the browser, add it back.
    if (element.getAttribute("type") === "month" && /^\d{4}-\d$/.test(attr)) {
      attr = attr.replace(/-(\d)$/, '-0$1')
    }
    
    element.setAttribute(newAttrName, attr)
    return element;
  }

  if (attr) {
    if (isNaN(attr)) {
      let tmpVal = evaluateCondition(attr);
      // note: tmpVal==tmpVal means that tmpVal is Not Nan
      if (tmpVal == undefined || tmpVal == null || tmpVal != tmpVal) {
        const previousResultsErrorMessage = moduleParams.previousResults && typeof moduleParams.previousResults === 'object' && Object.keys(moduleParams.previousResults)?.length === 0 && attr.includes('isDefined')
          ? `\nUsing the Markup Renderer?\nEnsure your variables are added to Settings -> Previous Results in JSON format.\nEx: {"AGE": "45"}`
          : '';
        moduleParams.errorLogger(`Module Coding Error: Evaluating ${element.id}:${attrName} expression ${attr}  => ${tmpVal} ${previousResultsErrorMessage}`)
        validationError(element, `Module Coding Error: ${element.id}:${attrName} ${previousResultsErrorMessage}`)
        return
      }
      element.setAttribute(newAttrName, tmpVal);
    } else {
      element.setAttribute(newAttrName, attr);
    }
  }
  return element;
}

/**
 * Replace the found argument with the form ID for accurate validation.
 * Sometimes the input element ID doesn't match the form ID due to the markdown/DOM structure.
 * Search for the parent form ID (which will match a key in state), and replace the date input ID for accurate validation.
 * Relevant for evaluateCondition calls e.g. min=valueOrDefault("<Some_ID>","2020-03").
 * Example usage: COVID-19 Survey, 'When you had COVID-19' summary page.
 * @param {string} attribute - the attribute to resolve
 * @returns {string} - the resolved attribute.
 */

function resolveAttributeToParentID(attribute, appState) {
  if (!attribute) return '';
  const decodedAttribute = decodeURIComponent(attribute);

  // If item found in state, no further evaluation needed.
  if (appState.findResponseValue(decodedAttribute)) {
    return decodedAttribute;
  }
  
  // If not found in state, search for the parent form ID.
  const questionProcessor = appState.getQuestionProcessor();
  const foundFormID = questionProcessor.findRelatedFormID(decodedAttribute);

  // Sanity Check the foundFormID is in the surveyState. Check Object keys (compound responses) and string keys (simple responses).
  // Handles edge case where formID references a summary page or anothter set of responses.
  if (foundFormID) {
    const foundResponse = appState.getItem(foundFormID);
    if (foundResponse) {
        if (typeof foundResponse === 'object' && foundResponse[decodedAttribute]) {
          return foundFormID;
        } else if (typeof foundResponse === 'string') {
          return foundFormID;
        }
    }
    return '';
  }

  return decodedAttribute;
}

/**
 * Resolve the entered attributes for the runtime evaluateCondition functions.
 * @param {string} attribute - the attribute to resolve (e.g. valueLength("ID")).
 * @returns {string} - the resolved value.
 */

const valueLengthRegex = /valueLength\(["']([a-zA-Z0-9_]+?)["'](.*)\)/;
const doesNotExistRegex = /doesNotExist\(["']([a-zA-Z0-9_]+?)["'](.*)\)/;
const existsRegex = /exists\(["']([a-zA-Z0-9_]+?)["'](.*)\)/;
const equalsRegex = /equals\(["']([a-zA-Z0-9_]+?)["'](.*)\)/;
const isNotDefinedRegex = /isNotDefined\(["']([a-zA-Z0-9_]+?)["'](.*)\)/;
const conceptIDMatchRegex = /\b\d{9}\b/

const resolveRuntimeConditions = (attribute) => {
  const attributeConditionString = decodeURIComponent(attribute);
  const appState = getStateManager();

  // Check if the attribute contains nested functions (multiple conditions to evaluate from the markdown).
  function hasNestedFunctions(str) {
    const firstIndex = str.indexOf('(');
    if (firstIndex === -1) return false; // No '(' found
    
    const secondIndex = str.indexOf('(', firstIndex + 1);
    return secondIndex !== -1;
  }

  // Only simple functions are evaluated here. If the attribute contains nested functions, return early.
  if (hasNestedFunctions(attributeConditionString)) {
    return null;
  }

  const resolveCondition = (regex, additionalConstraint = null) => {
    const match = attributeConditionString.match(regex);
    if (match && match[1]) {
      const idToSearch = match[1];
      if (idToSearch) {
        const value = appState.findResponseValue(idToSearch);
        if (typeof value === 'string' && value.length > 0 && (!additionalConstraint || !value.match(additionalConstraint))) {
          return value;
        }
      }
    }
  }

  const value = resolveCondition(valueLengthRegex, conceptIDMatchRegex) ||
    resolveCondition(doesNotExistRegex) ||
    resolveCondition(existsRegex) ||
    resolveCondition(equalsRegex, conceptIDMatchRegex) ||
    resolveCondition(isNotDefinedRegex)

  if (value !== null) {
    return value;
  }

  if (!['valueLength', 'doesNotExist', 'exists', 'equals', 'isNotDefined'].some(substring => attributeConditionString.includes(substring))) {
    moduleParams.errorLogger(`Unhandled attribute type in ${attributeConditionString} (resolveRuntimeConditions)`);
  }
  
  return '';
}

/**
 * Evaluate the condition in the 'forid' attribute for runtime functions.
 * ForID attributes are used to evaluate conditions at runtime and update the DOM accordingly.
 * For questions where one response exists, we need to evaluate the parent ID (mismatch to the response ID).
 * When multiple responses exist, we evaluate the response ID directly.
 * @param {Array<Node>} forIDElementArray - the array of 'forid' elements to evaluate.
 * @param {boolean} [returnToQuestion=false] - re-evaluation of the question: may need to inspect the original forid value for changed responses.
 * @returns {void} - updates the DOM with the evaluated values.
 */
export const handleForIDAttributes = (forIDElementArray, returnToQuestion = false) => {
  const appState = getStateManager();

  if (forIDElementArray.length === 1) {
    const forIDElement = forIDElementArray[0];
    const forid = decodeURIComponent(forIDElement.getAttribute("forid"));
    
    // Parent ID will be the result in most cases. Caveat: Multi-response questions (Arrays).
    const parentID = resolveAttributeToParentID(forid, appState);
    const defaultValue = forIDElement.getAttribute("optional");

    // Get the updated value from the state manager. But check for an object (array) type.
    // When that exists, there's an 'other' text input reponse field in the question. Do not resolve to the parent for those cases.
    // The value is either resolved as a string response in the valueOrDefault() call or it's an empty string (Participant left field empty).
    let updatedValue = math.valueOrDefault(parentID, defaultValue);
    if (typeof updatedValue === 'object' && Array.isArray(updatedValue)) {
      updatedValue = '';
    } else {
      forIDElement.setAttribute('forid', parentID);
      
      // Store the original value in case the user changes their response.
      if (!forIDElement.hasAttribute('original-forid')) {
        forIDElement.setAttribute('original-forid', forid);
      }

      // Update the parent displayif attribute if it exists.
      const closestDisplayIf = forIDElement.closest(".displayif");
      if (closestDisplayIf) {
        const parentDisplayIf = closestDisplayIf.getAttribute('displayif').replace(forid, parentID);
        closestDisplayIf.setAttribute('displayif', parentDisplayIf)
      }
    }

    if (returnToQuestion && /^\d{9}$/.test(updatedValue)) {
      const originalForIDValue = appState.findResponseValue(forIDElement.getAttribute('original-forid'));
      if (originalForIDValue && originalForIDValue !== updatedValue) {
        updatedValue = originalForIDValue;
      }
    }

    if (/^\d{9}$/.test(updatedValue)) {
      updatedValue = '';
    }

    forIDElement.textContent = updatedValue;

  } else {
    // Some forID elements are directly wrapped with a displayif container, 1:1.
    // Other forID elements are grouped and wrapped with a single displayif container, 1:n.
    const displayIfContainerMap = new Map();

    forIDElementArray.forEach(forIDElement => {
      const forid = decodeURIComponent(forIDElement.getAttribute("forid"));
      let parentID = '';

      let foundValue = appState.findResponseValue(forid);
      if (foundValue == null) {
        parentID = resolveAttributeToParentID(forid, appState);
        if (parentID) {
          foundValue = appState.findResponseValue(parentID);
        }
      }

      if (!foundValue || typeof foundValue === 'object' || /^\d{9}$/.test(foundValue)) {
        foundValue = '';
      }

      // Update the forIDElement's content and display values.
      if (foundValue !== '') {
        forIDElement.style.display = '';
        forIDElement.textContent = foundValue;
      } else {
        forIDElement.style.display = 'none';
      }

      // Handle the case where a forID element is directly wrapped in a displayif container.
      const parentDisplayIf = forIDElement.parentElement;
      const isDirectDisplayif = parentDisplayIf && parentDisplayIf.classList.contains('displayif');
      if (isDirectDisplayif) {
        // Initialize the container with an object holding truthyStates and parentIDs.
        if (!displayIfContainerMap.has(parentDisplayIf)) {
          displayIfContainerMap.set(parentDisplayIf, {
            truthyStates: [],
            parentIDs: []
          });
        }

        // Push the truthy state.
        const containerData = displayIfContainerMap.get(parentDisplayIf);
        containerData.truthyStates.push(foundValue !== '');
        // Store parentID if it's available.
        if (parentID) {
          containerData.parentIDs.push(parentID);
        }
      }
    });

    // Process each displayif container.
    displayIfContainerMap.forEach((containerData, container) => {
      // If any forID element is truthy, show the container. Otherwise, hide it.
      const { truthyStates, parentIDs } = containerData;
      if (truthyStates.some(state => state)) {
        let conditionEval;
        const displayIfAttribute = container.getAttribute('displayif');
        if (displayIfAttribute) {
          conditionEval = evaluateCondition(displayIfAttribute);
        }

        // If conditionEval is truthy or parentID exists, display the container.
        // Handles case where a displayif / parentID mismatch occurs after searching for the parentID.
        (conditionEval || parentIDs.length)
          ? container.style.display = ''
          : container.style.display = 'none';
      } else {
        container.style.display = 'none';
      }
    });
  }
}

export function textboxinput(inputElement, validate = true) {

  let evalBool = "";
  const modalElement = document.getElementById('softModalResponse');
  if (!modalElement.classList.contains('show')) {
  
    const modal = new bootstrap.Modal(modalElement);

    if (inputElement.getAttribute("modalif") && inputElement.value != "") {
      evalBool = math.evaluate(
        decodeURIComponent(inputElement.getAttribute("modalif").replace(/value/, inputElement.value))
      );
    }

    if (inputElement.getAttribute("softedit") == "true" && evalBool == true) {
      if (inputElement.getAttribute("modalvalue")) {
        document.getElementById("modalResponseBody").innerText = decodeURIComponent(inputElement.getAttribute("modalvalue"));

        modal.show();
      }
    }
  }

  if (inputElement.className == "SSN") {
    // handles SSN auto-format
    parseSSN(inputElement);
  }

  if (['text', 'number', 'email', 'tel', 'date', 'month', 'time'].includes(inputElement.type)) {
    if (validate) {
      validateInput(inputElement)
    }
  }

  // BUG 423: radio button not changing value
  let radioWithText = inputElement.closest(".response")?.querySelector("input[type='radio']")
  if (radioWithText && inputElement.value?.trim() !== ''){
    radioWithText.click()
    radioAndCheckboxUpdate(radioWithText)
  }

  clearSelection(inputElement);
  const id = inputElement.id
  const value = handleXOR(inputElement) || inputElement.value;
  setResponsesInState(inputElement.form, value, id);
}

// onInput/Change handler for radio/checkboxes
export function rbAndCbClick(event) {
  const inputElement = event.target;
  // when we programatically click, the input element is null.
  // however we call radioAndCheckboxUpdate directly..
  if (inputElement) {
    validateInput(inputElement)
    radioAndCheckboxUpdate(inputElement);
    radioAndCheckboxClearTextInput(inputElement);
  }
}


// If radio/checkboxes have input fields, only enable input fields when they are selected
// Get all responses that have an input text box (can be number, date, etc., not radio/checkbox)
// If the checkbox is not selected, disable it and clear the value.
// Note: things that can go wrong: if a response has more than one text box.
export function radioAndCheckboxClearTextInput(inputElement) {
  const responses = [...inputElement.form.querySelectorAll(".response")].filter(response => {
    const textBox = response.querySelector("input:not([type=radio]):not([type=checkbox])")
    const checkbox = response.querySelector("input[type=checkbox],input[type=radio]");
    return textBox && checkbox;
  });
  
  responses.forEach(response => {
    const textBox = response.querySelector("input:not([type=radio]):not([type=checkbox])")
    const radioOrCheckbox = response.querySelector("input[type=radio],input[type=checkbox]")

    if (textBox && radioOrCheckbox && !radioOrCheckbox.checked) {
      textBox.value = ""
      const formID = inputElement.form.id;
      const inputID = textBox.id;

      if (formID && inputID) {
        const appState = getStateManager();
        appState.removeResponseItem(formID, inputID, appState.getNumResponseInputs(formID));
      }
    }
  });
}

export function radioAndCheckboxUpdate(inputElement) {
  if (!inputElement) return;
  clearSelection(inputElement);

  let selectedValue;

  if (inputElement.type == "checkbox") {
    // get all checkboxes with the same name attribute...
    selectedValue = Array.from(inputElement.form.querySelectorAll(`input[type = "checkbox"][name = ${inputElement.name}]`))
      .filter((x) => x.checked)
      .map((x) => x.value);
  } else {
    // we have a radio button..  just get the selected value...
    selectedValue = inputElement.value;
  }

  setResponsesInState(inputElement.form, selectedValue, inputElement.name);
}

function clearSelection(inputElement) {
  if (!inputElement.form || !inputElement.name) return;
  const sameNameEles = [...inputElement.form.querySelectorAll(`input[name = ${inputElement.name}],input[name = ${inputElement.name}] + label > input`)].filter((x) => x.type != "hidden");
  if (!sameNameEles) return;

  const appState = getStateManager();
  
  // If this is a "none of the above", go through all elements with the same name and mark them as "false" or clear the text values.
  if (inputElement.dataset.reset) {
    sameNameEles.forEach((element) => {

      switch (element.type) {
        case "checkbox":
          element.checked = element == inputElement ? element.checked : false;
          break;

        case "radio":
          break;

        default:
          element.value = element == inputElement ? inputElement.value : "";
          setResponsesInState(element.form, element.value, element.id);
          if (element.nextElementSibling && element.nextElementSibling.children.length !== 0) element.nextElementSibling.children[0].innerText = "";
          element.form.classList.remove("invalid");
          appState.removeResponseItem(element.form.id, element.id, appState.getNumResponseInputs(element.form.id));
          break;
      }
    });
  } else {
    // otherwise if this as another element with the same name and is marked as "none of the above" clear that.
    // don't clear everything though because you are allowed to have multiple choices.
    sameNameEles.forEach((element) => {
      if (element.dataset.reset) {
        element.checked = false

        //removing specifically the reset value from the array of checkboxes checked and removing from forms.value
        const key1 = element.name;
        const elementValue = element.value;
        const numKeys = appState.getNumResponseInputs(element.form.id);
        const vals = appState.getItem(inputElement.form.id) ?? {};
        if (Object.prototype.hasOwnProperty.call(vals, key1) && Array.isArray(vals[key1]) && vals[key1].includes(elementValue)) {
          appState.removeResponseItem(element.form.id, key1, numKeys);
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
  
  const appState = getStateManager();
  const siblings = getXORSiblings(inputElement);
  siblings.forEach((sibling) => {
    appState.removeResponseItem(inputElement.form.id, sibling.id, appState.getNumResponseInputs(inputElement.form.id));
    resetSiblingDOMValues(sibling);
  });

  return inputElement.value;
}

function getXORSiblings(inputElement) {
  return [...inputElement.parentElement.querySelectorAll("input")].filter(sibling => 
    sibling.id !== inputElement.id &&
    sibling.hasAttribute("xor") &&
    sibling.getAttribute("xor") === inputElement.getAttribute("xor")
  );
}

function resetSiblingDOMValues(sibling) {
  if (["checkbox", "radio"].includes(sibling.type)) {
    sibling.checked = sibling.dataset.reset ? false : sibling.checked;
  } else {
    sibling.value = "";
    clearXORValidationMessage(sibling);
  }
}

function clearXORValidationMessage(inputElement) {
  const messageSpan = inputElement.nextElementSibling?.children[0];
  if (messageSpan?.tagName === "SPAN" && messageSpan.innerText.length !== 0) {
    messageSpan.innerText = "";
    inputElement.classList.remove("invalid");
    inputElement.form.classList.remove('invalid');
    inputElement.nextElementSibling.remove();
  }
}

export async function nextButtonClicked(nextOrPreviousButton) {
  // Because next button does not have ID, modal will pass-in ID of question
  if (typeof nextOrPreviousButton == "string") {
    nextOrPreviousButton = moduleParams.questDiv.querySelector(`#${nextOrPreviousButton} .next`)
  }

  // check that each required element is set...
  nextOrPreviousButton.form.querySelectorAll("[data-required]").forEach((elm) => {
    validateInput(elm)
  });

  await analyzeFormResponses(nextOrPreviousButton);
}

async function analyzeFormResponses(nextOrPreviousButton) {
  if (nextOrPreviousButton.form.getAttribute("softedit") === "true" || nextOrPreviousButton.form.getAttribute("hardedit") === "true") {
    // Fieldset is the parent of the inputs for all but grid questions. Grid questions are in a table.
    const fieldset = nextOrPreviousButton.form.querySelector('fieldset') || nextOrPreviousButton.form.querySelector('tbody');

    let numBlankResponses = [...fieldset.children]
      .filter(x => 
        x.tagName !== 'DIV' && x.tagName !== 'BR' &&
        x.type && x.type !== 'hidden' &&
        x.value !== undefined &&
        (x.style ? x.style.display !== "none" : true) &&
        !x.hasAttribute("xor")
      ).reduce((t, x) =>
        x.value.length == 0 ? t + 1 : t, 0
      );
      
    let responsesAreIncomplete = getSelectedResponses(fieldset).filter((x) => x.type !== "hidden").length === 0;

    if (fieldset.hasAttribute("radioCheckboxAndInput") && !radioCbHasAllAnswers(fieldset)) {
      responsesAreIncomplete = true;
    }

    if (nextOrPreviousButton.form.dataset.grid) {
      numBlankResponses = numUnansweredGridQuestions(fieldset);

      if (!gridHasAllAnswers(fieldset)) {
        responsesAreIncomplete = true;
      }
    }

    if (responsesAreIncomplete) {
      if (numBlankResponses === 0) {
        numBlankResponses = 1;
      }
    } else {
      numBlankResponses = 0;
    }

    if (numBlankResponses > 0) {
      showNumUnansweredQuestionsModal(numBlankResponses, nextOrPreviousButton, nextOrPreviousButton.form.getAttribute("softedit") == "true");
      return null;
    }
  }

  await getNextQuestion(nextOrPreviousButton);
}

function showNumUnansweredQuestionsModal(num, nextOrPreviousButton, soft) {
  const prompt = translate("basePrompt", [num > 1 ? "are" : "is", num, num > 1 ? "s" : ""]);

  const modalID = soft ? 'softModal' : 'hardModal';
  const modal = new bootstrap.Modal(document.getElementById(modalID));
  const softModalText = translate("softPrompt");
  const hardModalText = translate("hardPrompt", [num > 1 ? "s" : ""]);

  const modalBodyTextId = soft ? "modalBodyText" : "hardModalBodyText";
  const modalBodyTextEle = document.getElementById(modalBodyTextId);

  modalBodyTextEle.innerText = `${prompt} ${soft ? softModalText : hardModalText}`;
  modalBodyTextEle.setAttribute('tabindex', '0');
  modalBodyTextEle.setAttribute('role', 'alert');

  if (soft) {
    const continueButton = document.getElementById("modalContinueButton");
    continueButton.removeEventListener("click", continueButton.clickHandler);
    continueButton.clickHandler = async () => {
      await getNextQuestion(nextOrPreviousButton);
    };
    continueButton.addEventListener("click", continueButton.clickHandler);
  }

  modal.show();

  // Set focus to the modal title
  document.getElementById("softModalTitle").focus();

  let modalElement = modal._element;
  modalElement.querySelector('.btn-close').addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      modal.hide();
    }
  });
}

/**
 * Get the next question from the questionQueue if it exists. Otherwise get the next sequential question from the markdown.
 * @returns {string} - the ID of the next question to load.
 */

function getNextQuestionId() {
  let nextQuestionNode = questionQueue.next();

  if (nextQuestionNode.done) {
    const appState = getStateManager();
    const questionProcessor = appState.getQuestionProcessor();
    const nextSequentialQuestionID = questionProcessor.getNextSequentialQuestionID();

    questionQueue.add(nextSequentialQuestionID);
    nextQuestionNode = questionQueue.next();
  }

  return nextQuestionNode.value.value;
}

// The root is defined as null, so if the question is not the same as the
// current value in the questionQueue, or root has no children, add it.
export async function getNextQuestion(nextOrPreviousButton, revertOnStoreError = false) {
  const questionElement = nextOrPreviousButton.form;

  // These are grid elements that aren't shown due to displayifs and previous response evaluations.
  // See: MRE survey - "On the days that you did these household or shopping activities, ..."
  // legacy code: 'id' is undef for MRE survey. 'question-id' exists, but current behavior is aligned with production data.
  questionElement.querySelectorAll("[data-hidden]").forEach((x) => {
    x.value = "true"
    setResponsesInState(questionElement, x.value, x.id)
  });

  if (checkValid(questionElement) === false) {
    return null;
  }

  const appState = getStateManager();
  const questionProcessor = appState.getQuestionProcessor();

  if (!revertOnStoreError) {
    appState.syncToStore(nextOrPreviousButton);
  }

  if (questionQueue.isEmpty()) {
    questionQueue.add(questionElement.id);
    questionQueue.next();
  }

  // check if we need to add questions to the question queue
  checkForSkips(questionElement);

  let nextQuestionId = getNextQuestionId();

  let nextQuestionEle = questionProcessor.loadNextQuestion(nextQuestionId);
  nextQuestionEle = exitLoop(nextQuestionEle);

  // before we add the next question to the queue...
  // check for the displayif status...
  while (nextQuestionEle?.hasAttribute("displayif")) {
    if (nextQuestionEle.classList.contains("question")) {
      let shouldDisplayQuestion = evaluateCondition(nextQuestionEle.getAttribute("displayif"));
      if (shouldDisplayQuestion) break;

      if (nextQuestionEle.id.substring(0, 9) !== "_CONTINUE") questionQueue.pop();

      let nextQuestionId = nextQuestionEle.dataset.nodisplay_skip;
      if (nextQuestionEle.dataset.nodisplay_skip) {
        questionQueue.add(nextQuestionEle.dataset.nodisplay_skip);
      }

      nextQuestionId = getNextQuestionId();
      nextQuestionEle = questionProcessor.loadNextQuestion(nextQuestionId);
      nextQuestionEle = exitLoop(nextQuestionEle);
    } else {
      moduleParams.errorLogger(`Error (nextPage): nextQuestionEle is not a question element. ${nextQuestionEle}`);
      console.trace();
    }
  }

  if (nextQuestionEle.id === 'END_OF_LOOP') {
    const nextQuestionID = questionProcessor.getNextSequentialQuestionID();
    nextQuestionEle = questionProcessor.loadNextQuestion(nextQuestionID);

    questionQueue.pop();
    questionQueue.add(nextQuestionEle.id);
    questionQueue.next();
  }

  await swapVisibleQuestion(nextQuestionEle);
}

function exitLoop(nextQuestionEle) {
  if (!nextQuestionEle || !nextQuestionEle.hasAttribute("firstquestion")) {
    return nextQuestionEle;
  }
  
  const appState = getStateManager();
  const questionProcessor = appState.getQuestionProcessor();
  const loopData = questionProcessor.getLoopData(nextQuestionEle.id);
  const loopMaxResponse = loopData?.loopMaxResponse;

  // 0 is a valid loopMaxResponse value. That will result in jumping to the end of the loop on 'firstquestion' load.
  if (loopMaxResponse == null) {
    moduleParams.errorLogger(`LoopData is null or undefined for ${nextQuestionEle.id}`);
    return nextQuestionEle;
  }

  const firstQuestion = parseInt(nextQuestionEle.getAttribute("firstquestion"));
  const loopIndex = parseInt(nextQuestionEle.getAttribute("loopindx"));

  if (isNaN(loopMaxResponse) || isNaN(firstQuestion) || isNaN(loopIndex)) {
    moduleParams.errorLogger(`LoopMax, firstQuestion, or loopIndex is NaN for ${nextQuestionEle.id}: loopMax=${loopMaxResponse}, firstQuestion=${firstQuestion}, loopIndex=${loopIndex}`);
    return nextQuestionEle;
  }

  if (math.evaluate(firstQuestion > loopMaxResponse)) {
    const { question } = questionProcessor.findEndOfLoop();

    questionQueue.pop();
    questionQueue.add(question.id);
    questionQueue.next();

    nextQuestionEle = questionProcessor.loadNextQuestion(question.id);
  }
  
  return nextQuestionEle;
}

/**
 * Update the active question in the DOM.
 * Identifies the existing question and swaps it with the new question.
 * If an existing question is not found (this happens on startup), the new question is appended to the parent div.
 * @param {HTMLElement} questDiv - The parent div housing the Quest UI.
 * @param {string} questionHTMLString - The HTML string of the question to be swapped in.
 */
export async function swapVisibleQuestion(questionEle) {
  // return early if the renderer tool is active and displaying the full question list.
  if (moduleParams.renderFullQuestionList) return;

  if (!questionEle) {
    moduleParams.errorLogger(`swapVisibleQuestion: questionEle is null or undefined.`);
    return;
  }

  const questDiv = moduleParams.questDiv;

  const existingQuestionEle = questDiv.querySelector('.question');
  if (existingQuestionEle) {
    questDiv.replaceChild(questionEle, existingQuestionEle);
  } else {
    // Handle the survey loading case (first quesiton added).
    const modalEle = questDiv.querySelector('.modal');
    modalEle
      ? questDiv.insertBefore(questionEle, modalEle)
      : questDiv.appendChild(questionEle);
  }

  // Ensure the question is appended to the active DOM before calling prepareQuestionDOM for accessibility.
  await prepareQuestionDOM(questionEle);

  return questionEle;
}

export function showAllQuestions(allProcessedQuestionsMap) {
  const questDiv = moduleParams.questDiv;
  const modalEle = questDiv.querySelector('.modal');

  const fragment = document.createDocumentFragment();

  allProcessedQuestionsMap.forEach((questionEle) => {
    if (questionEle.id === 'END_OF_LOOP') {
      questionEle.style.display = 'none';
    }
    fragment.appendChild(questionEle);
  });

  modalEle
    ? questDiv.insertBefore(fragment, modalEle)
    : questDiv.appendChild(fragment);

  // Popovers get initialized last, after all other DOM and accessibility operations, to ensure they are in the DOM and visible (Bootstrap 5 requirement).
  initializePopovers();
}

// Manage the text builder for screen readers (only build when necessary)
let questionFocusSet;
export async function prepareQuestionDOM(questionElement) {
  // Fail gently in the renderer tool.
  if (!questionElement && !moduleParams.activate) return;
  // Reset the questionFocusSet flag to reset accessibility features.
  questionFocusSet = false;

  // Handle questions in moduleParams.asyncQuestionsMap. These are fetched externally and appended to the DOM. Uncommon. Connect example: SOCcer.
  if (Object.keys(moduleParams.asyncQuestionsMap).length > 0 && Object.keys(moduleParams.asyncQuestionsMap).includes(questionElement.id) && moduleParams.fetchAsyncQuestion instanceof Function) {
    const fieldset = questionElement.querySelector('fieldset') || questionElement.querySelector('tbody');
    await manageAsyncQuestionLoad(fieldset, questionElement.id);
  }

  handleQuestionDisplayIfs(questionElement);
  handleQuestionInputAttributes(questionElement);

  // JAWS (Windows) requires tabindex to be set on the response divs for the radio buttons to be accessible.
  // The tabindex leads to a negative user experience in VoiceOver (macOS).
  if (moduleParams.isWindowsEnvironment) {
    [...questionElement.querySelectorAll("div.response")].forEach((responseElement) => {
      responseElement.setAttribute("tabindex", "0");
    });

    [...questionElement.querySelectorAll("td.response")].forEach((responseElement) => {
      const radioOrCheckbox = responseElement.querySelector('input[type="checkbox"], input[type="radio"]');
      if (radioOrCheckbox) {
        radioOrCheckbox.setAttribute("tabindex", "0");
      }
    });
  }

  // Remove the reset answer button if there are no response inputs
  const numResponseInputs = countResponseInputs(questionElement);
  if (numResponseInputs === 0 && questionElement.id !== 'END') {
    const resetButton = questionElement.querySelector('.reset');
    if (resetButton) {
      resetButton.remove();
    }
  }

  const appState = getStateManager();
  const questionProcessor = appState.getQuestionProcessor();

  if (moduleParams.showProgressBarInQuest) {  
    updateProgressBar(questionProcessor);
  }

  if (moduleParams.activate) {
    handleUserScrollLocation();

    // Handle accessibility features after the question renders.
    // The question text is at the opening fieldset tag OR at the top of the nextElement form for tables.
    questionFocusSet = manageAccessibleQuestion(questionElement.querySelector('fieldset') || questionElement, questionFocusSet);
  }

  // Popovers get initialized last, after all other DOM and accessibility operations, to ensure they are in the DOM and visible (Bootstrap 5 requirement).
  initializePopovers();
}

/**
 * The progress bar is an optional feature managed by the moduleParams.showProgressBarInQuest flag.
 * It is displayed at the top of the questionnaire and updates as the user progresses through the questions.
 * @param {QuestionProcessor} questionProcessor - The question processor object (managed in state)
 */
function updateProgressBar(questionProcessor) {
  const progressBar = moduleParams.questDiv.querySelector('.progress-bar');
  const progressText = document.getElementById('progressBarText');
  if (!progressBar || !progressText) return;
  
  let completionPercentage = 0;

  if (Array.isArray(questionProcessor.questions) && questionProcessor.questions.length > 0) {
    const currentQuestionIndex = questionProcessor.currentQuestionIndex;
    const totalQuestions = questionProcessor.questions.length;
    const fixedVal = totalQuestions > 500 ? 2 : totalQuestions > 100 ? 1 : 0;

    if (currentQuestionIndex === totalQuestions - 1) {
      completionPercentage = 100;
    } else {
      completionPercentage = parseFloat((currentQuestionIndex / totalQuestions * 100).toFixed(fixedVal));
    }

    progressBar.style.width = `${completionPercentage}%`;
    progressBar.setAttribute('aria-valuenow', `${Math.round(completionPercentage)}%`);
    progressText.textContent = `${Math.round(completionPercentage)}%`;
  }
}

/**
 * Async questions are fetched from external sources and appended to the DOM.
 * Fetch the data, remove the loading placeholder, and update the DOM.
 * moduleParams.asyncQuestionsMap contains the async question data.
 * @param {HTMLElement} fieldset - The fieldset element containing the async question.
 * @param {string} questionID - The ID of the async question to load.
 */
async function manageAsyncQuestionLoad(fieldset, questionID) {
  showLoadingIndicator();
  clearValidationError(fieldset);
  insertLoadingTextNode(fieldset);

  const funcToFetch = moduleParams.asyncQuestionsMap[questionID].func;
  const relatedArgs = moduleParams.asyncQuestionsMap[questionID].args;
  const appState = getStateManager();

  const args = [
    ...relatedArgs.map(arg => appState.findResponseValue(arg) ?? ''),
    moduleParams.i18n.language,
  ];
  
  try {
    await moduleParams.fetchAsyncQuestion(funcToFetch, args);

  } catch (error) {
    moduleParams.errorLogger(`Error fetching async question: ${error}, Function: ${funcToFetch}, Args: ${relatedArgs}`);
    validationError(fieldset, `Error fetching question. Please go back and try again.`);
    
  } finally {
    removeLoadingTextNode(fieldset);
    hideLoadingIndicator();
  }
}

// For async questions: Make sure the loading text is visible.
function insertLoadingTextNode(fieldset) {
  const loadingText = moduleParams.i18n.loading;
  let loadingTextNode = Array.from(fieldset.childNodes).find(node =>
    node.nodeType === Node.TEXT_NODE && node.nodeValue.trim() === loadingText
  );

  if (!loadingTextNode) {
    loadingTextNode = document.createTextNode(loadingText);
    fieldset.insertBefore(loadingTextNode, fieldset.firstChild);
  }
}

// For async questions: If a response element is found, remove the loading text.
function removeLoadingTextNode(fieldset) {
  const loadingText = moduleParams.i18n.loading;
  const responseElement = fieldset.querySelector('.response');
  if (responseElement) {
    const loadingTextNode = Array.from(fieldset.childNodes).find(node =>
      node.nodeType === Node.TEXT_NODE && node.nodeValue.trim() === loadingText
    );

    if (loadingTextNode) {
      fieldset.removeChild(loadingTextNode);
    }
  }
}

// Legacy operations: resolve attributes from markdown to HTML
function handleQuestionDisplayIfs(questionElement) {
  // When the input ID isn't the quesiton ID (e.g. YYYY-MM input), find the parent question ID
  const forIDElementArray = questionElement.querySelectorAll("span[forid]");
  if (forIDElementArray.length > 0) handleForIDAttributes(forIDElementArray);

  // check all responses for next question
  [...questionElement.querySelectorAll('[displayif]')].forEach((elm) => {
    let f = evaluateCondition(elm.getAttribute("displayif"));
    elm.style.display = f ? null : "none";
  });

  // check for displayif spans and divs...
  [...questionElement.querySelectorAll("span[displayif],div[displayif]")].forEach(elm => {
    manageDisplayIfSpansAndDivs(elm);
  });

  [...questionElement.querySelectorAll("span[data-encoded-expression]")].forEach(elm => {
    let f = evaluateCondition(decodeURIComponent(elm.dataset.encodedExpression))
    elm.innerText = f;
  });
  // ISSUE: 403
  // update {$e:}/{$u} and and {$} elements in grids when the user displays the question ...
  [...questionElement.querySelectorAll("[data-gridreplace]")].forEach((e) => {
    if (e.dataset.gridreplacetype == "_val") {
      e.innerText = math._value(decodeURIComponent(e.dataset.gridreplace))
    } else {
      e.innerText = math.evaluate(decodeURIComponent(e.dataset.gridreplace))
    }
  });

  // Check if grid elements need to be shown. Elm is a <tr>. If f !== true, remove the row (elm) from the DOM.
  [...questionElement.querySelectorAll("[data-gridrow][data-displayif]")].forEach((elm) => {
    const f = evaluateCondition(decodeURIComponent(elm.dataset.displayif));
    if (f !== true) {
      elm.dataset.hidden = "true";
      elm.style.display = "none";
    } else {
      delete elm.dataset.hidden;
      elm.style.display = "";
    }
  });
}

export function manageDisplayIfSpansAndDivs(elm) {  
  const conditionFunctionRegex = /\b\w+\s*\(\s*["']?.*?["']?\s*(,\s*["']?.*?["']?\s*)*\)/;
  const innerHTML = elm.innerHTML;
  const textHasFunction = conditionFunctionRegex.test(innerHTML);

  const displayIfAttribute = elm.getAttribute("displayif");
  let conditionBool = evaluateCondition(displayIfAttribute);

  if (conditionBool) {
    if (elm.getAttribute('data-fallback') === null) {
      elm.setAttribute('data-fallback', !textHasFunction ? innerHTML : '');
    }

    // Resolve runtime conditions and handle case (where the 'other' concept id is returned without response text)
    let displayIfText = resolveRuntimeConditions(displayIfAttribute) ?? elm.getAttribute('data-fallback');
    if (/^>\d{9}<$/.test(displayIfText)) {
      conditionBool = false;
      elm.removeAttribute('data-fallback');
    }

    if (conditionBool) {
      elm.style.display = null;

      let displayIfText = resolveRuntimeConditions(displayIfAttribute) ?? elm.getAttribute('data-fallback');
      if (displayIfText) {
        if (innerHTML.startsWith(',')) {
          displayIfText = ', ' + displayIfText;
        }
        elm.innerHTML = displayIfText;
      }
    } else {
      elm.style.display = "none";
    }
  }
}

// Legacy operations: resolve attributes from markdown to HTML
function handleQuestionInputAttributes(questionElement) {
  /////////////////////
  [...questionElement.querySelectorAll("input[data-max-validation-dependency]")].forEach((x) => {
    console.warn('TODO: REMOVE? NOT FOUND in DOM (document search) - input[data-max-validation-dependency]');
    x.max = document.getElementById(x.dataset.maxValidationDependency).value
  });

  [...questionElement.querySelectorAll("input[data-min-validation-dependency]")].forEach((x) => {
    console.warn('TODO: REMOVE? NOT FOUND in DOM (document search) - input[data-min-validation-dependency]');
    x.min = document.getElementById(x.dataset.minValidationDependency).value;
  });
  ///////////////////

  //Replacing all default HTML form validations with datasets
  [...questionElement.querySelectorAll("input[required]")].forEach((element) => {
    if (element.hasAttribute("required")) {
      element.removeAttribute("required");
      element.dataset.required = "true";
    }
  });

  [...questionElement.querySelectorAll("input[min]")].forEach((element) => {
    exchangeValue(element, "min", "data-min");
  });
  [...questionElement.querySelectorAll("input[max]")].forEach((element) => {
    exchangeValue(element, "max", "data-max")
  });
  // supporting legacy code... dont use minval
  [...questionElement.querySelectorAll("input[minval]")].forEach((element) => {
    exchangeValue(element, "minval", "data-min");
  });
  [...questionElement.querySelectorAll("input[maxval]")].forEach((element) => {
    exchangeValue(element, "maxval", "data-max");
  });

  [...questionElement.querySelectorAll("input[data-min]")].forEach((element) =>
    exchangeValue(element, "data-min", "data-min")
  );
  [...questionElement.querySelectorAll("input[data-max]")].forEach((element) => {
    exchangeValue(element, "data-max", "data-max");
  });

  // rewrite the data-(min|max)-date-uneval with a calulated value
  [...questionElement.querySelectorAll("input[data-min-date-uneval]")].forEach((element) => {
    exchangeValue(element, "data-min-date-uneval", "data-min-date");
    exchangeValue(element, "data-min-date-uneval", "min");
  });

  [...questionElement.querySelectorAll("input[data-max-date-uneval]")].forEach((element) => {
    exchangeValue(element, "data-max-date-uneval", "data-max-date");
    exchangeValue(element, "data-max-date-uneval", "max");
  });

  questionElement.querySelectorAll("[data-displaylist-args]").forEach(element => {
    element.innerHTML = math.existingValues(element.dataset.displaylistArgs);
  });

  // handle unsupported 'month' input type (Safari for MacOS and Firefox)
  const monthInputs = questionElement.querySelectorAll("input[type='month']");
  if (monthInputs.length > 0 && !isMonthInputSupported()) {
    monthInputs.forEach(input => {
      input.setAttribute('placeholder', 'YYYY-MM');
    });
  }
}

// Scroll higher on tablets and computers to show the site header.
// Focus specifically on the quest div (questions and resopnses) for smaller screens to minimize scrolling.
function handleUserScrollLocation() {
  let rootElement;
  if (isMobileDevice()) {
    rootElement = document.getElementById('progressBarContainer') || moduleParams.questDiv.parentElement || moduleParams.questDiv;
  } else {
    rootElement = document.documentElement;
  }

  rootElement.scrollIntoView({ behavior: 'smooth' });
}

export function isMobileDevice() {
  return window.matchMedia('(max-width: 576px)').matches;
}

/**
 * Initialize the popovers in the questionnaire after they are appended to the DOM.
 * Required for Bootstrap 5 popovers to function correctly.
 */

function initializePopovers() {
  const questDiv = moduleParams.questDiv;

  [...questDiv.querySelectorAll('[data-bs-toggle="popover"]')].forEach(popoverTriggerEl => {
    if (!bootstrap.Popover.getInstance(popoverTriggerEl)) {
      new bootstrap.Popover(popoverTriggerEl);
    }
  });
}

// Check whether the browser supports "month" input type.
// Browsers that do not support 'month' use 'text' input type fallback.
// So input.type === 'month' -> true when supported and false otherwise.
function isMonthInputSupported() {
  let input = document.createElement('input');
  input.setAttribute('type', 'month');
  const isSupported = input.type === 'month';

  input = null;
  return isSupported;
}

export async function getPreviousQuestion(nextOrPreviousButton, revertOnStoreError = false) {
  // Get the previousElement from questionQueue
  let pv = questionQueue.previous();
  while (pv.value.value.substring(0, 9) === "_CONTINUE") {
    pv = questionQueue.previous();
  }

  const appState = getStateManager();
  const questionProcessor = appState.getQuestionProcessor();

  if (!revertOnStoreError) {
    appState.syncToStore(nextOrPreviousButton);
  }

  const previousElementID = pv.value.value;
  const previousQuestionEle = questionProcessor.loadPreviousQuestion(previousElementID);

  await swapVisibleQuestion(previousQuestionEle);
  restoreResponses(appState.getSurveyState(), previousElementID);
}

// this function just adds questions to the
// question queue.  It always returns null;
function checkForSkips(questionElement) {
  // get selected responses
  let selectedElements = getSelectedResponses(questionElement);

  let numSelected = selectedElements.filter((x) => x.type != "hidden").length;
  // if there are NO non-hidden responses ...
  if (numSelected == 0) {
    // there may be either a noResponse, a default response, both, or neither...
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
export function gridHasAllAnswers(questionFieldset) {
  let gridRows = Array.from(questionFieldset.querySelectorAll("tr[data-gridrow='true']"));

  const checked = (element) => element.checked;
  return gridRows.reduce( (acc,current) => {
    if (current.style.display=='none') return acc // skip hidden rows

    let name = current.dataset.questionId
    let currentResponses = Array.from(current.parentElement.querySelectorAll(`input[type="radio"][name="${name}"], input[type="checkbox"][name="${name}"]`))
    return acc && currentResponses.some(checked)
  },true)
}

export function numUnansweredGridQuestions(questionFieldset) {
  let gridRows = Array.from(questionFieldset.querySelectorAll("tr[data-gridrow='true']"));
  const checked = (element) => element.checked;
  return gridRows.reduce( (acc,current) => {
    if (current.style.display=='none') return acc // skip hidden rows

    let name = current.dataset.questionId
    let currentResponses = Array.from(current.querySelectorAll(`input[type="radio"][name="${name}"], input[type="checkbox"][name="${name}"]`));
    return currentResponses.some(checked)?acc:(acc+1)
  },0)
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

// Look at radio, checkboxes, input fields, and hidden elements and return all checked or filled items.
// If nothing is checked, return empty array.
export function getSelectedResponses(questionElement) {
  const radiosAndCheckboxes = [...questionElement.querySelectorAll("input[type='radio'],input[type='checkbox']")].filter((x) => x.checked);
  const inputFields = [...questionElement.querySelectorAll("input[type='number'], input[type='text'], input[type='date'], input[type='month'], input[type='email'], input[type='time'], input[type='tel'], textarea, option")].filter((x) => x.value.length > 0);
  const hiddenInputs = [...questionElement.querySelectorAll("input[type='hidden']")].filter((x) => x.hasAttribute("checked"));

  return [...radiosAndCheckboxes, ...inputFields, ...hiddenInputs];
}
