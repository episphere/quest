import { test, expect } from './support/test.js';
import {
  activeQuestion,
  expectHealthyHarness,
  flushHarness,
  goBack,
  goNext,
  harnessSnapshot,
  openParticipant,
} from './support/harness.js';
import {
  productionSleepGridMarkdown,
  productionSleepGridRows,
  selectProductionSleepGridRows,
} from './support/gridDeepCoverageFixtures.js';

const DEEP_GRID_PROJECTS = new Set(['chromium-desktop', 'chromium-phone']);

const CONDITIONAL_GRID_MARKDOWN = `
{"name":"TEST_CONDITIONAL_GRID"}
[GRID_LEAD] The next question uses condition-driven rows.
|grid?|id="GRID_CONDITIONAL"|How often does each visible activity occur?|[
[ROW_VISIBLE,displayif=equals(SHOW_VISIBLE,1)] Visible activity;
[ROW_HIDDEN,displayif=equals(SHOW_HIDDEN,1)] Hidden activity;]|
(1:Never)
(2:Often)|
[END,end] Done.
`;

test.describe('deep participant grid coverage @canonical @responsive', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      !DEEP_GRID_PROJECTS.has(testInfo.project.name),
      'This deep grid walk runs at the desktop and phone layout boundaries.',
    );
  });

  test('keeps delegated label selection, responsive state, and storage aligned', async ({ page }, testInfo) => {
    await openParticipant(page, { markdown: productionSleepGridMarkdown });
    await goNext(page);
    const grid = activeQuestion(page, 'D_981441822');
    const rows = grid.locator('tr[data-gridrow="true"]');
    const expectedRows = productionSleepGridRows;

    await expect(rows).toHaveCount(9);
    await expect(grid.locator('th[scope="col"]')).toHaveCount(4);
    const firstRowSecondOption = grid.locator('#D_403155173_1');
    await expect(
      firstRowSecondOption.locator('xpath=following-sibling::label').locator('.grid-label-response-text'),
    ).toHaveText('Slight Chance');
    await expect(firstRowSecondOption).toHaveAccessibleName('Sitting and reading Slight Chance');
    await selectProductionSleepGridRows(grid, expectedRows);
    await expect(firstRowSecondOption).toBeChecked();

    if (testInfo.project.name === 'chromium-phone') {
      await expect(grid.locator('thead')).toHaveCSS('display', 'none');
      const unselectedFirstOptionLabel = grid.locator('#D_403155173_0').locator('xpath=following-sibling::label');
      await expect(unselectedFirstOptionLabel).toBeVisible();
      await expect(unselectedFirstOptionLabel).toHaveCSS('color', 'rgb(51, 51, 51)');
      await expect(firstRowSecondOption.locator('xpath=following-sibling::label')).toBeVisible();
      await expect(firstRowSecondOption.locator('xpath=following-sibling::label')).toHaveCSS('color', 'rgb(255, 255, 255)');
    } else {
      const selectedMarker = await firstRowSecondOption.locator('xpath=following-sibling::label').evaluate((label) => {
        const marker = getComputedStyle(label, '::after');
        const unselectedCircle = getComputedStyle(label, '::before');
        return {
          markerDisplay: marker.display,
          markerColor: marker.backgroundColor,
          markerWidth: Number.parseFloat(marker.width),
          unselectedCircleDisplay: unselectedCircle.display,
          unselectedCircleWidth: Number.parseFloat(unselectedCircle.width),
        };
      });
      expect(selectedMarker.markerDisplay).toBe('block');
      expect(selectedMarker.markerColor).toBe('rgb(50, 122, 187)');
      expect(selectedMarker.markerWidth).toBeGreaterThan(0);
      expect(selectedMarker.unselectedCircleDisplay).toBe('block');
      expect(selectedMarker.unselectedCircleWidth).toBeGreaterThan(selectedMarker.markerWidth);
    }

    const beforeNext = await harnessSnapshot(page);
    expect(beforeNext.state.active).toMatchObject({ D_981441822: expectedRows });
    await goNext(page);
    await expect(activeQuestion(page, 'GRID_FOLLOWUP')).toBeVisible();
    await flushHarness(page);

    const stored = await harnessSnapshot(page);
    expect(stored.state.survey).toMatchObject({ D_981441822: expectedRows });
    expect(stored.logs.storeCalls).toHaveLength(2);
    expect(stored.logs.storeCalls.at(-1).changes['TEST_PRODUCTION_GRID.D_981441822']).toEqual(expectedRows);

    await goBack(page);
    await expect(grid).toBeVisible();
    for (const [rowId, value] of Object.entries(expectedRows)) {
      await expect(grid.locator(`input[name="${rowId}"][value="${value}"]`)).toBeChecked();
    }
    await expect(firstRowSecondOption).toHaveAccessibleName('Sitting and reading Slight Chance');
    const focusTarget = grid.locator('.screen-reader-focus');
    await expect(focusTarget).toHaveAttribute('tabindex', '-1');
    await expect(focusTarget).toBeFocused();
    await expectHealthyHarness(page);
  });

  test('evaluates each conditional row from a once-encoded expression and stores only visible selections', async ({ page }) => {
    await openParticipant(page, {
      markdown: CONDITIONAL_GRID_MARKDOWN,
      previousResults: {
        SHOW_VISIBLE: '1',
        SHOW_HIDDEN: '0',
      },
    });
    await goNext(page);

    const grid = activeQuestion(page, 'GRID_CONDITIONAL');
    const visibleRow = grid.locator('tr[data-question-id="ROW_VISIBLE"]');
    const hiddenRow = grid.locator('tr[data-question-id="ROW_HIDDEN"]');
    await expect(visibleRow).toHaveAttribute('data-displayif', 'equals(SHOW_VISIBLE%2C1)');
    await expect(hiddenRow).toHaveAttribute('data-displayif', 'equals(SHOW_HIDDEN%2C1)');
    await expect(visibleRow).toBeVisible();
    await expect(hiddenRow).not.toBeVisible();
    await expect(hiddenRow).toHaveAttribute('data-hidden', 'true');

    const selected = visibleRow.locator('input[value="2"]');
    await selected.locator('xpath=following-sibling::label').click();
    await expect(selected).toHaveAccessibleName('Visible activity Often');
    await expect(selected).toBeChecked();
    const expectedRows = { ROW_VISIBLE: '2' };
    expect((await harnessSnapshot(page)).state.active).toEqual({
      GRID_CONDITIONAL: expectedRows,
    });

    await goNext(page);
    await expect(activeQuestion(page, 'END')).toBeVisible();
    await flushHarness(page);
    const stored = await harnessSnapshot(page);
    expect(stored.state.survey).toMatchObject({ GRID_CONDITIONAL: expectedRows });
    expect(stored.logs.storeCalls.at(-1).changes['TEST_CONDITIONAL_GRID.GRID_CONDITIONAL'])
      .toEqual(expectedRows);
    expect(stored.logs.storeCalls.at(-1).changes['TEST_CONDITIONAL_GRID.GRID_CONDITIONAL'])
      .not.toHaveProperty('ROW_HIDDEN');
    await expectHealthyHarness(page);
  });
});
