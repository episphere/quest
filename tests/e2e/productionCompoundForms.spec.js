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
import {
  readLockedMarkdown,
  repositoryRoot,
  rerenderParticipant,
  treeAt,
} from './support/corpus.js';

const dietQuestion = 'D_916948380';
const dietModuleName = 'D_515124081';
const dietVegetables = 'D_970075000';
const dietFruit = 'D_724001040';
const qualityOfLifeQuestion = 'D_284353934';
const module4Name = 'D_716117817';
const commuteModes = 'D_421586693';
const commuteDuration = 'D_733638576';
const carDuration = 'D_583216333';
const taxiDuration = 'D_920653797';
const walkingDuration = 'D_175502589';
const commuteDurationGroups = [
  carDuration,
  taxiDuration,
  'D_843066684',
  'D_101850740',
  'D_317194063',
  'D_621948602',
  walkingDuration,
  'D_614443767',
];
const commuteFollowUpImage = 'https://user-images.githubusercontent.com/64271614/86169815-34d86f80-bae8-11ea-98a6-1b3de33fedf0.png';
const localImageAsset = path.join(repositoryRoot, 'tests/e2e/assets/FemaleBaldness1.png');
const compoundAccessibilityProjects = new Set([
  'chromium-desktop',
  'firefox-desktop',
  'webkit-desktop',
  'chromium-windows-ua',
]);
const conditionalKeyboardProjects = new Set([
  'chromium-desktop',
  'firefox-desktop',
  'chromium-windows-ua',
]);
const dietGroupNames = [
  'D_136695974',
  'D_172676248',
  'D_174911197',
  'D_181240315',
  'D_284856542',
  'D_379851141',
  'D_412397796',
  'D_484124027',
  'D_529369529',
  'D_593777242',
  'D_724001040',
  'D_736936997',
  'D_771538757',
  'D_827631896',
  'D_848411929',
  'D_876252122',
  'D_896562194',
  'D_910980928',
  'D_930916389',
  'D_970075000',
];
const qualityOfLifeGroupNames = [
  'D_559540891',
  'D_780866928',
  'D_783201540',
  'D_917425212',
];
const conditionalRuntimeCases = [
  {
    questionId: 'D_532260562',
    description: 'complex work-return conditions',
    persistedData: {
      D_614208066: '104430631',
      D_799598595: ['339946103', '364857371'],
    },
    visibleGroups: ['D_827461454', 'D_306356124'],
  },
  {
    questionId: 'D_532260562',
    description: 'same-mode work-return second condition arm',
    persistedData: {
      D_614208066: '353358909',
      D_308634850: '104430631',
      D_421586693: ['767755239', '385609081'],
    },
    visibleGroups: ['D_827461454', 'D_306356124'],
  },
  {
    questionId: 'D_135529881',
    description: 'indented school-outbound markup',
    previousResults: { D_784967158: '551525967' },
    persistedData: {
      D_404863614: ['782113721', '207263450'],
    },
    visibleGroups: ['D_891237683', 'D_980695076'],
  },
  {
    questionId: 'D_219317801',
    description: 'complex indented school-return conditions',
    previousResults: { D_784967158: '551525967' },
    persistedData: {
      D_496801729: '104430631',
      D_345355061: ['467242967', '645051966'],
    },
    visibleGroups: ['D_990162153', 'D_576149634'],
  },
];

async function chooseRadio(question, name, value) {
  await question.locator(`label[for="${name}_${value}"]`).click();
}

