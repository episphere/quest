import { test, expect } from './support/test.js';
import {
  activeQuestion,
  expectHealthyHarness,
  goNext,
  harnessSnapshot,
  openParticipant,
  selectLabeledResponse,
} from './support/harness.js';
import {
  ASYNC_QUESTION_HTML,
  ASYNC_QUESTION_MAP,
} from '../harness/participantScenarios.js';

const DESKTOP_ENGINES = new Set(['chromium-desktop', 'firefox-desktop', 'webkit-desktop']);

test.describe('host-provided asynchronous questions @core @canonical', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(!DESKTOP_ENGINES.has(testInfo.project.name), 'Async host contract runs in each desktop browser engine.');
  });

  test('passes prior answers and locale to the host, then persists the injected response', async ({ page }) => {
    await openParticipant(page, {
      fixture: 'asyncQuestion.txt',
      asyncQuestionsMap: ASYNC_QUESTION_MAP,
      asyncQuestionHtml: ASYNC_QUESTION_HTML,
      asyncDelayMs: 75,
    });
    await selectLabeledResponse(page, 'Clinical');
    await goNext(page);

    await expect(activeQuestion(page, 'ASYNC')).toBeVisible();
    await expect(activeQuestion(page).locator('#ASYNC_A')).toHaveCount(1);
    const afterLoad = await harnessSnapshot(page);
    expect(afterLoad.logs.asyncCalls).toHaveLength(1);
    expect(afterLoad.logs.asyncCalls[0]).toMatchObject({
      func: 'loadSyntheticOptions',
      args: ['1', 'en'],
    });

    await selectLabeledResponse(page, 'Host option B');
    await goNext(page);
    await expect(activeQuestion(page, 'END')).toBeVisible();
    const finalSnapshot = await expectHealthyHarness(page);
    expect(finalSnapshot.logs.storeCalls.some((call) => call.changes['TEST_ASYNC.ASYNC'] === 'B')).toBe(true);
  });

  test('renders an in-question error and logs host rejection without leaving the question', async ({ page }) => {
    await openParticipant(page, {
      fixture: 'asyncQuestion.txt',
      asyncQuestionsMap: ASYNC_QUESTION_MAP,
      asyncOutcomes: [{ kind: 'reject', message: 'Synthetic async failure' }],
    });
    await selectLabeledResponse(page, 'Research');
    await goNext(page);

    await expect(activeQuestion(page, 'ASYNC')).toBeVisible();
    const error = activeQuestion(page).locator('.validation-container');
    await expect(error).toHaveText('Error fetching question. Please go back and try again.');
    await expect(error).toHaveAttribute('tabindex', '-1');
    await expect(error).not.toHaveAttribute('role');
    await expect(error).toBeFocused();
    await expect(activeQuestion(page).locator('.screen-reader-focus')).not.toBeFocused();
    await expect(page.locator('#ariaLiveQuestionAnnouncer')).toHaveText('');
    await expect(activeQuestion(page).locator('fieldset')).not.toContainText('Loading...');
    await expect(activeQuestion(page).locator('.response')).toHaveCount(0);
    await expect(page.locator('#loadingIndicator')).toHaveCount(0);

    await page.keyboard.press('Tab');
    await expect(activeQuestion(page).getByRole('button', { name: 'Next question' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(activeQuestion(page).getByRole('button', { name: 'Back to the previous question' })).toBeFocused();
    const snapshot = await expectHealthyHarness(page, { allowErrors: true });
    expect(snapshot.logs.errors.some((entry) => entry.message.includes('Synthetic async failure'))).toBe(true);
  });

  test('waits for delayed async markup before focusing after optional-modal continuation', async ({ page }) => {
    await openParticipant(page, {
      markdown: `
        {"name":"TEST_ASYNC_MODAL"}

        [OPTIONAL?] You may continue without answering.
        (1) Optional response

        [ASYNC?]

        [END,end] Async modal focus testing complete.
      `,
      asyncQuestionsMap: ASYNC_QUESTION_MAP,
      asyncQuestionHtml: ASYNC_QUESTION_HTML,
      asyncDelayMs: 400,
    });
    await expect(activeQuestion(page, 'OPTIONAL').locator('.screen-reader-focus')).toBeFocused();

    await page.evaluate(() => {
      window.__asyncQuestionFocusHistory = [];
      document.addEventListener('focusin', (event) => {
        if (!event.target.matches?.('.screen-reader-focus')) return;
        const question = event.target.closest('form.question');
        window.__asyncQuestionFocusHistory.push({
          questionId: question?.id ?? null,
          hasResponseMarkup: Boolean(question?.querySelector('.response')),
        });
      }, true);
    });

    await goNext(page);
    const dialog = page.getByRole('dialog', { name: 'Response Requested' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Continue Without Answering' }).click();

    await expect(activeQuestion(page, 'ASYNC').locator('#ASYNC_A')).toHaveCount(1);
    await expect(activeQuestion(page, 'ASYNC').locator('.screen-reader-focus')).toBeFocused();

    const asyncFocusHistory = await page.evaluate(() => window.__asyncQuestionFocusHistory);
    const asyncQuestionFocus = asyncFocusHistory.filter(({ questionId }) => questionId === 'ASYNC');
    expect(asyncQuestionFocus.length).toBeGreaterThan(0);
    expect(asyncQuestionFocus.every(({ hasResponseMarkup }) => hasResponseMarkup)).toBe(true);
    await expectHealthyHarness(page);
  });
});
