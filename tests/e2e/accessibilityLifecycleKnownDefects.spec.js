import { test, expect } from './support/test.js';
import {
  activeQuestion,
  openParticipant,
  waitInHarness,
} from './support/harness.js';
import { analyzeQuestAxe } from './support/axe.js';
import { axeDefects, runtimeDefects } from '../knownDefects/registry.js';

test.describe('accessibility event lifecycle regressions @known-defect', () => {
  test('clears a delayed list-selection announcement when advancing immediately', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'The asynchronous announcement race is characterized once in Chromium.');
    const defect = runtimeDefects.staleSelectionAnnouncement;

    await openParticipant(page);
    // Dispatch selection and navigation in the same browser task so the
    // delayed 100 ms announcement cannot win the race before Next clears it.
    await page.evaluate(() => {
      document.querySelector('label[for="CHOICE_1"]').click();
      document.querySelector('#CHOICE button.next').click();
    });
    await expect(activeQuestion(page, 'CHECKS')).toBeVisible();
    await waitInHarness(page, 150);

    test.fail(true, `${defect.localDefectId}: ${defect.reason}`);
    await expect(page.locator('#ariaLiveSelectionAnnouncer')).toHaveText('', { timeout: 1_000 });
  });

  test('clears a delayed list-selection announcement when returning immediately', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'The asynchronous announcement race is characterized once in Chromium.');
    const defect = runtimeDefects.staleSelectionAnnouncement;

    await openParticipant(page);
    await activeQuestion(page, 'CHOICE').locator('label', { hasText: 'Blue' }).click();
    await waitInHarness(page, 150);
    await activeQuestion(page, 'CHOICE').getByRole('button', { name: 'Next question' }).click();
    await expect(activeQuestion(page, 'CHECKS')).toBeVisible();
    await page.evaluate(() => {
      document.querySelector('label[for="CHECKS_1"]').click();
      document.querySelector('#CHECKS button.previous').click();
    });
    await expect(activeQuestion(page, 'CHOICE')).toBeVisible();
    await waitInHarness(page, 150);

    test.fail(true, `${defect.localDefectId}: ${defect.reason}`);
    await expect(page.locator('#ariaLiveSelectionAnnouncer')).toHaveText('', { timeout: 1_000 });
  });

  test('production-shaped image markup supplies a text alternative and has no image-alt violation', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'The image-alt defect is characterized once in Chromium.');
    const defect = axeDefects.imageAlt;

    await openParticipant(page, { fixture: 'imageAlt.txt' });
    const image = activeQuestion(page, 'PLAIN').locator('img');
    await expect(image).toHaveAttribute('src', /FemaleBaldness1\.png$/);
    const alt = await image.getAttribute('alt');
    const imageAltFindings = (await analyzeQuestAxe(page)).filter((finding) => finding.id === defect.ruleId);

    test.fail(true, `${defect.localDefectId}: ${defect.reason}`);
    expect(alt).toMatch(/\S/);
    expect(imageAltFindings).toEqual([]);
  });
});
