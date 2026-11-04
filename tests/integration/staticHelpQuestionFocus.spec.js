import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readLockedMarkdown, treeAt } from '../e2e/support/corpus.js';
import { renderFreshQuest } from '../helpers/questRuntime.js';

const normalize = (text) => text.replace(/\s+/g, ' ').trim();
const promptTargetSelector = 'span.screen-reader-focus[data-question-prompt-focus]';
const localizedPrompts = {
  en: {
    freckles: 'How many freckles do you have on your back and shoulders now? Please see the pictures below for examples.',
    regularBasis: 'How old were you when you started smoking cigarettes on a regular basis?',
  },
};

async function renderLockedQuestion(questionId, locale = 'en', module = 'module3') {
  return renderFreshQuest({
    markdown: readLockedMarkdown(module, locale),
    persistedData: {
      D_947205597: ['712653855'],
      D_391951010_1_1: '223216393',
      treeJSON: treeAt(questionId),
    },
    previousResults: { age: '45' },
    params: { lang: locale },
  });
}

function questionParts(quest) {
  const form = quest.root.querySelector('form.question.active');
  const fieldset = form.querySelector(':scope > fieldset');
  return {
    form,
    fieldset,
    legend: fieldset.querySelector(':scope > legend.question-text'),
    helper: form.querySelector('span.screen-reader-focus'),
  };
}

function expectStaticPromptTarget({ form, fieldset, legend, helper }, expectedPrompt, locale) {
  expect(helper).not.toBeNull();
  expect(helper.matches(promptTargetSelector)).toBe(true);
  expect(helper.parentElement).toBe(form);
  expect(helper.nextElementSibling).toBe(fieldset);
  expect(helper.tabIndex).toBe(-1);
  expect(helper.getAttribute('lang')).toBe(locale);
  expect(helper.textContent).toBe(expectedPrompt);
  expect(normalize(legend.textContent)).toBe(expectedPrompt);
  expect(form.querySelectorAll('span.screen-reader-focus')).toHaveLength(1);
}

