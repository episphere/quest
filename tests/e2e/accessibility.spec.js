import { test, expect } from './support/test.js';
import {
  activeQuestion,
  expectHealthyHarness,
  harnessSnapshot,
  goBack,
  goNext,
  openParticipant,
  readCanonicalFixture,
  selectLabeledResponse,
  waitInHarness,
} from './support/harness.js';
import { analyzeQuestAxe, unwaivedAxeFindings } from './support/axe.js';

const ACCESSIBILITY_PROJECTS = new Set([
  'chromium-desktop',
  'firefox-desktop',
  'webkit-desktop',
  'chromium-windows-ua',
]);

const GRID_SEMANTIC_CASES = [
  {
    description: 'English radio',
    fixture: 'gridResponsive.txt',
    questionId: 'GRID_RATE',
    role: 'radio',
    selectedId: 'GRID_WALK_1',
    rowName: 'Walking',
    optionName: 'Sometimes',
    selectedName: 'Walking Sometimes',
    unselectedName: 'Cycling Often',
  },
  {
    description: 'Spanish radio',
    fixture: 'gridResponsiveSpanish.txt',
    lang: 'es',
    previousResults: { firstName: 'Ana' },
    questionId: 'GRID_RATE_ES',
    role: 'radio',
    selectedId: 'GRID_CAMINAR_1',
    rowName: 'Caminar con Ana',
    optionName: 'A veces',
    selectedName: 'Caminar con Ana A veces',
    unselectedName: 'Andar en bicicleta A menudo',
  },
  {
    description: 'English checkbox',
    fixture: 'gridCheckboxFocus.txt',
    questionId: 'GRID_CHECK',
    role: 'checkbox',
    selectedId: 'GRID_CHECK_ROW_A_0',
    rowName: 'First need',
    optionName: 'Phone',
    selectedName: 'First need Phone',
    unselectedName: 'Second need Email',
  },
];

const AXE_PROJECTS = new Set([
  ...ACCESSIBILITY_PROJECTS,
  'chromium-phone',
  'chromium-tablet',
]);

