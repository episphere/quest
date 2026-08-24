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

  it('returns false and reports malformed survey input without throwing to the host', async () => {
    const quest = await renderFreshQuest({ markdown: 'not a questionnaire' });

    expect(quest.rendered).toBe(false);
    expect(quest.errors.length).toBeGreaterThan(0);
  });

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
    const rendered = await quest.transform.render({
      activate: true,
      text: SIMPLE_SURVEY.replace('TEST_MODULE', 'SECOND_MODULE'),
      store: vi.fn(async () => ({ code: 200 })),
      errorLogger: () => {},
    }, 'secondRoot');

    expect(rendered).toBe(true);
    expect(quest.moduleParams.questName).toBe('SECOND_MODULE');
    expect(document.querySelector('#secondRoot form.active')?.id).toBe('Q1');
    expect(quest.state.getSurveyState()).toEqual({});
    expect(quest.state.getActiveQuestionState()).toEqual({});
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

});