function exactTextPattern(text) {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

function normalizeText(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function compoundPrompts(markdown, questionId) {
  const lines = markdown.split(/\r?\n/);
  const questionStart = lines.findIndex((line) => line.startsWith(`[${questionId}`));
  expect(questionStart, `Locked corpus question ${questionId} must exist`).toBeGreaterThanOrEqual(0);

  const prompts = {};
  let precedingPrompt = '';
  for (const rawLine of lines.slice(questionStart + 1)) {
    const line = rawLine.trim();
    if (line.startsWith('[')) break;
    if (!line) continue;

    const response = line.match(/^\([^:]+:([^,)]+)/);
    if (response) {
      prompts[response[1]] ??= normalizeText(precedingPrompt.replace(/<[^>]*>/g, ''));
    } else {
      precedingPrompt = line;
    }
  }
  return prompts;
}

function conditionalCompoundPrompts(markdown, questionId) {
  const lines = markdown.split(/\r?\n/);
  const questionStart = lines.findIndex((line) => line.startsWith(`[${questionId}`));
  expect(questionStart, `Locked corpus question ${questionId} must exist`).toBeGreaterThanOrEqual(0);

  const prompts = {};
  let precedingPrompt = '';
  for (const rawLine of lines.slice(questionStart + 1)) {
    const line = rawLine.trim();
    if (line.startsWith('[')) break;
    if (!line) continue;

    const prompt = line.match(/^\|displayif=[^|]+\|\s*(.*?)\|\s*$/);
    if (prompt) {
      precedingPrompt = normalizeText(prompt[1].replace(/<[^>]*>/g, ''));
      continue;
    }

    const response = line.match(/^\([^:]+:([^,)]+),displayif=/);
    if (response && precedingPrompt) {
      prompts[response[1]] ??= precedingPrompt;
    }
  }
  return prompts;
}

async function expectConditionalCompoundRadioStructure(
  question,
  expectedPromptsByGroup,
  visibleGroupNames,
  expectedRadiosPerGroup = 5,
) {
  const inventory = await question.evaluate((form) => {
    const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
    const normalizeCondition = (value) => {
      try {
        return normalize(decodeURIComponent(value));
      } catch {
        return normalize(value);
      }
    };
    const visible = (element) => {
      if (!element || element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    };

    const fieldset = form.querySelector(':scope > fieldset');
    const radios = Array.from(fieldset.querySelectorAll(':scope > .response > input[type="radio"][name]'));
    const radiosByName = new Map();
    radios.forEach((radio) => {
      if (!radiosByName.has(radio.name)) radiosByName.set(radio.name, []);
      radiosByName.get(radio.name).push(radio);
    });
    return Array.from(fieldset.querySelectorAll(':scope > [role="radiogroup"]')).map((group) => {
      const ownedIds = String(group.getAttribute('aria-owns') ?? '').split(/\s+/).filter(Boolean);
      const ownedRadios = ownedIds.map((id) => document.getElementById(id));
      const radioNames = [...new Set(ownedRadios.map((radio) => radio?.name).filter(Boolean))];
      const groupName = radioNames[0] ?? '';
      const expectedRadios = radiosByName.get(groupName) ?? [];
      const groupCondition = normalizeCondition(group.getAttribute('displayif'));
      return {
        groupName,
        text: normalize(group.textContent),
        ariaLabel: normalize(group.getAttribute('aria-label')),
        ownedIds,
        expectedIds: expectedRadios.map(({ id }) => id),
        answerLabels: ownedRadios.map((radio) => normalize(radio?.labels[0]?.textContent)),
        visible: visible(group),
        promptCondition: groupCondition,
        responseConditionsMatch: expectedRadios.every((radio) => (
          normalizeCondition(radio.closest('.response')?.getAttribute('displayif')) === groupCondition
        )),
        responseVisibilityMatches: expectedRadios.every((radio) => (
          visible(radio.closest('.response')) === visible(group)
        )),
        inputsAreNativeAndLabelled: ownedRadios.every((radio) => (
          radio?.type === 'radio'
          && radio.labels.length === 1
          && normalize(radio.labels[0].textContent).length > 0
          && !radio.hasAttribute('aria-label')
          && !radio.hasAttribute('aria-labelledby')
        )),
        responsesRemainDirectChildren: expectedRadios.every((radio) => (
          radio.closest('.response')?.parentElement === fieldset
        )),
        promptIsNotFocusableOrLive: !group.hasAttribute('tabindex')
          && group.getAttribute('role') === 'radiogroup'
          && !group.hasAttribute('aria-live'),
      };
    });
  });

  const expectedGroupNames = Object.keys(expectedPromptsByGroup);
  expect(inventory).toHaveLength(expectedGroupNames.length);
  expect(inventory.map(({ groupName }) => groupName).sort()).toEqual([...expectedGroupNames].sort());
  expect(inventory.filter(({ visible }) => visible).map(({ groupName }) => groupName).sort())
    .toEqual([...visibleGroupNames].sort());

  for (const group of inventory) {
    expect.soft(group.text).toBe(expectedPromptsByGroup[group.groupName]);
    expect.soft(group.ariaLabel).toBe(expectedPromptsByGroup[group.groupName]);
    expect.soft(group.ownedIds).toEqual(group.expectedIds);
    expect.soft(group.ownedIds).toHaveLength(expectedRadiosPerGroup);
    expect.soft(group.promptCondition).not.toBe('');
    expect.soft(group.responseConditionsMatch).toBe(true);
    expect.soft(group.responseVisibilityMatches).toBe(true);
    expect.soft(group.inputsAreNativeAndLabelled).toBe(true);
    expect.soft(group.responsesRemainDirectChildren).toBe(true);
    expect.soft(group.promptIsNotFocusableOrLive).toBe(true);

    const exposedGroup = question.getByRole('radiogroup', {
      name: expectedPromptsByGroup[group.groupName],
      exact: true,
    });
    await expect.soft(exposedGroup).toHaveCount(group.visible ? 1 : 0);
    if (group.visible) {
      const ariaSnapshot = await exposedGroup.ariaSnapshot();
      expect.soft(ariaSnapshot.match(/^\s*- radio(?:\s|$)/gm) ?? []).toHaveLength(
        expectedRadiosPerGroup,
      );
      for (const answer of group.answerLabels) {
        expect.soft(ariaSnapshot).toContain(`radio ${JSON.stringify(answer)}`);
      }
    }
  }
}

async function expectCompoundRadioStructure(
  question,
  expectedGroupNames,
  expectedRadioCount,
  expectedPromptsByGroup,
) {
  const inventory = await question.locator('fieldset.compound-radio-group').evaluateAll((groups) => {
    const idCounts = Array.from(document.querySelectorAll('[id]')).reduce((counts, element) => {
      counts[element.id] = (counts[element.id] ?? 0) + 1;
      return counts;
    }, {});

    return groups.map((group) => {
      const radios = Array.from(group.querySelectorAll('input[type="radio"]'));
      const prompt = group.querySelector(':scope > legend');
      return {
        tagName: group.tagName,
        promptIsFirstChild: prompt === group.firstElementChild,
        promptIdIsUnique: Boolean(prompt?.id) && idCounts[prompt.id] === 1,
        promptIsVisible: (() => {
          if (!prompt || prompt.hidden || prompt.getAttribute('aria-hidden') === 'true') return false;
          const style = getComputedStyle(prompt);
          return style.display !== 'none' && style.visibility !== 'hidden' && prompt.getClientRects().length > 0;
        })(),
        promptText: prompt?.textContent.replace(/\s+/g, ' ').trim() ?? '',
        hasOnlyNativeGroupSemantics: !group.hasAttribute('role')
          && !group.hasAttribute('aria-label')
          && !group.hasAttribute('aria-labelledby'),
        radioNames: [...new Set(radios.map(({ name }) => name))],
        radioCount: radios.length,
        radioLabelsAreNativeAndNonempty: radios.every((radio) => (
          radio.labels.length === 1 && radio.labels[0].textContent.trim().length > 0
        )),
        radiosKeepNativeNameSource: radios.every((radio) => (
          !radio.hasAttribute('aria-label') && !radio.hasAttribute('aria-labelledby')
        )),
        radiosBelongDirectlyToGroup: radios.every((radio) => (
          radio.closest('fieldset.compound-radio-group') === group
        )),
      };
    });
  });

  expect(inventory).toHaveLength(expectedGroupNames.length);
  expect(inventory.flatMap(({ radioNames }) => radioNames).sort()).toEqual([...expectedGroupNames].sort());
  expect(inventory.reduce((total, { radioCount }) => total + radioCount, 0)).toBe(expectedRadioCount);
  if (expectedPromptsByGroup) {
    expect(Object.keys(expectedPromptsByGroup).sort()).toEqual([...expectedGroupNames].sort());
  }
  for (const group of inventory) {
    expect.soft(group.tagName).toBe('FIELDSET');
    expect.soft(group.promptIsFirstChild).toBe(true);
    expect.soft(group.promptIdIsUnique).toBe(true);
    expect.soft(group.promptIsVisible).toBe(true);
    expect.soft(group.hasOnlyNativeGroupSemantics).toBe(true);
    expect.soft(group.radioNames).toHaveLength(1);
    expect.soft(group.radioLabelsAreNativeAndNonempty).toBe(true);
    expect.soft(group.radiosKeepNativeNameSource).toBe(true);
    expect.soft(group.radiosBelongDirectlyToGroup).toBe(true);
    if (expectedPromptsByGroup) {
      const expectedPrompt = expectedPromptsByGroup[group.radioNames[0]];
      expect.soft(group.promptText).toContain(expectedPrompt);
    }
  }
}

async function expectCompoundChoice(question, {
  groupName,
  value,
  prompt,
  answer,
}) {
  const group = question.locator(`fieldset.compound-radio-group:has(input[name="${groupName}"])`);
  const control = group.locator(`input[type="radio"][name="${groupName}"][value="${value}"]`);
  await expect(group).toHaveCount(1);
  await expect(group).toHaveAccessibleName(new RegExp(prompt, 'i'));
  await expect(control).toHaveCount(1);
  await expect(control).toHaveAccessibleName(exactTextPattern(answer));
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
    const expectedDietResponses = {
      [dietVegetables]: '192247286',
      [dietFruit]: '351464854',
    };
    expect(partial.state.survey).toMatchObject({ [dietQuestion]: expectedDietResponses });
    const dietStoreCall = partial.logs.storeCalls.findLast(({ changes }) => (
      Object.hasOwn(changes, `${dietModuleName}.${dietQuestion}`)
    ));
    expect(dietStoreCall?.changes[`${dietModuleName}.${dietQuestion}`]).toEqual(expectedDietResponses);

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
    const expectedPrompts = conditionalCompoundPrompts(markdown, commuteDuration);
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
    await expectConditionalCompoundRadioStructure(
      question,
      expectedPrompts,
      [carDuration, taxiDuration],
    );

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
    const durationStoreCall = completed.logs.storeCalls.findLast(({ changes }) => (
      Object.hasOwn(changes, `${module4Name}.${commuteDuration}`)
    ));
    expect(durationStoreCall?.changes[`${module4Name}.${commuteDuration}`]).toEqual(expectedDurations);

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
    await expectConditionalCompoundRadioStructure(
      restored,
      expectedPrompts,
      [carDuration, taxiDuration],
    );

    // Change the controlling modes through the real Back path. Quest clears
    // downstream duration data and reuses the cached form, so this guards
    // against stale hidden groups, duplicate semantics, and stale payloads.
    await goBack(page);
    const modeQuestion = activeQuestion(page, commuteModes);
    await expect(modeQuestion).toBeVisible();
    await expect(modeQuestion.locator(`#${commuteModes}_385609081`)).toBeChecked();
    await modeQuestion.locator(`label[for="${commuteModes}_385609081"]`).click();
    await modeQuestion.locator(`label[for="${commuteModes}_817932069"]`).click();
    await expect(modeQuestion.locator(`#${commuteModes}_385609081`)).not.toBeChecked();
    await expect(modeQuestion.locator(`#${commuteModes}_817932069`)).toBeChecked();
    await goNext(page);

    const changed = activeQuestion(page, commuteDuration);
    await expect(changed).toBeVisible();
    await expectConditionalCompoundRadioStructure(
      changed,
      expectedPrompts,
      [carDuration, walkingDuration],
    );
    await expect(changed.locator(`#${carDuration}_248303092`)).not.toBeChecked();
    await expect(changed.locator(`#${taxiDuration}_638092100`)).not.toBeChecked();
    await chooseRadio(changed, carDuration, '248303092');
    await chooseRadio(changed, walkingDuration, '638092100');
    await goNext(page);

    await flushHarness(page);
    const changedSnapshot = await harnessSnapshot(page);
    const changedDurations = {
      [carDuration]: '248303092',
      [walkingDuration]: '638092100',
    };
    const changedModes = {
      [commuteModes]: ['767755239', '817932069'],
      D_669966323: undefined,
    };
    expect(changedSnapshot.state.survey[commuteModes]).toEqual(changedModes);
    expect(changedSnapshot.state.survey[commuteDuration]).toEqual(changedDurations);
    const modeStoreCall = changedSnapshot.logs.storeCalls.findLast(({ changes }) => (
      Object.hasOwn(changes, `${module4Name}.${commuteModes}`)
    ));
    expect(modeStoreCall?.changes[`${module4Name}.${commuteModes}`]).toEqual(changedModes);
    const changedStoreCall = changedSnapshot.logs.storeCalls.findLast(({ changes }) => (
      Object.hasOwn(changes, `${module4Name}.${commuteDuration}`)
    ));
    expect(changedStoreCall?.changes[`${module4Name}.${commuteDuration}`]).toEqual(changedDurations);

    await rerenderParticipant(page, {
      markdown,
      lang: 'en',
      persistedData: {
        ...changedSnapshot.state.survey,
        treeJSON: treeAt(commuteDuration, commuteModes),
      },
    });
    const changedRestored = activeQuestion(page, commuteDuration);
    await expect(changedRestored.locator(`#${carDuration}_248303092`)).toBeChecked();
    await expect(changedRestored.locator(`#${walkingDuration}_638092100`)).toBeChecked();
    await expect(changedRestored.locator(`input[name="${taxiDuration}"]`).first().locator('xpath=..')).toBeHidden();
    await expectConditionalCompoundRadioStructure(
      changedRestored,
      expectedPrompts,
      [carDuration, walkingDuration],
    );
    await expectHealthyHarness(page);
  });

  for (const runtimeCase of conditionalRuntimeCases) {
    test(`Module 4 exposes ${runtimeCase.description} as labelled groups`, async ({ page }) => {
      const markdown = readLockedMarkdown('module4');
      const expectedPrompts = conditionalCompoundPrompts(markdown, runtimeCase.questionId);
      expect(Object.keys(expectedPrompts)).toHaveLength(8);

      await openParticipant(page, {
        markdown,
        previousResults: runtimeCase.previousResults,
        persistedData: {
          ...runtimeCase.persistedData,
          treeJSON: treeAt(runtimeCase.questionId),
        },
      });

      const question = activeQuestion(page, runtimeCase.questionId);
      await expect(question).toBeVisible();
      await expectConditionalCompoundRadioStructure(
        question,
        expectedPrompts,
        runtimeCase.visibleGroups,
      );
      await expectHealthyHarness(page);
    });
  }

});

