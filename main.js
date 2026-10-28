import { disposePopovers, questionQueue, moduleParams, rbAndCbClick, showAllQuestions, swapVisibleQuestion } from "./questionnaire.js";
import { restoreResponses } from "./restoreResponses.js";
import { addEventListeners } from "./eventHandlers.js";
import { ariaLiveAnnouncementRegions, progressBar, responseRequestedModal, responseRequiredModal, responseErrorModal, storeErrorModal, submitModal  } from "./common.js";
import { initSurvey } from "./initSurvey.js";
import { getStateManager, initializeStateManager } from "./stateManager.js";
import { clearQuestionFocusHandoff, clearSelectionAnnouncement } from "./accessibleQuestionTextBuilder.js";

import en from "./i18n/en.js";
import es from "./i18n/es.js";

const questModuleBasePath = import.meta.url.slice(0, import.meta.url.lastIndexOf('/') + 1);

export let transform = function () { /* init */ };
transform.rbAndCbClick = rbAndCbClick;

transform.render = async (obj, divID, previousResults = {}) => {
  try {
    // Cancel pending accessibility work from the prior render.
    clearQuestionFocusHandoff();
    clearSelectionAnnouncement();

    // Set the global moduleParams object with data needed for different parts of the app.
    setModuleParams(obj, divID, previousResults);

    // Rebind render-owned state before the first possible await.
    initializeStateManager(moduleParams.store);

    // if the object has a 'text' field, the contents have been prefetched and passed in. Else, fetch the survey contents.
    const markdown = moduleParams.text || await fetch(moduleParams.url).then(response => response.text());
    
    // Initialize the survey and start processing the questions in the background.
    const retrievedData = await initSurvey(markdown);

    // Get the state manager and load the initial state. This prepares the state manager for use throughout the survey.
    const appState = getStateManager();
    appState.loadInitialSurveyState(retrievedData);
    const initialUserData = appState.getSurveyState();
    const questionProcessor = appState.getQuestionProcessor();

    // Load the question queue from the tree JSON.
    loadQuestionQueue(initialUserData?.treeJSON);

    // Support the renderer tool before the survey is activated. The renderer tool's primary setting lists all questions at the same time.
    if (moduleParams.renderFullQuestionList) {
      questionProcessor.processAllQuestions();
    }

    // Initialize the active question, activate it, and display it.
    const activeQuestionID = getActiveQuestionID(questionProcessor.questions);

    // Set the active question in the DOM on survey startup and restore existing responses.
    const activeQuestionEle = setInitialQuestionOnStartup(questionProcessor, activeQuestionID, initialUserData);

    // If the active question is not found, and it's an embedded use case, log an error and return false.
    // Note: Fail silently for the renderer tool since users are actively editing and testing markdown.
    if (!activeQuestionEle && !moduleParams.isRenderer) {
      moduleParams.errorLogger('Active question not found for:', activeQuestionID);
      return false;
    }

    // Add the event listeners to the parent div.
    addEventListeners();

    return true;
  } catch (error) {
    moduleParams.errorLogger(error);
    return false;
  }
};

/**
 * Load the question queue from the tree JSON. If treeJSON is empty, cleare the queue.
 * This is used to :
 * - Load the initial state of the survey.
 * - Load the state of the survey from the user's existing responses.
 * - Track the user's progress through the survey.
 * Note: It is built into all existing surveys (do not change or remove).
 * @param {Object} treeJSON - The treeJSON object containing the question queue.
 */
function loadQuestionQueue(treeJSON) {
  if (treeJSON) {
    try {
      questionQueue.loadFromJSON(treeJSON);
    } catch (error) {
      moduleParams.errorLogger('Error loading tree from JSON:', error);
      questionQueue.clear();
    }
  } else {
    questionQueue.clear();
  }
}

/**
 * Get the active question ID from questionQueue. If the queue is empty, add the first question to the queue and make it active.
 * @param {Array} questionsArray - The array of questions from the questionProcessor. 
 * @returns {string} - The ID of the active question.
 */

function getActiveQuestionID(questionsArray) {
  if (questionsArray.length === 0) {
    return;
  }

  let currentQuestionID = questionQueue.currentNode.value;
  if (!currentQuestionID) {
    currentQuestionID = questionsArray[0].questionID;
    questionQueue.add(currentQuestionID);
    questionQueue.next();
  } else if (currentQuestionID.startsWith('_CONTINUE')) {
    questionQueue.pop();
    currentQuestionID = questionQueue.currentNode.value;
  }
  
  return currentQuestionID;
}

