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

const mouthwashQuestion = 'D_479143504';
const toothbrushFrequency = 'D_498984275';
const mouthwashProducts = 'D_406270109';
const alcoholMouthwashFrequency = 'D_349659426';
const alcoholFreeMouthwashFrequency = 'D_766370065';

const surgeries = 'D_729984625';
const tonsilSurgery = 'D_675055475';
const gallbladderSurgery = 'D_250003172';
const ageAtSurgery = 'D_623218391';
const yearOfSurgery = 'D_802622485';
const tonsilXor = 'SRVSCR_TONSILS_V1R0';
const gallbladderXor = 'SRVSCR_GALLREM_V1R0';

test.describe('locked production checkbox fan-out and XOR state @corpus', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Production branch paths run once in Chromium.');
  });

  test('queues selected oral-hygiene and nested mouthwash routes once, in authored order, and restores both checkbox arrays', async ({ page }) => {
    const markdown = readLockedMarkdown('moduleMouthwash');
    await openParticipant(page, {
      markdown,
      persistedData: { treeJSON: treeAtPath([mouthwashQuestion]) },
    });

    const oralHygiene = activeQuestion(page, mouthwashQuestion);
    await oralHygiene.locator(`label[for="${mouthwashQuestion}_203919683"]`).click();
    await oralHygiene.locator(`label[for="${mouthwashQuestion}_390351864"]`).click();
    await goNext(page);
    await expect(activeQuestion(page, toothbrushFrequency)).toBeVisible();

    await activeQuestion(page, toothbrushFrequency).locator(`label[for="${toothbrushFrequency}_858624942"]`).click();
    await goNext(page);
    await expect(activeQuestion(page, mouthwashProducts)).toBeVisible();

    const products = activeQuestion(page, mouthwashProducts);
    await products.locator(`label[for="${mouthwashProducts}_950773275"]`).click();
    await products.locator(`label[for="${mouthwashProducts}_762727133"]`).click();
    await goNext(page);
    await expect(activeQuestion(page, alcoholMouthwashFrequency)).toBeVisible();

    await activeQuestion(page, alcoholMouthwashFrequency).locator(`label[for="${alcoholMouthwashFrequency}_858624942"]`).click();
    await goNext(page);
    await expect(activeQuestion(page, alcoholFreeMouthwashFrequency)).toBeVisible();

    await activeQuestion(page, alcoholFreeMouthwashFrequency).locator(`label[for="${alcoholFreeMouthwashFrequency}_858624942"]`).click();
    await goNext(page);
    await flushHarness(page);
    const completed = await harnessSnapshot(page);
    expect(completed.state.survey).toMatchObject({
      [mouthwashQuestion]: ['203919683', '390351864'],
      [toothbrushFrequency]: '858624942',
      [mouthwashProducts]: ['950773275', '762727133'],
      [alcoholMouthwashFrequency]: '858624942',
      [alcoholFreeMouthwashFrequency]: '858624942',
    });
    expect(JSON.parse(completed.state.survey.treeJSON).currentNode).toBe(alcoholFreeMouthwashFrequency);

    // Returning through the queue must not duplicate or skip a selected route.
    await goBack(page);
    await expect(activeQuestion(page, alcoholFreeMouthwashFrequency)).toBeVisible();
    await goBack(page);
    await expect(activeQuestion(page, alcoholMouthwashFrequency)).toBeVisible();
    await goBack(page);
    await expect(activeQuestion(page, mouthwashProducts)).toBeVisible();
    await expect(activeQuestion(page, mouthwashProducts).locator(`#${mouthwashProducts}_950773275`)).toBeChecked();
    await expect(activeQuestion(page, mouthwashProducts).locator(`#${mouthwashProducts}_762727133`)).toBeChecked();

    const rerendered = await rerenderParticipant(page, {
      markdown,
      persistedData: {
        ...completed.state.survey,
        treeJSON: treeAtPath([mouthwashQuestion, toothbrushFrequency, mouthwashProducts, alcoholMouthwashFrequency, alcoholFreeMouthwashFrequency]),
      },
    });
    expect(rerendered.result).toBe(true);
    await expect(activeQuestion(page, alcoholFreeMouthwashFrequency)).toBeVisible();
    await goBack(page);
    await goBack(page);
    await expect(activeQuestion(page, mouthwashProducts)).toBeVisible();
    await expect(activeQuestion(page, mouthwashProducts).locator(`#${mouthwashProducts}_950773275`)).toBeChecked();
    await expect(activeQuestion(page, mouthwashProducts).locator(`#${mouthwashProducts}_762727133`)).toBeChecked();
    await expectHealthyHarness(page);
  });

  test('rebuilds a queued multi-select route after Back removes one selected branch', async ({ page }) => {
    await openParticipant(page, {
      markdown: readLockedMarkdown('moduleMouthwash'),
      persistedData: { treeJSON: treeAtPath([mouthwashQuestion]) },
    });

    const question = activeQuestion(page, mouthwashQuestion);
    await question.locator(`label[for="${mouthwashQuestion}_203919683"]`).click();
    await question.locator(`label[for="${mouthwashQuestion}_390351864"]`).click();
    await goNext(page);
    await expect(activeQuestion(page, toothbrushFrequency)).toBeVisible();

    // The first Next has already materialized both selected targets in the
    // queue. Return to the driver, remove only the first route, and require
    // Quest to rebuild the queue from the updated checkbox array.
    await goBack(page);
    const returned = activeQuestion(page, mouthwashQuestion);
    await expect(returned.locator(`#${mouthwashQuestion}_203919683`)).toBeChecked();
    await expect(returned.locator(`#${mouthwashQuestion}_390351864`)).toBeChecked();
    await returned.locator(`label[for="${mouthwashQuestion}_203919683"]`).click();
    await expect(returned.locator(`#${mouthwashQuestion}_203919683`)).not.toBeChecked();
    await expect(returned.locator(`#${mouthwashQuestion}_390351864`)).toBeChecked();
    await goNext(page);
    await expect(activeQuestion(page, mouthwashProducts)).toBeVisible();

    const snapshot = await expectHealthyHarness(page);
    expect(snapshot.state.survey[mouthwashQuestion]).toEqual(['390351864']);
    expect(snapshot.state.survey).not.toHaveProperty(toothbrushFrequency);
    expect(snapshot.state.survey.treeJSON).not.toContain(toothbrushFrequency);
  });

  test('keeps repeated age/year controls parent-scoped, XOR-exclusive, bounded, and restorable across two surgery paths', async ({ page }) => {
    const markdown = readLockedMarkdown('moduleCancerScreeningHistory');
    await openParticipant(page, {
      markdown,
      previousResults: { age: '45', yob: '1979' },
      persistedData: { treeJSON: treeAtPath([surgeries]) },
    });

    const surgeryQuestion = activeQuestion(page, surgeries);
    await surgeryQuestion.locator(`label[for="${surgeries}_797189152"]`).click();
    await surgeryQuestion.locator(`label[for="${surgeries}_633546100"]`).click();
    await goNext(page);
    await expect(activeQuestion(page, tonsilSurgery)).toBeVisible();

    const tonsil = activeQuestion(page, tonsilSurgery);
    const tonsilAge = tonsil.locator(`input[xor="${tonsilXor}"][id="${ageAtSurgery}"]`);
    const tonsilYear = tonsil.locator(`input[xor="${tonsilXor}"][id="${yearOfSurgery}"]`);
    await expect(tonsilAge).toHaveAttribute('data-max', '45');
    await expect(tonsilYear).toHaveAttribute('data-min', '1979');
    await tonsilAge.fill('46');
    await tonsilAge.blur();
    await expect(tonsil.locator('.validation-container')).toContainText('less than or equal to 45');
    await tonsilAge.fill('12');
    await tonsilAge.blur();
    await tonsilYear.fill('2001');
    await tonsilYear.blur();
    await expect(tonsilAge).toHaveValue('');
    await expect(tonsilYear).toHaveValue('2001');
    await goNext(page);

    await expect(activeQuestion(page, gallbladderSurgery)).toBeVisible();
    const gallbladder = activeQuestion(page, gallbladderSurgery);
    const gallbladderAge = gallbladder.locator(`input[xor="${gallbladderXor}"][id="${ageAtSurgery}"]`);
    const gallbladderYear = gallbladder.locator(`input[xor="${gallbladderXor}"][id="${yearOfSurgery}"]`);
    await expect(gallbladderAge).toHaveAttribute('data-max', '45');
    await expect(gallbladderYear).toHaveAttribute('data-min', '1979');
    await gallbladderYear.fill('1978');
    await gallbladderYear.blur();
    await expect(gallbladder.locator('.validation-container')).toContainText('greater than or equal to 1979');
    await gallbladderYear.fill('2005');
    await gallbladderYear.blur();
    await gallbladderAge.fill('30');
    await gallbladderAge.blur();
    await expect(gallbladderYear).toHaveValue('');
    await expect(gallbladderAge).toHaveValue('30');
    await goNext(page);
    await flushHarness(page);

    const completed = await harnessSnapshot(page);
    expect(completed.state.survey).toMatchObject({
      [surgeries]: ['797189152', '633546100'],
      [tonsilSurgery]: { [yearOfSurgery]: '2001' },
      [gallbladderSurgery]: { [ageAtSurgery]: '30' },
    });
    await goBack(page);
    await expect(activeQuestion(page, gallbladderSurgery)).toBeVisible();
    await expect(activeQuestion(page, gallbladderSurgery).locator(`input[xor="${gallbladderXor}"][id="${ageAtSurgery}"]`)).toHaveValue('30');
    await expect(activeQuestion(page, gallbladderSurgery).locator(`input[xor="${gallbladderXor}"][id="${yearOfSurgery}"]`)).toHaveValue('');
    await goBack(page);
    await expect(activeQuestion(page, tonsilSurgery)).toBeVisible();
    await expect(activeQuestion(page, tonsilSurgery).locator(`input[xor="${tonsilXor}"][id="${yearOfSurgery}"]`)).toHaveValue('2001');
    await expect(activeQuestion(page, tonsilSurgery).locator(`input[xor="${tonsilXor}"][id="${ageAtSurgery}"]`)).toHaveValue('');

    const rerendered = await rerenderParticipant(page, {
      markdown,
      previousResults: { age: '45', yob: '1979' },
      persistedData: {
        ...completed.state.survey,
        treeJSON: treeAtPath([surgeries, tonsilSurgery, gallbladderSurgery]),
      },
    });
    expect(rerendered.result).toBe(true);
    await expect(activeQuestion(page, gallbladderSurgery)).toBeVisible();
    await expect(activeQuestion(page, gallbladderSurgery).locator(`input[xor="${gallbladderXor}"][id="${ageAtSurgery}"]`)).toHaveValue('30');
    await expect(activeQuestion(page, gallbladderSurgery).locator(`input[xor="${gallbladderXor}"][id="${yearOfSurgery}"]`)).toHaveValue('');
    await expectHealthyHarness(page);
  });
});
