import { test, expect } from './support/test.js';
import {
  activeQuestion,
  expectHealthyHarness,
  goNext,
  harnessSnapshot,
  openParticipant,
  selectLabeledResponse,
} from './support/harness.js';

const CONTROL_PROJECTS = new Set([
  'chromium-desktop',
  'firefox-desktop',
  'webkit-desktop',
  'chromium-windows-ua',
]);

test.describe('participant controls @core @canonical', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      !CONTROL_PROJECTS.has(testInfo.project.name),
      'Canonical control walks run in the three desktop engines and Windows user-agent branch.',
    );
  });

  test('loads a checked-in synthetic fixture through the manual-test query', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'One browser verifies the manual harness entry point.');

    await page.goto('/tests/harness/participant.html?fixture=runtimeControls.txt');
    await page.waitForFunction(() => document.querySelector('#questionnaireRoot form.question.active#CHOICE'));
    await expect(activeQuestion(page, 'CHOICE')).toContainText('Which color do you prefer?');
    const snapshot = await expectHealthyHarness(page);
    expect(snapshot.logs.renders).toHaveLength(1);
  });

  test('answers common controls, persists deltas, and submits the survey', async ({ page }) => {
    await openParticipant(page);

    await expect(activeQuestion(page, 'CHOICE')).toBeVisible();
    await expect(activeQuestion(page).getByRole('button', { name: 'Back to the previous question' })).toHaveCount(0);
    await selectLabeledResponse(page, 'Blue');
    await goNext(page);

    await expect(activeQuestion(page, 'CHECKS')).toBeVisible();
    await selectLabeledResponse(page, 'Email');
    await selectLabeledResponse(page, 'Text message');
    await goNext(page);

    await expect(activeQuestion(page, 'TEXT')).toBeVisible();
    await activeQuestion(page).locator('#nickname').fill('Casey');
    await goNext(page);

    await expect(activeQuestion(page, 'NUMBER')).toBeVisible();
    await activeQuestion(page).locator('#visit_count').fill('3');
    await goNext(page);

    await expect(activeQuestion(page, 'STATE')).toBeVisible();
    const stateSelect = activeQuestion(page).locator('#home_state');
    await stateSelect.focus();
    await stateSelect.selectOption('MD');
    await stateSelect.blur();
    await goNext(page);

    await expect(activeQuestion(page, 'DATE')).toBeVisible();
    await activeQuestion(page).locator('#visit_date').fill('2026-01-15');
    await goNext(page);

    await expect(activeQuestion(page, 'TIME')).toBeVisible();
    await activeQuestion(page).locator('#visit_time').fill('09:30');
    await goNext(page);

    await expect(activeQuestion(page, 'END')).toBeVisible();
    await activeQuestion(page).getByRole('button', { name: 'Submit your survey' }).click();
    await expect(page.locator('#submitModal')).toHaveClass(/show/);
    await expect(page.locator('#submitModalBodyText')).toBeFocused();
    await page.locator('#submitModalButton').click();

    const snapshot = await expectHealthyHarness(page);
    const changedKeys = snapshot.logs.storeCalls.flatMap((call) => Object.keys(call.changes));
    expect(changedKeys).toEqual(expect.arrayContaining([
      'TEST_RUNTIME.CHOICE',
      'TEST_RUNTIME.CHECKS',
      'TEST_RUNTIME.TEXT',
      'TEST_RUNTIME.NUMBER',
      'TEST_RUNTIME.STATE',
      'TEST_RUNTIME.DATE',
      'TEST_RUNTIME.TIME',
      'TEST_RUNTIME.COMPLETED',
      'TEST_RUNTIME.COMPLETED_TS',
      'TEST_RUNTIME.treeJSON',
    ]));
    expect(snapshot.logs.storeCalls.at(-1).changes['TEST_RUNTIME.COMPLETED']).toBe(true);
    expect(snapshot.state.survey).toMatchObject({
      CHOICE: '1',
      CHECKS: ['1', '2'],
      TEXT: 'Casey',
      NUMBER: '3',
      STATE: 'MD',
      DATE: '2026-01-15',
      TIME: '09:30',
    });
  });

  test('blocks an out-of-range number and clears the error after correction', async ({ page }) => {
    await openParticipant(page, { fixture: 'validation.txt' });
    const number = activeQuestion(page, 'BOUNDED').locator('#bounded');
    const initialDescriptionId = await number.getAttribute('aria-describedby');
    expect(initialDescriptionId).toBe('bounded-desc');

    await number.fill('9');
    await goNext(page);
    await expect(activeQuestion(page, 'BOUNDED')).toBeVisible();
    const error = activeQuestion(page).locator('.validation-container');
    await expect(error).toContainText('Value must be less than or equal to 3');
    await expect(error).toHaveAttribute('role', 'alert');
    await expect(error).toHaveAttribute('aria-atomic', 'true');
    const errorId = await error.getAttribute('id');
    expect(errorId).toMatch(/^quest-validation-error-/);
    await expect(number).toHaveAttribute('aria-invalid', 'true');
    expect((await number.getAttribute('aria-describedby')).split(/\s+/)).toEqual([
      initialDescriptionId,
      errorId,
    ]);
    const invalidDescription = await number.evaluate((input) => (
      input.getAttribute('aria-describedby')
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent.trim())
        .filter(Boolean)
        .join(' ')
    ));
    await expect(number).toHaveAccessibleDescription(invalidDescription);

    await number.fill('2');
    await number.blur();
    await expect(activeQuestion(page).locator('.validation-container')).toHaveCount(0);
    await expect(number).not.toHaveAttribute('aria-invalid');
    await expect(number).toHaveAttribute('aria-describedby', initialDescriptionId);
    await expect(number).toHaveAccessibleDescription(
      await page.locator(`#${initialDescriptionId}`).textContent(),
    );
    await goNext(page);
    await expect(activeQuestion(page, 'END')).toBeVisible();
    await expectHealthyHarness(page);
  });

  test('delegated keyboard submits activate Next, Reset, and Back with Enter and Space @windows-a11y', async ({ page }) => {
    await openParticipant(page, { fixture: 'navigationState.txt' });

    async function pressAction(name, key, expectedQuestionId) {
      const button = activeQuestion(page).getByRole('button', { name });
      await button.focus();
      await expect(button).toBeFocused();
      await page.keyboard.press(key);

      const question = activeQuestion(page, expectedQuestionId);
      await expect(question).toBeVisible();
      if (name !== 'Reset this answer') {
        await expect(question.locator('.screen-reader-focus')).toBeFocused();
      }
    }

    await selectLabeledResponse(page, 'Yes');
    await pressAction('Next question', 'Enter', 'DETAIL');

    const detail = activeQuestion(page, 'DETAIL').locator('#detail');
    await detail.fill('Reset by Enter');
    await detail.blur();
    await pressAction('Reset this answer', 'Enter', 'DETAIL');
    await expect(detail).toHaveValue('');
    expect((await harnessSnapshot(page)).state.survey.DETAIL).toBeUndefined();

    await detail.fill('Reset by Space');
    await detail.blur();
    await pressAction('Reset this answer', 'Space', 'DETAIL');
    await expect(detail).toHaveValue('');
    expect((await harnessSnapshot(page)).state.survey.DETAIL).toBeUndefined();

    await detail.fill('Keyboard detail');
    await detail.blur();
    await pressAction('Next question', 'Space', 'SUMMARY');

    await pressAction('Back to the previous question', 'Enter', 'DETAIL');
    await expect(activeQuestion(page, 'DETAIL').locator('#detail')).toHaveValue('Keyboard detail');

    await pressAction('Back to the previous question', 'Space', 'PATH');
    await expect(activeQuestion(page, 'PATH').locator('#PATH_1')).toBeChecked();

    const snapshot = await expectHealthyHarness(page);
    expect(snapshot.state.survey).toMatchObject({ PATH: '1' });
    expect(snapshot.state.survey.DETAIL).toBeUndefined();

    const keyActions = snapshot.logs.events
      .filter((event) => event.type === 'keydown' && ['Enter', ' '].includes(event.key))
      .map((event) => ({
        key: event.key === ' ' ? 'Space' : event.key,
        action: event.target.className?.split(' ').find((name) => (
          ['next', 'reset', 'previous'].includes(name)
        )),
      }));
    expect(keyActions).toEqual(expect.arrayContaining([
      { key: 'Enter', action: 'next' },
      { key: 'Space', action: 'next' },
      { key: 'Enter', action: 'reset' },
      { key: 'Space', action: 'reset' },
      { key: 'Enter', action: 'previous' },
      { key: 'Space', action: 'previous' },
    ]));

    const delegatedSubmits = snapshot.logs.events.filter((event) => (
      event.type === 'submit'
      && ['PATH', 'DETAIL', 'SUMMARY'].includes(event.target.id)
    ));
    expect(delegatedSubmits).toHaveLength(6);
    expect(delegatedSubmits.every((event) => event.defaultPrevented)).toBe(true);
    expect(snapshot.logs.host.keydownCount).toBeGreaterThanOrEqual(6);
    expect(snapshot.logs.errors).toEqual([]);
  });

  test('uses prefetched text while loading URL-signaled styles beside the local Quest module', async ({ page }) => {
    const questionnaireUrl = 'https://questionnaire.test/prod/module.txt';
    await openParticipant(page, { url: questionnaireUrl, questVersion: '2.0.0-test' });

    await expect(activeQuestion(page, 'CHOICE')).toBeVisible();
    await expect(page.locator('head link[rel="stylesheet"][href^="blob:"]')).toHaveCount(2);
    const questBasePath = (await harnessSnapshot(page)).runtime.basePath;
    expect(questBasePath).toBe(new URL('/', page.url()).href);

    const snapshot = await expectHealthyHarness(page);
    expect(snapshot.logs.renders[0].config).toMatchObject({
      url: questionnaireUrl,
      questVersion: '2.0.0-test',
    });
    expect(snapshot.logs.retrieveCalls).toHaveLength(1);
  });
});
