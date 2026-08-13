import { test, expect } from './support/test.js';
import { activeQuestion, goNext, openParticipant, waitInHarness } from './support/harness.js';
import { analyzeQuestAxe, matchesAxeDefect } from './support/axe.js';
import { accessibilityDefects, axeDefects } from '../knownDefects/registry.js';

const CHOICE_SEMANTIC_PROJECTS = new Set([
  'chromium-desktop',
  'webkit-desktop',
  'chromium-windows-ua',
]);
async function axeFindingsForDefect(page, defect) {
  const findings = await analyzeQuestAxe(page);
  return findings.filter((finding) => matchesAxeDefect(finding, defect));
}

function characterizeAxeDefect(name, defect, prepare, project = 'chromium-desktop') {
  test(name, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== project, `Characterized in ${project}; blocking scans still run in every desktop engine.`);
    await prepare(page);
    const findings = await axeFindingsForDefect(page, defect);
    test.fail(true, `${defect.localDefectId}: ${defect.reason}`);
    expect(findings).toEqual([]);
  });
}

test.describe('open accessibility regressions @known-defect', () => {
  characterizeAxeDefect(
    'progressbar has an accessible name',
    axeDefects.progressbarName,
    (page) => openParticipant(page, { fixture: 'navigationState.txt' }),
  );

  characterizeAxeDefect(
    'progressbar exposes a valid ARIA value',
    axeDefects.progressbarValue,
    (page) => openParticipant(page, { fixture: 'navigationState.txt' }),
  );

  characterizeAxeDefect(
    'responsive grid has no empty row-header spacer',
    axeDefects.emptyGridHeader,
    async (page) => {
      await openParticipant(page, { fixture: 'gridResponsive.txt' });
      await goNext(page);
      await expect(activeQuestion(page, 'GRID_RATE')).toBeVisible();
    },
  );

  characterizeAxeDefect(
    'validation message meets contrast requirements',
    axeDefects.validationContrast,
    async (page) => {
      await openParticipant(page, { fixture: 'validation.txt' });
      await activeQuestion(page, 'BOUNDED').locator('#bounded').fill('9');
      await goNext(page);
      await expect(activeQuestion(page).locator('.validation-container')).toBeVisible();
    },
  );

  characterizeAxeDefect(
    'participant action text retains sufficient contrast while hovered',
    axeDefects.actionHoverContrast,
    async (page) => {
      await openParticipant(page, { fixture: 'validation.txt' });
      await activeQuestion(page, 'BOUNDED').getByRole('button', { name: 'Next question' }).hover();
    },
    'firefox-desktop',
  );

  characterizeAxeDefect(
    'bounded numeric input has a non-title label',
    axeDefects.validationLabel,
    async (page) => {
      await openParticipant(page, { fixture: 'validation.txt' });
      await activeQuestion(page, 'BOUNDED').locator('#bounded').fill('9');
      await goNext(page);
      await expect(activeQuestion(page).locator('.validation-container')).toBeVisible();
    },
  );

  test('#1079 exposes each grid choice with its row and column name plus checked state', async ({ page }, testInfo) => {
    test.skip(!CHOICE_SEMANTIC_PROJECTS.has(testInfo.project.name), 'Chromium, WebKit, and the Windows branch capture the assistive-technology semantic baseline.');

    await openParticipant(page, { fixture: 'gridResponsive.txt' });
    await goNext(page);
    await waitInHarness(page, 550);
    const question = activeQuestion(page, 'GRID_RATE');
    await question.locator('tr[data-question-id="GRID_WALK"] label', { hasText: 'Sometimes' }).click();
    await expect(question.locator('#GRID_WALK_1')).toBeChecked();

    test.fail(true, `${accessibilityDefects[1079].issue}: a grid choice must expose its row prompt, column option, and checked state together.`);
    const selected = question.getByRole('radio', { name: /Walking.*Sometimes|Sometimes.*Walking/ });
    await expect(selected).toHaveCount(1);
    await expect(selected).toBeChecked();
    await expect(question.getByRole('radio', { name: /Cycling.*Often|Often.*Cycling/ })).not.toBeChecked();
  });

});
