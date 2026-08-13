import { test, expect } from './support/test.js';
import {
  activeQuestion,
  flushHarness,
  goNext,
  harnessSnapshot,
  openParticipant,
} from './support/harness.js';
import {
  productionSleepGridMarkdown,
  productionSleepGridRows,
  selectProductionSleepGridRows,
} from './support/gridDeepCoverageFixtures.js';

const CHECKBOX_GRID_PROJECTS = new Set(['chromium-desktop', 'chromium-phone']);

test.describe('deep participant grid coverage @canonical @responsive', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      !CHECKBOX_GRID_PROJECTS.has(testInfo.project.name),
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
    await expect(firstRowSecondOption.locator('xpath=following-sibling::label')).toHaveText('Slight Chance');
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
    // The focus-helper lifecycle is asserted in the separate QD-GRID-002 expected-red contract.
  });
});
