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

const module1Name = 'D_726699695_V2';
const module2Name = 'D_745268907_V2';
const covidName = 'D_793330426';

const siblingCount = 'D_694265648';
const siblingName = 'D_406098499';
const siblingSex = 'D_579563781';

const fertilityMedications = 'D_881200765';
const otherMedication = 'D_762700622';
const otherMedicationDuration = 'D_466346054';

const illnessCount = 'D_860011428';
const symptomPresence = 'D_694503437';
const otherSymptoms = 'D_110872086';
const otherSymptomsText = 'D_637540387';
const stillExperiencingOtherSymptoms = 'D_591826144';
const otherSymptomsDuration = 'D_934384452';
const illnessSummary = 'SRVCOV_COVSUMMARY_V1R0';
const illnessDate = 'D_686508359';
const illnessSymptoms = 'D_705336878';
const illnessOtherSymptomsText = 'D_218852075';

const vaccinationCount = 'D_877074400_V2';
const vaccinationQuestion = 'D_715581797_V2';
const vaccinationDate = 'D_141616126';
const vaccinationChoice = 'D_220055064';
const otherVaccineText = 'D_395747093';
const vaccinationSummary = 'SRVCOV_COV29_V1R0';

function expectNoRawPipe(question) {
  return expect(question).not.toContainText('{$');
}

