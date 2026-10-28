import { test, expect } from './support/test.js';
import {
  activeQuestion,
  openParticipant,
} from './support/harness.js';
import { analyzeQuestAxe } from './support/axe.js';
import { axeDefects } from '../knownDefects/registry.js';

test.describe('accessibility lifecycle known defects @known-defect', () => {
  test('production-shaped image markup records an explicit alternative-text decision and has no image-alt violation', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'The image-alt defect is characterized once in Chromium.');
    const defect = axeDefects.imageAlt;

    await openParticipant(page, { fixture: 'imageAlt.txt' });
    const image = activeQuestion(page, 'PLAIN').locator('img');
    await expect(image).toHaveAttribute('src', /FemaleBaldness1\.png$/);
    const alt = await image.getAttribute('alt');
    const imageAltFindings = (await analyzeQuestAxe(page)).filter((finding) => finding.id === defect.ruleId);

    test.fail(true, `${defect.localDefectId}: ${defect.reason}`);
    expect(alt).not.toBeNull();
    expect(imageAltFindings).toEqual([]);
  });
});
