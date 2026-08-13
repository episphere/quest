import path from 'node:path';

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
import { accessibilityDefects } from '../knownDefects/registry.js';
import {
  readLockedMarkdown,
  repositoryRoot,
  rerenderParticipant,
  treeAt,
} from './support/corpus.js';

const dietQuestion = 'D_916948380';
const dietVegetables = 'D_970075000';
const dietFruit = 'D_724001040';
const module4Name = 'D_716117817';
const commuteModes = 'D_421586693';
const commuteDuration = 'D_733638576';
const carDuration = 'D_583216333';
const taxiDuration = 'D_920653797';
const commuteFollowUpImage = 'https://user-images.githubusercontent.com/64271614/86169815-34d86f80-bae8-11ea-98a6-1b3de33fedf0.png';
const localImageAsset = path.join(repositoryRoot, 'tests/e2e/assets/FemaleBaldness1.png');

async function chooseRadio(question, name, value) {
  await question.locator(`label[for="${name}_${value}"]`).click();
}

test.describe('locked production compound-response forms @corpus', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Production compound flows run once in Chromium.');
  });

  test('Diet Screener keeps radio subgroups independent through partial completion, Back, and reload', async ({ page }) => {
    const markdown = readLockedMarkdown('moduleDietScreener');
    await openParticipant(page, {
      markdown,
      persistedData: { treeJSON: treeAt(dietQuestion, 'INTRO_SRVDSQ') },
    });

    const question = activeQuestion(page, dietQuestion);
    await expect(question).toBeVisible();
    expect(await question.locator('input[type="radio"]').evaluateAll((inputs) => (
      new Set(inputs.map((input) => input.name)).size
    ))).toBe(20);

    await chooseRadio(question, dietVegetables, '192247286');
    await chooseRadio(question, dietFruit, '351464854');
    await expect(question.locator(`#${dietVegetables}_192247286`)).toBeChecked();
    await expect(question.locator(`#${dietFruit}_351464854`)).toBeChecked();

    // Diet Screener allows a participant to continue after a partial page.
    // Preserve the two independent values before checking its Back/reload path.
    await goNext(page);
    await expect(page.getByRole('button', { name: 'Submit your survey' })).toBeVisible();

    await flushHarness(page);
    const partial = await harnessSnapshot(page);
    expect(partial.state.survey).toMatchObject({
      [dietQuestion]: {
        [dietVegetables]: '192247286',
        [dietFruit]: '351464854',
      },
    });

    await page.getByRole('button', { name: 'Back to the previous section' }).click();
    await expect(activeQuestion(page, dietQuestion)).toBeVisible();
    await expect(activeQuestion(page, dietQuestion).locator(`#${dietVegetables}_192247286`)).toBeChecked();
    await expect(activeQuestion(page, dietQuestion).locator(`#${dietFruit}_351464854`)).toBeChecked();

    await rerenderParticipant(page, {
      markdown,
      lang: 'en',
      persistedData: {
        ...partial.state.survey,
        treeJSON: treeAt(dietQuestion, 'INTRO_SRVDSQ'),
      },
    });
    const restored = activeQuestion(page, dietQuestion);
    await expect(restored.locator(`#${dietVegetables}_192247286`)).toBeChecked();
    await expect(restored.locator(`#${dietFruit}_351464854`)).toBeChecked();
    await expect(restored.locator(`#${dietVegetables}_351464854`)).not.toBeChecked();
    await expectHealthyHarness(page);
  });

  test('Module 4 commute duration limits visible subgroups to selected modes and persists them independently', async ({ page }) => {
    const markdown = readLockedMarkdown('module4');
    const selectedModes = ['767755239', '385609081'];
    // The valid selected-mode transition leads to a production image. It is
    // unrelated to this contract, so retain the suite's boundary by
    // serving an existing checked-in PNG in place of the remote asset.
    await page.route(commuteFollowUpImage, (route) => route.fulfill({
      status: 200,
      contentType: 'image/png',
      path: localImageAsset,
    }));
    await openParticipant(page, {
      markdown,
      persistedData: {
        [commuteModes]: selectedModes,
        treeJSON: treeAt(commuteDuration, commuteModes),
      },
    });

    const question = activeQuestion(page, commuteDuration);
    await expect(question).toBeVisible();
    await expect(question.locator(`input[name="${carDuration}"]`)).toHaveCount(5);
    await expect(question.locator(`input[name="${taxiDuration}"]`)).toHaveCount(5);
    // Quest visually hides native choice inputs in every response. Assert the
    // response containers instead, which distinguishes suppressed mode rows.
    await expect(question.locator(`input[name="${carDuration}"]`).first().locator('xpath=..')).toBeVisible();
    await expect(question.locator(`input[name="${taxiDuration}"]`).first().locator('xpath=..')).toBeVisible();
    await expect(question.locator('input[name="D_843066684"]').first().locator('xpath=..')).toBeHidden();

    await chooseRadio(question, carDuration, '248303092');
    await chooseRadio(question, taxiDuration, '638092100');
    await goNext(page);
    await expect(activeQuestion(page, 'D_166943843')).toBeVisible();

    await flushHarness(page);
    const completed = await harnessSnapshot(page);
    const expectedDurations = {
      [carDuration]: '248303092',
      [taxiDuration]: '638092100',
    };
    expect(completed.state.survey).toMatchObject({ [commuteDuration]: expectedDurations });
    expect(completed.logs.storeCalls.some(({ changes }) => (
      JSON.stringify(changes[`${module4Name}.${commuteDuration}`]) === JSON.stringify(expectedDurations)
    ))).toBe(true);

    await goBack(page);
    const returned = activeQuestion(page, commuteDuration);
    await expect(returned.locator(`#${carDuration}_248303092`)).toBeChecked();
    await expect(returned.locator(`#${taxiDuration}_638092100`)).toBeChecked();

    await rerenderParticipant(page, {
      markdown,
      lang: 'en',
      persistedData: {
        ...completed.state.survey,
        treeJSON: treeAt(commuteDuration, commuteModes),
      },
    });
    const restored = activeQuestion(page, commuteDuration);
    await expect(restored.locator(`#${carDuration}_248303092`)).toBeChecked();
    await expect(restored.locator(`#${taxiDuration}_638092100`)).toBeChecked();
    await expect(restored.locator('input[name="D_843066684"]').first().locator('xpath=..')).toBeHidden();
    await expectHealthyHarness(page);
  });

  test('Diet Screener choices expose both the food subgroup and answer in their accessible names @known-defect', async ({ page }) => {
    await openParticipant(page, {
      markdown: readLockedMarkdown('moduleDietScreener'),
      persistedData: { treeJSON: treeAt(dietQuestion) },
    });

    const question = activeQuestion(page, dietQuestion);
    await expect(question).toBeVisible();
    expect(await question.locator('input[type="radio"]').count()).toBeGreaterThan(0);
    test.fail(true, `${accessibilityDefects.compoundQuestionContext.localDefectId}: ${accessibilityDefects.compoundQuestionContext.reason}`);
    await expect(question.getByRole('radio', { name: /Vegetables.*1 per week|1 per week.*Vegetables/ }))
      .toHaveCount(1, { timeout: 1_000 });
    await expect(question.getByRole('radio', { name: /Fruit.*1 per day|1 per day.*Fruit/ }))
      .toHaveCount(1, { timeout: 1_000 });
  });
});
