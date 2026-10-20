import { test, expect } from './support/test.js';
import {
  activeQuestion,
  flushHarness,
  goNext,
  harnessSnapshot,
  selectLabeledResponse,
} from './support/harness.js';

async function openManualScenario(page, query) {
  await page.goto(`/tests/harness/participant.html?${query}`);
  await page.waitForFunction(() => window.questHarness?.snapshot().logs.renders.length === 1);
  await expect(activeQuestion(page)).toBeVisible();
}

test.describe('documented manual accessibility URLs @canonical', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Manual URL smoke coverage runs once in Chromium.');
  });

  test('reaches both requested- and required-response dialogs', async ({ page }) => {
    await openManualScenario(page, 'fixture=unansweredModals.txt');
    await goNext(page);
    await expect(page.getByRole('dialog', { name: 'Response Requested' })).toBeVisible();

    await page.getByRole('button', { name: 'Continue Without Answering' }).click();
    await expect(activeQuestion(page, 'HARD')).toBeVisible();
    await goNext(page);
    await expect(page.getByRole('dialog', { name: 'Response Required' })).toBeVisible();
  });

  test('reaches the submit dialog', async ({ page }) => {
    await openManualScenario(page, 'fixture=validation.txt');
    await activeQuestion(page, 'BOUNDED').locator('#bounded').fill('2');
    await goNext(page);
    await activeQuestion(page, 'END').getByRole('button', { name: 'Submit your survey' }).click();
    await expect(page.getByRole('dialog', { name: 'Submit Answers' })).toBeVisible();
  });

  for (const responseCase of [
    {
      description: 'English',
      query: 'fixture=responseConfirmation.txt&lang=en',
      lang: 'en',
      dialogName: 'Response Requested',
      descriptionText: 'Is this weight correct?',
    },
    {
      description: 'Spanish',
      query: 'fixture=responseConfirmationSpanish.txt&lang=es',
      lang: 'es',
      dialogName: 'Respuesta Solicitada',
      descriptionText: '¿Este peso es correcto?',
    },
  ]) {
    test(`reaches the ${responseCase.description} response-confirmation dialog`, async ({ page }) => {
      await openManualScenario(page, responseCase.query);
      await expect(page.locator('html')).toHaveAttribute('lang', responseCase.lang);
      const weight = activeQuestion(page, 'D_724181652').locator('input[type="number"]');
      await weight.fill('65');
      await weight.blur();
      const dialog = page.getByRole('dialog', { name: responseCase.dialogName });
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveAccessibleDescription(responseCase.descriptionText);
    });
  }

  test('reaches the configured store-failure dialog', async ({ page }) => {
    await openManualScenario(page, 'fixture=navigationState.txt&scenario=store-failure');
    await selectLabeledResponse(page, 'Yes');
    await goNext(page);
    await flushHarness(page);
    await expect(page.getByRole('dialog', { name: 'Error saving response' })).toBeVisible();
  });

  test('reaches the configured asynchronous success state', async ({ page }) => {
    await openManualScenario(page, 'fixture=asyncQuestion.txt&scenario=async-success');
    await selectLabeledResponse(page, 'Clinical');
    await goNext(page);
    await expect(activeQuestion(page, 'ASYNC').locator('#ASYNC_A')).toBeVisible();
  });

  test('reaches the configured asynchronous error state', async ({ page }) => {
    await openManualScenario(page, 'fixture=asyncQuestion.txt&scenario=async-error');
    await selectLabeledResponse(page, 'Research');
    await goNext(page);
    const error = activeQuestion(page, 'ASYNC').locator('.validation-container');
    await expect(error).toHaveText('Error fetching question. Please go back and try again.');
    await expect(error).toHaveAttribute('tabindex', '-1');
    await expect(error).not.toHaveAttribute('role');
    await expect(error).toBeFocused();
    await expect(activeQuestion(page, 'ASYNC').locator('fieldset')).not.toContainText('Loading...');
  });

  for (const weightCase of [
    {
      description: 'English',
      query: 'fixture=module1WeightHistory.txt&scenario=weight-history-en&lang=en',
      lang: 'en',
      names: [
        'a. 18 years old, Pounds (lbs)',
        'b. 25 years old, Pounds (lbs)',
        'c. 35 years old, Pounds (lbs)',
        'd. 45 years old, Pounds (lbs)',
        'e. 55 years old, Pounds (lbs)',
      ],
    },
    {
      description: 'Spanish',
      query: 'fixture=module1WeightHistorySpanish.txt&scenario=weight-history-es&lang=es',
      lang: 'es',
      names: [
        'a. 18 años, NÚM. DE LIBRAS (lbs)',
        'b. 25 años, NÚM. DE LIBRAS (lbs)',
        'c. 35 años, NÚM. DE LIBRAS (lbs)',
        'd. 45 años, NÚM. DE LIBRAS (lbs)',
        'e. 55 años, NÚM. DE LIBRAS (lbs)',
      ],
    },
  ]) {
    test(`reaches all five ${weightCase.description} weight-history fields`, async ({ page }) => {
      await openManualScenario(page, weightCase.query);
      await expect(page.locator('html')).toHaveAttribute('lang', weightCase.lang);
      const inputs = activeQuestion(page, 'D_912857732').locator('input[type="number"]:visible');
      await expect(inputs).toHaveCount(weightCase.names.length);
      for (const [index, name] of weightCase.names.entries()) {
        await expect(inputs.nth(index)).toHaveAccessibleName(name);
      }
      await inputs.first().pressSequentially('18.5');
      await expect(inputs.first()).toHaveValue('185');
    });
  }

  test('rejects unsupported scenario and language query values before rendering', async ({ page }) => {
    for (const query of [
      'scenario=async-success',
      'lang=es',
      'fixture=asyncQuestion.txt&scenario=unknown',
      'fixture=responseConfirmation.txt&lang=fr',
      'fixture=validation.txt&scenario=async-success',
    ]) {
      await page.goto(`/tests/harness/participant.html?${query}`);
      await page.waitForFunction(() => window.questHarness?.snapshot().logs.errors.length === 1);
      const snapshot = await harnessSnapshot(page);
      expect(snapshot.logs.renders).toHaveLength(0);
      expect(snapshot.activeQuestionId).toBeNull();
    }
  });
});
