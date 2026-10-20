import { beforeEach, describe, expect, it, vi } from 'vitest';

async function createManager(initialState = {}, store = vi.fn(async () => ({ code: 200 }))) {
  vi.resetModules();
  const questionnaire = await import('../../questionnaire.js');
  questionnaire.moduleParams.questName = 'STATE_TEST';
  questionnaire.moduleParams.previousResults = { PRIOR: 7 };
  questionnaire.moduleParams.errorLogger = vi.fn();
  questionnaire.moduleParams.questDiv = document.body;
  questionnaire.questionQueue.clear();
  questionnaire.questionQueue.add('Q1');
  questionnaire.questionQueue.next();

  const stateModule = await import('../../stateManager.js');
  stateModule.initializeStateManager(store, initialState);
  const manager = stateModule.getStateManager();
  const questionProcessor = {
    checkLoopMaxData: vi.fn(),
    findQuestion: vi.fn(() => ({ question: null })),
    findGridRadioCheckboxEle: vi.fn(() => null),
  };
  manager.setQuestionProcessor(questionProcessor);
  return {
    manager,
    moduleParams: questionnaire.moduleParams,
    questionProcessor,
    questionQueue: questionnaire.questionQueue,
    store,
  };
}

describe('state manager', () => {
  beforeEach(() => {
    document.body.innerHTML = '<form class="question" id="Q1"><button class="next" data-click-type="next"></button></form>';
  });

  it('stores primitive and compound active response shapes and removes them', async () => {
    const { manager } = await createManager();

    manager.setNumResponseInputs('Q1', 1);
    manager.setResponse('Q1', 'Q1', 1, 'yes');
    expect(manager.getActiveQuestionState()).toEqual({ Q1: 'yes' });

    manager.removeResponse('Q1');
    expect(manager.getActiveQuestionState()).toEqual({ Q1: undefined });

    manager.setNumResponseInputs('Q2', 2);
    manager.setResponse('Q2', 'ROW_A', 2, '1');
    manager.setResponse('Q2', 'ROW_B', 2, ['2', '3']);
    expect(manager.getActiveQuestionState()).toEqual({ Q1: undefined, Q2: { ROW_A: '1', ROW_B: ['2', '3'] } });

    manager.removeResponseItem('Q2', 'ROW_A', 2);
    expect(manager.getActiveQuestionState().Q2).toEqual({ ROW_B: ['2', '3'] });

    manager.removeResponse('Q2');
    expect(manager.getActiveQuestionState().Q2).toBeUndefined();

    manager.setResponse('Q3', 'Q3', 1, 'temporary');
    manager.setResponse('Q3', 'Q3', 1, '');
    expect(manager.getActiveQuestionState().Q3).toBeUndefined();
  });

  it('keeps live mappings and explicit cache tombstones coherent through removals', async () => {
    const { manager } = await createManager();

    manager.setResponse('SINGLE', 'SINGLE', 1, 'yes');
    manager.setResponse('MULTI', 'FIRST', 2, 'one');
    manager.setResponse('MULTI', 'SECOND', 2, ['two', 'three']);

    expect(manager.getResponseToQuestionMapping()).toEqual({
      SINGLE: 'SINGLE',
      'FIRST.MULTI': 'MULTI.FIRST',
      'SECOND.MULTI': 'MULTI.SECOND',
    });
    expect(manager.getCache()).toEqual({
      SINGLE: 'yes',
      'FIRST.MULTI': 'one',
      'SECOND.MULTI': ['two', 'three'],
    });
    expect(manager.findResponseValue('SINGLE')).toBe('yes');
    expect(manager.findResponseValue('FIRST', 'MULTI')).toBe('one');

    manager.removeResponseItem('SINGLE', 'SINGLE', 1);
    manager.setResponse('MULTI', 'FIRST', 2, '');
    manager.removeResponseItem('MISSING', 'MISSING', 1);

    expect(manager.getResponseToQuestionMapping()).toEqual({
      SINGLE: 'SINGLE',
      'FIRST.MULTI': 'MULTI.FIRST',
      'SECOND.MULTI': 'MULTI.SECOND',
    });
    expect(manager.getCache()).toEqual({
      SINGLE: undefined,
      'FIRST.MULTI': undefined,
      'SECOND.MULTI': ['two', 'three'],
    });
    expect(manager.findResponseValue('SINGLE')).toBeUndefined();
    expect(manager.findResponseValue('FIRST', 'MULTI')).toBeUndefined();
  });

  it('preserves direct stored-value shapes and numeric Concept ID boundaries', async () => {
    const { manager } = await createManager({
      DIRECT_ARRAY: ['one', 'two'],
      FALSE_VALUE: false,
      MULTI_VALUE: { FIRST: 'one', SECOND: 'two' },
      SINGLE_WRAPPER: { ONLY: 'unwrapped' },
      ZERO_VALUE: 0,
      123456789: 'concept-value',
    });

    expect(manager.getItem('DIRECT_ARRAY')).toEqual(['one', 'two']);
    expect(manager.findResponseValue('DIRECT_ARRAY')).toEqual(['one', 'two']);
    expect(manager.findResponseValue('FALSE_VALUE')).toBe(false);
    expect(manager.findResponseValue('MULTI_VALUE')).toEqual({ FIRST: 'one', SECOND: 'two' });
    expect(manager.findResponseValue('SINGLE_WRAPPER')).toBe('unwrapped');
    expect(manager.findResponseValue('ZERO_VALUE')).toBe(0);
    expect(manager.findResponseValue('123456789')).toBe('concept-value');
    expect(manager.findResponseValue('99999999')).toBe('99999999');
    expect(manager.findResponseValue('1000000000')).toBe('1000000000');
  });

  it('loads nested state and builds deterministic response mappings and cache entries', async () => {
    const { manager } = await createManager();
    manager.loadInitialSurveyState({
      Q1: 'one',
      Q2: { ROW_A: 'yes', ROW_B: ['1', '2'] },
      treeJSON: 'ignored-in-mapping',
    });

    expect(manager.getResponseToQuestionMapping()).toEqual({
      Q1: 'Q1',
      'ROW_A.Q2': 'Q2.ROW_A',
      'ROW_B.Q2': 'Q2.ROW_B',
    });
    expect(manager.findResponseValue('Q1')).toBe('one');
    expect(manager.findResponseValue('ROW_A', 'Q2')).toBe('yes');
    expect(manager.findResponseValue('ROW_B', 'Q2')).toEqual(['1', '2']);
    expect(manager.findResponseValue('PRIOR')).toBe('7');
    expect(manager.findResponseValue('42')).toBe('42');
  });

  it('resolves unique nested and nonalphabetic keys while retaining falsey cached values', async () => {
    const { manager, moduleParams } = await createManager();
    manager.loadInitialSurveyState({
      Q1: { UNIQUE: 'value', D_123_1: 'coded-value' },
      Q2: { ZERO: 0, FALSE: false, EMPTY: [] },
      treeJSON: 'ignored-in-mapping',
    });

    expect(manager.findResponseValue('UNIQUE')).toBe('value');
    expect(manager.findResponseValue('D_123_1')).toBe('coded-value');
    expect(manager.findResponseValue('ZERO')).toBe(0);
    expect(manager.findResponseValue('FALSE')).toBe(false);
    expect(manager.findResponseValue('EMPTY')).toEqual([]);
    expect(manager.getCache()).toMatchObject({
      'ZERO.Q2': 0,
      'FALSE.Q2': false,
      'EMPTY.Q2': [],
    });
    expect(moduleParams.errorLogger).not.toHaveBeenCalled();
  });

  it('sets and clears the active response when navigating restored questions', async () => {
    const { manager } = await createManager();
    manager.loadInitialSurveyState({ Q1: 'saved', Q2: { FIELD: 'value' } });

    manager.setActiveQuestionState('Q1');
    expect(manager.getActiveQuestionState()).toEqual({ Q1: 'saved' });
    manager.clearActiveQuestionState();
    expect(manager.getActiveQuestionState()).toEqual({});
    manager.setActiveQuestionState('MISSING');
    expect(manager.getActiveQuestionState()).toEqual({});
  });

  it('returns top-level state snapshots and clears indexes when retrieved data is empty', async () => {
    const { manager } = await createManager();
    manager.loadInitialSurveyState({ Q1: 'saved' });

    const surveySnapshot = manager.getSurveyState();
    const mappingSnapshot = manager.getResponseToQuestionMapping();
    const cacheSnapshot = manager.getCache();
    surveySnapshot.Q1 = 'changed outside the manager';
    mappingSnapshot.Q1 = 'changed outside the manager';
    cacheSnapshot.Q1 = 'changed outside the manager';

    expect(manager.getSurveyState()).toEqual({ Q1: 'saved' });
    expect(manager.getResponseToQuestionMapping()).toEqual({ Q1: 'Q1' });
    expect(manager.getCache()).toEqual({ Q1: 'saved' });

    manager.loadInitialSurveyState(null);
    expect(manager.getSurveyState()).toEqual({});
    expect(manager.getResponseToQuestionMapping()).toEqual({});
    expect(manager.getCache()).toEqual({});
  });

  it('delegates valid question lookup through the configured processor', async () => {
    const { manager, questionProcessor } = await createManager();
    const question = document.createElement('form');
    question.id = 'Q2';
    questionProcessor.findQuestion.mockReturnValue({ question });

    expect(manager.getQuestionProcessor()).toBe(questionProcessor);
    expect(manager.getQuestionHTMLByID('Q2')).toBe(question);
    expect(questionProcessor.findQuestion).toHaveBeenCalledWith('Q2');
  });

  it('namespaces changed values and legacy tree JSON when syncing to the host store', async () => {
    const { manager, questionProcessor, store } = await createManager();
    const next = document.querySelector('.next');
    manager.setResponse('Q1', 'Q1', 1, 'answer');

    manager.syncToStore(next);
    await vi.waitFor(() => expect(store).toHaveBeenCalledOnce());

    const payload = store.mock.calls[0][0];
    expect(Object.keys(payload).sort()).toEqual(['STATE_TEST.Q1', 'STATE_TEST.treeJSON']);
    expect(payload['STATE_TEST.Q1']).toBe('answer');
    expect(JSON.parse(payload['STATE_TEST.treeJSON'])).toMatchObject({ currentNode: 'Q1' });
    expect(questionProcessor.checkLoopMaxData).toHaveBeenCalledWith('Q1', 'answer');
    expect(manager.getSurveyState().Q1).toBe('answer');
    expect(manager.getActiveQuestionState()).toEqual({});

    store.mockClear();
    questionProcessor.checkLoopMaxData.mockClear();
    manager.syncToStore(next);
    await vi.waitFor(() => expect(store).toHaveBeenCalledOnce());

    expect(store.mock.calls[0][0]).toEqual({
      'STATE_TEST.treeJSON': expect.any(String),
    });
    expect(questionProcessor.checkLoopMaxData).not.toHaveBeenCalled();
  });

  it('sends an explicit namespaced clear when a single response is removed', async () => {
    const { manager, store } = await createManager();
    manager.setResponse('Q1', 'Q1', 1, 'answer');
    manager.removeResponseItem('Q1', 'Q1', 1);

    manager.syncToStore(document.querySelector('.next'));
    await vi.waitFor(() => expect(store).toHaveBeenCalledOnce());

    expect(store.mock.calls[0][0]).toHaveProperty('STATE_TEST.Q1', undefined);
    expect(manager.getSurveyState()).toHaveProperty('Q1', undefined);
  });

  it('collapses the final compound removal into a question-level store deletion', async () => {
    const { manager, store } = await createManager();
    manager.setResponse('Q1', 'FIRST', 2, 'one');
    manager.setResponse('Q1', 'SECOND', 2, 'two');

    manager.removeResponseItem('Q1', 'FIRST', 2);
    expect(manager.getActiveQuestionState().Q1).toEqual({ SECOND: 'two' });
    expect(manager.getActiveQuestionState().Q1).not.toHaveProperty('FIRST');
    expect(manager.getCache()).toHaveProperty('FIRST.Q1', undefined);

    manager.removeResponseItem('Q1', 'SECOND', 2);
    const deletionState = manager.getActiveQuestionState();
    expect(Object.prototype.hasOwnProperty.call(deletionState, 'Q1')).toBe(true);
    expect(deletionState.Q1).toBeUndefined();
    expect(manager.getCache()).toMatchObject({
      'FIRST.Q1': undefined,
      'SECOND.Q1': undefined,
    });

    manager.syncToStore(document.querySelector('.next'));
    await vi.waitFor(() => expect(store).toHaveBeenCalledOnce());

    expect(store.mock.calls[0][0]).toHaveProperty('STATE_TEST.Q1', undefined);
    expect(manager.getActiveQuestionState()).toEqual({});
    expect(manager.getSurveyState()).toHaveProperty('Q1', undefined);
  });

  it('keeps a cleared restored response absent before and after synchronization', async () => {
    const { manager, store } = await createManager();
    manager.loadInitialSurveyState({ Q1: 'restored' });
    manager.setActiveQuestionState('Q1');

    manager.setResponse('Q1', 'Q1', 1, '');

    expect(manager.getSurveyState().Q1).toBe('restored');
    expect(manager.getActiveQuestionState()).toHaveProperty('Q1', undefined);
    expect(manager.getCache()).toHaveProperty('Q1', undefined);
    expect(manager.findResponseValue('Q1')).toBeUndefined();

    manager.setResponse('Q1', 'Q1', 1, 'replacement');
    expect(manager.findResponseValue('Q1')).toBe('replacement');
    manager.setResponse('Q1', 'Q1', 1, '');

    manager.syncToStore(document.querySelector('.next'));
    await vi.waitFor(() => expect(store).toHaveBeenCalledOnce());

    expect(store.mock.calls[0][0]).toHaveProperty('STATE_TEST.Q1', undefined);
    expect(manager.getSurveyState()).toHaveProperty('Q1', undefined);
    expect(manager.findResponseValue('Q1')).toBeUndefined();
  });

  it('returns every live compound value shape before synchronization', async () => {
    const { manager } = await createManager();
    manager.setResponse('Q1', 'PRIMITIVE', 3, 'one');
    manager.setResponse('Q1', 'ARRAY', 3, ['two', 'three']);
    manager.setResponse('Q1', 'OBJECT', 3, { nested: 'four' });

    expect(manager.findResponseValue('PRIMITIVE', 'Q1')).toBe('one');
    expect(manager.findResponseValue('ARRAY', 'Q1')).toEqual(['two', 'three']);
    expect(manager.findResponseValue('OBJECT', 'Q1')).toEqual({ nested: 'four' });
    expect(manager.findResponseValue('PRIMITIVE')).toBe('one');
    expect(manager.findResponseValue('ARRAY')).toEqual(['two', 'three']);
    expect(manager.findResponseValue('OBJECT')).toEqual({ nested: 'four' });

    manager.removeResponseItem('Q1', 'ARRAY', 3);
    expect(manager.findResponseValue('ARRAY', 'Q1')).toBeUndefined();
    expect(manager.findResponseValue('ARRAY')).toBeUndefined();
    expect(manager.findResponseValue('PRIMITIVE')).toBe('one');
  });

  it('keeps untouched restored compound siblings available after a live clear', async () => {
    const { manager } = await createManager();
    manager.loadInitialSurveyState({ Q1: { FIRST: 'old', SECOND: 'retained' } });
    manager.setActiveQuestionState('Q1');

    manager.setResponse('Q1', 'FIRST', 2, '');

    expect(manager.getActiveQuestionState().Q1).toEqual({ SECOND: 'retained' });
    expect(manager.findResponseValue('FIRST', 'Q1')).toBeUndefined();
    expect(manager.findResponseValue('FIRST')).toBeUndefined();
    expect(manager.findResponseValue('SECOND', 'Q1')).toBe('retained');
    expect(manager.findResponseValue('SECOND')).toBe('retained');
  });

  it('submits completion metadata without mutating the production payload contract', async () => {
    const { manager, store } = await createManager();

    await expect(manager.submitSurvey()).resolves.toEqual({ code: 200 });
    const payload = store.mock.calls[0][0];
    expect(payload['STATE_TEST.COMPLETED']).toBe(true);
    expect(payload['STATE_TEST.COMPLETED_TS']).toBeInstanceOf(Date);
    expect(JSON.parse(payload['STATE_TEST.treeJSON'])).toMatchObject({ currentNode: 'Q1' });
  });

  it('propagates submit-store rejection to the host caller', async () => {
    const storeError = new Error('Synthetic submit rejection');
    const store = vi.fn(async () => {
      throw storeError;
    });
    const { manager } = await createManager({}, store);

    await expect(manager.submitSurvey()).rejects.toBe(storeError);
    expect(store).toHaveBeenCalledOnce();
  });

  it('rejects invalid state keys instead of creating ambiguous state', async () => {
    const { manager, moduleParams } = await createManager();

    expect(() => manager.setResponse(null, 'key', 1, 'value')).toThrow('must be strings');
    expect(() => manager.getItem(null)).toThrow('must be a string');
    expect(() => manager.findResponseValue(null)).toThrow('must be strings');
    expect(() => manager.removeResponse(3)).toThrow('must be a string');
    expect(() => manager.setActiveQuestionState(3)).toThrow('must be a string');
    expect(() => manager.getQuestionHTMLByID(3)).toThrow('must be a string');
    expect(() => manager.removeResponseItem('Q', 4, 2)).toThrow('must be strings');
    manager.loadInitialSurveyState({ Q: 'primitive' });
    manager.setActiveQuestionState('Q');
    expect(() => manager.removeResponseItem('Q', 'nested', 2)).toThrow('Key not found');
    expect(moduleParams.errorLogger).not.toHaveBeenCalled();
  });

  it('clears all runtime state while retaining a usable manager instance', async () => {
    const { manager } = await createManager();
    manager.loadInitialSurveyState({ Q1: 'saved' });
    manager.setActiveQuestionState('Q1');

    manager.clearAllState();

    expect(manager.getSurveyState()).toEqual({});
    expect(manager.getActiveQuestionState()).toEqual({});
    expect(manager.getResponseToQuestionMapping()).toEqual({});
    expect(manager.getCache()).toEqual({});
    expect(manager.getQuestionProcessor()).toBeNull();
  });

  it('reinitializes the existing manager with the next render state', async () => {
    const { manager } = await createManager();
    manager.loadInitialSurveyState({ Q1: 'saved' });
    manager.setActiveQuestionState('Q1');

    const stateModule = await import('../../stateManager.js');
    stateModule.initializeStateManager(vi.fn(async () => ({ code: 200 })), { Q2: 'next render' });

    expect(stateModule.getStateManager()).toBe(manager);
    expect(manager.getSurveyState()).toEqual({ Q2: 'next render' });
    expect(manager.getActiveQuestionState()).toEqual({});
  });

  it('manages response-input count caching and clears entries for inactive forms', async () => {
    const { manager } = await createManager();
    manager.setNumResponseInputs('Q1', 2);
    manager.setNumResponseInputs('Q2', 4);
    expect(manager.getNumResponseInputs('Q1')).toBe(2);
    expect(manager.getNumResponseInputs('Q2')).toBe(4);

    manager.clearOtherResponseInputEntries('Q2');
    expect(manager.getNumResponseInputs('Q1')).toBeUndefined();
    expect(manager.getNumResponseInputs('Q2')).toBe(4);
  });

  it('returns direct object responses and disambiguates duplicate nested response keys', async () => {
    const { manager, moduleParams } = await createManager();
    manager.loadInitialSurveyState({
      COMBO: { FIRST: '1', SECOND: '2' },
      Q1: { NAME: 'Alpha' },
      Q2: { NAME: 'Beta' },
      Q: { Q: 'self-keyed' },
    });

    expect(manager.findResponseValue('COMBO')).toEqual({ FIRST: '1', SECOND: '2' });
    expect(manager.findResponseValue('Q')).toBe('self-keyed');
    expect(manager.findResponseValue('NAME')).toBe('Alpha');
    expect(moduleParams.errorLogger).toHaveBeenCalledWith(expect.stringContaining('Multiple candidate keys found'));
    expect(manager.findResponseValue('NA')).toBeUndefined();
    expect(moduleParams.errorLogger).toHaveBeenCalledWith(expect.stringContaining('No exact match found for NA'));
  });

  it('detects circular response objects while keeping non-circular keys available', async () => {
    const { manager, moduleParams } = await createManager();
    const circular = { VALUE: 'available' };
    circular.SELF = circular;

    manager.loadInitialSurveyState({ Q: circular });

    expect(manager.findResponseValue('VALUE', 'Q')).toBe('available');
    expect(moduleParams.errorLogger).toHaveBeenCalledWith('Error: Circular reference found in QuestionIDMapping -> traverse()');
  });

  it('logs a filtered renderer snapshot and supports a hostless store/submit boundary', async () => {
    const { manager, moduleParams } = await createManager({
      NULL_VALUE: null,
      NESTED: { KEEP: 'yes', DROP: undefined, ARRAY: ['one', undefined] },
    }, null);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    moduleParams.isRenderer = true;
    manager.setResponse('Q1', 'Q1', 1, 'answer');

    manager.syncToStore(document.querySelector('.next'));

    expect(log).toHaveBeenCalledWith('StateManager -> SURVEY STATE:', {
      NESTED: { KEEP: 'yes', ARRAY: ['one'] },
      Q1: 'answer',
    });
    expect(await manager.submitSurvey()).toBeUndefined();
  });

  it('logs invalid store rollback click types and keeps the recovery modal open until dismissal', async () => {
    vi.useFakeTimers();
    document.body.innerHTML += '<div id="storeErrorModal"></div>';
    const store = vi.fn(async () => ({ code: 503 }));
    const { manager, moduleParams } = await createManager({ PREVIOUS: 'saved' }, store);
    const button = document.createElement('button');
    button.dataset.clickType = 'unknown';
    manager.setResponse('Q1', 'Q1', 1, 'answer');

    manager.syncToStore(button);
    await vi.waitFor(() => expect(moduleParams.errorLogger).toHaveBeenCalledWith('Invalid click type (handleStoreError):', 'unknown'));
    expect(document.querySelector('#storeErrorModal').classList).toContain('show');
    await vi.advanceTimersByTimeAsync(6000);
    expect(document.querySelector('#storeErrorModal').classList).toContain('show');

    globalThis.bootstrap.Modal.getInstance(document.querySelector('#storeErrorModal')).hide();
    expect(document.querySelector('#storeErrorModal').classList).not.toContain('show');
  });

  it('returns null to renderer callers before initialization and throws for runtime callers', async () => {
    vi.resetModules();
    const { getStateManager } = await import('../../stateManager.js');
    expect(getStateManager(true)).toBeNull();
    expect(() => getStateManager()).toThrow('has not been initialized');
  });
});