async function expectNoUnwaivedAxeViolations(page, accepted = []) {
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

async function closeUnansweredModalWithKeyboard(page, {
  modal,
  dialog,
  questionId,
  key,
}) {
  await modal.evaluate((element) => {
    element.addEventListener('hidden.bs.modal', () => {
      const activeElement = document.activeElement;
      element.__questFocusAtHidden = {
        isQuestionTarget: activeElement?.classList?.contains('screen-reader-focus') ?? false,
        questionId: activeElement?.closest?.('form.question.active')?.id ?? null,
      };
    }, { once: true });
  });

  const closeButton = dialog.getByRole('button', { name: 'Close' });
  await closeButton.focus();
  await page.keyboard.press(key);
  await expect(modal).not.toHaveClass(/show/);
  expect(await modal.evaluate((element) => element.__questFocusAtHidden)).toEqual({
    isQuestionTarget: true,
    questionId,
  });
  await expect(activeQuestion(page, questionId).locator('.screen-reader-focus')).toBeFocused();
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

test.describe('selection announcement navigation lifecycle @canonical', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-desktop',
      'Fake timers cover the browser-neutral scheduling details; Chromium covers the real navigation boundary.',
    );
  });

  test('does not replay a delayed response announcement after Next', async ({ page }) => {
    await openParticipant(page);

    // Keep selection and navigation in one browser: this is a regression test for the delayed-callback race.
    await page.evaluate(() => {
      document.querySelector('label[for="CHOICE_1"]').click();
      document.querySelector('#CHOICE button.next').click();
    });

    await expect(activeQuestion(page, 'CHECKS')).toBeVisible();
    await waitInHarness(page, 150);
    await expect(page.locator('#ariaLiveSelectionAnnouncer')).toHaveText('');
    await expectHealthyHarness(page);
  });

  test('does not replay a delayed response announcement after Back', async ({ page }) => {
    await openParticipant(page);
    await selectLabeledResponse(page, 'Blue');
    await waitInHarness(page, 150);
    await goNext(page);
    await expect(activeQuestion(page, 'CHECKS')).toBeVisible();

    await page.evaluate(() => {
      document.querySelector('label[for="CHECKS_1"]').click();
      document.querySelector('#CHECKS button.previous').click();
    });

    await expect(activeQuestion(page, 'CHOICE')).toBeVisible();
    await waitInHarness(page, 150);
    await expect(page.locator('#ariaLiveSelectionAnnouncer')).toHaveText('');
    await expectHealthyHarness(page);
  });
});

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
    const progress = page.locator('#progressBar');
    await expect(progress).toHaveAccessibleName('Survey progress');
    await expect(progress).toHaveAttribute('aria-valuenow', '0');
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

  test('exposes list choices through their native roles, names, and checked state', async ({ page }) => {
    await openParticipant(page);

    const radioQuestion = activeQuestion(page, 'CHOICE');
    await expect(radioQuestion.getByRole('radio')).toHaveCount(2);
    await expect(radioQuestion.getByRole('radio', { name: 'Blue' })).not.toBeChecked();
    await expect(radioQuestion.getByRole('radio', { name: 'Green' })).not.toBeChecked();

    await selectLabeledResponse(page, 'Blue');
    await expect(radioQuestion.getByRole('radio', { name: 'Blue' })).toBeChecked();
    await expect(radioQuestion.getByRole('radio', { name: 'Green' })).not.toBeChecked();
    await goNext(page);

    const checkboxQuestion = activeQuestion(page, 'CHECKS');
    await expect(checkboxQuestion.getByRole('checkbox')).toHaveCount(2);
    await expect(checkboxQuestion.getByRole('checkbox', { name: 'Email' })).not.toBeChecked();
    await expect(checkboxQuestion.getByRole('checkbox', { name: 'Text message' })).not.toBeChecked();

    await selectLabeledResponse(page, 'Email');
    await expect(checkboxQuestion.getByRole('checkbox', { name: 'Email' })).toBeChecked();
    await expect(checkboxQuestion.getByRole('checkbox', { name: 'Text message' })).not.toBeChecked();
    await expectHealthyHarness(page);
  });

  for (const scenario of GRID_SEMANTIC_CASES) {
    test(`${scenario.description} grid choices expose row, option, and checked state`, async ({ page }) => {
      await openParticipant(page, {
        fixture: scenario.fixture,
        lang: scenario.lang,
        previousResults: scenario.previousResults,
      });
      await goNext(page);

      const question = activeQuestion(page, scenario.questionId);
      const selected = question.getByRole(scenario.role, {
        name: scenario.selectedName,
        exact: true,
      });
      const unselected = question.getByRole(scenario.role, {
        name: scenario.unselectedName,
        exact: true,
      });

      await expect(selected).toHaveCount(1);
      await expect(unselected).toHaveCount(1);
      await expect(selected).not.toHaveAttribute('aria-labelledby');
      const selectedLabel = question.locator(`label[for="${scenario.selectedId}"]`);
      await expect(selectedLabel.locator('.grid-label-row-context')).toHaveText(scenario.rowName);
      await expect(selectedLabel.locator('.grid-label-response-text')).toHaveText(scenario.optionName);
      expect(await selected.evaluate((element) => element.labels?.length ?? 0)).toBe(1);
      await expect(question.locator('table.quest-grid [role]')).toHaveCount(0);
      await expect(selected).not.toBeChecked();
      await expect(unselected).not.toBeChecked();
      await selectedLabel.click();
      await expect(selected).toBeChecked();
      await expect(unselected).not.toBeChecked();
      await expect(page.locator('#ariaLiveSelectionAnnouncer')).toHaveText(
        `${scenario.optionName} Selected.`,
      );
      await expectHealthyHarness(page);
    });
  }

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

    const detailFocusTarget = activeQuestion(page, 'DETAIL').locator('.screen-reader-focus');
    await expect(detailFocusTarget).toHaveAttribute('tabindex', '-1');
    await expect(detailFocusTarget).toBeFocused();
    await goBack(page);
    const pathFocusTarget = activeQuestion(page, 'PATH').locator('.screen-reader-focus');
    await expect(pathFocusTarget).toHaveAttribute('tabindex', '-1');
    await expect(pathFocusTarget).toBeFocused();
    await expect(activeQuestion(page, 'PATH').locator('#PATH_1')).toBeChecked();
    await expectHealthyHarness(page);
  });

  test('does not override rapid focus and typing after a question transition', async ({ page }) => {
    await openParticipant(page, { fixture: 'navigationState.txt' });
    await selectLabeledResponse(page, 'Yes');

    await page.evaluate(() => {
      const nativeRequestAnimationFrame = window.requestAnimationFrame;
      const nativeCancelAnimationFrame = window.cancelAnimationFrame;
      const heldFrameId = -1;
      let captured = false;
      let pendingCallback = null;

      window.requestAnimationFrame = (callback) => {
        if (!captured) {
          captured = true;
          pendingCallback = callback;
          return heldFrameId;
        }
        return nativeRequestAnimationFrame.call(window, callback);
      };
      window.cancelAnimationFrame = (frameId) => {
        if (frameId === heldFrameId) {
          pendingCallback = null;
          return;
        }
        nativeCancelAnimationFrame.call(window, frameId);
      };
      window.releaseQuestionFocusFrame = () => {
        const callback = pendingCallback;
        pendingCallback = null;
        window.requestAnimationFrame = nativeRequestAnimationFrame;
        window.cancelAnimationFrame = nativeCancelAnimationFrame;
        callback?.(performance.now());
        return { captured, callbackStillPending: Boolean(callback) };
      };
    });

    await page.evaluate(() => new Promise((resolve) => {
      const questRoot = document.querySelector('#questionnaireRoot');
      const observer = new MutationObserver(() => {
        const input = questRoot.querySelector('form.question.active#DETAIL #detail');
        if (!input) return;

        observer.disconnect();
        input.focus();
        input.dispatchEvent(new KeyboardEvent('keydown', {
          bubbles: true,
          key: 'A',
          code: 'KeyA',
        }));
        input.value = 'A';
        input.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          data: 'A',
          inputType: 'insertText',
        }));
        resolve();
      });

      observer.observe(questRoot, { childList: true, subtree: true });
      questRoot.querySelector('form.question.active#PATH .next').click();
    }));

    expect(await page.evaluate(() => window.releaseQuestionFocusFrame())).toEqual({
      captured: true,
      callbackStillPending: false,
    });

    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));

    const input = activeQuestion(page, 'DETAIL').locator('#detail');
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('A');
    await expectHealthyHarness(page);
  });

  for (const scalarCase of [
    {
      description: 'English',
      lang: 'en',
      ageLabel: 'Age at diagnosis',
      yearLabel: 'Year at diagnosis',
      streetLabel: 'Street number',
      cityLabel: 'City',
      timeLabel: 'Preferred call time',
      notesLabel: 'Additional notes',
      emailLabel: 'Email address',
      phoneLabel: 'Telephone',
      ssnLabel: 'Full SSN',
      ssnLastFourLabel: 'Last four SSN digits',
      zipLabel: 'ZIP code',
      stateLabel: 'State',
      dateLabel: 'Visit date',
      monthLabel: 'Visit month',
      fallbackLabel: 'Enter a value',
      fallbackDescription: 'Value must be greater than or equal to 1. Value must be less than or equal to 3',
      zeroDescription: 'Value must be greater than or equal to 0. Value must be less than or equal to 10',
    },
    {
      description: 'Spanish',
      lang: 'es',
      ageLabel: 'Edad al momento del diagnóstico',
      yearLabel: 'Año del diagnóstico',
      streetLabel: 'Número de la calle',
      cityLabel: 'Ciudad',
      timeLabel: 'Hora preferida para llamar',
      notesLabel: 'Notas adicionales',
      emailLabel: 'Correo electrónico',
      phoneLabel: 'Teléfono',
      ssnLabel: 'Número de Seguro Social completo',
      ssnLastFourLabel: 'Últimos cuatro dígitos del Seguro Social',
      zipLabel: 'Código postal',
      stateLabel: 'Estado',
      dateLabel: 'Fecha de la visita',
      monthLabel: 'Mes de la visita',
      fallbackLabel: 'Introduzca un valor',
      fallbackDescription: 'El valor debe ser mayor o igual a 1. El valor debe ser menor o igual a 3',
      zeroDescription: 'El valor debe ser mayor o igual a 0. El valor debe ser menor o igual a 10',
    },
  ]) {
    test(`gives ${scalarCase.description} generated scalar controls useful names and separate guidance`, async ({ page }) => {
      await openParticipant(page, {
        lang: scalarCase.lang,
        markdown: `{"name":"TEST_SCALAR_LABEL"}

[SCALAR?] Diagnosis details.
|__|__|id=scalar_age min=1 max=10| ${scalarCase.ageLabel}
|__|__|__|__|id=scalar_year min=1900 max=2030| ${scalarCase.yearLabel}
${scalarCase.streetLabel} |__|id=scalar_street|
${scalarCase.cityLabel} |__|id=scalar_city|
${scalarCase.timeLabel} |time|id=scalar_time|
${scalarCase.notesLabel} |___|scalar_notes|
${scalarCase.emailLabel} |@|id=scalar_email|
${scalarCase.phoneLabel} |tel|id=scalar_phone|
${scalarCase.ssnLabel} |SSN|id=scalar_ssn|
${scalarCase.ssnLastFourLabel} |SSNsm|id=scalar_ssn_last_four|
${scalarCase.zipLabel} |zip|id=scalar_zip|
${scalarCase.stateLabel} |state|id=scalar_state|
${scalarCase.dateLabel} |date|id=scalar_date|
${scalarCase.monthLabel} |month|id=scalar_month|
<span id="scalar_zero_name">Zero minimum</span>
<span id="scalar_existing_hint">Existing hint</span>
|__|__|id=scalar_zero min=0 max=10 aria-labelledby='scalar_zero_name' aria-describedby='scalar_existing_hint scalar_zero-desc scalar_existing_hint'|
|__|__|id=scalar_explicit aria-label='Explicit number'|
|__|__|id=scalar_unbounded|

[FALLBACK?] Enter a number from 1 through 3.
|__|__|id=scalar_fallback min=1 max=3|

[END,end] Complete.`,
      });

      const question = activeQuestion(page, 'SCALAR');
      await expect(question.locator('#scalar_age')).toHaveAccessibleName(scalarCase.ageLabel);
      await expect(question.locator('#scalar_year')).toHaveAccessibleName(scalarCase.yearLabel);
      await expect(question.locator('#scalar_street')).toHaveAccessibleName(scalarCase.streetLabel);
      await expect(question.locator('#scalar_city')).toHaveAccessibleName(scalarCase.cityLabel);
      await expect(question.locator('#scalar_time')).toHaveAccessibleName(scalarCase.timeLabel);
      await expect(question.locator('#scalar_notes')).toHaveAccessibleName(scalarCase.notesLabel);
      await expect(question.locator('#scalar_email')).toHaveAccessibleName(scalarCase.emailLabel);
      await expect(question.locator('#scalar_phone')).toHaveAccessibleName(scalarCase.phoneLabel);
      await expect(question.locator('#scalar_ssn')).toHaveAccessibleName(scalarCase.ssnLabel);
      await expect(question.locator('#scalar_ssn_last_four')).toHaveAccessibleName(scalarCase.ssnLastFourLabel);
      await expect(question.locator('#scalar_zip')).toHaveAccessibleName(scalarCase.zipLabel);
      await expect(question.locator('#scalar_state')).toHaveAccessibleName(scalarCase.stateLabel);
      await expect(question.locator('#scalar_date')).toHaveAccessibleName(scalarCase.dateLabel);
      await expect(question.locator('#scalar_month')).toHaveAccessibleName(scalarCase.monthLabel);
      const zero = question.locator('#scalar_zero');
      await expect(zero).toHaveAccessibleName('Zero minimum');
      await expect(zero).toHaveAccessibleDescription(
        `Existing hint ${scalarCase.zeroDescription}`,
      );
      await expect(zero).toHaveAttribute(
        'aria-describedby',
        'scalar_existing_hint scalar_zero-desc',
      );
      await expect(zero).toHaveAttribute('placeholder', scalarCase.fallbackLabel);
      await expect(question.locator('#scalar_explicit')).toHaveAccessibleName('Explicit number');
      await expect(question.locator('#scalar_explicit')).toHaveAccessibleDescription(
        scalarCase.fallbackLabel,
      );
      const unbounded = question.locator('#scalar_unbounded');
      await expect(unbounded).toHaveAccessibleName(scalarCase.fallbackLabel);
      await expect(unbounded).toHaveAccessibleDescription('');
      await expect(unbounded).not.toHaveAttribute('aria-describedby');
      expect(await question.locator('input[type="number"]').evaluateAll((numbers) => {
        const ids = numbers.map(({ id }) => id);
        return new Set(ids).size === ids.length;
      })).toBe(true);

      await question.locator('#scalar_age').fill('4');
      await question.locator('#scalar_age').blur();
      await goNext(page);
      const fallback = activeQuestion(page, 'FALLBACK').locator('#scalar_fallback');
      await expect(fallback).toHaveAccessibleName(scalarCase.fallbackLabel);
      await expect(fallback).toHaveAccessibleDescription(scalarCase.fallbackDescription);
      await expectHealthyHarness(page);
    });
  }

  test('preserves scalar names that contain choice-like delimiters', async ({ page }) => {
    await openParticipant(page, {
      markdown: `{"name":"TEST_SCALAR_NAMES"}

[QUESTA11YOPTION_0_END?] Scalar names.
|@|id=email aria-label='Contact option (1) [2] &amp; more'|
|date|id=date aria-label='Appointment [2]'|
|time|id=time aria-label='Preferred time (3)'|
|__|__|id=number aria-label='Amount [4]'|

[END,end] Complete.`,
    });

    const question = activeQuestion(page, 'QUESTA11YOPTION_0_END');
    await expect(question.locator('#email')).toHaveAccessibleName('Contact option (1) [2] & more');
    await expect(question.locator('#date')).toHaveAccessibleName('Appointment [2]');
    await expect(question.locator('#time')).toHaveAccessibleName('Preferred time (3)');
    await expect(question.locator('#number')).toHaveAccessibleName('Amount [4]');
    await expect(question.locator('#number')).toHaveAttribute('name', 'QUESTA11YOPTION_0_END');
    await expect(question.locator('input')).toHaveCount(4);
    await expect(question.locator('input[type="radio"], input[type="checkbox"]')).toHaveCount(0);
    await expect(question.locator('.response')).toHaveCount(0);

    await question.locator('#number').fill('4');
    await question.locator('#number').blur();
    expect((await harnessSnapshot(page)).state.active).toEqual({
      QUESTA11YOPTION_0_END: {
        number: '4',
      },
    });
    await expectHealthyHarness(page);
  });

  test('crosses both host and Quest focus boundaries with Tab and reverse Shift+Tab', async ({ page }, testInfo) => {
    await openParticipant(page);

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
    expect(forward.some((entry) => entry.screenReaderFocus)).toBe(false);
    expect(forward.some((entry) => entry.responseTabStop)).toBe(false);
    expect(forward.some((entry) => entry.clickType === 'next')).toBe(true);
    expect(forward.some((entry) => entry.clickType === 'reset')).toBe(true);

    await page.locator('#host-after').focus();
    const reverse = await traverseHostBoundary(page, 'Shift+Tab', 'host-before');
    expect(reverse.slice(0, -1).every((entry) => entry.inQuest)).toBe(true);
    expect(reverse.some((entry) => entry.screenReaderFocus)).toBe(false);
    expect(reverse.some((entry) => entry.responseTabStop)).toBe(false);
    expect(reverse.some((entry) => entry.clickType === 'next')).toBe(true);
    expect(reverse.some((entry) => entry.clickType === 'reset')).toBe(true);
    await expectHealthyHarness(page);
  });

  test('names the soft-response dialog and restores question focus when it closes', async ({ page }, testInfo) => {
    await openParticipant(page);
    // Let the initial question-focus handoff complete before this test
    // isolates the Bootstrap modal focus trap. The competing-handoff case is
    // characterized separately below.
    await expect(activeQuestion(page, 'CHOICE').locator('.screen-reader-focus')).toBeFocused();
    await goNext(page);

    const modal = page.locator('#softModal');
    const dialog = page.getByRole('dialog', { name: 'Response requested' });
    await expect(modal).toHaveClass(/show/);
    await expect(dialog).toHaveAccessibleDescription(
      'There is 1 question unanswered on this page. Would you like to continue?',
    );
    const description = dialog.locator('#modalBodyText');
    await expect(description).toHaveAttribute('tabindex', '-1');
    // Browser automation cannot assert speech. Initial focus on the existing
    // static message is the causal contract exercised again with real AT.
    await expect(description).toBeFocused();
    if (testInfo.project.name === 'webkit-desktop') {
      // Safari's button-tabbing preference also affects modal controls. Keep
      // their stable DOM contract automated and exercise the native cycle in
      // the Full Keyboard Access manual matrix.
      expect(await modal.locator('button, [tabindex="0"]').evaluateAll((elements) => (
        elements.map((element) => element.id || element.getAttribute('aria-label'))
      ))).toEqual(['Close', 'modalContinueButton', 'modalCloseButton']);
    } else {
      await expectModalFocusCycle(
        page,
        modal,
        dialog.getByRole('button', { name: 'Close' }),
        dialog.getByRole('button', { name: 'Answer the Question' }),
      );
    }
    await dialog.getByRole('button', { name: 'Close' }).click();

    await expect(modal).not.toHaveClass(/show/);
    await expect(activeQuestion(page, 'CHOICE').locator('.screen-reader-focus')).toBeFocused();
    await expectHealthyHarness(page);
  });

  for (const key of ['Enter', 'Space']) {
    test(`promptly restores requested and required question context when Close is activated with ${key}`, async ({ page }) => {
      await openParticipant(page, { fixture: 'unansweredModals.txt' });
      await expect(activeQuestion(page, 'SOFT').locator('.screen-reader-focus')).toBeFocused();
      await goNext(page);

      const softModal = page.locator('#softModal');
      const softDialog = page.getByRole('dialog', { name: 'Response Requested' });
      await expect(softModal).toHaveClass(/show/);
      await closeUnansweredModalWithKeyboard(page, {
        modal: softModal,
        dialog: softDialog,
        questionId: 'SOFT',
        key,
      });

      await goNext(page);
      await softDialog.getByRole('button', { name: 'Continue Without Answering' }).click();
      await expect(activeQuestion(page, 'HARD')).toBeVisible();
      await expect(activeQuestion(page, 'HARD').locator('.screen-reader-focus')).toBeFocused();
      await goNext(page);

      const hardModal = page.locator('#hardModal');
      const hardDialog = page.getByRole('dialog', { name: 'Response Required' });
      await expect(hardModal).toHaveClass(/show/);
      await closeUnansweredModalWithKeyboard(page, {
        modal: hardModal,
        dialog: hardDialog,
        questionId: 'HARD',
        key,
      });
      await expectHealthyHarness(page);
    });
  }

  test('does not reclaim focus after immediate response interaction when a dialog closes', async ({ page }) => {
    await openParticipant(page, { fixture: 'unansweredModals.txt' });
    await expect(activeQuestion(page, 'SOFT').locator('.screen-reader-focus')).toBeFocused();
    await goNext(page);

    const modal = page.locator('#softModal');
    await expect(modal).toHaveClass(/show/);
    await modal.evaluate((element) => {
      element.addEventListener('hidden.bs.modal', () => {
        const response = document.querySelector('form.question.active#SOFT #SOFT_1');
        response.focus();
        response.click();
      }, { once: true });
    });

    await page.getByRole('dialog', { name: 'Response Requested' })
      .getByRole('button', { name: 'Answer the Question' })
      .click();
    await expect(modal).not.toHaveClass(/show/);

    // The retired implementation moved focus again after 100 ms. Waiting
    // beyond that boundary proves dismissal leaves the participant's newer
    // interaction in control.
    await waitInHarness(page, 250);
    const response = activeQuestion(page, 'SOFT').locator('#SOFT_1');
    await expect(response).toBeFocused();
    await expect(response).toBeChecked();
    await expectHealthyHarness(page);
  });

  test('distinguishes requested and required unanswered-response dialogs', async ({ page }, testInfo) => {
    await openParticipant(page, { fixture: 'unansweredModals.txt' });
    await expect(activeQuestion(page, 'SOFT').locator('.screen-reader-focus')).toBeFocused();
    await goNext(page);

    const softModal = page.locator('#softModal');
    const softDialog = page.getByRole('dialog', { name: 'Response Requested' });
    await expect(softModal).toHaveClass(/show/);
    await expect(softDialog.locator('#modalBodyText')).toBeFocused();
    await expect(softDialog.locator('#modalBodyText')).toHaveText(
      'There is 1 question unanswered on this page. Would you like to continue?',
    );
    await expect(softDialog).toHaveAccessibleDescription(
      'There is 1 question unanswered on this page. Would you like to continue?',
    );
    await expect(softDialog.locator('[role="alert"]')).toHaveCount(0);
    await expect(softDialog.locator('#modalBodyText')).not.toHaveAttribute('role', 'alert');
    await expect(softDialog.locator('#modalBodyText')).toHaveAttribute('tabindex', '-1');
    await expect(softDialog.getByRole('button')).toHaveCount(3);
    await expect(softDialog.getByRole('button', { name: 'Close' })).toBeVisible();
    await expect(softDialog.getByRole('button', { name: 'Continue Without Answering' })).toBeVisible();
    await expect(softDialog.getByRole('button', { name: 'Answer the Question' })).toBeVisible();

    await softDialog.getByRole('button', { name: 'Answer the Question' }).focus();
    await page.keyboard.press('Enter');
    await expect(softModal).not.toHaveClass(/show/);
    await expect(activeQuestion(page, 'SOFT')).toBeVisible();
    await expect(activeQuestion(page, 'SOFT').locator('.screen-reader-focus')).toBeFocused();

    await goNext(page);
    await softDialog.getByRole('button', { name: 'Continue Without Answering' }).focus();
    await page.keyboard.press('Enter');
    await expect(activeQuestion(page, 'HARD')).toBeVisible();
    expect((await harnessSnapshot(page)).state.survey).not.toHaveProperty('SOFT');

    await expect(activeQuestion(page, 'HARD').locator('.screen-reader-focus')).toBeFocused();
    await goNext(page);

    const hardModal = page.locator('#hardModal');
    const hardDialog = page.getByRole('dialog', { name: 'Response Required' });
    await expect(hardModal).toHaveClass(/show/);
    await expect(hardDialog.locator('#hardModalBodyText')).toBeFocused();
    await expect(hardDialog.locator('#hardModalBodyText')).toHaveText(
      'There is 1 question unanswered on this page. Please answer the question.',
    );
    await expect(hardDialog).toHaveAccessibleDescription(
      'There is 1 question unanswered on this page. Please answer the question.',
    );
    await expect(hardDialog.locator('[role="alert"]')).toHaveCount(0);
    await expect(hardDialog.locator('#hardModalBodyText')).not.toHaveAttribute('role', 'alert');
    await expect(hardDialog.locator('#hardModalBodyText')).toHaveAttribute('tabindex', '-1');
    await expect(hardDialog.getByRole('button')).toHaveCount(2);
    await expect(hardDialog.getByRole('button', { name: 'Close' })).toBeVisible();
    await expect(hardDialog.getByRole('button', { name: 'Answer the Question' })).toBeVisible();
    await expect(hardDialog.getByRole('button', { name: 'Continue Without Answering' })).toHaveCount(0);

    if (testInfo.project.name !== 'webkit-desktop') {
      await expectModalFocusCycle(
        page,
        hardModal,
        hardDialog.getByRole('button', { name: 'Close' }),
        hardDialog.getByRole('button', { name: 'Answer the Question' }),
      );
    }
    await hardDialog.getByRole('button', { name: 'Answer the Question' }).focus();
    await page.keyboard.press('Enter');
    await expect(hardModal).not.toHaveClass(/show/);
    await expect(activeQuestion(page, 'HARD')).toBeVisible();
    await expect(activeQuestion(page, 'HARD').locator('.screen-reader-focus')).toBeFocused();
    expect((await harnessSnapshot(page)).state.survey).not.toHaveProperty('HARD');

    await selectLabeledResponse(page, 'Required response');
    await goNext(page);
    await expect(activeQuestion(page, 'END')).toBeVisible();
    expect((await harnessSnapshot(page)).state.survey).toMatchObject({ HARD: '1' });
    await expectHealthyHarness(page);
  });

  test('names the submit dialog, focuses its description, and closes it with Escape', async ({ page }, testInfo) => {
    await openParticipant(page, { fixture: 'validation.txt' });
    await activeQuestion(page, 'BOUNDED').locator('#bounded').fill('2');
    await goNext(page);
    await expect(activeQuestion(page, 'END').locator('.screen-reader-focus')).toBeFocused();

    const trigger = activeQuestion(page, 'END').getByRole('button', { name: 'Submit your survey' });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Submit Answers' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleDescription('Are you sure you want to submit your answers?');
    await expect(dialog.locator('[role="alert"]')).toHaveCount(0);
    await expect(dialog.locator('#submitModalBodyText')).not.toHaveAttribute('role', 'alert');
    await expect(dialog.locator('#submitModalBodyText')).toHaveAttribute('tabindex', '-1');
    await expect(dialog.locator('#submitModalBodyText')).toBeFocused();
    const modal = page.locator('#submitModal');
    await modal.evaluate((element) => {
      element.__questInitialSubmitModalInstance = bootstrap.Modal.getInstance(element);
    });
    if (testInfo.project.name === 'webkit-desktop') {
      expect(await modal.locator('button, [tabindex="0"]').evaluateAll((elements) => (
        elements.map((element) => element.id || element.getAttribute('aria-label'))
      ))).toEqual(['Close', 'submitModalButton', 'cancelModalButton']);
    } else {
      await page.keyboard.press('Tab');
      await expect(dialog.getByRole('button', { name: 'Submit' })).toBeFocused();
      await expectModalFocusCycle(
        page,
        modal,
        dialog.getByRole('button', { name: 'Close' }),
        dialog.getByRole('button', { name: 'Cancel' }),
      );
    }
    await page.keyboard.press('Escape');

    await expect(page.locator('#submitModal')).not.toHaveClass(/show/);
    await expect(trigger).toBeFocused();

    await trigger.click();
    await expect(dialog).toBeVisible();
    expect(await modal.evaluate((element) => (
      bootstrap.Modal.getInstance(element) === element.__questInitialSubmitModalInstance
    ))).toBe(true);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(modal).not.toHaveClass(/show/);
    await expect(trigger).toBeFocused();
    await expectHealthyHarness(page);
  });

  test('disposes an open Quest modal before a sequential host render', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'The sequential modal lifecycle runs once in Chromium.');

    await openParticipant(page, { fixture: 'unansweredModals.txt' });
    await goNext(page);

    const modal = page.locator('#softModal');
    await expect(modal).toHaveClass(/show/);
    await expect(page.locator('.modal-backdrop')).toHaveCount(1);
    await expect(page.locator('body')).toHaveClass(/modal-open/);
    await modal.evaluate((element) => {
      window.__questObsoleteModalElement = element;
    });

    const renderResult = await page.evaluate(async (markdown) => {
      const { transform } = await import('/main.js');
      window.__questSequentialModalErrors = [];
      const questRoot = document.querySelector('#questionnaireRoot');
      const obsoleteTargets = new WeakSet([questRoot, ...questRoot.querySelectorAll('*')]);
      window.__questSequentialModalFocusHistory = [];
      window.__questSequentialModalFocusListener = (event) => {
        window.__questSequentialModalFocusHistory.push({
          id: event.target.id || null,
          className: typeof event.target.className === 'string' ? event.target.className : null,
          obsolete: obsoleteTargets.has(event.target),
        });
      };
      document.addEventListener('focusin', window.__questSequentialModalFocusListener);
      return transform.render({
        activate: true,
        errorLogger: (...args) => window.__questSequentialModalErrors.push(args.map(String).join(' ')),
        lang: 'en',
        questVersion: 'test-local',
        showProgressBarInQuest: true,
        store: async () => ({ code: 200 }),
        text: markdown,
      }, 'questionnaireRoot', {});
    }, readCanonicalFixture('unansweredModals.txt'));

    expect(renderResult).toBe(true);
    await expect(activeQuestion(page, 'SOFT')).toBeVisible();
    await expect(activeQuestion(page, 'SOFT').locator('.screen-reader-focus')).toBeFocused();
    await expect(page.locator('.modal-backdrop')).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveClass(/modal-open/);
    const disposal = await page.evaluate(() => {
      document.removeEventListener('focusin', window.__questSequentialModalFocusListener);
      return {
        connected: window.__questObsoleteModalElement.isConnected,
        hasInstance: bootstrap.Modal.getInstance(window.__questObsoleteModalElement) !== null,
        errors: window.__questSequentialModalErrors,
        focusHistory: window.__questSequentialModalFocusHistory,
      };
    });
    expect(disposal).toMatchObject({ connected: false, hasInstance: false, errors: [] });
    expect(disposal.focusHistory.filter(({ obsolete }) => obsolete)).toEqual([]);
    expect(disposal.focusHistory.some(({ className, obsolete }) => (
      !obsolete && className?.includes('screen-reader-focus')
    ))).toBe(true);
    await expectHealthyHarness(page);
  });

  test('does not restore an obsolete submit trigger during a sequential host render', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'The sequential submit lifecycle runs once in Chromium.');

    await openParticipant(page, { fixture: 'validation.txt' });
    await activeQuestion(page, 'BOUNDED').locator('#bounded').fill('2');
    await goNext(page);
    await expect(activeQuestion(page, 'END').locator('.screen-reader-focus')).toBeFocused();
    await activeQuestion(page, 'END').getByRole('button', { name: 'Submit your survey' }).click();
    await expect(page.locator('#submitModal')).toHaveClass(/show/);

    const renderResult = await page.evaluate(async (markdown) => {
      const { transform } = await import('/main.js');
      const questRoot = document.querySelector('#questionnaireRoot');
      const obsoleteTargets = new WeakSet([questRoot, ...questRoot.querySelectorAll('*')]);
      window.__questSequentialSubmitFocusHistory = [];
      window.__questSequentialSubmitFocusListener = (event) => {
        window.__questSequentialSubmitFocusHistory.push({
          id: event.target.id || null,
          className: typeof event.target.className === 'string' ? event.target.className : null,
          obsolete: obsoleteTargets.has(event.target),
        });
      };
      document.addEventListener('focusin', window.__questSequentialSubmitFocusListener);
      return transform.render({
        activate: true,
        lang: 'en',
        questVersion: 'test-local',
        showProgressBarInQuest: true,
        store: async () => ({ code: 200 }),
        text: markdown,
      }, 'questionnaireRoot', {});
    }, readCanonicalFixture('validation.txt'));

    expect(renderResult).toBe(true);
    await expect(activeQuestion(page, 'BOUNDED').locator('.screen-reader-focus')).toBeFocused();
    const focusHistory = await page.evaluate(() => {
      document.removeEventListener('focusin', window.__questSequentialSubmitFocusListener);
      return window.__questSequentialSubmitFocusHistory;
    });
    expect(focusHistory.filter(({ obsolete }) => obsolete)).toEqual([]);
    expect(focusHistory.some(({ className, obsolete }) => (
      !obsolete && className?.includes('screen-reader-focus')
    ))).toBe(true);
    await expect(page.locator('.modal-backdrop')).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveClass(/modal-open/);
    await expectHealthyHarness(page);
  });

  test('keeps focus on a response dialog when it opens before the question-focus handoff', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'The animation-frame focus race runs once in Chromium.');

    await openParticipant(page);
    await page.evaluate(() => new Promise((resolve) => {
      const questRoot = document.querySelector('#questionnaireRoot');
      const observer = new MutationObserver(() => {
        const checks = questRoot.querySelector('form.question.active#CHECKS');
        if (!checks) return;

        observer.disconnect();
        checks.querySelector('.next').click();
        resolve();
      });

      observer.observe(questRoot, { childList: true, subtree: true });
      questRoot.querySelector('#CHOICE_1').click();
      questRoot.querySelector('form.question.active#CHOICE .next').click();
    }));

    const description = page.locator('#modalBodyText');
    await expect(description).toBeFocused();
    await page.evaluate(() => new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
    await expect(description).toBeFocused();
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
    await expectNoUnwaivedAxeViolations(page);
    await expectHealthyHarness(page);
  });

  test('has no unwaived findings while range validation is visible', async ({ page }) => {
    await openParticipant(page, { fixture: 'validation.txt' });
    await activeQuestion(page, 'BOUNDED').locator('#bounded').fill('9');
    await goNext(page);
    await expect(activeQuestion(page).locator('.validation-container')).toBeVisible();
    // The validation click can leave Firefox's pointer over the repositioned
    // Next button. Keep this scan on the validation state, not an accidental
    // and browser-layout-dependent hover state.
    await page.mouse.move(0, 0);
    await expectNoUnwaivedAxeViolations(page);
    await expect(activeQuestion(page).locator('.validation-container > span')).toHaveCSS(
      'color',
      'rgb(193, 18, 31)',
    );
    await expectHealthyHarness(page);
  });

  test('retains sufficient action contrast while hovered', async ({ page }, testInfo) => {
    test.skip(
      !ACCESSIBILITY_PROJECTS.has(testInfo.project.name),
      'Pointer-hover contrast is checked in each desktop engine and the Windows user-agent project.',
    );
    await openParticipant(page, { fixture: 'validation.txt' });
    const next = activeQuestion(page, 'BOUNDED').getByRole('button', { name: 'Next question' });
    await next.hover();

    await expect(next).toHaveCSS('background-color', 'rgb(44, 109, 168)');
    await expect(next).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expectNoUnwaivedAxeViolations(page);
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
