import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseGrid } from '../../buildGrid.js';
import { Tree } from '../../tree.js';
import { renderFreshQuest, SIMPLE_SURVEY } from '../helpers/questRuntime.js';
import { runtimeDefects } from './registry.js';

const expectedCovidGridResponseIds = [
  'D_488415137', 'D_167695804', 'D_730334054', 'D_215996690',
  'D_462737492', 'D_469675296', 'D_962475128', 'D_989576239',
  'D_338613869', 'D_126794793', 'D_218793117', 'D_524096053',
  'D_814101706', 'D_635026188', 'D_238135048', 'D_632714520',
].flatMap((id) => [`${id}_0`, `${id}_1`]);

// Reviewed against the locked English and Spanish COVID Markdown. Both files
// contain this identical, truncated display condition for D_114280729.
const MALFORMED_COVID_GRID_COMPLEMENT = 'someSelected("D_488415137_0","D_488415137_1","D_167695804_0","D_167695804_1","D_730334054_0","D_730334054_1","D_215996690_0","D_215996690_1","D_462737492_0","D_462737492_1","D_469675296_0","D_469675296_1","D_962475128_0","D_962475128_1","D_989576239_0","D_989576239_1","D_338613869_0","D_338613869_1","D_126794793_0","D_126794793_1","D_218793117_0","D_218793117_1","D_524096053_0","SRVCOV_COV19C1_V1R0_1,1","D_814101706_0","D_814101706_1","D_635026188_0","D_238135048_0","D_238135048_1","D_632714520_0","D_632714520_1';

function buildBranchedTree() {
  const tree = new Tree();
  tree.add(['Q1', 'Q2', 'Q3']);
  tree.next();
  tree.add('Q1A');
  tree.next();
  tree.add('Q1B');
  tree.next();
  return tree;
}

async function loadStateManager(initialState = {}) {
  vi.resetModules();
  const questionnaire = await import('../../questionnaire.js');
  questionnaire.moduleParams.errorLogger = vi.fn();
  questionnaire.moduleParams.previousResults = {};
  const stateModule = await import('../../stateManager.js');
  stateModule.initializeStateManager();
  const appState = stateModule.getStateManager();
  appState.loadInitialSurveyState(initialState);
  appState.setQuestionProcessor({
    findQuestion: () => ({ question: null }),
    findGridRadioCheckboxEle: () => null,
  });
  return appState;
}

async function loadMathWithState(initialState = {}) {
  const appState = await loadStateManager(initialState);
  const mathModule = await import('../../customMathJSImplementation.js');
  mathModule.customMathJSFunctions.appState = appState;
  return mathModule.customMathJSFunctions;
}

async function loadEvaluator(state = {}, previousResults = {}) {
  vi.resetModules();
  const questionnaire = await import('../../questionnaire.js');
  questionnaire.moduleParams.errorLogger = vi.fn();
  questionnaire.moduleParams.previousResults = previousResults;
  const stateModule = await import('../../stateManager.js');
  stateModule.initializeStateManager();
  stateModule.getStateManager().loadInitialSurveyState(state);
  return (await import('../../evaluateConditions.js')).evaluateCondition;
}

async function loadQuestionProcessor(markdown) {
  vi.resetModules();
  const questionnaire = await import('../../questionnaire.js');
  const i18n = (await import('../../i18n/en.js')).default;
  questionnaire.moduleParams.i18n = i18n;
  questionnaire.moduleParams.errorLogger = vi.fn();
  questionnaire.moduleParams.previousResults = {};
  questionnaire.moduleParams.asyncQuestionsMap = {};
  questionnaire.moduleParams.renderFullQuestionList = true;
  questionnaire.moduleParams.isRenderer = true;

  const stateModule = await import('../../stateManager.js');
  stateModule.initializeStateManager();
  const appState = stateModule.getStateManager();
  appState.loadInitialSurveyState({});

  const { initializeCustomMathJSFunctions } = await import('../../customMathJSImplementation.js');
  initializeCustomMathJSFunctions();
  const { QuestionProcessor } = await import('../../questionProcessor.js');
  const processor = new QuestionProcessor(markdown, {
    current_date: new Date('2026-03-15T12:00:00Z'),
    current_day: 15,
    current_month: 3,
    current_month_str: 2,
    current_year: 2026,
    quest_format_date: '2026-3-15',
  }, i18n);
  appState.setQuestionProcessor(processor);

  return { processor, errorLogger: questionnaire.moduleParams.errorLogger };
}

async function answerAndAdvance(quest) {
  quest.root.querySelector('#Q1_1').click();
  quest.root.querySelector('#Q1 .next').click();
  await vi.waitFor(() => expect(quest.store).toHaveBeenCalled());
}

