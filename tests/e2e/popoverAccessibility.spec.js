import { fileURLToPath } from 'node:url';
import { test, expect } from './support/test.js';
import {
  activeQuestion,
  expectHealthyHarness,
  goBack,
  goNext,
  harnessSnapshot,
  openParticipant,
  waitInHarness,
} from './support/harness.js';
import { readLockedMarkdown, treeAt } from './support/corpus.js';

const DESKTOP_ENGINES = new Set([
  'chromium-desktop',
  'firefox-desktop',
  'webkit-desktop',
  'chromium-windows-ua',
]);

const POPOVER_MARKDOWN = `{"name":"TEST_POPOVER_A11Y"}

[PLAIN] Please read the following survey help.
|popup|More information|Help title|Synthetic help text|

[FOLLOWUP] Follow-up content.

[END,end] Complete.`;

const RESPONSE_POPOVER_MARKDOWN = `{"name":"TEST_RESPONSE_POPOVER_A11Y"}

[EYE_COLOR?] What is the natural color of your eyes?
(214997383) Blue
(696181630) |popup|Hazel|Informational Text|Hazel is a combination of green and brown.|
(941477699) Brown

[END,end] Complete.`;

const TITLELESS_POPOVER_MARKDOWN = `{"name":"TEST_TITLELESS_POPOVER_A11Y"}

[TITLELESS] Read |popup|this help|Titleless synthetic help text| before continuing.

[END,end] Complete.`;

const DUAL_POPOVER_MARKDOWN = `{"name":"TEST_DUAL_POPOVER_A11Y"}

[DUAL] Compare |popup|first help|First help title|First synthetic help body| with |popup|second help|Second help title|Second synthetic help body| before continuing.

[END,end] Complete.`;

const PRODUCTION_HELP = {
  en: {
    fixture: 'popoverHelp.txt',
    trigger: 'freckles',
    title: 'Informational Text',
    body: 'We are interested in freckling on the back and shoulders, not the face and arms. Your face and arms are more exposed to the sun and may have a different amount of freckling.',
    prompt: 'How many freckles do you have on your back and shoulders now? Please see the pictures below for examples.',
  },
  es: {
    fixture: 'popoverHelpSpanish.txt',
    trigger: 'pecas',
    title: 'Texto de ayuda',
    body: 'Nos interesan las pecas en la espalda y los hombros, no en la cara ni en los brazos. La cara y los brazos están más expuestos al sol y pueden tener una cantidad diferente de pecas.',
    prompt: '¿Cuántas pecas tiene ahora en la espalda y los hombros? Consulte las siguientes fotografías para ver algunos ejemplos.',
  },
};

function helpPopover(page, content = 'Synthetic help text') {
  return page.locator('.popover').filter({ hasText: content });
}

function helpAnnouncer(page) {
  return page.locator('#questionnaireRoot #ariaLiveHelpAnnouncer');
}

async function openLockedSunQuestion(page, lang, questionId = 'D_352986465', config = {}) {
  // Preserve the production image markup without making external network
  // requests. These tests assess prompt/focus behavior, not image descriptions.
  await page.route('https://user-images.githubusercontent.com/64271614/*', (route) => route.fulfill({
    contentType: 'image/png',
    path: fileURLToPath(new URL('./assets/FemaleBaldness1.png', import.meta.url)),
  }));
  return openParticipant(page, {
    markdown: readLockedMarkdown('module3', lang),
    lang,
    persistedData: { treeJSON: treeAt(questionId) },
    ...config,
  });
}

async function expectPromptFocus(question, prompt, lang) {
  const helper = question.locator(':scope > .screen-reader-focus[data-question-prompt-focus]');
  const fieldset = question.locator(':scope > fieldset');
  await expect(question.locator('.screen-reader-focus')).toHaveCount(1);
  await expect(helper).toHaveText(prompt);
  await expect(helper).toHaveAttribute('lang', lang);
  await expect(helper).toBeFocused();
  await expect(fieldset).toHaveAccessibleName(prompt);
  return helper;
}

async function dismissAndExpectPromptFocus(page, modal, helper) {
  await modal.evaluate((element) => {
    element.addEventListener('hidden.bs.modal', () => {
      element.__promptFocusedAtHidden = document.activeElement?.matches(
        'form.question.active > .screen-reader-focus[data-question-prompt-focus]',
      ) ?? false;
    }, { once: true });
  });
  await page.keyboard.press('Escape');
  await expect(modal).not.toHaveClass(/show/);
  expect(await modal.evaluate((element) => element.__promptFocusedAtHidden)).toBe(true);
  await expect(helper).toBeFocused();
}

