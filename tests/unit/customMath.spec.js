import { beforeEach, describe, expect, it, vi } from 'vitest';

async function loadMathWithState(initialState = {}) {
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

  const mathModule = await import('../../customMathJSImplementation.js');
  mathModule.customMathJSFunctions.appState = appState;
  return { ...mathModule, appState, moduleParams: questionnaire.moduleParams };
}

describe('Quest MathJS extensions', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'language', { configurable: true, value: 'en-US' });
  });

  it('normalizes, adds, subtracts, and compares year-month values at year boundaries', async () => {
    const { YearMonth } = await loadMathWithState();
    const value = new YearMonth('2025-12');

    expect(value.toString()).toBe('2025-12');
    expect(new YearMonth(value).toString()).toBe('2025-12');
    expect(value.add(1)).toBe('2026-01');
    expect(new YearMonth('2025-03').add(1)).toBe('2025-04');
    expect(new YearMonth('2026-01').subtract(1)).toBe('2025-12');
    expect(new YearMonth('2026-03').subtract(1)).toBe('2026-02');
    expect(new YearMonth('2026-03').subMonth(new YearMonth('2025-11'))).toBe(4);
    expect(() => new YearMonth('03/2026')).toThrow('Invalid YearMonth format');
  });

  it('looks up scalar, array, object, nested, numeric, and missing values', async () => {
    const { customMathJSFunctions: fn } = await loadMathWithState({
      SCALAR: 'yes',
      EMPTY: '',
      CHECKS: ['1', '2'],
      OBJECT: { NESTED: 'value' },
    });

    expect(fn.exists('SCALAR')).toBe(true);
    expect(fn.exists('EMPTY')).toBe(false);
    expect(fn.exists(null)).toBe(false);
    expect(fn.exists('CHECKS')).toBe(true);
    expect(fn.exists('MISSING')).toBe(false);
    expect(fn.exists(0)).toBe(true);
    expect(fn.getKeyedValue('not a response sentence.')).toBeUndefined();
    expect(() => fn.getKeyedValue('MISSING.LEAF')).toThrow(TypeError);
    expect(fn.getKeyedValue('OBJECT.MISSING.DEEP')).toBeUndefined();
    expect(fn._value(125)).toBe(125);
    expect(fn._value('MISSING')).toBeNull();
  });

  it('evaluates existence composition, equality, sets, ranges, and defaults', async () => {
    const { customMathJSFunctions: fn } = await loadMathWithState({
      ANSWER: '2',
      CHECKS: ['1', '3'],
      CONCEPTS: '123456789,987654321',
      COUNT: '5',
    });

    expect(fn.doesNotExist('MISSING')).toBe(true);
    expect(fn.noneExist('A', 'B')).toBe(true);
    expect(fn.someExist('A', 'ANSWER')).toBe(true);
    expect(fn.allExist('ANSWER', 'CHECKS')).toBe(true);
    expect(fn.valueEquals('ANSWER', 2)).toBe(true);
    expect(fn.valueEquals('MISSING', 2)).toBe(false);
    expect(fn.valueIsOneOf('CHECKS', 3, 9)).toBe(true);
    expect(fn.valueIsOneOf('MISSING', 3, 9)).toBe(false);
    expect(fn.valueIsOneOf('CONCEPTS', '987654321')).toBe(true);
    expect(fn.valueIsBetween(1, 10, 'COUNT')).toBe(true);
    expect(() => fn.valueIsBetween(1, 10, 'MISSING', 'COUNT')).toThrow('Key(s) must be strings');
    expect(fn.valueIsBetween(6, 10, 'COUNT')).toBe(false);
    expect(fn.valueOrDefault('MISSING', 'ANSWER', 99)).toBe('2');
    expect(fn.valueLength('ANSWER')).toBe(1);
    expect(fn.valueLength('MISSING')).toBe(false);
    expect(fn.valueIsBetween(undefined, 10, 'COUNT')).toBe(false);
    expect(fn.valueIsBetween(1, 10, 'MISSING')).toBe(false);
  });

  it('distinguishes MathJS scalar equality from legacy checkbox-membership equality', async () => {
    const {
      customMathJSFunctions: fn,
      initializeCustomMathJSFunctions,
      math,
    } = await loadMathWithState({ CHECKS: ['1', '3'] });
    initializeCustomMathJSFunctions();
    const { evaluateCondition } = await import('../../evaluateConditions.js');

    // Quoted IDs stay in the MathJS path and use scalar coercion. Legacy
    // authored expressions use a bare response ID. MathJS rejects that symbol
    // and Quest's fallback evaluator correctly treats equals as membership.
    expect(fn.valueEquals('CHECKS', 1)).toBe(false);
    expect(fn.equals('CHECKS', 3)).toBe(false);
    expect(math.evaluate('equals("CHECKS", 1)')).toBe(false);
    expect(evaluateCondition('equals(CHECKS,1)')).toBe(true);
    expect(evaluateCondition('equals(CHECKS,2)')).toBe(false);
    expect(fn.valueIsOneOf('CHECKS', 1, 9)).toBe(true);
  });

  it('unwraps legacy combo objects and reports response types that existence cannot interpret', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { customMathJSFunctions: fn, moduleParams } = await loadMathWithState({
      COMBO: { COMBO: '2', OTHER: 'detail' },
      BOOLEAN: true,
    });

    expect(fn.valueEquals('COMBO', 2)).toBe(true);
    expect(fn.valueIsOneOf('COMBO', 1, 2)).toBe(true);
    expect(fn.exists('BOOLEAN')).toBe(false);
    expect(moduleParams.errorLogger).toHaveBeenCalledWith(expect.stringContaining('unhandled case in EXISTS'));
    expect(fn.getKeyedValue('NO_DOT')).toBeUndefined();
  });

  it('unwraps combo-shaped values before equality and one-of comparisons', async () => {
    const { customMathJSFunctions: fn } = await loadMathWithState();
    fn.appState = {
      findResponseValue: () => ({ COMBO: '2', OTHER: 'detail' }),
    };

    expect(fn.equals('COMBO', 2)).toBe(true);
    expect(fn.valueIsOneOf('COMBO', 2, 3)).toBe(true);
    expect(fn.valueLength('COMBO')).toBe(-1);
  });

  it('handles fixed arithmetic/date helpers and invalid selections safely', async () => {
    const { customMathJSFunctions: fn } = await loadMathWithState();

    expect(fn.dateCompare(0, 2026, 1, 2026)).toBe(-1);
    expect(fn.dateCompare(1, 2026, 1, 2026)).toBe(0);
    expect(fn.dateCompare(2, 2026, 1, 2026)).toBe(1);
    expect(fn.yearMonth('2026-04').toString()).toBe('2026-04');
    expect(fn.yearMonth('not-a-month')).toBe(false);
    expect(fn.isSelected('ROW_VALUE_0')).toBe(false);
    expect(fn.someSelected('ROW_VALUE_0')).toBe(false);
    expect(fn.noneSelected('ROW_VALUE_0')).toBe(true);
    expect(fn.valueIsBetween(1, 10, 'not-numeric')).toBe(false);
    expect(() => fn.dateCompare(1, 'bad-year', 1, 2026)).toThrow('years need to be numeric');
  });

  it('finds selected grid cells and resolves year-month values stored in state', async () => {
    const { customMathJSFunctions: fn, appState } = await loadMathWithState({
      ROW_VALUE: '2',
      STORED_MONTH: '2026-07',
    });
    appState.setQuestionProcessor({
      findGridRadioCheckboxEle: (id) => id === 'ROW_VALUE_1' ? '2' : null,
      findQuestion: () => ({ question: null }),
    });

    expect(fn.isSelected('ROW_VALUE_1')).toBe(true);
    expect(fn.isSelected('ROW_VALUE_2')).toBe(false);
    expect(fn.someSelected('ROW_VALUE_2', 'ROW_VALUE_1')).toBe(true);
    expect(fn.noneSelected('ROW_VALUE_2')).toBe(true);
    expect(fn.yearMonth('STORED_MONTH').toString()).toBe('2026-07');

    appState.setQuestionProcessor({
      findGridRadioCheckboxEle: () => '2',
      findQuestion: () => ({ question: null }),
    });
    expect(fn.isSelected('INVALID_ID')).toBe(false);
    appState.loadInitialSurveyState({});
    expect(fn.isSelected('ROW_VALUE_1')).toBe(false);
  });

  it('counts nested checkbox groups and joins conditionally existing display values', async () => {
    const { customMathJSFunctions: fn, appState, initializeCustomMathJSFunctions } = await loadMathWithState({
      Q: { GROUP: ['1', '2'] },
      A: 'yes',
    });
    const form = document.createElement('form');
    form.innerHTML = `
      <input type="checkbox" name="GROUP" value="1" checked>
      <input type="checkbox" name="GROUP" value="2" checked>
    `;
    appState.setQuestionProcessor({
      findQuestion: () => ({ question: form }),
      findGridRadioCheckboxEle: () => null,
    });
    initializeCustomMathJSFunctions();

    expect(fn.selectionCount('Q:GROUP')).toBe(2);
    expect(fn.existingValues('displayList(exists("A"),"Alpha",exists("B"),"Beta")')).toBe('Alpha');
    expect(fn.existingValues('displayList(exists("A"),"Alpha",exists("Q"),"Questions",sep=" / ")')).toBe('Alpha / Questions');
    expect(fn.existingValues()).toBe('');

    appState.setQuestionProcessor({
      findQuestion: () => ({ question: null }),
      findGridRadioCheckboxEle: () => null,
    });
    expect(fn.selectionCount('Q:GROUP')).toBe(2);
  });

  it('counts regular and reset checkbox selections from processed question HTML', async () => {
    const { customMathJSFunctions: fn, appState } = await loadMathWithState({ Q: ['1', '99'] });
    const form = document.createElement('form');
    form.innerHTML = `
      <input type="checkbox" name="Q" value="1" checked>
      <input type="checkbox" name="Q" value="99" data-reset="true" checked>
    `;
    appState.setQuestionProcessor({
      findQuestion: () => ({ question: form }),
      findGridRadioCheckboxEle: () => null,
    });

    expect(fn.selectionCount('Q')).toBe(0);
    expect(fn.selectionCount('Q', true)).toBe(2);
    expect(fn.selectionCount('MISSING')).toBe(0);

    fn.appState.findResponseValue = (id) => id === 'SCALAR' ? 'one' : undefined;
    expect(fn.selectionCount('SCALAR')).toBe(0);
  });

  it('registers custom functions at the top level for authored MathJS expressions', async () => {
    const { initializeCustomMathJSFunctions, math, customMathJSFunctions: fn } = await loadMathWithState({ ANSWER: '1' });
    initializeCustomMathJSFunctions();

    expect(math.evaluate('exists("ANSWER")')).toBe(true);
    expect(math.evaluate('valueIsOneOf("ANSWER", 1, 2)')).toBe(true);
    expect(math.evaluate('yearMonth("2025-12") + 1')).toBe('2026-01');
    expect(fn.add(1, new fn.YearMonth('2025-12'))).toBe('2026-01');
    expect(fn.add(1, 2)).toBe(3);
    expect(fn.add('1.5', '2.5')).toBe(4);
    expect(fn.add(true, '2')).toBeNaN();
    expect(fn.add({}, {})).toBeNaN();
    expect(fn.subtract(new fn.YearMonth('2026-01'), 1)).toBe('2025-12');
    expect(fn.subtract(new fn.YearMonth('2026-03'), new fn.YearMonth('2025-12'))).toBe(3);
    expect(fn.subtract(5, 2)).toBe(3);
    expect(fn.subtract('5.5', '2.5')).toBe(3);
    expect(fn.subtract(true, '2')).toBeNaN();
    expect(fn.subtract({}, {})).toBeNaN();
  });
});
