import { test, expect } from './support/test.js';
import {
  activeQuestion,
  harnessSnapshot,
  openParticipant,
  waitInHarness,
} from './support/harness.js';
import { analyzeQuestAxe } from './support/axe.js';
import { accessibilityDefects, axeDefects, runtimeDefects } from '../knownDefects/registry.js';

const NATIVE_KEYBOARD_PROJECTS = new Set([
  'chromium-desktop',
  'firefox-desktop',
  'webkit-desktop',
  'chromium-windows-ua',
]);

// Module 1 contains production |___| textareas. Keep this minimal two-line
// reproduction independent of a long survey path so it isolates #1587's
// delegated ArrowUp/ArrowDown behavior.
const TEXTAREA_KEYBOARD_MARKDOWN = `{"name":"TEST_TEXTAREA_KEYBOARD"}

[NOTES?] Please enter two short notes.
|___|notes|

[END,end] Complete.`;

async function openPlainTextarea(page) {
  await openParticipant(page, { markdown: TEXTAREA_KEYBOARD_MARKDOWN });
  const textarea = activeQuestion(page, 'NOTES').locator('#notes');
  await textarea.fill('first\nsecond');
  return textarea;
}

async function selectionState(textarea) {
  return textarea.evaluate((element) => ({
    focused: document.activeElement === element,
    start: element.selectionStart,
    end: element.selectionEnd,
  }));
}

test.describe('accessibility event lifecycle regressions @known-defect', () => {
  test('#1587 leaves ArrowDown to a plain native textarea', async ({ page }, testInfo) => {
    test.skip(!NATIVE_KEYBOARD_PROJECTS.has(testInfo.project.name), 'The native textarea contract runs in each desktop engine and the Windows user-agent branch.');

    const textarea = await openPlainTextarea(page);
    await textarea.focus();
    await textarea.evaluate((element) => element.setSelectionRange(0, 0));
    await expect(textarea).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await waitInHarness(page, 25);

    const state = await selectionState(textarea);
    test.fail(true, `${accessibilityDefects[1587].issue}: ArrowDown must retain native multiline caret behavior instead of moving Quest focus.`);
    expect(state.focused).toBe(true);
    expect(state.start).toBeGreaterThan(0);
    expect(state.end).toBe(state.start);
  });

  test('#1587 leaves ArrowUp to a plain native textarea', async ({ page }, testInfo) => {
    test.skip(!NATIVE_KEYBOARD_PROJECTS.has(testInfo.project.name), 'The native textarea contract runs in each desktop engine and the Windows user-agent branch.');

    const textarea = await openPlainTextarea(page);
    await textarea.focus();
    await textarea.evaluate((element) => element.setSelectionRange(6, 6));
    await expect(textarea).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await waitInHarness(page, 25);

    const state = await selectionState(textarea);
    test.fail(true, `${accessibilityDefects[1587].issue}: ArrowUp must retain native multiline caret behavior instead of moving Quest focus.`);
    expect(state.focused).toBe(true);
    expect(state.start).toBe(0);
    expect(state.end).toBe(0);
  });

  test('clears a delayed list-selection announcement when advancing immediately', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'The asynchronous announcement race is characterized once in Chromium.');
    const defect = runtimeDefects.staleSelectionAnnouncement;

    await openParticipant(page);
    await activeQuestion(page, 'CHOICE').locator('label', { hasText: 'Blue' }).click();
    await activeQuestion(page, 'CHOICE').getByRole('button', { name: 'Next question' }).click();
    await expect(activeQuestion(page, 'CHECKS')).toBeVisible();
    await waitInHarness(page, 150);

    test.fail(true, `${defect.localDefectId}: ${defect.reason}`);
    await expect(page.locator('#ariaLiveSelectionAnnouncer')).toHaveText('', { timeout: 1_000 });
  });

  test('clears a delayed list-selection announcement when returning immediately', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'The asynchronous announcement race is characterized once in Chromium.');
    const defect = runtimeDefects.staleSelectionAnnouncement;

    await openParticipant(page);
    await activeQuestion(page, 'CHOICE').locator('label', { hasText: 'Blue' }).click();
    await waitInHarness(page, 150);
    await activeQuestion(page, 'CHOICE').getByRole('button', { name: 'Next question' }).click();
    await expect(activeQuestion(page, 'CHECKS')).toBeVisible();
    await activeQuestion(page, 'CHECKS').locator('label', { hasText: 'Email' }).click();
    await activeQuestion(page, 'CHECKS').getByRole('button', { name: 'Back to the previous question' }).click();
    await expect(activeQuestion(page, 'CHOICE')).toBeVisible();
    await waitInHarness(page, 150);

    test.fail(true, `${defect.localDefectId}: ${defect.reason}`);
    await expect(page.locator('#ariaLiveSelectionAnnouncer')).toHaveText('', { timeout: 1_000 });
  });

  test('does not move the Windows grid focus helper back into an inactive grid after immediate Next', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-windows-ua', 'The shared grid focus helper is only used through Quest’s Windows accessibility branch.');
    const defect = runtimeDefects.gridDeferredFocusAfterNavigation;

    await openParticipant(page, { fixture: 'gridResponsive.txt' });
    await activeQuestion(page, 'GRID_LEAD').getByRole('button', { name: 'Next question' }).click();
    await expect(activeQuestion(page, 'GRID_RATE')).toBeVisible();

    await page.evaluate(() => {
      document.querySelector('#GRID_WALK_1').click();
      document.querySelector('#GRID_CYCLE_2').click();
      document.querySelector('#GRID_RATE button.next').click();
    });
    await expect(activeQuestion(page, 'END')).toBeVisible();
    await waitInHarness(page, 200);
    const inactiveHelperCount = await page.locator('#GRID_RATE #srFocusHelper').count();
    const errors = (await harnessSnapshot(page)).logs.errors;

    test.fail(true, `${defect.localDefectId}: ${defect.reason}`);
    expect(inactiveHelperCount).toBe(0);
    expect(errors).toEqual([]);
  });

  test('production-shaped image markup supplies a text alternative and has no image-alt violation', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'The image-alt defect is characterized once in Chromium.');
    const defect = axeDefects.imageAlt;

    await openParticipant(page, { fixture: 'imageAlt.txt' });
    const image = activeQuestion(page, 'PLAIN').locator('img');
    await expect(image).toHaveAttribute('src', /FemaleBaldness1\.png$/);
    const alt = await image.getAttribute('alt');
    const imageAltFindings = (await analyzeQuestAxe(page)).filter((finding) => finding.id === defect.ruleId);

    test.fail(true, `${defect.localDefectId}: ${defect.reason}`);
    expect(alt).toMatch(/\S/);
    expect(imageAltFindings).toEqual([]);
  });
});
