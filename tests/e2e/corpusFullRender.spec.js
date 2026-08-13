import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from './support/test.js';
import { expectHealthyHarness } from './support/harness.js';
import { corpusLock, lockedCorpusPath, repositoryRoot } from './support/corpus.js';

const personaRegistry = JSON.parse(readFileSync(join(repositoryRoot, 'tests', 'corpus', 'hostPersonas.json'), 'utf8'));
const smokePersona = personaRegistry.personas.find(({ id }) => id === 'external-branch-primary');

function diagnosticLabel(record) {
  return `${record.module} (${record.locale}, ${record.path})`;
}

function renderedFormId(questionId) {
  // `?` and `!` describe response semantics in Markdown; Quest deliberately
  // removes them when it assigns the DOM form ID.
  return questionId.replace(/[?!]$/, '');
}

function asyncQuestionsFor(record) {
  return Object.fromEntries(Object.values(personaRegistry.asyncHooks)
    .filter(({ module }) => module === record.module)
    .map(({ markupKey, function: func, args }) => [markupKey, { func, args }]));
}

async function openFullListParticipant(page, config) {
  await page.goto('/tests/harness/participant.html');
  await page.waitForFunction(() => window.questHarness?.ready === true);
  const renderResult = await page.evaluate((renderConfig) => window.questHarness.render(renderConfig), config);
  expect(renderResult.result, 'transform.render should report a successful full-list render').toBe(true);
  return renderResult;
}

test.describe('locked production full-list rendering @corpus @full-render', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-desktop',
      'The complete locked-corpus full render runs once in Chromium.',
    );
  });

  for (const record of corpusLock.files) {
    test(`${diagnosticLabel(record)} converts every parser-produced form`, async ({ page }, testInfo) => {
      const sourcePath = lockedCorpusPath(record);
      expect(
        existsSync(sourcePath),
        `${diagnosticLabel(record)}: locked corpus cache is absent. Run npm run corpus:fetch for ${corpusLock.commit}.`,
      ).toBe(true);
      expect(smokePersona, 'The full-render suite requires the primary locked host persona.').toBeTruthy();

      const markdown = readFileSync(sourcePath, 'utf8');
      const participantInputs = {
        ...smokePersona.previousResults,
        ...smokePersona.userProfile,
      };
      testInfo.annotations.push(
        { type: 'host-persona', description: smokePersona.id },
        { type: 'corpus-path', description: record.path },
        { type: 'source-question-count', description: String(record.sourceQuestionCount) },
      );

      const result = await openFullListParticipant(page, {
        activate: false,
        asyncQuestionsMap: asyncQuestionsFor(record),
        isRenderer: true,
        lang: record.locale,
        markdown,
        previousResults: participantInputs,
        questVersion: record.version,
        showProgress: false,
      });

      expect(result.errorCount, `${diagnosticLabel(record)}: Quest reported an error during full-list rendering`).toBe(0);

      const renderSummary = await page.locator('#questionnaireRoot').evaluate(async (root) => {
        const forms = [...root.querySelectorAll('form.question')];
        const { getStateManager } = await import('/stateManager.js');
        const processor = getStateManager(true).getQuestionProcessor();
        const emptyForms = forms.flatMap((form) => {
          const body = form.querySelector('fieldset, table');
          const hasContent = body && (
            body.textContent.trim().length > 0
            || body.querySelector('input, textarea, select, img, a')
          );
          return form.id && hasContent ? [] : [{ id: form.id, hasBody: Boolean(body) }];
        });
        return {
          formCount: forms.length,
          emptyForms,
          ids: forms.map((form) => form.id),
          processorQuestionCount: processor.questions.length,
          processedQuestionCount: processor.processedQuestions.size,
          processorQuestionIds: processor.questions.map(({ questionID }) => questionID),
        };
      });

      expect(
        renderSummary.formCount,
        `${diagnosticLabel(record)}: the renderer must append every form produced by QuestionProcessor.`,
      ).toBe(renderSummary.processorQuestionCount);
      expect(
        renderSummary.processedQuestionCount,
        `${diagnosticLabel(record)}: full-list mode must convert every QuestionProcessor entry.`,
      ).toBe(renderSummary.processorQuestionCount);
      expect(
        renderSummary.ids,
        `${diagnosticLabel(record)}: rendered forms must remain in QuestionProcessor order.`,
      ).toEqual(renderSummary.processorQuestionIds.map(renderedFormId));
      expect(renderSummary.emptyForms, `${diagnosticLabel(record)}: forms must have an ID and rendered content`).toEqual([]);
      expect(
        [...new Set(renderSummary.ids.filter((id, index) => (
          id !== 'END_OF_LOOP' && renderSummary.ids.indexOf(id) !== index
        )))],
        `${diagnosticLabel(record)}: participant-facing rendered form IDs must be unique.`,
      ).toEqual([]);

      await expectHealthyHarness(page);
    });
  }
});
