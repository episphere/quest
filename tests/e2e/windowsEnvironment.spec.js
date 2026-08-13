import { test, expect } from './support/test.js';
import {
  activeQuestion,
  expectHealthyHarness,
  goNext,
  openParticipant,
  selectLabeledResponse,
  waitInHarness,
} from './support/harness.js';

test.describe('Windows-specific participant handling @canonical @windows-a11y', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-windows-ua',
      'These checks characterize the Quest Windows user-agent branch used for JAWS support.',
    );
  });

  test('adds response-container tab stops and persists pointer selection', async ({ page }) => {
    await openParticipant(page);
    await expect(page.locator('.question.active .response')).toHaveCount(2);
    await expect(page.locator('.question.active .response').first()).toHaveAttribute('tabindex', '0');

    await selectLabeledResponse(page, 'Green');
    await expect(activeQuestion(page).locator('#CHOICE_2')).toBeChecked();
    await expectHealthyHarness(page);
  });

  test('moves the grid focus helper through the next row and terminal Next target after radio selections', async ({ page }) => {
    await openParticipant(page, { fixture: 'gridResponsive.txt' });
    await goNext(page);
    await waitInHarness(page, 550);

    const question = activeQuestion(page, 'GRID_RATE');
    await question.locator('tr[data-question-id="GRID_WALK"] label', { hasText: 'Sometimes' }).click();

    await expect(question.locator('#srFocusHelper')).toBeFocused();
    await expect(question.locator('#qtextGRID_CYCLE #srFocusHelper')).toHaveCount(1);
    await question.locator('tr[data-question-id="GRID_CYCLE"] label', { hasText: 'Often' }).click();

    await expect(question.locator('#srFocusHelper')).toBeFocused();
    await expect(question.getByRole('button', { name: 'Next question' }).locator('#srFocusHelper')).toHaveCount(1);
    await expectHealthyHarness(page);
  });

  test('keeps checkbox-grid focus in an intermediate cell and moves it to Next at the terminal cell', async ({ page }) => {
    await openParticipant(page, { fixture: 'gridCheckboxFocus.txt' });
    await goNext(page);
    await waitInHarness(page, 550);
    const question = activeQuestion(page, 'GRID_CHECK');

    const firstCell = question.locator('tr[data-question-id="GRID_CHECK_ROW_A"] td.response').first();
    await firstCell.locator('label', { hasText: 'Phone' }).click();
    await expect(firstCell.locator('#srFocusHelper')).toHaveCount(1);
    await expect(question.locator('#srFocusHelper')).toBeFocused();

    const terminalCell = question.locator('tr[data-question-id="GRID_CHECK_ROW_B"] td.response').last();
    await terminalCell.locator('label', { hasText: 'Email' }).click();
    await expect(question.getByRole('button', { name: 'Next question' }).locator('#srFocusHelper')).toHaveCount(1);
    await expect(question.locator('#srFocusHelper')).toBeFocused();
    await expect(firstCell.locator('input[type="checkbox"]')).toBeChecked();
    await expect(terminalCell.locator('input[type="checkbox"]')).toBeChecked();
    await expectHealthyHarness(page);
  });
});
