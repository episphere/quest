import { test, expect } from './support/test.js';
import {
  activeQuestion,
  expectHealthyHarness,
  goNext,
  openParticipant,
  selectLabeledResponse,
} from './support/harness.js';

const RESPONSIVE_PROJECTS = new Set([
  'chromium-desktop',
  'chromium-phone',
  'chromium-tablet',
]);

async function expectMobileResponseLabel(label, cell, {
  backgroundColor,
  text,
  textColor,
}) {
  await expect(label).toHaveText(text);
  await expect(label).toBeVisible();
  await expect(label).toHaveCSS('display', 'flex');
  await expect(label).toHaveCSS('visibility', 'visible');
  await expect(label).toHaveCSS('opacity', '1');
  await expect(label).toHaveCSS('color', textColor);
  await expect(label).toHaveCSS('-webkit-text-fill-color', textColor);
  await expect(label).toHaveCSS('background-color', backgroundColor);

  const [labelBox, cellBox] = await Promise.all([
    label.boundingBox(),
    cell.boundingBox(),
  ]);
  expect(labelBox).not.toBeNull();
  expect(cellBox).not.toBeNull();
  expect(labelBox.width / cellBox.width).toBeGreaterThan(0.95);
  expect(labelBox.height / cellBox.height).toBeGreaterThan(0.95);
}

test.describe('participant responsive layout @responsive @canonical', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      !RESPONSIVE_PROJECTS.has(testInfo.project.name),
      'Responsive assertions run at the canonical Chromium breakpoints.',
    );
  });

  test('preserves DOM tab order while changing the visual action order', async ({ page }, testInfo) => {
    await openParticipant(page, { fixture: 'navigationState.txt' });
    await selectLabeledResponse(page, 'Yes');
    await goNext(page);

    const question = activeQuestion(page, 'DETAIL');
    const next = await question.locator('button.next').boundingBox();
    const reset = await question.locator('button.reset').boundingBox();
    const back = await question.locator('button.previous').boundingBox();
    expect(next).not.toBeNull();
    expect(reset).not.toBeNull();
    expect(back).not.toBeNull();

    if (testInfo.project.name === 'chromium-phone') {
      expect(next.y).toBeLessThan(reset.y);
      expect(reset.y).toBeLessThan(back.y);
    } else {
      expect(back.x).toBeLessThan(reset.x);
      expect(reset.x).toBeLessThan(next.x);
      expect(Math.abs(back.y - next.y)).toBeLessThan(2);
    }

    const domOrder = await question.locator('button').evaluateAll((buttons) => (
      buttons.map((button) => button.dataset.clickType)
    ));
    expect(domOrder).toEqual(['next', 'reset', 'previous']);
    await expectHealthyHarness(page);
  });

  test('switches the response grid between table and stacked-card layouts', async ({ page }, testInfo) => {
    await openParticipant(page, { fixture: 'gridResponsive.txt' });
    await goNext(page);

    const question = activeQuestion(page, 'GRID_RATE');
    const table = question.locator('table.quest-grid');
    await expect(table).toBeVisible();

    if (testInfo.project.name === 'chromium-phone') {
      await expect(table.locator('thead')).toHaveCSS('display', 'none');
      await expect(table.locator('td.response').first()).toHaveCSS('display', 'block');
      await expect(table.locator('td.response').first()).toHaveAttribute('data-header', /^\s*Never$/);
    } else {
      await expect(table).toHaveCSS('display', 'inline-table');
      await expect(table.locator('tr').first()).toHaveCSS('display', 'table-row');
    }

    await question.locator('tr[data-question-id="GRID_WALK"] label', { hasText: 'Sometimes' }).click();
    await expect(question.locator('#GRID_WALK_1')).toBeChecked();
    await expectHealthyHarness(page);
  });

  test('keeps phone grid response names visible before and after selection', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-phone',
      'Mobile cards are the only layout where response labels supply the visible column names.',
    );

    await openParticipant(page, { fixture: 'gridResponsive.txt' });
    await goNext(page);

    const row = activeQuestion(page, 'GRID_RATE').locator('tr[data-question-id="GRID_WALK"]');
    const expectedLabels = ['Never', 'Sometimes', 'Often'];

    for (const [index, text] of expectedLabels.entries()) {
      const cell = row.locator('td.response').nth(index);
      await expectMobileResponseLabel(cell.locator('label.custom-label'), cell, {
        backgroundColor: 'rgb(240, 240, 240)',
        text,
        textColor: 'rgb(51, 51, 51)',
      });
    }

    const selectedCell = row.locator('td.response').nth(1);
    await selectedCell.locator('label.custom-label').click();
    await expect(row.locator('#GRID_WALK_1')).toBeChecked();
    await expectMobileResponseLabel(selectedCell.locator('label.custom-label'), selectedCell, {
      backgroundColor: 'rgb(50, 122, 187)',
      text: 'Sometimes',
      textColor: 'rgb(255, 255, 255)',
    });
    await expectHealthyHarness(page);
  });

  test('keeps representative responsive grid geometry stable @visual', async ({ page }, testInfo) => {
    testInfo.snapshotSuffix = '';
    await openParticipant(page, { fixture: 'gridResponsive.txt' });
    await goNext(page);
    const question = activeQuestion(page, 'GRID_RATE');
    await question.locator('tr[data-question-id="GRID_WALK"] label', { hasText: 'Sometimes' }).click();
    await page.mouse.move(0, 0);
    // Keep this cross-platform snapshot focused on geometry and selected-state
    // fills. The phone-specific test above separately protects visible label
    // text and its exact unselected/selected colors.
    await page.addStyleTag({
      content: `
        #questionnaireRoot,
        #questionnaireRoot * {
          -webkit-text-fill-color: transparent !important;
          text-shadow: none !important;
        }
      `,
    });

    await expect(question).toHaveScreenshot(
      `participant-grid-${testInfo.project.name}.png`,
      {
        animations: 'disabled',
        caret: 'hide',
        maxDiffPixelRatio: 0.02,
        scale: 'css',
      },
    );
  });
});
