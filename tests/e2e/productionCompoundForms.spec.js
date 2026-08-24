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
const qualityOfLifeQuestion = 'D_284353934';
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

async function compoundChoiceContract(question, {
  groupName,
  value,
  prompt,
  answer,
}) {
  const control = question.locator(`input[type="radio"][name="${groupName}"][value="${value}"]`);
  await expect(control).toHaveCount(1);

  return control.evaluate((input, expected) => {
    const normalize = (text) => String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
    const referencedElements = (element, attribute) => String(element.getAttribute(attribute) ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    const referencedText = (element, attribute) => referencedElements(element, attribute)
      .map(({ textContent }) => textContent ?? '')
      .join(' ');
    const accessibleNameSource = (element, nativeName = '') => {
      const labelledBy = referencedElements(element, 'aria-labelledby');
      if (labelledBy.length > 0) {
        return labelledBy.map(({ textContent }) => textContent ?? '').join(' ');
      }
      if (element.hasAttribute('aria-label')) {
        return element.getAttribute('aria-label') ?? '';
      }
      return nativeName;
    };
    const radioNames = (container) => new Set(Array.from(
      container.querySelectorAll('input[type="radio"]'),
      ({ name }) => name,
    ));

    // Keep ARIA's name-source precedence intact. Combining overridden sources
    // could hide an incomplete aria-labelledby/aria-label regression.
    const ownName = accessibleNameSource(
      input,
      Array.from(input.labels, ({ textContent }) => textContent).join(' '),
    );
    const describedContext = referencedText(input, 'aria-describedby');
    const groupedContext = [];
    const questionRoot = input.closest('form.question');

    for (let ancestor = input.parentElement; ancestor && ancestor !== questionRoot; ancestor = ancestor.parentElement) {
      const names = radioNames(ancestor);
      if (names.size !== 1 || !names.has(input.name)) continue;

      if (ancestor.tagName === 'FIELDSET') {
        groupedContext.push(ancestor.querySelector(':scope > legend')?.textContent ?? '');
      }
      if (ancestor.getAttribute('role') === 'radiogroup') {
        groupedContext.push(accessibleNameSource(ancestor));
        groupedContext.push(referencedText(ancestor, 'aria-describedby'));
      }
    }

    const normalizedName = normalize(ownName);
    const normalizedPrompt = normalize(expected.prompt);
    return {
      answerNamed: normalizedName.includes(normalize(expected.answer)),
      promptContext: normalizedName.includes(normalizedPrompt)
        || normalize(describedContext).includes(normalizedPrompt)
        || normalize(groupedContext.join(' ')).includes(normalizedPrompt),
    };
  }, { prompt, answer });
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

  test('Diet Screener choices expose both the food subgroup and answer in accessible context @known-defect', async ({ page }) => {
    await openParticipant(page, {
      markdown: readLockedMarkdown('moduleDietScreener'),
      persistedData: { treeJSON: treeAt(dietQuestion) },
    });

    const question = activeQuestion(page, dietQuestion);
    await expect(question).toBeVisible();
    expect(await question.locator('input[type="radio"]').count()).toBeGreaterThan(0);
    test.fail(true, `${accessibilityDefects.compoundQuestionContext.localDefectId}: ${accessibilityDefects.compoundQuestionContext.reason}`);
    const intendedChoices = [
      { groupName: dietVegetables, value: '192247286', prompt: 'Vegetables', answer: '1 per week' },
      { groupName: dietFruit, value: '351464854', prompt: 'Fruit', answer: '1 per day' },
    ];
    for (const expected of intendedChoices) {
      const contract = await compoundChoiceContract(question, expected);
      expect.soft(contract.answerNamed, `${expected.groupName} must retain its response-option name`).toBe(true);
      expect.soft(contract.promptContext, `${expected.groupName} must expose its subgroup prompt`).toBe(true);
    }
  });

  test('QoL choices expose each subgroup prompt with its answer @known-defect', async ({ page }) => {
    await openParticipant(page, {
      markdown: readLockedMarkdown('moduleQoL'),
      persistedData: { treeJSON: treeAt(qualityOfLifeQuestion) },
    });

    const question = activeQuestion(page, qualityOfLifeQuestion);
    await expect(question).toBeVisible();
    await expect(question.locator('input[type="radio"]')).toHaveCount(20);
    expect(await question.locator('input[type="radio"]').evaluateAll((inputs) => (
      new Set(inputs.map((input) => input.name)).size
    ))).toBe(4);

    test.fail(true, `${accessibilityDefects.compoundQuestionContext.localDefectId}: ${accessibilityDefects.compoundQuestionContext.reason}`);
    const intendedChoices = [
      { groupName: 'D_559540891', value: '367964536', prompt: 'chores', answer: 'Without any difficulty' },
      { groupName: 'D_917425212', value: '367964536', prompt: 'stairs', answer: 'Without any difficulty' },
      { groupName: 'D_783201540', value: '367964536', prompt: 'walk', answer: 'Without any difficulty' },
      { groupName: 'D_780866928', value: '367964536', prompt: 'errands', answer: 'Without any difficulty' },
    ];
    for (const expected of intendedChoices) {
      const contract = await compoundChoiceContract(question, expected);
      expect.soft(contract.answerNamed, `${expected.groupName} must retain its response-option name`).toBe(true);
      expect.soft(contract.promptContext, `${expected.groupName} must expose its subgroup prompt`).toBe(true);
    }
  });
});
