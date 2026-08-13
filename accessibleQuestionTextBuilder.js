import { evaluateCondition } from './evaluateConditions.js';
import { handleForIDAttributes, moduleParams } from './questionnaire.js';

/**
 * Initialize the question text and focus management for screen readers.
 * This drives the screen reader's question announcement and focus when a question is loaded.
 * Set the focus after a brief timeout to ensure the screen reader has time to process the new content.
 * @param {HTMLElement} fieldsetEle - The fieldset element containing the question text.
 * @param {Boolean} questionFocusSet - The flag to manage screen reader focus.
 * @param {Boolean} isModalClose - The flag to reset the questionFocusSet flag on modal close.
 * @returns {Boolean} - The updated questionFocusSet flag.
 */

export function manageAccessibleQuestion(fieldsetEle, questionFocusSet) {
    if (fieldsetEle && !questionFocusSet) {
        // Build the question text and get the focusable element
        let focusableEle = buildQuestionText(fieldsetEle);

        // Focus the hidden, focusable element
        if (!moduleParams.isRenderer) {
            setTimeout(() => {
                // A response or submit dialog may open before this delayed
                // question-focus handoff runs. Keep focus in the active modal
                // instead of returning it to content behind the dialog.
                const openModal = moduleParams.questDiv?.querySelector('.modal.show');
                if (focusableEle.isConnected && !openModal) {
                    focusableEle.focus({ preventScroll: true });
                }
            }, 500);
        }

        questionFocusSet = true;
    }

    return questionFocusSet;
}

/**
 * Build the question text for screen readers.
 * Calculate the breakpoint between question and responses for accessible focus management.
 * Create a legend tag for the question text - legend tags are automatically read by screen readers.
 * Create a hidden, focusable element for screen reader focus management.
 * This sets the starting accessible control point just after the question text and before the responses list or table. 
 * @param {HTMLElement} fieldsetEle - The fieldset element containing the question text.
 * @returns {HTMLElement} - The hidden, focusable element for screen reader focus management.
 */

