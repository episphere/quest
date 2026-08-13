import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import {
  DEFAULT_CACHE_ROOT,
  DEFAULT_LOCK_PATH,
  REPOSITORY_ROOT,
  pathExists,
  readJson,
} from './artifacts.mjs';

export const LOCK_SCHEMA_VERSION = 1;

const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const GIT_BLOB_PATTERN = /^[0-9a-f]{40}$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const QUESTION_MARKER_PATTERN = /^\[([A-Z_][A-Z0-9_#]*)([?!]?)(?:\|([^|\]]+)\|?)?(,.*?)?\]/gm;

export class CorpusVerificationError extends Error {
  constructor(errors) {
    super(`Questionnaire corpus verification failed:\n- ${errors.join('\n- ')}`);
    this.name = 'CorpusVerificationError';
    this.errors = errors;
  }
}

export function sha256Buffer(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function gitBlobShaBuffer(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return createHash('sha1')
    .update(`blob ${buffer.length}\0`)
    .update(buffer)
    .digest('hex');
}

export function stripMarkdownComments(markdown) {
  return markdown.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
}

export function analyzeQuestionnaireText(markdown) {
  const questionIds = [...stripMarkdownComments(markdown).matchAll(QUESTION_MARKER_PATTERN)]
    .map((match) => match[1]);
  const seen = new Set();
  const duplicateQuestionIds = [...new Set(questionIds.filter((questionId) => {
    if (seen.has(questionId)) return true;
    seen.add(questionId);
    return false;
  }))].sort();

  return {
    questName: markdown.match(/\{"name":"(\w*)"}/)?.[1] ?? null,
    version: markdown.match(/\/\/\s*\{"version":"([^"]+)"}/)?.[1] ?? null,
    questionIds,
    duplicateQuestionIds,
    endCount: questionIds.filter((questionId) => questionId === 'END').length,
  };
}

export function isSafeRepositoryPath(repositoryPath) {
  return typeof repositoryPath === 'string'
    && repositoryPath.length > 0
    && !path.posix.isAbsolute(repositoryPath)
    && !repositoryPath.includes('\\')
    && path.posix.normalize(repositoryPath) === repositoryPath
    && !repositoryPath.split('/').includes('..');
}

function addError(errors, condition, message) {
  if (!condition) errors.push(message);
}

export function validateCorpusLock(lock) {
  const errors = [];

  addError(errors, lock && typeof lock === 'object', 'Lock must be a JSON object.');
  if (!lock || typeof lock !== 'object') throw new CorpusVerificationError(errors);

  addError(errors, lock.schemaVersion === LOCK_SCHEMA_VERSION,
    `schemaVersion must be ${LOCK_SCHEMA_VERSION}.`);
  addError(errors, REPOSITORY_PATTERN.test(lock.repository ?? ''),
    'repository must use the owner/name form.');
  addError(errors, typeof lock.repositoryUrl === 'string' && lock.repositoryUrl.startsWith('https://'),
    'repositoryUrl must be an HTTPS URL.');
  addError(errors, typeof lock.defaultBranch === 'string' && lock.defaultBranch.length > 0,
    'defaultBranch is required for drift checks.');
  addError(errors, COMMIT_PATTERN.test(lock.commit ?? ''), 'commit must be a full 40-character Git SHA.');
  addError(errors, isSafeRepositoryPath(lock.cacheRoot ?? ''), 'cacheRoot must be repository-relative and safe.');
  addError(errors, lock.sourceDirectory === 'prod', 'sourceDirectory must be prod.');
  addError(errors, lock.environment === 'prod', 'environment must be prod.');
  addError(errors, Array.isArray(lock.files) && lock.files.length > 0, 'files must be a non-empty array.');

  if (!Array.isArray(lock.files)) throw new CorpusVerificationError(errors);

  addError(errors, lock.files.length === lock.expectedFileCount,
    `Expected ${lock.expectedFileCount} files but lock contains ${lock.files.length}.`);

  const paths = new Set();
  const moduleLocales = new Set();

  for (const [index, entry] of lock.files.entries()) {
    const label = entry?.path ?? `files[${index}]`;
    addError(errors, entry && typeof entry === 'object', `${label}: entry must be an object.`);
    if (!entry || typeof entry !== 'object') continue;

    addError(errors, typeof entry.module === 'string' && entry.module.length > 0,
      `${label}: module is required.`);
    addError(errors, entry.locale === 'en' || entry.locale === 'es',
      `${label}: locale must be en or es.`);
    addError(errors, entry.language === 'en' || entry.language === 'es',
      `${label}: language must be en or es.`);
    addError(errors, entry.language === entry.locale,
      `${label}: language must match locale.`);
    addError(errors, isSafeRepositoryPath(entry.path), `${label}: path is unsafe.`);
    addError(errors, entry.path?.startsWith(`${lock.sourceDirectory}/`),
      `${label}: production path must be below ${lock.sourceDirectory}/.`);
    addError(errors, typeof entry.questName === 'string' && /^\w+$/.test(entry.questName),
      `${label}: questName is invalid.`);
    addError(errors, typeof entry.version === 'string' && entry.version.length > 0,
      `${label}: version is required.`);
    addError(errors, Number.isInteger(entry.sourceQuestionCount) && entry.sourceQuestionCount > 0,
      `${label}: sourceQuestionCount must be a positive integer.`);
    addError(errors, SHA256_PATTERN.test(entry.sha256 ?? ''), `${label}: sha256 is invalid.`);
    addError(errors, GIT_BLOB_PATTERN.test(entry.gitBlobSha ?? ''), `${label}: gitBlobSha is invalid.`);

    if (paths.has(entry.path)) errors.push(`${label}: duplicate production path.`);
    paths.add(entry.path);

    const moduleLocale = `${entry.module}:${entry.locale}`;
    if (moduleLocales.has(moduleLocale)) errors.push(`${label}: duplicate module/locale ${moduleLocale}.`);
    moduleLocales.add(moduleLocale);
  }

  const modules = new Map();
  for (const entry of lock.files) {
    if (!modules.has(entry.module)) modules.set(entry.module, new Map());
    modules.get(entry.module).set(entry.locale, entry);
  }

  addError(errors, modules.size === lock.expectedModuleCount,
    `Expected ${lock.expectedModuleCount} modules but found ${modules.size}.`);

  const localeCounts = lock.files.reduce((counts, entry) => {
    counts[entry.locale] = (counts[entry.locale] ?? 0) + 1;
    return counts;
  }, {});
  for (const locale of ['en', 'es']) {
    addError(errors, localeCounts[locale] === lock.expectedLanguageCounts?.[locale],
      `Expected ${lock.expectedLanguageCounts?.[locale]} ${locale} files but found ${localeCounts[locale] ?? 0}.`);
  }

  for (const [moduleName, locales] of modules) {
    addError(errors, locales.has('en'), `${moduleName}: every module must have an English questionnaire.`);
    if (locales.has('en') && locales.has('es')) {
      addError(errors, locales.get('en').questName === locales.get('es').questName,
        `${moduleName}: English and Spanish questName values differ.`);
      addError(errors, locales.get('en').version === locales.get('es').version,
        `${moduleName}: English and Spanish versions differ.`);
    }
  }

  const exceptionKeys = new Set();
  for (const exception of lock.questionIdParityExceptions ?? []) {
    const key = `${exception.module}:${exception.onlyIn}`;
    addError(errors, modules.has(exception.module), `${key}: exception references an unknown module.`);
    addError(errors, exception.onlyIn === 'en' || exception.onlyIn === 'es',
      `${key}: onlyIn must be en or es.`);
    addError(errors, Array.isArray(exception.ids) && exception.ids.length > 0,
      `${key}: ids must be a non-empty array.`);
    addError(errors, !exceptionKeys.has(key), `${key}: duplicate parity exception.`);
    exceptionKeys.add(key);
  }

  if (errors.length > 0) throw new CorpusVerificationError(errors);
  return lock;
}

export async function loadCorpusLock(lockPath = DEFAULT_LOCK_PATH) {
  return validateCorpusLock(await readJson(lockPath));
}

export function resolveCorpusCacheRoot(lock, overrideCacheRoot = null) {
  return overrideCacheRoot
    ? path.resolve(overrideCacheRoot)
    : path.resolve(REPOSITORY_ROOT, lock.cacheRoot ?? path.relative(REPOSITORY_ROOT, DEFAULT_CACHE_ROOT));
}

export function corpusCacheDirectory(lock, overrideCacheRoot = null) {
  return path.join(resolveCorpusCacheRoot(lock, overrideCacheRoot), lock.commit);
}

export function getLockedArtifacts(lock) {
  return lock.files.map((entry) => ({
    path: entry.path,
    sha256: entry.sha256,
    gitBlobSha: entry.gitBlobSha,
  })).sort((left, right) => left.path.localeCompare(right.path));
}

function decodeUtf8(buffer, label, errors) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    errors.push(`${label}: content is not valid UTF-8.`);
    return null;
  }
}

async function listFilesRecursively(directory, baseDirectory = directory) {
  if (!(await pathExists(directory))) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFilesRecursively(fullPath, baseDirectory));
    } else if (entry.isFile()) {
      files.push(path.relative(baseDirectory, fullPath).split(path.sep).join('/'));
    } else {
      files.push(path.relative(baseDirectory, fullPath).split(path.sep).join('/'));
    }
  }

  return files.sort();
}

