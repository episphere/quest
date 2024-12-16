import { moduleParams } from './questionnaire.js';
import { initializeCustomMathJSFunctions, math } from './customMathJSImplementation.js';
import { initializeStateManager } from './stateManager.js';
import { QuestionProcessor } from './questionProcessor.js';
import { getStateManager } from './stateManager.js';

/**
 * Initialize the survey: state manager, precalculated values, mathJS implementation, and questionProcessor.
 * Normalize ids in asyncQuestionsMap for DOM manipulation: [D_761310265?] -> D_761310265.
 * moduleParams.activate determines if the survey is embedded in an application or found in the included rendering tool.
 * If activate is true, the survey is embedded and the retrieve function and CSS files are fetched.
 * If activate is false, the survey is standalone in the renderer tool.
 * @param {String} markdown - The markdown contents of the survey prior to transformation.
 * @returns {Array} - An array containing the transformed contents, questName, and retrievedData.
 */
export async function initSurvey(markdown) {
    initializeStateManager(moduleParams.store);
    initializeCustomMathJSFunctions();

    const precalculated_values = getPreCalculatedValues(markdown);
    const questionProcessor = new QuestionProcessor(markdown, precalculated_values, moduleParams.i18n);
    
    const stateManager = getStateManager();
    stateManager.setQuestionProcessor(questionProcessor);

    moduleParams.asyncQuestionsMap = Object.fromEntries(
        Object.entries(moduleParams.asyncQuestionsMap).map(([key, value]) => {
            const normalizedKey = key.replace(/[[\]]/g, '').replace(/[?!]$/, '');
            return [normalizedKey, value];
        })
    );

    return !moduleParams.isRenderer
        ? await fetchAndProcessResources()
        : null;
}

/**
 * Fetch and process the resources for the survey. This includes the retrieve function (existing user data) and CSS files.
 * See moduleParams for the configuration (replace2.js).
 * @returns {Object} - The retrieved data from the retrieve function or null.
 */
async function fetchAndProcessResources() {
    // Helper function to unwrap the data from the retrieve function response. This format is necessary for fillForm().
    function unwrapData(data) {
        if (data && typeof data === 'object' && !Array.isArray(data)) {
            const keys = Object.keys(data);
            if (keys.length === 1) {
                return data[keys[0]];
            }
        }
        return data;
    }
    
    try {
        const shouldFetchStylesheets = moduleParams.url && moduleParams.activate;

        const [retrieveFunctionResponse, cssActiveLogic, cssStyle1] = await Promise.all([
            moduleParams.retrieve && !moduleParams.surveyDataPrefetch ? moduleParams.retrieve() : Promise.resolve(),
            shouldFetchStylesheets ? fetch(`${moduleParams.basePath}ActiveLogic.css`).then(response => response.text()) : Promise.resolve(),
            shouldFetchStylesheets ? fetch(`${moduleParams.basePath}Style1.css`).then(response => response.text()) : Promise.resolve(),
        ]);

        // retrievedData is the prefetched user data, the result of the retrieve function, or null (for the renderer or when no retrieve function is provided).
        const retrievedData = moduleParams.surveyDataPrefetch || unwrapData(retrieveFunctionResponse?.data);

        // Add the stylesheets to the document.
        if (shouldFetchStylesheets) {
            [cssActiveLogic, cssStyle1].forEach((css) => {
                const cssTextBlob = new Blob([css], { type: 'text/css' });
                const stylesheetLinkElement = document.createElement('link');
                stylesheetLinkElement.rel = 'stylesheet';
                stylesheetLinkElement.href = URL.createObjectURL(cssTextBlob);
                document.head.appendChild(stylesheetLinkElement);
            });
        }

        return retrievedData;
    } catch (error) {
        moduleParams.errorLogger('Error fetching retrieve function and css:', error);
        return null;
    }
}

/**
 * Pre-calculate values for the survey that don't work with the service worker.
 * Date operations and operations 'window' access are not compatible with the worker. Pre-calculate these values prior to worker access.
 * @param {String} contents - The markdown contents of the survey prior to transformation.
 * @returns {Object} - The precalculated values for the survey.
 */
function getPreCalculatedValues(contents) {

    const dateToQuestFormat = (date) => {
        return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    }

    const current_date = new Date();

    const precalculated_values = { 
        current_date: current_date,
        current_day: current_date.getDate(),
        current_month_str: moduleParams.i18n.months[current_date.getMonth()],
        current_month: current_date.getMonth() + 1,
        current_year: current_date.getFullYear(),
        quest_format_date: dateToQuestFormat(current_date),
    };

    // Find all user variables in the questText and add them to precalculated_values.
    [...contents.matchAll(/\{\$u:(\w+)}/g)].forEach(([, varName]) => {
        precalculated_values[varName] = math._value(varName);
    });

    return precalculated_values;
}