describe('static inline-help question focus', () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('uses the full locked mixed-control prompt for participant focus without changing its legend', async () => {
    vi.useFakeTimers();
    document.documentElement.lang = 'es';
    const quest = await renderLockedQuestion('D_790436165');
    const parts = questionParts(quest);

    expect(quest.rendered).toBe(true);
    expectStaticPromptTarget(parts, localizedPrompts.en.regularBasis, 'en');
    expect(document.documentElement.lang).toBe('es');
    expect(parts.fieldset.querySelector('input[type="number"]')).not.toBeNull();
    expect(parts.fieldset.querySelector('input[type="checkbox"]')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(20);
    expect(document.activeElement).toBe(parts.helper);
    expect(quest.errors).toEqual([]);
  });

  it('retains existing focus behavior when help is only in a response label', async () => {
    vi.useFakeTimers();
    const quest = await renderLockedQuestion('D_857219333');
    const { form, fieldset, legend, helper } = questionParts(quest);

    expect(form.querySelector(promptTargetSelector)).toBeNull();
    expect(fieldset.contains(helper)).toBe(true);
    expect(helper.textContent).toBe('');
    expect(legend.querySelector('[data-bs-toggle="popover"]')).toBeNull();
    expect(fieldset.querySelector('.response [data-bs-toggle="popover"]')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(20);
    expect(document.activeElement).toBe(helper);
    expect(quest.errors).toEqual([]);
  });

  it('leaves renderer-mode question focus construction unchanged', async () => {
    const quest = await renderFreshQuest({
      markdown: readFileSync(join(import.meta.dirname, '../fixtures/canonical/popoverHelp.txt'), 'utf8'),
      params: { isRenderer: true },
    });
    const { form, fieldset, legend, helper } = questionParts(quest);

    expect(legend.querySelector('[data-bs-toggle="popover"]')).not.toBeNull();
    expect(form.querySelector(promptTargetSelector)).toBeNull();
    expect(fieldset.contains(helper)).toBe(true);
    expect(helper.textContent).toBe('');
    expect(quest.errors).toEqual([]);
  });

  it('clears the copied prompt when its legend becomes conditional and can reuse the target afterward', async () => {
    vi.useFakeTimers();
    const quest = await renderLockedQuestion('D_352986465');
    const original = questionParts(quest);
    const { prepareQuestionDOM } = await import('../../questionnaire.js');
    await vi.advanceTimersByTimeAsync(20);
    const conditional = document.createElement('span');
    conditional.className = 'displayif';
    conditional.setAttribute('displayif', '1 == 2');
    conditional.append(original.legend.firstChild);
    original.legend.prepend(conditional);

    await prepareQuestionDOM(original.form);
    const fallback = questionParts(quest);
    expect(fallback.helper).toBe(original.helper);
    expect(original.form.querySelectorAll('span.screen-reader-focus')).toHaveLength(1);
    expect(fallback.helper.hasAttribute('data-question-prompt-focus')).toBe(false);
    expect(fallback.helper.textContent).toBe('');
    expect(fallback.fieldset.contains(fallback.helper)).toBe(true);
    expect(conditional.style.display).toBe('none');

    conditional.replaceWith(...conditional.childNodes);
    await prepareQuestionDOM(original.form);
    expect(questionParts(quest).helper).toBe(original.helper);
    expectStaticPromptTarget(questionParts(quest), localizedPrompts.en.freckles, 'en');
  });

  it.each([
    'class-styled hidden formatting',
    'a help-button accessible-name override',
    'a stylesheet-hidden bare fragment',
  ])('returns a prepared real prompt to its original target for %s', async (variant) => {
    vi.useFakeTimers();
    const quest = await renderLockedQuestion('D_352986465');
    const original = questionParts(quest);
    expect(original.helper.matches(promptTargetSelector)).toBe(true);
    const { prepareQuestionDOM } = await import('../../questionnaire.js');
    const trigger = original.legend.querySelector('[data-bs-toggle="popover"]');
    let stylesheet;

    try {
      if (variant === 'a help-button accessible-name override') {
        trigger.setAttribute('aria-label', trigger.getAttribute('aria-description'));
      } else {
        const fragment = document.createElement('span');
        fragment.append(original.legend.firstChild);
        original.legend.prepend(fragment);
        stylesheet = document.createElement('style');
        if (variant === 'class-styled hidden formatting') {
          fragment.className = 'static-help-hidden';
          stylesheet.textContent = '.static-help-hidden { visibility: hidden; }';
        } else {
          // The fragment itself has no class, ID, or inline hiding attribute.
          stylesheet.textContent = '#D_352986465 > fieldset > legend.question-text > span:not(.screen-reader-focus) { display: none; }';
        }
        document.head.append(stylesheet);
        const computed = window.getComputedStyle(fragment);
        if (variant === 'class-styled hidden formatting') {
          expect(computed.visibility).toBe('hidden');
        } else {
          expect(fragment.attributes).toHaveLength(0);
          expect(computed.display).toBe('none');
        }
      }

      await prepareQuestionDOM(original.form);
      const fallback = questionParts(quest);
      expect(fallback.helper).toBe(original.helper);
      expect(fallback.form.querySelectorAll('span.screen-reader-focus')).toHaveLength(1);
      expect(fallback.form.querySelector(promptTargetSelector)).toBeNull();
      expect(fallback.helper.textContent).toBe('');
      expect(fallback.fieldset.contains(fallback.helper)).toBe(true);
      expect(fallback.legend.querySelector('[data-bs-toggle="popover"]')).toBe(trigger);
      expect(quest.errors).toEqual([]);
    } finally {
      stylesheet?.remove();
    }
  });

  it.each([
    ['module2', 'D_486574018_1_1'],
    ['module4', 'D_311891586'],
  ])('does not copy hidden or response-dependent wording from locked %s question %s', async (module, questionId) => {
    vi.useFakeTimers();
    const quest = await renderLockedQuestion(questionId, 'en', module);
    const { form, fieldset, legend, helper } = questionParts(quest);

    expect(legend.querySelector('[data-bs-toggle="popover"]')).not.toBeNull();
    expect(legend.querySelector('.displayif, [forid]')).not.toBeNull();
    expect(form.querySelector(promptTargetSelector)).toBeNull();
    expect(helper.textContent).toBe('');
    expect(fieldset.contains(helper)).toBe(true);
  });

  it('does not copy the profile-dependent locked English Module 1 introduction', async () => {
    vi.useFakeTimers();
    const quest = await renderLockedQuestion('INTROM1', 'en', 'module1');
    const { form, fieldset, legend, helper } = questionParts(quest);

    expect(legend.querySelector('[data-bs-toggle="popover"]')).not.toBeNull();
    expect(legend.querySelector('span[name="firstName"]')).not.toBeNull();
    expect(form.querySelector(promptTargetSelector)).toBeNull();
    expect(fieldset.contains(helper)).toBe(true);
    expect(helper.textContent).toBe('');
    expect(quest.errors).toEqual([]);
  });

  it('keeps the original focus target for help markup loaded through an asynchronous question map', async () => {
    vi.useFakeTimers();
    const fetchAsyncQuestion = vi.fn(async () => {
      const fieldset = document.querySelector('#D_352986465 > fieldset');
      const loadedMarkup = fieldset.innerHTML;
      fieldset.replaceChildren();
      await Promise.resolve();
      fieldset.innerHTML = loadedMarkup;
    });
    const quest = await renderFreshQuest({
      markdown: readFileSync(join(import.meta.dirname, '../fixtures/canonical/popoverHelp.txt'), 'utf8'),
      params: {
        asyncQuestionsMap: {
          '[D_352986465?]': { func: 'loadQuestion', args: [] },
        },
        fetchAsyncQuestion,
      },
    });
    await vi.advanceTimersByTimeAsync(20);
    const { form, fieldset, legend, helper } = questionParts(quest);

    expect(fetchAsyncQuestion).toHaveBeenCalledOnce();
    expect(legend.querySelector('[data-bs-toggle="popover"]')).not.toBeNull();
    expect(form.querySelector(promptTargetSelector)).toBeNull();
    expect(fieldset.contains(helper)).toBe(true);
    expect(helper.textContent).toBe('');
    expect(document.activeElement).toBe(helper);
    expect(quest.errors).toEqual([]);
  });

  it('does not replace native compound-question focus when its instruction contains help', async () => {
    vi.useFakeTimers();
    const compound = readFileSync(join(import.meta.dirname, '../fixtures/canonical/compoundRadioGroups.txt'), 'utf8');
    const markdown = compound.replace('each activity', 'each |popup|activity|Help title|Synthetic help text|');
    const quest = await renderFreshQuest({ markdown });
    const { form, fieldset, helper } = questionParts(quest);

    expect(fieldset.querySelectorAll('fieldset.compound-radio-group')).toHaveLength(2);
    expect(fieldset.querySelector('legend [data-bs-toggle="popover"]')).not.toBeNull();
    expect(form.querySelector(promptTargetSelector)).toBeNull();
    expect(fieldset.contains(helper)).toBe(true);
    expect(helper.textContent).toBe('');
    expect(quest.errors).toEqual([]);
  });

  it('does not copy an ambiguous compound prompt whose follow-up uses the same radio name', async () => {
    vi.useFakeTimers();
    const compound = readFileSync(join(import.meta.dirname, '../fixtures/canonical/compoundRadioGroups.txt'), 'utf8');
    const markdown = compound
      .replace('each activity', 'each |popup|activity|Help title|Synthetic help text|')
      .replace('(1:WALK)', '(4:MEAL)')
      .replace('(2:WALK)', '(5:MEAL)')
      .replace('(3:WALK)', '(6:MEAL)');
    const quest = await renderFreshQuest({ markdown });
    const { form, fieldset, legend, helper } = questionParts(quest);

    expect(new Set([...fieldset.querySelectorAll('input[type="radio"]')].map(({ name }) => name)).size).toBe(1);
    expect(fieldset.querySelector('[role="alert"][tabindex="0"]')).not.toBeNull();
    expect(legend.querySelector('[data-bs-toggle="popover"]')).not.toBeNull();
    expect(form.querySelector(promptTargetSelector)).toBeNull();
    expect(fieldset.contains(helper)).toBe(true);
    expect(helper.textContent).toBe('');
    expect(quest.errors).toEqual([]);
  });
});
