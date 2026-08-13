import { test, expect } from './support/test.js';
import {
  activeQuestion,
  expectHealthyHarness,
  goBack,
  goNext,
  openParticipant,
  selectLabeledResponse,
  waitInHarness,
} from './support/harness.js';
import { analyzeQuestAxe, unwaivedAxeFindings } from './support/axe.js';
import { axeDefects } from '../knownDefects/registry.js';

const ACCESSIBILITY_PROJECTS = new Set([
  'chromium-desktop',
  'firefox-desktop',
  'webkit-desktop',
  'chromium-windows-ua',
]);

const AXE_PROJECTS = new Set([
  ...ACCESSIBILITY_PROJECTS,
  'chromium-phone',
  'chromium-tablet',
]);

const CURRENT_AXE_BASELINE = [
  axeDefects.progressbarName,
  axeDefects.progressbarValue,
];

const GRID_AXE_BASELINE = [
  ...CURRENT_AXE_BASELINE,
  axeDefects.emptyGridHeader,
];

const VALIDATION_AXE_BASELINE = [
  ...CURRENT_AXE_BASELINE,
  axeDefects.validationContrast,
  axeDefects.validationLabel,
];

async function expectNoUnwaivedAxeViolations(page, accepted = CURRENT_AXE_BASELINE) {
  const findings = await analyzeQuestAxe(page);
  expect(unwaivedAxeFindings(findings, accepted)).toEqual([]);
}

