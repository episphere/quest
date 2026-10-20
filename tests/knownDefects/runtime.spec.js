import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Tree } from '../../tree.js';
import { renderFreshQuest } from '../helpers/questRuntime.js';
import { readLockedMarkdown } from '../e2e/support/corpus.js';
import { runtimeDefects } from './registry.js';

const expectedCovidGridResponseIds = [
  'D_488415137', 'D_167695804', 'D_730334054', 'D_215996690',
  'D_462737492', 'D_469675296', 'D_962475128', 'D_989576239',
  'D_338613869', 'D_126794793', 'D_218793117', 'D_524096053',
  'D_814101706', 'D_635026188', 'D_238135048', 'D_632714520',
].flatMap((id) => [`${id}_0`, `${id}_1`]);

function lockedCovidGridCondition(locale) {
  const gridLine = readLockedMarkdown('moduleCOVID19', locale)
    .split(/\r?\n/)
    .find((line) => line.includes('id="D_114280729"'));
  const condition = gridLine?.match(/\bdisplayif=(.*?)\|/)?.[1];
  if (!condition) throw new Error(`Missing locked ${locale} D_114280729 grid condition`);
  return condition;
}

function lockedQuestionMarkdown(module, locale, questionId) {
  const markdown = readLockedMarkdown(module, locale);
  const lines = markdown.split(/\r?\n/);
  const questionStart = lines.findIndex((line) => (
    line.trimStart().startsWith(`[${questionId}?`)
  ));
  const nextQuestion = lines.findIndex((line, index) => (
    index > questionStart && /^\s*\[[^\]]+\]/.test(line)
  ));
  const metadata = lines.find((line) => /^\s*\{.*"name".*\}\s*$/.test(line));

  if (questionStart < 0 || !metadata) {
    throw new Error(`Missing locked ${module} ${locale} question ${questionId}`);
  }

  const questionLines = lines.slice(
    questionStart,
    nextQuestion < 0 ? lines.length : nextQuestion,
  );
  return `${metadata}\n${questionLines.join('\n')}\n[KNOWN_DEFECT_END,end] Done.`;
}

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

  it.fails(`${runtimeDefects.treeHasNext.localDefectId}: reports lookahead without throwing or mutation`, () => {
    const tree = new Tree();
    tree.add('Q1');
    expect(() => tree.hasNext()).not.toThrow();
    expect(tree.hasNext()).toBe(true);
    expect(tree.currentNode).toBe(tree.rootNode);
  });

  it.fails.each([
    ['English', 'en'],
    ['Spanish', 'es'],
  ])(`${runtimeDefects.corpusMalformedCondition.localDefectId}: %s COVID Markdown keeps the complete grid complement`, (_, locale) => {
    const sourceCondition = lockedCovidGridCondition(locale);
    const expectedCondition = `someSelected("${expectedCovidGridResponseIds.join('","')}")`;
    expect(sourceCondition).toBe(expectedCondition);
  });

  it.fails.each([
    ['English', 'en'],
    ['Spanish', 'es'],
  ])(`${runtimeDefects.corpusDuplicateScalarId.localDefectId}: %s Module 1 age and year alternatives use distinct response IDs`, async (
    _,
    locale,
  ) => {
    const { processor } = await loadQuestionProcessor(
      lockedQuestionMarkdown('module1', locale, 'D_317093647'),
    );
    const inputs = Array.from(
      processor.findQuestion('D_317093647').question.querySelectorAll('input[type="number"]'),
    );

    expect(inputs).toHaveLength(2);
    expect(new Set(inputs.map(({ id }) => id)).size).toBe(inputs.length);
  });

  it.fails(`${runtimeDefects.overlappingStoreFailure.localDefectId}: keeps local and host responses consistent when an earlier write fails late`, async () => {
    let resolveFirstStore;
    const hostResponses = {};
    const applySuccessfulChanges = (changes) => {
      Object.entries(changes).forEach(([namespacedKey, value]) => {
        const key = namespacedKey.replace(/^TEST_MODULE\./, '');
        if (key === 'treeJSON') return;
        if (value === undefined) delete hostResponses[key];
        else hostResponses[key] = value;
      });
    };
    const store = vi.fn((changes) => {
      if (store.mock.calls.length === 1) {
        return new Promise((resolve) => {
          resolveFirstStore = resolve;
        });
      }
      applySuccessfulChanges(changes);
      return Promise.resolve({ code: 200 });
    });
    const quest = await renderFreshQuest({ params: { store } });

    quest.root.querySelector('#Q1_1').click();
    quest.root.querySelector('#Q1 .next').click();
    await vi.waitFor(() => expect(quest.root.querySelector('form.active')?.id).toBe('Q2'));
    const secondResponse = quest.root.querySelector('#Q2_TEXT');
    secondResponse.value = 'later';
    secondResponse.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    quest.root.querySelector('#Q2 .next').click();
    await vi.waitFor(() => expect(store).toHaveBeenCalledTimes(2));

    resolveFirstStore({ code: 503 });
    await vi.waitFor(() => expect(quest.errors).toHaveLength(1));
    await vi.waitFor(() => expect(
      quest.root.querySelector('#storeErrorModal').classList.contains('show'),
    ).toBe(true));

    expect(hostResponses).toEqual({ Q2: 'later' });
    const { treeJSON, ...localResponses } = quest.state.getSurveyState();
    expect(localResponses).toEqual(hostResponses);
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

  it.fails(`${runtimeDefects.explicitCombinedChoiceName.localDefectId}: preserves a specified combined-choice name exactly`, async () => {
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
