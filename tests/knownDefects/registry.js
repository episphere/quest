const DEFAULT_OWNER = 'Quest maintainers';
const DEFAULT_EXPIRY = '2027-08-04';

function defect(localDefectId, target, reason, extra = {}) {
  return Object.freeze({
    localDefectId,
    target,
    reason,
    owner: DEFAULT_OWNER,
    expiry: DEFAULT_EXPIRY,
    ...extra,
  });
}

/**
 * Existing Quest behavior characterized before production changes resume.
 * Behavioral reproductions run in the non-blocking known-defect lane. Registry
 * metadata and expiry are checked in the blocking quality lane so accepted
 * failures must be fixed, removed, or renewed before they become
 * permanent.
 */
export const runtimeDefects = Object.freeze({
  treeDepthFirst: defect('QD-TREE-001', 'Tree.next depth-first traversal across root siblings', 'Traversal stops after the first root branch instead of continuing to later siblings.'),
  treePrune: defect('QD-TREE-002', 'Tree.prune branch removal', 'Pruning does not return to the authored predecessor with the expected sibling structure intact.'),
  treeHasNext: defect('QD-TREE-003', 'Tree.hasNext non-mutating lookahead', 'Lookahead reports false for the first root child even though a next value exists.'),
  gridRowCondition: defect('QD-GRID-001', 'Radio-grid row displayif encoding', 'The row condition is encoded more than once and cannot be decoded to the authored expression.'),
  gridBackFocusLifecycle: defect('QD-GRID-002', 'Grid Back focus-helper lifecycle', 'Returning to a previously answered grid restores its values but logs that the focus helper is missing instead of preserving a valid focus-management node.', {
    sourcePaths: ['prod/module2.txt'],
    questionId: 'D_981441822',
  }),
  mathDotValue: defect('QD-MATH-001', 'MathJS dot-notation value lookup', 'A valid leaf in a one-property response object is not returned.'),
  mathDotExists: defect('QD-MATH-002', 'MathJS dot-notation existence lookup', 'exists() does not recognize a valid nested response leaf.'),
  mathMonthRange: defect('QD-MATH-003', 'dateCompare documented month range', 'dateCompare accepts month 12 even though its contract documents zero through eleven.'),
  legacyQuotedString: defect('QD-COND-001', 'Legacy condition quoted-string fallback', 'Fallback parsing drops or misinterprets quoted string literals.'),
  corpusMalformedCondition: defect('QD-CORPUS-001', 'Malformed production condition fallback', 'The truncated COVID-19 grid condition falls back to a truthy function-name string, so its false outcome and hidden state are unreachable.', {
    owner: 'Questionnaire maintainers',
    corpusCommit: '7ae99a22af325cf0e14be047a7636462db9bfd50',
    sourcePaths: ['prod/moduleCOVID19.txt', 'prod/moduleCOVID19Spanish.txt'],
    questionId: 'D_114280729',
  }),
  storeRollback: defect('QD-STORE-001', 'Store failure state rollback', 'Navigation rolls back after non-200/rejected writes, but the pre-write response snapshot is not restored.'),
  sequentialHostCallbacks: defect('QD-STATE-001', 'Sequential render host callback rebinding', 'Module-level state keeps the first render host callbacks when a second survey is rendered in the same document.'),
  finalCompoundResponseRemoval: defect('QD-STATE-002', 'Final compound response removal', 'Removing the final key assigns undefined without deleting the enumerable key, leaving a stale response object in active state.'),
  clearedRestoredResponseLookup: defect('QD-STATE-003', 'Cleared restored response lookup', 'Clearing a restored scalar removes its live index entries, but lookup falls back to the old value retained in survey state.'),
  unsyncedArrayResponseLookup: defect('QD-STATE-004', 'Unsynced array response lookup', 'Live cache lookup excludes arrays and objects, so an unsynced checkbox-array response cannot be found until it reaches survey state.'),
  backResumeResponseRestoration: defect('QD-STATE-005', 'Back-generated tree token response restoration on resume', 'Back persists the authored question token with its ? or ! marker, but startup looks up the retained response under that raw token instead of the normalized form ID, leaving the resumed answer visually unselected.'),
  malformedLoopContinuation: defect('QD-QP-001', 'Malformed loop-continuation target handling', 'A malformed _CONTINUE target dereferences a failed regular-expression match instead of logging the invalid target and returning no question.'),
  currentQuestionUpperBoundary: defect('QD-QP-002', 'Current-question upper-bound guard', 'An index equal to the question count passes the range guard and attempts to process an undefined question.'),
  missingConfirmationTarget: defect('QD-QP-003', 'Missing confirmation target handling', 'A confirmation input that references a missing peer removes its invalid attribute but then dereferences the missing peer.'),
  missingQuestionId: defect('QD-QP-004', 'Missing question-ID lookup', 'findQuestion logs a missing ID but then calls startsWith on the absent value instead of returning its documented not-found result.'),
  explicitCombinedChoiceName: defect('QD-QP-005', 'Explicit name metadata on legacy combined choices', 'The combined-choice parser interpolates the full regular-expression match array, producing a duplicated comma-separated name instead of the authored name.'),
  submitFocusRestore: defect('QD-A11Y-001', 'Submit-dialog Escape focus restoration', 'The dialog closes on Escape but leaves focus inactive instead of returning it to the Submit Survey trigger.'),
  modalQuestionFocusRace: defect('QD-A11Y-002', 'Question-to-modal focus handoff', 'A pending delayed question-focus callback can run after a response dialog opens and move focus away from the dialog title.'),
  staleSelectionAnnouncement: defect('QD-A11Y-003', 'Selection announcement after navigation', 'A delayed selection announcement can repopulate the live region after Next or Back explicitly clears it.'),
  gridDeferredFocusAfterNavigation: defect('QD-A11Y-004', 'Windows grid focus-helper after navigation', 'A pending Windows grid-focus callback can move the shared helper back into an inactive grid after the participant advances.'),
  authoringFallbackClear: defect('QD-AUTHOR-001', 'Authoring clear-memory operation after localforage fallback', 'The fallback storage adapter has no removeItem method, so Clear Memory throws after initialization falls back.', {
    source: 'index.html authoring interface',
  }),
});

