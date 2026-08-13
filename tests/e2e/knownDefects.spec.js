import { test, expect } from './support/test.js';
import { activeQuestion, goNext, openParticipant, waitInHarness } from './support/harness.js';
import { analyzeQuestAxe, matchesAxeDefect } from './support/axe.js';
import { accessibilityDefects, axeDefects, runtimeDefects } from '../knownDefects/registry.js';

const CHOICE_SEMANTIC_PROJECTS = new Set([
  'chromium-desktop',
  'webkit-desktop',
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
    'participant action text retains sufficient contrast while hovered',
    axeDefects.actionHoverContrast,
    async (page) => {
      await openParticipant(page, { fixture: 'validation.txt' });
      await activeQuestion(page, 'BOUNDED').getByRole('button', { name: 'Next question' }).hover();
    },
    'firefox-desktop',
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

  test('restores focus to the submit trigger after Escape closes its dialog', async ({ page }, testInfo) => {
    test.skip(!NATIVE_KEYBOARD_ENGINES.has(testInfo.project.name), 'The modal focus contract runs in every desktop engine.');

    await openParticipant(page, { fixture: 'validation.txt' });
    await waitInHarness(page, 550);
    await activeQuestion(page, 'BOUNDED').locator('#bounded').fill('2');
    await goNext(page);
    await expect(activeQuestion(page, 'END')).toBeVisible();
    await waitInHarness(page, 550);
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

    await page.addInitScript(() => {
      const nativeSetTimeout = window.setTimeout.bind(window);
      const nativeClearTimeout = window.clearTimeout.bind(window);
      const pendingFocusTimers = new Map();
      let nextTimerId = 1_000_000;

      window.setTimeout = (callback, delay, ...args) => {
        if (delay !== 500) return nativeSetTimeout(callback, delay, ...args);
        const timerId = nextTimerId;
        nextTimerId += 1;
        pendingFocusTimers.set(timerId, { callback, args });
        return timerId;
      };
      window.clearTimeout = (timerId) => {
        if (!pendingFocusTimers.delete(timerId)) nativeClearTimeout(timerId);
      };
      window.releasePendingQuestionFocusTimers = () => {
        window.setTimeout = nativeSetTimeout;
        window.clearTimeout = nativeClearTimeout;
        const pending = [...pendingFocusTimers.values()];
        pendingFocusTimers.clear();
        pending.forEach(({ callback, args }) => callback(...args));
        return pending.length;
      };
    });
    await openParticipant(page);
    await goNext(page);
    const title = page.locator('#softModalTitle');
    await expect(title).toBeFocused();
    expect(await page.evaluate(() => window.releasePendingQuestionFocusTimers())).toBe(1);
    await waitInHarness(page, 25);
    test.fail(true, `${runtimeDefects.modalQuestionFocusRace.localDefectId}: ${runtimeDefects.modalQuestionFocusRace.reason}`);
    await expect(title).toBeFocused();
  });
});
