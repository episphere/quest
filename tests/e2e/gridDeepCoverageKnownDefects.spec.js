import { test, expect } from './support/test.js';
import {
  activeQuestion,
  expectHealthyHarness,
  goBack,
  goNext,
  openParticipant,
  waitInHarness,
} from './support/harness.js';
import {
  productionSleepGridMarkdown,
  productionSleepGridRows,
  selectProductionSleepGridRows,
} from './support/gridDeepCoverageFixtures.js';
import { runtimeDefects } from '../knownDefects/registry.js';

test.describe('grid lifecycle known defects @known-defect', () => {
  test('QD-GRID-002 restores real production grid selections without losing the focus helper', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-windows-ua', 'The focus-helper lifecycle runs only through Quest’s Windows accessibility branch.');
    const defect = runtimeDefects.gridBackFocusLifecycle;

    expect(await page.evaluate(() => navigator.userAgent)).toContain('Windows NT');
    await openParticipant(page, { markdown: productionSleepGridMarkdown });
    await goNext(page);
    const grid = activeQuestion(page, 'D_981441822');
    await expect(grid).toBeVisible();
    expect(await grid.locator('td.response').count()).toBeGreaterThan(0);
    await selectProductionSleepGridRows(grid, productionSleepGridRows);
    await goNext(page);
    await expect(activeQuestion(page, 'GRID_FOLLOWUP')).toBeVisible();

    await goBack(page);
    await expect(activeQuestion(page, 'D_981441822')).toBeVisible();
    for (const [rowId, value] of Object.entries(productionSleepGridRows)) {
      await expect(grid.locator(`input[name="${rowId}"][value="${value}"]`)).toBeChecked();
    }

    test.fail(true, `${defect.localDefectId}: ${defect.reason}`);
    await expect(grid.locator('#srFocusHelper')).toHaveCount(1);
    await waitInHarness(page, 150);
    await expectHealthyHarness(page);
  });
});