export const axeDefects = Object.freeze({
  progressbarName: defect('QD-AXE-001', '#progressBar accessible name', 'The progressbar has no accessible name.', { ruleId: 'aria-progressbar-name', impact: 'serious', targets: ['#progressBar'] }),
  progressbarValue: defect('QD-AXE-002', '#progressBar ARIA value', 'The progressbar exposes an invalid ARIA attribute value.', { ruleId: 'aria-valid-attr-value', impact: 'critical', targets: ['#progressBar'] }),
  emptyGridHeader: defect('QD-AXE-003', 'Grid row-header spacer', 'The responsive grid contains an empty table header cell.', { ruleId: 'empty-table-header', impact: 'minor', targets: ['.nr.hr'] }),
  validationContrast: defect('QD-AXE-004', 'Validation message contrast', 'The visible validation message does not meet the required color contrast.', { ruleId: 'color-contrast', impact: 'serious', targets: ['.validation-container > span'] }),
  validationLabel: defect('QD-AXE-005', 'Bounded numeric input label', 'The input relies on a title-only label relationship.', { ruleId: 'label-title-only', impact: 'serious', targets: ['#bounded'] }),
  imageAlt: defect('QD-AXE-006', 'Question image text alternative', 'QuestionProcessor emits an image without an alternative text attribute.', { ruleId: 'image-alt', impact: 'critical', targets: ['#PLAIN img'] }),
});

export const accessibilityDefects = Object.freeze({
  compoundQuestionContext: defect('QD-A11Y-005', 'Compound-question radio context', 'Radio choices in a multi-subgroup form are named only by their response option, not the subgroup prompt that gives the choice its meaning.', {
    sourcePaths: ['prod/moduleDietScreener', 'prod/moduleDietScreenerSpanish.txt'],
    questionId: 'D_916948380',
    automatedContract: 'Each radio choice exposes both its subgroup prompt and its response option in its accessible name or equivalent accessible context.',
    manualContract: 'Verify that VoiceOver and JAWS announce the food or sub-question prompt together with the selected frequency when moving across a compound form.',
  }),
  1079: defect('CONNECT-1079', 'Quest 2 participant choice semantics', 'Choice inputs are not consistently exposed to assistive technology with their native role, accessible name, and checked state.', {
    issue: 'https://github.com/episphere/connect/issues/1079',
    title: 'Quest2 - JAWS and VoiceOver for Quest2',
    scope: 'Quest 2 participant runtime only; Quest 1 is intentionally out of scope.',
    automatedContract: 'Each choice remains discoverable by native radio role and accessible name, and exposes its checked state.',
    manualContract: 'Recheck real VoiceOver/Safari and JAWS/Chrome or Edge announcement, focus, and activation after the PWA redesign.',
    limitation: 'Playwright accessibility trees do not run VoiceOver or JAWS and cannot validate their command-routing modes.',
  }),
  1587: defect('CONNECT-1587', 'Native participant keyboard behavior', 'Quest delegated key handling suppresses browser-native input behavior.', {
    issue: 'https://github.com/episphere/connect/issues/1587',
    title: 'Keyboard Navigation for Quest',
    scope: 'Keyboard-only operation without requiring a screen reader.',
    automatedContract: 'Focused native radios, checkboxes, and selects retain their standard Space and arrow-key behavior.',
    manualContract: 'Test Tab/Shift+Tab, Enter, Space, radio arrows, checkbox Space, and native select keys separately from screen-reader commands.',
    limitation: 'VoiceOver Quick Nav and the JAWS Virtual Cursor alter key routing; those are recorded in the manual matrix instead of treated as raw browser key events.',
  }),
});

export const allKnownDefects = Object.freeze([
  ...Object.values(runtimeDefects),
  ...Object.values(axeDefects),
  ...Object.values(accessibilityDefects),
]);
