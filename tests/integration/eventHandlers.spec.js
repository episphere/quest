import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderFreshQuest } from '../helpers/questRuntime.js';

const TEXT_SURVEY = `
{"name":"EVENT_TEXT"}
[TEXT?] Enter a response.
|__|id=TEXT_VALUE minlen=2 maxlen=20|
[END,end] Done.
`;

describe('delegated runtime event handling', () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('captures input, focusout, Enter, and reset behavior at the Quest container boundary', async () => {
    vi.useFakeTimers();
    const quest = await renderFreshQuest({ markdown: TEXT_SURVEY });
    const input = quest.root.querySelector('#TEXT_VALUE');
    const form = input.form;
    vi.clearAllTimers();

    const enter = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      code: 'Enter',
      key: 'Enter',
      keyCode: 13,
    });
    expect(input.dispatchEvent(enter)).toBe(false);
    expect(enter.defaultPrevented).toBe(true);

    input.value = 'debounced value';
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'e', inputType: 'insertText' }));
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(250);
    expect(quest.state.getActiveQuestionState()).toEqual({});

    input.value = 'focusout value';
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(quest.state.getActiveQuestionState().TEXT).toBe('focusout value');
    expect(input.getAttribute('style')).toContain('size: 20');

    form.querySelector('.reset').click();
    expect(input.value).toBe('');
    expect(quest.state.getActiveQuestionState().TEXT).toBeUndefined();
  });

  it('debounces nested Other text input and keeps its owning checkbox in sync', async () => {
    vi.useFakeTimers();
    const quest = await renderFreshQuest({ markdown: TEXT_SURVEY });
    const form = quest.root.querySelector('#TEXT');
    form.querySelector('fieldset').innerHTML = `
      <legend>Choose another response.</legend>
      <div class="response">
        <label for="OTHER">
          <input type="checkbox" id="OTHER" name="OTHER_GROUP" value="99">
          Other <input type="text" id="OTHER_TEXT" name="TEXT">
        </label>
      </div>
    `;
    quest.state.setNumResponseInputs('TEXT', 2);
    const checkbox = form.querySelector('#OTHER');
    const otherText = form.querySelector('#OTHER_TEXT');
    vi.clearAllTimers();

    otherText.value = 'synthetic detail';
    otherText.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'l', inputType: 'insertText' }));
    await vi.advanceTimersByTimeAsync(250);

    expect(checkbox.checked).toBe(true);
    expect(quest.state.getActiveQuestionState().TEXT).toEqual({
      OTHER_GROUP: ['99'],
      OTHER_TEXT: 'synthetic detail',
    });

    otherText.value = '';
    otherText.dispatchEvent(new InputEvent('input', { bubbles: true, data: null, inputType: 'deleteContentBackward' }));
    await vi.advanceTimersByTimeAsync(250);
    expect(checkbox.checked).toBe(false);
  });

  it('formats SSN and telephone keystrokes through delegated keyup listeners', async () => {
    const quest = await renderFreshQuest({ markdown: TEXT_SURVEY });
    const form = quest.root.querySelector('#TEXT');
    const ssn = document.createElement('input');
    ssn.type = 'text';
    ssn.className = 'SSN';
    ssn.value = '12345';
    const phone = document.createElement('input');
    phone.type = 'tel';
    phone.value = '555555';
    form.querySelector('fieldset').append(ssn, phone);

    ssn.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, code: 'Digit5' }));
    phone.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, code: 'Digit5' }));

    expect(ssn.value).toBe('123-45-');
    expect(phone.value).toBe('555-555-');
  });

  it('updates the live selection announcement without requiring listeners on individual controls', async () => {
    vi.useFakeTimers();
    const quest = await renderFreshQuest();
    const radio = quest.root.querySelector('#Q1_2');

    radio.click();
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(100);
    expect(quest.root.querySelector('#ariaLiveSelectionAnnouncer').textContent).toContain('Second answer Selected.');

    radio.checked = false;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(100);
    expect(quest.root.querySelector('#ariaLiveSelectionAnnouncer').textContent).toContain('Second answer Unselected.');
  });

  it('builds a legend, a single hidden focus stop, and accessible break semantics', async () => {
    const quest = await renderFreshQuest();
    const fieldset = quest.root.querySelector('#Q1 fieldset');

    expect(fieldset.querySelector('legend.question-text')?.textContent).toContain('Choose one answer');
    expect(fieldset.querySelectorAll('.screen-reader-focus')).toHaveLength(1);
    expect(fieldset.querySelector('.screen-reader-focus').tabIndex).toBe(0);
    expect([...fieldset.querySelectorAll('br')].every((br) => br.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(quest.root.querySelectorAll('#srAnnouncerContainer [aria-live="polite"]')).toHaveLength(2);
  });

  it('moves focus to the constructed screen-reader stop after a question transition', async () => {
    vi.useFakeTimers();
    const quest = await renderFreshQuest();
    vi.clearAllTimers();

    quest.root.querySelector('#Q1_1').click();
    quest.root.querySelector('#Q1 .next').click();
    await vi.advanceTimersByTimeAsync(0);

    expect(quest.root.querySelector('form.active')?.id).toBe('Q2');
    await vi.advanceTimersByTimeAsync(500);
    expect(document.activeElement).toBe(quest.root.querySelector('#Q2 .screen-reader-focus'));
  });

  it('keeps host controls outside the delegated event boundary unchanged', async () => {
    const quest = await renderFreshQuest();
    const outside = document.querySelector('#afterQuest');
    const handler = vi.fn();
    outside.addEventListener('keydown', handler);

    outside.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', keyCode: 13 }));

    expect(handler).toHaveBeenCalledOnce();
    expect(quest.state.getActiveQuestionState()).toEqual({});
    expect(quest.calls.store).toEqual([]);
  });

  it('works with ordinary host capture and bubble observers around the embedded Quest root', async () => {
    const quest = await renderFreshQuest();
    const radio = quest.root.querySelector('#Q1_2');
    const host = document.querySelector('#root');
    const captureObserver = vi.fn();
    const bubbleObserver = vi.fn();
    document.addEventListener('keydown', captureObserver, true);
    host.addEventListener('keydown', bubbleObserver);

    try {
      const space = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: ' ',
        code: 'Space',
      });
      radio.dispatchEvent(space);
      expect(captureObserver).toHaveBeenCalledWith(space);
      expect(bubbleObserver).toHaveBeenCalledWith(space);
      expect(space.defaultPrevented).toBe(false);

      radio.click();
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      await vi.waitFor(() => expect(quest.state.getActiveQuestionState().Q1).toBe('2'));
    } finally {
      document.removeEventListener('keydown', captureObserver, true);
      host.removeEventListener('keydown', bubbleObserver);
    }
  });
});
