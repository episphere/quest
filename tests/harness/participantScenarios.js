export const ASYNC_QUESTION_MAP = {
  '[ASYNC?]': { func: 'loadSyntheticOptions', args: ['SEED'] },
};

export const ASYNC_QUESTION_HTML = `
  <span>Choose the host-provided option.</span>
  <div class="response">
    <input type="radio" name="ASYNC" id="ASYNC_A" value="A">
    <label for="ASYNC_A">Host option A</label>
  </div>
  <div class="response">
    <input type="radio" name="ASYNC" id="ASYNC_B" value="B">
    <label for="ASYNC_B">Host option B</label>
  </div>
`;

export const MANUAL_SCENARIOS = Object.freeze({
  'store-failure': {
    fixture: 'navigationState.txt',
    config: {
      storeOutcomes: [
        {
          kind: 'resolve',
          value: { code: 503, message: 'Synthetic non-200 store response' },
        },
        { kind: 'resolve', value: { code: 200 } },
      ],
    },
  },
  'async-success': {
    fixture: 'asyncQuestion.txt',
    config: {
      asyncQuestionsMap: ASYNC_QUESTION_MAP,
      asyncQuestionHtml: ASYNC_QUESTION_HTML,
      asyncDelayMs: 75,
    },
  },
  'async-error': {
    fixture: 'asyncQuestion.txt',
    config: {
      asyncQuestionsMap: ASYNC_QUESTION_MAP,
      asyncOutcomes: [{ kind: 'reject', message: 'Synthetic async failure' }],
    },
  },
  'weight-history-en': {
    fixture: 'module1WeightHistory.txt',
    config: {
      previousResults: { age: '60' },
    },
  },
  'weight-history-es': {
    fixture: 'module1WeightHistorySpanish.txt',
    config: {
      previousResults: { age: '60' },
    },
  },
});
