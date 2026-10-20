import { test, expect } from './support/test.js';
import {
  activeQuestion,
  expectHealthyHarness,
  goBack,
  goNext,
  openParticipant,
  selectLabeledResponse,
} from './support/harness.js';

const questName = 'TEST_NAV';
const pathQuestion = 'PATH';
const pathTreeToken = 'PATH?';
const detailQuestion = 'DETAIL';

function applySuccessfulHostDeltas(storeCalls) {
  const persistedData = {};
  const namespace = `${questName}.`;

  for (const { changes, status } of storeCalls) {
    if (status !== 'fulfilled') continue;
    for (const [namespacedKey, value] of Object.entries(changes)) {
      if (!namespacedKey.startsWith(namespace)) continue;
      const key = namespacedKey.slice(namespace.length);
      if (value === undefined) delete persistedData[key];
      else persistedData[key] = value;
    }
  }

  return persistedData;
}

function persistedTreeAt(questionToken) {
  return JSON.stringify({
    rootNode: {
      value: null,
      children: [{ value: questionToken, children: [] }],
    },
    currentNode: questionToken,
  });
}

test.describe('Back response deletion and branch pruning @core', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'The host-deletion contract runs once in Chromium.');
  });

  test('clears an answered descendant from the host, tree, and resumed form as the participant backs through it', async ({ page }) => {
    await openParticipant(page, { fixture: 'navigationState.txt' });
    await selectLabeledResponse(page, 'Yes');
    await goNext(page);

    const detail = activeQuestion(page, detailQuestion).locator('#detail');
    await detail.fill('Abandoned detail');
    await detail.blur();
    await goNext(page);
    await expect(activeQuestion(page, 'SUMMARY')).toBeVisible();

    // The first Back returns to the answered descendant. The second Back is
    // the operation that clears that answer and prunes it from PATH's branch.
    await goBack(page);
    await expect(activeQuestion(page, detailQuestion)).toBeVisible();
    await expect(activeQuestion(page, detailQuestion).locator('#detail')).toHaveValue('Abandoned detail');
    await goBack(page);
    await expect(activeQuestion(page, pathQuestion)).toBeVisible();

    const backedOut = await expectHealthyHarness(page);
    const detailClear = backedOut.logs.storeCalls.findLast(({ changes }) => (
      Object.hasOwn(changes, `${questName}.${detailQuestion}`)
      && changes[`${questName}.${detailQuestion}`] === undefined
    ));
    expect(detailClear).toMatchObject({ status: 'fulfilled' });
    expect(Object.hasOwn(detailClear.changes, `${questName}.${detailQuestion}`)).toBe(true);
    expect(detailClear.changes[`${questName}.${detailQuestion}`]).toBeUndefined();

    const prunedTree = JSON.parse(backedOut.state.survey.treeJSON);
    expect(prunedTree).toEqual({
      rootNode: {
        value: null,
        children: [{ value: pathTreeToken, children: [] }],
      },
      currentNode: pathTreeToken,
    });

    // Model the host's established undefined-as-delete contract, then supply
    // that result to a fresh Quest render exactly as a later PWA session would.
    const persistedData = applySuccessfulHostDeltas(backedOut.logs.storeCalls);
    expect(persistedData).toMatchObject({ [pathQuestion]: '1' });
    expect(persistedData).not.toHaveProperty(detailQuestion);
    expect(JSON.parse(persistedData.treeJSON)).toEqual(prunedTree);

    await openParticipant(page, {
      fixture: 'navigationState.txt',
      persistedData,
    });
    await expect(activeQuestion(page, pathQuestion)).toBeVisible();
    await expect(activeQuestion(page, pathQuestion).locator('#PATH_1')).toBeChecked();
    await goNext(page);
    await expect(activeQuestion(page, detailQuestion)).toBeVisible();
    await expect(activeQuestion(page, detailQuestion).locator('#detail')).toHaveValue('');
    await expectHealthyHarness(page);
  });

  test('restores a retained parent response from the raw tree token written by Back', async ({ page }) => {
    await openParticipant(page, {
      fixture: 'navigationState.txt',
      persistedData: {
        [pathQuestion]: '1',
        treeJSON: persistedTreeAt(pathTreeToken),
      },
    });

    await expect(activeQuestion(page, pathQuestion)).toBeVisible();
    await expect(activeQuestion(page, pathQuestion).locator('#PATH_1'))
      .toBeChecked({ timeout: 1_000 });
  });
});