function buildQuestionText(fieldsetEle) {
    let focusNode = null;
    let multiQuestionStartIndex = null;

    // The conditions for building textContent (survey questions) for the screen reader.
    const textNodeConditional = (node) =>
        node.nodeType === Node.TEXT_NODE ||
        (node.nodeType === Node.ELEMENT_NODE &&
            !['INPUT', 'BR', 'LABEL', 'LEGEND', 'TABLE'].includes(node.tagName) &&
            !node.classList.contains('response'));
    
    const isTerminalText = (text) => {
        const trimmed = text.trim();
        return trimmed.endsWith('?') ||
            trimmed.endsWith('...') ||
            trimmed.endsWith('tion:');
    };

    const childNodes = Array.from(fieldsetEle.childNodes);

    // Collect the question text and find the split point for responses.
    const questionElements = [];

    for (let nodeIndex = 0; nodeIndex < childNodes.length; nodeIndex++) {
        const node = childNodes[nodeIndex];
        if (textNodeConditional(node)) {
            // Special <br> handling to retain spacing for top headings with question text below.
            if (node.tagName === 'B' && nodeIndex <= 1 && (nodeIndex === 0 || (childNodes[nodeIndex - 1].nodeType === Node.TEXT_NODE && !childNodes[nodeIndex - 1].textContent.trim()))) {
                questionElements.push(node.cloneNode(true));

                // Ensure exactly two <br> nodes follow the <b> tag.
                let brCount = 0;
                let nextSiblingNodeIndex = nodeIndex + 1;

                // Count existing <br> nodes after the <b> heading.
                while (nextSiblingNodeIndex < childNodes.length && childNodes[nextSiblingNodeIndex].tagName === 'BR') {
                    questionElements.push(childNodes[nextSiblingNodeIndex].cloneNode(true)); // Include existing <br> nodes.
                    brCount++;
                    nextSiblingNodeIndex++;
                }

                // Add missing <br> nodes for a total of two.
                while (brCount < 1) {
                    const brNode = document.createElement('br');
                    questionElements.push(brNode);
                    brCount++;
                }

                continue;
            }

            // Stop collecting for legend if we hit the input labels
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().startsWith('#')) {
                focusNode = node;
                break;
            }

            // Stop collecting for legend if we hit text + number input node.
            if (node.nodeType === Node.TEXT_NODE && nodeIndex + 1 < childNodes.length && childNodes[nodeIndex + 1] && childNodes[nodeIndex + 1].tagName === 'INPUT' && (childNodes[nodeIndex + 1].type === 'number')) {
                focusNode = node;
                break;
            }

            questionElements.push(node.cloneNode(true));
            
            // Stop collecting for the legend at the end of the primary prompt.
            // Preserve its next sibling as the boundary before responses (or
            // before any subsequent prompts in a multi-question fieldset).
            if (node.nodeType === Node.TEXT_NODE && isTerminalText(node.textContent)) {
                focusNode = node.nextSibling;
                // The next sibling is the first node that has not been
                // consumed by the primary prompt. It may be either the first
                // response or the first fragment of a subsequent prompt, so
                // the compound-question scan must include it.
                multiQuestionStartIndex = nodeIndex + 1;
                break;
            }

            // Stop looping if the text contains the 'a summary' text (otherwise the summary prompts get compressed).
            if (node.textContent && node.textContent.includes('a summary')) {
                focusNode = node.nextSibling;
                break;
            }

        } else if (node.tagName === 'BR') {
            if (nodeIndex + 2 < childNodes.length && childNodes[nodeIndex + 1] && childNodes[nodeIndex + 1].tagName === 'BR' && childNodes[nodeIndex + 2] && childNodes[nodeIndex + 2].tagName === 'BR') {
                //remove one <br> tag to ensure only two <br> tags are present after the <b> tag.
                fieldsetEle.removeChild(node); // Remove the first <br> tag.
            }
            continue; // Skip <br> tags.
        } else {
            focusNode = node; // The focus node splits questions and responses. The invisible focusable element is placed here.
            break;
        }
    }

    // Handle cases where no split point is found.
    if (!focusNode) {
        focusNode = fieldsetEle.querySelector('legend') || fieldsetEle.lastChild || fieldsetEle;
    } else {
        handleMultiQuestionSurveyAccessibility(
            childNodes,
            fieldsetEle,
            multiQuestionStartIndex ?? childNodes.indexOf(focusNode) + 1,
        );
    }
    
    // Create the <legend> tag for screen readers and move the question text into it.
    const updatedFieldset = manageAccessibleFieldset(fieldsetEle, questionElements);
    // Create and return the hidden, focusable element for screen reader focus management.
    return createFocusableElement(updatedFieldset, focusNode);
}

// Find additional questions (e.g. QoL multi-question surveys).
// Start at the supplied unconsumed-node index since the initial question is
// handled above for all cases.
// Swap those nodes (text, <b>, <u>, <i>, and embedded <br>) into divs and add a tabindex to make them focusable for screen reader accessibility.
function handleMultiQuestionSurveyAccessibility(childNodes, fieldsetEle, startIndex) {
    // Array holds the question objects
    let questions = [];

    // Question and nodes accumulated each iteration, added to the questions array at the end of each iteration.
    let currentQuestionFragments = [];
    let currentNodesToRemove = [];

    for (let i = startIndex; i < childNodes.length; i++) {
        const node = childNodes[i];

        // Stop at the first input/Table/Label node. Multi-question surveys don't have these nodes.
        if (['INPUT', 'TABLE', 'LABEL'].includes(node.tagName)) {
            break;
        }

        // If the node is a text node and not empty, add it to the current question.
        if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim() !== '') {
            currentQuestionFragments.push(node.textContent.trim());
            currentNodesToRemove.push(node);

        // If currentQuestion is popluated and the node is a <br>, that marks the end of a question. Note: exclude text nodes with '\n' only.
        // Wrap the current question in a div and add a tabindex. Remove the next <br> node if it exists to preserve spacing.
        } else if (['U', 'B', 'I'].includes(node.tagName)) {
            const tag = node.tagName.toLowerCase();
            const wrappedText = `<${tag}>${node.textContent.trim()}</${tag}>`;
            currentQuestionFragments.push(wrappedText);
            currentNodesToRemove.push(node);

        // If currentQuestion is popluated and the node is a <br>, retain the br for accurate spacing.
        } else if (node.tagName === 'BR') {
            if (currentQuestionFragments.length > 0) {
                currentQuestionFragments.push('<br>');
                currentNodesToRemove.push(node);
            }

        // If currentQuestion is populated and the node is a <div>, these parameters mark the end of the question. Build the question object.
        } else if (node.classList?.contains('response') && currentQuestionFragments.length > 0) {
            const questionHTML = currentQuestionFragments.join(' ');

            questions.push({
                questionHTML,
                nodesToRemove: [...currentNodesToRemove],
                insertBeforeRef: currentNodesToRemove[0],
            });

            // Reset for the next question
            currentQuestionFragments = [];
            currentNodesToRemove = [];
        }
    }

    // Do the DOM manipulation. Edge case to skip: caption text after a single question (e.g. Mod 1: How old is your mother today? __<Input>__ "Mother’s age")
    if (questions.length === 1 && !questions[0].questionHTML.includes('?')) return;

    questions.forEach(question => {
        const { questionHTML, nodesToRemove, insertBeforeRef } = question;

        // Create the new div with the question text and insert it into the fieldset
        const div = document.createElement('div');
        div.innerHTML = questionHTML;
        div.setAttribute('tabindex', '0');
        div.setAttribute('role', 'alert');

        fieldsetEle.insertBefore(div, insertBeforeRef);

        // Remove the nodes that were replaced in reverse order to avoid index issues.
        for (let i = nodesToRemove.length - 1; i >= 0; i--) {
            fieldsetEle.removeChild(nodesToRemove[i]);
        }
    });
}

