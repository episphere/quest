import { test, expect, expectAndClearConsoleErrors } from './support/test.js';
import {
  installAuthoringRoutes,
  openAuthoringSettings,
  waitForAuthoringReady,
} from './support/authoring.js';
import { runtimeDefects } from '../knownDefects/registry.js';

const DESKTOP_ENGINES = new Set(['chromium-desktop', 'firefox-desktop', 'webkit-desktop']);

test.describe('open authoring regressions @known-defect @authoring', () => {
  test('clears previous results after localforage initialization falls back', async ({ page, diagnostics }, testInfo) => {
    test.skip(
      !DESKTOP_ENGINES.has(testInfo.project.name),
      'Each desktop browser engine characterizes the fallback storage-adapter defect.',
    );
    await installAuthoringRoutes(page, diagnostics, {
      localForageMode: 'initialization-failure',
    });
    await page.goto('/index.html');
    await waitForAuthoringReady(page);
    await openAuthoringSettings(page);

    const jsonInput = page.locator('#jsonInput');
    await jsonInput.fill('{"CLEAR_ME":true}');
    await page.getByRole('button', { name: 'Add JSON to Memory' }).click();
    await expect(page.locator('#loadDisplay')).toHaveText('Added JSON successfully.');
    await page.getByRole('button', { name: 'Clear Memory' }).click();

    test.fail(true, `${runtimeDefects.authoringFallbackClear.localDefectId}: ${runtimeDefects.authoringFallbackClear.reason}`);
    await expect.poll(() => diagnostics.consoleErrors.join('\n')).toMatch(/Error clearing LocalForage:.*removeItem/);
    const actual = {
      status: await page.locator('#loadDisplay').textContent(),
      json: await jsonInput.inputValue(),
    };
    expectAndClearConsoleErrors(diagnostics, [/Error clearing LocalForage:.*removeItem/]);
    expect(actual).toEqual({
      status: 'Previous results cleared successfully',
      json: '',
    });
  });
});
