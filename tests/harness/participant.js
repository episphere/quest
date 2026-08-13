import './connectHost.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import '../../ActiveLogic.css';
import '../../Style1.css';

import * as bootstrap from 'bootstrap';
import { transform } from '../../main.js';
import { getStateManager } from '../../stateManager.js';

globalThis.bootstrap = bootstrap;

const questRoot = document.getElementById('questionnaireRoot');
const eventTypes = ['click', 'change', 'input', 'keydown', 'keyup', 'focusin', 'focusout', 'submit'];
const pendingStores = new Set();
const pendingAsyncLoads = new Set();
let storeSettlementSequence = 0;

let rendered = false;
let currentConfig = {};

const logs = {
  renders: [],
  storeCalls: [],
  retrieveCalls: [],
  asyncCalls: [],
  errors: [],
  events: [],
  host: { keydownCount: 0 },
};

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function serializable(value, depth = 0, seen = new WeakSet()) {
  if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack, code: value.code };
  if (value instanceof Element) return describeTarget(value);
  if (depth >= 10) return String(value);
  if (typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    if (Array.isArray(value)) return value.map((item) => serializable(item, depth + 1, seen));
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, serializable(child, depth + 1, seen)]));
  }
  return String(value);
}

function describeTarget(target) {
  if (!(target instanceof Element)) return String(target);
  return {
    tag: target.tagName.toLowerCase(),
    id: target.id || null,
    name: target.getAttribute('name'),
    type: target.getAttribute('type'),
    className: typeof target.className === 'string' ? target.className : null,
  };
}

for (const type of eventTypes) {
  document.addEventListener(type, (event) => {
    if (type === 'keydown') logs.host.keydownCount += 1;
    if (logs.events.length < 500) logs.events.push({
      type,
      key: 'key' in event ? event.key : null,
      defaultPrevented: event.defaultPrevented,
      target: describeTarget(event.target),
    });
  });
}

function trackPromise(promise, collection) {
  collection.add(promise);
  promise.then(() => collection.delete(promise), () => collection.delete(promise));
  return promise;
}

function configuredOutcome(outcomes, callIndex) {
  if (!Array.isArray(outcomes) || outcomes.length === 0) return { kind: 'resolve', value: { code: 200 } };
  return outcomes[Math.min(callIndex, outcomes.length - 1)] ?? { kind: 'resolve', value: { code: 200 } };
}

function makeStore() {
  return (changes) => {
    const outcome = configuredOutcome(currentConfig.storeOutcomes, logs.storeCalls.length);
    const call = {
      changes: serializable(changes),
      outcome: serializable(outcome),
      status: 'pending',
      settlementIndex: null,
    };
    logs.storeCalls.push(call);
    const operation = (async () => {
      try {
        if (outcome.delayMs) await wait(outcome.delayMs);
        if (outcome.kind === 'reject') {
          const error = new Error(outcome.message || 'Synthetic store rejection');
          if (outcome.code != null) error.code = outcome.code;
          throw error;
        }
        const value = outcome.value ?? { code: outcome.code ?? 200 };
        call.status = 'fulfilled';
        call.value = serializable(value);
        return value;
      } catch (error) {
        call.status = 'rejected';
        call.error = serializable(error);
        throw error;
      } finally {
        storeSettlementSequence += 1;
        call.settlementIndex = storeSettlementSequence;
      }
    })();
    return trackPromise(operation, pendingStores);
  };
}

function makeRetrieve() {
  return async () => {
    logs.retrieveCalls.push({ at: new Date().toISOString() });
    if (currentConfig.retrieveDelayMs) await wait(currentConfig.retrieveDelayMs);
    if (currentConfig.retrieveError) throw new Error(currentConfig.retrieveError);
    if (Object.hasOwn(currentConfig, 'retrieveResponse')) return currentConfig.retrieveResponse;
    return { data: { fixture: currentConfig.persistedData ?? {} } };
  };
}

function makeAsyncQuestionLoader() {
  return (func, args) => {
    const outcome = configuredOutcome(currentConfig.asyncOutcomes, logs.asyncCalls.length);
    const call = { func: serializable(func), args: serializable(args), outcome: serializable(outcome), status: 'pending' };
    logs.asyncCalls.push(call);
    const operation = (async () => {
      try {
        const delayMs = outcome.delayMs ?? currentConfig.asyncDelayMs ?? 0;
        if (delayMs) await wait(delayMs);
        if (outcome.kind === 'reject') throw new Error(outcome.message || 'Synthetic async question rejection');
        const target = questRoot.querySelector('form.question.active fieldset, form.question.active tbody');
        if (target && currentConfig.asyncQuestionHtml) target.innerHTML = currentConfig.asyncQuestionHtml;
        call.status = 'fulfilled';
        call.value = serializable(outcome.value);
        return outcome.value;
      } catch (error) {
        call.status = 'rejected';
        call.error = serializable(error);
        throw error;
      }
    })();
    return trackPromise(operation, pendingAsyncLoads);
  };
}

function errorLogger(...args) {
  logs.errors.push({
    message: args.map((arg) => arg instanceof Error ? arg.message : String(arg)).join(' '),
    args: serializable(args),
  });
}

