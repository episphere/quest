import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from './support/test.js';
import {
  flushHarness,
  harnessSnapshot,
} from './support/harness.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const corpusRoot = path.join(repositoryRoot, 'tests', 'corpus');
const lock = JSON.parse(readFileSync(path.join(corpusRoot, 'lock.json'), 'utf8'));
const registry = JSON.parse(readFileSync(path.join(corpusRoot, 'hostPersonas.json'), 'utf8'));
const cacheRoot = path.join(repositoryRoot, lock.cacheRoot, lock.commit);
const canonicalClock = new Date('2024-07-15T12:00:00.000Z');
const outcomeNames = ['success', 'empty', 'rejection', 'delayed'];
const expectedObservationCount = Object.keys(registry.asyncHooks).length * outcomeNames.length;

const argumentValues = {
  D_627122657: 'Clinical research scientist',
  D_796828094: 'Analyzed study data',
  D_118061122: 'High school math teacher',
  D_518387017: 'Taught algebra and geometry',
  D_951357171: '353358909',
  D_667908442: '668770150',
};

test.describe('locked production asynchronous host contracts @corpus', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Host-hook regression runs in Chromium only.');
    testInfo.setTimeout(180_000);
  });

  test('executes all four host hooks under all deterministic outcomes', async ({ page }) => {
    await page.clock.setFixedTime(canonicalClock);

    for (const [hookKey, hook] of Object.entries(registry.asyncHooks).sort(([left], [right]) => (
      left.localeCompare(right)
    ))) {
      const record = lockedEnglishSurvey(hook.module);
      const sourcePath = path.join(cacheRoot, record.path);
      expect(existsSync(sourcePath), `Run npm run corpus:fetch for ${record.path}.`).toBe(true);
      const markdown = readFileSync(sourcePath, 'utf8');

      for (const outcomeName of outcomeNames) {
        const fixture = registry.asyncFixtures[outcomeName];
        const outcome = materializeOutcome(fixture, hook.fixtureResult);
        const fixtureResult = fixture.results[hook.fixtureResult];
        const previousResults = Object.fromEntries(hook.args.map((argument) => [
          argument,
          argumentValues[argument],
        ]));
        expect(Object.values(previousResults).every((value) => value !== undefined)).toBe(true);

        const renderResult = await renderParticipant(page, {
          markdown,
          lang: 'en',
          questVersion: record.version,
          persistedData: { treeJSON: treeAt(hook.questionId) },
          previousResults,
          asyncQuestionsMap: {
            [hook.markupKey]: { func: hook.function, args: hook.args },
          },
          asyncOutcomes: [outcome],
          asyncQuestionHtml: hook.function === 'soccer'
            ? soccerHtml(fixtureResult)
            : undefined,
        });

        if (!renderResult.result) {
          const failedSnapshot = await harnessSnapshot(page);
          throw new Error(`Production hook render failed: ${JSON.stringify(failedSnapshot.logs.errors)}`);
        }
        expect(renderResult.activeQuestionId).toBe(hook.questionId);
        await flushHarness(page);
        const snapshot = await harnessSnapshot(page);
        const calls = snapshot.logs.asyncCalls;
        const call = calls[0];
        const form = page.locator(`#questionnaireRoot form.question.active#${hook.questionId}`);
        const validationMessages = await form.locator('.validation-container').allTextContents();
        const injectedResponses = await form.locator('.response input').evaluateAll((controls) => (
          controls.map((control) => ({
            id: control.id,
            value: control.value,
            label: document.querySelector(`label[for="${CSS.escape(control.id)}"]`)?.textContent?.trim() ?? null,
          }))
        ));

        expect(calls).toHaveLength(1);
        expect(call.func).toBe(hook.function);
        expect(call.args).toEqual([...hook.args.map((argument) => argumentValues[argument]), 'en']);
        expect(call.status).toBe(outcomeName === 'rejection' ? 'rejected' : 'fulfilled');

        if (outcomeName === 'rejection') {
          expect(validationMessages.join(' ')).toContain('Error fetching question');
          const error = form.locator('.validation-container');
          await expect(error).toHaveText('Error fetching question. Please go back and try again.');
          await expect(error).toHaveAttribute('tabindex', '-1');
          await expect(error).not.toHaveAttribute('role');
          await expect(error).toBeFocused();
          expect(call.error.message).toBe('Deterministic host callback failure');
          expect(snapshot.logs.errors.some((entry) => (
            entry.message.includes('Deterministic host callback failure')
          ))).toBe(true);
        } else {
          expect(validationMessages).toEqual([]);
          expect(snapshot.logs.errors).toEqual([]);
          expect(call.value ?? null).toEqual(outcome.value ?? null);
        }

        if (hook.function === 'soccer' && ['success', 'delayed'].includes(outcomeName)) {
          expect(injectedResponses).toHaveLength(1);
          expect(injectedResponses[0]).toMatchObject({
            value: fixtureResult[0].code,
            label: fixtureResult[0].title,
          });
        } else {
          expect(injectedResponses).toEqual([]);
        }
      }
    }

    expect(expectedObservationCount).toBe(16);
  });
});

function lockedEnglishSurvey(moduleName) {
  const record = lock.files.find((entry) => entry.module === moduleName && entry.locale === 'en');
  if (!record) throw new Error(`No locked English questionnaire exists for ${moduleName}.`);
  return record;
}

async function renderParticipant(page, config) {
  await page.goto('/tests/harness/participant.html');
  await page.waitForFunction(() => window.questHarness?.ready === true);
  return page.evaluate((renderConfig) => window.questHarness.render(renderConfig), config);
}

function treeAt(questionId) {
  return JSON.stringify({
    rootNode: {
      value: null,
      children: [{ value: questionId, children: [] }],
    },
    currentNode: questionId,
  });
}

function materializeOutcome(fixture, fixtureResultName) {
  const configured = fixture.outcomes[0];
  if (configured.kind !== 'resolve' || Object.hasOwn(configured, 'value')) return configured;
  return {
    ...configured,
    value: fixture.results[fixtureResultName],
  };
}

function soccerHtml(result) {
  if (!Array.isArray(result) || result.length === 0) return undefined;
  const [{ code, title }] = result;
  const safeId = `HOST_${code.replace(/[^a-zA-Z0-9_-]+/g, '_')}`;
  return `<div class="response"><input id="${safeId}" type="radio" name="HOST_SOCCER" value="${code}"><label for="${safeId}">${title}</label></div>`;
}
