import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  corpusCacheDirectory,
  getLockedArtifacts,
  loadCorpusLock,
  resolveCorpusCacheRoot,
  sha256Buffer,
  gitBlobShaBuffer,
  verifyCorpus,
} from './lib/corpus.mjs';
import { DEFAULT_LOCK_PATH, pathExists } from './lib/artifacts.mjs';

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = fileURLToPath(import.meta.url);

function parseArguments(argv) {
  const options = {
    lockPath: DEFAULT_LOCK_PATH,
    cacheRoot: null,
    force: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--lock') options.lockPath = path.resolve(argv[++index]);
    else if (argument === '--cache-root') options.cacheRoot = path.resolve(argv[++index]);
    else if (argument === '--force') options.force = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

export function questionnaireArchiveUrl(lock) {
  return `https://github.com/${lock.repository}/archive/${lock.commit}.tar.gz`;
}

export async function downloadArchive(lock, archivePath, { fetchImpl = fetch } = {}) {
  const url = questionnaireArchiveUrl(lock);
  const response = await fetchImpl(url, {
    headers: { 'User-Agent': 'quest-corpus-fetcher' },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Public GitHub archive fetch failed with HTTP ${response.status}.`);
  }
  await writeFile(archivePath, Buffer.from(await response.arrayBuffer()));
}

async function extractArchive(archivePath, destination) {
  await mkdir(destination, { recursive: true });
  try {
    await execFileAsync('tar', [
      '-xzf', archivePath,
      '-C', destination,
      '--strip-components=1',
    ]);
  } catch (error) {
    throw new Error(`Unable to extract the locked questionnaire archive: ${error.stderr || error.message}`);
  }
}

async function copyLockedArtifacts(lock, checkoutRoot, destinationRoot) {
  for (const artifact of getLockedArtifacts(lock)) {
    const source = path.join(checkoutRoot, ...artifact.path.split('/'));
    const buffer = await readFile(source);
    const actualSha256 = sha256Buffer(buffer);
    const actualGitBlobSha = gitBlobShaBuffer(buffer);
    if (actualSha256 !== artifact.sha256 || actualGitBlobSha !== artifact.gitBlobSha) {
      throw new Error(`${artifact.path}: archive bytes do not match the locked hashes.`);
    }

    const destination = path.join(destinationRoot, ...artifact.path.split('/'));
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
}

async function installStagedCache(stagedCache, cacheDir, temporaryRoot) {
  const previousCache = path.join(temporaryRoot, 'previous-cache');
  const hadExistingCache = await pathExists(cacheDir);

  if (hadExistingCache) await rename(cacheDir, previousCache);

  try {
    await rename(stagedCache, cacheDir);
  } catch (error) {
    if (hadExistingCache && !(await pathExists(cacheDir))) {
      await rename(previousCache, cacheDir);
    }
    throw error;
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const lock = await loadCorpusLock(options.lockPath);
  const cacheRoot = resolveCorpusCacheRoot(lock, options.cacheRoot);
  const cacheDir = corpusCacheDirectory(lock, cacheRoot);

  if (await pathExists(cacheDir)) {
    if (!options.force) {
      const summary = await verifyCorpus({ lock, cacheDir });
      console.log(`Corpus cache already verified at ${cacheDir} (${summary.files} prod files).`);
      return;
    }
  }

  await mkdir(cacheRoot, { recursive: true });
  const temporaryRoot = await mkdtemp(path.join(cacheRoot, `.${lock.commit}.tmp-`));
  const archivePath = path.join(temporaryRoot, 'questionnaire.tar.gz');
  const checkoutRoot = path.join(temporaryRoot, 'checkout');
  const stagedCache = path.join(temporaryRoot, 'cache');

  try {
    await downloadArchive(lock, archivePath);
    await extractArchive(archivePath, checkoutRoot);
    await mkdir(stagedCache, { recursive: true });
    await copyLockedArtifacts(lock, checkoutRoot, stagedCache);
    const summary = await verifyCorpus({ lock, cacheDir: stagedCache });
    await installStagedCache(stagedCache, cacheDir, temporaryRoot);
    await rm(temporaryRoot, { recursive: true, force: true });
    console.log(`Fetched and verified ${summary.files} production files at ${lock.commit}.`);
    console.log(cacheDir);
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    console.error(error.cause?.message ?? error.message);
    process.exitCode = 1;
  });
}
