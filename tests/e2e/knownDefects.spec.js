import { test, expect } from './support/test.js';
import { activeQuestion, goNext, openParticipant, selectLabeledResponse, waitInHarness } from './support/harness.js';
import { analyzeQuestAxe, matchesAxeDefect } from './support/axe.js';
import { accessibilityDefects, axeDefects, runtimeDefects } from '../knownDefects/registry.js';

const ASSISTIVE_TECH_ENGINES = new Set(['chromium-desktop', 'webkit-desktop']);
const CHOICE_SEMANTIC_PROJECTS = new Set([
  ...ASSISTIVE_TECH_ENGINES,
  'chromium-windows-ua',
]);
const NATIVE_KEYBOARD_ENGINES = new Set([
  'chromium-desktop',
  'firefox-desktop',
  'webkit-desktop',
  'chromium-windows-ua',
]);

async function axeFindingsForDefect(page, defect) {
  const findings = await analyzeQuestAxe(page);
  return findings.filter((finding) => matchesAxeDefect(finding, defect));
}

function characterizeAxeDefect(name, defect, prepare, project = 'chromium-desktop') {
  test(name, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== project, `Characterized in ${project}; blocking scans still run in every desktop engine.`);
    await prepare(page);
    const findings = await axeFindingsForDefect(page, defect);
    test.fail(true, `${defect.localDefectId}: ${defect.reason}`);
    expect(findings).toEqual([]);
  });
}