async function expectModalFocusCycle(page, modal, firstFocusable, lastFocusable) {
  await lastFocusable.focus();
  await expect(lastFocusable).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await modal.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await expect(firstFocusable).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  expect(await modal.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await expect(lastFocusable).toBeFocused();
}

async function traverseHostBoundary(page, key, terminalId, maximumPresses = 20) {
  const path = [];
  for (let press = 0; press < maximumPresses; press += 1) {
    await page.keyboard.press(key);
    const focused = await page.evaluate(() => {
      const element = document.activeElement;
      return {
        id: element?.id || null,
        inQuest: Boolean(element?.closest?.('#questionnaireRoot')),
        responseTabStop: element?.classList?.contains('response') ?? false,
        screenReaderFocus: Boolean(element?.classList?.contains('screen-reader-focus')),
        clickType: element?.dataset?.clickType || null,
      };
    });
    path.push(focused);
    if (focused.id === terminalId) return path;
  }
  throw new Error(`Focus did not reach #${terminalId} after ${maximumPresses} ${key} presses: ${JSON.stringify(path)}`);
}

test.describe('participant accessibility contract @canonical @windows-a11y', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      !ACCESSIBILITY_PROJECTS.has(testInfo.project.name),
      'The semantic contract runs in each desktop engine and the Windows user-agent branch.',
    );
  });

  test('groups the prompt in a legend and exposes named survey actions', async ({ page }) => {
    await openParticipant(page);

    const question = activeQuestion(page, 'CHOICE');
    await expect(question.locator('fieldset')).toHaveCount(1);
    await expect(question.locator('legend')).toHaveText('Which color do you prefer?');
    await expect(question.getByRole('button', { name: 'Next question' })).toBeVisible();
    await expect(question.getByRole('button', { name: 'Reset this answer' })).toBeVisible();

    const liveRegion = page.locator('#ariaLiveSelectionAnnouncer');
    await expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    await selectLabeledResponse(page, 'Blue');
    await expect(liveRegion).toHaveText('Blue Selected.');

    const accessibilitySnapshot = await question.ariaSnapshot();
    expect(accessibilitySnapshot).toContain('Which color do you prefer?');
    expect(accessibilitySnapshot).toContain('Next question');
    await expectHealthyHarness(page);
  });

  test('keeps the deliberate action-button tab order on a later question', async ({ page }, testInfo) => {
    await openParticipant(page, { fixture: 'navigationState.txt' });
    await selectLabeledResponse(page, 'Yes');
    await goNext(page);

    const question = activeQuestion(page, 'DETAIL');
    const domOrder = await question.locator('button').evaluateAll((buttons) => (
      buttons.map((button) => button.dataset.clickType)
    ));
    expect(domOrder).toEqual(['next', 'reset', 'previous']);

    // Playwright WebKit follows Safari's macOS default where Tab may omit
    // buttons unless Full Keyboard Access is enabled at the OS level. That
    // setting is covered in the manual matrix. Test the DOM contract here.
    if (testInfo.project.name === 'webkit-desktop') {
      await expectHealthyHarness(page);
      return;
    }

    await expect(question.locator('.screen-reader-focus')).toBeFocused();
    const input = question.locator('#detail');
    await input.focus();
    await page.keyboard.press('Tab');
    await expect(question.getByRole('button', { name: 'Next question' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(question.getByRole('button', { name: 'Reset this answer' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(question.getByRole('button', { name: 'Back to the previous question' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(question.getByRole('button', { name: 'Reset this answer' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(question.getByRole('button', { name: 'Next question' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(input).toBeFocused();
    await expectHealthyHarness(page);
  });

  test('moves focus into the new question after Next and Back', async ({ page }) => {
    await openParticipant(page, { fixture: 'navigationState.txt' });
    await selectLabeledResponse(page, 'Yes');
    await goNext(page);

    await expect(activeQuestion(page, 'DETAIL').locator('.screen-reader-focus')).toBeFocused();
    await goBack(page);
    await expect(activeQuestion(page, 'PATH').locator('.screen-reader-focus')).toBeFocused();
    await expect(activeQuestion(page, 'PATH').locator('#PATH_1')).toBeChecked();
    await expectHealthyHarness(page);
  });

  test('keeps a generated scalar label associated with its input', async ({ page }) => {
    await openParticipant(page, {
      markdown: `{"name":"TEST_SCALAR_LABEL"}

[SCALAR?] At what time should we call?
|time|id=scalar_time|

[END,end] Complete.`,
    });

    const question = activeQuestion(page, 'SCALAR');
    const label = question.locator('label[for="scalar_time"]');
    const input = question.locator('#scalar_time');
    await expect(label).toHaveText('Enter Time');
    await expect(input).toHaveAccessibleName('Enter Time');
    expect(await input.evaluate((element) => (
      [...element.labels].map((candidate) => candidate.getAttribute('for'))
    ))).toEqual(['scalar_time']);
    await expectHealthyHarness(page);
  });

  test('crosses both host and Quest focus boundaries with Tab and reverse Shift+Tab', async ({ page }, testInfo) => {
    await openParticipant(page);
    await waitInHarness(page, 550);

    if (testInfo.project.name === 'webkit-desktop') {
      // Playwright WebKit follows Safari's macOS default that omits buttons
      // from Tab navigation unless Full Keyboard Access is enabled. Assert the
      // complete DOM boundary here. The native traversal is in the manual
      // Safari + VoiceOver protocol and is not simulated with programmatic focus.
      expect(await page.evaluate(() => {
        const before = document.querySelector('#host-before');
        const quest = document.querySelector('#questionnaireRoot');
        const after = document.querySelector('#host-after');
        const beforePrecedesQuest = Boolean(
          before.compareDocumentPosition(quest) & Node.DOCUMENT_POSITION_FOLLOWING,
        );
        const questPrecedesAfter = Boolean(
          quest.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING,
        );
        return beforePrecedesQuest && questPrecedesAfter;
      })).toBe(true);
      await expectHealthyHarness(page);
      return;
    }

    await page.locator('#host-before').focus();
    const forward = await traverseHostBoundary(page, 'Tab', 'host-after');
    expect(forward.slice(0, -1).every((entry) => entry.inQuest)).toBe(true);
    expect(forward.some((entry) => entry.screenReaderFocus)).toBe(true);
    expect(forward.some((entry) => entry.clickType === 'next')).toBe(true);
    expect(forward.some((entry) => entry.clickType === 'reset')).toBe(true);
    if (testInfo.project.name === 'chromium-windows-ua') {
      expect(forward.some((entry) => entry.responseTabStop)).toBe(true);
    }

    await page.locator('#host-after').focus();
    const reverse = await traverseHostBoundary(page, 'Shift+Tab', 'host-before');
    expect(reverse.slice(0, -1).every((entry) => entry.inQuest)).toBe(true);
    expect(reverse.some((entry) => entry.screenReaderFocus)).toBe(true);
    expect(reverse.some((entry) => entry.clickType === 'next')).toBe(true);
    expect(reverse.some((entry) => entry.clickType === 'reset')).toBe(true);
    await expectHealthyHarness(page);
  });

  test('names the soft-response dialog and restores question focus when it closes', async ({ page }, testInfo) => {
    await openParticipant(page);
    // Let the initial question's delayed focus handoff complete before this
    // test isolates the Bootstrap modal focus trap. The competing-timer case
    // is characterized separately in the known-defect lane.
    await expect(activeQuestion(page, 'CHOICE').locator('.screen-reader-focus')).toBeFocused();
    await goNext(page);

    const modal = page.locator('#softModal');
    const dialog = page.getByRole('dialog', { name: 'Response requested' });
    await expect(modal).toHaveClass(/show/);
    await expect(page.locator('#softModalTitle')).toBeFocused();
    await waitInHarness(page, 400);
    if (testInfo.project.name === 'webkit-desktop') {
      // Safari's button-tabbing preference also affects modal controls. Keep
      // their stable DOM contract automated and exercise the native cycle in
      // the Full Keyboard Access manual matrix.
      expect(await modal.locator('button, [tabindex="0"]').evaluateAll((elements) => (
        elements.map((element) => element.id || element.getAttribute('aria-label'))
      ))).toEqual(['Close', 'modalBodyText', 'modalContinueButton', 'modalCloseButton']);
    } else {
      await expectModalFocusCycle(
        page,
        modal,
        dialog.getByRole('button', { name: 'Close' }),
        dialog.getByRole('button', { name: 'Answer the Question' }),
      );
    }
    await dialog.getByRole('button', { name: 'Close' }).click();
    await waitInHarness(page, 700);

    await expect(modal).not.toHaveClass(/show/);
    await expect(activeQuestion(page, 'CHOICE').locator('.screen-reader-focus')).toBeFocused();
    await expectHealthyHarness(page);
  });

  test('names the submit dialog, focuses its title, and closes it with Escape', async ({ page }, testInfo) => {
    await openParticipant(page, { fixture: 'validation.txt' });
    await activeQuestion(page, 'BOUNDED').locator('#bounded').fill('2');
    await goNext(page);
    // Let Quest's scheduled question-focus handoff finish before isolating the
    // Bootstrap modal focus trap. Otherwise, the independent timers can race
    // under a parallel browser run.
    await waitInHarness(page, 550);

    const trigger = activeQuestion(page, 'END').getByRole('button', { name: 'Submit your survey' });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Submit Answers' });
    await expect(dialog).toBeVisible();
    await expect(page.locator('#submitModalTitle')).toBeFocused();
    await waitInHarness(page, 400);
    const modal = page.locator('#submitModal');
    if (testInfo.project.name === 'webkit-desktop') {
      expect(await modal.locator('button, [tabindex="0"]').evaluateAll((elements) => (
        elements.map((element) => element.id || element.getAttribute('aria-label'))
      ))).toEqual(['Close', 'submitModalBodyText', 'submitModalButton', 'cancelModalButton']);
    } else {
      await expectModalFocusCycle(
        page,
        modal,
        dialog.getByRole('button', { name: 'Close' }),
        dialog.getByRole('button', { name: 'Cancel' }),
      );
    }
    await page.keyboard.press('Escape');
    await waitInHarness(page, 700);

    await expect(page.locator('#submitModal')).not.toHaveClass(/show/);
    await expectHealthyHarness(page);
  });
});

test.describe('automated accessibility scan @axe', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      !AXE_PROJECTS.has(testInfo.project.name),
      'The Axe baseline runs in every desktop, responsive, and Windows-user-agent project.',
    );
  });

  test('has no unwaived findings in a normal participant question', async ({ page }) => {
    await openParticipant(page, { fixture: 'navigationState.txt' });
    await selectLabeledResponse(page, 'Yes');
    await goNext(page);
    await expectNoUnwaivedAxeViolations(page);
    await expectHealthyHarness(page);
  });

  test('has no unwaived findings in an active response grid', async ({ page }) => {
    await openParticipant(page, { fixture: 'gridResponsive.txt' });
    await goNext(page);
    await expect(activeQuestion(page, 'GRID_RATE')).toBeVisible();
    await expectNoUnwaivedAxeViolations(page, GRID_AXE_BASELINE);
    await expectHealthyHarness(page);
  });

  test('has no unwaived findings while range validation is visible', async ({ page }) => {
    await openParticipant(page, { fixture: 'validation.txt' });
    await activeQuestion(page, 'BOUNDED').locator('#bounded').fill('9');
    await goNext(page);
    await expect(activeQuestion(page).locator('.validation-container')).toBeVisible();
    await expectNoUnwaivedAxeViolations(page, VALIDATION_AXE_BASELINE);
    await expectHealthyHarness(page);
  });

  test('has no unwaived findings while the response dialog is open', async ({ page }) => {
    await openParticipant(page);
    await goNext(page);
    await expect(page.locator('#softModal')).toHaveClass(/show/);
    // Sample after Bootstrap's transition settles so WebKit does not alternate
    // between transient focus styles and the stable modal state.
    await waitInHarness(page, 400);
    await expectNoUnwaivedAxeViolations(page);
    await expectHealthyHarness(page);
  });

  test('has no unwaived findings while the submit dialog is open', async ({ page }) => {
    await openParticipant(page, { fixture: 'validation.txt' });
    await activeQuestion(page, 'BOUNDED').locator('#bounded').fill('2');
    await goNext(page);
    await activeQuestion(page, 'END').getByRole('button', { name: 'Submit your survey' }).click();
    await expect(page.getByRole('dialog', { name: 'Submit Answers' })).toBeVisible();
    // Let Bootstrap finish transferring focus off the trigger. Axe/WebKit can
    // otherwise sample the transient focused-button color during the same task.
    await waitInHarness(page, 400);
    await expectNoUnwaivedAxeViolations(page);
    await expectHealthyHarness(page);
  });
});
