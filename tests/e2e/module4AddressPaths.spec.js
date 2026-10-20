import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from './support/test.js';
import {
  activeQuestion,
  expectHealthyHarness,
  flushHarness,
  goBack,
  goNext,
  harnessSnapshot,
  openParticipant,
  readCanonicalFixture,
  selectLabeledResponse,
} from './support/harness.js';

const DESKTOP_ENGINES = new Set(['chromium-desktop', 'firefox-desktop', 'webkit-desktop']);
const englishAddressFixture = readCanonicalFixture('module4AddressPaths.txt');
const spanishAddressFixture = readCanonicalFixture('module4AddressPathsSpanish.txt');
const corpusLock = JSON.parse(readFileSync(resolve('tests/corpus/lock.json'), 'utf8'));

function readLockedModule4(locale) {
  const entry = corpusLock.files.find((file) => file.module === 'module4' && file.locale === locale);
  return readFileSync(resolve(corpusLock.cacheRoot, corpusLock.commit, entry.path), 'utf8');
}

function treeAt(questionId) {
  return JSON.stringify({
    rootNode: { value: null, children: [{ value: questionId, children: [] }] },
    currentNode: questionId,
  });
}

function treeThrough(previousQuestionId, currentQuestionId) {
  return JSON.stringify({
    rootNode: {
      value: null,
      children: [{ value: previousQuestionId, children: [{ value: currentQuestionId, children: [] }] }],
    },
    currentNode: currentQuestionId,
  });
}

async function fillCompletePrimaryAddress(page) {
  const question = activeQuestion(page, 'D_121490150');
  await question.locator('#D_255248624').fill('123');
  await question.locator('#D_945532934').fill('Main Street');
  await question.locator('#D_469838242').fill('Apt 4');
  await question.locator('#D_303500597').fill('Baltimore');
  await question.locator('#D_195068098').fill('Maryland');
  await question.locator('#D_202784871').fill('21201');
  const country = question.locator('#D_831127170');
  await country.fill('United States');
  // Address state is finalized by Quest's delegated focusout handler. Make
  // that participant boundary explicit before exercising branching logic.
  await country.blur();
}

async function continueWithoutAnswering(page, language = 'en') {
  const name = language === 'es' ? 'Continuar Sin Responder' : 'Continue Without Answering';
  await page.getByRole('button', { name }).click();
}