/**
 * Insert the <legend> tag for the question text. This is the accessible question text for screen readers.
 * Check for an existing <legend> tag since the user can navigate back and forth between questions.
 * Tables require special handling.
 * @param {HTMLElement} fieldsetEle - The fieldset element containing the question text.
 * @param {Array<Node>} questionElements - array of nodes to be added to the legend.
 */

function manageAccessibleFieldset(fieldsetEle, questionElements) {
    // On return to question, the legend will already be built.
    const existingLegend = fieldsetEle.querySelector('legend');
    if (existingLegend) {
        // Update the existing displayifs and forids in case the user changed a response.
        const returnToQuestion = true;
        manageFieldsetConditionals(fieldsetEle, returnToQuestion);
        return fieldsetEle;
    }
    
    // Typical path: new question is loaded. Build the legend.
    let legendEle = document.createElement('legend');
    legendEle.classList.add('question-text');

    // Add all question elements to the new <legend>, then remove the original nodes.
    questionElements.forEach((el) => legendEle.appendChild(el));
    questionElements.forEach((el) => {
        const originalNode = Array.from(fieldsetEle.childNodes).find(
            (child) => child.isEqualNode(el)
        );
        if (originalNode) {
            originalNode.remove();
        }
    });

    // The table case: no fieldset exists, create it.
    const table = fieldsetEle.querySelector('table');
    if (table) {
        // Create a new <fieldset> element, then add the <legend> to it.
        const newFieldset = document.createElement('fieldset');
        newFieldset.appendChild(legendEle);
        manageFieldsetConditionals(newFieldset);

        // Move the table inside the new <fieldset>
        table.parentNode.insertBefore(newFieldset, table);
        newFieldset.appendChild(table);
        handleQuestionBRElements(newFieldset);
        return newFieldset;

    } else {
        // Insert the <legend> as the first child of the existing <fieldset> for non-table questions.
        fieldsetEle.insertBefore(legendEle, fieldsetEle.firstChild);
        manageFieldsetConditionals(fieldsetEle);
        handleQuestionBRElements(fieldsetEle);
        return fieldsetEle;
    }
}

