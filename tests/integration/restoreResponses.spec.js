import { describe, expect, it } from 'vitest';
import { renderFreshQuest } from '../helpers/questRuntime.js';

function treeAt(questionID) {
  return JSON.stringify({
    rootNode: { value: null, children: [{ value: questionID, children: [] }] },
    currentNode: questionID,
  });
}

describe('response restoration', () => {
  it('restores a simple text response into the active input', async () => {
    const quest = await renderFreshQuest({
      markdown: `
        {"name":"RESTORE_TEXT"}
        [TEXT?] Enter text. |__|id=TEXT_VALUE|
        [END,end] Done.
      `,
      persistedData: { TEXT: 'saved text', treeJSON: treeAt('TEXT') },
    });

    expect(quest.root.querySelector('#TEXT_VALUE').value).toBe('saved text');
    expect(quest.state.getActiveQuestionState().TEXT).toBe('saved text');
  });

  it('restores every checked value in a checkbox array', async () => {
    const quest = await renderFreshQuest({
      markdown: `
        {"name":"RESTORE_CHECKS"}
        [CHECK?] Select all.
        [1] First
        [2] Second
        [3] Third
        [END,end] Done.
      `,
      persistedData: { CHECK: ['1', '3'], treeJSON: treeAt('CHECK') },
    });

    expect(quest.root.querySelector('#CHECK_1').checked).toBe(true);
    expect(quest.root.querySelector('#CHECK_2').checked).toBe(false);
    expect(quest.root.querySelector('#CHECK_3').checked).toBe(true);
    expect(quest.state.getActiveQuestionState().CHECK).toEqual(['1', '3']);
  });

  it.each([
    ['soft', 'SOFT?'],
    ['hard', 'HARD!'],
  ])('restores a %s question from its raw tree token', async (_, treeToken) => {
    const questionID = treeToken.slice(0, -1);
    const quest = await renderFreshQuest({
      markdown: `
        {"name":"RESTORE_MARKED"}
        [${treeToken}] Choose one.
        (1) Selected response
        (2) Other response
        [END,end] Done.
      `,
      persistedData: {
        [questionID]: '1',
        treeJSON: treeAt(treeToken),
      },
    });

    expect(quest.root.querySelector('form.active')?.id).toBe(questionID);
    expect(quest.root.querySelector(`#${questionID}_1`).checked).toBe(true);
    expect(quest.state.getActiveQuestionState()).toEqual({ [questionID]: '1' });
    expect(JSON.parse(quest.questionQueue.toJSON()).currentNode).toBe(treeToken);
  });

  it('restores compound strings, radio values, and checkbox arrays by response key', async () => {
    const quest = await renderFreshQuest({
      markdown: `
        {"name":"RESTORE_COMPOUND"}
        [MULTI?] Supply several values.
        [1:CHECK_GROUP] First
        [2:CHECK_GROUP] Second
        (7:RADIO_GROUP) Seven
        (8:RADIO_GROUP) Eight
        |__|id=DETAIL|
        [END,end] Done.
      `,
      persistedData: {
        MULTI: {
          CHECK_GROUP: ['1', '2'],
          RADIO_GROUP: '8',
          DETAIL: 'restored detail',
        },
        treeJSON: treeAt('MULTI'),
      },
    });

    expect(quest.root.querySelector('#CHECK_GROUP_1').checked).toBe(true);
    expect(quest.root.querySelector('#CHECK_GROUP_2').checked).toBe(true);
    expect(quest.root.querySelector('#RADIO_GROUP_8').checked).toBe(true);
    expect(quest.root.querySelector('#DETAIL').value).toBe('restored detail');
    expect(quest.state.getActiveQuestionState().MULTI).toEqual({
      CHECK_GROUP: ['1', '2'],
      RADIO_GROUP: '8',
      DETAIL: 'restored detail',
    });
  });

  it('restores XOR object values into XOR controls', async () => {
    const quest = await renderFreshQuest({
      markdown: `
        {"name":"RESTORE_XOR"}
        [XORQ?] Enter an XOR value. |__|id=XOR_FIELD xor=XOR_GROUP|
        [END,end] Done.
      `,
      persistedData: {
        XORQ: { XOR_GROUP: { XOR_FIELD: 'exclusive value' } },
        treeJSON: treeAt('XORQ'),
      },
    });

    expect(quest.root.querySelector('#XOR_FIELD').value).toBe('exclusive value');
  });

  it('ignores dynamically absent controls while retaining persisted state', async () => {
    const quest = await renderFreshQuest({
      markdown: `
        {"name":"RESTORE_DYNAMIC"}
        [DYNAMIC?] The host may add this control later.
        [END,end] Done.
      `,
      persistedData: { DYNAMIC: 'host-owned value', treeJSON: treeAt('DYNAMIC') },
    });

    expect(quest.rendered).toBe(true);
    expect(quest.state.getSurveyState().DYNAMIC).toBe('host-owned value');
    expect(quest.errors).toEqual([]);
  });

  it('logs malformed object keys, unsupported response types, and unmatched radio values', async () => {
    const quest = await renderFreshQuest();
    const { restoreResponses } = await import('../../restoreResponses.js');

    restoreResponses({ Q1: { '': 'bad' } }, 'Q1');
    restoreResponses({ Q1: 42 }, 'Q1');
    restoreResponses({ Q1: 'missing-radio-value' }, 'Q1');

    expect(quest.errors.flat().join(' ')).toContain('skipping');
    expect(quest.errors.flat().join(' ')).toContain('unhandled response type');
    expect(quest.errors.flat().join(' ')).toContain('Problem with radio');
  });

  it('does nothing when the question or persisted response is absent', async () => {
    const quest = await renderFreshQuest();
    const { restoreResponses } = await import('../../restoreResponses.js');

    expect(() => restoreResponses({}, 'Q1')).not.toThrow();
    expect(() => restoreResponses({ Q1: undefined }, 'Q1')).not.toThrow();
    expect(() => restoreResponses({ Q1: null }, 'Q1')).not.toThrow();
    expect(() => restoreResponses({ MISSING: 'value' }, 'MISSING')).not.toThrow();
    expect(quest.errors).toEqual([]);
  });
});