test.describe('locked production response piping @corpus', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Production piping paths run once in Chromium.');
  });

  for (const language of ['en', 'es']) {
    test(`keeps ${language} sibling names isolated by loop iteration through Back and resume`, async ({ page }) => {
      const firstNameQuestion = `${siblingName}_1_1`;
      const firstSexQuestion = `${siblingSex}_1_1`;
      const nameBeforeEdit = 'Ari';
      const nameAfterEdit = 'Bea';
      const markdown = readLockedMarkdown('module1', language);

      await openParticipant(page, {
        markdown,
        lang: language,
        persistedData: {
          [siblingCount]: '2',
          [firstNameQuestion]: nameBeforeEdit,
          treeJSON: treeAtPath([siblingCount, 'SIBCONFIRM', firstNameQuestion, firstSexQuestion]),
        },
      });

      await expect(activeQuestion(page, firstSexQuestion)).toContainText(nameBeforeEdit);
      await expectNoRawPipe(activeQuestion(page, firstSexQuestion));
      await activeQuestion(page, firstSexQuestion).locator(`label[for="${firstSexQuestion}_536341288"]`).click();
      await goNext(page);
      await goBack(page);
      await goBack(page);

      await expect(activeQuestion(page, firstNameQuestion)).toBeVisible();
      // The generated form carries the loop suffix, while the authored
      // nickname textbox retains its source input ID.
      const nameInput = activeQuestion(page, firstNameQuestion).locator('input[type="text"]');
      await nameInput.fill(nameAfterEdit);
      await nameInput.blur();
      await goNext(page);
      await expect(activeQuestion(page, firstSexQuestion)).toContainText(nameAfterEdit);
      await expect(activeQuestion(page, firstSexQuestion)).not.toContainText(nameBeforeEdit);

      await flushHarness(page);
      const edited = await harnessSnapshot(page);
      expect(edited.state.survey).toMatchObject({ [firstNameQuestion]: nameAfterEdit });
      expect(edited.logs.storeCalls.some(({ changes }) => (
        changes[`${module1Name}.${firstNameQuestion}`] === nameAfterEdit
      ))).toBe(true);

      await rerenderParticipant(page, {
        markdown,
        lang: language,
        persistedData: {
          ...edited.state.survey,
          [`${siblingName}_2_2`]: 'Cleo',
          treeJSON: treeAtPath([`${siblingSex}_2_2`]),
        },
      });
      await expect(activeQuestion(page, `${siblingSex}_2_2`)).toContainText('Cleo');
      await expect(activeQuestion(page, `${siblingSex}_2_2`)).not.toContainText(nameAfterEdit);
      await expectHealthyHarness(page);
    });

    test(`pipes ${language} nested Other medication text into its follow-up and preserves its compound response`, async ({ page }) => {
      const medication = 'NovaMed 42';
      await openParticipant(page, {
        markdown: readLockedMarkdown('module2', language),
        lang: language,
        persistedData: { treeJSON: treeAtPath([fertilityMedications]) },
      });

      const source = activeQuestion(page, fertilityMedications);
      await source.locator(`label[for="${fertilityMedications}_807835037"]`).click();
      const otherInput = source.locator(`#${otherMedication}`);
      await otherInput.fill(medication);
      await otherInput.blur();
      await expect(source.locator(`#${fertilityMedications}_807835037`)).toBeChecked();
      await goNext(page);

      const followUp = activeQuestion(page, otherMedicationDuration);
      await expect(followUp).toContainText(medication);
      await expectNoRawPipe(followUp);
      await flushHarness(page);
      const snapshot = await harnessSnapshot(page);
      expect(snapshot.state.survey).toMatchObject({
        [fertilityMedications]: {
          [fertilityMedications]: ['807835037'],
          [otherMedication]: medication,
        },
      });
      expect(snapshot.logs.storeCalls.some(({ changes }) => (
        changes[`${module2Name}.${fertilityMedications}`]?.[otherMedication] === medication
      ))).toBe(true);

      await goBack(page);
      await expect(activeQuestion(page, fertilityMedications).locator(`#${fertilityMedications}_807835037`)).toBeChecked();
      await expect(activeQuestion(page, fertilityMedications).locator(`#${otherMedication}`)).toHaveValue(medication);
      await expectHealthyHarness(page);
    });

    test(`pipes ${language} Other symptom text into both downstream questions and restores it`, async ({ page }) => {
      const symptomText = 'vertigo and blurred vision';
      const markdown = readLockedMarkdown('moduleCOVID19', language);
      const sourceState = {
        [illnessCount]: '1',
        [`${symptomPresence}_1_1`]: '353358909',
        treeJSON: treeAtPath([`${otherSymptoms}`]),
      };
      await openParticipant(page, { markdown, lang: language, persistedData: sourceState });

      const source = activeQuestion(page, otherSymptoms);
      await source.locator(`label[for="${otherSymptoms}_707601969"]`).click();
      const input = source.locator(`#${otherSymptomsText}`);
      await input.fill(symptomText);
      await input.blur();
      await goNext(page);
      await expect(activeQuestion(page, stillExperiencingOtherSymptoms)).toContainText(symptomText);
      await expectNoRawPipe(activeQuestion(page, stillExperiencingOtherSymptoms));

      await flushHarness(page);
      const snapshot = await harnessSnapshot(page);
      expect(snapshot.state.survey).toMatchObject({
        [otherSymptoms]: {
          [otherSymptoms]: '707601969',
          [otherSymptomsText]: symptomText,
        },
      });

      await goBack(page);
      await expect(activeQuestion(page, otherSymptoms).locator(`#${otherSymptoms}_707601969`)).toBeChecked();
      await expect(activeQuestion(page, otherSymptoms).locator(`#${otherSymptomsText}`)).toHaveValue(symptomText);

      await rerenderParticipant(page, {
        markdown,
        lang: language,
        persistedData: {
          ...snapshot.state.survey,
          treeJSON: treeAtPath([otherSymptomsDuration]),
        },
      });
      await expect(activeQuestion(page, otherSymptomsDuration)).toContainText(symptomText);
      await expectNoRawPipe(activeQuestion(page, otherSymptomsDuration));
      await expectHealthyHarness(page);
    });

    test(`pipes ${language} looped vaccination date and Other vaccine text into its summary and resume`, async ({ page }) => {
      const vaccine = 'Covaxin';
      const dateQuestion = `${vaccinationQuestion}_1_1`;
      const choiceQuestion = `${vaccinationChoice}_1_1`;
      const monthInput = `${vaccinationDate}_1_1`;
      const otherInput = `${otherVaccineText}_1_1`;
      const summaryQuestion = `${vaccinationSummary}_1_1`;
      const markdown = readLockedMarkdown('moduleCOVID19', language);

      await openParticipant(page, {
        markdown,
        lang: language,
        persistedData: {
          [vaccinationCount]: '1',
          treeJSON: treeAtPath([dateQuestion]),
        },
      });
      await activeQuestion(page, dateQuestion).locator(`#${monthInput}`).fill('2022-03');
      await activeQuestion(page, dateQuestion).locator(`#${monthInput}`).blur();
      await goNext(page);
      await expect(activeQuestion(page, choiceQuestion)).toBeVisible();
      await activeQuestion(page, choiceQuestion).locator(`label[for="${choiceQuestion}_807835037"]`).click();
      await activeQuestion(page, choiceQuestion).locator(`#${otherInput}`).fill(vaccine);
      await activeQuestion(page, choiceQuestion).locator(`#${otherInput}`).blur();
      await goNext(page);

      const summary = activeQuestion(page, summaryQuestion);
      await expect(summary).toContainText('2022-03');
      await expect(summary).toContainText(vaccine);
      await expectNoRawPipe(summary);
      await flushHarness(page);
      const snapshot = await harnessSnapshot(page);
      expect(snapshot.state.survey).toMatchObject({
        [vaccinationCount]: '1',
        [dateQuestion]: '2022-03',
        [choiceQuestion]: {
          [choiceQuestion]: '807835037',
          [otherInput]: vaccine,
        },
      });
      expect(snapshot.logs.storeCalls.some(({ changes }) => (
        changes[`${covidName}.${choiceQuestion}`]?.[otherInput] === vaccine
      ))).toBe(true);

      // Quest persists the current form immediately before it swaps to the
      // summary. Supply the completed navigation tree to exercise a true
      // resume at the piped summary, rather than the preceding choice form.
      await rerenderParticipant(page, {
        markdown,
        lang: language,
        persistedData: {
          ...snapshot.state.survey,
          treeJSON: treeAtPath([dateQuestion, choiceQuestion, summaryQuestion]),
        },
      });
      await expect(activeQuestion(page, summaryQuestion)).toContainText('2022-03');
      await expect(activeQuestion(page, summaryQuestion)).toContainText(vaccine);
      await expectHealthyHarness(page);
    });

    test(`renders ${language} checkbox Other symptom text in the real COVID displayList summary`, async ({ page }) => {
      const otherSymptom = 'post-viral brain fog';
      const summaryQuestion = `${illnessSummary}_1_1`;
      await openParticipant(page, {
        markdown: readLockedMarkdown('moduleCOVID19', language),
        lang: language,
        persistedData: {
          [illnessCount]: '1',
          [`${illnessDate}_1_1`]: '2024-02',
          [`${symptomPresence}_1_1`]: '353358909',
          [`${illnessSymptoms}_1_1`]: {
            [`${illnessSymptoms}_1_1`]: ['807835037'],
            [`${illnessOtherSymptomsText}_1_1`]: otherSymptom,
          },
          treeJSON: treeAtPath([summaryQuestion]),
        },
      });

      const summary = activeQuestion(page, summaryQuestion);
      await expect(summary).toContainText(otherSymptom);
      await expect(summary).toContainText('2024-02');
      await expectNoRawPipe(summary);
      await expectHealthyHarness(page);
    });
  }
});