// If we're reuturning to a question, we need to re-check all conditionals for changes.
function manageFieldsetConditionals(fieldset, returnToQuestion = false) {
    const legend = fieldset.querySelector('legend');
    if (!legend) return;

    const questionElement = fieldset.closest('.question');
    const isSummaryPage = questionElement?.id?.includes('SUM');

    // Insert a <br> tag between the legend and the first displayif element. User hasupdated attribute to prevent multiple updates.
    const nextLegendSibling = legend.nextElementSibling;
    if (nextLegendSibling && nextLegendSibling.classList.contains('displayif') && nextLegendSibling.style.display !== 'none' && nextLegendSibling.getAttribute('hasupdate') !== 'true') {
        const brEle1 = document.createElement('br');
        const brEle2 = document.createElement('br');
        brEle1.setAttribute('hasupdate', 'true');
        brEle2.setAttribute('hasupdate', 'true');
        const afterElement = nextLegendSibling.nextElementSibling;
        fieldset.insertBefore(brEle1, afterElement);
        fieldset.insertBefore(brEle2, afterElement);
        nextLegendSibling.setAttribute('hasupdate', 'true');
    }

    // Collect text nodes that are adjacent to a hidden element with the displayif attribute.
    if (!isSummaryPage) {
        for (let i = 0; i < fieldset.childNodes.length; i++) {
            const node = fieldset.childNodes[i];
            const prevElem = node.previousElementSibling;
            const nextElem = node.nextElementSibling;

            // use hasupdate attribute to prevent multiple updates
            if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR') {
                if ((node.getAttribute('hasupdate') !== 'true' &&
                    prevElem && prevElem.classList.contains('displayif') && prevElem.style.display === 'none' &&
                    nextElem && !nextElem.classList.contains('response'))) {
                        node.style.display = 'none';
                        node.setAttribute('hasupdate', 'true');
                }
            }

            if (node.nodeType === Node.TEXT_NODE) {
                if ((prevElem && prevElem.classList.contains('response') && prevElem.hasAttribute('displayif') && prevElem.style.display === 'none') ||
                    (nextElem && nextElem.classList.contains('response') && nextElem.hasAttribute('displayif') && nextElem.style.display === 'none')) {
                    const cleaned = node.textContent.replace(/\s+/g, ' ');
                    // Set its content to the cleaned version
                    node.textContent = cleaned.trim() ? cleaned : '';
                }
            }
        }
    }

    // Handle displayifs and forids in the fieldset and it's child (legend). Separate for speficity.
    const fieldsetForIdSpans = Array.from(fieldset.querySelectorAll('[forid]'))
        .filter(el => !legend.contains(el));

    handleForIDAttributes(fieldsetForIdSpans, returnToQuestion);
    manageLegendDisplayIfs(legend, returnToQuestion);
}

/**
 * Displayifs are in the legend (question text) for summary pages and dynamic questions.
 * E.g. "Are you still experiencing ______ ?" or "Here's the information you gave us:"
 * Most questions don't have displayifs in the question text.
 * 
 * The forid spans are embedded in those displayifs, and the user's previous responses are injected.
 * Get all the span elements with class="displayif"
 * Iterate each span, pull the forid, and check & update the value from stateManager
 * Note: Some summary pages use forIds without displayifs. Handle those as a backup.
 * If/else if logic looks like it could be redundant, but it's not due to variation in markdown structures.
 * Always check for displayifs first before handling raw forIds.
 * @param {HTMLElement} legend - The legend element containing the question text (and dynamic responses)
 * @returns {void} - The forid values are updated directly in the legend
 */

function manageLegendDisplayIfs(legend, returnToQuestion) {
    // If the legend contains displayifs, manage those first.
    // Toggle visibility and update values based on the user's previous responses.
    const displayIfSpans = Array.from(legend.querySelectorAll("span.displayif"));
    if (displayIfSpans.length > 0) {
        displayIfSpans.forEach(span => {

            const displayIfAttribute = span.getAttribute('displayif');
            let conditionBool = evaluateCondition(displayIfAttribute);
            if (conditionBool) {
                span.style.display = '';
            } else {
                span.style.display = 'none';
            }

            if (/^\d{9}$/.test(span?.textContent?.trim())) {
                span.textContent = '';
            }
        });

        const forIdSpans = legend.querySelectorAll('[forid]');
        if (forIdSpans.length > 0) {
            handleForIDAttributes(forIdSpans, returnToQuestion);
        }

        resolveLegendDisplayIfWhitespace(legend);
        return;
    }

    // If no displayifs are found, check for raw forIds.
    const forIdSpans = Array.from(legend.querySelectorAll('[forid]'));
    if (forIdSpans.length > 0) {
        handleForIDAttributes(forIdSpans, returnToQuestion);
    }
}

function resolveLegendDisplayIfWhitespace(legend) {
    if (!legend) return;

    const textNodes = [];

    // Collect text nodes. Only process text nodes between displayif spans.
    for (let i = 0; i < legend.childNodes.length; i++) {
        const node = legend.childNodes[i];

        if (node.nodeType === Node.TEXT_NODE) {
            const prevElem = node.previousElementSibling;
            const nextElem = node.nextElementSibling;

            if ((prevElem && prevElem.classList?.contains('displayif') && prevElem.style.display === 'none') || (nextElem && nextElem.classList?.contains('displayif') && nextElem.style.display === 'none')) {
                textNodes.push(node);
            }
        }
    }

    if (textNodes.length === 0) return;
    normalizeCollectedTextNodes(textNodes);
}

