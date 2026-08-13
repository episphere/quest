import { describe, expect, it, vi } from 'vitest';
import { renderFreshQuest } from '../helpers/questRuntime.js';

const SCALAR_PIPE_SURVEY = `
{"name":"PIPE_SCALAR"}

[SOURCE?] Enter the name we should use.
|__|id=SOURCE_TEXT|

[PROMPT] Hello {$SOURCE_TEXT:participant}. Please continue.

[SUMMARY] Summary: {$SOURCE_TEXT}.

[END,end] Done.
`;

const SUMMARY_PIPE_SURVEY = `
{"name":"PIPE_SUMMARY"}

[ENTRY?] Optional entry.
|__|id=MISSING|

[SUMMARY] Values: {$FIRST} / {$MISSING} / {$WHITESPACE}.
[FALLBACK] Hello {$MISSING:participant}.
[CONCEPT] Sensitive {$CONCEPT:masked}.
[END,end] Done.
`;

const DISPLAY_LIST_PIPE_SURVEY = `
{"name":"PIPE_LIST"}

[SELECT?] Select all that apply.
[1:CHOICES] Alpha
[2:CHOICES] Beta
[99:CHOICES] Other: |__|id=OTHER_TEXT|

[SUMMARY] Selected: |displayList(valueIsOneOf("CHOICES",1),"Alpha",valueIsOneOf("CHOICES",2),"Beta",exists("OTHER_TEXT"),"Other",exists("OTHER_TEXT"),"OTHER_TEXT",sep="; ")|
[END,end] Done.
`;

function treeAt(questionID) {
  return JSON.stringify({
    rootNode: { value: null, children: [{ value: questionID, children: [] }] },
    currentNode: questionID,
  });
}

async function activeQuestion(quest, questionID) {
  if (questionID) {
    await vi.waitFor(() => expect(quest.root.querySelector('form.question.active')?.id).toBe(questionID));
  }
  return quest.root.querySelector('form.question.active');
}

async function next(quest) {
  (await activeQuestion(quest)).querySelector('.next').click();
}

async function back(quest) {
  (await activeQuestion(quest)).querySelector('.previous').click();
}

function focusout(input) {
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

describe('response piping through participant runtime state', () => {
  it('pipes a delegated text response into a following question and summary, stores it, and refreshes it after Back/edit', async () => {
    const quest = await renderFreshQuest({ markdown: SCALAR_PIPE_SURVEY });
    const source = quest.root.querySelector('#SOURCE_TEXT');

    source.value = 'Original name';
    focusout(source);
    expect(quest.state.getActiveQuestionState()).toEqual({ SOURCE: 'Original name' });

    await next(quest);
    expect((await activeQuestion(quest, 'PROMPT')).textContent).toContain('Hello Original name');
    await vi.waitFor(() => expect(quest.calls.store).toHaveLength(1));
    expect(quest.calls.store[0]['PIPE_SCALAR.SOURCE']).toBe('Original name');

    await back(quest);
    await activeQuestion(quest, 'SOURCE');
    expect(quest.root.querySelector('#SOURCE_TEXT').value).toBe('Original name');

    source.value = 'Updated name';
    focusout(source);
    await next(quest);
    expect((await activeQuestion(quest, 'PROMPT')).textContent).toContain('Hello Updated name');
    await next(quest);
    expect((await activeQuestion(quest, 'SUMMARY')).textContent).toContain('Summary: Updated name');
    expect(quest.state.getSurveyState().SOURCE).toBe('Updated name');
    expect(quest.errors).toEqual([]);
  });

  it('pipes persisted state when resuming directly at a summary', async () => {
    const quest = await renderFreshQuest({
      markdown: SCALAR_PIPE_SURVEY,
      persistedData: {
        SOURCE: 'Resumed name',
        treeJSON: treeAt('SUMMARY'),
      },
    });

    expect((await activeQuestion(quest, 'SUMMARY')).textContent).toContain('Summary: Resumed name');
    expect(quest.state.getCache().SOURCE).toBe('Resumed name');
    expect(quest.errors).toEqual([]);
  });

  it('keeps populated multi-value summary spans, hides missing ones, retains whitespace, and handles fallback and concept suppression', async () => {
    const quest = await renderFreshQuest({
      markdown: SUMMARY_PIPE_SURVEY,
      persistedData: {
        FIRST: 'First value',
        WHITESPACE: '  ',
        CONCEPT: '123456789',
        treeJSON: treeAt('SUMMARY'),
      },
    });

    const summary = await activeQuestion(quest, 'SUMMARY');
    const summaryValues = [...summary.querySelectorAll('span[forid]')];
    expect(summaryValues.map(({ textContent, style }) => ({ textContent, display: style.display }))).toEqual([
      { textContent: 'First value', display: '' },
      { textContent: 'MISSING', display: 'none' },
      { textContent: '  ', display: '' },
    ]);

    await next(quest);
    expect((await activeQuestion(quest, 'FALLBACK')).textContent).toContain('Hello participant');
    await next(quest);
    const concept = await activeQuestion(quest, 'CONCEPT');
    expect(concept.querySelector('[forid="CONCEPT"]').textContent).toBe('');
    expect(concept.textContent).not.toContain('123456789');
    expect(quest.errors).toEqual([]);
  });

  it('uses checkbox selections and nested Other text in a displayList summary', async () => {
    const quest = await renderFreshQuest({ markdown: DISPLAY_LIST_PIPE_SURVEY });
    const select = await activeQuestion(quest, 'SELECT');
    const alpha = select.querySelector('#CHOICES_1');
    const other = select.querySelector('#CHOICES_99');
    const detail = select.querySelector('#OTHER_TEXT');

    vi.useFakeTimers();
    try {
      alpha.click();
      other.click();
      detail.value = 'Participant detail';
      detail.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'l', inputType: 'insertText' }));
      await vi.advanceTimersByTimeAsync(250);
      expect(quest.state.getActiveQuestionState().SELECT).toEqual({
        CHOICES: ['1', '99'],
        OTHER_TEXT: 'Participant detail',
      });
    } finally {
      vi.useRealTimers();
    }

    await next(quest);
    expect((await activeQuestion(quest, 'SUMMARY')).textContent).toContain('Alpha; Other; Participant detail');
    await vi.waitFor(() => expect(quest.calls.store).toHaveLength(1));
    expect(quest.calls.store[0]['PIPE_LIST.SELECT']).toEqual({
      CHOICES: ['1', '99'],
      OTHER_TEXT: 'Participant detail',
    });
    expect(quest.errors).toEqual([]);
  });

});
