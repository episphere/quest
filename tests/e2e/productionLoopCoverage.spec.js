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
const illnessCount = 'D_860011428';
const firstIllness = 'D_980800222_V2';
const symptomQuestion = 'D_694503437';
const siblingCount = 'D_694265648';
const vaccinationCount = 'D_877074400_V2';
const vaccinationDate = 'D_715581797_V2';
const vaccinationMonth = 'D_141616126';
const vaccinationChoice = 'D_220055064';
const vaccinationSummary = 'SRVCOV_COV29_V1R0';

test.describe('locked production COVID loop participant paths @corpus', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Production loop paths run once in Chromium.');
  });

  test('skips the first generated Module 1 sibling form before it is displayed when the valid count is zero', async ({ page }) => {
    await openParticipant(page, {
      markdown: readLockedMarkdown('module1'),
      persistedData: {
        [siblingCount]: '0',
        treeJSON: treeAtPath([siblingCount]),
      },
    });

    await expect(activeQuestion(page, siblingCount).locator(`#${siblingCount}`)).toHaveValue('0');
    await goNext(page);
    await expect(activeQuestion(page, 'SIBCONFIRM')).toBeVisible();
    await goNext(page);
    await expect(activeQuestion(page, 'CHILD')).toBeVisible();
    await expect(page.locator('#questionnaireRoot form.question.active#D_406098499_1_1')).toHaveCount(0);
    await expectHealthyHarness(page);
  });

  test('captures the generated COVID month form through the delegated focusout path', async ({ page }) => {
    await openParticipant(page, {
      markdown: readLockedMarkdown('moduleCOVID19'),
      persistedData: {
        [illnessCount]: '2',
        treeJSON: treeAtPath([`${firstIllness}_2_2`]),
      },
    });

    const month = activeQuestion(page, `${firstIllness}_2_2`).locator('#D_686508359_2_2');
    await expect(month).toBeVisible();
    await month.fill('2024-02');
    await expect(month).toHaveValue('2024-02');
    await month.blur();

    const beforeNext = await harnessSnapshot(page);
    expect(beforeNext.state.active).toMatchObject({
      [`${firstIllness}_2_2`]: '2024-02',
    });

    await goNext(page);
    await expect(activeQuestion(page, 'D_366980310_2_2')).toBeVisible();
    await flushHarness(page);
    const afterNext = await harnessSnapshot(page);
    expect(afterNext.state.survey).toMatchObject({
      [illnessCount]: '2',
      [`${firstIllness}_2_2`]: '2024-02',
    });
    expect(afterNext.logs.storeCalls.at(-1).changes)
      .toMatchObject({ [`D_793330426.${firstIllness}_2_2`]: '2024-02' });
    await expectHealthyHarness(page);
  });

  for (const language of ['en', 'es']) {
    test(`completes and resumes two ${language} COVID vaccination iterations with their own stored keys`, async ({ page }) => {
      await openParticipant(page, {
        markdown: readLockedMarkdown('moduleCOVID19', language),
        lang: language,
        persistedData: {
          [vaccinationCount]: '2',
          treeJSON: treeAtPath([`${vaccinationDate}_1_1`]),
        },
      });

      const completeDate = async (iteration, value) => {
        const dateQuestionId = `${vaccinationDate}_${iteration}_${iteration}`;
        const month = activeQuestion(page, dateQuestionId).locator(`#${vaccinationMonth}_${iteration}_${iteration}`);
        await expect(month).toBeVisible();
        await month.fill(value);
        await month.blur();
        await goNext(page);
        await expect(activeQuestion(page, `${vaccinationChoice}_${iteration}_${iteration}`)).toBeVisible();
      };
      const completeChoice = async (iteration) => {
        const choiceQuestionId = `${vaccinationChoice}_${iteration}_${iteration}`;
        await activeQuestion(page).locator(`label[for="${choiceQuestionId}_657978450"]`).click();
        await goNext(page);
        await expect(activeQuestion(page, `${vaccinationSummary}_${iteration}_${iteration}`)).toBeVisible();
      };

      await completeDate(1, '2021-02');
      await expect(activeQuestion(page, `${vaccinationChoice}_1_1`)).toBeVisible();
      await completeChoice(1);

      await goNext(page);
      await expect(activeQuestion(page, `${vaccinationDate}_2_2`)).toBeVisible();
      await goBack(page);
      await expect(activeQuestion(page, `${vaccinationSummary}_1_1`)).toBeVisible();
      await goNext(page);
      await expect(activeQuestion(page, `${vaccinationDate}_2_2`)).toBeVisible();

      await completeDate(2, '2022-03');
      await completeChoice(2);
      await goNext(page);
      await expect(activeQuestion(page, 'END')).toBeVisible();
      await flushHarness(page);

      const persisted = await harnessSnapshot(page);
      expect(persisted.state.survey).toMatchObject({
        [vaccinationCount]: '2',
        [`${vaccinationDate}_1_1`]: '2021-02',
        [`${vaccinationChoice}_1_1`]: {
          [`${vaccinationChoice}_1_1`]: '657978450',
        },
        [`${vaccinationDate}_2_2`]: '2022-03',
        [`${vaccinationChoice}_2_2`]: {
          [`${vaccinationChoice}_2_2`]: '657978450',
        },
      });
      expect(persisted.state.survey).not.toHaveProperty(vaccinationChoice);
      expect(JSON.parse(persisted.state.survey.treeJSON).currentNode).toBe(`${vaccinationSummary}_2_2`);
      const storedChanges = persisted.logs.storeCalls.map(({ changes }) => changes);
      expect(storedChanges).toEqual(expect.arrayContaining([
        expect.objectContaining({ [`D_793330426.${vaccinationDate}_1_1`]: '2021-02' }),
        expect.objectContaining({ [`D_793330426.${vaccinationChoice}_1_1`]: expect.any(Object) }),
        expect.objectContaining({ [`D_793330426.${vaccinationDate}_2_2`]: '2022-03' }),
        expect.objectContaining({ [`D_793330426.${vaccinationChoice}_2_2`]: expect.any(Object) }),
      ]));

      await rerenderParticipant(page, {
        markdown: readLockedMarkdown('moduleCOVID19', language),
        persistedData: persisted.state.survey,
        lang: language,
      });
      // Quest stores treeJSON before swapping the next form, so a resumed participant
      // returns to the persisted summary rather than the just-rendered destination.
      await expect(activeQuestion(page, `${vaccinationSummary}_2_2`)).toBeVisible();
      await expectHealthyHarness(page);
    });
  }

  for (const language of ['en', 'es']) {
    test(`restores ${language} COVID iteration 2 and Back crosses its real loop boundary`, async ({ page }) => {
      await openParticipant(page, {
        markdown: readLockedMarkdown('moduleCOVID19', language),
        lang: language,
        persistedData: {
          [illnessCount]: '2',
          D_686508359_1_1: '2024-01',
          [`${symptomQuestion}_1_1`]: '104430631',
          treeJSON: treeAtPath([
            `${symptomQuestion}_1_1`,
            '_CONTINUE1_1_1',
            `${firstIllness}_2_2`,
          ]),
        },
      });

      await expect(activeQuestion(page, `${firstIllness}_2_2`)).toBeVisible();
      await goBack(page);
      await expect(activeQuestion(page, `${symptomQuestion}_1_1`)).toBeVisible();
      await expect(activeQuestion(page).locator(`input[value="104430631"]`)).toBeChecked();

      const snapshot = await expectHealthyHarness(page);
      expect(snapshot.state.survey).toMatchObject({
        [illnessCount]: '2',
        D_686508359_1_1: '2024-01',
        [`${symptomQuestion}_1_1`]: '104430631',
      });
    });

    test(`stores and resumes ${language} COVID iteration-specific choice response keys`, async ({ page }) => {
      const initialData = {
        [illnessCount]: '2',
        treeJSON: treeAtPath(['D_366980310_2_2']),
      };
      await openParticipant(page, {
        markdown: readLockedMarkdown('moduleCOVID19', language),
        lang: language,
        persistedData: initialData,
      });

      await expect(activeQuestion(page, 'D_366980310_2_2')).toBeVisible();
      await activeQuestion(page).locator('label[for="D_366980310_2_2_104430631"]').click();
      await goNext(page);
      await expect(activeQuestion(page, 'D_498462481_2_2')).toBeVisible();
      await flushHarness(page);

      const beforeReload = await harnessSnapshot(page);
      expect(beforeReload.state.survey).toMatchObject({
        [illnessCount]: '2',
        D_366980310_2_2: '104430631',
      });
      expect(beforeReload.state.survey).not.toHaveProperty('D_366980310');

      await rerenderParticipant(page, {
        markdown: readLockedMarkdown('moduleCOVID19', language),
        persistedData: beforeReload.state.survey,
        lang: language,
      });

      await expect(activeQuestion(page, 'D_366980310_2_2')).toBeVisible();
      const restored = await expectHealthyHarness(page);
      expect(restored.state.survey).toMatchObject({
        [illnessCount]: '2',
        D_366980310_2_2: '104430631',
      });
    });
  }
});
