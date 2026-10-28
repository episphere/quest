import { test, expect } from './support/test.js';
import {
  activeQuestion,
  expectHealthyHarness,
  flushHarness,
  goNext,
  harnessSnapshot,
  openParticipant,
  selectLabeledResponse,
  waitInHarness,
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
  await expect(label.locator('.grid-label-response-text')).toHaveText(text);
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
    await expect(table).toHaveCSS('margin-top', '10px');
    const cornerSpacer = table.locator('thead tr > :first-child');
    await expect(cornerSpacer).toHaveClass(/grid-corner-spacer/);
    expect(await cornerSpacer.evaluate((element) => element.tagName)).toBe('TD');
    await expect(table.locator('thead th:not([scope="col"])')).toHaveCount(0);

    if (testInfo.project.name === 'chromium-phone') {
      await expect(table.locator('thead')).toHaveCSS('display', 'none');
      await expect(table.locator('td.response').first()).toHaveCSS('display', 'block');
      await expect(table.locator('td.response').first()).toHaveAttribute('data-header', /^\s*Never$/);
      await expect(table).toHaveCSS('padding-top', '0px');
    } else {
      await expect(table).toHaveCSS('display', 'inline-table');
      await expect(table.locator('tr').first()).toHaveCSS('display', 'table-row');
    }

    await question.locator('tr[data-question-id="GRID_WALK"] label', { hasText: 'Sometimes' }).click();
    await expect(question.locator('#GRID_WALK_1')).toBeChecked();
    await expectHealthyHarness(page);
  });

  test('switches once at the 576px Bootstrap breakpoint without overlapping layouts', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'The exact CSS breakpoint boundary is exercised once in Chromium.');

    await page.setViewportSize({ width: 575, height: 900 });
    await openParticipant(page, { fixture: 'gridResponsive.txt' });
    await goNext(page);
    const table = activeQuestion(page, 'GRID_RATE').locator('table.quest-grid');
    await expect(table).toHaveCSS('display', 'block');
    await expect(table.locator('thead')).toHaveCSS('display', 'none');

    await page.setViewportSize({ width: 576, height: 900 });
    await expect(table).toHaveCSS('display', 'inline-table');
    await expect(table.locator('thead')).not.toHaveCSS('display', 'none');
    await expect(table.locator('tr').first()).toHaveCSS('display', 'table-row');
    await expectHealthyHarness(page);
  });

  test('keeps phone grid response names visible before and after selection', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-phone',
      'Mobile cards are the only layout where response labels supply the visible column names.',
    );

    await openParticipant(page, { fixture: 'gridResponsive.txt' });
    await goNext(page);
    await page.mouse.move(0, 0);

    const question = activeQuestion(page, 'GRID_RATE');
    const row = question.locator('tr[data-question-id="GRID_WALK"]');
    await expect(question.getByRole('radio', {
      name: 'Walking Sometimes',
      exact: true,
    })).toHaveCount(1);
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
    const selectedLabel = selectedCell.locator('label.custom-label');
    const selectedLabelBox = await selectedLabel.boundingBox();
    expect(selectedLabelBox).not.toBeNull();
    await page.touchscreen.tap(
      selectedLabelBox.x + (selectedLabelBox.width / 2),
      selectedLabelBox.y + (selectedLabelBox.height / 2),
    );
    await expect(row.locator('#GRID_WALK_1')).toBeChecked();
    await expectMobileResponseLabel(selectedLabel, selectedCell, {
      backgroundColor: 'rgb(50, 122, 187)',
      text: 'Sometimes',
      textColor: 'rgb(255, 255, 255)',
    });
    await expectHealthyHarness(page);
  });

  test('keeps phone radio-grid keyboard focus, selection, and visible card state aligned', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-phone',
      'This contract targets the stacked phone grid and its keyboard focus proxy.',
    );

    await openParticipant(page, { fixture: 'gridResponsive.txt' });
    await goNext(page);

    const question = activeQuestion(page, 'GRID_RATE');
    const row = question.locator('tr[data-question-id="GRID_WALK"]');
    const never = row.locator('#GRID_WALK_0');
    const sometimes = row.locator('#GRID_WALK_1');
    await expect(question.locator('.screen-reader-focus')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(never).toBeFocused();
    const neverLabel = never.locator('xpath=following-sibling::label');
    await expect(neverLabel).toHaveCSS('outline-style', 'solid');
    await expect(neverLabel).toHaveCSS('outline-width', '3px');
    await expect(neverLabel).toHaveCSS('outline-color', 'rgb(28, 93, 134)');

    await page.keyboard.press('ArrowRight');
    await waitInHarness(page, 150);
    await expect(sometimes).toBeFocused();
    await expect(sometimes).toBeChecked();
    const selectedCell = sometimes.locator('xpath=..');
    const selectedLabel = sometimes.locator('xpath=following-sibling::label');
    await expectMobileResponseLabel(selectedLabel, selectedCell, {
      backgroundColor: 'rgb(50, 122, 187)',
      text: 'Sometimes',
      textColor: 'rgb(255, 255, 255)',
    });
    await expect(selectedLabel).toHaveCSS('outline-style', 'solid');
    await expect(selectedLabel).toHaveCSS('outline-width', '3px');
    await expect(selectedLabel).toHaveCSS('outline-color', 'rgb(255, 255, 255)');
    await expectHealthyHarness(page);
  });

  test('keeps phone checkbox-grid keyboard focus, card state, and storage aligned', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-phone',
      'This contract targets checkbox cells in the stacked phone grid.',
    );

    await openParticipant(page, { fixture: 'gridCheckboxFocus.txt' });
    await goNext(page);

    const question = activeQuestion(page, 'GRID_CHECK');
    await expect(question.getByRole('checkbox', {
      name: 'First need Phone',
      exact: true,
    })).toHaveCount(1);
    const firstRow = question.locator('tr[data-question-id="GRID_CHECK_ROW_A"]');
    const firstCell = firstRow.locator('td.response').first();
    const firstCheckbox = firstCell.locator('input[type="checkbox"]');
    const firstLabel = firstCell.locator('label.custom-label');
    await page.mouse.move(0, 0);
    await expectMobileResponseLabel(firstLabel, firstCell, {
      backgroundColor: 'rgb(240, 240, 240)',
      text: 'Phone',
      textColor: 'rgb(51, 51, 51)',
    });

    await expect(question.locator('.screen-reader-focus')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(firstCheckbox).toBeFocused();
    await page.keyboard.press('Space');
    await waitInHarness(page, 150);
    await expect(firstCheckbox).toBeChecked();
    await expectMobileResponseLabel(firstLabel, firstCell, {
      backgroundColor: 'rgb(50, 122, 187)',
      text: 'Phone',
      textColor: 'rgb(255, 255, 255)',
    });
    await expect(firstLabel).toHaveCSS('outline-style', 'solid');
    await expect(firstLabel).toHaveCSS('outline-width', '3px');
    await expect(firstLabel).toHaveCSS('outline-color', 'rgb(255, 255, 255)');

    const selectedValue = await firstCheckbox.getAttribute('value');
    const secondRow = question.locator('tr[data-question-id="GRID_CHECK_ROW_B"]');
    const secondLabel = secondRow.locator('td.response').first().locator('label.custom-label');
    const secondLabelBox = await secondLabel.boundingBox();
    expect(secondLabelBox).not.toBeNull();
    await page.touchscreen.tap(
      secondLabelBox.x + (secondLabelBox.width / 2),
      secondLabelBox.y + (secondLabelBox.height / 2),
    );
    await goNext(page);
    await expect(activeQuestion(page, 'END')).toBeVisible();
    await flushHarness(page);

    const stored = await harnessSnapshot(page);
    expect(stored.state.survey.GRID_CHECK.GRID_CHECK_ROW_A).toContain(selectedValue);
    expect(stored.logs.storeCalls.some(({ changes }) => (
      changes['TEST_GRID_CHECKBOX_FOCUS.GRID_CHECK']?.GRID_CHECK_ROW_A?.includes(selectedValue)
    ))).toBe(true);
    await expectHealthyHarness(page);
  });

  test('keeps representative responsive grid geometry stable @visual', async ({ page }, testInfo) => {
    testInfo.snapshotSuffix = '';
    await openParticipant(page, { fixture: 'gridResponsive.txt' });
    await goNext(page);
    const question = activeQuestion(page, 'GRID_RATE');
    await question.locator('tr[data-question-id="GRID_WALK"] label', { hasText: 'Sometimes' }).click();
    await page.mouse.move(0, 0);

    // Keep response text visible: label rendering is part of the mobile-grid
    // regression contract, so masking it would hide a previously observed bug.
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