function sortedDifference(left, right) {
  return [...left].filter((value) => !right.has(value)).sort();
}

function expectedParityExceptions(lock) {
  return new Map((lock.questionIdParityExceptions ?? []).map((exception) => ([
    `${exception.module}:${exception.onlyIn}`,
    [...exception.ids].sort(),
  ])));
}

function sameStringArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export async function verifyCorpus({
  lock,
  cacheDir = corpusCacheDirectory(lock),
  requireExactFileSet = true,
} = {}) {
  validateCorpusLock(lock);
  const errors = [];
  const analyses = new Map();
  const expectedArtifacts = getLockedArtifacts(lock);

  if (!(await pathExists(cacheDir))) {
    throw new CorpusVerificationError([
      `Cache directory is missing: ${cacheDir}`,
      'Run npm run corpus:fetch before corpus-backed tests.',
    ]);
  }

  const cacheStats = await stat(cacheDir);
  if (!cacheStats.isDirectory()) {
    throw new CorpusVerificationError([`Cache path is not a directory: ${cacheDir}`]);
  }

  if (requireExactFileSet) {
    const expectedPaths = new Set(expectedArtifacts.map((artifact) => artifact.path));
    const actualPaths = new Set((await listFilesRecursively(cacheDir))
      .filter((repositoryPath) => repositoryPath.startsWith(`${lock.sourceDirectory}/`)));
    for (const missingPath of sortedDifference(expectedPaths, actualPaths)) {
      errors.push(`${missingPath}: locked file is missing from the cache.`);
    }
    for (const unexpectedPath of sortedDifference(actualPaths, expectedPaths)) {
      errors.push(`${unexpectedPath}: unexpected file exists in the corpus cache.`);
    }
  }

  for (const artifact of expectedArtifacts) {
    const filePath = path.join(cacheDir, ...artifact.path.split('/'));
    let buffer;
    try {
      buffer = await readFile(filePath);
    } catch (error) {
      errors.push(`${artifact.path}: unable to read locked file (${error.code ?? error.message}).`);
      continue;
    }

    const actualSha256 = sha256Buffer(buffer);
    if (actualSha256 !== artifact.sha256) {
      errors.push(`${artifact.path}: SHA-256 mismatch (expected ${artifact.sha256}, got ${actualSha256}).`);
    }
    const actualGitBlobSha = gitBlobShaBuffer(buffer);
    if (actualGitBlobSha !== artifact.gitBlobSha) {
      errors.push(`${artifact.path}: Git blob SHA mismatch (expected ${artifact.gitBlobSha}, got ${actualGitBlobSha}).`);
    }

    const text = decodeUtf8(buffer, artifact.path, errors);
    if (text === null) continue;
  }

  for (const entry of lock.files) {
    const filePath = path.join(cacheDir, ...entry.path.split('/'));
    let text;
    try {
      text = decodeUtf8(await readFile(filePath), entry.path, errors);
    } catch {
      continue;
    }
    if (text === null) continue;

    const analysis = analyzeQuestionnaireText(text);
    analyses.set(entry.path, analysis);
    if (analysis.questName !== entry.questName) {
      errors.push(`${entry.path}: questName mismatch (expected ${entry.questName}, got ${analysis.questName}).`);
    }
    if (analysis.version !== entry.version) {
      errors.push(`${entry.path}: version mismatch (expected ${entry.version}, got ${analysis.version}).`);
    }
    if (analysis.questionIds.length !== entry.sourceQuestionCount) {
      errors.push(`${entry.path}: source question count mismatch (expected ${entry.sourceQuestionCount}, got ${analysis.questionIds.length}).`);
    }
    if (analysis.endCount !== 1) {
      errors.push(`${entry.path}: expected exactly one END marker, found ${analysis.endCount}.`);
    }
    if (analysis.duplicateQuestionIds.length > 0) {
      errors.push(`${entry.path}: duplicate question IDs: ${analysis.duplicateQuestionIds.join(', ')}.`);
    }

  }

  const exceptionMap = expectedParityExceptions(lock);
  const usedExceptionKeys = new Set();
  const moduleEntries = Map.groupBy(lock.files, (entry) => entry.module);
  for (const [moduleName, entries] of moduleEntries) {
    const englishEntry = entries.find((entry) => entry.locale === 'en');
    const spanishEntry = entries.find((entry) => entry.locale === 'es');
    if (!englishEntry || !spanishEntry) continue;

    const englishAnalysis = analyses.get(englishEntry.path);
    const spanishAnalysis = analyses.get(spanishEntry.path);
    if (!englishAnalysis || !spanishAnalysis) continue;

    const englishIds = new Set(englishAnalysis.questionIds);
    const spanishIds = new Set(spanishAnalysis.questionIds);
    for (const [locale, actualDifference] of [
      ['en', sortedDifference(englishIds, spanishIds)],
      ['es', sortedDifference(spanishIds, englishIds)],
    ]) {
      const key = `${moduleName}:${locale}`;
      const expectedDifference = exceptionMap.get(key) ?? [];
      if (!sameStringArray(actualDifference, expectedDifference)) {
        errors.push(`${moduleName}: IDs only in ${locale} differ from the lock baseline (expected [${expectedDifference.join(', ')}], got [${actualDifference.join(', ')}]).`);
      }
      if (exceptionMap.has(key)) usedExceptionKeys.add(key);
    }
  }

  for (const key of exceptionMap.keys()) {
    if (!usedExceptionKeys.has(key)) errors.push(`${key}: parity exception was not evaluated.`);
  }

  if (errors.length > 0) throw new CorpusVerificationError(errors);

  return {
    commit: lock.commit,
    files: lock.files.length,
    modules: new Set(lock.files.map((entry) => entry.module)).size,
    localeCounts: lock.files.reduce((counts, entry) => {
      counts[entry.locale] = (counts[entry.locale] ?? 0) + 1;
      return counts;
    }, {}),
    sourceQuestionCount: lock.files.reduce((total, entry) => total + entry.sourceQuestionCount, 0),
  };
}
