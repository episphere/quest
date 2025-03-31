import { rbAndCbClick, handleXOR, parseSSN, parsePhoneNumber, textboxinput, radioAndCheckboxUpdate, moduleParams } from "./questionnaire.js";
import { clearValidationError, validationError } from "./validate.js";
import { hideLoadingIndicator, showLoadingIndicator, translate } from './common.js';
import { nextButtonClicked, getPreviousQuestion } from "./questionnaire.js";
import { getStateManager } from "./stateManager.js";
import { closeModalAndFocusQuestion, handleUpDownArrowKeys, handleRadioCheckboxListEvents, handleRadioCheckboxTableEvents, updateAriaLiveSelectionAnnouncer, updateAriaLiveSelectionAnnouncerTable, clearSelectionAnnouncement } from "./accessibleQuestionTextBuilder.js";
// Debounced version of handleInputEvent
const debouncedHandleInputEvent = debounce(handleInputEvent, 250);

// Add event listeners to the div element (questContainer) -> delegate events to the parent div.
// Note: 'focusout' is used instead of 'blur' because 'blur' does not bubble to the parent div.
export function addEventListeners() {
  moduleParams.questDiv.addEventListener('click', handleClickEvent);
  moduleParams.questDiv.addEventListener('change', handleChangeEvent);
  moduleParams.questDiv.addEventListener('keydown', handleKeydownEvent);
  moduleParams.questDiv.addEventListener('keyup', handleKeyupEvent);
  moduleParams.questDiv.addEventListener('input', debouncedHandleInputEvent);
  moduleParams.questDiv.addEventListener('focusout', handleBlurFocusoutEvent);
  moduleParams.questDiv.addEventListener('submit', async (event) => {
    event.preventDefault();
    await handleSubmitEvent(event);  // Calls the async function
  });

  // Attach event listeners to modal and close buttons (for screen readers)
  // Modals are at the questDiv level, not embedded in the question.
  const modal = moduleParams.questDiv.querySelector('#softModal');
  const closeButton = moduleParams.questDiv.querySelector('#closeModal');

  modal?.addEventListener('click', closeModalAndFocusQuestion);
  closeButton?.addEventListener('click', closeModalAndFocusQuestion);

  addSubmitSurveyListener();
}

function handleClickEvent(event) {
  const target = event.target;
  
  if (target.matches('input[type="radio"], input[type="checkbox"]')) {
    rbAndCbClick(event);
    
    // Handle radio button and checkbox clicks for label inputs
    const label = target.closest('label');
    if (label) {
      const inputElement = label.querySelector('input:not([type="radio"]):not([type="checkbox"]), textarea');
      if (inputElement) {
        if (!target.checked) {
          inputElement.dataset.lastValue = inputElement.value;
          inputElement.value = '';
        } else if ('lastValue' in inputElement.dataset) {
          inputElement.value = inputElement.dataset.lastValue;
        }
        textboxinput(inputElement);
      }
    }

    // Handle text inputs in radio/checkbox lists (e.g. "Other" text inputs). They're inside a response container..
    // Auto-focus the text input if the outer response element (radio or checkbox) is clicked.
    // Note: Some are checkboxes and some are radios though they look the same.
    // Skip in the renderer because focus() causes issues.
    if (!moduleParams.isRenderer) {
      const responseContainer = target.closest('.response');
      const textInputElement = responseContainer?.querySelector('input[type="text"], textarea');
      if (textInputElement && !textInputElement.value && target.checked) {
        setTimeout(() => {
          textInputElement.focus({ preventScroll: true });
        }, 0);
      }
    }
  }
}

function handleChangeEvent(event) {
  const target = event.target;
  
  // Firefox does not alway GRAB focus when the arrows are clicked. If a changeEvent fires, grab focus.
  if (moduleParams.isFirefoxBrowser && target.matches('input[type="number"]') && target !== document.activeElement) {
    target.focus({ preventScroll: true });
  }

  if (target.matches('input[type="radio"], input[type="checkbox"]')) {
    rbAndCbClick(event);
  }

  // VoiceOver (MAC) handles table focus well, but JAWS (Windows) does not.
  // Ensure we're not in the renderer (skip this handling for the renderer).
  // We check if the environment is Windows and the target is a radio or checkbox to improve accessible UX for JAWS users.
  if (!moduleParams.isRenderer && target.matches('input[type="radio"], input[type="checkbox"]')) {
    
    const isTable = target.closest('table') !== null;
    if (moduleParams.isWindowsEnvironment) {
      if (isTable) {
        handleRadioCheckboxTableEvents(event);
      } else {
        handleRadioCheckboxListEvents(event);
      }
    } else {
      if (isTable) {
        updateAriaLiveSelectionAnnouncerTable(target.closest('.response'));
      } else {
        updateAriaLiveSelectionAnnouncer(target.closest('.response')); 
      }
    }
  }
}

