import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderFreshQuest } from '../helpers/questRuntime.js';

const TEXT_SURVEY = `
{"name":"EVENT_TEXT"}
[TEXT?] Enter a response.
|__|id=TEXT_VALUE minlen=2 maxlen=20|
[END,end] Done.
`;

const NATIVE_ARROW_SURVEY = `
{"name":"EVENT_NATIVE_ARROWS"}
[NOTES?] Enter two short notes.
|___|notes|
[END,end] Done.
`;

const NATIVE_SELECT_SURVEY = `
{"name":"EVENT_NATIVE_SELECT"}
[STATE?] In which state do you live?
|state|id=home_state|
[END,end] Done.
`;

const CHOICE_LINKED_TEXT_SURVEY = `
{"name":"EVENT_CHOICE_LINKED_TEXT"}
[OTHER?] Choose an option and add details if needed.
(1:OTHER_GROUP|OTHER_LABEL) Other details <textarea id="OTHER_TEXT"></textarea>
(2) No additional details
[END,end] Done.
`;

const CHECKBOX_LINKED_TEXT_SURVEY = `
{"name":"EVENT_CHECKBOX_LINKED_TEXT"}
[OTHER?] Choose an option and add details if needed.
[1:OTHER_GROUP|OTHER_LABEL] Other details <textarea id="OTHER_TEXT"></textarea>
[2] No additional details
[END,end] Done.
`;

const POPOVER_SURVEY = `
{"name":"EVENT_POPOVER"}
[HELP] Read |popup|more information|Help title|Synthetic help text|.
[END,end] Done.
`;

const COMPOUND_DELETION_SURVEY = `
{"name":"EVENT_COMPOUND_DELETE"}
[Q1?] Select a response or add detail.
[1:CHOICE] First response
|__|id=DETAIL|
[END,end] Done.
`;

