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
import { readLockedMarkdown, rerenderParticipant, treeAtPath } from './support/corpus.js';

const questName = 'D_745268907_V2';
const currentPregnancy = 'D_849945160';
const pregnancyCount = 'D_405571048';
const pregnancyAge = 'D_968816827';
const pregnancyOutcome = 'D_391951010';
const pregnancySummary = 'PREGSUMMARY';

async function renderFromPersisted(page, { markdown, language, persistedData }) {
  const result = await rerenderParticipant(page, {
    markdown,
    lang: language,
    previousResults: { age: '45', yob: '1981' },
    persistedData,
  });
  expect(result.result).toBe(true);
}

test.describe('locked Module 2 pregnancy loop participant paths @corpus', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'The production pregnancy path runs once in Chromium.');
  });

  for (const language of ['en', 'es']) {
    test(`keeps completed and current ${language} pregnancies isolated across summaries, Back, and resume`, async ({ page }) => {
      const markdown = readLockedMarkdown('module2', language);
      const age1 = `${pregnancyAge}_1_1`;
      const outcome1 = `${pregnancyOutcome}_1_1`;
      const summary1 = `${pregnancySummary}_1_1`;
      const age2 = `${pregnancyAge}_2_2`;
      const outcome2 = `${pregnancyOutcome}_2_2`;
      const summary2 = `${pregnancySummary}_2_2`;

      await openParticipant(page, {
        markdown,
        lang: language,
        previousResults: { age: '45', yob: '1981' },
        persistedData: {
          [currentPregnancy]: '353358909',
          [pregnancyCount]: '2',
          treeJSON: treeAtPath([age1]),
        },
      });

      const firstAgeInput = activeQuestion(page, age1).locator('input[type="number"]');
      await expect(firstAgeInput).toHaveAttribute('data-min', '0');
      await expect(firstAgeInput).toHaveAttribute('data-max', '45');
      await firstAgeInput.fill('29');
      await firstAgeInput.blur();
      await goNext(page);

      await expect(activeQuestion(page, outcome1)).toBeVisible();
      await activeQuestion(page, outcome1).locator(`label[for="${outcome1}_306890578"]`).click();
      await goNext(page);

      const firstSummary = activeQuestion(page, summary1);
      await expect(firstSummary).toBeVisible();
      await expect(firstSummary).toContainText('29');
      await expect(firstSummary).not.toContainText('{$');

      await goNext(page);
      await expect(activeQuestion(page, age2)).toBeVisible();
      const secondAgeInput = activeQuestion(page, age2).locator('input[type="number"]');
      await secondAgeInput.fill('31');
      await secondAgeInput.blur();
      await goNext(page);

      // The final pregnancy is the current pregnancy. Its age is collected,
      // while outcome questions that only apply to completed pregnancies are skipped.
      await expect(activeQuestion(page, summary2)).toBeVisible();
      await expect(page.locator(`#questionnaireRoot form.question.active#${outcome2}`)).toHaveCount(0);
      await expect(activeQuestion(page, summary2)).toContainText('31');
      await expect(activeQuestion(page, summary2)).not.toContainText('{$');

      await goBack(page);
      await expect(activeQuestion(page, age2)).toBeVisible();
      await expect(activeQuestion(page, age2).locator('input[type="number"]')).toHaveValue('31');
      await goNext(page);
      await expect(activeQuestion(page, summary2)).toBeVisible();

      await flushHarness(page);
      const completed = await harnessSnapshot(page);
      expect(completed.state.survey).toMatchObject({
        [currentPregnancy]: '353358909',
        [pregnancyCount]: '2',
        [age1]: '29',
        [outcome1]: '306890578',
        [age2]: '31',
      });
      expect(completed.state.survey).not.toHaveProperty(outcome2);
      expect(completed.logs.storeCalls).toEqual(expect.arrayContaining([
        expect.objectContaining({ changes: expect.objectContaining({ [`${questName}.${age1}`]: '29' }) }),
        expect.objectContaining({ changes: expect.objectContaining({ [`${questName}.${outcome1}`]: '306890578' }) }),
        expect.objectContaining({ changes: expect.objectContaining({ [`${questName}.${age2}`]: '31' }) }),
      ]));

      await renderFromPersisted(page, {
        markdown,
        language,
        persistedData: {
          ...completed.state.survey,
          treeJSON: treeAtPath([age1, outcome1, summary1, age2, summary2]),
        },
      });
      await expect(activeQuestion(page, summary2)).toBeVisible();
      await expect(activeQuestion(page, summary2)).toContainText('31');
      await expectHealthyHarness(page);
    });
  }
});