test.describe('locked compound-radio accessibility @canonical @windows-a11y @corpus', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      !compoundAccessibilityProjects.has(testInfo.project.name),
      'Compound-radio semantics run in each desktop engine and the Windows user-agent project.',
    );
  });

  for (const locale of ['en', 'es']) {
    test(`manual compound-radio fixture ${locale} remains a valid acceptance target`, async ({ page }) => {
      const fixture = locale === 'es' ? 'compoundRadioGroupsSpanish.txt' : 'compoundRadioGroups.txt';
      await page.goto(`/tests/harness/participant.html?fixture=${fixture}`);
      await page.waitForFunction(() => (
        document.querySelector('#questionnaireRoot form.question.active#COMPOUND_RADIOS')
      ));

      const question = activeQuestion(page, 'COMPOUND_RADIOS');
      await expect(question).toBeVisible();
      const outerPrompt = locale === 'es'
        ? 'Para cada actividad, elija la respuesta que mejor lo describa.'
        : 'For each activity, choose the answer that best describes you.';
      const subgroupPrompts = locale === 'es'
        ? {
          MEAL: '¿Puede preparar una comida sencilla?',
          WALK: '¿Puede caminar durante 15 minutos?',
        }
        : {
          MEAL: 'Can you prepare a simple meal?',
          WALK: 'Can you walk for 15 minutes?',
        };
      await expectCompoundRadioStructure(question, ['MEAL', 'WALK'], 6, subgroupPrompts);
      await expect(question.locator(':scope > fieldset > legend.question-text')).toHaveText(outerPrompt);
      await expect(question.getByRole('group', { name: subgroupPrompts.MEAL, exact: true })).toHaveCount(1);
      await expect(question.getByRole('group', { name: subgroupPrompts.WALK, exact: true })).toHaveCount(1);
      await expectCompoundChoice(question, {
        groupName: 'MEAL',
        value: '1',
        prompt: locale === 'es' ? 'preparar' : 'prepare',
        answer: locale === 'es' ? 'Sin dificultad' : 'Without difficulty',
      });

      const focusTarget = question.locator(':scope > fieldset > .screen-reader-focus');
      await focusTarget.focus();
      await page.keyboard.press('Tab');
      await expect(question.locator('#MEAL_1')).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(question.locator('#MEAL_2')).toBeFocused();
      await expect(question.locator('#MEAL_2')).toBeChecked();
      await page.keyboard.press('Tab');
      await expect(question.locator('#WALK_1')).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(question.locator('#MEAL_2')).toBeFocused();

      await expectHealthyHarness(page);
    });

    test(`manual conditional compound-radio fixture ${locale} updates group context through Back`, async ({ page }, testInfo) => {
      const fixture = locale === 'es'
        ? 'conditionalCompoundRadioGroupsSpanish.txt'
        : 'conditionalCompoundRadioGroups.txt';
      await page.goto(`/tests/harness/participant.html?fixture=${fixture}`);
      await page.waitForFunction(() => (
        document.querySelector('#questionnaireRoot form.question.active#TRAVEL_MODES')
      ));

      const modes = activeQuestion(page, 'TRAVEL_MODES');
      await modes.locator('label[for="TRAVEL_MODES_1"]').click();
      await modes.locator('label[for="TRAVEL_MODES_2"]').click();
      await goNext(page);

      let duration = activeQuestion(page, 'TRAVEL_DURATION');
      const expectedPrompts = locale === 'es'
        ? { CAR_DURATION: 'Automóvil', WALK_DURATION: 'A pie' }
        : { CAR_DURATION: 'Car', WALK_DURATION: 'Walking' };
      await expectConditionalCompoundRadioStructure(
        duration,
        expectedPrompts,
        ['CAR_DURATION', 'WALK_DURATION'],
        3,
      );
      await expect(duration.locator('#CAR_DURATION_2')).toHaveAccessibleName(exactTextPattern(
        locale === 'es' ? 'De 15 a 30 minutos' : '15 to 30 minutes',
      ));

      if (locale === 'en' && conditionalKeyboardProjects.has(testInfo.project.name)) {
        await duration.locator('#CAR_DURATION_1').focus();
        await page.keyboard.press('Space');
        await expect(duration.locator('#CAR_DURATION_1')).toBeFocused();
        await expect(duration.locator('#CAR_DURATION_1')).toBeChecked();
        await page.keyboard.press('ArrowDown');
        await expect(duration.locator('#CAR_DURATION_2')).toBeFocused();
        await expect(duration.locator('#CAR_DURATION_2')).toBeChecked();
        await expect(duration.locator('#CAR_DURATION_1')).not.toBeChecked();
        await page.keyboard.press('Tab');
        await expect(duration.locator('#WALK_DURATION_1')).toBeFocused();
        await page.keyboard.press('Shift+Tab');
        await expect(duration.locator('#CAR_DURATION_2')).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(duration.locator('#WALK_DURATION_1')).toBeFocused();
      }

      await goBack(page);
      await activeQuestion(page, 'TRAVEL_MODES').locator('label[for="TRAVEL_MODES_1"]').click();
      await goNext(page);
      duration = activeQuestion(page, 'TRAVEL_DURATION');
      await expectConditionalCompoundRadioStructure(
        duration,
        expectedPrompts,
        ['WALK_DURATION'],
        3,
      );
      await expectHealthyHarness(page);
    });

    test(`Module 4 conditional commute groups ${locale} expose only selected modes`, async ({ page }) => {
      const markdown = readLockedMarkdown('module4', locale);
      const expectedPrompts = conditionalCompoundPrompts(markdown, commuteDuration);
      expect(Object.keys(expectedPrompts).sort()).toEqual([...commuteDurationGroups].sort());

      await openParticipant(page, {
        markdown,
        lang: locale,
        persistedData: {
          [commuteModes]: ['767755239', '385609081'],
          treeJSON: treeAt(commuteDuration, commuteModes),
        },
      });

      const question = activeQuestion(page, commuteDuration);
      await expect(question).toBeVisible();
      await expectConditionalCompoundRadioStructure(
        question,
        expectedPrompts,
        [carDuration, taxiDuration],
      );
      await expect(question.locator(`#${carDuration}_248303092`)).toHaveAccessibleName(
        exactTextPattern(locale === 'es' ? 'de 16 a 30 minutos' : '16 to 30 minutes'),
      );
      await expect(question.locator(`#${taxiDuration}_638092100`)).toHaveAccessibleName(
        exactTextPattern(locale === 'es' ? '1 hora' : '1 hour'),
      );
      await expectHealthyHarness(page);
    });

    test(`Diet Screener ${locale} exposes every food as a labelled native radio subgroup`, async ({ page }) => {
      const markdown = readLockedMarkdown('moduleDietScreener', locale);
      await openParticipant(page, {
        markdown,
        lang: locale,
        persistedData: { treeJSON: treeAt(dietQuestion) },
      });

      const question = activeQuestion(page, dietQuestion);
      await expect(question).toBeVisible();
      await expectCompoundRadioStructure(
        question,
        dietGroupNames,
        157,
        compoundPrompts(markdown, dietQuestion),
      );

      const intendedChoices = locale === 'es'
        ? [
          { groupName: dietVegetables, value: '192247286', prompt: 'Verduras', answer: '1 por semana' },
          { groupName: dietFruit, value: '351464854', prompt: 'Fruta', answer: '1 por día' },
        ]
        : [
          { groupName: dietVegetables, value: '192247286', prompt: 'Vegetables', answer: '1 per week' },
          { groupName: dietFruit, value: '351464854', prompt: 'Fruit', answer: '1 per day' },
        ];
      for (const expected of intendedChoices) {
        await expectCompoundChoice(question, expected);
      }
      await expectHealthyHarness(page);
    });

    test(`QoL ${locale} exposes every activity as a labelled native radio subgroup`, async ({ page }) => {
      const markdown = readLockedMarkdown('moduleQoL', locale);
      await openParticipant(page, {
        markdown,
        lang: locale,
        persistedData: { treeJSON: treeAt(qualityOfLifeQuestion) },
      });

      const question = activeQuestion(page, qualityOfLifeQuestion);
      await expect(question).toBeVisible();
      await expectCompoundRadioStructure(
        question,
        qualityOfLifeGroupNames,
        20,
        compoundPrompts(markdown, qualityOfLifeQuestion),
      );

      const prompts = locale === 'es'
        ? ['tareas', 'escaleras', 'caminar', 'mandados']
        : ['chores', 'stairs', 'walk', 'errands'];
      const answer = locale === 'es' ? 'Sin dificultad' : 'Without any difficulty';
      const intendedChoices = [
        { groupName: 'D_559540891', value: '367964536', prompt: prompts[0], answer },
        { groupName: 'D_917425212', value: '367964536', prompt: prompts[1], answer },
        { groupName: 'D_783201540', value: '367964536', prompt: prompts[2], answer },
        { groupName: 'D_780866928', value: '367964536', prompt: prompts[3], answer },
      ];
      for (const expected of intendedChoices) {
        await expectCompoundChoice(question, expected);
      }
      await expectHealthyHarness(page);
    });
  }
});
