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
  treePrune: defect('QD-TREE-002', 'Tree.prune branch removal', 'Pruning does not return to the predecessor with the expected sibling structure intact.'),
  treeHasNext: defect('QD-TREE-003', 'Tree.hasNext non-mutating lookahead', 'Lookahead dereferences a nonexistent nextNode property and throws instead of reporting whether a next value exists.'),
  corpusMalformedCondition: defect('QD-CORPUS-001', 'Malformed production grid condition', 'The COVID-19 grid condition is missing its closing parenthesis and contains an incomplete/invalid response-ID complement, so its intended display logic cannot be evaluated as written.', {
    owner: 'Questionnaire maintainers',
    corpusCommit: '7ae99a22af325cf0e14be047a7636462db9bfd50',
    sourcePaths: ['prod/moduleCOVID19.txt', 'prod/moduleCOVID19Spanish.txt'],
    questionId: 'D_114280729',
  }),
  corpusDuplicateScalarId: defect('QD-CORPUS-002', 'Duplicate production scalar response ID', 'The Module 1 esophageal-cancer question gives its age and year alternatives the same response/DOM ID and different XOR groups, so one value can overwrite or restore as the other concept.', {
    owner: 'Questionnaire maintainers',
    corpusCommit: '7ae99a22af325cf0e14be047a7636462db9bfd50',
    sourcePaths: ['prod/module1.txt', 'prod/module1Spanish.txt'],
    questionId: 'D_317093647',
  }),
  overlappingStoreFailure: defect('QD-STORE-002', 'Overlapping store failure reconciliation', 'If an earlier write fails after a later dependent write succeeds, Quest cannot reconcile the host and local response states causally.'),
  malformedLoopContinuation: defect('QD-QP-001', 'Malformed loop-continuation target handling', 'A malformed _CONTINUE target dereferences a failed regular-expression match instead of logging the invalid target and returning no question.'),
  currentQuestionUpperBoundary: defect('QD-QP-002', 'Current-question upper-bound guard', 'An index equal to the question count passes the range guard and attempts to process an undefined question.'),
  missingConfirmationTarget: defect('QD-QP-003', 'Missing confirmation target handling', 'A confirmation input that references a missing peer removes its invalid attribute but then dereferences the missing peer.'),
  missingQuestionId: defect('QD-QP-004', 'Missing question-ID lookup', 'findQuestion logs a missing ID but then calls startsWith on the absent value instead of returning its documented not-found result.'),
  explicitCombinedChoiceName: defect('QD-QP-005', 'Explicit name metadata on legacy combined choices', 'The combined-choice parser interpolates the full regular-expression match array, producing a duplicated comma-separated name instead of the specified name.'),
});

export const axeDefects = Object.freeze({
  imageAlt: defect('QD-AXE-006', 'Question image alternative-text decision', 'QuestionProcessor emits an image without an alt attribute, so questionnaire content cannot explicitly identify it as informative or decorative.', {
    ruleId: 'image-alt',
    impact: 'critical',
    targets: ['#PLAIN img'],
    corpusCommit: '7ae99a22af325cf0e14be047a7636462db9bfd50',
    corpusOccurrences: 84,
    sourcePaths: [
      'prod/module1.txt',
      'prod/module1Spanish.txt',
      'prod/module3.txt',
      'prod/module3Spanish.txt',
      'prod/module4.txt',
      'prod/module4Spanish.txt',
    ],
  }),
});

export const allKnownDefects = Object.freeze([
  ...Object.values(runtimeDefects),
  ...Object.values(axeDefects),
]);
