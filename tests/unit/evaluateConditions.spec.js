import { beforeEach, describe, expect, it, vi } from 'vitest';

async function loadEvaluator(state = {}, previousResults = {}) {
  vi.resetModules();
  const questionnaire = await import('../../questionnaire.js');
  questionnaire.moduleParams.errorLogger = vi.fn();
  questionnaire.moduleParams.previousResults = previousResults;

  const stateModule = await import('../../stateManager.js');
  stateModule.initializeStateManager();
  stateModule.getStateManager().loadInitialSurveyState(state);
  const { evaluateCondition } = await import('../../evaluateConditions.js');
  return { evaluateCondition, moduleParams: questionnaire.moduleParams };
}

describe('condition evaluation', () => {
  beforeEach(() => vi.useRealTimers());

  it('uses MathJS for arithmetic, boolean expressions, and URI-encoded input', async () => {
    const { evaluateCondition } = await loadEvaluator();

    expect(evaluateCondition('2 + 3 * 4')).toBe(14);
    expect(evaluateCondition('2%20%3C%203')).toBe(true);
    expect(evaluateCondition('true and not false')).toBe(true);
  });

  it('falls back to legacy functions with state and previous-result values', async () => {
    const { evaluateCondition } = await loadEvaluator(
      { ANSWER: '2', CHECKS: ['1', '3'] },
      { PRIOR: '1' },
    );

    expect(evaluateCondition('equals(ANSWER,2)')).toBe(true);
    expect(evaluateCondition('doesNotEqual(ANSWER,3)')).toBe(true);
    expect(evaluateCondition('equals(CHECKS,3)')).toBe(true);
    expect(evaluateCondition('equals(PRIOR,1)')).toBe(true);
    expect(evaluateCondition('greaterThan(ANSWER,1)')).toBe(true);
  });

  it('evaluates nested two-argument legacy functions inside out', async () => {
    const { evaluateCondition } = await loadEvaluator({ A: '1', B: '0' });

    expect(evaluateCondition('and(equals(A,1),doesNotEqual(B,1))')).toBe(true);
    expect(evaluateCondition('or(equals(A,9),equals(B,0))')).toBe(true);
  });

  it('preserves legacy numeric, boolean, undefined, loop, and missing arguments', async () => {
    const { evaluateCondition } = await loadEvaluator();

    expect(evaluateCondition('equals(12,12)')).toBe(true);
    expect(evaluateCondition('equals(true,true)')).toBe(false);
    expect(evaluateCondition('equals(undefined,undefined)')).toBe(true);
    expect(evaluateCondition('equals(#loop,#loop)')).toBe(true);
    expect(evaluateCondition('equals(MISSING,undefined)')).toBe(false);
  });

  it('reports malformed fallback syntax with the original expression and stack', async () => {
    const { evaluateCondition, moduleParams } = await loadEvaluator();

    expect(() => evaluateCondition('notAFunction(A,1)')).toThrow();
    expect(moduleParams.errorLogger).toHaveBeenCalledWith(
      'Error in Displayif Function:',
      'notAFunction(A,1)',
      expect.any(Array),
    );
  });
});
