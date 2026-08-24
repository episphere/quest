import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  checkTestOnlyScope,
  parseScopeCliArgs,
  scopeDecision,
} from '../quality/scripts/checkTestOnlyScope.mjs';

const temporaryRepositories = [];

afterEach(async () => {
  await Promise.all(temporaryRepositories.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('bootstrap test-only scope policy', () => {
  it('requires an explicit value for the optional head revision', () => {
    expect(parseScopeCliArgs([])).toEqual({});
    expect(parseScopeCliArgs(['--head', 'abc123'])).toEqual({ headRevision: 'abc123' });
    expect(() => parseScopeCliArgs(['--head'])).toThrow('--head requires');
    expect(() => parseScopeCliArgs(['--base', 'abc123'])).toThrow('Unknown test-only scope argument');
  });

  it.each([
    'tests/unit/example.spec.js',
    '.github/workflows/quest-pr.yml',
    'docs/testing.md',
    'package.json',
    'package-lock.json',
    'package-fixture.json',
    'playwright.config.js',
    'vite.config.js',
    'vitest.config.js',
    '.node-version',
    '.nvmrc',
    '.gitignore',
    'README.md',
  ])('allows reviewed test infrastructure at %s', (repositoryPath) => {
    expect(scopeDecision(repositoryPath)).toEqual({ allowed: true });
  });

  it.each([
    ['main.js', 'root production JavaScript'],
    ['eventHandlers.js', 'root production JavaScript'],
    ['ActiveLogic.css', 'root production CSS/HTML'],
    ['index.html', 'root production CSS/HTML'],
    ['i18n/en.js', 'production i18n source'],
    ['assets/example.png', 'not in the bootstrap test-infrastructure allowlist'],
    ['tests/../main.js', 'not a safe normalized repository-relative path'],
  ])('rejects %s', (repositoryPath, expectedReason) => {
    expect(scopeDecision(repositoryPath)).toEqual({
      allowed: false,
      reason: expect.stringContaining(expectedReason),
    });
  });

  it('accepts an allowed descendant and reports a deterministic path inventory', async () => {
    const repository = await createRepository();
    await write(repository.root, 'tests/unit/new.spec.js', 'export const covered = true;\n');
    await write(repository.root, 'docs/testing.md', '# Testing\n');
    const headSha = commit(repository.root, 'add test infrastructure');

    expect(checkTestOnlyScope({
      repositoryRoot: repository.root,
      baseRevision: repository.baseSha,
      headRevision: headSha,
    })).toEqual({
      baseSha: repository.baseSha,
      headSha,
      changedPaths: ['docs/testing.md', 'tests/unit/new.spec.js'],
    });
  });

  it('reports every production path changed by a descendant', async () => {
    const repository = await createRepository();
    await write(repository.root, 'main.js', 'export const production = 2;\n');
    await write(repository.root, 'i18n/en.js', 'export default { next: "Continue" };\n');
    const headSha = commit(repository.root, 'change production');

    expect(() => checkTestOnlyScope({
      repositoryRoot: repository.root,
      baseRevision: repository.baseSha,
      headRevision: headSha,
    })).toThrowError([
      'Bootstrap test-only scope gate failed.',
      `Only reviewed test infrastructure may differ from ${repository.baseSha}.`,
      '- i18n/en.js: production i18n source is outside this test-only pull request',
      '- main.js: root production JavaScript is outside this test-only pull request',
    ].join('\n'));
  });

  it('cannot hide a production deletion behind a rename into tests', async () => {
    const repository = await createRepository();
    await mkdir(path.join(repository.root, 'tests'), { recursive: true });
    await rename(path.join(repository.root, 'main.js'), path.join(repository.root, 'tests', 'main.js'));
    const headSha = commit(repository.root, 'move production into tests');

    expect(() => checkTestOnlyScope({
      repositoryRoot: repository.root,
      baseRevision: repository.baseSha,
      headRevision: headSha,
    })).toThrow(/main\.js: root production JavaScript/);
  });

  it('rejects an allowed-path commit when the pinned base is not its ancestor', async () => {
    const repository = await createRepository();
    git(repository.root, 'switch', '--detach', repository.rootSha);
    await write(repository.root, 'tests/unit/sibling.spec.js', 'export const sibling = true;\n');
    const siblingSha = commit(repository.root, 'create unrelated test branch');

    expect(() => checkTestOnlyScope({
      repositoryRoot: repository.root,
      baseRevision: repository.baseSha,
      headRevision: siblingSha,
    })).toThrow(`Bootstrap base ${repository.baseSha} is not an ancestor of head ${siblingSha}.`);
  });
});

async function createRepository() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quest-test-only-scope-'));
  temporaryRepositories.push(root);
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.email', 'quest-tests@example.invalid');
  git(root, 'config', 'user.name', 'Quest Tests');

  await write(root, 'seed.txt', 'repository seed\n');
  const rootSha = commit(root, 'seed repository');
  await write(root, 'main.js', 'export const production = 1;\n');
  await write(root, 'ActiveLogic.css', '.question { display: block; }\n');
  await write(root, 'index.html', '<main>Quest</main>\n');
  await write(root, 'i18n/en.js', 'export default { next: "Next" };\n');
  const baseSha = commit(root, 'create production baseline');
  return { root, rootSha, baseSha };
}

async function write(repositoryRoot, relativePath, content) {
  const filePath = path.join(repositoryRoot, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

function commit(repositoryRoot, message) {
  git(repositoryRoot, 'add', '--all');
  git(repositoryRoot, 'commit', '--quiet', '--message', message);
  return git(repositoryRoot, 'rev-parse', 'HEAD').trim();
}

function git(repositoryRoot, ...arguments_) {
  return execFileSync('git', ['-C', repositoryRoot, ...arguments_], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