describe('characterized Quest runtime defects', () => {
  beforeEach(() => vi.useRealTimers());

  it.fails(`${runtimeDefects.treeDepthFirst.localDefectId}: walks all root branches depth-first`, () => {
    const tree = buildBranchedTree();
    expect(tree.next().value.value).toBe('Q2');
    expect(tree.next().value.value).toBe('Q3');
    expect(tree.next()).toEqual({ done: true, value: undefined });
  });

  it.fails(`${runtimeDefects.treePrune.localDefectId}: prunes the current branch`, () => {
    const tree = new Tree();
    tree.add(['Q1', 'Q2']);
    tree.next();
    tree.add('Q1A');
    tree.next();
    tree.prune();
    expect(tree.currentNode.value).toBe('Q1');
    expect(tree.currentNode.children).toEqual([]);
    expect(tree.rootNode.children.map(({ value }) => value)).toEqual(['Q1', 'Q2']);
  });

  it.fails(`${runtimeDefects.treeHasNext.localDefectId}: reports lookahead without mutation`, () => {
    const tree = new Tree();
    tree.add('Q1');
    expect(tree.hasNext()).toBe(true);
    expect(tree.currentNode).toBe(tree.rootNode);
  });

  it.fails(`${runtimeDefects.gridRowCondition.localDefectId}: encodes a row condition once`, () => {
    const html = parseGrid(
      '|grid?|id=GRID|Shared|[ROW,displayif=equals(SHOW,1)]Conditional row;|(1:Yes)|',
      '<div class="question-buttons"><button class="next">Next</button></div>',
    );
    const template = document.createElement('template');
    template.innerHTML = html;
    expect(decodeURIComponent(template.content.querySelector('[data-displayif]').dataset.displayif)).toBe('equals(SHOW,1)');
  });

  it.fails(`${runtimeDefects.mathDotValue.localDefectId}: resolves a dot-notation leaf`, async () => {
    const fn = await loadMathWithState({ OBJECT: { NESTED: 'value' } });
    expect(fn.getKeyedValue('OBJECT.NESTED')).toBe('value');
  });

  it.fails(`${runtimeDefects.mathDotExists.localDefectId}: recognizes an existing dot-notation leaf`, async () => {
    const fn = await loadMathWithState({ OBJECT: { NESTED: 'value' } });
    expect(fn.exists('OBJECT.NESTED')).toBe(true);
  });

  it.fails(`${runtimeDefects.mathMonthRange.localDefectId}: rejects month 12`, async () => {
    const fn = await loadMathWithState();
    expect(() => fn.dateCompare(12, 2026, 1, 2027)).toThrow('months need to be');
  });

  it.fails(`${runtimeDefects.legacyQuotedString.localDefectId}: preserves quoted fallback literals`, async () => {
    const evaluateCondition = await loadEvaluator({}, { PRIOR: 'yes' });
    expect(evaluateCondition('equals(PRIOR,"yes")')).toBe(true);
  });

  it.fails(`${runtimeDefects.corpusMalformedCondition.localDefectId}: rejects a truncated function expression`, async () => {
    const evaluateCondition = await loadEvaluator();
    expect(evaluateCondition('someSelected("D_632714520_1')).toBe(false);
  });

  it.fails.each(['English', 'Spanish'])(`${runtimeDefects.corpusMalformedCondition.localDefectId}: %s COVID Markdown keeps the complete grid complement`, async () => {
    const authoredResponseIds = [...MALFORMED_COVID_GRID_COMPLEMENT.matchAll(/"([^"]+)"/g)]
      .map(([, responseId]) => responseId);

    expect(authoredResponseIds).toEqual(expectedCovidGridResponseIds);

    const evaluateCondition = await loadEvaluator();
    expect(evaluateCondition(MALFORMED_COVID_GRID_COMPLEMENT)).toBe(false);
  });

  it.fails.each(['non200', 'reject'])(
    `${runtimeDefects.storeRollback.localDefectId}: restores the snapshot after a %s store result`,
    async (storeMode) => {
      const quest = await renderFreshQuest({ storeMode });
      await answerAndAdvance(quest);
      await vi.waitFor(() => expect(quest.root.querySelector('form.active')?.id).toBe('Q1'));
      expect(quest.state.getSurveyState()).not.toHaveProperty('Q1');
    },
  );

  it.fails(`${runtimeDefects.sequentialHostCallbacks.localDefectId}: rebinds second-render callbacks`, async () => {
    const first = await renderFreshQuest();
    const secondStore = vi.fn(async () => ({ code: 200 }));
    document.body.innerHTML = '<div id="secondRoot"></div>';
    await first.transform.render({
      activate: true,
      text: SIMPLE_SURVEY.replace('TEST_MODULE', 'SECOND_MODULE'),
      store: secondStore,
      errorLogger: () => {},
    }, 'secondRoot');
    document.querySelector('#Q1_1').click();
    document.querySelector('#Q1 .next').click();
    await vi.waitFor(() => expect(secondStore).toHaveBeenCalled());
  });

  it.fails(`${runtimeDefects.finalCompoundResponseRemoval.localDefectId}: removes the question after its final compound response is cleared`, async () => {
    const appState = await loadStateManager();
    appState.setResponse('Q1', 'ONLY', 2, 'selected');

    appState.removeResponseItem('Q1', 'ONLY', 2);

    expect(appState.getActiveQuestionState()).not.toHaveProperty('Q1');
    expect(appState.getResponseToQuestionMapping()).not.toHaveProperty('ONLY.Q1');
    expect(appState.getCache()).not.toHaveProperty('ONLY.Q1');
  });

  it.fails(`${runtimeDefects.clearedRestoredResponseLookup.localDefectId}: does not return a restored scalar after it is cleared`, async () => {
    const appState = await loadStateManager({ Q1: 'restored' });
    appState.setActiveQuestionState('Q1');

    appState.setResponse('Q1', 'Q1', 1, '');

    expect(appState.findResponseValue('Q1')).toBeUndefined();
  });

  it.fails(`${runtimeDefects.unsyncedArrayResponseLookup.localDefectId}: returns a live checkbox array before storage`, async () => {
    const appState = await loadStateManager();
    appState.setResponse('Q1', 'CHECKBOX', 2, ['one', 'two']);

    expect(appState.findResponseValue('CHECKBOX', 'Q1')).toEqual(['one', 'two']);
  });

  it.fails(`${runtimeDefects.malformedLoopContinuation.localDefectId}: rejects a malformed loop continuation without throwing`, async () => {
    const { processor, errorLogger } = await loadQuestionProcessor(`
      {"name":"MALFORMED_CONTINUE"}
      [Q1] First.
      [END,end] Done.
    `);
    let result;

    expect(() => {
      result = processor.findQuestion('_CONTINUE_BAD');
    }).not.toThrow();
    expect(result).toEqual({ question: null, index: -1 });
    expect(errorLogger.mock.calls.some(
      ([message]) => String(message).includes('loop index not found'),
    )).toBe(true);
  });

  it.fails(`${runtimeDefects.currentQuestionUpperBoundary.localDefectId}: returns null when the current index equals the question count`, async () => {
    const { processor, errorLogger } = await loadQuestionProcessor(`
      {"name":"UPPER_BOUNDARY"}
      [Q1] First.
      [END,end] Done.
    `);
    processor.currentQuestionIndex = processor.questions.length;

    expect(processor.getCurrentQuestion()).toBeNull();
    expect(errorLogger).toHaveBeenCalledWith(expect.stringContaining('index out of range'));
  });

  it.fails(`${runtimeDefects.missingConfirmationTarget.localDefectId}: ignores an invalid confirmation reference without throwing`, async () => {
    const { processor } = await loadQuestionProcessor(`
      {"name":"MISSING_CONFIRMATION"}
      [Q1] Confirm <input type="text" id="COPY" confirm="MISSING_TARGET">
      [END,end] Done.
    `);
    let question;

    expect(() => {
      question = processor.processQuestion(0);
    }).not.toThrow();
    expect(question.querySelector('#COPY').hasAttribute('data-confirm')).toBe(false);
  });

  it.fails(`${runtimeDefects.missingQuestionId.localDefectId}: returns the documented not-found result for an absent question ID`, async () => {
    const { processor, errorLogger } = await loadQuestionProcessor(`
      {"name":"MISSING_ID"}
      [Q1] First.
      [END,end] Done.
    `);
    let result;

    expect(() => {
      result = processor.findQuestion();
    }).not.toThrow();
    expect(result).toEqual({ question: null, index: -1 });
    expect(errorLogger.mock.calls.some(
      ([message]) => String(message).includes('no questionID provided'),
    )).toBe(true);
  });

  it.fails(`${runtimeDefects.explicitCombinedChoiceName.localDefectId}: preserves an authored combined-choice name exactly`, async () => {
    const { processor } = await loadQuestionProcessor(`
      {"name":"EXPLICIT_COMBINED_NAME"}
      [Q1?] Other response.
      [other|id=EXPLICIT_CHOICE name=EXPLICIT_NAME] Explain <input type="text" id="DETAIL"></input> -> END
      [END,end] Done.
    `);

    const choice = processor.findQuestion('Q1').question.querySelector('#EXPLICIT_CHOICE');
    expect(choice.name).toBe('EXPLICIT_NAME');
  });
});
