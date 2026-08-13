import { test, expect } from './support/test.js';
import {
  activeQuestion,
  expectHealthyHarness,
  goNext,
  openParticipant,
  waitInHarness,
} from './support/harness.js';

test.describe('Windows user-agent native parity @canonical @windows-a11y', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-windows-ua',
      'These checks guard against user-agent-specific divergence; they do not simulate JAWS.',
    );
  });

  test('keeps only native list controls in the sequential focus order', async ({ page }) => {
    await openParticipant(page);
    await waitInHarness(page, 550);
    const question = activeQuestion(page, 'CHOICE');
    await expect(question.locator('.response')).toHaveCount(2);
    await expect(question.locator('.response[tabindex]')).toHaveCount(0);
    await expect(question.locator('#srFocusHelper')).toHaveCount(0);

    await page.locator('#host-before').focus();
    await page.keyboard.press('Tab');
    const first = question.locator('#CHOICE_1');
    const second = question.locator('#CHOICE_2');
    await expect(first).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(second).toBeChecked();
    await expect(second).toBeFocused();
    await page.keyboard.press('Tab');
    const next = question.getByRole('button', { name: 'Next question' });
    await expect(next).toBeFocused();
    await waitInHarness(page, 150);
    await expect(next).toBeFocused();

    await expectHealthyHarness(page);
  });

  test('keeps radio-grid arrows and row-to-row Tab traversal native', async ({ page }) => {
    await openParticipant(page, { fixture: 'gridResponsive.txt' });
    await waitInHarness(page, 550);
    await goNext(page);
    await waitInHarness(page, 550);

    const question = activeQuestion(page, 'GRID_RATE');
    await expect(question.locator('#srFocusHelper')).toHaveCount(0);
    await expect(question.locator('.screen-reader-focus')).toHaveAttribute('tabindex', '-1');
    await page.keyboard.press('Tab');
    await expect(question.locator('#GRID_WALK_0')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await waitInHarness(page, 150);
    await expect(question.locator('#GRID_WALK_1')).toBeChecked();
    await expect(question.locator('#GRID_WALK_1')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(question.locator('#GRID_CYCLE_0')).toBeFocused();
    await expectHealthyHarness(page);
  });

  test('keeps checkbox-grid selection on each native checkbox', async ({ page }) => {
    await openParticipant(page, { fixture: 'gridCheckboxFocus.txt' });
    await waitInHarness(page, 550);
    await goNext(page);
    await waitInHarness(page, 550);
    const question = activeQuestion(page, 'GRID_CHECK');
    const first = question.locator('#GRID_CHECK_ROW_A_0');
    const second = question.locator('#GRID_CHECK_ROW_A_1');
    const third = question.locator('#GRID_CHECK_ROW_B_0');
    const terminal = question.locator('#GRID_CHECK_ROW_B_1');

    await expect(question.locator('#srFocusHelper')).toHaveCount(0);
    await page.keyboard.press('Tab');
    await expect(first).toBeFocused();
    await page.keyboard.press('Space');
    await waitInHarness(page, 150);
    await expect(first).toBeChecked();
    await expect(first).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(second).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(third).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(terminal).toBeFocused();
    await page.keyboard.press('Space');
    await waitInHarness(page, 150);
    await expect(terminal).toBeChecked();
    await expect(terminal).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(question.getByRole('button', { name: 'Next question' })).toBeFocused();
    await expectHealthyHarness(page);
  });
});
