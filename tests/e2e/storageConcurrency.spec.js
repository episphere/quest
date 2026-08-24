import { test, expect } from './support/test.js';
import {
  activeQuestion,
  expectHealthyHarness,
  flushHarness,
  goNext,
  harnessSnapshot,
  openParticipant,
  selectLabeledResponse,
} from './support/harness.js';

test.describe('non-blocking host-store ordering @core @canonical', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'The overlapping host-write contract runs once in Chromium.');
  });

  test('keeps navigation and per-question deltas stable when successful writes settle out of order', async ({ page }) => {
    await openParticipant(page, {
      fixture: 'navigationState.txt',
      storeOutcomes: [
        { kind: 'resolve', delayMs: 1_000, value: { code: 200 } },
        { kind: 'resolve', delayMs: 10, value: { code: 200 } },
      ],
    });

    await selectLabeledResponse(page, 'Yes');
    await goNext(page);
    await expect(activeQuestion(page, 'DETAIL')).toBeVisible();

    const detail = activeQuestion(page, 'DETAIL').locator('#detail');
    await detail.fill('Concurrent host write');
    await detail.blur();
    await goNext(page);
    await expect(activeQuestion(page, 'SUMMARY')).toBeVisible();

    await expect.poll(async () => (
      (await harnessSnapshot(page)).logs.storeCalls.map(({ status }) => status)
    )).toEqual(['pending', 'fulfilled']);
    const whilePending = await harnessSnapshot(page);
    expect(whilePending.logs.storeCalls).toHaveLength(2);
    expect(whilePending.logs.storeCalls[0]).toMatchObject({ status: 'pending', settlementIndex: null });
    expect(whilePending.logs.storeCalls[1]).toMatchObject({ status: 'fulfilled', settlementIndex: 1 });
    expect(whilePending.state.survey).toMatchObject({
      PATH: '1',
      DETAIL: 'Concurrent host write',
    });

    await flushHarness(page);
    await expect(activeQuestion(page, 'SUMMARY')).toBeVisible();
    const settled = await expectHealthyHarness(page);
    expect(settled.state.survey).toMatchObject({
      PATH: '1',
      DETAIL: 'Concurrent host write',
    });
    expect(settled.logs.storeCalls[0].changes).toMatchObject({ 'TEST_NAV.PATH': '1' });
    expect(settled.logs.storeCalls[1].changes).toMatchObject({ 'TEST_NAV.DETAIL': 'Concurrent host write' });
    expect(settled.logs.storeCalls.map(({ status, settlementIndex }) => ({ status, settlementIndex }))).toEqual([
      { status: 'fulfilled', settlementIndex: 2 },
      { status: 'fulfilled', settlementIndex: 1 },
    ]);
    expect(settled.logs.storeCalls[0].changes).not.toHaveProperty('TEST_NAV.DETAIL');
    expect(settled.logs.storeCalls[1].changes).not.toHaveProperty('TEST_NAV.PATH');
    await expect(page.locator('#storeErrorModal')).not.toHaveClass(/show/);
  });
});
