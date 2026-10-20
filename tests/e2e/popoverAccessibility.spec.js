import { test, expect } from './support/test.js';
import {
  activeQuestion,
  expectHealthyHarness,
  goBack,
  goNext,
  harnessSnapshot,
  openParticipant,
} from './support/harness.js';

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

function helpPopover(page, content = 'Synthetic help text') {
  return page.locator('.popover').filter({ hasText: content });
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
    await expect(trigger).toBeVisible();
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
    await expect(popover).toBeVisible();
    await expect(popover).toHaveAttribute('role', 'tooltip');
    await expect(popover).toContainText('Help title');
    await expect(popover).toContainText('Synthetic help text');
    await expect(trigger).toHaveAttribute('aria-describedby', await popover.getAttribute('id'));

    await page.keyboard.press('Enter');
    await expect(popover).not.toBeVisible();
    expect(await trigger.getAttribute('aria-describedby')).toBeNull();

    const scrollBeforeSpace = await page.evaluate(() => window.scrollY);
    await page.keyboard.press('Space');
    await expect(helpPopover(page)).toBeVisible();
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBeforeSpace);

    await page.keyboard.press('Escape');
    await expect(helpPopover(page)).not.toBeVisible();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await expect(helpPopover(page)).toBeVisible();
    await expect(trigger).toBeFocused();
    await page.locator('#host-after').focus();
    await expect(helpPopover(page)).not.toBeVisible();
    expect(await trigger.getAttribute('aria-describedby')).toBeNull();
    await expectHealthyHarness(page);
  });

  test('does not let a help control nested in a response label answer the question', async ({ page }) => {
    await openParticipant(page, { markdown: RESPONSE_POPOVER_MARKDOWN });
    const question = activeQuestion(page, 'EYE_COLOR');
    const trigger = question.getByRole('button', { name: 'Hazel' });
    const response = trigger.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " response ")]');
    const radio = response.locator('input[type="radio"]');
    const label = response.locator('label');

    await trigger.focus();
    await page.keyboard.press('Space');
    await expect(helpPopover(page, 'Hazel is a combination')).toBeVisible();
    await expect(radio).not.toBeChecked();
    expect((await harnessSnapshot(page)).state.active).not.toHaveProperty('EYE_COLOR');
    await page.keyboard.press('Escape');

    await trigger.click();
    await expect(helpPopover(page, 'Hazel is a combination')).toBeVisible();
    await expect(radio).not.toBeChecked();
    expect((await harnessSnapshot(page)).state.active).not.toHaveProperty('EYE_COLOR');
    await page.keyboard.press('Escape');

    // Click the response-card padding, not its nested help control.
    await label.click({ position: { x: 8, y: 8 } });
    await expect(radio).toBeChecked();
    expect((await harnessSnapshot(page)).state.active).toMatchObject({ EYE_COLOR: '696181630' });
    await expectHealthyHarness(page);
  });

  test('disposes an open popover during navigation and reinitializes it on Back', async ({ page }) => {
    await openParticipant(page, { markdown: POPOVER_MARKDOWN });
    const trigger = activeQuestion(page, 'PLAIN').getByRole('button', { name: 'More information' });
    await trigger.click();
    await expect(helpPopover(page)).toBeVisible();

    await goNext(page);
    await expect(activeQuestion(page, 'FOLLOWUP')).toBeVisible();
    await expect(helpPopover(page)).toHaveCount(0);

    await goBack(page);
    const restoredTrigger = activeQuestion(page, 'PLAIN').getByRole('button', { name: 'More information' });
    await restoredTrigger.focus();
    await page.keyboard.press('Enter');
    await expect(helpPopover(page)).toBeVisible();
    await expectHealthyHarness(page);
  });

  test('disposes an open popover before a sequential host render', async ({ page }) => {
    await openParticipant(page, { markdown: POPOVER_MARKDOWN });
    const originalTrigger = activeQuestion(page, 'PLAIN').getByRole('button', { name: 'More information' });
    await originalTrigger.click();
    await expect(helpPopover(page)).toBeVisible();

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

    const newTrigger = activeQuestion(page, 'PLAIN').getByRole('button', { name: 'More information' });
    await newTrigger.focus();
    await page.keyboard.press('Enter');
    await expect(helpPopover(page)).toBeVisible();
    expect(await page.evaluate(() => window.sequentialQuestErrors)).toEqual([]);
    await expectHealthyHarness(page);
  });
});
