import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const supportDirectory = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = join(supportDirectory, '..', '..', '..');
export const corpusLock = JSON.parse(readFileSync(join(repositoryRoot, 'tests', 'corpus', 'lock.json'), 'utf8'));

export function findLockedCorpusRecord(module, locale = 'en') {
  const record = corpusLock.files.find((file) => file.module === module && file.locale === locale);
  if (!record) throw new Error(`Missing locked ${module} ${locale} corpus entry`);
  return record;
}

export function lockedCorpusPath(record) {
  return join(repositoryRoot, corpusLock.cacheRoot, corpusLock.commit, record.path);
}

export function readLockedMarkdown(module, locale = 'en') {
  return readFileSync(lockedCorpusPath(findLockedCorpusRecord(module, locale)), 'utf8');
}

export function treeAt(questionId, previousQuestionId) {
  const currentNode = { value: questionId, children: [] };
  const firstNode = previousQuestionId
    ? { value: previousQuestionId, children: [currentNode] }
    : currentNode;
  return JSON.stringify({ rootNode: { value: null, children: [firstNode] }, currentNode: questionId });
}

export function treeAtPath(questionIds) {
  const [first, ...rest] = questionIds;
  const rootNode = { value: null, children: [{ value: first, children: [] }] };
  let node = rootNode.children[0];
  for (const questionId of rest) {
    const child = { value: questionId, children: [] };
    node.children.push(child);
    node = child;
  }
  return JSON.stringify({ rootNode, currentNode: questionIds.at(-1) });
}

export async function rerenderParticipant(page, config) {
  await page.reload();
  await page.waitForFunction(() => window.questHarness?.ready === true);
  return page.evaluate((nextConfig) => window.questHarness.render(nextConfig), config);
}
