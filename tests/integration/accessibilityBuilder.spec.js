import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderFreshQuest } from '../helpers/questRuntime.js';

async function loadAccessibilityFixture(markup) {
  const quest = await renderFreshQuest();
  quest.moduleParams.isRenderer = true;
  quest.root.innerHTML = markup;
  const accessibility = await import('../../accessibleQuestionTextBuilder.js');
  return { quest, accessibility };
}

describe('accessible question text construction', () => {
  it('builds a legend for heading-style prompts and normalizes excessive breaks', async () => {
    const { quest, accessibility } = await loadAccessibilityFixture(`
      <form class="question active" id="HEADING">
        <fieldset><b>Section heading</b><br><br><br>Choose an answer.<div class="response"><input id="HEADING_1"><label for="HEADING_1">One</label></div></fieldset>
      </form>
    `);
    const fieldset = quest.root.querySelector('fieldset');

    expect(accessibility.manageAccessibleQuestion(fieldset, false)).toBe(true);

    const legend = fieldset.querySelector('legend');
    expect(legend.textContent).toContain('Section heading');
    expect(legend.textContent).toContain('Choose an answer.');
    expect(fieldset.querySelectorAll('.screen-reader-focus')).toHaveLength(1);
    expect([...fieldset.querySelectorAll('br')].every((br) => br.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(fieldset.querySelectorAll('br').length).toBeLessThanOrEqual(3);
  });

  it('turns subsequent prompts in a multi-question fieldset into focusable alerts', async () => {
    const { quest, accessibility } = await loadAccessibilityFixture(`
      <form class="question active" id="MULTI">
        <fieldset>Introductory prompt.<div class="response"><input id="MULTI_1"></div>
          Follow-up <b>question?</b><br><div class="response"><input id="MULTI_2"></div>
        </fieldset>
      </form>
    `);
    const fieldset = quest.root.querySelector('fieldset');

    accessibility.manageAccessibleQuestion(fieldset, false);

    const followUp = fieldset.querySelector('div[role="alert"][tabindex="0"]');
    expect(followUp).not.toBeNull();
    expect(followUp.textContent).toContain('Follow-up question?');
    expect(fieldset.querySelectorAll('.response')).toHaveLength(2);
  });

  it('creates a fieldset around table questions that do not originally have one', async () => {
    const { quest, accessibility } = await loadAccessibilityFixture(`
      <form class="question active" id="TABLE_QUESTION">
        Rate each item.
        <table><tbody><tr><th>Item</th><td class="response"><input type="radio" id="TABLE_1"><label for="TABLE_1">Often</label></td></tr></tbody></table>
      </form>
    `);
    const question = quest.root.querySelector('.question');

    accessibility.manageAccessibleQuestion(question, false);

    const fieldset = question.querySelector('fieldset');
    expect(fieldset).not.toBeNull();
    expect(fieldset.querySelector('legend').textContent).toContain('Rate each item.');
    expect(fieldset.querySelector('table')).not.toBeNull();
    expect(fieldset.querySelector('.screen-reader-focus')).not.toBeNull();
  });

  it('re-evaluates legend display conditions and cleans hidden conditional whitespace', async () => {
    const { quest, accessibility } = await loadAccessibilityFixture(`
      <form class="question active" id="DYNAMIC">
        <fieldset>
          <legend>Review <span class="displayif" displayif="1 == 1">visible</span>   <span class="displayif" displayif="1 == 2">hidden</span></legend>
          <span class="displayif" style="display: block">outside detail</span><br>
          <span class="displayif" style="display: none">hidden detail</span><br><span>Next detail</span>
          <span class="response" displayif="1 == 2" style="display: none"></span>   hidden response spacing
        </fieldset>
      </form>
    `);
    const fieldset = quest.root.querySelector('fieldset');

    accessibility.manageAccessibleQuestion(fieldset, false);

    const displayIfs = fieldset.querySelectorAll('legend .displayif');
    expect(displayIfs[0].style.display).toBe('');
    expect(displayIfs[1].style.display).toBe('none');
    expect(fieldset.querySelector('legend').textContent).not.toMatch(/ {3}/);
    expect(fieldset.querySelector('.displayif[style*="display: block"]').getAttribute('hasupdate')).toBe('true');
    expect(fieldset.querySelector('.displayif[style*="display: none"] + br').style.display).toBe('none');
  });

  it('updates a raw forid in an existing legend and avoids rebuilding focus controls', async () => {
    const { quest, accessibility } = await loadAccessibilityFixture(`
      <form class="question active" id="FORID">
        <fieldset><legend>Hello <span forid="UNKNOWN_RESPONSE" optional="participant">old value</span></legend><span class="screen-reader-focus" tabindex="0"></span><div class="response"><input></div></fieldset>
      </form>
    `);
    const fieldset = quest.root.querySelector('fieldset');

    accessibility.manageAccessibleQuestion(fieldset, false);
    accessibility.manageAccessibleQuestion(fieldset, false);

    expect(fieldset.querySelector('[forid]').textContent).toBe('participant');
    expect(fieldset.querySelectorAll('.screen-reader-focus')).toHaveLength(1);
  });

  it('applies and idempotently records the pregnancy-summary spacing exception', async () => {
    const { quest, accessibility } = await loadAccessibilityFixture(`
      <form class="question active" id="PREGSUMMARY_SUM">
        <fieldset>Pregnancy summary.<div class="response"></div>Age when pregnancy began: 30<br><br><br></fieldset>
      </form>
    `);
    const fieldset = quest.root.querySelector('fieldset');

    accessibility.manageAccessibleQuestion(fieldset, false);
    const breakCount = fieldset.querySelectorAll('br').length;
    accessibility.manageAccessibleQuestion(fieldset, false);

    expect(fieldset.getAttribute('data-preg-summary-updated')).toBe('true');
    expect(fieldset.querySelectorAll('br')).toHaveLength(breakCount);
  });
});

describe('accessible selection focus and defensive paths', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('keeps focus on a non-final table checkbox and announces its state', async () => {
    const { quest, accessibility } = await loadAccessibilityFixture(`
      <div class="question active"><button class="next">Next</button></div>
      <span id="srFocusHelper" tabindex="0"></span><div id="ariaLiveSelectionAnnouncer"></div>
      <table><tbody><tr><th>Row</th>
        <td class="response"><label for="CHECK_1">First</label><input id="CHECK_1" type="checkbox" checked></td>
        <td class="response"><label for="CHECK_2">Second</label><input id="CHECK_2" type="checkbox"></td>
      </tr></tbody></table>
    `);
    const input = quest.root.querySelector('#CHECK_1');
    const event = { target: input, type: 'change', preventDefault: vi.fn() };

    accessibility.handleRadioCheckboxTableEvents(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(100);
    expect(document.activeElement).toBe(quest.root.querySelector('#srFocusHelper'));
    expect(document.activeElement.closest('td')).toBe(input.closest('td'));
    await vi.advanceTimersByTimeAsync(150);
    expect(quest.root.querySelector('#ariaLiveSelectionAnnouncer').textContent).toBe('First Selected.');
  });

  it('moves focus from the final table checkbox to the active question Next button', async () => {
    const { quest, accessibility } = await loadAccessibilityFixture(`
      <div class="question active"><button class="next">Next</button></div>
      <span id="srFocusHelper" tabindex="0"></span><div id="ariaLiveSelectionAnnouncer"></div>
      <table><tbody><tr><th>Row</th><td class="response"><label for="FINAL">Final</label><input id="FINAL" type="checkbox"></td></tr></tbody></table>
    `);

    accessibility.handleRadioCheckboxTableEvents({
      target: quest.root.querySelector('#FINAL'),
      type: 'change',
      preventDefault: vi.fn(),
    });

    const helper = quest.root.querySelector('#srFocusHelper');
    await vi.advanceTimersByTimeAsync(100);
    expect(document.activeElement).toBe(helper);
    expect(helper.closest('button')).toBe(quest.root.querySelector('button.next'));
  });

  it('logs invalid table inputs and missing focus targets without throwing', async () => {
    const { quest, accessibility } = await loadAccessibilityFixture(`
      <span id="srFocusHelper" tabindex="0"></span>
      <table><tbody>
        <tr><th>First</th><td class="response"><input id="BAD" type="text"><input id="RADIO" type="radio"></td></tr>
        <tr><td class="response"><input type="radio"></td></tr>
      </tbody></table>
    `);
    const invalid = quest.root.querySelector('#BAD');
    accessibility.handleRadioCheckboxTableEvents({ target: invalid, type: 'change', preventDefault: vi.fn() });
    expect(quest.errors.some(([message]) => message.includes('Invalid event type'))).toBe(true);

    accessibility.handleRadioCheckboxTableEvents({
      target: quest.root.querySelector('#RADIO'),
      type: 'change',
      preventDefault: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(quest.errors.some(([message]) => message.includes('Next question cell not found'))).toBe(true);

    quest.root.querySelector('#srFocusHelper').remove();
    accessibility.handleRadioCheckboxTableEvents({
      target: quest.root.querySelector('tr:last-child input'),
      type: 'change',
      preventDefault: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(quest.errors.some(([message]) => message.includes('Focus helper not found'))).toBe(true);
  });

  it('logs missing active-question and Next-button targets for final selections', async () => {
    const { quest, accessibility } = await loadAccessibilityFixture(`
      <span id="srFocusHelper" tabindex="0"></span>
      <table><tbody><tr><th>Only</th><td class="response"><input id="ONLY" type="radio"></td></tr></tbody></table>
    `);
    const event = { target: quest.root.querySelector('#ONLY'), type: 'change', preventDefault: vi.fn() };

    accessibility.handleRadioCheckboxTableEvents(event);
    await vi.advanceTimersByTimeAsync(100);
    expect(quest.errors.some(([message]) => message === 'Active question not found')).toBe(true);

    quest.root.insertAdjacentHTML('afterbegin', '<div class="question active"></div>');
    accessibility.handleRadioCheckboxTableEvents(event);
    await vi.advanceTimersByTimeAsync(100);
    expect(quest.errors.some(([message]) => message === 'Next question button not found')).toBe(true);
  });

  it('walks past non-response siblings when ArrowUp leaves a nested text field', async () => {
    const { quest, accessibility } = await loadAccessibilityFixture(`
      <div class="response"><button id="PREVIOUS" type="button">Previous</button></div><span>spacing</span><br>
      <div class="response"><button id="CURRENT" type="button">Current</button></div>
    `);
    const current = quest.root.querySelector('#CURRENT');
    current.focus();

    accessibility.handleUpDownArrowKeys({ key: 'ArrowUp', target: current, preventDefault: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    expect(document.activeElement).toBe(quest.root.querySelector('#PREVIOUS'));
  });

  it('returns safely when announcer dependencies are absent and clears an existing region', async () => {
    const { quest, accessibility } = await loadAccessibilityFixture('<div class="response"></div>');
    const response = quest.root.querySelector('.response');

    expect(() => accessibility.updateAriaLiveSelectionAnnouncer(response)).not.toThrow();
    expect(() => accessibility.updateAriaLiveSelectionAnnouncerTable(response)).not.toThrow();
    expect(() => accessibility.clearSelectionAnnouncement()).not.toThrow();

    quest.root.insertAdjacentHTML('beforeend', '<div id="ariaLiveSelectionAnnouncer">stale</div>');
    accessibility.clearSelectionAnnouncement();
    expect(quest.root.querySelector('#ariaLiveSelectionAnnouncer').textContent).toBe('');
  });
});
