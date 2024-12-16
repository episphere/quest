import { math } from './customMathJSImplementation.js';
import { knownFunctions } from "./knownFunctions.js";
import { getStateManager } from "./stateManager.js";
import { moduleParams } from './questionnaire.js';

// RegExp to segment text conditions passed in as a string with '[', '(', ')', ',', and ']'. https://stackoverflow.com/questions/6323417/regex-to-extract-all-matches-from-string-using-regexp-exec
const evaluateConditionRegex = /[(),]/g;

/**
 * Try to evaluate using mathjs. Use fallback evaluation in the catch block.
 * math.evaluate(<string>) is a built-in mathjs func to evaluate string as mathematical expression.
 * @param {string} evalString - The string condition (markdown) to evaluate.
 * @returns {any}- The result of the evaluation.
 */

export function evaluateCondition(evalString) {
    evalString = decodeURIComponent(evalString);

    try {
        return math.evaluate(evalString)
    } catch (err) { //eslint-disable-line no-unused-vars

        let displayIfStack = [];
        let lastMatchIndex = 0;

        // split the displayif string into a stack of strings and operators
        for (const match of evalString.matchAll(evaluateConditionRegex)) {
            displayIfStack.push(evalString.slice(lastMatchIndex, match.index));
            displayIfStack.push(match[0]);
            lastMatchIndex = match.index + 1;
        }

        // remove all blanks
        displayIfStack = displayIfStack.filter((x) => x != "");

        const appState = getStateManager();

        // Process the stack
        while (displayIfStack.indexOf(")") > 0) {
            const stackEnd = displayIfStack.indexOf(")");

            if (isValidFunctionSyntax(displayIfStack, stackEnd)) {
                const { func, arg1, arg2 } = getFunctionArgsFromStack(displayIfStack, stackEnd, appState);
                const functionResult = knownFunctions[func](arg1, arg2, appState);

                // Replace from stackEnd-5 to stackEnd with the results. Splice and replace the function call with the result.
                displayIfStack.splice(stackEnd - 5, 6, functionResult);

            } else {
                moduleParams.errorLogger('Error in Displayif Function:', evalString, displayIfStack);
                throw { Message: "Bad Displayif Function: " + evalString, Stack: displayIfStack };
            }
        }

        return displayIfStack[0];
    }
}

/**
 * Test the string-based function syntax for a valid function call (converting markdown function strings to function calls).
 * These are legacy, hardcoded conditions that must apply for 'knownFunctions' to evaluate.
 * @param {array} stack - The stack of string-based conditions to evaluate.
 * @param {number} stackEnd - The index of the closing parenthesis in the stack.
 */

const isValidFunctionSyntax = (stack, stackEnd) => {
    return stack[stackEnd - 4] === "(" &&
        stack[stackEnd - 2] === "," &&
        stack[stackEnd - 5] in knownFunctions
}

/**
 * Get the current function and arguments to evaluate from the stack.
 * func, arg1, arg2 are in the stack at specific locations: callEnd-5, callEnd-3, callEnd-1
 * First, the individual arguments are evaluated to resolve any string-based conditions.
 * Then, the function and arguments are returned as an object for evaluation as an expression.
 * @param {array} stack - The stack of string-based conditions to evaluate.
 * @param {number} callEnd - The index of the closing parenthesis in the stack.
 * @param {object} appState - The application state.
 * @returns {object} - The function and arguments to evaluate.
 */

function getFunctionArgsFromStack(stack, callEnd, appState) {
    const func = stack[callEnd - 5];

    let arg1 = stack[callEnd - 3];
    arg1 = evaluateArg(arg1, appState);

    let arg2 = stack[callEnd - 1];
    arg2 = evaluateArg(arg2, appState);

    return { func, arg1, arg2 };
}

/**
 * Evaluate the individual args embedded in conditions.
 * Return early for: undefined, hardcoded numbers and booleans (they get evaluated in mathjs), and known loop markers.
 * Otherwise, search for values in the surveyState. This search covers responses and 'previousResults' (values from prior surveys passed in on initialization).
 * @param {string} arg - The argument to evaluate.
 * @param {object} appState - The application state.
 * @returns {string} - The evaluated argument.
 */

function evaluateArg(arg, appState) {
    if (arg === null || arg === 'undefined') return arg;
    else if (typeof arg === 'number' || parseInt(arg, 10) || parseFloat(arg)) return arg;
    else if (['true', true, 'false', false].includes(arg)) return arg;
    else if (arg === '#loop') return arg;
    else return appState.findResponseValue(arg) ?? '';
}