/**
 * Set the active question in the DOM on survey startup. This executes once, just after initialization.
 * If the active question is not found, there's a setup error from the caller. Log an error and return.
 * @param {Object} questionProcessor - The question processor object for processing markdown to HTML and managing questions.
 * @param {string} activeQuestionID - The ID of the active question to set.
 * @param {Object} initialUserData - The initial user data object containing the user's existing responses.
 * @returns {void} - this manages the DOM on survey startup.
 */

function setInitialQuestionOnStartup(questionProcessor, activeQuestionID, initialUserData) {
  if (!activeQuestionID) return;

  const questionEle = questionProcessor.loadInitialQuestionOnStartup(activeQuestionID);
  if (!questionEle) {
    moduleParams.errorLogger('Active question not found:', activeQuestionID, questionEle);
    return;
  }

  moduleParams.renderFullQuestionList
    ? showAllQuestions(questionProcessor.getAllProcessedQuestions())
    : swapVisibleQuestion(questionEle);

  const persistedResponse = initialUserData[questionEle.id];
  const hasRestorableResponse = typeof persistedResponse === 'string'
    || Array.isArray(persistedResponse)
    || (persistedResponse != null && typeof persistedResponse === 'object');
  if (hasRestorableResponse) {
    restoreResponses(initialUserData, activeQuestionID);
  }
  
  return questionEle;
}

function setModuleParams(obj, divID, previousResults) {
  // Bootstrap renders popover tips and modal backdrops outside the Quest
  // root. Dispose existing instances before a host starts a sequential
  // render so no detached overlay or focus trap survives replacement.
  if (moduleParams.questDiv) {
    disposePopovers(moduleParams.questDiv);
    disposeModals(moduleParams.questDiv);
  }

  moduleParams.url = obj.url || '';
  moduleParams.text = obj.text || '';
  moduleParams.store = obj.store;
  moduleParams.retrieve = obj.retrieve;
  moduleParams.questVersion = obj.questVersion || '';
  moduleParams.surveyDataPrefetch = obj.surveyDataPrefetch;
  moduleParams.isRenderer = obj.isRenderer || false;
  moduleParams.activate = obj.activate || false;
  moduleParams.renderFullQuestionList = moduleParams.isRenderer && !moduleParams.activate;
  moduleParams.previousResults = previousResults;
  moduleParams.soccer = obj.soccer;
  moduleParams.showProgressBarInQuest = obj.showProgressBarInQuest || false;
  moduleParams.asyncQuestionsMap = obj.asyncQuestionsMap || {};
  moduleParams.fetchAsyncQuestion = obj.fetchAsyncQuestion;
  moduleParams.delayedParameterArray = obj.delayedParameterArray || [];
  moduleParams.i18n = obj.lang === 'es' ? es : en;
  moduleParams.isFirefoxBrowser = isFirefoxBrowser();
  moduleParams.isLocalDevelopment = isLocalDevelopment();
  moduleParams.questDiv = document.getElementById(divID);
  moduleParams.questDiv.innerHTML = ariaLiveAnnouncementRegions() + progressBar() + responseRequestedModal() + responseRequiredModal() + responseErrorModal() + submitModal() + storeErrorModal();
  moduleParams.errorLogger = obj.errorLogger || defaultErrorLogger;

  // Set the base path for the module. This is used to fetch the stylesheets in initSurvey().
  moduleParams.basePath = moduleParams.isLocalDevelopment
    ? questModuleBasePath
    : moduleParams.questVersion
      ? `https://cdn.jsdelivr.net/gh/episphere/quest@v${moduleParams.questVersion}/`
      : 'https://episphere.github.io/quest-dev/';
}

function disposeModals(questDiv) {
  const Modal = globalThis.bootstrap?.Modal;
  if (!Modal) return;

  questDiv.querySelectorAll('.modal').forEach((modalElement) => {
    const modal = Modal.getInstance(modalElement);
    if (!modal) return;

    // Hiding is synchronous for Quest's modals and emits the
    // ordinary hidden event before the old root is replaced. Mark this as a
    // render disposal so return-focus handlers do not target obsolete markup.
    modalElement._questRenderDisposal = true;
    if (modalElement.classList.contains('show')) {
      modal.hide();
    }
    modal.dispose();
  });
}

function isLocalDevelopment() {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.includes('github');
}

// Helper for focus issues in Firefox. Firefox has a bug where the focus is not set correctly on numeric up/down arrows.
// InstallTrigger is a global object in Firefox that is not present in other browsers.
function isFirefoxBrowser() {
  return typeof InstallTrigger !== 'undefined';
}

function defaultErrorLogger(error) {
  console.error(error);
}
