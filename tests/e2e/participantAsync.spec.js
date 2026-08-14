import { test, expect } from './support/test.js';
import {
  activeQuestion,
  expectHealthyHarness,
  goNext,
  harnessSnapshot,
  openParticipant,
  selectLabeledResponse,
} from './support/harness.js';

const ASYNC_MAP = {
  '[ASYNC?]': { func: 'loadSyntheticOptions', args: ['SEED'] },
};

const ASYNC_HTML = `
  <span>Choose the host-provided option.</span>
  <div class="response">
    <input type="radio" name="ASYNC" id="ASYNC_A" value="A">
    <label for="ASYNC_A">Host option A</label>
  </div>
  <div class="response">
    <input type="radio" name="ASYNC" id="ASYNC_B" value="B">
    <label for="ASYNC_B">Host option B</label>
  </div>
`;

const DESKTOP_ENGINES = new Set(['chromium-desktop', 'firefox-desktop', 'webkit-desktop']);

test.describe('host-provided asynchronous questions @core @canonical', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(!DESKTOP_ENGINES.has(testInfo.project.name), 'Async host contract runs in each desktop browser engine.');
  });

  test('passes prior answers and locale to the host, then persists the injected response', async ({ page }) => {
    await openParticipant(page, {
      fixture: 'asyncQuestion.txt',
      asyncQuestionsMap: ASYNC_MAP,
      asyncQuestionHtml: ASYNC_HTML,
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
      asyncQuestionsMap: ASYNC_MAP,
      asyncOutcomes: [{ kind: 'reject', message: 'Synthetic async failure' }],
    });
    await selectLabeledResponse(page, 'Research');
    await goNext(page);

    await expect(activeQuestion(page, 'ASYNC')).toBeVisible();
    await expect(activeQuestion(page).locator('.validation-container')).toContainText('Error fetching question');
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
      asyncQuestionsMap: ASYNC_MAP,
      asyncQuestionHtml: ASYNC_HTML,
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