// Normalize collected nodes: replace sequences of whitespace with a single space
function normalizeCollectedTextNodes(textNodeArray) {
    textNodeArray.forEach(textNode => {
        textNode.textContent = textNode.textContent.replace(/\s+/g, ' ');

        if (textNode.textContent.trim() === '') {
            const nextElement = textNode.nextElementSibling;
            if (nextElement &&
                nextElement.classList?.contains('displayif') &&
                nextElement.style.display === 'none') {
                textNode.textContent = '';
            }
        }
    });
}

// Remove <br> tags after the legend tag when multiple exist (too much whitespace between questions and responses).
function removeBRAfterLegend(fieldsetEle) {
    const legendEle = fieldsetEle.querySelector('legend');
    if (!legendEle) return;
    let nextSibling = legendEle.nextSibling;
    while (nextSibling?.tagName === 'BR' && nextSibling.nextSibling?.tagName === 'BR' && nextSibling.style.display !== 'none' && nextSibling.getAttribute('hasupdate') !== 'true') {
        fieldsetEle.removeChild(nextSibling);
        nextSibling = legendEle.nextSibling;
    }
}

/**
 * Traverse the question DOM and handle <br> elements.
 * @param {HTMLElement} fieldset - The question's fieldset element.
 * @param {number} maxBrs - The maximum number of <br> elements between HTMLElements.
 */

function handleQuestionBRElements(fieldset, maxBrs = 3) {
    const questionElement = fieldset.closest('.question');

    // Remove any <br> elements after the legend tag.
    removeBRAfterLegend(fieldset);

    //special handling for summary pages
    const isSummaryPage = questionElement.id.includes('SUM');
    if (isSummaryPage) {
        maxBrs = 1;
    }

    let consecutiveBrs = [];

    // Traverse the DOM tree to find all <br> elements
    questionElement.querySelectorAll('br').forEach((br) => {
        if (consecutiveBrs.length > 0 && consecutiveBrs[consecutiveBrs.length - 1].nextElementSibling === br) {
            consecutiveBrs.push(br);
        } else {
            if (consecutiveBrs.length > maxBrs) {
                // Remove all but the first two <br> elements
                consecutiveBrs.slice(maxBrs).forEach((extraBr) => extraBr.remove());
            }
            // Reset the array to start tracking a new sequence
            consecutiveBrs = [br];
        }
    });

    // Final check in case the last sequence of <br>s is at the end of the document
    if (consecutiveBrs.length > maxBrs) {
        consecutiveBrs.slice(maxBrs).forEach((extraBr) => extraBr.remove());
    }

    //Set the brs after non-displays to not show as well
    if (!isSummaryPage) {
        [...questionElement.querySelectorAll(`[style*="display: none"]+br`)].forEach((e) => {
            e.style = "display: none"
        });
    }

    // Add aria-hidden to all remaining br elements. This keeps the screen reader from reading them as 'Empty Group'.
    [...questionElement.querySelectorAll("br")].forEach((br) => {
        br.setAttribute("aria-hidden", "true");
    });

    if (isSummaryPage) {
        handleSummaryUIEdgeCases(fieldset, questionElement?.id);
    }
}

/**
 * Create a hidden, focusable element for screen reader focus management in each question.
 * @param {HTMLElement} fieldsetEle - The fieldset element containing the question text.
 * @param {Node} focusNode - The node to place the focusable element after.
 * @returns {HTMLElement} - The hidden, focusable element for screen reader focus management.
 */

