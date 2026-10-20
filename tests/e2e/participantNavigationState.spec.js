import { test, expect } from './support/test.js';
import {
  activeQuestion,
  expectHealthyHarness,
  flushHarness,
  goBack,
  goNext,
  harnessSnapshot,
  openParticipant,
  readCanonicalFixture,
  selectLabeledResponse,
} from './support/harness.js';

const DESKTOP_ENGINES = new Set(['chromium-desktop', 'firefox-desktop', 'webkit-desktop']);

function treeAt(questionId) {
  return JSON.stringify({
    rootNode: { value: null, children: [{ value: questionId, children: [] }] },
    currentNode: questionId,
  });
}

test.describe('participant navigation and state @core @canonical', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(!DESKTOP_ENGINES.has(testInfo.project.name), 'State and error flows run in each desktop browser engine.');
  });

  test('takes an explicit skip target and Back returns along the visited path', async ({ page }) => {
    await openParticipant(page, { fixture: 'navigationState.txt' });
    await selectLabeledResponse(page, 'No');
    await goNext(page);

    await expect(activeQuestion(page, 'SUMMARY')).toBeVisible();
    await goBack(page);
    await expect(activeQuestion(page, 'PATH')).toBeVisible();

    const snapshot = await expectHealthyHarness(page);
    expect(snapshot.logs.storeCalls[0].changes['TEST_NAV.PATH']).toBe('0');
  });

  test('executes default, reset, and no-response transitions through delegated controls', async ({ page }) => {
    await openParticipant(page, { fixture: 'navigationBoundaries.txt' });
    await goNext(page);
    await expect(activeQuestion(page, 'PATH')).toBeVisible();

    await selectLabeledResponse(page, 'Explicit route');
    await activeQuestion(page).getByRole('button', { name: 'Reset this answer' }).click();
    await expect(activeQuestion(page).locator('input[type="radio"]:checked')).toHaveCount(0);

    await goNext(page);
    await page.getByRole('button', { name: 'Continue Without Answering' }).click();
    await expect(activeQuestion(page, 'NO_RESPONSE_TARGET')).toBeVisible();
    await goNext(page);
    await expect(activeQuestion(page, 'END')).toBeVisible();
    await expectHealthyHarness(page);
  });

  test('executes explicit and sequential alternatives on fresh pages', async ({ page }) => {
    await openParticipant(page, { fixture: 'navigationBoundaries.txt' });
    await goNext(page);
    await selectLabeledResponse(page, 'Explicit route');
    await goNext(page);
    await expect(activeQuestion(page, 'EXPLICIT_TARGET')).toBeVisible();

    await page.reload();
    await page.waitForFunction(() => window.questHarness?.ready === true);
    await openParticipant(page, { fixture: 'navigationBoundaries.txt' });
    await goNext(page);
    await selectLabeledResponse(page, 'Sequential route');
    await goNext(page);
    await expect(activeQuestion(page, 'SEQUENTIAL_TARGET')).toBeVisible();
    await expectHealthyHarness(page);
  });

  for (const iterationCount of [0, 1, 2, 25]) {
    test(`executes exactly ${iterationCount} loop iteration(s) without collapsing unrolled IDs`, async ({ page }) => {
      await openParticipant(page, { fixture: 'loopBoundaries.txt' });
      await activeQuestion(page, 'D_900000001').locator('#D_900000001').fill(String(iterationCount));
      await goNext(page);

      const observedLoopIds = [];
      while (await activeQuestion(page).getAttribute('id') !== 'END') {
        const questionId = await activeQuestion(page).getAttribute('id');
        expect(questionId).toMatch(/^ITEM_\d+_\d+$/);
        observedLoopIds.push(questionId);
        await selectLabeledResponse(page, 'Continue');
        await goNext(page);
      }

      expect(observedLoopIds).toHaveLength(iterationCount);
      expect(new Set(observedLoopIds).size).toBe(iterationCount);
      expect(observedLoopIds).toEqual(Array.from({ length: iterationCount }, (_, index) => (
        `ITEM_${index + 1}_${index + 1}`
      )));
      await expectHealthyHarness(page);
    });
  }

  test('Back preserves stable unrolled loop IDs from iteration 2 to iteration 1', async ({ page }) => {
    await openParticipant(page, { fixture: 'loopBoundaries.txt' });
    await activeQuestion(page, 'D_900000001').locator('#D_900000001').fill('2');
    await goNext(page);
    await expect(activeQuestion(page, 'ITEM_1_1')).toBeVisible();
    await selectLabeledResponse(page, 'Continue');
    await goNext(page);
    await expect(activeQuestion(page, 'ITEM_2_2')).toBeVisible();

    await goBack(page);
    await expect(activeQuestion(page, 'ITEM_1_1')).toBeVisible();
    await expect(activeQuestion(page).locator('input[type="radio"]:checked')).toHaveValue('1');
    await expectHealthyHarness(page);
  });

  test('restores the exact unrolled loop iteration from persisted host state', async ({ page }) => {
    await openParticipant(page, { fixture: 'loopBoundaries.txt' });
    await activeQuestion(page, 'D_900000001').locator('#D_900000001').fill('2');
    await goNext(page);
    await selectLabeledResponse(page, 'Continue');
    await goNext(page);
    await expect(activeQuestion(page, 'ITEM_2_2')).toBeVisible();
    await selectLabeledResponse(page, 'Continue');
    await goNext(page);
    await expect(activeQuestion(page, 'END')).toBeVisible();
    await flushHarness(page);

    const beforeReload = await harnessSnapshot(page);
    expect(beforeReload.state.survey).toMatchObject({ D_900000001: '2', ITEM_1_1: '1', ITEM_2_2: '1' });
    expect(beforeReload.state.survey.treeJSON).toContain('ITEM_2_2');

    await page.reload();
    await page.waitForFunction(() => window.questHarness?.ready === true);
    await page.evaluate(({ markdown, persistedData }) => window.questHarness.render({ markdown, persistedData }), {
      markdown: readCanonicalFixture('loopBoundaries.txt'),
      persistedData: beforeReload.state.survey,
    });

    await expect(activeQuestion(page, 'ITEM_2_2')).toBeVisible();
    const restored = await harnessSnapshot(page);
    expect(restored.state.survey).toMatchObject({ D_900000001: '2', ITEM_1_1: '1', ITEM_2_2: '1' });
    await expect(activeQuestion(page).locator('input[type="radio"]:checked')).toHaveValue('1');
    await expectHealthyHarness(page);
  });

  test('restores answers and navigation tree from host-retrieved state after reload', async ({ page }) => {
    await openParticipant(page, { fixture: 'navigationState.txt' });
    await selectLabeledResponse(page, 'Yes');
    await goNext(page);
    await expect(activeQuestion(page, 'DETAIL')).toBeVisible();
    await activeQuestion(page).locator('#detail').fill('Follow up');
    await goNext(page);
    await expect(activeQuestion(page, 'SUMMARY')).toBeVisible();
    await flushHarness(page);

    const beforeReload = await harnessSnapshot(page);
    expect(beforeReload.state.survey).toMatchObject({ PATH: '1', DETAIL: 'Follow up' });

    await page.reload();
    await page.waitForFunction(() => window.questHarness?.ready === true);
    await page.evaluate(({ markdown, persistedData }) => window.questHarness.render({ markdown, persistedData }), {
      markdown: readCanonicalFixture('navigationState.txt'),
      persistedData: beforeReload.state.survey,
    });

    const restored = await harnessSnapshot(page);
    expect(restored.state.survey).toMatchObject({ PATH: '1', DETAIL: 'Follow up' });
    expect(['DETAIL', 'SUMMARY']).toContain(restored.activeQuestionId);
    await expectHealthyHarness(page);
  });

  test('advances before a delayed successful store operation settles', async ({ page }) => {
    await openParticipant(page, {
      fixture: 'navigationState.txt',
      storeMode: 'delayed',
      hostDelayMs: 500,
    });
    await selectLabeledResponse(page, 'Yes');
    await goNext(page);

    expect(await activeQuestion(page).getAttribute('id')).toBe('DETAIL');
    const pendingSnapshot = await harnessSnapshot(page);
    expect(pendingSnapshot.logs.storeCalls).toHaveLength(1);
    expect(pendingSnapshot.logs.storeCalls[0].outcome).toMatchObject({
      kind: 'resolve',
      delayMs: 500,
      value: { code: 200 },
    });

    await flushHarness(page);
    await expect(activeQuestion(page, 'DETAIL')).toBeVisible();
    await expectHealthyHarness(page);
  });

  for (const storeFailure of [
    {
      label: 'non-200 result',
      outcome: {
        kind: 'resolve',
        value: { code: 503, message: 'Synthetic non-200 store response' },
      },
    },
    {
      label: 'rejected operation',
      outcome: { kind: 'reject', message: 'Synthetic store rejection' },
    },
  ]) {
    test(`restores the response and permits an exact retry after a ${storeFailure.label}`, async ({ page }) => {
      await openParticipant(page, {
        fixture: 'navigationState.txt',
        storeOutcomes: [
          storeFailure.outcome,
          { kind: 'resolve', value: { code: 200 } },
        ],
      });
      await selectLabeledResponse(page, 'Yes');
      await goNext(page);
      await flushHarness(page);

      await expect(activeQuestion(page, 'PATH')).toBeVisible();
      await expect(activeQuestion(page, 'PATH').locator('#PATH_1')).toBeChecked();
      const storeErrorModal = page.locator('#storeErrorModal');
      const storeErrorDialog = page.getByRole('dialog', { name: 'Error saving response' });
      await expect(storeErrorModal).toHaveClass(/show/);
      await expect(storeErrorDialog).toHaveAccessibleDescription(
        'There was an error saving your response. Please try again.',
      );
      await expect(storeErrorDialog.locator('[role="alert"]')).toHaveCount(0);
      await expect(storeErrorDialog.locator('#storeErrorModalBody')).toHaveAttribute('tabindex', '-1');
      await expect(storeErrorDialog.locator('#storeErrorModalBody')).toBeFocused();
      const failed = await expectHealthyHarness(page, { allowErrors: true });
      expect(failed.logs.errors.filter((entry) => entry.message.includes('syncToStore'))).toHaveLength(1);
      expect(failed.logs.storeCalls).toHaveLength(1);
      expect(failed.logs.storeCalls[0].outcome.kind).toBe(storeFailure.outcome.kind);
      expect(failed.logs.storeCalls[0].changes).toEqual({
        'TEST_NAV.PATH': '1',
        'TEST_NAV.treeJSON': expect.any(String),
      });
      expect(JSON.parse(failed.logs.storeCalls[0].changes['TEST_NAV.treeJSON']).currentNode).toBe('PATH?');
      expect(failed.state.survey).toEqual({});
      expect(failed.state.active).toEqual({ PATH: '1' });
      expect(failed.state.mapping).toMatchObject({ PATH: 'PATH' });
      expect(failed.state.cache).toMatchObject({ PATH: '1' });

      await storeErrorModal.evaluate((element) => {
        element.addEventListener('hidden.bs.modal', () => {
          const activeElement = document.activeElement;
          element.__questFocusAtHidden = {
            isQuestionTarget: activeElement?.classList?.contains('screen-reader-focus') ?? false,
            questionId: activeElement?.closest?.('form.question.active')?.id ?? null,
          };
        }, { once: true });
      });
      await storeErrorDialog.getByRole('button', { name: 'Close' }).first().click();
      await expect(storeErrorModal).not.toHaveClass(/show/);
      expect(await storeErrorModal.evaluate((element) => element.__questFocusAtHidden)).toEqual({
        isQuestionTarget: true,
        questionId: 'PATH',
      });
      await expect(activeQuestion(page, 'PATH').locator('.screen-reader-focus')).toBeFocused();
      await goNext(page);
      await flushHarness(page);

      await expect(activeQuestion(page, 'DETAIL')).toBeVisible();
      const retried = await expectHealthyHarness(page, { allowErrors: true });
      expect(retried.logs.storeCalls).toHaveLength(2);
      expect(retried.logs.storeCalls[1]).toMatchObject({
        status: 'fulfilled',
        value: { code: 200 },
      });
      expect(retried.logs.storeCalls[1].changes).toEqual(
        retried.logs.storeCalls[0].changes,
      );
      expect(retried.state.survey).toEqual({
        PATH: '1',
        treeJSON: retried.logs.storeCalls[1].changes['TEST_NAV.treeJSON'],
      });
      expect(retried.state.active).toEqual({});
    });
  }

  test('waits for delayed retrieve data and restores it before activating the survey', async ({ page }) => {
    await openParticipant(page, {
      fixture: 'navigationState.txt',
      retrieveDelayMs: 150,
      retrieveResult: {
        data: {
          TEST_NAV: { PATH: '1', treeJSON: treeAt('PATH') },
        },
      },
    });

    const snapshot = await expectHealthyHarness(page);
    expect(snapshot.logs.retrieveCalls).toHaveLength(1);
    expect(snapshot.state.survey).toMatchObject({ PATH: '1' });
    await expect(activeQuestion(page, 'PATH').locator('#PATH_1')).toBeChecked();
  });

  test('starts a clean survey and logs a rejected retrieve operation', async ({ page }) => {
    await openParticipant(page, {
      fixture: 'navigationState.txt',
      retrieveError: 'Synthetic retrieve rejection',
    });

    await expect(activeQuestion(page, 'PATH')).toBeVisible();
    await expect(activeQuestion(page).locator('input[type="radio"]:checked')).toHaveCount(0);
    const snapshot = await expectHealthyHarness(page, { allowErrors: true });
    expect(snapshot.logs.retrieveCalls).toHaveLength(1);
    expect(snapshot.logs.errors.some((entry) => (
      entry.message.includes('Error fetching retrieve function and css')
      && entry.message.includes('Synthetic retrieve rejection')
    ))).toBe(true);
  });

  test('characterizes current unwrapping of retrieve data that carries a non-200 code', async ({ page }) => {
    await openParticipant(page, {
      fixture: 'navigationState.txt',
      retrieveResult: {
        code: 503,
        data: {
          TEST_NAV: { PATH: '0', treeJSON: treeAt('PATH') },
        },
      },
    });

    const snapshot = await expectHealthyHarness(page);
    expect(snapshot.logs.retrieveCalls).toHaveLength(1);
    expect(snapshot.state.survey).toMatchObject({ PATH: '0' });
    await expect(activeQuestion(page, 'PATH').locator('#PATH_0')).toBeChecked();
  });
});
