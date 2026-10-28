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

  it.each([
    ['textarea', '<textarea id="DETAILS" aria-label="Details"></textarea>', '#DETAILS'],
    ['select', '<select id="STATE" aria-label="State"><option>Maryland</option></select>', '#STATE'],
  ])('keeps a standalone %s after the question focus boundary', async (_, controlMarkup, selector) => {
    const { quest, accessibility } = await loadAccessibilityFixture(`
      <form class="question active" id="STANDALONE_CONTROL">
        <fieldset>Describe the response.${controlMarkup}</fieldset>
      </form>
    `);
    const fieldset = quest.root.querySelector('fieldset');

    accessibility.manageAccessibleQuestion(fieldset, false);

    const legend = fieldset.querySelector(':scope > legend');
    const focusTarget = fieldset.querySelector(':scope > .screen-reader-focus');
    const control = fieldset.querySelector(selector);
    expect(legend.contains(control)).toBe(false);
    expect(focusTarget.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  it('uses separate native fieldset legends for static compound radio subgroups', async () => {
    const { quest, accessibility } = await loadAccessibilityFixture(`
      <form class="question active" id="COMPOUND_RADIOS">
        <fieldset>
          For each activity, choose one answer.<br>How difficult are household chores?
          <div class="response"><input type="radio" id="CHORES_1" name="CHORES" value="1"><label for="CHORES_1">No difficulty</label></div>
          <div class="response"><input type="radio" id="CHORES_2" name="CHORES" value="2"><label for="CHORES_2">Some difficulty</label></div>
          How difficult is climbing stairs?<br>
          <div class="response"><input type="radio" id="STAIRS_1" name="STAIRS" value="1"><label for="STAIRS_1">No difficulty</label></div>
          <div class="response"><input type="radio" id="STAIRS_2" name="STAIRS" value="2"><label for="STAIRS_2">Some difficulty</label></div>
        </fieldset>
      </form>
    `);
    const fieldset = quest.root.querySelector('fieldset');

    accessibility.manageAccessibleQuestion(fieldset, false);
    accessibility.manageAccessibleQuestion(fieldset, false);

    const outerLegend = fieldset.querySelector(':scope > legend.question-text');
    const focusTarget = fieldset.querySelector(':scope > .screen-reader-focus');
    const groups = [...fieldset.querySelectorAll(':scope > fieldset.compound-radio-group')];
    expect(outerLegend.textContent.trim()).toBe('For each activity, choose one answer.');
    expect(focusTarget.compareDocumentPosition(groups[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => [...new Set(
      [...group.querySelectorAll('input[type="radio"]')].map(({ name }) => name),
    )])).toEqual([['CHORES'], ['STAIRS']]);

    const [choresGroup, stairsGroup] = groups;
    const choresPrompt = choresGroup.querySelector(':scope > legend');
    const stairsPrompt = stairsGroup.querySelector(':scope > legend');
    expect(choresPrompt.textContent.trim()).toBe('How difficult are household chores?');
    expect(stairsPrompt.textContent.trim()).toBe('How difficult is climbing stairs?');
    expect(groups.every((group) => !group.hasAttribute('role'))).toBe(true);
    expect(groups.every((group) => !group.hasAttribute('aria-label'))).toBe(true);
    expect(groups.every((group) => !group.hasAttribute('aria-labelledby'))).toBe(true);
    expect(fieldset.querySelectorAll('[role="alert"], [tabindex="0"]')).toHaveLength(0);

    expect(fieldset.querySelector('#CHORES_1').labels[0].textContent).toBe('No difficulty');
    expect(fieldset.querySelector('#STAIRS_2').labels[0].textContent).toBe('Some difficulty');
    expect(fieldset.querySelectorAll('[id="COMPOUND_RADIOS-compound-radio-CHORES-label"]')).toHaveLength(1);
    expect(fieldset.querySelectorAll('[id="COMPOUND_RADIOS-compound-radio-STAIRS-label"]')).toHaveLength(1);
    expect(choresGroup.querySelector('#CHORES_1').closest('fieldset')).toBe(choresGroup);
    expect(stairsGroup.querySelector('#STAIRS_1').closest('fieldset')).toBe(stairsGroup);
  });

  it('leaves an ambiguous repeated-name compound form ungrouped without splitting its outer legend', async () => {
    const { quest, accessibility } = await loadAccessibilityFixture(`
      <form class="question active" id="AMBIGUOUS_STATIC_RADIOS">
        <fieldset>
          Choose one answer for each activity.<br>Can you prepare a meal?
          <div class="response"><input type="radio" id="MEAL_1" name="MEAL" value="1"><label for="MEAL_1">Yes</label></div>
          Can you walk for 15 minutes?<br>
          <div class="response"><input type="radio" id="WALK_1" name="WALK" value="1"><label for="WALK_1">Yes</label></div>
          Duplicate meal group?<br>
          <div class="response"><input type="radio" id="MEAL_2" name="MEAL" value="2"><label for="MEAL_2">No</label></div>
        </fieldset>
      </form>
    `);
    const fieldset = quest.root.querySelector('fieldset');

    accessibility.manageAccessibleQuestion(fieldset, false);

    const outerLegend = fieldset.querySelector(':scope > legend.question-text');
    expect(outerLegend.textContent).toContain('Choose one answer for each activity.');
    expect(outerLegend.textContent).toContain('Can you prepare a meal?');
    expect(fieldset.querySelectorAll(':scope > .response')).toHaveLength(3);
    expect(fieldset.querySelectorAll('.compound-radio-group')).toHaveLength(0);
    expect(fieldset.querySelectorAll('[role="radiogroup"]')).toHaveLength(0);
  });

  it('leaves ordinary single-group radio questions structurally unchanged', async () => {
    const { quest, accessibility } = await loadAccessibilityFixture(`
      <form class="question active" id="SINGLE_RADIOS">
        <fieldset>Choose one answer.
          <div class="response"><input type="radio" id="SINGLE_1" name="SINGLE" value="1"><label for="SINGLE_1">One</label></div>
          <div class="response"><input type="radio" id="SINGLE_2" name="SINGLE" value="2"><label for="SINGLE_2">Two</label></div>
        </fieldset>
      </form>
    `);
    const fieldset = quest.root.querySelector('fieldset');

    accessibility.manageAccessibleQuestion(fieldset, false);

    expect(fieldset.querySelectorAll('[role="radiogroup"]')).toHaveLength(0);
    expect(fieldset.querySelectorAll(':scope > .response')).toHaveLength(2);
  });

  it('labels conditional compound radio subgroups without reparenting responses', async () => {
    const { quest, accessibility } = await loadAccessibilityFixture(`
      <form class="question active" id="CONDITIONAL_COMPOUND_RADIOS">
        <fieldset>How long does each visible trip take?<br>
          <span class="displayif" displayif="1 == 1" style="display: block">Car duration?</span><br>
          <div class="response" displayif="1 == 1" style="display: block"><input type="radio" id="CAR_1" name="CAR" value="1"><label for="CAR_1">Under 15 minutes</label></div>
          <div class="response" displayif="1 == 1" style="display: block"><input type="radio" id="CAR_2" name="CAR" value="2"><label for="CAR_2">15 minutes or more</label></div>
          <span class="displayif" displayif="1 == 2" style="display: none">Walking duration?</span><br>
          <div class="response" displayif="1 == 2" style="display: none"><input type="radio" id="WALK_1" name="WALK" value="1"><label for="WALK_1">Under 15 minutes</label></div>
          <div class="response" displayif="1 == 2" style="display: none"><input type="radio" id="WALK_2" name="WALK" value="2"><label for="WALK_2">15 minutes or more</label></div>
        </fieldset>
      </form>
    `);
    const fieldset = quest.root.querySelector('fieldset');

    accessibility.manageAccessibleQuestion(fieldset, false);
    const initialCarPrompt = fieldset.querySelector('[role="radiogroup"]');
    expect(initialCarPrompt.getAttribute('aria-label')).toBe('Car duration?');
    initialCarPrompt.textContent = 'Updated car duration?';
    accessibility.manageAccessibleQuestion(fieldset, false);

    const groups = [...fieldset.querySelectorAll('[role="radiogroup"]')];
    expect(groups).toHaveLength(2);
    expect(fieldset.querySelectorAll(':scope > .response')).toHaveLength(4);
    expect(fieldset.querySelectorAll(':scope > .compound-radio-group')).toHaveLength(0);

    const [carPrompt, walkingPrompt] = groups;
    expect(carPrompt.textContent).toBe('Updated car duration?');
    expect(walkingPrompt.textContent).toBe('Walking duration?');
    expect(carPrompt.getAttribute('aria-label')).toBe('Updated car duration?');
    expect(walkingPrompt.getAttribute('aria-label')).toBe('Walking duration?');
    expect(carPrompt.getAttribute('aria-owns')).toBe('CAR_1 CAR_2');
    expect(walkingPrompt.getAttribute('aria-owns')).toBe('WALK_1 WALK_2');
    expect(carPrompt.hasAttribute('tabindex')).toBe(false);
    expect(walkingPrompt.hasAttribute('tabindex')).toBe(false);

    expect(fieldset.querySelector('#CAR_1').closest('.response').parentElement).toBe(fieldset);
    expect(fieldset.querySelector('#WALK_1').closest('.response').parentElement).toBe(fieldset);

    for (const radio of fieldset.querySelectorAll('input[type="radio"]')) {
      expect(radio.hasAttribute('aria-label')).toBe(false);
      expect(radio.hasAttribute('aria-labelledby')).toBe(false);
      expect(radio.labels).toHaveLength(1);
    }
  });

  it('does not partially annotate an ambiguous conditional compound form', async () => {
    const { quest, accessibility } = await loadAccessibilityFixture(`
      <form class="question active" id="AMBIGUOUS_CONDITIONAL_RADIOS">
        <fieldset>How long does each visible trip take?<br>
          <span class="displayif" displayif="1 == 1" style="display: block">Car duration?</span><br>
          <div class="response" displayif="1 == 1" style="display: block"><input type="radio" id="CAR_BAD_1" name="CAR_BAD" value="1"><label for="CAR_BAD_1">Under 15 minutes</label></div>
          <div class="response" displayif="1 == 1" style="display: block"><input type="radio" id="CAR_BAD_2" name="CAR_BAD" value="2"><label for="CAR_BAD_2">15 minutes or more</label></div>
          <span class="displayif" displayif="1 == 2" style="display: none">Walking duration?</span><br>
          <div class="response" displayif="1 == 2" style="display: none"><input type="radio" id="WALK_BAD_1" name="WALK_BAD" value="1"><label for="WALK_BAD_1">Under 15 minutes</label></div>
          <div class="response" displayif="1 == 3" style="display: none"><input type="radio" id="WALK_BAD_2" name="WALK_BAD" value="2"><label for="WALK_BAD_2">15 minutes or more</label></div>
        </fieldset>
      </form>
    `);
    const fieldset = quest.root.querySelector('fieldset');

    accessibility.manageAccessibleQuestion(fieldset, false);

    expect(fieldset.querySelectorAll('[role="radiogroup"]')).toHaveLength(0);
    expect(fieldset.querySelectorAll('[aria-owns]')).toHaveLength(0);
    expect(fieldset.querySelectorAll(':scope > .response')).toHaveLength(4);
  });

  it('does not publish conditional ownership references for duplicate radio IDs', async () => {
    const { quest, accessibility } = await loadAccessibilityFixture(`
      <form class="question active" id="DUPLICATE_CONDITIONAL_RADIOS">
        <fieldset>How long does each visible trip take?<br>
          <span class="displayif" displayif="1 == 1" style="display: block">Car duration?</span><br>
          <div class="response" displayif="1 == 1" style="display: block"><input type="radio" id="DUPLICATE_1" name="CAR_DUPLICATE" value="1"><label for="DUPLICATE_1">Under 15 minutes</label></div>
          <div class="response" displayif="1 == 1" style="display: block"><input type="radio" id="CAR_DUPLICATE_2" name="CAR_DUPLICATE" value="2"><label for="CAR_DUPLICATE_2">15 minutes or more</label></div>
          <span class="displayif" displayif="1 == 2" style="display: none">Walking duration?</span><br>
          <div class="response" displayif="1 == 2" style="display: none"><input type="radio" id="DUPLICATE_1" name="WALK_DUPLICATE" value="1"><label for="DUPLICATE_1">Under 15 minutes</label></div>
          <div class="response" displayif="1 == 2" style="display: none"><input type="radio" id="WALK_DUPLICATE_2" name="WALK_DUPLICATE" value="2"><label for="WALK_DUPLICATE_2">15 minutes or more</label></div>
        </fieldset>
      </form>
    `);
    const fieldset = quest.root.querySelector('fieldset');

    accessibility.manageAccessibleQuestion(fieldset, false);

    expect(fieldset.querySelectorAll('[role="radiogroup"]')).toHaveLength(0);
    expect(fieldset.querySelectorAll('[aria-owns]')).toHaveLength(0);
    expect(fieldset.querySelectorAll(':scope > .response')).toHaveLength(4);
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

  it.each([
    {
      description: 'list',
      delay: 100,
      markup: `
        <div id="ariaLiveSelectionAnnouncer"></div>
        <div class="response"><label for="LIST_1">First</label><input id="LIST_1" type="radio" checked></div>
      `,
      update: (accessibility, response) => accessibility.updateAriaLiveSelectionAnnouncer(response),
    },
    {
      description: 'table',
      delay: 250,
      markup: `
        <div id="ariaLiveSelectionAnnouncer"></div>
        <table><tbody><tr><td class="response"><label for="TABLE_1">First</label><input id="TABLE_1" type="checkbox" checked></td></tr></tbody></table>
      `,
      update: (accessibility, response) => accessibility.updateAriaLiveSelectionAnnouncerTable(response),
    },
  ])('cancels a pending $description announcement when the lifecycle is cleared', async ({ delay, markup, update }) => {
    vi.useFakeTimers();
    const { quest, accessibility } = await loadAccessibilityFixture(markup);
    const liveRegion = quest.root.querySelector('#ariaLiveSelectionAnnouncer');

    update(accessibility, quest.root.querySelector('.response'));
    accessibility.clearSelectionAnnouncement();
    await vi.advanceTimersByTimeAsync(delay);

    expect(liveRegion.textContent).toBe('');
  });

  it('publishes only the latest response during rapid successive selections', async () => {
    vi.useFakeTimers();
    const { quest, accessibility } = await loadAccessibilityFixture(`
      <div id="ariaLiveSelectionAnnouncer"></div>
      <div class="response" id="FIRST_RESPONSE"><label for="FIRST_1">First</label><input id="FIRST_1" type="radio" checked></div>
      <div class="response" id="SECOND_RESPONSE"><label for="SECOND_1">Second</label><input id="SECOND_1" type="radio" checked></div>
    `);
    const liveRegion = quest.root.querySelector('#ariaLiveSelectionAnnouncer');

    accessibility.updateAriaLiveSelectionAnnouncer(quest.root.querySelector('#FIRST_RESPONSE'));
    await vi.advanceTimersByTimeAsync(50);
    accessibility.updateAriaLiveSelectionAnnouncer(quest.root.querySelector('#SECOND_RESPONSE'));

    await vi.advanceTimersByTimeAsync(50);
    expect(liveRegion.textContent).toBe('');

    await vi.advanceTimersByTimeAsync(50);
    expect(liveRegion.textContent).toBe('Second Selected.');
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
