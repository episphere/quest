import { test, expect } from './support/test.js';
import {
  activeQuestion,
  goNext,
  openParticipant,
  readCanonicalFixture,
  selectLabeledResponse,
  waitInHarness,
} from './support/harness.js';
import {
  installAuthoringRoutes,
  renderAuthoringMarkdown,
  waitForAuthoringReady,
} from './support/authoring.js';

async function stabilizeVisual(page, testInfo) {
  testInfo.snapshotSuffix = '';
  await page.mouse.move(0, 0);
  await page.addStyleTag({
    content: `
      #questionnaireRoot,
      #questionnaireRoot *,
      #tool,
      #tool * {
        -webkit-text-fill-color: transparent !important;
        text-shadow: none !important;
      }
    `,
  });
}

const screenshotOptions = {
  animations: 'disabled',
  caret: 'hide',
  maxDiffPixelRatio: 0.01,
  scale: 'css',
};

test.describe('stable participant styling @visual', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-desktop',
      'The visual baseline is intentionally limited to locked desktop Chromium.',
    );
  });

  test('keeps the selected-response and action layout', async ({ page }, testInfo) => {
    // Text is made transparent below so platform font rasterization is not compared.
    await openParticipant(page);
    await selectLabeledResponse(page, 'Blue');
    await stabilizeVisual(page, testInfo);

    await expect(activeQuestion(page, 'CHOICE')).toHaveScreenshot(
      'participant-choice-layout.png',
      screenshotOptions,
    );
  });

  test('keeps validation and modal states visually reviewable', async ({ page }, testInfo) => {
    await openParticipant(page, { fixture: 'validation.txt' });
    await activeQuestion(page, 'BOUNDED').locator('#bounded').fill('9');
    await goNext(page);
    await expect(activeQuestion(page).locator('.validation-container')).toBeVisible();
    await stabilizeVisual(page, testInfo);

    await expect(activeQuestion(page, 'BOUNDED')).toHaveScreenshot(
      'participant-validation-state.png',
      screenshotOptions,
    );

    await page.reload();
    await page.waitForFunction(() => window.questHarness?.ready === true);
    await page.evaluate((markdown) => window.questHarness.render({ markdown }), readCanonicalFixture('runtimeControls.txt'));
    await goNext(page);
    await expect(page.locator('#softModal')).toHaveClass(/show/);
    await stabilizeVisual(page, testInfo);
    await expect(page.locator('#softModal .modal-content')).toHaveScreenshot(
      'participant-soft-modal.png',
      screenshotOptions,
    );
  });

  test('keeps keyboard focus visible on an active text control', async ({ page }, testInfo) => {
    await openParticipant(page, { fixture: 'navigationState.txt' });
    await selectLabeledResponse(page, 'Yes');
    await goNext(page);
    await waitInHarness(page, 550);
    await activeQuestion(page, 'DETAIL').locator('#detail').focus();
    await stabilizeVisual(page, testInfo);

    await expect(activeQuestion(page, 'DETAIL')).toHaveScreenshot(
      'participant-keyboard-focus.png',
      screenshotOptions,
    );
  });

  test('keeps the authoring workspace layout stable', async ({ page, diagnostics }, testInfo) => {
    await installAuthoringRoutes(page, diagnostics);
    await page.goto('/index.html');
    await waitForAuthoringReady(page);
    await renderAuthoringMarkdown(page, readCanonicalFixture('runtimeControls.txt'));
    await stabilizeVisual(page, testInfo);

    await expect(page.locator('#tool')).toHaveScreenshot('authoring-workspace.png', {
      ...screenshotOptions,
      maxDiffPixelRatio: 0.02,
    });
  });
});