async function expectClosedHelp(trigger, description) {
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toHaveAttribute('aria-description', description);
  await expect(trigger).toHaveAccessibleDescription(description);
  await expect(trigger).not.toHaveAttribute('aria-haspopup');
}

async function expectOpenHelp({ trigger, popover, announcer, title, body }) {
  const announcement = [title, body].filter(Boolean).join(' ');

  await expect(popover).toBeVisible();
  await expect(popover).toHaveAttribute('role', 'tooltip');
  if (title) await expect(popover).toContainText(title);
  await expect(popover).toContainText(body);
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(trigger).toHaveAttribute('aria-describedby', await popover.getAttribute('id'));
  await expect(trigger).toHaveAccessibleDescription(announcement);
  await expect(trigger).toBeFocused();
  await expect(announcer).toHaveText(announcement);
}

test.describe('production-shaped popover accessibility @canonical', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      !DESKTOP_ENGINES.has(testInfo.project.name),
      'Keyboard popover behavior is checked in each desktop engine and the Windows user-agent branch.',
    );
  });

  test('includes question-text help in the natural post-render Tab order with visible focus', async ({ page }, testInfo) => {
    await openParticipant(page, { markdown: POPOVER_MARKDOWN });

    const question = activeQuestion(page, 'PLAIN');
    const focusTarget = question.locator('.screen-reader-focus');
    const trigger = question.getByRole('button', { name: 'More information' });
    const next = question.getByRole('button', { name: 'Next question' });

    await expect(focusTarget).toBeFocused();
    await expect(focusTarget).toHaveAttribute('tabindex', '-1');

    await page.keyboard.press('Tab');
    await expect(trigger).toBeFocused();
    await expectClosedHelp(trigger, 'Help title');
    await expect(trigger).toHaveCSS('outline-style', 'solid');
    await expect(trigger).toHaveCSS('outline-width', '3px');
    await expect(trigger).toHaveCSS('outline-color', 'rgb(28, 93, 134)');

    // Playwright WebKit does not model Safari's Full Keyboard Access setting,
    // so its default Tab behavior skips native buttons. Safari traversal from
    // the help trigger through Next is part of the manual protocol.
    if (testInfo.project.name !== 'webkit-desktop') {
      await page.keyboard.press('Tab');
      await expect(next).toBeFocused();
    }
  });

  test('supports pointer, Enter, Space, Escape, and focus-departure behavior exactly once', async ({ page }) => {
    await openParticipant(page, { markdown: POPOVER_MARKDOWN });

    const question = activeQuestion(page, 'PLAIN');
    await expect(question.locator('legend')).toContainText('Please read the following survey help.');

    const trigger = question.getByRole('button', { name: 'More information' });
    const announcer = helpAnnouncer(page);
    await expect(announcer).toHaveAttribute('aria-live', 'polite');
    await expect(announcer).toHaveAttribute('aria-atomic', 'true');
    await expect(announcer).toBeEmpty();
    await expect(trigger).toBeVisible();
    await expectClosedHelp(trigger, 'Help title');
    await trigger.focus();
    await expect(trigger).toBeFocused();
    await expect(helpPopover(page)).toHaveCount(0);

    const closedEscape = await trigger.evaluate((element) => {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' });
      const dispatchResult = element.dispatchEvent(event);
      return {
        defaultPrevented: event.defaultPrevented,
        dispatchResult,
      };
    });
    expect(closedEscape).toEqual({ defaultPrevented: false, dispatchResult: true });
    await expect(helpPopover(page)).toHaveCount(0);

    await page.keyboard.press('Enter');
    const popover = helpPopover(page);
    await expectOpenHelp({
      trigger,
      popover,
      announcer,
      title: 'Help title',
      body: 'Synthetic help text',
    });

    await page.keyboard.press('Enter');
    await expect(popover).not.toBeVisible();
    expect(await trigger.getAttribute('aria-describedby')).toBeNull();
    await expect(announcer).toBeEmpty();
    await expectClosedHelp(trigger, 'Help title');

    const scrollBeforeSpace = await page.evaluate(() => window.scrollY);
    await page.keyboard.press('Space');
    await expectOpenHelp({
      trigger,
      popover: helpPopover(page),
      announcer,
      title: 'Help title',
      body: 'Synthetic help text',
    });
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBeforeSpace);

    await page.keyboard.press('Escape');
    await expect(helpPopover(page)).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(announcer).toBeEmpty();
    await expectClosedHelp(trigger, 'Help title');

    await trigger.click();
    await expectOpenHelp({
      trigger,
      popover: helpPopover(page),
      announcer,
      title: 'Help title',
      body: 'Synthetic help text',
    });
    await expect(trigger).toBeFocused();
    await page.locator('#host-after').focus();
    await expect(helpPopover(page)).not.toBeVisible();
    expect(await trigger.getAttribute('aria-describedby')).toBeNull();
    await expect(announcer).toBeEmpty();
    await expectClosedHelp(trigger, 'Help title');
    await expectHealthyHarness(page);
  });

  for (const [lang, fallback] of [['en', 'Informational Text'], ['es', 'Texto de ayuda']]) {
    for (const [heading, markdown] of [
      ['missing', TITLELESS_POPOVER_MARKDOWN],
      ['blank', TITLELESS_POPOVER_MARKDOWN.replace('|this help|', '|this help|   |')],
    ]) {
      test(`uses the ${lang} fallback for a ${heading} heading without changing the prompt or popup body`, async ({ page }) => {
        await openParticipant(page, { markdown, lang });

        const question = activeQuestion(page, 'TITLELESS');
        const trigger = question.getByRole('button', { name: 'this help', exact: true });
        const announcer = helpAnnouncer(page);
        await expect(question.getByRole('group', { name: 'Read this help before continuing.', exact: true })).toHaveCount(1);
        await expectClosedHelp(trigger, fallback);
        await trigger.click();

        await expectOpenHelp({
          trigger,
          popover: helpPopover(page, 'Titleless synthetic help text'),
          announcer,
          title: '',
          body: 'Titleless synthetic help text',
        });
        await expect(announcer).not.toContainText(fallback);
        await page.keyboard.press('Escape');
        await expect(announcer).toBeEmpty();
        await expectClosedHelp(trigger, fallback);
        await expectHealthyHarness(page);
      });
    }
  }

  test('keeps the description and expanded state accurate when showing or hiding is canceled', async ({ page }) => {
    await openParticipant(page, { markdown: POPOVER_MARKDOWN });
    const trigger = activeQuestion(page, 'PLAIN').getByRole('button', { name: 'More information' });
    const announcer = helpAnnouncer(page);
    await trigger.focus();
    await trigger.evaluate((element) => {
      element.addEventListener('show.bs.popover', (event) => event.preventDefault(), { once: true });
      window.bootstrap.Popover.getInstance(element).show();
    });
    await waitInHarness(page, 250);
    await expect(helpPopover(page)).toHaveCount(0);
    await expectClosedHelp(trigger, 'Help title');
    await expect(announcer).toBeEmpty();

    // Deliberate cancellation is a public-API contract; Bootstrap's toggle
    // retains its own hover state when a show event is prevented.
    await trigger.evaluate((element) => window.bootstrap.Popover.getInstance(element).show());
    const popover = helpPopover(page);
    await expectOpenHelp({ trigger, popover, announcer, title: 'Help title', body: 'Synthetic help text' });
    await trigger.evaluate((element) => {
      element.addEventListener('hide.bs.popover', (event) => event.preventDefault(), { once: true });
    });
    await page.keyboard.press('Escape');
    await waitInHarness(page, 250);
    await expectOpenHelp({ trigger, popover, announcer, title: 'Help title', body: 'Synthetic help text' });

    await page.keyboard.press('Escape');
    await expect(popover).not.toBeVisible();
    await expectClosedHelp(trigger, 'Help title');
    await expect(announcer).toBeEmpty();
    await expectHealthyHarness(page);
  });

  test('keeps a newer help announcement when an older trigger emits stale lifecycle events', async ({ page }) => {
    await openParticipant(page, { markdown: DUAL_POPOVER_MARKDOWN });

    const question = activeQuestion(page, 'DUAL');
    const first = question.getByRole('button', { name: 'first help' });
    const second = question.getByRole('button', { name: 'second help' });
    const announcer = helpAnnouncer(page);

    await first.click();
    await expect(announcer).toHaveText('First help title First synthetic help body');
    await second.focus();
    await page.keyboard.press('Enter');
    await expect(announcer).toHaveText('Second help title Second synthetic help body');

    await first.evaluate((trigger) => {
      trigger.dispatchEvent(new Event('hide.bs.popover'));
      trigger.dispatchEvent(new Event('hidden.bs.popover'));
      trigger.dispatchEvent(new Event('shown.bs.popover'));
    });
    await waitInHarness(page, 250);

    await expect(second).toBeFocused();
    await expect(first).toHaveAttribute('aria-expanded', 'false');
    await expect(second).toHaveAttribute('aria-expanded', 'true');
    await expect(announcer).toHaveText('Second help title Second synthetic help body');
    await expectHealthyHarness(page);
  });

  test('ignores a late shown event when Escape closes the popover during its opening transition', async ({ page }) => {
    await openParticipant(page, { markdown: POPOVER_MARKDOWN });
    await page.addStyleTag({ content: '.popover.fade { transition-duration: 0.2s !important; }' });

    const trigger = activeQuestion(page, 'PLAIN').getByRole('button', { name: 'More information' });
    const announcer = helpAnnouncer(page);
    await trigger.focus();
    const opening = await trigger.evaluate((element) => new Promise((resolve) => {
      let shown = false;
      element.addEventListener('shown.bs.popover', () => { shown = true; }, { once: true });
      element.addEventListener('inserted.bs.popover', () => {
        setTimeout(() => {
          const tip = element.ownerDocument.getElementById(element.getAttribute('aria-describedby'));
          const state = {
            tipIsOpen: tip?.classList.contains('show'),
            expanded: element.getAttribute('aria-expanded'),
            shown,
          };
          element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }));
          resolve(state);
        }, 0);
      }, { once: true });
      element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }));
    }));
    expect(opening).toEqual({ tipIsOpen: true, expanded: 'true', shown: false });
    await waitInHarness(page, 250);

    await expect(helpPopover(page)).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(announcer).toBeEmpty();
    await expectClosedHelp(trigger, 'Help title');
    await expectHealthyHarness(page);
  });

  test('does not publish a late help announcement when focus leaves in the opening task', async ({ page }) => {
    await openParticipant(page, { markdown: POPOVER_MARKDOWN });

    const trigger = activeQuestion(page, 'PLAIN').getByRole('button', { name: 'More information' });
    const hostAfter = page.locator('#host-after');
    const announcer = helpAnnouncer(page);
    await trigger.focus();
    await trigger.evaluate((element) => {
      element.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Enter',
      }));
      element.ownerDocument.getElementById('host-after').focus();
    });
    await waitInHarness(page, 250);

    await expect(helpPopover(page)).not.toBeVisible();
    await expect(hostAfter).toBeFocused();
    await expect(announcer).toBeEmpty();
    await expect(trigger).not.toHaveAttribute('title');
    await expectClosedHelp(trigger, 'Help title');
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expectOpenHelp({ trigger, popover: helpPopover(page), announcer, title: 'Help title', body: 'Synthetic help text' });
    await expectHealthyHarness(page);
  });

  for (const [lang, expectation] of Object.entries(PRODUCTION_HELP)) {
    test(`announces ${lang} help in the survey language under an opposite-language host`, async ({ page }) => {
      const hostLang = lang === 'es' ? 'en' : 'es';
      await openParticipant(page, { fixture: expectation.fixture, lang, hostLang });
      const trigger = activeQuestion(page, 'D_352986465').getByRole('button', { name: expectation.trigger, exact: true });
      const announcer = helpAnnouncer(page);

      await expect(page.locator('html')).toHaveAttribute('lang', hostLang);
      await expect(announcer).toHaveAttribute('lang', lang);
      await trigger.click();
      await expectOpenHelp({ trigger, popover: helpPopover(page, expectation.body), announcer, title: expectation.title, body: expectation.body });
      await expect(page.locator('html')).toHaveAttribute('lang', hostLang);
      await expectHealthyHarness(page);
    });

    test(`focuses the full ${lang} production prompt while preserving independently accessible inline help`, async ({ page }) => {
      await openLockedSunQuestion(page, lang, 'D_352986465', { hostLang: 'en' });

      const question = activeQuestion(page, 'D_352986465');
      const trigger = question.getByRole('button', { name: expectation.trigger, exact: true });
      const announcer = helpAnnouncer(page);

      await expectPromptFocus(question, expectation.prompt, lang);
      // The visible legend stays available for intentional rereading with a
      // screen reader's swipe/reading commands. Browser tests do not assert speech.
      await expect(page.locator('#ariaLiveQuestionAnnouncer')).toBeEmpty();
      await expect(announcer).toBeEmpty();
      await expect(trigger).toHaveAccessibleName(expectation.trigger);
      await expect(trigger).toBeVisible();
      await expect(trigger).toHaveCSS('color', 'rgb(42, 114, 165)');
      await expect(trigger).toHaveCSS('padding-left', '0px');
      await expect(trigger).toHaveCSS('padding-right', '0px');
      await expectClosedHelp(trigger, expectation.title);
      await page.keyboard.press('Tab');
      await expect(trigger).toBeFocused();
      await page.keyboard.press('Space');
      await expectOpenHelp({
        trigger,
        popover: helpPopover(page, expectation.body),
        announcer,
        title: expectation.title,
        body: expectation.body,
      });
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
      await expectClosedHelp(trigger, expectation.title);
      await expectHealthyHarness(page);
    });
  }

  test('refreshes one prompt target through production Next and cached Back navigation', async ({ page }) => {
    const expectation = PRODUCTION_HELP.en;
    await openLockedSunQuestion(page, 'en', 'D_524971659');
    const preceding = activeQuestion(page, 'D_524971659');
    await preceding.locator('label[for="D_524971659_353358909"]').click();
    await goNext(page);

    const question = activeQuestion(page, 'D_352986465');
    const helper = await expectPromptFocus(question, expectation.prompt, 'en');
    await helper.evaluate((element) => {
      window.__cachedPopoverPromptTarget = element;
      element.textContent = 'Stale test-only prompt';
    });
    await question.locator('label[for="D_352986465_259218831"]').click();
    await goNext(page);
    await expect(activeQuestion(page, 'END')).toBeVisible();

    await activeQuestion(page, 'END').getByRole('button', { name: 'Back to the previous section' }).click();
    const restored = activeQuestion(page, 'D_352986465');
    const restoredHelper = await expectPromptFocus(restored, expectation.prompt, 'en');
    expect(await restoredHelper.evaluate((element) => element === window.__cachedPopoverPromptTarget)).toBe(true);
    await page.keyboard.press('Tab');
    await expect(restored.getByRole('button', { name: expectation.trigger, exact: true })).toBeFocused();
    await expectHealthyHarness(page);
  });

  test('restores the outside-fieldset prompt target when a response dialog closes', async ({ page }) => {
    await openLockedSunQuestion(page, 'en');
    const question = activeQuestion(page, 'D_352986465');
    const helper = await expectPromptFocus(question, PRODUCTION_HELP.en.prompt, 'en');

    await goNext(page);
    const softModal = page.locator('#softModal');
    await expect(softModal).toHaveClass(/show/);
    await dismissAndExpectPromptFocus(page, softModal, helper);
    await expectHealthyHarness(page);
  });

  for (const [lang, name] of [['en', 'Hazel'], ['es', 'Color avellana']]) {
    test(`keeps the selected ${lang} production eye-color help styling consistent without changing the answer`, async ({ page }) => {
      await openParticipant(page, {
        markdown: readLockedMarkdown('module3', lang),
        lang,
        persistedData: { treeJSON: treeAt('D_857219333') },
      });
      const question = activeQuestion(page, 'D_857219333');
      const trigger = question.getByRole('button', { name, exact: true });
      const radio = question.locator('#D_857219333_696181630');
      const label = question.locator('label[for="D_857219333_696181630"]');

      await expect(trigger).toHaveCSS('color', 'rgb(42, 114, 165)');
      await label.click({ position: { x: 8, y: 8 } });
      await expect(radio).toBeChecked();
      await expect(label).toHaveCSS('background-color', 'rgb(60, 145, 222)');
      await expect(trigger).toHaveCSS('color', 'rgb(255, 255, 255)');
      await radio.focus();
      await page.keyboard.press('Tab');
      await expect(trigger).toBeFocused();
      await page.keyboard.press('Space');
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await expect(radio).toBeChecked();
      expect((await harnessSnapshot(page)).state.active).toMatchObject({ D_857219333: '696181630' });
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
      await expect(trigger).toHaveCSS('outline-style', 'solid');
      await expect(trigger).toHaveCSS('outline-width', '3px');

      await question.locator('.response > label').first().click();
      await expect(radio).not.toBeChecked();
      await expect(trigger).toHaveCSS('color', 'rgb(42, 114, 165)');
      await expectHealthyHarness(page);
    });
  }

  test('keeps defensive checkbox help styling consistent when selecting and clearing the answer', async ({ page }) => {
    await openParticipant(page, { markdown: RESPONSE_POPOVER_MARKDOWN.replace(/\((\d+)\)/g, '[$1]') });
    const question = activeQuestion(page, 'EYE_COLOR');
    const trigger = question.getByRole('button', { name: 'Hazel' });
    const label = trigger.locator('xpath=ancestor::label');
    const checkbox = question.locator('input[type="checkbox"]').nth(1);
    await expect(trigger).toHaveCSS('color', 'rgb(42, 114, 165)');
    await label.click({ position: { x: 8, y: 8 } });
    await expect(checkbox).toBeChecked();
    await expect(label).toHaveCSS('background-color', 'rgb(60, 145, 222)');
    await expect(trigger).toHaveCSS('color', 'rgb(255, 255, 255)');
    await label.click({ position: { x: 8, y: 8 } });
    await expect(checkbox).not.toBeChecked();
    await expect(trigger).toHaveCSS('color', 'rgb(42, 114, 165)');
    await expectHealthyHarness(page);
  });

  for (const type of ['radio', 'checkbox']) {
    test(`preserves selected help system colors for ${type} responses in forced-colors mode`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium-desktop', 'Forced-colors rendering is checked once in Chromium; checkbox coverage protects the supported parser syntax.');
      await page.emulateMedia({ forcedColors: 'active' });
      await openParticipant(page, {
        markdown: type === 'radio'
          ? RESPONSE_POPOVER_MARKDOWN
          : RESPONSE_POPOVER_MARKDOWN.replace(/\((\d+)\)/g, '[$1]'),
      });
      const question = activeQuestion(page, 'EYE_COLOR');
      const trigger = question.getByRole('button', { name: 'Hazel' });
      const label = trigger.locator('xpath=ancestor::label');
      const input = question.locator(`input[type="${type}"]`).nth(1);
      await label.click({ position: { x: 8, y: 8 } });
      await expect(input).toBeChecked();
      await expect(label).toHaveCSS('forced-color-adjust', 'none');
      const selectedTextColor = await label.evaluate((element) => getComputedStyle(element).color);
      const selectedBackground = await label.evaluate((element) => getComputedStyle(element).backgroundColor);
      await expect(trigger).toHaveCSS('color', selectedTextColor);
      expect(selectedTextColor).not.toBe(selectedBackground);
      await input.focus();
      await page.keyboard.press('Tab');
      await expect(trigger).toBeFocused();
      await page.keyboard.press('Space');
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await expect(trigger).toHaveCSS('color', selectedTextColor);
      await expect(input).toBeChecked();
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
      await expect(trigger).toHaveCSS('outline-style', 'solid');
      await expect(trigger).toHaveCSS('outline-width', '3px');
      await expectHealthyHarness(page);
    });
  }

  test('does not let a help control nested in a response label answer the question', async ({ page }) => {
    await openParticipant(page, { markdown: RESPONSE_POPOVER_MARKDOWN });
    const question = activeQuestion(page, 'EYE_COLOR');
    const trigger = question.getByRole('button', { name: 'Hazel' });
    const response = trigger.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " response ")]');
    const radio = response.locator('input[type="radio"]');
    const label = response.locator('label');

    await expect(trigger).toHaveCSS('color', 'rgb(42, 114, 165)');
    await expectClosedHelp(trigger, 'Informational Text');
    await expect(label).toHaveText('Hazel');
    await expect(radio).toHaveAccessibleName('Hazel');
    await trigger.focus();
    await page.keyboard.press('Space');
    await expect(helpPopover(page, 'Hazel is a combination')).toBeVisible();
    await expect(helpAnnouncer(page)).toHaveText('Informational Text Hazel is a combination of green and brown.');
    await expect(radio).not.toBeChecked();
    expect((await harnessSnapshot(page)).state.active).not.toHaveProperty('EYE_COLOR');
    await page.keyboard.press('Escape');
    await expect(helpAnnouncer(page)).toBeEmpty();

    await trigger.click();
    await expect(helpPopover(page, 'Hazel is a combination')).toBeVisible();
    await expect(helpAnnouncer(page)).toHaveText('Informational Text Hazel is a combination of green and brown.');
    await expect(radio).not.toBeChecked();
    expect((await harnessSnapshot(page)).state.active).not.toHaveProperty('EYE_COLOR');
    await page.keyboard.press('Escape');
    await expect(helpAnnouncer(page)).toBeEmpty();

    // Click the response-card padding, not its nested help control.
    await label.click({ position: { x: 8, y: 8 } });
    await expect(radio).toBeChecked();
    await expect(label).toHaveCSS('background-color', 'rgb(60, 145, 222)');
    await expect(trigger).toHaveCSS('color', 'rgb(255, 255, 255)');
    expect((await harnessSnapshot(page)).state.active).toMatchObject({ EYE_COLOR: '696181630' });
    await expectHealthyHarness(page);
  });

  test('disposes an open popover during navigation and reinitializes it on Back', async ({ page }) => {
    await openParticipant(page, { markdown: POPOVER_MARKDOWN });
    const trigger = activeQuestion(page, 'PLAIN').getByRole('button', { name: 'More information' });
    const detachedTrigger = await trigger.elementHandle();
    await trigger.click();
    await expect(helpPopover(page)).toBeVisible();
    await expect(helpAnnouncer(page)).toHaveText('Help title Synthetic help text');

    await goNext(page);
    await expect(activeQuestion(page, 'FOLLOWUP')).toBeVisible();
    await expect(helpPopover(page)).toHaveCount(0);
    await expect(helpAnnouncer(page)).toBeEmpty();

    await detachedTrigger.evaluate((element) => {
      element.dispatchEvent(new Event('shown.bs.popover'));
    });
    await waitInHarness(page, 250);
    await expect(helpAnnouncer(page)).toBeEmpty();

    await goBack(page);
    const restoredTrigger = activeQuestion(page, 'PLAIN').getByRole('button', { name: 'More information' });
    await expectClosedHelp(restoredTrigger, 'Help title');
    await restoredTrigger.focus();
    await page.keyboard.press('Enter');
    await expect(helpPopover(page)).toBeVisible();
    await expect(helpAnnouncer(page)).toHaveText('Help title Synthetic help text');
    await expectHealthyHarness(page);
  });

  test('disposes an open popover before a sequential host render', async ({ page }) => {
    await openParticipant(page, { markdown: POPOVER_MARKDOWN });
    const originalTrigger = activeQuestion(page, 'PLAIN').getByRole('button', { name: 'More information' });
    const detachedTrigger = await originalTrigger.elementHandle();
    await originalTrigger.click();
    await expect(helpPopover(page)).toBeVisible();
    await expect(helpAnnouncer(page)).toHaveText('Help title Synthetic help text');

    // Intentionally bypass the ordinary participant harness's one-render guard:
    // this is the dedicated contract for Quest's stateful public API boundary.
    const renderResult = await page.evaluate(async (markdown) => {
      const { transform } = await import('/main.js');
      window.sequentialQuestErrors = [];
      const result = await transform.render({
        activate: true,
        errorLogger: (...args) => window.sequentialQuestErrors.push(args.map(String).join(' ')),
        lang: 'en',
        questVersion: 'test-local',
        showProgressBarInQuest: true,
        store: async () => ({ code: 200 }),
        text: markdown,
      }, 'questionnaireRoot', {});
      return result;
    }, POPOVER_MARKDOWN);
    expect(renderResult).toBe(true);
    await expect(activeQuestion(page, 'PLAIN')).toBeVisible();
    await expect(helpPopover(page)).toHaveCount(0);
    await expect(helpAnnouncer(page)).toBeEmpty();

    await detachedTrigger.evaluate((element) => {
      element.dispatchEvent(new Event('shown.bs.popover'));
      element.dispatchEvent(new Event('hidden.bs.popover'));
    });
    await waitInHarness(page, 250);
    await expect(helpAnnouncer(page)).toBeEmpty();

    const newTrigger = activeQuestion(page, 'PLAIN').getByRole('button', { name: 'More information' });
    await expectClosedHelp(newTrigger, 'Help title');
    await newTrigger.focus();
    await page.keyboard.press('Enter');
    await expect(helpPopover(page)).toBeVisible();
    await expect(helpAnnouncer(page)).toHaveText('Help title Synthetic help text');
    expect(await page.evaluate(() => window.sequentialQuestErrors)).toEqual([]);
    await expectHealthyHarness(page);
  });
});