function handleKeydownEvent(event) {
  const target = event.target;
  
  // Prevent form submission on enter key
  if (target.matches('input') && event.keyCode === 13) {
    event.preventDefault();
  }
  
  // for each element with an xor, handle the xor on keydown
  if (target.matches('[xor]')) {
    handleXOR(target);
  }

  if (target.matches('input[type="text"], input[type="email"], input[type="tel"], textarea, select')) {
    if (!moduleParams.isRenderer && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      handleUpDownArrowKeys(event);
    }
  }
}

function handleKeyupEvent(event) {
  const target = event.target;
  
  if (target.matches('.SSN')) {
    parseSSN(event);
  }
  
  if (target.matches('input[type="tel"]')) {
    parsePhoneNumber(event);
  }

  if (target.matches('label input:not([type="radio"]):not([type="checkbox"]), label textarea')) {
    handleInputEvent(event);
  }
}

function handleBlurFocusoutEvent(event) {
  const target = event.target;
  
  if (target.matches('input[type="text"], input[type="number"], input[type="email"], input[type="tel"], input[type="date"], input[type="month"], input[type="time"], textarea, select')) {
    textboxinput(target);
    target.setAttribute("style", "size: 20 !important");
  }
}

function handleInputEvent(event) {
  const target = event.target;
  
  if (target.matches('input[type="text"], textarea')) {
    const label = target.closest('label');
    if (label) {
      const radioCB = moduleParams.questDiv.querySelector(`#${label.htmlFor}`) || label.querySelector('input[type="radio"], input[type="checkbox"]');
      if (radioCB && (radioCB.type === 'radio' || radioCB.type === 'checkbox')) {
        // Check or uncheck the radio or checkbox based on the text input length.
        target.value.length > 0 ? radioCB.checked = true : radioCB.checked = false;
        radioAndCheckboxUpdate(radioCB);
        target.dataset.lastValue = target.value;
        textboxinput(target);
      }
    }
  }
}

async function handleSubmitEvent(event) {
  const target = event.target;

  if (target.matches('.question') || target.closest('.question')) {
      await handleQuestButtons(event);
  }
}

// Handle the next, reset, and back buttons
async function handleQuestButtons(event) {
  event.preventDefault();

  // Clear the selection announcement
  clearSelectionAnnouncement();

  const clickType = event.submitter.getAttribute('data-click-type');
  const buttonClicked = event.target.querySelector(`.${clickType}`);

  switch (clickType) {
    case 'previous':
      resetChildren(event.target);
      await getPreviousQuestion(buttonClicked);
      break;

    case 'reset':
      resetChildren(event.target);
      break;

    case 'submitSurvey':
      handleSubmitSurveyClick();
      break;

    case 'next':
      await nextButtonClicked(buttonClicked);
      break;

    default:
      moduleParams.errorLogger(`ERROR: Unknown button clicked: ${clickType}`);
  }
}

/**
 * Clear the target form element and remove any responses from the activeQuestionState.
 * activeQuestionState gets set to undefined in the stateManager.
 * @param {HTMLElement} target - The form element to reset.
 * @returns {void}
 */

export function resetChildren(target) {
  
  const appState = getStateManager();
  appState.removeResponse(target.id);

  const nodes = target.elements;
  if (nodes == null) return;

  for (let node of nodes) {
    if (node.type === "radio" || node.type === "checkbox") {
      node.checked = false;
    } else if (node.type === "text" || node.type === "time" || node.type === "date" || node.type === "month" || node.type === "number") {
      node.value = "";
      clearValidationError(node)
    }
  }
}

// Debounce the input event to prevent multiple rapid-fire events.
function debounce(func, wait) {
  let timeout;
  return function execute(...args) {
      const later = () => {
          clearTimeout(timeout);
          func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
  };
}

function handleSubmitSurveyClick() {
  const submitModal = new bootstrap.Modal(moduleParams.questDiv.querySelector('#submitModal'));
  const submitModalBodyTextEle = moduleParams.questDiv.querySelector('#submitModalBodyText');
  submitModalBodyTextEle.setAttribute('tabindex', '0');
  submitModalBodyTextEle.setAttribute('role', 'alert'); 

  submitModal.show();

  //Force focus to the modal title
  moduleParams.questDiv.querySelector('#submitModalTitle').focus();

  let submitModalElement = submitModal._element;
  submitModalElement.querySelector('.btn-close').addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      submitModal.hide();
    }
  });
}

// Event listener to submit the survey and reload the page.
// The short delay allows the host app to process reload on success. If host app doesn't reload, this app will reload the page on success.
// Handle any case other than 200, in the catch block and show the error message.
function addSubmitSurveyListener() {
  const submitModalButton = moduleParams.questDiv.querySelector('#submitModalButton');
  submitModalButton.addEventListener('click', async () => {
    clearValidationError();
    showLoadingIndicator();

    try {
      const appState = getStateManager();  
      const submitSurveyResponse = await appState.submitSurvey();
      if (submitSurveyResponse?.code !== 200) {
        throw new Error('Submit survey failed');
      }
    } catch (error) {
      hideLoadingIndicator();
      moduleParams.errorLogger(error);
      validationError(moduleParams.questDiv.querySelector('legend'), translate("storeErrorBody"));
    }
  });
}
