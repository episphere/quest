import { test, expect } from './support/test.js';
import { activeQuestion, expectHealthyHarness, openParticipant } from './support/harness.js';

const DESKTOP_ENGINES = new Set([
  'chromium-desktop',
  'firefox-desktop',
  'webkit-desktop',
  'chromium-windows-ua',
]);

const POPOVER_MARKDOWN = `{"name":"TEST_POPOVER_A11Y"}

[PLAIN] Please read the following survey help.
|popup|More information|Help title|Synthetic help text|`;

test.describe('production-shaped popover accessibility @canonical', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      !DESKTOP_ENGINES.has(testInfo.project.name),
      'Keyboard popover behavior is checked in each desktop engine and the Windows user-agent branch.',
    );
  });

  test('reveals help on keyboard focus, exposes its content, and dismisses on focus departure', async ({ page }) => {
    await openParticipant(page, { markdown: POPOVER_MARKDOWN });

    const question = activeQuestion(page, 'PLAIN');
    await expect(question.locator('legend')).toContainText('Please read the following survey help.');

    const trigger = question.getByRole('button', { name: 'More information' });
    await expect(trigger).toBeVisible();
    await trigger.focus();
    await expect(trigger).toBeFocused();

    const popover = page.locator('.popover').filter({ hasText: 'Synthetic help text' });
    await expect(popover).toBeVisible();
    await expect(popover).toHaveAttribute('role', 'tooltip');
    await expect(popover).toContainText('Help title');
    await expect(popover).toContainText('Synthetic help text');
    await expect(trigger).toHaveAttribute('aria-describedby', await popover.getAttribute('id'));

    await page.locator('#host-after').focus();
    await expect(popover).not.toBeVisible();
    await expectHealthyHarness(page);
  });
});
