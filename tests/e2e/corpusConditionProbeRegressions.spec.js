import { harnessSnapshot, openParticipant, readCanonicalFixture } from './support/harness.js';
import { expect, test } from './support/test.js';

const markdown = readCanonicalFixture('nestedTextPresence.txt');
const desktopProjects = new Set(['chromium-desktop', 'firefox-desktop', 'webkit-desktop']);

test.describe('nested-text condition regression @canonical @corpus', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(!desktopProjects.has(testInfo.project.name), 'Regression runs in the canonical desktop browser matrix.');
  });

  test('renders the production-shaped nested-text construct in full-list mode without errors', async ({ page }) => {
    await page.goto('/tests/harness/participant.html');
    await page.waitForFunction(() => window.questHarness?.ready === true);
    const result = await page.evaluate((source) => window.questHarness.render({
      activate: false,
      isRenderer: true,
      markdown: source,
      lang: 'en',
      previousResults: { age: '45', yob: '1979' },
    }), markdown);
    expect(result.result).toBe(true);
    await expect(page.locator('#D_495052121, #D_638847244, #D_507471937')).toHaveCount(3);
    expect((await harnessSnapshot(page)).logs.errors).toEqual([]);
  });

  test('keeps a nested Other response through the condition-dependent participant path', async ({ page }) => {
    await openParticipant(page, { markdown });
    await page.locator('label', { hasText: 'Other phone' }).first().click();
    await page.locator('#D_495052121').fill('Synthetic phone');
    await page.getByRole('button', { name: 'Next question' }).click();
    await expect(page.locator('#questionnaireRoot form.question.active#D_731524314')).toBeVisible();
    expect((await harnessSnapshot(page)).logs.errors).toEqual([]);
  });
});
