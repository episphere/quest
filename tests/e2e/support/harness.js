import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from './test.js';

const supportDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(supportDirectory, '..', '..', '..');
const canonicalDirectory = join(repositoryRoot, 'tests', 'fixtures', 'canonical');

export function readCanonicalFixture(name) {
  return readFileSync(join(canonicalDirectory, name), 'utf8');
}

export async function openParticipant(page, {
  fixture = 'runtimeControls.txt',
  markdown,
  ...config
} = {}) {
  await page.goto('/tests/harness/participant.html');
  await page.waitForFunction(() => window.questHarness?.ready === true);

  const renderResult = await page.evaluate((renderConfig) => {
    return window.questHarness.render(renderConfig);
  }, {
    ...config,
    markdown: markdown ?? readCanonicalFixture(fixture),
  });

  expect(renderResult.result, 'transform.render should report a successful participant render').toBe(true);
  expect(renderResult.activeQuestionId, 'participant render should activate a question').toBeTruthy();

  return renderResult;
}

export async function harnessSnapshot(page) {
  return page.evaluate(() => window.questHarness.snapshot());
}

export async function flushHarness(page) {
  await page.evaluate(() => window.questHarness.flush());
}

export async function waitInHarness(page, milliseconds) {
  await page.evaluate((delay) => window.questHarness.wait(delay), milliseconds);
}

export function activeQuestion(page, questionId) {
  const selector = questionId
    ? `#questionnaireRoot form.question.active#${questionId}`
    : '#questionnaireRoot form.question.active';
  return page.locator(selector);
}

export async function goNext(page) {
  await activeQuestion(page).getByRole('button', { name: 'Next question' }).click();
}

export async function goBack(page) {
  await activeQuestion(page).getByRole('button', { name: 'Back to the previous question' }).click();
}

export async function selectLabeledResponse(page, label) {
  await activeQuestion(page).locator('label', { hasText: label }).click();
}

export async function expectHealthyHarness(page, { allowErrors = false } = {}) {
  await flushHarness(page);
  const snapshot = await harnessSnapshot(page);
  if (!allowErrors) expect(snapshot.logs.errors).toEqual([]);
  return snapshot;
}
