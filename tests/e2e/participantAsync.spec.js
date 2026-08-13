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
});
