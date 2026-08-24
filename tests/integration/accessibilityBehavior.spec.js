import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderFreshQuest } from '../helpers/questRuntime.js';

const GRID_SURVEY = `
{"name":"A11Y_GRID"}
[GRID_LEAD] Rate each item.
|grid?|id="GRID"|How often?|[ROW_ONE] First row;[ROW_TWO] Second row;|(1: Never)(2: Often)|
[END,end] Done.
`;

function treeAt(questionID) {
  return JSON.stringify({
    rootNode: { value: null, children: [{ value: questionID, children: [] }] },
    currentNode: questionID,
  });
}

describe('screen-reader and keyboard behavior', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('keeps focus on a native list control while announcing its changed state', async () => {
    const quest = await renderFreshQuest();
    const radio = quest.root.querySelector('#Q1_2');

    radio.focus();
    radio.click();
    radio.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

    await vi.advanceTimersByTimeAsync(300);
    expect(document.activeElement).toBe(radio);
    expect(quest.root.querySelector('#ariaLiveSelectionAnnouncer').textContent).toContain('Second answer Selected.');
  });

  it('keeps focus on a native grid radio after its state changes', async () => {
    const quest = await renderFreshQuest({
      markdown: GRID_SURVEY,
      persistedData: { treeJSON: treeAt('GRID') },
    });
    const firstRowChoice = quest.root.querySelector('#ROW_ONE_0');

    firstRowChoice.focus();
    firstRowChoice.click();
    firstRowChoice.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

    await vi.advanceTimersByTimeAsync(300);
    expect(document.activeElement).toBe(firstRowChoice);
    expect(firstRowChoice.checked).toBe(true);
    expect(quest.root.querySelector('#srFocusHelper')).toBeNull();
  });

  it('keeps focus on a native final-row grid radio instead of advancing on selection', async () => {
    const quest = await renderFreshQuest({
      markdown: GRID_SURVEY,
      persistedData: { treeJSON: treeAt('GRID') },
    });
    const finalRowChoice = quest.root.querySelector('#ROW_TWO_1');

    finalRowChoice.focus();
    finalRowChoice.click();
    finalRowChoice.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

    await vi.advanceTimersByTimeAsync(300);
    expect(document.activeElement).toBe(finalRowChoice);
    expect(finalRowChoice.checked).toBe(true);
    expect(quest.root.querySelector('#GRID .next')).not.toBe(document.activeElement);
  });

  it('announces table selections without adding non-native selection commands', async () => {
    const quest = await renderFreshQuest({
      markdown: GRID_SURVEY,
      persistedData: { treeJSON: treeAt('GRID') },
    });
    const choice = quest.root.querySelector('#ROW_ONE_1');

    choice.click();
    choice.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.advanceTimersByTimeAsync(250);
    expect(quest.root.querySelector('#ariaLiveSelectionAnnouncer').textContent.trim()).toBe('Often Selected.');
    expect(choice.getAttribute('role')).toBeNull();
  });

  it('leaves Up and Down under native text and radio control', async () => {
    const quest = await renderFreshQuest();
    const fieldset = quest.root.querySelector('#Q1 fieldset');
    fieldset.innerHTML = `
      <legend>Other responses.</legend>
      <div class="response"><input type="radio" id="FIRST_RADIO"><label><input type="text" id="FIRST_TEXT"></label></div>
      <div class="response"><input type="radio" id="SECOND_RADIO"><label><input type="text" id="SECOND_TEXT"></label></div>
      <button type="button" id="AFTER_RESPONSES">Continue</button>
    `;
    const firstText = fieldset.querySelector('#FIRST_TEXT');
    const secondText = fieldset.querySelector('#SECOND_TEXT');

    secondText.focus();
    const textArrowUp = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowUp' });
    secondText.dispatchEvent(textArrowUp);
    await vi.advanceTimersByTimeAsync(0);
    expect(textArrowUp.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(secondText);

    firstText.focus();
    const textArrowDown = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowDown' });
    firstText.dispatchEvent(textArrowDown);
    await vi.advanceTimersByTimeAsync(0);
    expect(textArrowDown.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(firstText);

    const radio = fieldset.querySelector('#SECOND_RADIO');
    radio.focus();
    const nativeArrow = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowDown' });
    radio.dispatchEvent(nativeArrow);
    expect(nativeArrow.defaultPrevented).toBe(false);
  });

  it.each(['softModal', 'hardModal'])('restores question focus after closing %s', async (modalId) => {
    const quest = await renderFreshQuest();
    const modal = quest.root.querySelector(`#${modalId}`);
    const focusTarget = quest.root.querySelector('#Q1 .screen-reader-focus');

    // The initial render already schedules a 500 ms focus. Remove it so a
    // passing assertion proves the hidden-modal handler itself restores focus.
    vi.clearAllTimers();
    expect(document.activeElement).not.toBe(focusTarget);

    modal.dispatchEvent(new Event('hidden.bs.modal'));

    await vi.advanceTimersByTimeAsync(99);
    expect(document.activeElement).not.toBe(focusTarget);
    await vi.advanceTimersByTimeAsync(1);
    expect(document.activeElement).toBe(focusTarget);
    expect(quest.root.querySelectorAll('#Q1 .screen-reader-focus')).toHaveLength(1);
  });

  it('leaves a missing target for question preparation instead of rebuilding on modal close', async () => {
    const quest = await renderFreshQuest();
    const modal = quest.root.querySelector('#softModal');
    const originalFocusTarget = quest.root.querySelector('#Q1 .screen-reader-focus');

    vi.clearAllTimers();
    originalFocusTarget.remove();
    modal.dispatchEvent(new Event('hidden.bs.modal'));
    await vi.advanceTimersByTimeAsync(100);

    expect(quest.root.querySelector('#Q1 .screen-reader-focus')).toBeNull();
    expect(document.activeElement).not.toBe(originalFocusTarget);
  });
});
