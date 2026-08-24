import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from './support/test.js';
import {
  activeQuestion,
  expectHealthyHarness,
  openParticipant,
} from './support/harness.js';
import { corpusLock, lockedCorpusPath, repositoryRoot } from './support/corpus.js';

const personaRegistry = JSON.parse(readFileSync(join(repositoryRoot, 'tests', 'corpus', 'hostPersonas.json'), 'utf8'));
const smokePersona = personaRegistry.personas.find(({ id }) => id === 'external-branch-primary');

test.describe('locked production participant startup @corpus', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-desktop',
      'The complete locked-corpus smoke runs once in Chromium.',
    );
  });

  for (const record of corpusLock.files) {
    test(`${record.module} (${record.locale}) starts from ${record.path}`, async ({ page }, testInfo) => {
      const sourcePath = lockedCorpusPath(record);
      expect(
        existsSync(sourcePath),
        `Locked corpus cache is absent. Run npm run corpus:fetch for ${corpusLock.commit}.`,
      ).toBe(true);

      const markdown = readFileSync(sourcePath, 'utf8');
      expect(smokePersona).toBeTruthy();
      const participantInputs = {
        ...smokePersona.previousResults,
        ...smokePersona.userProfile,
      };
      testInfo.annotations.push({ type: 'host-persona', description: smokePersona.id });
      const result = await openParticipant(page, {
        markdown,
        lang: record.locale,
        previousResults: participantInputs,
        questVersion: record.version,
      });

      expect(result.activeQuestionId).toBeTruthy();
      await expect(activeQuestion(page)).toBeVisible();
      expect((await activeQuestion(page).innerText()).trim().length).toBeGreaterThan(0);
      await expect(page.locator('#questionnaireRoot form.question.active')).toHaveCount(1);
      await expectHealthyHarness(page);
    });
  }
});
