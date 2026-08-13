#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const commands = [
  [require.resolve('vitest/vitest.mjs'), 'run', '--config', 'tests/knownDefects/vitest.config.js'],
  [
    require.resolve('@playwright/test/cli'),
    'test',
    '--project=chromium-desktop',
    '--project=chromium-windows-ua',
    '--project=firefox-desktop',
    '--project=webkit-desktop',
    '--grep',
    '@known-defect',
  ],
];

let failed = false;
for (const [entrypoint, ...args] of commands) {
  const result = spawnSync(process.execPath, [entrypoint, ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) failed = true;
}

process.exitCode = failed ? 1 : 0;