async function flush() {
  while (pendingStores.size > 0 || pendingAsyncLoads.size > 0) {
    await Promise.allSettled([...pendingStores, ...pendingAsyncLoads]);
  }
  await wait(0);
}

function stateSnapshot() {
  const stateManager = getStateManager(true);
  return stateManager ? {
    survey: serializable(stateManager.getSurveyState()),
    active: serializable(stateManager.getActiveQuestionState()),
    mapping: serializable(stateManager.getResponseToQuestionMapping()),
    cache: serializable(stateManager.getCache()),
  } : null;
}

function snapshot() {
  return serializable({
    activeQuestionId: questRoot.querySelector('form.question.active')?.id ?? null,
    focusedElement: describeTarget(document.activeElement),
    state: stateSnapshot(),
    logs,
  });
}

function normalizeHarnessConfig(config) {
  const normalized = { ...config, markdown: config.markdown ?? config.text ?? '' };
  if (config.retrieveResponse !== undefined || config.retrieveResult !== undefined) normalized.retrieveResponse = config.retrieveResponse ?? config.retrieveResult;
  if (config.showProgressBarInQuest !== undefined || config.showProgress !== undefined) normalized.showProgressBarInQuest = config.showProgressBarInQuest ?? config.showProgress;
  if (config.asyncOutcomes !== undefined || config.asyncFixtures?.outcomes !== undefined) normalized.asyncOutcomes = config.asyncOutcomes ?? config.asyncFixtures.outcomes;
  if (config.asyncQuestionHtml !== undefined || config.asyncFixtures?.html !== undefined) normalized.asyncQuestionHtml = config.asyncQuestionHtml ?? config.asyncFixtures.html;
  if (config.asyncDelayMs !== undefined || config.asyncFixtures?.delayMs !== undefined) normalized.asyncDelayMs = config.asyncDelayMs ?? config.asyncFixtures.delayMs;
  if (!Object.hasOwn(config, 'surveyDataPrefetch')) {
    if (Object.hasOwn(config, 'prefetch')) normalized.surveyDataPrefetch = config.prefetch;
    else if (Object.hasOwn(config, 'persistedData')) normalized.surveyDataPrefetch = config.persistedData;
  }
  if (!Array.isArray(config.storeOutcomes) && config.storeMode) {
    const delayMs = config.hostDelayMs ?? (config.storeMode === 'delayed' ? 50 : 0);
    const outcome = {
      success: { kind: 'resolve', value: { code: 200 } },
      non200: { kind: 'resolve', value: { code: 503, message: 'Synthetic non-200 store response' } },
      rejected: { kind: 'reject', message: 'Synthetic store rejection' },
      delayed: { kind: 'resolve', value: { code: 200 } },
    }[config.storeMode];
    if (outcome) normalized.storeOutcomes = [{ ...outcome, ...(delayMs ? { delayMs } : {}) }];
  }
  return normalized;
}

async function render(config = {}) {
  if (rendered) throw new Error('Quest is stateful: participant harness permits one render per page. Reload for a fresh module graph.');
  rendered = true;
  currentConfig = structuredClone(normalizeHarnessConfig(config));
  document.documentElement.lang = currentConfig.lang === 'es' ? 'es' : 'en';
  questRoot.style.visibility = 'hidden';
  const params = {
    activate: currentConfig.activate ?? true,
    asyncQuestionsMap: currentConfig.asyncQuestionsMap ?? {},
    delayedParameterArray: currentConfig.delayedParameterArray ?? [],
    errorLogger,
    fetchAsyncQuestion: makeAsyncQuestionLoader(),
    lang: currentConfig.lang ?? 'en',
    isRenderer: currentConfig.isRenderer ?? false,
    questVersion: currentConfig.questVersion ?? 'test-local',
    retrieve: makeRetrieve(),
    showProgressBarInQuest: currentConfig.showProgressBarInQuest ?? true,
    store: makeStore(),
    text: currentConfig.markdown,
    url: currentConfig.url ?? '',
  };
  if (Object.hasOwn(currentConfig, 'surveyDataPrefetch')) params.surveyDataPrefetch = currentConfig.surveyDataPrefetch;
  const result = await transform.render(params, 'questionnaireRoot', currentConfig.previousResults ?? {});
  questRoot.style.visibility = 'visible';
  logs.renders.push({ result, config: serializable(currentConfig) });
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return { result, activeQuestionId: questRoot.querySelector('form.question.active')?.id ?? null, errorCount: logs.errors.length };
}

window.questHarness = { ready: true, render, snapshot, flush, wait };
window.dispatchEvent(new CustomEvent('quest-harness-ready'));

const manualFixture = new URLSearchParams(window.location.search).get('fixture');
if (manualFixture) {
  if (!/^[a-z0-9-]+\.txt$/i.test(manualFixture)) {
    errorLogger(new Error(`Invalid manual fixture name: ${manualFixture}`));
  } else {
    fetch(`/tests/fixtures/canonical/${manualFixture}`)
      .then((response) => response.ok ? response.text() : Promise.reject(new Error(`Fixture request failed: ${response.status}`)))
      .then((markdown) => render({ markdown }))
      .catch(errorLogger);
  }
}
