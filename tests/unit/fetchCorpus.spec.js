import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  downloadArchive,
  questionnaireArchiveUrl,
} from '../corpus/scripts/fetchCorpus.mjs';

const temporaryDirectories = [];
const lock = {
  repository: 'episphere/questionnaire',
  commit: '7ae99a22af325cf0e14be047a7636462db9bfd50',
};

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

describe('questionnaire corpus download', () => {
  it('uses the public archive URL for the exact locked commit', () => {
    expect(questionnaireArchiveUrl(lock)).toBe(
      'https://github.com/episphere/questionnaire/archive/7ae99a22af325cf0e14be047a7636462db9bfd50.tar.gz',
    );
  });

  it('does not send credentials even when token-named variables exist', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'must-not-be-sent');
    vi.stubEnv('GH_TOKEN', 'must-not-be-sent-either');
    const directory = await mkdtemp(path.join(os.tmpdir(), 'quest-corpus-download-test-'));
    temporaryDirectories.push(directory);
    const archivePath = path.join(directory, 'questionnaire.tar.gz');
    const archiveBytes = new Uint8Array([31, 139, 8, 0]);
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => archiveBytes.buffer,
    }));

    await downloadArchive(lock, archivePath, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(questionnaireArchiveUrl(lock), {
      headers: { 'User-Agent': 'quest-corpus-fetcher' },
      redirect: 'follow',
    });
    await expect(readFile(archivePath)).resolves.toEqual(Buffer.from(archiveBytes));
  });

  it('reports the HTTP status for an unsuccessful public download', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503 }));

    await expect(downloadArchive(lock, '/unused/archive.tar.gz', { fetchImpl }))
      .rejects.toThrow('Public GitHub archive fetch failed with HTTP 503.');
  });
});