function createFocusableElement(fieldsetEle, focusNode) {
    let focusableEle = fieldsetEle.querySelector('span.screen-reader-focus');
    if (!focusableEle) {
        focusableEle = document.createElement('span');
        focusableEle.classList.add('screen-reader-focus');
        focusableEle.style.cssText = `
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border: 0;
        `;

        if (focusNode && fieldsetEle.contains(focusNode)) {
            fieldsetEle.insertBefore(focusableEle, focusNode);
        } else {
            const legendEle = fieldsetEle.querySelector('legend');
            if (legendEle) {
                legendEle.after(focusableEle);
            } else {
                fieldsetEle.appendChild(focusableEle);
            }
        }
    }

    // A help control can live inside the generated legend. Keep
    // the question target immediately before that interactive
    // content so forward Tab navigation does not skip from the target to the
    // responses or action buttons after the legend.
    const legendEle = fieldsetEle.querySelector(':scope > legend');
    const legendPopover = legendEle?.querySelector('[data-bs-toggle="popover"][tabindex="0"]');
    if (legendPopover && focusableEle.parentElement !== legendEle) {
        legendEle.prepend(focusableEle);
    }

    // This target receives deliberate focus after question transitions, but
    // must not become an extra empty stop in sequential keyboard navigation.
    focusableEle.setAttribute('tabindex', '-1');

    return focusableEle;
}

/**
 * Restore question context after an unanswered-response modal closes.
 * Re-build the question text and focus management for screen readers.
 */
export function closeModalAndFocusQuestion() {
    // Find the active question after Bootstrap has finished hiding the modal.
    // For a soft-modal continuation this may be the newly activated question;
    // for every dismissal it remains the question that requested a response.
    const activeQuestion = moduleParams.questDiv.querySelector('.question.active');
    if (activeQuestion) {
        const questionFocusSet = false;
        setTimeout(() => {
            manageAccessibleQuestion(activeQuestion.querySelector('fieldset') || activeQuestion, questionFocusSet);
        }, 100);
    }
}

// Update the aria-live region with the current selection announcement in a list (for screen readers).
export function updateAriaLiveSelectionAnnouncer(responseDiv) {
    const liveRegion = moduleParams.questDiv.querySelector('#ariaLiveSelectionAnnouncer');
    const label = responseDiv.querySelector('label');
    const input = responseDiv.querySelector('input[type="checkbox"], input[type="radio"]');

    if (!liveRegion || !label || !input) {
        return;
    }

    const actionText = input.checked ? 'Selected.' : 'Unselected.';
    const isTable = responseDiv.closest('table') !== null;
    const announcementText = isTable
        ? `${actionText}`
        : `${label.textContent} ${actionText}`;

    liveRegion.textContent = '';

    setTimeout(() => {
        liveRegion.textContent = announcementText;
    }, 100);
}

// Update the aria-live region with the current selection announcement in a table (for screen readers).
// Note: cell-specific targeting is required for dependable selection announcements.
export function updateAriaLiveSelectionAnnouncerTable(responseDiv) {
    const liveRegion = moduleParams.questDiv.querySelector('#ariaLiveSelectionAnnouncer');
    const cell = responseDiv.closest('td'); // Get the closest table cell (td)
    const label = cell?.querySelector('label'); // Find the label within the cell
    const input = cell?.querySelector('input[type="checkbox"], input[type="radio"]');

    if (!liveRegion || !cell || !label || !input) {
        return;
    }

    const actionText = input.checked ? 'Selected.' : 'Unselected.';
    const announcementText = `${label.textContent} ${actionText}`;

    liveRegion.textContent = '';
    setTimeout(() => {
        liveRegion.textContent = announcementText;
    }, 250);
}

// Clear the selection accnouncer when a user is navigating between questions (next/back buttons)
export function clearSelectionAnnouncement() {
    const liveRegion = moduleParams.questDiv.querySelector('#ariaLiveSelectionAnnouncer');
    if (liveRegion) {
        liveRegion.textContent = '';
    }
}

// This can be extended to handle specific summary page edge cases without impacting the general summary page cases.
// Spacing is a specific issue on summary pages due to different summary markdown structures and conditionals.
// This can handle alignment edge cases for summary pages on a case-by-case.
function handleSummaryUIEdgeCases(fieldset, questionID) {
    if (!fieldset || !questionID) return;

    if (questionID.includes('PREGSUMMARY') && !fieldset.hasAttribute('data-preg-summary-updated')) {
        let referenceNode = null;
        for (const node of fieldset.childNodes) {
            if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim().startsWith('Age when pregnancy began:')) {
                referenceNode = node;
                break;
            }
        }

        if (referenceNode) {
            const newBr = document.createElement('br');
            fieldset.insertBefore(newBr, referenceNode);
            fieldset.setAttribute('data-preg-summary-updated', 'true');
        }
    }
}
