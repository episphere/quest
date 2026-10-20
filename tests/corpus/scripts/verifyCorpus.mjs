import path from 'node:path';

import { DEFAULT_LOCK_PATH } from './lib/artifacts.mjs';
import { corpusCacheDirectory, loadCorpusLock, verifyCorpus } from './lib/corpus.mjs';

function parseArguments(argv) {
  const options = { lockPath: DEFAULT_LOCK_PATH, cacheRoot: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--lock') options.lockPath = path.resolve(argv[++index]);
    else if (argument === '--cache-root') options.cacheRoot = path.resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const lock = await loadCorpusLock(options.lockPath);
  const cacheDir = corpusCacheDirectory(lock, options.cacheRoot);
  const summary = await verifyCorpus({ lock, cacheDir });

  console.log(`Verified questionnaire corpus at ${summary.commit}:`);
  console.log(`- ${summary.files} prod files (${summary.localeCounts.en} en, ${summary.localeCounts.es} es)`);
  console.log(`- ${summary.modules} logical modules`);
  console.log(`- ${summary.sourceQuestionCount} question markers`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
