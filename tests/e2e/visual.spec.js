import { test, expect } from './support/test.js';
import {
  activeQuestion,
  goNext,
  openParticipant,
  readCanonicalFixture,
  selectLabeledResponse,
} from './support/harness.js';
import {
  installAuthoringRoutes,
  renderAuthoringMarkdown,
  waitForAuthoringReady,
} from './support/authoring.js';
import { readLockedMarkdown, treeAt } from './support/corpus.js';

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

  test('keeps keyboard focus visible on list and grid choices', async ({ page }, testInfo) => {
    await openParticipant(page);
    const listChoice = activeQuestion(page, 'CHOICE').locator('#CHOICE_1');
    await listChoice.focus();
    await page.keyboard.press('Space');
    await expect(listChoice).toBeFocused();
    await expect(listChoice).toBeChecked();
    await stabilizeVisual(page, testInfo);

    await expect(activeQuestion(page, 'CHOICE')).toHaveScreenshot(
      'participant-choice-keyboard-focus.png',
      screenshotOptions,
    );

    await openParticipant(page, { fixture: 'gridResponsive.txt' });
    await goNext(page);
    const gridChoice = activeQuestion(page, 'GRID_RATE').locator('#GRID_WALK_1');
    await gridChoice.focus();
    await page.keyboard.press('Space');
    await expect(gridChoice).toBeFocused();
    await expect(gridChoice).toBeChecked();
    await stabilizeVisual(page, testInfo);

    await expect(activeQuestion(page, 'GRID_RATE')).toHaveScreenshot(
      'participant-grid-keyboard-focus.png',
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
    await activeQuestion(page, 'DETAIL').locator('#detail').focus();
    await stabilizeVisual(page, testInfo);

    await expect(activeQuestion(page, 'DETAIL')).toHaveScreenshot(
      'participant-keyboard-focus.png',
      screenshotOptions,
    );
  });

  test('keeps the compound-radio subgroup layout stable', async ({ page }, testInfo) => {
    await openParticipant(page, {
      markdown: readLockedMarkdown('moduleQoL'),
      persistedData: { treeJSON: treeAt('D_284353934') },
    });
    const question = activeQuestion(page, 'D_284353934');
    await question.locator('label[for="D_559540891_367964536"]').click();
    await expect(question.locator('#D_559540891_367964536')).toBeChecked();
    await stabilizeVisual(page, testInfo);

    await expect(question).toHaveScreenshot(
      'participant-compound-radio-layout.png',
      screenshotOptions,
    );

  });

  test('keeps conditional compound-radio prompts and responses visually unchanged', async ({ page }, testInfo) => {
    await openParticipant(page, {
      markdown: readLockedMarkdown('module4'),
      persistedData: {
        D_421586693: ['767755239', '385609081'],
        treeJSON: treeAt('D_733638576', 'D_421586693'),
      },
    });
    const question = activeQuestion(page, 'D_733638576');
    await question.locator('label[for="D_583216333_248303092"]').click();
    await expect(question.locator('#D_583216333_248303092')).toBeChecked();
    await stabilizeVisual(page, testInfo);

    await expect(question).toHaveScreenshot(
      'participant-conditional-compound-radio-layout.png',
      screenshotOptions,
    );

    const semanticLayoutDelta = await question.evaluate((form) => {
      const capture = () => ({
        formHeight: form.getBoundingClientRect().height,
        elements: Array.from(form.querySelectorAll('.displayif, .response'), (element) => {
          const rect = element.getBoundingClientRect();
          return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
        }),
      });
      const withSemantics = capture();
      form.querySelectorAll('[role="radiogroup"][aria-owns]').forEach((group) => {
        group.removeAttribute('role');
        group.removeAttribute('aria-label');
        group.removeAttribute('aria-owns');
      });
      const withoutSemantics = capture();
      return Math.max(
        Math.abs(withSemantics.formHeight - withoutSemantics.formHeight),
        ...withSemantics.elements.map((element, index) => Math.max(
          Math.abs(element.top - withoutSemantics.elements[index].top),
          Math.abs(element.left - withoutSemantics.elements[index].left),
          Math.abs(element.width - withoutSemantics.elements[index].width),
          Math.abs(element.height - withoutSemantics.elements[index].height),
        )),
      );
    });
    expect(semanticLayoutDelta).toBeLessThanOrEqual(0.5);
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
