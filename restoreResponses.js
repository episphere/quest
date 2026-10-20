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

    if (typeof resObject === 'string') {
      handleStringInObjectResponse(formElement, resKey, resObject);

    } else if (typeof resObject === 'object') {
      // Handle the array case
      if (Array.isArray(resObject)) {
        getFromRbCb(formElement, resKey, resObject);
      
      // Handle XOR objects
      } else {
        const element = Array.from(formElement.querySelectorAll(`[xor="${resKey}"]`));
        element.forEach((xorElement) => {
          if (resObject[xorElement.id]) {
            xorElement.value = resObject[xorElement.id];
          }
        });
      }
    }

    // check for mulitple radio buttons on 1 page.
    if (multiq) {
      multiq.checked = true
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

  // The tree stores question tokens, including trailing soft/hard markers.
  // Rendered form IDs and response keys omit the markers.
  const normalizedQuestionID = questionID.replace(/[?!]$/, '');
  const formElement = moduleParams.questDiv?.querySelector(
    `form.question[id="${CSS.escape(normalizedQuestionID)}"]`,
  );
  if (!formElement || !Object.prototype.hasOwnProperty.call(results, normalizedQuestionID)) return;

  const response = results[normalizedQuestionID];
  // An explicit null/undefined value is the host's deletion tombstone. It is
  // valid persisted state, but there is no participant response to restore.
  if (response == null) return;

  // CASE 1: The response is a simple string value.
  if (typeof response === "string") {
    handleSimpleStringResponse(formElement, response);

  // CASE 2: Array
  } else if (Array.isArray(response)) {
      getFromRbCb(formElement, normalizedQuestionID, response);

  // CASE 3: Object
  } else if (typeof response === "object") {
    handleObjectResponse(formElement, response);

  } else {
    moduleParams.errorLogger('RESTORE RESPONSES: (unhandled response type):', response);
  }
}