test.describe('open accessibility regressions @known-defect', () => {
  characterizeAxeDefect(
    'progressbar has an accessible name',
    axeDefects.progressbarName,
    (page) => openParticipant(page, { fixture: 'navigationState.txt' }),
  );

  characterizeAxeDefect(
    'progressbar exposes a valid ARIA value',
    axeDefects.progressbarValue,
    (page) => openParticipant(page, { fixture: 'navigationState.txt' }),
  );

  characterizeAxeDefect(
    'responsive grid has no empty row-header spacer',
    axeDefects.emptyGridHeader,
    async (page) => {
      await openParticipant(page, { fixture: 'gridResponsive.txt' });
      await goNext(page);
      await expect(activeQuestion(page, 'GRID_RATE')).toBeVisible();
    },
  );

  characterizeAxeDefect(
    'validation message meets contrast requirements',
    axeDefects.validationContrast,
    async (page) => {
      await openParticipant(page, { fixture: 'validation.txt' });
      await activeQuestion(page, 'BOUNDED').locator('#bounded').fill('9');
      await goNext(page);
      await expect(activeQuestion(page).locator('.validation-container')).toBeVisible();
    },
  );

  characterizeAxeDefect(
    'bounded numeric input has a non-title label',
    axeDefects.validationLabel,
    async (page) => {
      await openParticipant(page, { fixture: 'validation.txt' });
      await activeQuestion(page, 'BOUNDED').locator('#bounded').fill('9');
      await goNext(page);
      await expect(activeQuestion(page).locator('.validation-container')).toBeVisible();
    },
  );

  test('#1079 exposes named radio roles and their checked state', async ({ page }, testInfo) => {
    test.skip(!ASSISTIVE_TECH_ENGINES.has(testInfo.project.name), 'Chromium and WebKit capture the JAWS/VoiceOver semantic baseline.');

    await openParticipant(page);
    await selectLabeledResponse(page, 'Blue');
    const question = activeQuestion(page, 'CHOICE');
    expect(await question.locator('input[type="radio"]').count()).toBe(2);
    await expect(question.locator('#CHOICE_1')).toBeChecked();
    test.fail(true, `${accessibilityDefects[1079].issue}: ${accessibilityDefects[1079].automatedContract}`);
    expect(await question.getByRole('radio').count()).toBe(2);
    await expect(question.getByRole('radio', { name: 'Blue' })).toBeChecked();
    await expect(question.getByRole('radio', { name: 'Green' })).not.toBeChecked();
  });

  test('#1079 preserves named radio roles and state in the Windows branch', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-windows-ua', 'This semantic contract targets Quest’s Windows-specific branch.');

    await openParticipant(page);
    await selectLabeledResponse(page, 'Green');
    const question = activeQuestion(page, 'CHOICE');
    expect(await question.locator('input[type="radio"]').count()).toBe(2);
    await expect(question.locator('#CHOICE_2')).toBeChecked();
    test.fail(true, `${accessibilityDefects[1079].issue}: ${accessibilityDefects[1079].automatedContract}`);
    expect(await question.getByRole('radio').count()).toBe(2);
    await expect(question.getByRole('radio', { name: 'Blue' })).not.toBeChecked();
    await expect(question.getByRole('radio', { name: 'Green' })).toBeChecked();
  });

  test('#1079 exposes named checkbox roles and their checked state', async ({ page }, testInfo) => {
    test.skip(!CHOICE_SEMANTIC_PROJECTS.has(testInfo.project.name), 'Chromium, WebKit, and the Windows branch capture the assistive-technology semantic baseline.');

    await openParticipant(page);
    await selectLabeledResponse(page, 'Blue');
    await goNext(page);
    await selectLabeledResponse(page, 'Email');

    const question = activeQuestion(page, 'CHECKS');
    expect(await question.locator('input[type="checkbox"]').count()).toBe(2);
    await expect(question.locator('#CHECKS_1')).toBeChecked();
    test.fail(true, `${accessibilityDefects[1079].issue}: native checkboxes must expose role, name, and checked state.`);
    expect(await question.getByRole('checkbox').count()).toBe(2);
    await expect(question.getByRole('checkbox', { name: 'Email' })).toBeChecked();
    await expect(question.getByRole('checkbox', { name: 'Text message' })).not.toBeChecked();
  });

  test('#1079 exposes each grid choice with its row and column name plus checked state', async ({ page }, testInfo) => {
    test.skip(!CHOICE_SEMANTIC_PROJECTS.has(testInfo.project.name), 'Chromium, WebKit, and the Windows branch capture the assistive-technology semantic baseline.');

    await openParticipant(page, { fixture: 'gridResponsive.txt' });
    await goNext(page);
    await waitInHarness(page, 550);
    const question = activeQuestion(page, 'GRID_RATE');
    await question.locator('tr[data-question-id="GRID_WALK"] label', { hasText: 'Sometimes' }).click();
    await expect(question.locator('#GRID_WALK_1')).toBeChecked();

    test.fail(true, `${accessibilityDefects[1079].issue}: a grid choice must expose its row prompt, column option, and checked state together.`);
    const selected = question.getByRole('radio', { name: /Walking.*Sometimes|Sometimes.*Walking/ });
    await expect(selected).toHaveCount(1);
    await expect(selected).toBeChecked();
    await expect(question.getByRole('radio', { name: /Cycling.*Often|Often.*Cycling/ })).not.toBeChecked();
  });

  test('#1079 restores focus to a Windows list choice after pointer activation', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-windows-ua', 'This focus contract targets Quest’s Windows-specific list branch.');

    await openParticipant(page);
    await waitInHarness(page, 550);
    await selectLabeledResponse(page, 'Green');
    await waitInHarness(page, 150);
    await expect(activeQuestion(page, 'CHOICE').locator('#CHOICE_2')).toBeChecked();
    test.fail(true, `${accessibilityDefects[1079].issue}: list activation must return focus to the operable native choice.`);
    await expect(activeQuestion(page, 'CHOICE').locator('#CHOICE_2')).toBeFocused();
  });

  test('#1587 retains native radio focus and activates it with Space', async ({ page }, testInfo) => {
    test.skip(!NATIVE_KEYBOARD_ENGINES.has(testInfo.project.name), 'The native keyboard baseline runs in every desktop engine.');

    await openParticipant(page);
    const first = activeQuestion(page).locator('#CHOICE_1');
    await expect(first).not.toBeChecked();
    await first.focus();
    // Retaining native input focus is the first currently broken part of this
    // keyboard contract. Once fixed, the same test advances to Space itself.
    test.fail(true, `${accessibilityDefects[1587].issue}: a native radio must retain focus and Space must check it.`);
    await expect(first).toBeFocused();
    await page.keyboard.press('Space');
    const checked = await first.isChecked();
    expect(checked).toBe(true);
  });

  test('#1587 preserves native radio arrow movement and group exclusivity', async ({ page }, testInfo) => {
    test.skip(!NATIVE_KEYBOARD_ENGINES.has(testInfo.project.name), 'The native keyboard baseline runs in every desktop engine.');

    await openParticipant(page);
    await selectLabeledResponse(page, 'Blue');
    const first = activeQuestion(page).locator('#CHOICE_1');
    const second = activeQuestion(page).locator('#CHOICE_2');
    await expect(first).toBeChecked();
    await expect(second).not.toBeChecked();
    await first.focus();
    test.fail(true, `${accessibilityDefects[1587].issue}: a native radio must retain focus before arrows move its checked group state.`);
    await expect(first).toBeFocused();
    await page.keyboard.press('ArrowRight');
    const actual = {
      first: await first.isChecked(),
      second: await second.isChecked(),
      focused: await page.evaluate(() => document.activeElement?.id),
    };
    expect(actual).toEqual({ first: false, second: true, focused: 'CHOICE_2' });
  });

  test('#1587 retains native checkbox focus and toggles it with Space', async ({ page }, testInfo) => {
    test.skip(!NATIVE_KEYBOARD_ENGINES.has(testInfo.project.name), 'The native keyboard baseline runs in every desktop engine.');

    await openParticipant(page);
    await activeQuestion(page).locator('label', { hasText: 'Blue' }).click();
    await activeQuestion(page).getByRole('button', { name: 'Next question' }).click();
    const checkbox = activeQuestion(page, 'CHECKS').locator('#CHECKS_1');
    await expect(checkbox).not.toBeChecked();
    await checkbox.focus();
    test.fail(true, `${accessibilityDefects[1587].issue}: a native checkbox must retain focus and Space must toggle it.`);
    await expect(checkbox).toBeFocused();
    await page.keyboard.press('Space');
    const selected = await checkbox.isChecked();
    await page.keyboard.press('Space');
    const deselected = await checkbox.isChecked();
    expect([selected, deselected]).toEqual([true, false]);
  });

  test('#1587 preserves the browser-native select keyboard contract', async ({ page }, testInfo) => {
    test.skip(!NATIVE_KEYBOARD_ENGINES.has(testInfo.project.name), 'The native keyboard baseline runs in every desktop engine.');

    await openParticipant(page, { fixture: 'nativeSelect.txt' });
    const stateSelect = activeQuestion(page, 'STATE').locator('#home_state');
    await stateSelect.focus();
    await expect(stateSelect).toBeFocused();
    await page.keyboard.press('ArrowDown');
    const value = await stateSelect.inputValue();
    test.fail(true, `${accessibilityDefects[1587].issue}: Quest must not trap native select keys.`);
    expect(value).not.toBe('');
  });

  test('restores focus to the submit trigger after Escape closes its dialog', async ({ page }, testInfo) => {
    test.skip(!NATIVE_KEYBOARD_ENGINES.has(testInfo.project.name), 'The modal focus contract runs in every desktop engine.');

    await openParticipant(page, { fixture: 'validation.txt' });
    await activeQuestion(page, 'BOUNDED').locator('#bounded').fill('2');
    await goNext(page);
    const trigger = activeQuestion(page, 'END').getByRole('button', { name: 'Submit your survey' });
    const modal = page.locator('#submitModal');
    await trigger.click();
    await expect(modal).toHaveClass(/show/);
    await expect(page.locator('#submitModalTitle')).toBeFocused();
    await page.keyboard.press('Escape');
    await waitInHarness(page, 700);
    await expect(modal).not.toHaveClass(/show/);
    test.fail(true, `${runtimeDefects.submitFocusRestore.localDefectId}: ${runtimeDefects.submitFocusRestore.reason}`);
    expect(await trigger.evaluate((element) => element === document.activeElement)).toBe(true);
  });

  test('keeps focus on a response dialog when the pending question-focus timer completes', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'The timer race is characterized once in Chromium.');

    await openParticipant(page);
    await goNext(page);
    const title = page.locator('#softModalTitle');
    await expect(title).toBeFocused();
    await waitInHarness(page, 550);
    test.fail(true, `${runtimeDefects.modalQuestionFocusRace.localDefectId}: ${runtimeDefects.modalQuestionFocusRace.reason}`);
    await expect(title).toBeFocused();
  });
});
