import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  CorpusVerificationError,
  analyzeQuestionnaireText,
  gitBlobShaBuffer,
  loadCorpusLock,
  sha256Buffer,
  validateCorpusLock,
  verifyCorpus,
} from './scripts/lib/corpus.mjs';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

function lockedFile({ module, locale, productionPath, text }) {
  const buffer = Buffer.from(text);
  const analysis = analyzeQuestionnaireText(text);
  return {
    module,
    locale,
    language: locale,
    path: productionPath,
    questName: analysis.questName,
    version: analysis.version,
    sourceQuestionCount: analysis.questionIds.length,
    sha256: sha256Buffer(buffer),
    gitBlobSha: gitBlobShaBuffer(buffer),
  };
}

async function writeFixture(root, repositoryPath, content) {
  const filePath = path.join(root, ...repositoryPath.split('/'));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

describe('questionnaire corpus lock', () => {
  it('pins the complete audited production inventory, including extensionless Diet Screener', async () => {
    const lock = await loadCorpusLock();
    expect(lock.commit).toBe('7ae99a22af325cf0e14be047a7636462db9bfd50');
    expect(lock.files).toHaveLength(29);
    expect(new Set(lock.files.map((entry) => entry.module))).toHaveProperty('size', 15);
    expect(lock.files.filter((entry) => entry.locale === 'en')).toHaveLength(15);
    expect(lock.files.filter((entry) => entry.locale === 'es')).toHaveLength(14);
    expect(lock.files.every((entry) => entry.language === entry.locale)).toBe(true);
    expect(lock.files.some((entry) => entry.path === 'prod/moduleDietScreener')).toBe(true);
    expect(lock.files.every((entry) => /^[0-9a-f]{64}$/.test(entry.sha256))).toBe(true);
  });

  it('requires the literal language field to match locale', async () => {
    const lock = await loadCorpusLock();
    const missingLanguage = structuredClone(lock);
    delete missingLanguage.files[0].language;
    expect(() => validateCorpusLock(missingLanguage)).toThrow(/language must be en or es/);

    const mismatchedLanguage = structuredClone(lock);
    mismatchedLanguage.files[0].language = 'es';
    expect(() => validateCorpusLock(mismatchedLanguage)).toThrow(/language must match locale/);
  });

  it('declares language as required in the lock JSON schema', async () => {
    const schema = JSON.parse(await readFile(
      path.resolve(import.meta.dirname, 'schemas/lock.schema.json'),
      'utf8',
    ));
    expect(schema.properties.files.items.required).toContain('language');
    expect(schema.properties.files.items.properties.language.enum).toEqual(['en', 'es']);
  });

  it('strips authored comments before analyzing question IDs', () => {
    const analysis = analyzeQuestionnaireText([
      '//{"version":"1.0"}',
      '{"name":"D_123"}',
      '// [COMMENTED?] ignored',
      '/* [BLOCKED?] ignored */',
      '[QUESTION?] Prompt',
      '[END,end] Done',
    ].join('\n'));

    expect(analysis.questName).toBe('D_123');
    expect(analysis.version).toBe('1.0');
    expect(analysis.questionIds).toEqual(['QUESTION', 'END']);
    expect(analysis.endCount).toBe(1);
  });
});

describe('corpus verification', () => {
  it('checks production hashes, metadata, and language question-ID parity', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'quest-corpus-test-'));
    temporaryDirectories.push(root);
    const english = '//{"version":"1.0"}\n{"name":"D_123"}\n[QUESTION?] English\n[END,end] Done\n';
    const spanish = '//{"version":"1.0"}\n{"name":"D_123"}\n[QUESTION?] Español\n[END,end] Fin\n';
    const files = [
      lockedFile({
        module: 'moduleTest', locale: 'en', productionPath: 'prod/moduleTest.txt',
        text: english,
      }),
      lockedFile({
        module: 'moduleTest', locale: 'es', productionPath: 'prod/moduleTestSpanish.txt',
        text: spanish,
      }),
    ];
    const lock = validateCorpusLock({
      schemaVersion: 1,
      repository: 'example/questionnaire',
      repositoryUrl: 'https://github.com/example/questionnaire.git',
      defaultBranch: 'main',
      commit: 'a'.repeat(40),
      cacheRoot: '.cache/questionnaire',
      sourceDirectory: 'prod',
      environment: 'prod',
      expectedFileCount: 2,
      expectedModuleCount: 1,
      expectedLanguageCounts: { en: 1, es: 1 },
      questionIdParityExceptions: [],
      files,
    });

    await writeFixture(root, files[0].path, english);
    await writeFixture(root, files[1].path, spanish);

    await expect(verifyCorpus({ lock, cacheDir: root })).resolves.toMatchObject({
      files: 2,
      modules: 1,
      sourceQuestionCount: 4,
    });

    await writeFile(path.join(root, files[0].path), `${english}tampered`);
    await expect(verifyCorpus({ lock, cacheDir: root })).rejects.toBeInstanceOf(CorpusVerificationError);
    await expect(verifyCorpus({ lock, cacheDir: root })).rejects.toThrow(/SHA-256 mismatch/);
  });
});
