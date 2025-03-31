import { moduleParams } from './questionnaire.js';
import { parseGrid } from './buildGrid.js';
import { translate } from './common.js';
import { evaluateCondition } from "./evaluateConditions.js";
import { getStateManager } from './stateManager.js';

const questionSeparatorRegex = /\[([A-Z_][A-Z0-9_#]*[?!]?)(?:\|([^,|\]]+)\|?)?(,.*?)?\](.*?)(?=$|\[[A-Z_]|<form)/gs;
const gridReplaceRegex = /\|grid(\!|\?)*\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|/g;
const idWithLoopSuffixRegex = /^([a-zA-Z0-9_]+?)(_?\d+_\d+)?$/;
const valueOrDefaultRegex = /valueOrDefault\(["']([a-zA-Z0-9_]+?)(_?\d+_\d+)?["'](.*)\)/g;
const elementIdRegex = /id=([^\s]+)/;
const embeddedHTMLQuestionIDRegex = /id="([^"]+)"/;
const displayIfRegex = /displayif\s*=\s*.*/;
const endMatchRegex = /end\s*=\s*(.*)?/;

export class QuestionProcessor {
  constructor(markdown, precalculated_values, i18n) {
      this.i18n = i18n;                                   // Language settings
      this.buttonTextObj = {                              // Back/Reset/Next/Submit buttons
          back: i18n.backButton,
          reset: i18n.resetAnswerButton,
          next: i18n.nextButton,
          submit: i18n.submitSurveyButton
      };
      this.precalculated_values = precalculated_values;   // Pre-calculated form values (e.g. user name and current date)
      this.lastBatchProcessedQuestionIndex = 0;           // Track the last batch preprocessed question.
      this.loopDataArr = [];                              // Array of loop data. Responsive to user input.
      this.gridQuestionsArr = [];                         // Array of grid question IDs, used for processing someSelected and noneSelected conditionals.
      this.questions = this.splitIntoQuestions(markdown); // Split and prepare questions
      this.processedQuestions = new Map();                // Cache of processed form elements
      this.currentQuestionIndex = 0;                      // Track the current question
      this.isProcessingComplete = false;                  // Mark when all questions are processed
  }

  setQuestName(markdown) {
    const questModuleNameRegExp = new RegExp(/{"name":"(\w*)"}/);
    markdown.replace(questModuleNameRegExp, (_, moduleID) => {
      moduleParams.questName = moduleID;
      return "";
    });
  }

  removeMarkdownComments(markdown) {
    return markdown.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
  }

  splitIntoQuestions(markdown) {
    const questionsArr = [];
    let match;

    // Set the questionnaire name
    this.setQuestName(markdown);

    // Remove comments from the markdown
    markdown = this.removeMarkdownComments(markdown);

    // TODO: remove (this is a temporary fix for the yob issue)
    //replace all instances of RCRTUP_YOB_V1R0 with yob
    markdown = markdown.replace(/RCRTUP_YOB_V1R0/g, 'yob');

    // Search for items in delayedParameterArray and add 'Loading...' placeholder text so it's parsed correctly
    if (Object.keys(moduleParams.asyncQuestionsMap).length > 0) {
      Object.keys(moduleParams.asyncQuestionsMap).forEach((key) => {
        markdown = markdown.replace(key, `${key} ${moduleParams.i18n.loading}`);
      });
    };

    // Replace grids with placeholders and store grid content for later processing
    let gridPlaceholders = [];
    const gridButtonDiv = this.getButtonDiv(true)
    markdown = markdown.replace(gridReplaceRegex, (...args) => {
      const gridContent = parseGrid(...args, gridButtonDiv);
      const placeholder = `<<GRID_PLACEHOLDER_${gridPlaceholders.length}>>`;
      gridPlaceholders.push(gridContent);
      return placeholder;
    });

    // Future improvement: Consider unrolling after user has input the response that determines number of loops.
    // This would lighten the initial load considerably. Would need to handle insertions to the array.
    // Would also need to handle removing generated loop eles on back button click and/or change of the trigger response.
    // Current loop process unrolls all possible responses to n=loopMax (25).
    markdown = unrollLoops(markdown, this.i18n.language);

    // Now we have the contents unpacked and the grid placeholders embedded:
    // Split it into an array of question objects, handling the grids along the way
    // Note: Everything must be parsed in markdown order since some questions have jump targets and others don't.
    while ((match = questionSeparatorRegex.exec(markdown)) !== null) {
      const questionContent = match[4].trim();
      const questionAndGridSegments = questionContent.split(/(<<GRID_PLACEHOLDER_\d+>>)/g).filter(part => part.trim() !== '');
      
      // If length === 1, no grid placeholders were found in the question content
      if (questionAndGridSegments.length === 1) {
        questionsArr.push({
          fullMatch: match[0],
          questionID: match[1],
          questOpts: match[2] || '',
          questArgs: match[3] || '',
          questText: questionContent,
          formElement: null
        });
      // Else, handle the question content plus the grid placeholders, which are at the end of the parsed array
      } else {
        questionAndGridSegments.forEach((arrayItem) => {
          const gridPlaceholderMatch = arrayItem.match(/<<GRID_PLACEHOLDER_(\d+)>>/);
          if (gridPlaceholderMatch) {
            // Get the previously stored grid content
            const gridIndex = parseInt(gridPlaceholderMatch[1], 10);
            const gridContent = gridPlaceholders[gridIndex].trim();
            const match = gridContent.match(embeddedHTMLQuestionIDRegex);
            const questionID = match ? match[1] : '';

            this.gridQuestionsArr.push(questionID);

            // Add the grid to the questions array. The formElement is already processed.
            // Also add the grid ID to the gridQuestions array for processing someSelected and noneSelected conditionals.
            questionsArr.push({
              fullMatch: match[0],
              questionID: questionID,
              questOpts: null,
              questArgs: null,
              questText: null,
              formElement: gridContent
            });

          } else {
            // Handle regular question content (the grid placeholder has been removed)
            questionsArr.push({
              fullMatch: match[0],
              questionID: match[1],
              questOpts: match[2] || '',
              questArgs: match[3] || '',
              questText: arrayItem.trim(),
              formElement: null
            });
          }
        });
      }
    }
    
    return questionsArr;
  }
  
  /**
   * Transform the HTML string from the markdown converter into an HTML element.
   * Execute legacy DOM manipulation to convert the string into an element.
   * @param {string} htmlString - The HTML string to convert.
   * @param {boolean} isFirstQuestion - boolean to determine if this is the first question. If true, remove the 'back' button.
   * @param {boolean} isLastQuestion - boolean to determine if this is the last question. If true, remove the 'next' button.
   * @param {number} index - The index of the question in the this.questions array.
   * @returns {HTMLElement} - The HTML question element (a form with response options).
   */
  convertHTMLStringToEle(htmlString, isFirstQuestion, isLastQuestion, index) {
    const template = document.createElement('template');
    template.innerHTML = htmlString.trim();

    const newQuestionEle = template.content.firstChild;

    // Add the loop data to the loopDataArr to support the exitLoop function.
    if (newQuestionEle.hasAttribute("loopmax") && newQuestionEle.hasAttribute("firstquestion") && newQuestionEle.getAttribute("firstquestion") == '1') {
      const appState = getStateManager();
      const loopMaxID = newQuestionEle.getAttribute("loopmax");
      const loopMaxResponse = parseInt(appState.findResponseValue(loopMaxID), 10);
      const questionIDMatch = newQuestionEle.id.match(idWithLoopSuffixRegex);
      const loopFirstQuestionID = questionIDMatch?.[1] || '';

      this.loopDataArr.push({
        locationIndex: index,                     // Position in the questions array
        loopMax: 25,                              // Default max response iterations: 25
        loopMaxQuestionID: loopMaxID,             // The questionID that determines the number of iterations
        loopMaxResponse: loopMaxResponse,         // The user's response to the loopMax question
        loopFirstQuestionID: loopFirstQuestionID, // The first questionID marker (first question in in the loop)
      });
    }

    // The rest of this function is legacy DOM manipulation. Caution on refactoring.
    // handle data-hidden elements
    [...newQuestionEle.querySelectorAll("[data-hidden]")].forEach((x) => {
      x.style.display = "none";
    });

    // validate confirm. If the confirm was used instead of data-confirm, fix it now
    [...newQuestionEle.querySelectorAll("[confirm]")].forEach((element) => {
      element.dataset.confirm = element.getAttribute("confirm")
      element.removeAttribute("confirm")
    });

    [...newQuestionEle.querySelectorAll("[data-confirm]")].forEach((element) => {
      console.warn('TODO: REMOVE? NOT FOUND in DOM (this previously used document access): confirm element found:', element.dataset.confirm);
      if (!newQuestionEle.querySelector(`#${element.dataset.confirm}`)) {
        delete element.dataset.confirm
      }
      const otherElement = newQuestionEle.querySelector(`#${element.dataset.confirm}`);
      console.warn('TODO: REMOVE? NOT FOUND in DOM (this previously used document access): confirm element found (otherElement):', otherElement);
      otherElement.dataset.confirmationFor = element.id;
    });

    // remove the first 'previous' button and the final 'next' button.
    if (isFirstQuestion) {
      newQuestionEle.querySelector(".previous").remove();
    } 
    if (isLastQuestion) {
      newQuestionEle.querySelector(".next").remove();
    }

    return newQuestionEle;
  }

  /**
   * Manage the currentQuestionIndex value, which acts as a pointer for question navigation.
   * @param {string} updateType 
   * @param {number|null} value - optional, 
   */
  setCurrentQuestionIndex(updateType, value) {
    if (typeof updateType !== 'string') {
      moduleParams.errorLogger('Error (setCurrentQuestionIndex). updateType must be a string')
    }
    
    switch(updateType) {
      case 'increment':
        this.currentQuestionIndex++;
        break;

      case 'decrement':
        this.currentQuestionIndex--;
        break;
      
      case 'update':
        if (typeof value !== 'number') {
          moduleParams.errorLogger('Error (setCurrentQuestionIndex). value must be a number for update operations.')
        }
        this.currentQuestionIndex = value;
        break;

      default:
        moduleParams.errorLogger('Error (setCurrentQuestionIndex): unhandled updateType', updateType, value);
    }
  }

  /**
   * Find a question by questionID from the this.questions array.
   * @param {string || undefined} questionID - The questionID to find.
   * @returns {object} - { question: The HTML element of the found question, index: the index of the found question }
   */

  findQuestion(questionID) {
    if (!questionID) {
      moduleParams.errorLogger('Error, findQuestion (no questionID provided):', questionID); 
    }

    let index;

    if (questionID.startsWith('_CONTINUE')) {
      return this.findStartOfNextLoopIteration(questionID);
    } else if (questionID === 'END') {
      index = this.questions.length - 1;
    } else {
      index = this.questions.findIndex(question => question.questionID.startsWith(questionID));
    }

    if (index !== -1) {
      const foundQuestion = this.processQuestion(index);
      if (!foundQuestion) {
        moduleParams.errorLogger('Error: (findQuestion): question not found at index', index)
      }

      return { question: foundQuestion, index: index };
    }

    moduleParams.errorLogger(`Error, findQuestion (question not found): ${moduleParams.questName}, question: ${questionID}`);
    return { question: null, index: -1 };
  }

  /**
   * Load the initial question when a user starts or returns to a survey.
   * Find the question, set the currentQuestionIndex, and manage the active question class.
   * @param {string} questionID - The questionID to load.
   * @returns {HTMLElement} - The HTML element of the loaded question.
   */

  loadInitialQuestionOnStartup(questionID) {
    if (this.questions.length === 0) {
      moduleParams.errorLogger('Error during initialization (loadInitialQuestion): no questions found', this.questions);
      return null;
    }

    const { question, index } = this.findQuestion(questionID);
    if (!question) {
      moduleParams.errorLogger('Error during initialization (loadInitialQuestion): question not found', questionID);
      return null;
    }

    this.setCurrentQuestionIndex('update', index);

    return this.manageActiveQuestionClass(question, null);
  }

  /**
   * Get the next sequential questionID from the this.questions array.
   * Used whenever a response doesn't have an associated jump target.
   * Check the currentQuestionIndex, increment it, and return the next questionID.
   * @returns {string} - The ID of the next question to load.
   */

  getNextSequentialQuestionID() {
    if (this.currentQuestionIndex + 1 < this.questions.length) {
      
      this.setCurrentQuestionIndex('increment')

      const nextQuestion = this.processQuestion(this.currentQuestionIndex);
      return nextQuestion.id;
    }

    moduleParams.errorLogger(`Error, getNextSequentialQuestion (no next question to load): ${moduleParams.questName}, index: ${this.currentQuestionIndex}`);
    return null;
  }

  /**
   * Load the previous question. Note: this is not necessarily the previous array index due to jumps and loops.
   * Find the previous question, set the currentQuestionIndex, and manage the active question class.
   * @param {string} previousQuestionID - The questionID to load.
   * @returns {HTMLElement} - The HTML element of the loaded question.
   */

  loadPreviousQuestion(previousQuestionID) {
    if (this.currentQuestionIndex <= 0) {
      moduleParams.errorLogger(`Error, loadPreviousQuestion (Unhandled case: no previous question to load): ${moduleParams.questName}, question: ${previousQuestionID}`);
      return null;
    }

    const questionToUnload = this.getCurrentQuestion();
    const { question, index } = this.findQuestion(previousQuestionID);

    this.setCurrentQuestionIndex('update', index);

    if (!moduleParams.renderFullQuestionList) {
      this.manageActiveQuestionClass(question, questionToUnload);
    }

    return question;
  }

  /**
   * Load the next question in the survey. Note: this is not necessarily the next array index due to jumps and loops.
   * Find the next question, set the currentQuestionIndex, and manage the active question class.
   * @param {string} questionID - The questionID to load.
   * @returns {HTMLElement} - The HTML element of the loaded question.
   */

  loadNextQuestion(questionID) {
    if (this.currentQuestionIndex + 1 > this.questions.length) {
      moduleParams.errorLogger(`Error, loadNextQuestion (unhandled case: at end of survey): ${moduleParams.questName}, question: ${questionID}, index: ${this.currentQuestionIndex}, length: ${this.questions.length}`);
      return null;
    }

    const questionToUnload = this.getCurrentQuestion();
    const { question, index } = this.findQuestion(questionID);

    this.setCurrentQuestionIndex('update', index);

    if (!moduleParams.renderFullQuestionList) {
      this.manageActiveQuestionClass(question, questionToUnload);
    }
    
    return question;
  }

  /**
   * Get the current question from the this.questions array.
   * Useful for managing the active question class on 'next' and 'back' button clicks, and for processing the current question.
   * @returns {HTMLElement} - The HTML element of the current question.
   */

  getCurrentQuestion() {
    if (this.currentQuestionIndex > this.questions.length || this.currentQuestionIndex < 0) {
      moduleParams.errorLogger(`Error, getCurrentQuestion (index out of range): ${moduleParams.questName}, index: ${this.currentQuestionIndex}`);
      return null;
    }

    return this.processQuestion(this.currentQuestionIndex);
  }

  getAllProcessedQuestions() {
    return this.processedQuestions;
  }

  /**
   * Process a single question's markdown, add it to the cache, and return the HTML element.
   * First, search the cache for the question. If found, it has already been processed. Return early.
   * Note about the questions array:
   *  - Grid questions are pre-parsed as HTML strings, directly to the .formElement property in the quesitons array.
   *  - All other questions are processed as a regex match with ID, opts, args, and text properties (raw text).
   *  - So, grid questions only have one step here, while all other questions have two steps.
   * @param {number} index - The index of the question to process from the this.questions array.
   * @returns {HTMLElement} - The HTML element of the processed question.
   */

  processQuestion(index) {
    if (index < 0) return null;

    if (this.processedQuestions.has(index)) {
      return this.processedQuestions.get(index);
    }

    const questionObj = this.questions[index];
    const isFirstQuestion = index === 0;
    const isLastQuestion = index === this.questions.length - 1;

    let questionElement;

    if (questionObj.formElement) {
      questionElement = this.convertHTMLStringToEle(questionObj.formElement, isFirstQuestion, isLastQuestion, index);
    } else {
      const processedHTMLString = this.convertToHTMLString(questionObj);
      questionElement = this.convertHTMLStringToEle(processedHTMLString, isFirstQuestion, isLastQuestion, index);
    }

    this.processedQuestions.set(index, questionElement);

    return questionElement;
  }

  /**
   * Process all questions in the survey. This is a batch process that can be used to pre-process all questions.
   * It runs in two instances:
   * (1) on survey startup (or return to survey), it preprocesses batches of the survey, and
   * (2) when the user returns to the survey mid-loop, it preprocesses all questions up to the current question to obtain the loop data for navigation.
   * Questions take ~1-2ms to process depending on complexity and device, so small batches don't impact performance significantly.
   * @param {number} startIndex - The index of the first question to process.
   * @param {number} stopIndex - The index of the last question to process.
   * @returns {void} - The processed questions are added to the cache.
   */

  processAllQuestions(startIndex = 0, stopIndex = this.questions.length) {
    if (this.isProcessingComplete) return;

    const startingPoint = Math.max(this.lastBatchProcessedQuestionIndex, startIndex, 0);
    const stoppingPoint = Math.min(stopIndex, this.questions.length);

    for (let i = startingPoint; i < stoppingPoint; i++) {
      this.processQuestion(i);
    }

    if (stoppingPoint === this.questions.length) {
      this.isProcessingComplete = true;
    }

    this.lastBatchProcessedQuestionIndex = stoppingPoint;
  }

  /**
   * Manage the question with the .active class attached. This is used for question visibility (legacy).
   * @param {HTMLElement} questionToLoad - The question to load.
   * @param {HTMLElement} questionToUnload - The question to unload.
   * @returns {HTMLElement} - The question to load with the .active class appended.
   */

  manageActiveQuestionClass(questionToLoad, questionToUnload) {
    if (!questionToLoad) {
      moduleParams.errorLogger('Error, manageActiveQuestionClass (no question to load):', questionToLoad, questionToUnload);
      return null;
    }

    if (questionToUnload) {
      questionToUnload.classList.remove('active');
    }
    questionToLoad.classList.add('active');

    return questionToLoad;
  }

  /**
   * Handle 'someSelected' and 'noneSelected' conditionals for grid questions.
   * Search the grid questions for the elementID (the specific radio or checkbox input element).
   * Return the value of the input element for comparison to the user's input.
   * @param {string} elementID - The ID of the radio or checkbox input element to find.
   * @returns {string} - The value of the input element, or null if not found.
   */

  findGridRadioCheckboxEle(elementID) {
    for (const questionID of this.gridQuestionsArr) {
      const { question } = this.findQuestion(questionID);
      if (question) {
        const radioOrCheckbox = question.querySelector(`#${elementID}`);
        if (radioOrCheckbox) {
          return radioOrCheckbox?.value || null;
        }
      }
    }

    moduleParams.errorLogger(`Error, findGridInputElement (element not found): ${moduleParams.questName}, elementID: ${elementID}`);
    return null;
  }

  /**
   * Find the closest loop data prior to the current question index.
   * If not found, user may be returning to the survey mid-loop. Process all questions up to the current index,
   * which will populate the loopDataArr with the correct loop data. Then try again.
   * @returns {object} - The loop data object for the current loop. { locationIndex, loopMax, loopMaxQuestionID, loopMaxResponse, loopFirstQuestionID }
   */

  getLoopData() {
    const findNearestLoopIndex = () => {
      let nearestLocationIndex = -1;
      for (const loopData of this.loopDataArr) {
        if (loopData.locationIndex <= this.currentQuestionIndex) {
          if (loopData.locationIndex > nearestLocationIndex) {
            nearestLocationIndex = loopData.locationIndex;
          }
        }
      }

      return nearestLocationIndex;
    }

    let loopStartLocationIndex = findNearestLoopIndex();
    if (loopStartLocationIndex === -1) {
      this.processAllQuestions(0, this.currentQuestionIndex);
      
      loopStartLocationIndex = findNearestLoopIndex();
    }

    // Find the loop data object where locationIndex matches the loopStartLocationIndex
    const loopData = this.loopDataArr.find(data => data.locationIndex === loopStartLocationIndex);

    // Return the matching object or fallback
    return loopData || this.loopDataArr[this.loopDataArr.length - 1] || null;
  }

  /**
   * If the loopMaxResponse changes, update the loopDataArr with the new value.
   * This is a rare case where a user changes their response to a loopMax question.
   * Find the loopData object that matches the loopMaxQuestionID and update the loopMaxResponse.
   * This a is relatively inexpesive (but necessary) check because loopDataArr is small (length === number of loops in the survey).
   * Process:
   *   - Check whether the questionID is a loopMax question.
   *   - In the typical case: a response is NOT associate with a loopMax value. Return early.
   *   - If the loopMax questionID is a match, update the loopData object with the new response.
   * @param {string} questionID - The questionID to check. Only questionIDs that determine the number of loop iterations result in further processing.
   * @param {string} response - The user's response to the loopMax question.
   * @returns {void} - The loopDataArr is up-to-date with new response values for future loop execution.
   */

  checkLoopMaxData(questionID, response) {
    // Some questions are prompt-only (no responses). Return early.
    if (!questionID || !response) return;

    // If no match found, return early, continue normal survey operation. This is the typical case.
    const questionIDMatch = this.loopDataArr.find(loopData => loopData.loopMaxQuestionID === questionID);
    if (!questionIDMatch) return;

    // If the loopMax questionID is found, update the loopData object with the new response.
    const loopDataIndex = this.loopDataArr.findIndex(loopData => loopData.loopMaxQuestionID === questionID);
    if (loopDataIndex === -1) {
      moduleParams.errorLogger(`Error, checkLoopMaxData (loopData not found): ${moduleParams.questName}, loopMaxQuestionID: ${questionID}`);
      return;
    }

    // update the loopData object with the new response
    const updatedLoopMaxResponse = parseInt(response, 10);
    if (isNaN(updatedLoopMaxResponse)) {
      moduleParams.errorLogger(`Error, checkLoopMaxData (invalid response): ${moduleParams.questName}, response: ${response}`);
      return;
    }

    this.loopDataArr[loopDataIndex].loopMaxResponse = updatedLoopMaxResponse;
  }

  /**
   * Find the loop's jump target based on survey conditionals, which is either:
   * (1) The beginning of the next loop iteration, or
   * (2) The end of the loop sequence.
   * @param {string} questionID - The questionID to find the next iteration of the loop.
   * @returns {object} - { question: The found jump target in HTML element format, prepared for DOM insertion, index: the quesiton's index }
   */

  findStartOfNextLoopIteration(questionID) {
    const loopIndexRegex = /_(\d+)_(\d+)$/;
    const loopIndexMatch = questionID.match(loopIndexRegex);
    if (!loopIndexMatch && loopIndexMatch[1] && loopIndexMatch[2]) {
      moduleParams.errorLogger(`Error, findQuestion (loop index not found): ${moduleParams.questName}, question: ${questionID}`);
      return null;
    }

    const loopIterationIndex = loopIndexMatch[1];
    const nextLoopIterationIndex = parseInt(loopIterationIndex, 10) + 1;

    const loopData = this.getLoopData();
    if (!loopData) {
      moduleParams.errorLogger(`Error, findQuestion (loop data not found): ${moduleParams.questName}, question: ${questionID}`);
      return null;
    }

    // If the next index is greater than the loopMaxResponse (or loopMax as a fallback), exit the loop.
    if (nextLoopIterationIndex > loopData.loopMaxResponse || nextLoopIterationIndex > loopData.loopMax) {
      return this.findEndOfLoop();

    // Else, find the first question for the next loop iteration.
    } else {
      const nextIterationFirstQuestionID = `${loopData.loopFirstQuestionID}_${nextLoopIterationIndex}_${nextLoopIterationIndex}`;
      return this.findQuestion(nextIterationFirstQuestionID);
    }
  }

  /**
   * Find the end of the loop sequence. This is a placeholder questionID 'END_OF_LOOP' that marks the end of the loop as a jump target.
   * @returns {object} - { question: The found jump target in HTML element format, prepared for DOM insertion, index: the quesiton's index }
   */

  findEndOfLoop() {
    const endOfLoopIndex = this.questions.findIndex((question, index) => {
      return question.questionID === 'END_OF_LOOP' && index > this.currentQuestionIndex;
    });

    if (endOfLoopIndex === -1) {
      moduleParams.errorLogger(`Error, findEndOfLoop (no end of loop found): ${moduleParams.questName}, index: ${this.currentQuestionIndex}`);
      return { question: null, index: -1 }
    }

    // End of loop found. This element is a placeholder, so increment to access the first question after the loop.
    return { question: this.processQuestion(endOfLoopIndex + 1), index: endOfLoopIndex + 1 };
  }

  /**
   * For some input elements, the input ID and the form ID are different.
   * This is a legacy case, where we need to continue supporting existing surveys.
   * Process: Search questions for the elementID. If found, evaluate the found element.
   * This supports 'forid' replacement and displayif conditionals.
   * @param {string} elementID - The ID of the input element to find.
   * @returns {string} - The ID of the input element's form, required for evaluating some conditionals, or null if not found.
  */

  findRelatedFormID(elementID) {
    for (const questionInList of this.questions) {
      const questionID = questionInList.questionID;
      const { question } = this.findQuestion(questionID);
      if (question) {
        const foundElement = question.querySelector(`#${elementID}`);
        if (foundElement) {
          const displayIfAttribute = foundElement.getAttribute('displayif');
          if (displayIfAttribute) {
            if (!this.evaluateConditionInFormSearch(displayIfAttribute)) {
              return '';
            }
          }
          // If the found element is hidden, it is not a valid result.
          if (foundElement.style.display === 'none') {
            return '';
          }
          return question.id;
        // If the elementID matches the questionID, there's no new property to replace/return.
        } else if (question.id === elementID) {
          return '';
        }
      }
    }

    moduleParams.errorLogger(`Error, findRelatedFormID (formID not found): ${moduleParams.questName}, elementID: ${elementID}`);
    return '';
  }

  // This can be extended to handle other speficic conditionals in the form search for complex cases.
  // The doesNotExist case handles multi-page dependencies (e.g. address entry where the user is asked to enter missing values actoss multiple questions in Module 3).
  evaluateConditionInFormSearch(displayIfAttribute) {
    if (displayIfAttribute.includes('doesNotExist')) {
      const idRegex = /"(D_\d+(?:_\d+)*)"/;
      const match = displayIfAttribute.match(idRegex);
      if (match && match[1]) {
          const appState = getStateManager();
          const foundValue = appState.findResponseValue(match[1]);
          if (foundValue == null || foundValue === '') {
            return false;
          }
      }
    }
    return true;
  }

  replaceDateTags(content) {
    const replacements = [
        [/#currentMonthStr/g, this.i18n.months[this.precalculated_values.current_month_str]],
        [/#currentMonth/g, this.precalculated_values.current_month],
        [/#currentYear/g, this.precalculated_values.current_year],
        [/#today(\s*[+-]\s*\d+)?/g, this.replaceTodayTag.bind(this)],
    ];

    replacements.forEach(([regex, replacement]) => {
        content = content.replace(regex, replacement);
    });

    return content;
  }

  convertToHTMLString(question, i18n = this.i18n, precalculated_values = this.precalculated_values) {
    let { questionID, questOpts, questArgs, questText } = question;

    questText = this.replaceDateTags(questText);

    questText = questText
      .replaceAll("\u001f", "\n")
      .replace(/(?:\r\n|\r|\n)/g, "<br>")
      .replace(/\[_#\]/g, "");

    let counter = 1;
    questText = questText.replace(/\[\]/g, function () {
      let t = "[" + counter.toString() + "]";
      counter = counter + 1;
      return t;
    });

    //handle options for question
    questOpts = questOpts || '';
    if (questOpts) {
      questOpts = questOpts.replaceAll(/(min|max)-count\s*=\s*(\d+)/g,'data-$1-count=$2')
    }
 
    // handle displayif on the question. If questArgs is undefined set it to blank.
    questArgs = questArgs || '';
    let endMatch;
    if (questArgs) {
      const displayifMatch = questArgs.match(displayIfRegex);
      endMatch = questArgs.match(endMatchRegex);
      // if so, remove the comma and go.  if not, set questArgs to blank...
      if (displayifMatch) {
        questArgs = displayifMatch[0];
        questArgs = `displayif=${encodeURIComponent(displayifMatch[0].slice(displayifMatch[0].indexOf('=') + 1))}`
      } else if (endMatch) {
        questArgs = endMatch[0];
      } else {
        questArgs = "";
      }
    }
    
    let target = "";
    let hardBool = questionID.endsWith("!");
    let softBool = questionID.endsWith("?");
    if (hardBool || softBool) {
      questionID = questionID.slice(0, -1);
      if (hardBool) {
        target = "data-bs-target='#hardModal'";
      } else {
        target = "data-bs-target='#softModal'";
      }
    }

    // Worker doesn't have window context/access, so needed to be pre-calculated instead of accessing math._value.
    // replace user profile variables...
    questText = questText.replace(/\{\$u:(\w+)}/g, (all, varid) => {
      return `<span name='${varid}'>${precalculated_values[varid] || ''}</span>`;
    });

    // replace {$id} with span tag
    questText = questText.replace(/\{\$(\w+(?:\.\w+)?):?([a-zA-Z0-9 ,.!?"-]*)\}/g, fID);
    function fID(fullmatch, forId, optional) {
      if (optional == null || optional === "") {
        optional = "";
      } else {
        optional = `optional='${encodeURIComponent(optional)}'`;
      }

      return `<span forId='${forId}' ${optional}>${forId}</span>`;
    }

    // replace {#id} with span tag
    questText=questText.replace(/\{\#([^}#]+)\}/g,fHash)
    function fHash(fullmatch,expr){
      return `<span data-encoded-expression=${encodeURIComponent(expr)}>${expr}</span>`
    }

    //adding displayif with nested questions. nested display if uses !| to |!
    questText = questText.replace(/!\|(displayif=.+?)\|(.*?)\|!/g, fDisplayIf);

    function fDisplayIf(containsGroup, condition, text) {
      text = text.replace(/\|(?:__\|){2,}(?:([^|<]+[^|]+)\|)?/g, fNum);
      text = text.replace(/\|popup\|([^|]+)\|(?:([^|]+)\|)?([^|]+)\|/g, fPopover);
      text = text.replace(/\|@\|(?:([^|<]+[^|]+)\|)?/g, fEmail);
      text = text.replace(/\|date\|(?:([^|<]+[^|]+)\|)?/g, fDate);
      text = text.replace(/\|tel\|(?:([^|<]+[^|]+)\|)?/g, fPhone);
      text = text.replace(/\|SSN\|(?:([^|<]+[^|]+)\|)?/g, fSSN);
      text = text.replace(/\|state\|(?:([^|<]+[^|]+)\|)?/g, fState);
      text = text.replace(/\[(\d*)(\*)?(?::(\w+))?(?:\|(\w+))?(?:,(displayif=.+?\))?)?\]\s*(.*?)\s*(?=(?:\[\d)|\n|<br>|$)/g, fCheck);
      text = text.replace(/\[text\s?box(?:\s*:\s*(\w+))?\]/g, fTextBox);
      text = text.replace(/\|(?:__\|)(?:([^\s<][^|<]+[^\s<])\|)?\s*(.*?)/g, fText);
      text = text.replace(/\|___\|((\w+)\|)?/g, fTextArea);
      text = text.replace(/\|time\|(?:([^|<]+[^|]+)\|)?/g, fTime);
      text = text.replace(/#YNP/g, translate('yesNoPrefer'));
      text = questText.replace(/#YN/g, translate('yesNo'));

      return `<span class='displayif' ${condition}>${text}</span>`;
    }

    //replace |popup|buttonText|Title|text| with a popover
    questText = questText.replace(
      /\|popup\|([^|]+)\|(?:([^|]+)\|)?([^|]+)\|/g, fPopover);

    function fPopover(fullmatch, buttonText, title, popText) {
      title = title ? title : "";
      popText = popText.replace(/"/g, "&quot;")
      return `<a tabindex="0" class="popover-dismiss btn" role="button" title="${title}" data-bs-toggle="popover" data-bs-trigger="focus" data-bs-content="${popText}">${buttonText}</a>`;
    }

    // replace |hidden|value| 
    questText = questText.replace(/\|hidden\|\s*id\s*=\s*([^\|]+)\|?/g, fHide);
    function fHide(fullmatch, id) {
      return `<input type="text" data-hidden=true id=${id}>`
    }

    // replace |@| with an email input
    questText = questText.replace(/\|@\|(?:([^\|\<]+[^\|]+)\|)?/g, fEmail);
    function fEmail(fullmatch, opts) {
      const { options } = guaranteeIdSet(opts, "email");
      return `<input type='email' ${options} placeholder="user@example.com"></input>`;
    }

    // replace |date| with a date input
    questText = questText.replace(/\|date\|(?:([^\|\<]+[^\|]+)\|)?/g, fDate);
    questText = questText.replace(/\|month\|(?:([^\|]+)\|)?/g, fMonth);

    function fDate(fullmatch, opts) {
      let type = fullmatch.match(/[^|]+/);
      let { options, elementId } = guaranteeIdSet(opts, type);
      let optionObj = paramSplit(options);
      // can't have the value uri encoded... 
      if (Object.prototype.hasOwnProperty.call(optionObj, "value")) {
          optionObj.value = decodeURIComponent(optionObj.value);
      }
  
      options = reduceObj(optionObj);

      if (Object.prototype.hasOwnProperty.call(optionObj, "min")) {
        options = options + ` data-min-date-uneval=${optionObj.min}`
      }
      if (Object.prototype.hasOwnProperty.call(optionObj, "max")) {
        options = options + `  data-max-date-uneval=${optionObj.max}`
      }
      
      const descText = type === 'month' ? "Type month and four-digit year" : type === 'date' ? "Select a date" : "Enter the month and year in format: four digit year - two digit month. YYYY-MM";
  
      // Adding placeholders and aria-describedby attributes in one line
      options += ` placeholder='Select ${type}' aria-describedby='${elementId}-desc' aria-label='Select ${type}'`;
      return `<input type='${type}' ${options}><span id='${elementId}-desc' class='visually-hidden'>${descText}</span>`;
    }

    function fMonth(fullmatch, opts) {
      const type = fullmatch.match(/[^|]+/);
      const { options, elementId } = guaranteeIdSet(opts, type);
      const questionIDPrefix = questionID.match(idWithLoopSuffixRegex)[1];

      const updatedOptions = options.replace(valueOrDefaultRegex, (_, prefix, suffix, rest) => {
        return `valueOrDefault("${questionIDPrefix}${suffix}"${rest})`;
      });

      const optionObj = paramSplit(updatedOptions);
      if (Object.prototype.hasOwnProperty.call(optionObj, "value")) {
          optionObj.value = decodeURIComponent(optionObj.value);
      }

      const unevaluatedDates = [];
      
      if (Object.prototype.hasOwnProperty.call(optionObj, "min")) {
        unevaluatedDates.push(`data-min-date-uneval=${optionObj.min}`);
      }

      if (Object.prototype.hasOwnProperty.call(optionObj, "max")) {
        unevaluatedDates.push(`data-max-date-uneval=${optionObj.max}`);
      }
  
      const descText = "Enter the month and year in format: four digit year - two digit month. YYYY-MM";
      const finalOptions = `${updatedOptions} ${unevaluatedDates.join(' ')} placeholder='Select month' aria-describedby='${elementId}-desc' aria-label='Select month'`;

      return `<input type='${type}' ${finalOptions}><span id='${elementId}-desc' class='visually-hidden'>${descText}</span>`;
    }

    // replace |tel| with phone input

    questText = questText.replace(/\|tel\|(?:([^\|\<]+[^\|]+)\|)?/g, fPhone);
    function fPhone(fullmatch, opts) {
      const { options } = guaranteeIdSet(opts, "tel");
      return `<input type='tel' ${options} pattern="[0-9]{3}-?[0-9]{3}-?[0-9]{4}" maxlength="12" placeholder='###-###-####'></input>`;
    }

    // replace |SSN| with SSN input
    questText = questText.replace(/\|SSN\|(?:([^\|\<]+[^\|]+)\|)?/g, fSSN);
    function fSSN(fullmatch, opts) {
      const { options } = guaranteeIdSet(opts, "SSN");
      return `<input type='text' ${options} id="SSN" class="SSN" inputmode="numeric" maxlength="11" pattern="[0-9]{3}-?[0-9]{2}-?[0-9]{4}"   placeholder="_ _ _-_ _-_ _ _ _"></input>`;
    }

    // replace |SSNsm| with SSN input
    questText = questText.replace(/\|SSNsm\|(?:([^\|\<]+[^\|]+)\|)?/g, fSSNsm);
    function fSSNsm(fullmatch, opts) {
      const { options } = guaranteeIdSet(opts, "SSNsm");
      return `<input type='text' ${options} class="SSNsm" inputmode="numeric" maxlength="4" pattern='[0-9]{4}'placeholder="_ _ _ _"></input>`;
    }

    // replace |zip| with text input
    questText = questText.replace(/\|zip\|(?:([^\|\<]+[^\|]+)\|)?/g, fzip);
    function fzip(fullmatch, opts) {
      const { options, elementId } = guaranteeIdSet(opts, "zip");
      return `<input type='text' ${options} id=${elementId} class="zipcode" pattern="^[0-9]{5}(?:-[0-9]{4})?$"   placeholder="_ _ _ _ _"></input>`;
    }

    // replace |state| with state dropdown
    questText = questText.replace(/\|state\|(?:([^\|\<]+[^\|]+)\|)?/g, fState);
    function fState(fullmatch, opts) {
      const { options } = guaranteeIdSet(opts, "state");
      return `<select ${options}>
        <option value='' disabled selected>${i18n.chooseState}: </option>
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

    function guaranteeIdSet(options = "", inputType = "inp") {
      if (options) {
        options = options.trim();
      }

      let elementId = options.match(elementIdRegex);
      if (!elementId) {
        elementId = `${questionID}_${inputType}`;
        options = `${options} id=${elementId}`;
      } else {
        elementId = elementId[1];
      }
      return { options: options, elementId: elementId };
    }

    // replace |image|URL|height,width| with a html img tag...
    questText = questText.replace(
      /\|image\|(.*?)\|(?:([0-9]+),([0-9]+)\|)?/g,
      "<img src=https://$1 height=$2 width=$3 loading='lazy'>"
    );

    //regex to test if there are input as a part of radio or checkboxes
    //let radioCheckboxAndInput = false;
    if (questText.match(/(\[|\()(\d*)(?:\:(\w+))?(?:\|(\w+))?(?:,(displayif=.+?\))?)?(\)|\])\s*(.*?\|_.*?\|)/g)) {
      //radioCheckboxAndInput = true;
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
      let radioElementName = match[2] ? match[2] : questionID;
      let labelID = match[3] ? match[3] : `${radioElementName}_${value}_label`;

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
      let display_if = match[4] ? radioButtonMetaData.substring(radioButtonMetaData.indexOf(match[4]), radioButtonMetaData.length - 1).trim() : "";
      display_if = (display_if) ? `displayif=${encodeURIComponent(display_if)}` : ""
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
    for (let match = questText.match(buttonRegex); match; match = questText.match(buttonRegex)) {
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
        elVar = questionID;
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
      return `
        <label for='${elementId}' class='visually-hidden'>Enter Time</label>
        <input type='time' id='${elementId}' ${options} aria-label='Enter Time'>
      `;
    }

    // TODO: (future): format for number input boxes needs adjustment for screen readers (description text first or aria description)
    // replace |__|__|  with a number box...
    questText = questText.replace(/\|(?:__\|){2,}(?:([^\|\<]+[^\|]+)\|)?/g, fNum);

    function fNum(fullmatch, opts) {
      const value = questText.startsWith('<br>') ? questText.split('<br>')[0] : '';
      // make sure that the element id is set...
      let { options, elementId } = guaranteeIdSet(opts, "num");
      
      options = options.replaceAll('"', "'");
      //instead of replacing max and min with data-min and data-max, they need to be added, as the up down buttons are needed for input type number
      let optionObj = paramSplit(options)

      //replace options with split values (uri encoded)
      options = reduceObj(optionObj)
      if (Object.prototype.hasOwnProperty.call(optionObj, "min")) {
        options = options + ` data-min="${optionObj.min}"`
      }
      if (Object.prototype.hasOwnProperty.call(optionObj, "max")) {
        options = options + ` data-max="${optionObj.max}"`
      }

      // Handle not converted and not yet calculated min and max values
      const minMaxValueTest = (value) => { return value && !value.startsWith('valueOr') && !value.includes('isDefined') && value !== '0' ? value : ''; }
      // Evaluate min and max, ensuring they are valid numbers or get evaluated if they aren't.
      const evaluateMinMax = (value) => {
        let result = minMaxValueTest(value);
        if (result && isNaN(result)) {
          result = evaluateCondition(result);
          if (isNaN(result)) result = '';  // Reset if still not a number after evaluation
        }
        return result;
      };

      // Process min and max values
      let min = evaluateMinMax(optionObj.min);
      let max = evaluateMinMax(optionObj.max);

      // Build the description text
      const descriptionText = `This field accepts numbers. Please enter a whole number ${min && max ? `between ${min} and ${max}` : ''}.`;
      const defaultPlaceholder = `placeholder="${moduleParams.i18n.enterValue}"`;

      // Use default placeholder when min to max range is a large distribution, e.g. max weight (999) and max age (125), max pills (100).
      // Same for min == 0. Show default placeholder for those cases.
      let placeholder;
      if (max && max >= 50) {
        placeholder = defaultPlaceholder;
      } else if (min && max) {
        const avgValue = Math.floor((parseInt(min, 10) + parseInt(max, 10)) / 2);
        placeholder = `placeholder="${moduleParams.i18n.example}: ${avgValue}"`;
      } else {
        placeholder = defaultPlaceholder;
      }

      options += ` ${placeholder} aria-describedby="${elementId}-desc"`;

      //onkeypress forces whole numbers
      return `<input type='number' aria-label='${value}' step='any' onkeypress='return (event.charCode == 8 || event.charCode == 0 || event.charCode == 13) ? null : event.charCode >= 48 && event.charCode <= 57' name='${questionID}' ${options}>
              <div id="${elementId}-desc" class="visually-hidden">${descriptionText}</div><br>`;
    }

    // replace |__| or [text box:xxx] with an input box...
    questText = questText.replace(/\[text\s?box(?:\s*:\s*(\w+))?\]/g, fTextBox);
    function fTextBox(fullmatch, options) {
      let id = options ? options : `${questionID}_text`;
      return `|__|id=${id} name=${questionID}|`;
    }

    questText = questText.replace(/(.*)?\|(?:__\|)(?:([^\s<][^|<]+[^\s<])\|)?(.*)?/g, fText);
    function fText(fullmatch, value1, opts, value2) {
      let { options } = guaranteeIdSet(opts, "txt");
      options = options.replaceAll(/(min|max)len\s*=\s*(\d+)/g,'data-$1len=$2')
      
      const ariaLabel = i18n.enterValue;
      const inputElement = `<input type='text' aria-label='${ariaLabel}' name='${questionID}' ${options}></input>`;
      
      if (value1 && value1.includes('div')) {
        return `${value1}${inputElement}${value2 || ''}`;
      }

      const span1 = value1 ? `<span>${value1}</span>` : '';
      const span2 = value2 ? `<span>${value2}</span>` : '';

      return `${span1}${inputElement}${span2}`;
    }

    // replace |___| with a textarea...
    questText = questText.replace(/\|___\|((\w+)\|)?/g, fTextArea);
    function fTextArea(x1, y1, z1) {
      let elId = "";
      if (z1 == undefined) {
        elId = questionID + "_ta";
      } else {
        elId = z1;
      }

      return `<label for="${elId}" class="visually-hidden"></label>
        <textarea id='${elId}' name='${elId}' style="resize:auto;" aria-label='Enter your response'></textarea>`;
    }

    // replace #YNP with Yes No input: `(1) Yes, (0) No, (99) Prefer not to answer`
    questText = questText.replace(
      /#YNP/g,
      `<div role="radiogroup" aria-labelledby="yesNoDontKnowLabel">
        <label id="yesNoDontKnowLabel" class="visually-hidden">Select "Yes," "No," or "Prefer not to answer" to answer the question.</label>
        <ul>
          <li class='response'>
            <input type='radio' id="${questionID}_1" name="${questionID}" value="yes">
            <label for='${questionID}_1'>${i18n.yes}</label>
          </li>
          <li class='response'>
            <input type='radio' id="${questionID}_0" name="${questionID}" value="no">
            <label for='${questionID}_0'>${i18n.no}</label>
          </li>
          <li class='response'>
            <input type='radio' id="${questionID}_99" name="${questionID}" value="prefer not to answer">
            <label for='${questionID}_99'>${i18n.preferNotToAnswer}</label>
          </li>
        </ul>
      </div>
      `
    );

    // replace #YN with Yes No input: `(1) Yes, (0) No`
    questText = questText.replace(
      /#YN/g,
      `<div role="radiogroup" aria-labelledby="yesNoLabel">
        <div id="yesNoLabel" class="visually-hidden">Select "Yes" or "No" to answer the question.</div>
        <ul>
          <li class='response'>
            <input type='radio' id="${questionID}_1" name="${questionID}" value="yes">
            <label for='${questionID}_1'>${i18n.yes}</label>
          </li>
          <li class='response'>
            <input type='radio' id="${questionID}_0" name="${questionID}" value="no">
            <label for='${questionID}_0'>${i18n.no}</label>
          </li>
        </ul>
      </div>
      `
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
        name = cbName ? `name="${cbName}"` : `name="${questionID}"`;
      }

      let id = cbArgs.match(/id=['"]?(\w+)/);
      // if the user does supply the id in the cbArgs, we add it to.
      // otherwise it is in the cbArgs...
      let forceId = "";
      if (id) {
        id = id[1];
      } else {
        id = cbName ? cbName : `${questionID}_${cbValue}`;
        forceId = `id=${id}`;
      }

      let skipTo = skipToId ? `skipTo=${skipToId}` : "";
      let value = cbValue ? `value=${cbValue}` : "";
      let rv = `<li class='response'><input type='${inputType}' ${forceId} ${name} ${value} ${cbArgs} ${skipTo}><label for='${id}'>${labelText}${textBox}</label></li>`;
      return rv;
    }
    // SAME thing but this time with a textarea...

    //displayif with just texts
    // the : changes the standard span to a div.
    questText = questText.replace(/\|displayif=(.+?)(:)?\|(.*?)\|/g, fDisplayIfSpanToDiv);
    function fDisplayIfSpanToDiv(containsGroup, condition, nl, text) {
      condition = condition.replaceAll('"', "'");
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
      return `<input type='hidden'${ifArgs} id='${questionID}_skipto_${skipTo}' name='${questionID}' skipTo=${skipTo} checked>`;
    }

    // replace next question  < #NR -> > with hidden...
    questText = questText.replace(
      /<\s*#NR\s*->\s*([A-Z_][A-Z0-9_#]*)\s*>/g,
      "<input type='hidden' class='noresponse' id='" +
      questionID +
      "_NR' name='" +
      questionID +
      "' skipTo=$1 checked>"
    );

    // handle skips
    questText = questText.replace(
      /<input ([^>]*?)><\/input><label([^>]*?)>(.*?)\s*->\s*([^<\s]*?)\s*<\/label>/g,
      "<input $1 skipTo='$4'></input><label $2>$3</label>"
    );
    questText = questText.replace(
      /<textarea ([^>]*)><\/textarea>\s*->\s*([^\s<]+)/g,
      "<textarea $1 skipTo=$2 aria-label='Enter your response'></textarea>"
    );
    questText = questText.replace(/<\/div><br>/g, "</div>");

    // handle the back/next/reset buttons
    const hasInputfield = questText.includes('input');
    const questButtonsDiv = this.getButtonDiv(hasInputfield, questionID, endMatch, target);
    
    return `
      <form class='question' id='${questionID}' ${questOpts} ${questArgs} novalidate hardEdit='${hardBool}' softEdit='${softBool}'>
        <fieldset>
          ${questText}
        </fieldset>
        ${questButtonsDiv}
        <div class="spacePadding"></div>
      </form>
    `;
  }

  replaceTodayTag(match, offset) {
    // If no (+/- offset), we want today.
    if (!offset || offset.trim().length == 0) {
      return this.precalculated_values.quest_format_date;
    }
    offset = parseInt(offset.replace(/\s/g, ""));
    let offset_date = new Date(this.precalculated_values.current_date);
    offset_date.setDate(this.precalculated_values.current_day + offset);
    return this.dateToQuestFormat(offset_date);
  }

  dateToQuestFormat(date) {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }

  getButtonDiv(hasInputField, questionID, endMatch, target) {
    const nextButton = endMatch
        ? ""
        : `<button type='submit' class='next w-100' ${target} aria-label='Next question' data-click-type='next'>${this.buttonTextObj.next}</button>`;
    
    const resetButton = (questionID === 'END')
        ? `<button type='submit' class='reset w-100' id='submitButton' aria-label='Submit your survey' data-click-type='submitSurvey'>${this.buttonTextObj.submit}</button>`
        : hasInputField
            ? `<button type='submit' class='reset w-100' aria-label='Reset this answer' data-click-type='reset'>${this.buttonTextObj.reset}</button>`
            : "";

    const prevButton = (endMatch && endMatch[1]) === "noback"
        ? ""
        : (questionID === 'END')
            ? `<button type='submit' class='previous w-100' id='lastBackButton' aria-label='Back to the previous section' data-click-type='previous'>${this.buttonTextObj.back}</button>`
            : `<button type='submit' class='previous w-100' aria-label='Back to the previous question' data-click-type='previous'>${this.buttonTextObj.back}</button>`;

    // Note: buttons are ordered horizontally on larger screens: (1) back, (2) reset, (3) next, and vertically on smaller screens: (1) next, (2) reset, (3) back.
    // The below HTML structure enhances tab order for accessibility, always tabbing to the 'next' button first, then reset, then back.
    return `
        <div class="py-0">
            <div class="row d-flex flex-column flex-md-row">
                <div class="col-md-3 col-sm-12 mb-1 mb-md-0 order-md-3">
                    ${nextButton}
                </div>
                <div class="col-md-6 col-sm-12 mb-1 mb-md-0 order-md-2">
                    ${resetButton}
                </div>
                <div class="col-md-3 col-sm-12 mb-1 mb-md-0 order-md-1">
                    ${prevButton}
                </div>
            </div>
        </div>
    `;
  }
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

// Handle the questions in the loops. Each element in res is a loop in the questionnaire.
function unrollLoops(txt, language) {
  const loopRegex = /<loop max=(\d+)\s*>(.*?)<\/loop>/gm;
  const questionIDRegex = /\[([A-Z_][A-Z0-9_#]*)([?!]?)(?:\|([^|\]]+)\|)?(,.*?)?\]/gm;
  const disIfRegex = /displayif=.*?\(([A-Z_][A-Z0-9_#]*),.*?\)/g;

  txt = txt.replace(/(?:\r\n|\r|\n)/g, "\xa9");

  const allLoopMarkdown = [...txt.matchAll(loopRegex)].map(function (x, indx) {
    return { cnt: x[1], txt: x[2], indx: indx + 1, orig: x[0] };
  });
  
  // Prepare the markdown for conversion to HTML (that happens in a later step)
  let cleanedText = allLoopMarkdown.map(function (x) {
    // Handle the 'firstquestion' parameter, which is present in some surveys and missing in others.
    // Insert the parameter in the first question of the loop in the |options| section of the HTML string
    // for evaluation runtime. The same applies to the 'loopmax' parameter. These control loop behavior.
    let isFirstQuestion = true;

    x.txt = x.txt.replace(questionIDRegex, (match, id, operator, opts, args) => {
      if (isFirstQuestion) {
        // Extract 'loopmax' value from 'displayif' if present
        const loopMaxMatch = x.txt.match(/displayif=greaterThanOrEqual\((D_\d+(?:_V\d+)?),#loop\)/);
        const loopMaxString = loopMaxMatch ? ` loopmax=${loopMaxMatch[1]}` : '';
        
        // Check if 'firstquestion' is already in options
        // If missing, add 'firstquestion' and 'loopmax' to the first question's options parameters
        if (!opts || !opts.includes('firstquestion')) {
          opts = (opts ? opts.trim() + ' ' : '') + `firstquestion=#loop${loopMaxString}`;
        } else if (loopMaxString && !opts.includes('loopmax')) {
          opts = opts.trim() + loopMaxString;
        }

        isFirstQuestion = false;
      }

      // Reconstruct the question ID with updated options
      return `[${id}${operator || ''}${opts ? '|' + opts + '|' : ''}${args || ''}]`;
    });

    // All first questions in the loop should have the 'firstquestion' parameter. Add the loop index.
    x.txt = x.txt.replace("firstquestion", `loopindx=${x.indx} firstquestion`);

    x.txt += "[_CONTINUE" + x.indx + ",displayif=setFalse(-1,#loop)]";

    x.txt = x.txt.replace(/->\s*_CONTINUE\b/g, "-> _CONTINUE" + x.indx);
    let ids = [...x.txt.matchAll(questionIDRegex)].map((y) => ({
      label: y[0],
      id: y[1],
      operator: y[2],
      indx: x.indx,
    }));

    let disIfIDs = [...x.txt.matchAll(disIfRegex)].map((disIfID) => ({
      label: disIfID[0],
      id: disIfID[1],
    }));
    disIfIDs.map((x) => x.id);
    ids.map((x) => x.id);

    // find all ids defined within the loop,
    // note: textboxes are an outlier that needs to be fixed.
    let idsInLoop = Array.from(x.txt.matchAll(/\|[\w\s=]*id=(\w+)|___\|\s*(\w+)|textbox:\s*(\w+)/g)).map(x => {
      return x[1] ? x[1] : (x[2] ? x[2] : x[3])
    })

    // combobox and radiobuttons may have been renamed...
    let rb_cb_regex = /(?:[\(\[])\d+:(.*?)[\,\)\]]/g

    // goto from 1-> max for human consumption... need <=
    let loopText = "";
    for (let loopIndx = 1; loopIndx <= x.cnt; loopIndx++) {
      let currentText = x.txt;

      //replace all instances of the question ids with id_#
      ids.map((id) => (currentText = currentText.replace(
        new RegExp("\\b" + id.id + "\\b(?!\#)", "g"),
        `${id.id}_${loopIndx}_${loopIndx}`))
      );

      //replace all idsInLoop in the loop with {$id_$loopIndx}
      idsInLoop.forEach(id => {
        currentText = currentText.replace(new RegExp(`\\b${id}\\b`, "g"), `${id}_${loopIndx}_${loopIndx}`);
      })

      //replace all user-named combo and radio boxes
      currentText = currentText.replaceAll(rb_cb_regex, (all, g1) => all.replace(g1, `${g1}_${loopIndx}`))
      currentText = currentText.replace(/\{##\}/g, `${ordinal(loopIndx, language)}`)

      ids.map(() => (currentText = currentText.replace(/#loop/g, "" + loopIndx)));

      // replace  _\d_\d#prev with _{$loopIndex-1}
      // we do it twice to match a previous bug..
      currentText = currentText.replace(/_\d+_\d+#prev/g, `_${loopIndx - 1}_${loopIndx - 1}`)
      loopText = loopText + "\n" + currentText;
    }

    loopText += "[_CONTINUE" + x.indx + "_DONE" + ",displayif=setFalse(-1,#loop)]";
    loopText += "[END_OF_LOOP] placeholder";
    return loopText;
  });

  for (let loopIndx = 0; loopIndx < cleanedText.length; loopIndx++) {
    txt = txt.replace(allLoopMarkdown[loopIndx].orig, cleanedText[loopIndx]);
  }

  txt = txt.replace(/\xa9/g, "\n");

  return txt;
}
