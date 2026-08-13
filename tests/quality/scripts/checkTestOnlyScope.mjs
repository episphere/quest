#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BOOTSTRAP_BASE_SHA = '982f24ddc133d2e0153b792521da0af4c769b0b9';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..', '..', '..');
const ROOT_CONFIG_FILES = new Set([
  'playwright.config.js',
  'vite.config.js',
  'vitest.config.js',
]);
const ROOT_METADATA_FILES = new Set([
  '.gitignore',
  '.node-version',
  '.nvmrc',
  'README.md',
]);

export function scopeDecision(repositoryPath) {
  if (!isSafeRepositoryPath(repositoryPath)) {
    return { allowed: false, reason: 'path is not a safe normalized repository-relative path' };
  }

  if (repositoryPath.startsWith('i18n/')) {
    return { allowed: false, reason: 'production i18n source is outside this test-only pull request' };
  }

  if (!repositoryPath.includes('/') && /\.(?:css|html)$/i.test(repositoryPath)) {
    return { allowed: false, reason: 'root production CSS/HTML is outside this test-only pull request' };
  }

  if (!repositoryPath.includes('/') && repositoryPath.endsWith('.js') && !ROOT_CONFIG_FILES.has(repositoryPath)) {
    return { allowed: false, reason: 'root production JavaScript is outside this test-only pull request' };
  }

  if (repositoryPath.startsWith('tests/')) return { allowed: true };
  if (repositoryPath.startsWith('.github/')) return { allowed: true };
  if (repositoryPath.startsWith('docs/')) return { allowed: true };
  if (ROOT_METADATA_FILES.has(repositoryPath)) return { allowed: true };
  if (ROOT_CONFIG_FILES.has(repositoryPath)) return { allowed: true };
  if (/^package[^/]*\.json$/.test(repositoryPath)) return { allowed: true };

  return { allowed: false, reason: 'path is not in the bootstrap test-infrastructure allowlist' };
}

export function checkTestOnlyScope({
  repositoryRoot = REPOSITORY_ROOT,
  baseRevision = BOOTSTRAP_BASE_SHA,
  headRevision = 'HEAD',
} = {}) {
  const baseSha = resolveCommit(repositoryRoot, baseRevision, 'bootstrap base');
  const headSha = resolveCommit(repositoryRoot, headRevision, 'head');
  assertAncestor(repositoryRoot, baseSha, headSha);

  const changedPaths = changedPathsBetween(repositoryRoot, baseSha, headSha);
  const violations = changedPaths
    .map((changedPath) => ({ path: changedPath, ...scopeDecision(changedPath) }))
    .filter(({ allowed }) => !allowed)
    .sort((left, right) => comparePaths(left.path, right.path));

  if (violations.length > 0) {
    throw new Error([
      'Bootstrap test-only scope gate failed.',
      `Only reviewed test infrastructure may differ from ${baseSha}.`,
      ...violations.map(({ path: changedPath, reason }) => `- ${changedPath}: ${reason}`),
    ].join('\n'));
  }

  return { baseSha, headSha, changedPaths };
}

export function parseScopeCliArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== '--head') throw new Error(`Unknown test-only scope argument: ${argument}`);
    const headRevision = argv[index + 1];
    if (!headRevision || headRevision.startsWith('--')) {
      throw new Error('--head requires an exact revision argument.');
    }
    options.headRevision = headRevision;
    index += 1;
  }
  return options;
}

function resolveCommit(repositoryRoot, revision, label) {
  try {
    const sha = execFileSync(
      'git',
      ['-C', repositoryRoot, 'rev-parse', '--verify', `${revision}^{commit}`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();
    if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`resolved unsupported object ID ${sha}`);
    return sha;
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    throw new Error(`Unable to resolve ${label} revision ${revision}: ${detail}`);
  }
}

function assertAncestor(repositoryRoot, baseSha, headSha) {
  const result = spawnSync(
    'git',
    ['-C', repositoryRoot, 'merge-base', '--is-ancestor', baseSha, headSha],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  if (result.error) throw result.error;
  if (result.status === 1) {
    throw new Error(`Bootstrap base ${baseSha} is not an ancestor of head ${headSha}.`);
  }
  if (result.status !== 0) {
    throw new Error(`Unable to verify bootstrap ancestry: ${result.stderr.trim() || `git exited ${result.status}`}`);
  }
}

function changedPathsBetween(repositoryRoot, baseSha, headSha) {
  const output = execFileSync(
    'git',
    ['-C', repositoryRoot, 'diff', '--name-only', '--no-renames', '-z', `${baseSha}...${headSha}`, '--'],
    { encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(output);
  return decoded.split('\0').filter(Boolean).sort(comparePaths);
}

function comparePaths(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function isSafeRepositoryPath(repositoryPath) {
  if (typeof repositoryPath !== 'string' || repositoryPath.length === 0) return false;
  if (repositoryPath.startsWith('/') || repositoryPath.includes('\\')) return false;
  if (/[\u0000-\u001f\u007f]/.test(repositoryPath)) return false;
  const segments = repositoryPath.split('/');
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    const result = checkTestOnlyScope(parseScopeCliArgs(process.argv.slice(2)));
    console.log(
      `Bootstrap test-only scope passed: ${result.changedPaths.length} changed path(s) from ${result.baseSha} to ${result.headSha}.`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