test.describe('Module 4 residential-address paths @canonical @corpus', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(!DESKTOP_ENGINES.has(testInfo.project.name), 'Address paths run in the desktop browser matrix.');
  });

  for (const addressCase of [
    {
      locale: 'English',
      markdown: englishAddressFixture,
      lang: 'en',
      names: [
        'Street number',
        'Full Street name',
        'Apartment, suite, unit, building, etc.',
        'City',
        'State/Province',
        'Zip code',
        'Country',
      ],
      backupNames: ['City:', 'State/Province:', 'Zip code:', 'Country:'],
    },
    {
      locale: 'Spanish',
      markdown: spanishAddressFixture,
      lang: 'es',
      names: [
        'Número de la calle',
        'Nombre completo de la calle',
        'Apartamento, suite, unidad, edificio, etc.',
        'Ciudad',
        'Estado o provincia',
        'Código postal',
        'País',
      ],
      backupNames: ['Ciudad:', 'Estado o provincia:', 'Código postal:', 'País:'],
    },
  ]) {
    test(`gives every ${addressCase.locale} address field its accessible name`, async ({ page }) => {
      await openParticipant(page, { markdown: addressCase.markdown, lang: addressCase.lang });
      const addressInputs = activeQuestion(page, 'D_121490150').locator('input[type="text"]');
      await expect(addressInputs).toHaveCount(addressCase.names.length);

      for (const [index, accessibleName] of addressCase.names.entries()) {
        await expect(addressInputs.nth(index)).toHaveAccessibleName(accessibleName);
      }

      expect(await addressInputs.evaluateAll((inputs) => (
        new Set(inputs.map((input) => input.getAttribute('aria-label'))).size
      ))).toBe(addressCase.names.length);

      await goNext(page);
      await continueWithoutAnswering(page, addressCase.lang);
      const backupInputs = activeQuestion(page, 'D_920576363').locator('input[type="text"]:visible');
      await expect(backupInputs).toHaveCount(addressCase.backupNames.length);
      for (const [index, accessibleName] of addressCase.backupNames.entries()) {
        await expect(backupInputs.nth(index)).toHaveAccessibleName(accessibleName);
      }
      expect(await backupInputs.evaluateAll((inputs) => (
        new Set(inputs.map((input) => input.getAttribute('aria-label'))).size
      ))).toBe(addressCase.backupNames.length);
      await expectHealthyHarness(page);
    });
  }

  test('keeps a complete primary address out of backup and intersection fallbacks, then stores and reuses it', async ({ page }) => {
    await openParticipant(page, { markdown: englishAddressFixture });
    await fillCompletePrimaryAddress(page);
    await goNext(page);

    await expect(activeQuestion(page, 'HOMEADD4_1')).toBeVisible();
    await expect(activeQuestion(page, 'D_920576363')).toHaveCount(0);
    await expect(activeQuestion(page, 'D_804504024')).toHaveCount(0);
    await expect(activeQuestion(page, 'HOMEADD4_1')).toContainText('Main Street');
    await expect(activeQuestion(page, 'HOMEADD4_1')).toContainText('Baltimore');
    await expect(activeQuestion(page, 'HOMEADD4_1')).toContainText('United States');

    await goNext(page);
    await selectLabeledResponse(page, 'Yes');
    await goNext(page);
    await expect(activeQuestion(page, 'D_574985342')).toContainText('Main Street');
    await expect(activeQuestion(page, 'D_574985342')).toContainText('Baltimore');

    await flushHarness(page);
    const snapshot = await harnessSnapshot(page);
    const completeAddress = {
      D_255248624: '123',
      D_945532934: 'Main Street',
      D_469838242: 'Apt 4',
      D_303500597: 'Baltimore',
      D_195068098: 'Maryland',
      D_202784871: '21201',
      D_831127170: 'United States',
    };
    expect(snapshot.state.survey.D_121490150).toEqual(completeAddress);
    const addressStoreCall = snapshot.logs.storeCalls.find(({ changes }) => (
      Object.hasOwn(changes, 'D_716117817.D_121490150')
    ));
    expect(addressStoreCall).toBeTruthy();
    expect(addressStoreCall.changes['D_716117817.D_121490150']).toEqual(completeAddress);
    expect(Object.keys(addressStoreCall.changes)).toEqual(expect.arrayContaining([
      'D_716117817.D_121490150',
      'D_716117817.treeJSON',
    ]));
    await expectHealthyHarness(page);
  });

  test('uses secondary location fields and cross streets only for the no-street partition, then displays all entered values', async ({ page }) => {
    await openParticipant(page, { markdown: englishAddressFixture });
    await goNext(page);
    await continueWithoutAnswering(page);
    await expect(activeQuestion(page, 'D_920576363')).toBeVisible();
    await activeQuestion(page, 'D_920576363').locator('#D_725583683').fill('Lakeview');
    await goNext(page);
    await expect(activeQuestion(page, 'D_804504024')).toBeVisible();
    await activeQuestion(page, 'D_804504024').locator('#D_105043152').fill('First Street');
    await activeQuestion(page, 'D_804504024').locator('#D_543135391').fill('Second Avenue');
    await goNext(page);

    await expect(activeQuestion(page, 'HOMEADD4_1')).toContainText('First Street');
    await expect(activeQuestion(page, 'HOMEADD4_1')).toContainText('Second Avenue');
    await expect(activeQuestion(page, 'HOMEADD4_1')).toContainText('Lakeview');
    await flushHarness(page);
    const snapshot = await harnessSnapshot(page);
    expect(snapshot.state.survey).toMatchObject({
      D_920576363: { D_725583683: 'Lakeview' },
      D_804504024: { D_105043152: 'First Street', D_543135391: 'Second Avenue' },
    });
    await expectHealthyHarness(page);
  });

  test('uses missing-field backup for a partial street address without offering the cross-street fallback', async ({ page }) => {
    await openParticipant(page, { markdown: englishAddressFixture });
    await activeQuestion(page, 'D_121490150').locator('#D_255248624').fill('44');
    await activeQuestion(page, 'D_121490150').locator('#D_945532934').fill('Partial Place');
    await goNext(page);
    await expect(activeQuestion(page, 'D_920576363')).toBeVisible();
    await activeQuestion(page, 'D_920576363').locator('#D_725583683').fill('Lakeview');
    await goNext(page);

    await expect(activeQuestion(page, 'D_804504024')).toHaveCount(0);
    await expect(activeQuestion(page, 'HOMEADD4_1')).toContainText('Partial Place');
    await expect(activeQuestion(page, 'HOMEADD4_1')).toContainText('Lakeview');
    await expectHealthyHarness(page);
  });

  test('keeps an entirely blank address out of the intersection fallback and labels the confirmation as current address', async ({ page }) => {
    await openParticipant(page, { markdown: englishAddressFixture });
    await goNext(page);
    await continueWithoutAnswering(page);
    await expect(activeQuestion(page, 'D_920576363')).toBeVisible();
    await goNext(page);
    await continueWithoutAnswering(page);

    await expect(activeQuestion(page, 'D_804504024')).toHaveCount(0);
    await expect(activeQuestion(page, 'HOMEADD4_1')).toContainText('current address');
    await expect(activeQuestion(page, 'HOMEADD4_1')).not.toContainText('First Street');
    await expectHealthyHarness(page);
  });

  test('restores primary compound values at the entered-address display and Back plus reset returns to fallback routing', async ({ page }) => {
    await openParticipant(page, {
      markdown: englishAddressFixture,
      persistedData: {
        D_121490150: {
          D_255248624: '77', D_945532934: 'Restored Road', D_303500597: 'Durham', D_195068098: 'NC', D_202784871: '27701', D_831127170: 'US',
        },
        treeJSON: treeThrough('D_121490150', 'HOMEADD4_1'),
      },
    });
    await expect(activeQuestion(page, 'HOMEADD4_1')).toContainText('Restored Road');
    await expect(activeQuestion(page, 'HOMEADD4_1')).toContainText('Durham');
    await expect(activeQuestion(page, 'HOMEADD4_1')).toContainText('27701');

    await goBack(page);
    await expect(activeQuestion(page, 'D_121490150')).toBeVisible();
    await expect(activeQuestion(page, 'D_121490150').locator('#D_945532934')).toHaveValue('Restored Road');
    await activeQuestion(page, 'D_121490150').getByRole('button', { name: 'Reset this answer' }).click();
    await expect(activeQuestion(page, 'D_121490150').locator('#D_945532934')).toHaveValue('');
    await goNext(page);
    await continueWithoutAnswering(page);
    await expect(activeQuestion(page, 'D_920576363')).toBeVisible();
    await expectHealthyHarness(page);
  });

  test('keeps English and Spanish production-shaped address IDs and complete-address branching aligned', async ({ page }) => {
    await openParticipant(page, { markdown: spanishAddressFixture, lang: 'es' });
    await fillCompletePrimaryAddress(page);
    await goNext(page);

    await expect(activeQuestion(page, 'HOMEADD4_1')).toBeVisible();
    await expect(activeQuestion(page, 'D_920576363')).toHaveCount(0);
    await expect(activeQuestion(page, 'D_804504024')).toHaveCount(0);
    await expect(activeQuestion(page, 'HOMEADD4_1')).toContainText('Esta es la información que nos dio para esta ubicación');
    await expect(activeQuestion(page, 'HOMEADD4_1')).toContainText('Main Street');
    await expect(activeQuestion(page, 'HOMEADD4_1')).toContainText('Baltimore');
    await expectHealthyHarness(page);
  });

  for (const { locale, language } of [
    { locale: 'English', language: 'en' },
    { locale: 'Spanish', language: 'es' },
  ]) {
    test(`${locale} locked D_398762737 routes locality-only state to the duplicated-token intersection and blank state past it`, async ({ page }) => {
      const markdown = readLockedModule4(language);
      await openParticipant(page, {
        markdown,
        lang: language,
        persistedData: {
          D_444145120: { D_288498031: 'Lakeview' },
          treeJSON: treeAt('D_444145120'),
        },
      });
      await expect(activeQuestion(page, 'D_444145120')).toBeVisible();
      await goNext(page);
      await expect(activeQuestion(page, 'D_398762737')).toBeVisible();
      const runtimeCondition = decodeURIComponent(
        await activeQuestion(page, 'D_398762737').getAttribute('displayif'),
      );
      expect(runtimeCondition).toMatch(/^displayif=noneExist\("D_985267931","D_111275683"\) and someExist\(/);

      await openParticipant(page, {
        markdown,
        lang: language,
        persistedData: { treeJSON: treeAt('D_444145120') },
      });
      await expect(activeQuestion(page, 'D_444145120')).toBeVisible();
      await goNext(page);
      await continueWithoutAnswering(page, language);
      await expect(activeQuestion(page, 'D_398762737')).toHaveCount(0);
      await expect(activeQuestion(page, 'HOMEADD4_2')).toBeVisible();
      await expectHealthyHarness(page);
    });
  }
});
