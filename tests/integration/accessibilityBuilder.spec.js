import { afterEach, describe, expect, it, vi } from 'vitest';
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
    expect(fieldset.querySelector('.screen-reader-focus').tabIndex).toBe(-1);
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

  it('retains the first formatted fragment after a punctuated primary prompt', async () => {
    const { quest, accessibility } = await loadAccessibilityFixture(`
      <form class="question active" id="PUNCTUATED_MULTI_PROMPT">
        <fieldset>How severe is your fatigue?<b>Pain level:</b> Are you experiencing pain?<div class="response"><input id="PUNCTUATED_MULTI_PROMPT_1"></div></fieldset>
      </form>
    `);
    const fieldset = quest.root.querySelector('fieldset');

    accessibility.manageAccessibleQuestion(fieldset, false);

    const legend = fieldset.querySelector(':scope > legend');
    const followUp = fieldset.querySelector(':scope > div[role="alert"][tabindex="0"]');
    expect(legend.textContent).toBe('How severe is your fatigue?');
    expect(followUp?.innerHTML).toContain('<b>Pain level:</b>');
    expect(followUp?.textContent).toContain('Pain level: Are you experiencing pain?');
    expect(fieldset.querySelectorAll('.response')).toHaveLength(1);
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
        <fieldset><legend>Hello <span forid="UNKNOWN_RESPONSE" optional="participant">old value</span></legend><span class="screen-reader-focus" tabindex="-1"></span><div class="response"><input></div></fieldset>
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

describe('accessible selection announcements and defensive paths', () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('announces table checkbox state without managing focus', async () => {
    vi.useFakeTimers();
    const { quest, accessibility } = await loadAccessibilityFixture(`
      <div id="ariaLiveSelectionAnnouncer"></div>
      <table><tbody><tr><th>Row</th>
        <td class="response"><label for="CHECK_1">First</label><input id="CHECK_1" type="checkbox" checked></td>
      </tr></tbody></table>
    `);
    const input = quest.root.querySelector('#CHECK_1');
    input.focus();
    accessibility.updateAriaLiveSelectionAnnouncerTable(input.closest('.response'));

    await vi.advanceTimersByTimeAsync(250);
    expect(quest.root.querySelector('#ariaLiveSelectionAnnouncer').textContent).toBe('First Selected.');
    expect(document.activeElement).toBe(input);
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
