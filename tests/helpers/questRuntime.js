import { vi } from 'vitest';

export const SIMPLE_SURVEY = `
{"name":"TEST_MODULE"}

[Q1?] Choose one answer.
(1) First answer
(2) Second answer

[Q2] Enter a value.
|__|id=Q2_TEXT minlen=2 maxlen=8|

[END] Thank you.
`;

function createStore(mode, calls, delay = 0) {
  return vi.fn(async (payload) => {
    calls.push(structuredClone(payload));
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    if (mode === 'reject') throw new Error('Configured store rejection');
    if (mode === 'non200') return { code: 503 };
    return { code: 200 };
  });
}

export async function renderFreshQuest({
  markdown = SIMPLE_SURVEY,
  previousResults = {},
  persistedData,
  retrieveResult,
  params = {},
  storeMode = 'success',
  storeDelay = 0,
  rootId = 'questionnaireRoot',
} = {}) {
  vi.resetModules();
  document.body.innerHTML = `
    <a href="#before" id="beforeQuest">Before Quest</a>
    <main id="root">
      <div class="row">
        <div class="col-md-1"></div>
        <div class="col-md-10" id="${rootId}"></div>
        <div class="col-md-1"></div>
      </div>
    </main>
    <button id="afterQuest">After Quest</button>
  `;

  const storeCalls = [];
  const retrieveCalls = [];
  const asyncCalls = [];
  const errors = [];
  const store = createStore(storeMode, storeCalls, storeDelay);
  const retrieve = vi.fn(async () => {
    retrieveCalls.push(true);
    return retrieveResult;
  });
  const fetchAsyncQuestion = vi.fn(async (...args) => {
    asyncCalls.push(args);
    return params.asyncResult ?? '';
  });

  const { transform } = await import('../../main.js');
  const rendered = await transform.render({
    activate: true,
    text: markdown,
    lang: 'en',
    showProgressBarInQuest: true,
    store,
    retrieve,
    surveyDataPrefetch: persistedData,
    asyncQuestionsMap: {},
    fetchAsyncQuestion,
    errorLogger: (...values) => errors.push(values),
    ...params,
  }, rootId, previousResults);

  const { moduleParams, questionQueue } = await import('../../questionnaire.js');
  const { getStateManager } = await import('../../stateManager.js');
  const state = getStateManager(params.isRenderer ?? false);

  return {
    transform,
    rendered,
    root: document.getElementById(rootId),
    moduleParams,
    questionQueue,
    state,
    store,
    retrieve,
    fetchAsyncQuestion,
    calls: { store: storeCalls, retrieve: retrieveCalls, async: asyncCalls },
    errors,
  };
}

export async function loadFreshModuleGraph() {
  vi.resetModules();
  const questionnaire = await import('../../questionnaire.js');
  const en = (await import('../../i18n/en.js')).default;
  questionnaire.moduleParams.i18n = en;
  questionnaire.moduleParams.errorLogger = vi.fn();
  questionnaire.moduleParams.questDiv = document.body;
  return { questionnaire, en };
}