async function transitionToTextQuestion(quest) {
  quest.root.querySelector('#Q1_1').click();
  quest.root.querySelector('#Q1 .next').click();
  await vi.advanceTimersByTimeAsync(0);

  expect(quest.root.querySelector('form.active')?.id).toBe('Q2');
  return {
    focusTarget: quest.root.querySelector('#Q2 .screen-reader-focus'),
    input: quest.root.querySelector('#Q2_TEXT'),
  };
}

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
    input.dataset.acceptedModalValue = input.value;

    form.querySelector('.reset').click();
    expect(input.value).toBe('');
    expect(input.hasAttribute('data-accepted-modal-value')).toBe(false);
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

  it('persists a question-level deletion after the final compound response is unchecked', async () => {
    const quest = await renderFreshQuest({ markdown: COMPOUND_DELETION_SURVEY });
    const checkbox = quest.root.querySelector('#CHOICE_1');

    checkbox.click();
    expect(quest.state.getActiveQuestionState()).toEqual({
      Q1: { CHOICE: ['1'] },
    });

    checkbox.click();
    const activeState = quest.state.getActiveQuestionState();
    expect(Object.prototype.hasOwnProperty.call(activeState, 'Q1')).toBe(true);
    expect(activeState.Q1).toBeUndefined();

    quest.state.syncToStore(quest.root.querySelector('#Q1 .next'));
    await vi.waitFor(() => expect(quest.store).toHaveBeenCalledOnce());
    const payload = quest.store.mock.calls[0][0];
    expect(payload).toHaveProperty('EVENT_COMPOUND_DELETE.Q1', undefined);
    expect(payload).toHaveProperty('EVENT_COMPOUND_DELETE.treeJSON', expect.any(String));
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

  it('does not cancel ArrowDown on a standalone native textarea (CONNECT-1587)', async () => {
    const quest = await renderFreshQuest({ markdown: NATIVE_ARROW_SURVEY });
    const textarea = quest.root.querySelector('#notes');
    const arrowDown = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'ArrowDown',
    });

    expect(textarea.dispatchEvent(arrowDown)).toBe(true);
    expect(arrowDown.defaultPrevented).toBe(false);
  });

  it('records a standalone textarea response on delegated focusout', async () => {
    const quest = await renderFreshQuest({ markdown: NATIVE_ARROW_SURVEY });
    const textarea = quest.root.querySelector('#notes');

    textarea.value = 'Persist this response';
    textarea.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

    expect(quest.state.getActiveQuestionState().NOTES).toBe('Persist this response');
  });

  it('removes a standalone textarea response when its form is reset programmatically', async () => {
    const quest = await renderFreshQuest({ markdown: NATIVE_ARROW_SURVEY });
    const textarea = quest.root.querySelector('#notes');
    const resetButton = textarea.form.querySelector('[data-click-type="reset"]');
    expect(resetButton).not.toBeNull();
    textarea.value = 'Remove this response';
    textarea.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

    const { resetChildren } = await import('../../eventHandlers.js');
    expect(() => resetChildren(textarea.form)).not.toThrow();

    expect(textarea.value).toBe('');
    expect(quest.state.getActiveQuestionState().NOTES).toBeUndefined();
  });

  it('clears checkbox-group validation semantics when its form is reset', async () => {
    const quest = await renderFreshQuest({ markdown: TEXT_SURVEY });
    const form = quest.root.querySelector('#TEXT');
    form.dataset.minCount = '2';
    form.querySelector('fieldset').innerHTML = `
      <div class="response"><input type="checkbox" name="CHOICES" value="1" checked></div>
      <div class="response"><input type="checkbox" name="CHOICES" value="2"></div>
      <div class="response"><input type="checkbox" name="CHOICES" value="3"></div>
    `;
    const inputs = [...form.querySelectorAll('input')];
    const { validateInput } = await import('../../validate.js');
    const { resetChildren } = await import('../../eventHandlers.js');

    validateInput(inputs[0]);
    const error = form.querySelector('.validation-container');
    expect(error).not.toBeNull();
    inputs.forEach((input) => {
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby').split(/\s+/)).toContain(error.id);
    });

    resetChildren(form);

    expect(form.querySelector('.validation-container')).toBeNull();
    inputs.forEach((input) => {
      expect(input.checked).toBe(false);
      expect(input.hasAttribute('aria-invalid')).toBe(false);
      expect(input.hasAttribute('aria-describedby')).toBe(false);
    });
  });

  it('clears stale validation when another choice clears an embedded number response', async () => {
    const quest = await renderFreshQuest({ markdown: TEXT_SURVEY });
    const form = quest.root.querySelector('#TEXT');
    form.querySelector('fieldset').innerHTML = `
      <span id="detail-hint"></span>
      <div class="response">
        <label>
          <input type="radio" id="OTHER" name="CHOICES" value="1">
          Other
          <input type="number" id="DETAIL" name="DETAIL" data-max="3" aria-describedby="detail-hint">
        </label>
      </div>
      <div class="response">
        <label><input type="radio" id="NONE" name="CHOICES" value="2"> None</label>
      </div>
    `;
    quest.state.setNumResponseInputs('TEXT', 2);
    const other = form.querySelector('#OTHER');
    const none = form.querySelector('#NONE');
    const detail = form.querySelector('#DETAIL');

    other.click();
    detail.value = '9';
    detail.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

    const error = form.querySelector('.validation-container');
    expect(error).not.toBeNull();
    expect(detail.getAttribute('aria-invalid')).toBe('true');
    expect(detail.getAttribute('aria-describedby').split(/\s+/)).toEqual([
      'detail-hint',
      error.id,
    ]);

    none.click();

    expect(detail.value).toBe('');
    expect(form.querySelector('.validation-container')).toBeNull();
    expect(detail.hasAttribute('aria-invalid')).toBe(false);
    expect(detail.getAttribute('aria-describedby')).toBe('detail-hint');
    expect(quest.state.getActiveQuestionState().TEXT).toEqual({ CHOICES: '2' });
  });

  it('clears a choice-linked textarea together with its owning response', async () => {
    vi.useFakeTimers();
    const quest = await renderFreshQuest({ markdown: CHOICE_LINKED_TEXT_SURVEY });
    const textarea = quest.root.querySelector('#OTHER_TEXT');
    const choice = quest.root.querySelector('#OTHER_GROUP_1');
    textarea.value = 'Remove this linked response';
    textarea.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      data: 'e',
      inputType: 'insertText',
    }));
    await vi.advanceTimersByTimeAsync(250);
    expect(choice.checked).toBe(true);
    expect(textarea.dataset.lastValue).toBe('Remove this linked response');

    const { resetChildren } = await import('../../eventHandlers.js');
    resetChildren(textarea.form);

    expect(choice.checked).toBe(false);
    expect(textarea.value).toBe('');
    expect(textarea.dataset).not.toHaveProperty('lastValue');
    expect(quest.state.getActiveQuestionState().OTHER).toBeUndefined();

    choice.click();
    expect(choice.checked).toBe(true);
    expect(textarea.value).toBe('');
  });

  it('does not cancel native select navigation, activation, or dismissal keys (CONNECT-1587)', async () => {
    const quest = await renderFreshQuest({ markdown: NATIVE_SELECT_SURVEY });
    const select = quest.root.querySelector('#home_state');

    for (const key of ['ArrowDown', 'ArrowUp', ' ', 'Enter', 'Escape']) {
      const event = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key,
      });

      expect(select.dispatchEvent(event)).toBe(true);
      expect(event.defaultPrevented).toBe(false);
    }
  });

  it('does not cancel arrows or move focus from a choice-linked native textarea (CONNECT-1587)', async () => {
    vi.useFakeTimers();
    const quest = await renderFreshQuest({ markdown: CHOICE_LINKED_TEXT_SURVEY });
    const textarea = quest.root.querySelector('#OTHER_TEXT');
    vi.clearAllTimers();
    textarea.value = 'first\nsecond';
    textarea.focus();
    textarea.setSelectionRange(0, 0);

    for (const key of ['ArrowDown', 'ArrowUp']) {
      const event = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key,
      });

      expect(textarea.dispatchEvent(event)).toBe(true);
      expect(event.defaultPrevented).toBe(false);
      await vi.advanceTimersByTimeAsync(0);
      expect(document.activeElement).toBe(textarea);
    }
  });

  it('keeps keyboard activation on a linked checkbox while retaining pointer-only text focus', async () => {
    vi.useFakeTimers();
    const quest = await renderFreshQuest({ markdown: CHECKBOX_LINKED_TEXT_SURVEY });
    const checkbox = quest.root.querySelector('#OTHER_GROUP_1');
    const label = quest.root.querySelector('#OTHER_LABEL');
    const textarea = quest.root.querySelector('#OTHER_TEXT');
    vi.clearAllTimers();

    checkbox.focus();
    checkbox.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(checkbox.checked).toBe(true);
    expect(document.activeElement).toBe(checkbox);

    checkbox.click();
    expect(checkbox.checked).toBe(false);
    label.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    checkbox.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(checkbox.checked).toBe(true);
    expect(document.activeElement).toBe(textarea);
  });

  it('gives a role-button popover explicit native-equivalent activation and dismissal', async () => {
    const quest = await renderFreshQuest({ markdown: POPOVER_SURVEY });
    const trigger = quest.root.querySelector('[data-bs-toggle="popover"]');
    const instance = bootstrap.Popover.getInstance(trigger);
    expect(instance).not.toBeNull();
    const hidePopover = vi.spyOn(instance, 'hide');
    expect(trigger.dataset.bsTrigger).toBe('manual');

    trigger.focus();
    expect(trigger.hasAttribute('aria-describedby')).toBe(false);

    const closedEscape = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' });
    expect(trigger.dispatchEvent(closedEscape)).toBe(true);
    expect(closedEscape.defaultPrevented).toBe(false);
    expect(hidePopover).not.toHaveBeenCalled();

    const space = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: ' ' });
    expect(trigger.dispatchEvent(space)).toBe(false);
    expect(space.defaultPrevented).toBe(true);
    const popoverId = trigger.getAttribute('aria-describedby');
    const popoverElement = document.getElementById(popoverId);
    expect(popoverElement).not.toBeNull();
    expect(popoverElement.classList.contains('show')).toBe(true);

    const escape = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' });
    expect(trigger.dispatchEvent(escape)).toBe(false);
    expect(escape.defaultPrevented).toBe(true);
    expect(hidePopover).toHaveBeenCalledOnce();
    expect(popoverElement.classList.contains('show')).toBe(false);
    expect(trigger.hasAttribute('aria-describedby')).toBe(false);
    expect(document.activeElement).toBe(trigger);

    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    expect(trigger.dispatchEvent(click)).toBe(false);
    expect(click.defaultPrevented).toBe(true);
    const reopenedPopoverElement = document.getElementById(trigger.getAttribute('aria-describedby'));
    expect(reopenedPopoverElement).not.toBeNull();
    expect(reopenedPopoverElement.classList.contains('show')).toBe(true);

    trigger.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(reopenedPopoverElement.classList.contains('show')).toBe(false);
  });

  it('disposes an open popover after its hidden lifecycle event', async () => {
    const quest = await renderFreshQuest({ markdown: POPOVER_SURVEY });
    const trigger = quest.root.querySelector('[data-bs-toggle="popover"]');
    const instance = bootstrap.Popover.getInstance(trigger);
    const hiddenPopover = vi.fn();
    const hiddenModal = vi.fn();
    trigger.addEventListener('hidden.bs.popover', hiddenPopover);
    trigger.addEventListener('hidden.bs.modal', hiddenModal);

    instance.show();
    const popoverElement = document.getElementById(trigger.getAttribute('aria-describedby'));
    expect(popoverElement).not.toBeNull();
    expect(popoverElement.classList.contains('show')).toBe(true);

    const { disposePopovers } = await import('../../questionnaire.js');
    disposePopovers(quest.root);

    expect(hiddenPopover).toHaveBeenCalledOnce();
    expect(hiddenModal).not.toHaveBeenCalled();
    expect(popoverElement.classList.contains('show')).toBe(false);
    expect(trigger.hasAttribute('aria-describedby')).toBe(false);
    expect(bootstrap.Popover.getInstance(trigger)).toBeNull();
  });

  it('does not emit duplicate popover lifecycle events for repeated show or hide calls', async () => {
    const quest = await renderFreshQuest({ markdown: POPOVER_SURVEY });
    const trigger = quest.root.querySelector('[data-bs-toggle="popover"]');
    const instance = bootstrap.Popover.getInstance(trigger);
    const shownPopover = vi.fn();
    const hiddenPopover = vi.fn();
    trigger.addEventListener('shown.bs.popover', shownPopover);
    trigger.addEventListener('hidden.bs.popover', hiddenPopover);

    instance.hide();
    expect(hiddenPopover).not.toHaveBeenCalled();

    instance.show();
    instance.show();
    expect(shownPopover).toHaveBeenCalledOnce();

    instance.hide();
    instance.hide();
    expect(hiddenPopover).toHaveBeenCalledOnce();
  });

  it('disposes an initialized but unopened popover without emitting a hidden event', async () => {
    const quest = await renderFreshQuest({ markdown: POPOVER_SURVEY });
    const trigger = quest.root.querySelector('[data-bs-toggle="popover"]');
    const hiddenPopover = vi.fn();
    trigger.addEventListener('hidden.bs.popover', hiddenPopover);

    expect(bootstrap.Popover.getInstance(trigger)).not.toBeNull();
    expect(trigger.hasAttribute('aria-describedby')).toBe(false);

    const { disposePopovers } = await import('../../questionnaire.js');
    disposePopovers(quest.root);

    expect(hiddenPopover).not.toHaveBeenCalled();
    expect(bootstrap.Popover.getInstance(trigger)).toBeNull();
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

  it('builds a legend, a programmatic-only question focus target, and accessible break semantics', async () => {
    const quest = await renderFreshQuest();
    const fieldset = quest.root.querySelector('#Q1 fieldset');

    expect(fieldset.querySelector('legend.question-text')?.textContent).toContain('Choose one answer');
    expect(fieldset.querySelectorAll('.screen-reader-focus')).toHaveLength(1);
    expect(fieldset.querySelector('.screen-reader-focus').tabIndex).toBe(-1);
    expect([...fieldset.querySelectorAll('br')].every((br) => br.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(quest.root.querySelectorAll('#srAnnouncerContainer [aria-live="polite"]')).toHaveLength(2);
  });

  it('moves focus to the constructed screen-reader stop after a question transition', async () => {
    vi.useFakeTimers();
    const quest = await renderFreshQuest();
    vi.clearAllTimers();
    const nativeRequestAnimationFrame = window.requestAnimationFrame;
    let scheduledFrameCount = 0;
    window.requestAnimationFrame = (callback) => {
      scheduledFrameCount += 1;
      return nativeRequestAnimationFrame.call(window, callback);
    };

    let focusTarget;
    try {
      ({ focusTarget } = await transitionToTextQuestion(quest));
      expect(document.activeElement).not.toBe(focusTarget);
      expect(scheduledFrameCount).toBe(1);
    } finally {
      window.requestAnimationFrame = nativeRequestAnimationFrame;
    }
    await vi.advanceTimersToNextTimerAsync();
    expect(document.activeElement).toBe(focusTarget);
  });

  it('never overrides rapid focus and typing in a newly rendered response', async () => {
    vi.useFakeTimers();
    const quest = await renderFreshQuest();
    vi.clearAllTimers();

    const { focusTarget, input } = await transitionToTextQuestion(quest);
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'A', code: 'KeyA' }));
    input.value = 'A';
    input.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      data: 'A',
      inputType: 'insertText',
    }));

    await vi.runAllTimersAsync();
    expect(document.activeElement).toBe(input);
    expect(document.activeElement).not.toBe(focusTarget);
    expect(input.value).toBe('A');
  });

  it('does not override focus moved to a host control before the handoff', async () => {
    vi.useFakeTimers();
    const quest = await renderFreshQuest();
    vi.clearAllTimers();

    const { focusTarget } = await transitionToTextQuestion(quest);
    const hostControl = document.querySelector('#afterQuest');
    hostControl.focus();

    await vi.runAllTimersAsync();
    expect(document.activeElement).toBe(hostControl);
    expect(document.activeElement).not.toBe(focusTarget);
  });

  it('honors host focus moved while asynchronous question content is loading', async () => {
    vi.useFakeTimers();
    let finishAsyncLoad;
    const fetchAsyncQuestion = vi.fn(() => new Promise((resolve) => {
      finishAsyncLoad = resolve;
    }));
    const quest = await renderFreshQuest({
      params: {
        asyncQuestionsMap: {
          '[Q1?]': { func: 'loadQuestion', args: [] },
        },
        fetchAsyncQuestion,
      },
    });
    const hostControl = document.querySelector('#afterQuest');

    expect(fetchAsyncQuestion).toHaveBeenCalledOnce();
    hostControl.focus();
    finishAsyncLoad();
    await vi.advanceTimersByTimeAsync(0);
    await vi.runAllTimersAsync();

    expect(quest.root.querySelector('#Q1 .screen-reader-focus')).not.toBeNull();
    expect(document.activeElement).toBe(hostControl);
  });

  it('focuses a terminal asynchronous error unless participant or host activity cancels the handoff', async () => {
    vi.useFakeTimers();
    let rejectAsyncLoad;
    const fetchAsyncQuestion = vi.fn(() => new Promise((_, reject) => {
      rejectAsyncLoad = reject;
    }));
    const quest = await renderFreshQuest({
      params: {
        asyncQuestionsMap: {
          '[Q1?]': { func: 'loadQuestion', args: [] },
        },
        fetchAsyncQuestion,
      },
    });

    rejectAsyncLoad(new Error('Synthetic async failure'));
    await vi.advanceTimersByTimeAsync(0);
    await vi.runAllTimersAsync();

    const error = quest.root.querySelector('#Q1 .validation-container');
    expect(error.firstElementChild.innerText).toContain('Error fetching question. Please go back and try again.');
    expect(error.tabIndex).toBe(-1);
    expect(error.hasAttribute('role')).toBe(false);
    expect(error.hasAttribute('aria-atomic')).toBe(false);
    expect(document.activeElement).toBe(error);
    expect(document.activeElement).not.toBe(quest.root.querySelector('#Q1 .screen-reader-focus'));
    expect(quest.root.querySelector('#ariaLiveQuestionAnnouncer').textContent).toBe('');
  });

  it('does not move focus to a terminal asynchronous error after host focus cancels the handoff', async () => {
    vi.useFakeTimers();
    let rejectAsyncLoad;
    const fetchAsyncQuestion = vi.fn(() => new Promise((_, reject) => {
      rejectAsyncLoad = reject;
    }));
    const quest = await renderFreshQuest({
      params: {
        asyncQuestionsMap: {
          '[Q1?]': { func: 'loadQuestion', args: [] },
        },
        fetchAsyncQuestion,
      },
    });
    const hostControl = document.querySelector('#afterQuest');

    hostControl.focus();
    rejectAsyncLoad(new Error('Synthetic async failure'));
    await vi.advanceTimersByTimeAsync(0);
    await vi.runAllTimersAsync();

    const error = quest.root.querySelector('#Q1 .validation-container');
    expect(error).not.toBeNull();
    expect(document.activeElement).toBe(hostControl);
    expect(document.activeElement).not.toBe(error);
    expect(quest.root.querySelector('#ariaLiveQuestionAnnouncer').textContent).toBe(
      'Error fetching question. Please go back and try again.',
    );
  });

  it('announces a terminal asynchronous error when interaction cancels its scheduled focus', async () => {
    vi.useFakeTimers();
    let rejectAsyncLoad;
    const fetchAsyncQuestion = vi.fn(() => new Promise((_, reject) => {
      rejectAsyncLoad = reject;
    }));
    const quest = await renderFreshQuest({
      params: {
        asyncQuestionsMap: {
          '[Q1?]': { func: 'loadQuestion', args: [] },
        },
        fetchAsyncQuestion,
      },
    });

    rejectAsyncLoad(new Error('Synthetic async failure'));
    await vi.advanceTimersByTimeAsync(0);
    const error = quest.root.querySelector('#Q1 .validation-container');
    const hostControl = document.querySelector('#afterQuest');
    expect(error).not.toBeNull();
    expect(document.activeElement).not.toBe(error);

    hostControl.focus();
    await vi.runAllTimersAsync();

    expect(document.activeElement).toBe(hostControl);
    expect(quest.root.querySelector('#ariaLiveQuestionAnnouncer').textContent).toBe(
      'Error fetching question. Please go back and try again.',
    );
  });

  it.each([
    ['participant keyboard activity', (quest) => quest.root.querySelector('#Q2 legend'), () => new KeyboardEvent('keydown', { bubbles: true, key: 'A', code: 'KeyA' })],
    ['participant pointer activity', (quest) => quest.root.querySelector('#Q2 legend'), () => new PointerEvent('pointerdown', { bubbles: true })],
    ['participant assistive-technology click', (quest) => quest.root.querySelector('#Q2 legend'), () => new MouseEvent('click', { bubbles: true, detail: 0 })],
    ['host keyboard activity', () => document.querySelector('#afterQuest'), () => new KeyboardEvent('keydown', { bubbles: true, key: 'A', code: 'KeyA' })],
    ['host pointer activity', () => document.querySelector('#afterQuest'), () => new PointerEvent('pointerdown', { bubbles: true })],
    ['host programmatic click', () => document.querySelector('#afterQuest'), () => new MouseEvent('click', { bubbles: true, detail: 0 })],
  ])('cancels the question-focus handoff after %s', async (_, eventTarget, createEvent) => {
    vi.useFakeTimers();
    const quest = await renderFreshQuest();
    vi.clearAllTimers();

    const { focusTarget } = await transitionToTextQuestion(quest);
    eventTarget(quest).dispatchEvent(createEvent());

    await vi.runAllTimersAsync();
    expect(document.activeElement).not.toBe(focusTarget);
  });

  it('does not move focus behind an open response modal', async () => {
    vi.useFakeTimers();
    const quest = await renderFreshQuest();
    vi.clearAllTimers();

    const { focusTarget } = await transitionToTextQuestion(quest);
    quest.root.querySelector('#softModal').classList.add('show');

    await vi.advanceTimersToNextTimerAsync();
    expect(document.activeElement).not.toBe(focusTarget);
  });

  it('ignores a focus target disconnected before the handoff', async () => {
    vi.useFakeTimers();
    const quest = await renderFreshQuest();
    vi.clearAllTimers();

    const { focusTarget } = await transitionToTextQuestion(quest);
    const focusSpy = vi.spyOn(focusTarget, 'focus');
    focusTarget.remove();

    await vi.advanceTimersToNextTimerAsync();
    expect(focusTarget.isConnected).toBe(false);
    expect(focusSpy).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(focusTarget);
  });

  it('does not restore an obsolete submit trigger during render-driven modal disposal', async () => {
    const quest = await renderFreshQuest();
    quest.root.querySelector('#Q1_1').click();
    quest.root.querySelector('#Q1 .next').click();
    await vi.waitFor(() => expect(quest.root.querySelector('form.active')?.id).toBe('Q2'));

    const input = quest.root.querySelector('#Q2_TEXT');
    input.value = 'valid';
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    quest.root.querySelector('#Q2 .next').click();
    await vi.waitFor(() => expect(quest.root.querySelector('form.active')?.id).toBe('END'));

    const submitTrigger = quest.root.querySelector('#END [data-click-type="submitSurvey"]');
    submitTrigger.click();
    const submitModal = quest.root.querySelector('#submitModal');
    expect(submitModal.classList).toContain('show');
    expect(document.activeElement).toBe(quest.root.querySelector('#submitModalBodyText'));

    const focusSpy = vi.spyOn(submitTrigger, 'focus');
    submitModal._questRenderDisposal = true;
    globalThis.bootstrap.Modal.getInstance(submitModal).hide();

    expect(focusSpy).not.toHaveBeenCalled();
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
