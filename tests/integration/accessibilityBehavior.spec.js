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

  it('uses native list controls while adding Windows-specific refocus and announcements', async () => {
    const quest = await renderFreshQuest();
    quest.moduleParams.isWindowsEnvironment = true;
    const radio = quest.root.querySelector('#Q1_2');

    radio.click();
    radio.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

    await vi.advanceTimersByTimeAsync(100);
    expect(document.activeElement).toBe(radio);
    expect(quest.root.querySelector('#ariaLiveSelectionAnnouncer').textContent).toContain('Second answer Selected.');
  });

  it('moves the Windows table focus helper to the next visible row after a radio selection', async () => {
    const quest = await renderFreshQuest({
      markdown: GRID_SURVEY,
      persistedData: { treeJSON: treeAt('GRID') },
    });
    quest.moduleParams.isWindowsEnvironment = true;
    const firstRowChoice = quest.root.querySelector('#ROW_ONE_0');

    firstRowChoice.click();
    firstRowChoice.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

    const helper = quest.root.querySelector('#srFocusHelper');
    await vi.advanceTimersByTimeAsync(100);
    expect(document.activeElement).toBe(helper);
    expect(helper.closest('tr')?.dataset.questionId).toBe('ROW_TWO');
    expect(helper.parentElement.tagName).toBe('TH');
  });

  it('moves the Windows table focus helper to Next after the final row selection', async () => {
    const quest = await renderFreshQuest({
      markdown: GRID_SURVEY,
      persistedData: { treeJSON: treeAt('GRID') },
    });
    quest.moduleParams.isWindowsEnvironment = true;
    const finalRowChoice = quest.root.querySelector('#ROW_TWO_1');

    finalRowChoice.click();
    finalRowChoice.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

    const helper = quest.root.querySelector('#srFocusHelper');
    await vi.advanceTimersByTimeAsync(100);
    expect(document.activeElement).toBe(helper);
    expect(helper.closest('button')).toBe(quest.root.querySelector('#GRID .next'));
  });

  it('announces table selections without adding non-native selection commands on macOS paths', async () => {
    const quest = await renderFreshQuest({
      markdown: GRID_SURVEY,
      persistedData: { treeJSON: treeAt('GRID') },
    });
    quest.moduleParams.isWindowsEnvironment = false;
    const choice = quest.root.querySelector('#ROW_ONE_1');

    choice.click();
    choice.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.advanceTimersByTimeAsync(250);
    expect(quest.root.querySelector('#ariaLiveSelectionAnnouncer').textContent.trim()).toBe('Often Selected.');
    expect(choice.getAttribute('role')).toBeNull();
  });

  it('uses Up and Down only to leave nested text fields, without overriding radio native keys', async () => {
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
    secondText.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowUp' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(document.activeElement).toBe(fieldset.querySelector('#FIRST_RADIO'));

    firstText.focus();
    firstText.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowDown' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(document.activeElement).not.toBe(firstText);

    const radio = fieldset.querySelector('#SECOND_RADIO');
    radio.focus();
    const nativeArrow = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowDown' });
    radio.dispatchEvent(nativeArrow);
    expect(nativeArrow.defaultPrevented).toBe(false);
  });

  it('reconstructs and restores question focus after closing the soft-response modal', async () => {
    const quest = await renderFreshQuest();
    const modal = quest.root.querySelector('#softModal');
    const focusTarget = quest.root.querySelector('#Q1 .screen-reader-focus');

    // The initial render already schedules a 500 ms focus. Remove it so a
    // passing assertion proves the close handler's 100 ms + 500 ms chain.
    vi.clearAllTimers();
    expect(document.activeElement).not.toBe(focusTarget);
    modal.style.display = 'block';

    modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(modal.style.display).toBe('none');
    await vi.advanceTimersByTimeAsync(100);
    expect(document.activeElement).not.toBe(focusTarget);
    await vi.advanceTimersByTimeAsync(500);
    expect(document.activeElement).toBe(focusTarget);
    expect(quest.root.querySelectorAll('#Q1 .screen-reader-focus')).toHaveLength(1);
  });
});
