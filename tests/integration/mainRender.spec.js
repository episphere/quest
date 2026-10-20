import { describe, expect, it, vi } from 'vitest';
import { renderFreshQuest, SIMPLE_SURVEY } from '../helpers/questRuntime.js';

describe('transform.render', () => {
  const resumedAtQ1 = JSON.stringify({
    rootNode: { value: null, children: [{ value: 'Q1', children: [] }] },
    currentNode: 'Q1',
  });

  it('renders an embedded survey through the public API with host-owned callbacks', async () => {
    const quest = await renderFreshQuest();

    expect(quest.rendered).toBe(true);
    expect(quest.moduleParams.questName).toBe('TEST_MODULE');
    expect(quest.root.querySelector('#softModal')).not.toBeNull();
    expect(quest.root.querySelector('#progressBar')).not.toBeNull();
    expect(quest.root.querySelectorAll('form.question')).toHaveLength(1);
    expect(quest.root.querySelector('form.active')?.id).toBe('Q1');
    expect(quest.root.querySelectorAll('input[type="radio"]')).toHaveLength(2);
    expect(quest.errors).toEqual([]);
  });

  it('renders all questions in renderer full-list mode', async () => {
    const quest = await renderFreshQuest({
      params: { isRenderer: true, activate: false, showProgressBarInQuest: false },
    });

    expect(quest.rendered).toBe(true);
    expect(quest.moduleParams.renderFullQuestionList).toBe(true);
    expect(quest.root.querySelectorAll('form.question').length).toBeGreaterThanOrEqual(3);
    expect([...quest.root.querySelectorAll('form.question')].map(({ id }) => id)).toEqual(
      expect.arrayContaining(['Q1', 'Q2', 'END']),
    );
    expect(quest.root.querySelector('#progressBar')).toBeNull();
  });

  it.each([
    ['en', 'Survey progress'],
    ['es', 'Progreso de la encuesta'],
  ])('exposes the %s progress bar with its localized name and a valid initial value', async (lang, accessibleName) => {
    const quest = await renderFreshQuest({ params: { lang } });
    const progress = quest.root.querySelector('#progressBar');

    expect(progress.getAttribute('role')).toBe('progressbar');
    expect(progress.getAttribute('aria-label')).toBe(accessibleName);
    expect(progress.getAttribute('aria-valuenow')).toBe('0');
    expect(progress.getAttribute('aria-valuemin')).toBe('0');
    expect(progress.getAttribute('aria-valuemax')).toBe('100');
    expect(progress.querySelector('#progressBarText').textContent).toBe('0%');
  });

  it.each([
    ['en', 'Close'],
    ['es', 'Cerrar'],
  ])('gives every %s dialog resolvable relationships and a localized Close name', async (lang, closeName) => {
    const quest = await renderFreshQuest({ params: { lang } });
    const modals = [
      '#softModal',
      '#hardModal',
      '#softModalResponse',
      '#submitModal',
      '#storeErrorModal',
    ].map((selector) => quest.root.querySelector(selector));

    modals.forEach((modal) => {
      const labelledBy = modal.getAttribute('aria-labelledby');
      const describedBy = modal.getAttribute('aria-describedby');
      expect(labelledBy).toBeTruthy();
      expect(describedBy).toBeTruthy();
      expect(modal.querySelector(`#${labelledBy}`)).not.toBeNull();
      const description = modal.querySelector(`#${describedBy}`);
      expect(description).not.toBeNull();
      expect(description.tagName).toBe('P');
      expect(description.tabIndex).toBe(-1);
      expect(modal.querySelector('[role="alert"]')).toBeNull();
      expect(modal.querySelector('.btn-close').getAttribute('aria-label')).toBe(closeName);
    });

    const ids = [...quest.root.querySelectorAll('[id]')].map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps numeric progress synchronized while advancing and returning', async () => {
    const quest = await renderFreshQuest();
    const radio = quest.root.querySelector('#Q1_1');
    const progress = quest.root.querySelector('#progressBar');

    radio.click();
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    quest.root.querySelector('#Q1 .next').click();
    await vi.waitFor(() => expect(quest.root.querySelector('form.active')?.id).toBe('Q2'));

    expect(progress.getAttribute('aria-valuenow')).toBe('33');
    expect(progress.style.width).toBe('33%');

    const text = quest.root.querySelector('#Q2_TEXT');
    text.value = 'ok';
    text.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    quest.root.querySelector('#Q2 .next').click();
    await vi.waitFor(() => expect(quest.root.querySelector('form.active')?.id).toBe('END'));
    expect(progress.getAttribute('aria-valuenow')).toBe('100');
    expect(progress.style.width).toBe('100%');

    quest.root.querySelector('#END .previous').click();
    await vi.waitFor(() => expect(quest.root.querySelector('form.active')?.id).toBe('Q2'));
    expect(progress.getAttribute('aria-valuenow')).toBe('33');

    quest.root.querySelector('#Q2 .previous').click();
    await vi.waitFor(() => expect(quest.root.querySelector('form.active')?.id).toBe('Q1'));
    expect(progress.getAttribute('aria-valuenow')).toBe('0');
  });

  it('uses prefetched survey data without invoking retrieve', async () => {
    const quest = await renderFreshQuest({
      persistedData: { Q1: '2', treeJSON: resumedAtQ1 },
      retrieveResult: { data: { TEST_MODULE: { Q1: '1' } } },
    });

    expect(quest.retrieve).not.toHaveBeenCalled();
    expect(quest.state.getSurveyState().Q1).toBe('2');
    expect(quest.root.querySelector('#Q1_2').checked).toBe(true);
  });

  it('uses the exact version-pinned Quest stylesheets for a Connect-hosted prefetched render', async () => {
    const requestedUrls = [];
    const fetchStub = vi.fn(async (request) => {
      requestedUrls.push(String(request));
      return { text: async () => `/* ${String(request)} */` };
    });
    vi.stubGlobal('fetch', fetchStub);

    try {
      const quest = await renderFreshQuest({
        persistedData: { Q1: '2', treeJSON: resumedAtQ1 },
        params: {
          url: 'https://questionnaire.test/prod/moduleExample.txt',
          questVersion: '2.7.4',
        },
      });

      expect(quest.rendered).toBe(true);
      expect(quest.retrieve).not.toHaveBeenCalled();
      expect(requestedUrls).toEqual([
        'https://cdn.jsdelivr.net/gh/episphere/quest@v2.7.4/ActiveLogic.css',
        'https://cdn.jsdelivr.net/gh/episphere/quest@v2.7.4/Style1.css',
      ]);
      expect(document.head.querySelectorAll('link[rel="stylesheet"][href="blob:quest-test"]')).toHaveLength(2);
      expect(quest.errors).toEqual([]);
    } finally {
      document.head.querySelectorAll('link[href="blob:quest-test"]').forEach((link) => link.remove());
      vi.unstubAllGlobals();
    }
  });

  it('unwraps a single retrieve payload and restores its active response', async () => {
    const quest = await renderFreshQuest({
      retrieveResult: { data: { TEST_MODULE: { Q1: '1', treeJSON: resumedAtQ1 } } },
    });

    expect(quest.retrieve).toHaveBeenCalledOnce();
    expect(quest.state.getSurveyState().Q1).toBe('1');
    expect(quest.root.querySelector('#Q1_1').checked).toBe(true);
  });

  it('delegates radio changes, persists a namespaced payload, and advances', async () => {
    const quest = await renderFreshQuest();
    const radio = quest.root.querySelector('#Q1_2');
    radio.click();
    radio.dispatchEvent(new Event('change', { bubbles: true }));

    quest.root.querySelector('#Q1 .next').click();
    await vi.waitFor(() => expect(quest.root.querySelector('form.active')?.id).toBe('Q2'));
    await vi.waitFor(() => expect(quest.store).toHaveBeenCalled());

    expect(quest.calls.store[0]['TEST_MODULE.Q1']).toBe('2');
    expect(quest.calls.store[0]['TEST_MODULE.treeJSON']).toBeTypeOf('string');
  });

  it.each(['non200', 'reject'])(
    'restores an unsaved response after a %s store failure and retries the exact payload',
    async (storeMode) => {
      const store = vi.fn();
      if (storeMode === 'reject') {
        store.mockRejectedValueOnce(new Error('Synthetic store rejection'));
      } else {
        store.mockResolvedValueOnce({ code: 503 });
      }
      store.mockResolvedValue({ code: 200 });

      const quest = await renderFreshQuest({ params: { store } });
      quest.root.querySelector('#Q1_2').click();
      quest.root.querySelector('#Q1 .next').click();

      await vi.waitFor(() => expect(quest.root.querySelector('form.active')?.id).toBe('Q1'));
      await vi.waitFor(() => expect(
        quest.root.querySelector('#storeErrorModal').classList.contains('show'),
      ).toBe(true));
      expect(document.activeElement).toBe(quest.root.querySelector('#storeErrorModalBody'));

      const failedPayload = store.mock.calls[0][0];
      expect(Object.keys(failedPayload).sort()).toEqual([
        'TEST_MODULE.Q1',
        'TEST_MODULE.treeJSON',
      ]);
      expect(failedPayload['TEST_MODULE.Q1']).toBe('2');
      expect(JSON.parse(failedPayload['TEST_MODULE.treeJSON']).currentNode).toBe('Q1?');
      expect(quest.state.getSurveyState()).toEqual({});
      expect(quest.state.getActiveQuestionState()).toEqual({ Q1: '2' });
      expect(quest.state.findResponseValue('Q1')).toBe('2');
      expect(quest.root.querySelector('#Q1_2').checked).toBe(true);
      expect(quest.errors).toHaveLength(1);

      globalThis.bootstrap.Modal.getInstance(quest.root.querySelector('#storeErrorModal')).hide();
      quest.root.querySelector('#Q1 .next').click();

      await vi.waitFor(() => expect(store).toHaveBeenCalledTimes(2));
      await vi.waitFor(() => expect(quest.root.querySelector('form.active')?.id).toBe('Q2'));

      const retryPayload = store.mock.calls[1][0];
      expect(retryPayload).toEqual(failedPayload);
      expect(quest.state.getSurveyState()).toEqual({
        Q1: '2',
        treeJSON: retryPayload['TEST_MODULE.treeJSON'],
      });
      expect(quest.state.getActiveQuestionState()).toEqual({});
      expect(quest.errors).toHaveLength(1);
    },
  );

  it.each(['non200', 'reject'])(
    'restores the committed response after a failed %s Back deletion and permits retry',
    async (storeMode) => {
      const resumedAtQ2 = JSON.stringify({
        rootNode: {
          value: null,
          children: [{
            value: 'Q1?',
            children: [{ value: 'Q2', children: [] }],
          }],
        },
        currentNode: 'Q2',
      });
      const store = vi.fn();
      if (storeMode === 'reject') {
        store.mockRejectedValueOnce(new Error('Synthetic store rejection'));
      } else {
        store.mockResolvedValueOnce({ code: 503 });
      }
      store.mockResolvedValue({ code: 200 });

      const quest = await renderFreshQuest({
        persistedData: { Q1: '1', Q2: 'saved', treeJSON: resumedAtQ2 },
        params: { store },
      });
      expect(quest.root.querySelector('#Q2_TEXT').value).toBe('saved');

      quest.root.querySelector('#Q2 .previous').click();
      await vi.waitFor(() => expect(quest.root.querySelector('form.active')?.id).toBe('Q2'));
      await vi.waitFor(() => expect(
        quest.root.querySelector('#storeErrorModal').classList.contains('show'),
      ).toBe(true));

      const failedPayload = store.mock.calls[0][0];
      expect(failedPayload).toHaveProperty('TEST_MODULE.Q2', undefined);
      expect(JSON.parse(failedPayload['TEST_MODULE.treeJSON']).currentNode).toBe('Q1?');
      expect(quest.state.getSurveyState()).toEqual({
        Q1: '1',
        Q2: 'saved',
        treeJSON: resumedAtQ2,
      });
      expect(quest.state.getActiveQuestionState()).toEqual({ Q2: 'saved' });
      expect(quest.state.findResponseValue('Q2')).toBe('saved');
      expect(quest.root.querySelector('#Q2_TEXT').value).toBe('saved');

      globalThis.bootstrap.Modal.getInstance(quest.root.querySelector('#storeErrorModal')).hide();
      quest.root.querySelector('#Q2 .previous').click();

      await vi.waitFor(() => expect(store).toHaveBeenCalledTimes(2));
      await vi.waitFor(() => expect(quest.root.querySelector('form.active')?.id).toBe('Q1'));

      expect(store.mock.calls[1][0]).toHaveProperty('TEST_MODULE.Q2', undefined);
      expect(quest.state.getSurveyState()).toMatchObject({ Q1: '1', Q2: undefined });
      expect(quest.state.getActiveQuestionState()).toEqual({ Q1: '1' });
      expect(quest.errors).toHaveLength(1);
    },
  );

  it('does not retain rollback-only tree metadata after failed Back from an unanswered question', async () => {
    const resumedAtQ2 = JSON.stringify({
      rootNode: {
        value: null,
        children: [{
          value: 'Q1?',
          children: [{ value: 'Q2', children: [] }],
        }],
      },
      currentNode: 'Q2',
    });
    const store = vi.fn()
      .mockResolvedValueOnce({ code: 503 })
      .mockResolvedValue({ code: 200 });
    const quest = await renderFreshQuest({
      persistedData: { Q1: '1', treeJSON: resumedAtQ2 },
      params: { store },
    });

    expect(quest.root.querySelector('#Q2_TEXT').value).toBe('');
    expect(quest.state.getActiveQuestionState()).toEqual({});

    quest.root.querySelector('#Q2 .previous').click();
    await vi.waitFor(() => expect(quest.root.querySelector('form.active')?.id).toBe('Q2'));
    await vi.waitFor(() => expect(
      quest.root.querySelector('#storeErrorModal').classList.contains('show'),
    ).toBe(true));

    const failedPayload = store.mock.calls[0][0];
    expect(Object.keys(failedPayload)).toEqual(['TEST_MODULE.treeJSON']);
    expect(JSON.parse(failedPayload['TEST_MODULE.treeJSON']).currentNode).toBe('Q1?');
    expect(quest.state.getSurveyState()).toEqual({ Q1: '1', treeJSON: resumedAtQ2 });
    expect(quest.state.getActiveQuestionState()).toEqual({});
    expect(quest.state.findResponseValue('Q2')).toBeUndefined();
    expect(quest.root.querySelector('#Q2_TEXT').value).toBe('');

    globalThis.bootstrap.Modal.getInstance(quest.root.querySelector('#storeErrorModal')).hide();
    quest.root.querySelector('#Q2 .previous').click();
    await vi.waitFor(() => expect(store).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(quest.root.querySelector('form.active')?.id).toBe('Q1'));

    expect(store.mock.calls[1][0]).toEqual(failedPayload);
    expect(quest.state.getActiveQuestionState()).toEqual({ Q1: '1' });
  });

  it('discards later-page live indexes when an earlier delayed write fails', async () => {
    let resolveFirstStore;
    const store = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirstStore = resolve;
      }))
      .mockResolvedValue({ code: 200 });
    const quest = await renderFreshQuest({ params: { store } });

    quest.root.querySelector('#Q1_1').click();
    quest.root.querySelector('#Q1 .next').click();
    await vi.waitFor(() => expect(quest.root.querySelector('form.active')?.id).toBe('Q2'));

    const laterInput = quest.root.querySelector('#Q2_TEXT');
    laterInput.value = 'later';
    laterInput.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(quest.state.getActiveQuestionState()).toEqual({ Q2: 'later' });
    expect(quest.state.findResponseValue('Q2')).toBe('later');

    resolveFirstStore({ code: 503 });
    await vi.waitFor(() => expect(quest.root.querySelector('form.active')?.id).toBe('Q1'));
    await vi.waitFor(() => expect(
      quest.root.querySelector('#storeErrorModal').classList.contains('show'),
    ).toBe(true));

    expect(quest.state.getSurveyState()).toEqual({});
    expect(quest.state.getActiveQuestionState()).toEqual({ Q1: '1' });
    expect(quest.state.getResponseToQuestionMapping()).toEqual({ Q1: 'Q1' });
    expect(quest.state.getCache()).toEqual({ Q1: '1' });
    expect(quest.state.findResponseValue('Q2')).toBeUndefined();
    expect(quest.root.querySelector('#Q1_1').checked).toBe(true);
  });

  it('keeps committed compound state isolated while restoring an edited response after store failure', async () => {
    const compoundTree = JSON.stringify({
      rootNode: { value: null, children: [{ value: 'MULTI', children: [] }] },
      currentNode: 'MULTI',
    });
    const committedResponse = {
      CHECK_GROUP: ['1'],
      RADIO_GROUP: '7',
      DETAIL: 'saved detail',
    };
    const editedResponse = {
      ...committedResponse,
      DETAIL: 'edited detail',
    };
    let resolveStore;
    let payloadBeforeHostMutation;
    const store = vi.fn((changes) => {
      payloadBeforeHostMutation = structuredClone(changes['ROLLBACK_COMPOUND.MULTI']);
      changes['ROLLBACK_COMPOUND.MULTI'].CHECK_GROUP.push('host mutation');
      changes['ROLLBACK_COMPOUND.MULTI'].DETAIL = 'host mutation';
      return new Promise((resolve) => {
        resolveStore = resolve;
      });
    });
    const quest = await renderFreshQuest({
      markdown: `
        {"name":"ROLLBACK_COMPOUND"}
        [MULTI?] Supply several values.
        [1:CHECK_GROUP] First
        [2:CHECK_GROUP] Second
        (7:RADIO_GROUP) Seven
        (8:RADIO_GROUP) Eight
        |__|id=DETAIL|
        [END,end] Done.
      `,
      persistedData: {
        MULTI: committedResponse,
        treeJSON: compoundTree,
      },
      params: { store },
    });

    const detail = quest.root.querySelector('#DETAIL');
    detail.value = editedResponse.DETAIL;
    detail.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

    // A live nested edit must not mutate the last committed host snapshot.
    expect(quest.state.getSurveyState().MULTI).toEqual(committedResponse);
    expect(quest.state.getActiveQuestionState().MULTI).toEqual(editedResponse);

    quest.root.querySelector('#MULTI .next').click();
    await vi.waitFor(() => expect(store).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(quest.root.querySelector('form.active')?.id).toBe('END'));

    expect(payloadBeforeHostMutation).toEqual(editedResponse);
    expect(store.mock.calls[0][0]['ROLLBACK_COMPOUND.MULTI']).toEqual({
      ...editedResponse,
      CHECK_GROUP: ['1', 'host mutation'],
      DETAIL: 'host mutation',
    });
    expect(quest.state.getSurveyState().MULTI).toEqual(editedResponse);

    resolveStore({ code: 503 });
    await vi.waitFor(() => expect(quest.root.querySelector('form.active')?.id).toBe('MULTI'));
    await vi.waitFor(() => expect(
      quest.root.querySelector('#storeErrorModal').classList.contains('show'),
    ).toBe(true));

    expect(quest.state.getSurveyState()).toEqual({
      MULTI: committedResponse,
      treeJSON: compoundTree,
    });
    expect(quest.state.getActiveQuestionState()).toEqual({ MULTI: editedResponse });
    expect(quest.state.findResponseValue('DETAIL', 'MULTI')).toBe(editedResponse.DETAIL);
    expect(quest.root.querySelector('#CHECK_GROUP_1').checked).toBe(true);
    expect(quest.root.querySelector('#RADIO_GROUP_7').checked).toBe(true);
    expect(quest.root.querySelector('#DETAIL').value).toBe(editedResponse.DETAIL);
  });

  it('returns false and reports malformed survey input without throwing to the host', async () => {
    const quest = await renderFreshQuest({ markdown: 'not a questionnaire' });

    expect(quest.rendered).toBe(false);
    expect(quest.errors.length).toBeGreaterThan(0);
  });

  it.each([null, undefined, false, 0])(
    'ignores a non-response persisted value (%s) without dirtying startup',
    async (persistedValue) => {
      const quest = await renderFreshQuest({
        persistedData: { Q1: persistedValue },
      });

      expect(quest.rendered).toBe(true);
      expect(quest.root.querySelector('form.active')?.id).toBe('Q1');
      expect(quest.root.querySelectorAll('#Q1 input:checked')).toHaveLength(0);
      expect(quest.errors).toEqual([]);
    },
  );

  it('keeps previous-result lookups available to conditions without merging them into survey state', async () => {
    const markdown = `
      {"name":"PREVIOUS_RESULTS"}
      [Q1,displayif=equals(EXTERNAL_FLAG,1)] Visible when prior data matches.
      [END] Done.
    `;
    const quest = await renderFreshQuest({ markdown, previousResults: { EXTERNAL_FLAG: '1' } });

    expect(quest.root.querySelector('form.active')?.id).toBe('Q1');
    expect(quest.state.getSurveyState()).not.toHaveProperty('EXTERNAL_FLAG');
  });

  it('reinitializes survey state when the public render boundary is called sequentially', async () => {
    const quest = await renderFreshQuest();
    quest.root.querySelector('#Q1_1').click();
    expect(quest.state.getActiveQuestionState()).toEqual({ Q1: '1' });

    document.body.innerHTML = '<div id="secondRoot"></div>';
    const secondStore = vi.fn(async () => ({ code: 200 }));
    const rendered = await quest.transform.render({
      activate: true,
      text: SIMPLE_SURVEY.replace('TEST_MODULE', 'SECOND_MODULE'),
      store: secondStore,
      errorLogger: () => {},
    }, 'secondRoot');

    expect(rendered).toBe(true);
    expect(quest.moduleParams.questName).toBe('SECOND_MODULE');
    expect(document.querySelector('#secondRoot form.active')?.id).toBe('Q1');
    expect(quest.state.getSurveyState()).toEqual({});
    expect(quest.state.getActiveQuestionState()).toEqual({});

    document.querySelector('#secondRoot #Q1_2').click();
    document.querySelector('#secondRoot #Q1 .next').click();
    await vi.waitFor(() => expect(secondStore).toHaveBeenCalledOnce());

    expect(quest.store).not.toHaveBeenCalled();
    expect(secondStore.mock.calls[0][0]).toMatchObject({
      'SECOND_MODULE.Q1': '2',
      'SECOND_MODULE.treeJSON': expect.any(String),
    });
    expect(Object.keys(secondStore.mock.calls[0][0]).some((key) => key.startsWith('TEST_MODULE.'))).toBe(false);
  });

  it('restores a sequential render only inside its current Quest root', async () => {
    const quest = await renderFreshQuest({ rootId: 'firstRoot' });
    const firstRoot = quest.root;
    firstRoot.querySelector('#Q1_1').click();
    expect(firstRoot.querySelector('#Q1_1').checked).toBe(true);

    const secondRoot = document.createElement('div');
    secondRoot.id = 'secondRoot';
    document.body.append(secondRoot);
    const rendered = await quest.transform.render({
      activate: true,
      text: SIMPLE_SURVEY.replace('TEST_MODULE', 'SECOND_ROOT'),
      surveyDataPrefetch: {
        Q1: '2',
        treeJSON: JSON.stringify({
          rootNode: { value: null, children: [{ value: 'Q1?', children: [] }] },
          currentNode: 'Q1?',
        }),
      },
      store: vi.fn(async () => ({ code: 200 })),
      errorLogger: () => {},
    }, 'secondRoot');

    expect(rendered).toBe(true);
    expect(firstRoot.querySelector('#Q1_1').checked).toBe(true);
    expect(firstRoot.querySelector('#Q1_2').checked).toBe(false);
    expect(secondRoot.querySelector('input[name="Q1"][value="1"]').checked).toBe(false);
    expect(secondRoot.querySelector('input[name="Q1"][value="2"]').checked).toBe(true);
    expect(quest.state.getActiveQuestionState()).toEqual({ Q1: '2' });
  });

  it.each([
    {
      kind: 'requested',
      marker: '?',
      modalId: 'softModal',
      bodyId: 'modalBodyText',
      message: 'There is 1 question unanswered on this page. Would you like to continue?',
    },
    {
      kind: 'required',
      marker: '!',
      modalId: 'hardModal',
      bodyId: 'hardModalBodyText',
      message: 'There is 1 question unanswered on this page. Please answer the question.',
    },
  ])('keeps a $kind-response modal scoped to a retained sequential-render root', async ({
    marker,
    modalId,
    bodyId,
    message,
  }) => {
    const markdown = `
      {"name":"RETAINED_MODAL_ROOT"}
      [Q1${marker}] Choose one answer.
      (1) First answer
      [END] Done.
    `;
    const quest = await renderFreshQuest({ markdown, rootId: 'firstRoot' });
    const firstRoot = quest.root;
    const obsoleteModal = firstRoot.querySelector(`[id="${modalId}"]`);
    obsoleteModal.querySelector(`[id="${bodyId}"]`).textContent = 'Obsolete modal body';

    const secondRoot = document.createElement('div');
    secondRoot.id = 'secondRoot';
    document.body.append(secondRoot);
    const rendered = await quest.transform.render({
      activate: true,
      text: markdown,
      store: vi.fn(async () => ({ code: 200 })),
      errorLogger: () => {},
    }, 'secondRoot');

    expect(rendered).toBe(true);
    const currentQuestion = secondRoot.querySelector('form.question.active');
    expect(currentQuestion?.id).toBe('Q1');
    const currentModal = secondRoot.querySelector(`[id="${modalId}"]`);
    const focusTarget = currentQuestion.querySelector('.screen-reader-focus');
    await vi.waitFor(() => expect(document.activeElement).toBe(focusTarget));

    currentQuestion.querySelector('.next').click();

    expect(obsoleteModal.classList).not.toContain('show');
    expect(obsoleteModal.querySelector(`[id="${bodyId}"]`).textContent).toBe('Obsolete modal body');
    expect(currentModal.classList).toContain('show');
    expect(currentModal.querySelector(`[id="${bodyId}"]`).innerText.replace(/\s+/g, ' ').trim()).toBe(message);
    expect(document.activeElement).toBe(currentModal.querySelector(`[id="${bodyId}"]`));

    const modalInstance = globalThis.bootstrap.Modal.getInstance(currentModal);
    expect(modalInstance).not.toBeNull();
    modalInstance.hide();
    expect(document.activeElement).toBe(focusTarget);

    currentQuestion.querySelector('.next').click();
    expect(globalThis.bootstrap.Modal.getInstance(currentModal)).toBe(modalInstance);
    modalInstance.hide();
    expect(document.activeElement).toBe(focusTarget);
  });

  it('uses the current render store for submission and supports a later hostless render', async () => {
    const quest = await renderFreshQuest();
    const secondStore = vi.fn(async () => ({ code: 200 }));
    document.body.innerHTML = '<div id="secondRoot"></div>';
    await quest.transform.render({
      activate: true,
      text: SIMPLE_SURVEY.replace('TEST_MODULE', 'SECOND_SUBMIT'),
      store: secondStore,
      errorLogger: () => {},
    }, 'secondRoot');

    await quest.state.submitSurvey();
    expect(quest.store).not.toHaveBeenCalled();
    expect(secondStore).toHaveBeenCalledOnce();
    expect(secondStore.mock.calls[0][0]).toMatchObject({
      'SECOND_SUBMIT.COMPLETED': true,
      'SECOND_SUBMIT.COMPLETED_TS': expect.any(Date),
      'SECOND_SUBMIT.treeJSON': expect.any(String),
    });

    document.body.innerHTML = '<div id="hostlessRoot"></div>';
    await quest.transform.render({
      activate: true,
      text: SIMPLE_SURVEY.replace('TEST_MODULE', 'HOSTLESS_RENDER'),
      errorLogger: () => {},
    }, 'hostlessRoot');
    document.querySelector('#hostlessRoot #Q1_1').click();
    document.querySelector('#hostlessRoot #Q1 .next').click();
    await Promise.resolve();

    expect(secondStore).toHaveBeenCalledOnce();
    await expect(quest.state.submitSurvey()).resolves.toBeUndefined();
    expect(secondStore).toHaveBeenCalledOnce();
  });

  it.each(['non200', 'reject'])(
    'ignores a delayed %s store failure from an obsolete render',
    async (storeMode) => {
      const quest = await renderFreshQuest({ storeMode, storeDelay: 1_000 });
      const secondErrors = vi.fn();

      vi.useFakeTimers();
      try {
        quest.root.querySelector('#Q1_1').click();
        quest.root.querySelector('#Q1 .next').click();
        expect(quest.store).toHaveBeenCalledOnce();

        document.body.innerHTML = '<div id="secondRoot"></div>';
        await quest.transform.render({
          activate: true,
          text: SIMPLE_SURVEY.replace('TEST_MODULE', 'SECOND_AFTER_DELAY'),
          store: vi.fn(async () => ({ code: 200 })),
          errorLogger: secondErrors,
        }, 'secondRoot');

        await vi.advanceTimersByTimeAsync(1_000);

        expect(document.querySelector('#secondRoot form.active')?.id).toBe('Q1');
        expect(quest.state.getSurveyState()).toEqual({});
        expect(quest.state.getActiveQuestionState()).toEqual({});
        expect(secondErrors).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('invalidates an obsolete store failure before awaiting URL Markdown', async () => {
    const quest = await renderFreshQuest({ storeMode: 'reject', storeDelay: 1_000 });
    const secondErrors = vi.fn();
    const secondStore = vi.fn(async () => ({ code: 200 }));
    let resolveSurveyFetch;
    const surveyFetch = new Promise((resolve) => {
      resolveSurveyFetch = resolve;
    });

    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (String(url).endsWith('/survey.txt')) return surveyFetch;
      return Promise.resolve({ text: async () => '' });
    }));
    try {
      quest.root.querySelector('#Q1_1').click();
      quest.root.querySelector('#Q1 .next').click();
      expect(quest.store).toHaveBeenCalledOnce();

      document.body.innerHTML = '<div id="secondRoot"></div>';
      const secondRender = quest.transform.render({
        activate: true,
        url: 'https://example.test/survey.txt',
        store: secondStore,
        errorLogger: secondErrors,
      }, 'secondRoot');

      await vi.advanceTimersByTimeAsync(1_000);
      expect(secondErrors).not.toHaveBeenCalled();

      resolveSurveyFetch({
        text: async () => SIMPLE_SURVEY.replace('TEST_MODULE', 'URL_SECOND'),
      });
      await expect(secondRender).resolves.toBe(true);
      expect(document.querySelector('#secondRoot form.active')?.id).toBe('Q1');
      expect(quest.state.getSurveyState()).toEqual({});
      expect(quest.state.getActiveQuestionState()).toEqual({});
      expect(secondErrors).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('does not rerun a cached async question or mutate a sequential render during store rollback', async () => {
    const asyncSurvey = `
      {"name":"ROLLBACK_ASYNC"}
      [ASYNC?]
      [Q2?] Later question.
      (1) Later response
      [END,end] Done.
    `;
    let resolveStore;
    let resolveRollbackAsync;
    let asyncCallCount = 0;
    const store = vi.fn(() => new Promise((resolve) => {
      resolveStore = resolve;
    }));
    const fetchAsyncQuestion = vi.fn(async () => {
      const callNumber = ++asyncCallCount;
      if (callNumber > 1) {
        await new Promise((resolve) => {
          resolveRollbackAsync = resolve;
        });
      }

      // Match Connect's host callback, which appends results to whichever
      // Quest question is active when the asynchronous request settles.
      const fieldset = document.querySelector('form.question.active fieldset');
      if (!fieldset) return;
      fieldset.innerHTML = callNumber === 1
        ? `
          <span>Choose the host-provided option.</span>
          <div class="response">
            <input type="radio" id="ASYNC_1" name="ASYNC" value="1">
            <label for="ASYNC_1">Async answer</label>
          </div>
        `
        : '<span id="staleAsyncMutation">Stale async mutation</span>';
    });
    const quest = await renderFreshQuest({
      markdown: asyncSurvey,
      params: {
        store,
        asyncQuestionsMap: {
          '[ASYNC?]': { func: 'loadSyntheticOptions', args: [] },
        },
        fetchAsyncQuestion,
      },
    });

    await vi.waitFor(() => expect(quest.root.querySelector('#ASYNC_1')).not.toBeNull());
    quest.root.querySelector('#ASYNC_1').click();
    quest.root.querySelector('#ASYNC .next').click();
    await vi.waitFor(() => expect(store).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(quest.root.querySelector('form.active')?.id).toBe('Q2'));

    resolveStore({ code: 503 });
    await vi.waitFor(() => expect(quest.root.querySelector('form.active')?.id).toBe('ASYNC'));

    const secondErrors = vi.fn();
    const rendered = await quest.transform.render({
      activate: true,
      text: SIMPLE_SURVEY.replace('TEST_MODULE', 'SECOND_AFTER_ASYNC_ROLLBACK'),
      store: vi.fn(async () => ({ code: 200 })),
      errorLogger: secondErrors,
    }, 'questionnaireRoot');

    // Resolve a redundant rollback fetch if a regression starts one. Its
    // production-shaped callback must never reach the replacement survey.
    resolveRollbackAsync?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(rendered).toBe(true);
    expect(fetchAsyncQuestion).toHaveBeenCalledOnce();
    expect(document.querySelector('#questionnaireRoot form.active')?.id).toBe('Q1');
    expect(document.querySelector('#questionnaireRoot #staleAsyncMutation')).toBeNull();
    expect(document.querySelector('#questionnaireRoot #Q1_1')).not.toBeNull();
    expect(document.querySelector('#questionnaireRoot #storeErrorModal').classList.contains('show')).toBe(false);
    expect(quest.state.getSurveyState()).toEqual({});
    expect(quest.state.getActiveQuestionState()).toEqual({});
    expect(secondErrors).not.toHaveBeenCalled();
  });

  it('does not let a pending delegated input debounce mutate a sequential render', async () => {
    const firstMarkdown = `
      {"name":"FIRST_DEBOUNCE"}
      [OLD?] Choose a response.
      [99] Other [text box:OLD_OTHER_TEXT]
      [END,end] Done.
    `;
    const quest = await renderFreshQuest({ markdown: firstMarkdown });
    const oldText = quest.root.querySelector('#OLD_OTHER_TEXT');
    const secondStore = vi.fn(async () => ({ code: 200 }));
    const secondErrors = vi.fn();

    vi.useFakeTimers();
    try {
      oldText.value = 'stale response';
      oldText.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        data: 'e',
        inputType: 'insertText',
      }));

      document.body.innerHTML = '<div id="secondRoot"></div>';
      const rendered = await quest.transform.render({
        activate: true,
        text: SIMPLE_SURVEY.replace('TEST_MODULE', 'SECOND_DEBOUNCE'),
        store: secondStore,
        errorLogger: secondErrors,
      }, 'secondRoot');

      expect(rendered).toBe(true);
      expect(quest.state.getSurveyState()).toEqual({});
      expect(quest.state.getActiveQuestionState()).toEqual({});

      await vi.advanceTimersByTimeAsync(251);

      expect(quest.state.getSurveyState()).toEqual({});
      expect(quest.state.getActiveQuestionState()).toEqual({});
      expect(secondStore).not.toHaveBeenCalled();
      expect(secondErrors).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not let a pending selection announcement survive a sequential render', async () => {
    const quest = await renderFreshQuest();
    const oldLiveRegion = quest.root.querySelector('#ariaLiveSelectionAnnouncer');

    vi.useFakeTimers();
    try {
      const oldRadio = quest.root.querySelector('#Q1_1');
      oldRadio.click();
      oldRadio.dispatchEvent(new Event('change', { bubbles: true }));
      oldLiveRegion.textContent = 'Existing selection status.';

      document.body.insertAdjacentHTML('beforeend', '<div id="secondRoot"></div>');
      const rendered = await quest.transform.render({
        activate: true,
        text: SIMPLE_SURVEY.replace('TEST_MODULE', 'SECOND_ANNOUNCEMENT'),
        store: vi.fn(async () => ({ code: 200 })),
        errorLogger: () => {},
      }, 'secondRoot');

      expect(rendered).toBe(true);
      const newLiveRegion = document.querySelector('#secondRoot #ariaLiveSelectionAnnouncer');
      expect(oldLiveRegion.isConnected).toBe(true);
      expect(oldLiveRegion.textContent).toBe('');
      await vi.advanceTimersByTimeAsync(100);

      expect(oldLiveRegion.textContent).toBe('');
      expect(newLiveRegion.textContent).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

});
