import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS_FILE = fileURLToPath(import.meta.url);

export const REPOSITORY_ROOT = path.resolve(path.dirname(THIS_FILE), '../../../..');
export const CORPUS_ROOT = path.join(REPOSITORY_ROOT, 'tests', 'corpus');
export const DEFAULT_LOCK_PATH = path.join(CORPUS_ROOT, 'lock.json');
export const DEFAULT_CACHE_ROOT = path.join(REPOSITORY_ROOT, '.cache', 'questionnaire');

export async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}
