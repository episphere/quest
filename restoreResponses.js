import { moduleParams, textboxinput, radioAndCheckboxUpdate } from "./questionnaire.js";
import { getStateManager } from "./stateManager.js";

function getFromRbCb(formElement, rbCbName, result) {
  const checkboxElements = Array.from(formElement.querySelectorAll(`input[name=${rbCbName}]`));
  checkboxElements.forEach((checkbox) => {
    if (result.includes(checkbox.value)) {
      checkbox.checked = true;
      radioAndCheckboxUpdate(checkbox);
    }
  });
}

// Get the first input / textarea in the form and fill it in.
// If the element is not on the page, it could have been dynamically create (think SOCcer) just return.
function handleSimpleStringResponse(formElement, response) {
  const element = formElement.querySelector("input,textarea,select");
  if (!element) return;

  if (element?.type === "radio") {
    const selector = `input[value='${response}']`;
    const selectedRadioElement = formElement.querySelector(selector);
    if (selectedRadioElement) {
      selectedRadioElement.checked = true;
    } else {
      moduleParams.errorLogger("RESTORE RESPONSE: Problem with radio:", element);
    }
    radioAndCheckboxUpdate(selectedRadioElement);

  } else if (element?.type === "submit") {
    moduleParams.errorLogger(`RESTORE RESPONSE: Response value: ${response}. Submit button: skipping update.`);
    return;
  } else {
    element.value = response;
    textboxinput(element, false);
  }
}

function handleObjectResponse(formElement, response) {
  Object.keys(response).forEach((resKey) => {
    if (!resKey) {
      moduleParams.errorLogger(`RESTORE RESPONSE: Response value: ${response}; skipping.`);
      return;
    }

    const resObject = response[resKey];
    const multiq = formElement.querySelector(`input[name='${resKey}'][value='${CSS.escape(resObject)}']`);

    let handled = false;
    if (typeof resObject === 'string') {
      handleStringInObjectResponse(formElement, resKey, resObject);
      handled = true;

    } else if (typeof resObject === 'object') {
      // Handle the array case
      if (Array.isArray(resObject)) {
        getFromRbCb(formElement, resKey, resObject);
        handled = true;  
      
      // Handle XOR objects
      } else {
        const element = Array.from(formElement.querySelectorAll(`[xor="${resKey}"]`));
        element.forEach((xorElement) => {
          if (resObject[xorElement.id]) {
            xorElement.value = resObject[xorElement.id];
          }
        });
        handled = true;  
      }
    }

    // check for mulitple radio buttons on 1 page.
    if (multiq) {
      multiq.checked = true
      handled = true;
    }

    if (handled) return;

    if (typeof resObject === "string") {
      const element = document.getElementById(resKey);
      if (element.tagName == "DIV" || element.tagName == "FORM") {
        const selector = `input[value='${response[resKey]}']`;
        const selectedRadioElement = element.querySelector(selector);
        if (selectedRadioElement) {
          selectedRadioElement.checked = true;
        } else {
          moduleParams.errorLogger("RESTORE RESPONSE: Problem with DIV/FORM:", element);
        }
        radioAndCheckboxUpdate(selectedRadioElement);
      } else {
        element.value = resObject;
        textboxinput(element, false);
      }
    }
  });
}

// Handle radio/checkbox and input elements
function handleStringInObjectResponse(questionElement, id, value) {
  const radioOrCheckboxElement = questionElement.querySelector(`[name='${id}'][value='${value.replaceAll("'", "\\'")}']`)
  if (radioOrCheckboxElement) {
    radioOrCheckboxElement.checked = true
    radioAndCheckboxUpdate(radioOrCheckboxElement)
    return;
  }

  const inputElement = questionElement.querySelector(`[id='${id}']`);
  if (inputElement) {
    inputElement.value = value
    textboxinput(inputElement, false);
    return;
  }

  console.warn('RESTORE RESPONSES (unhandled response)', questionElement, id, value)
}

/**
 * Restore Responses to already answered questions.
 * This activates on survey load (for unfinished surveys) and when the 'Back' button is clicked.
 * @param {Object} results - The surveyState object.
 * @param {string} questionID - The question ID.
 * @returns {void} 
 */

export function restoreResponses(results, questionID) {
  const appState = getStateManager();
  appState.clearActiveQuestionState();
  
  const formElement = document.querySelector("#" + CSS.escape(questionID));
  if (!formElement || !results[questionID]) return;

  const response = results[questionID];

  // CASE 1: The response is a simple string value.
  if (typeof response === "string") {
    handleSimpleStringResponse(formElement, response);

  // CASE 2: Array
  } else if (Array.isArray(results[questionID])) {
      getFromRbCb(formElement, questionID, results[questionID]);

  // CASE 3: Object
  } else if (typeof response === "object") {
    handleObjectResponse(formElement, response);

  } else {
    moduleParams.errorLogger('RESTORE RESPONSES: (unhandled response type):', response);
  }
}
