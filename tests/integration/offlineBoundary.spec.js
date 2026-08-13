import { describe, expect, it, vi } from 'vitest';

describe('jsdom offline network boundary', () => {
  it('installs deny-by-default fetch and XMLHttpRequest implementations', () => {
    expect(globalThis.fetch.questDenyByDefault).toBe(true);
    expect(globalThis.XMLHttpRequest.questDenyByDefault).toBe(true);
  });

  it('allows a test to replace fetch only with an explicit host-boundary stub', async () => {
    const hostBoundary = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal('fetch', hostBoundary);

    await expect(fetch('https://synthetic-host.test/fixture')).resolves.toMatchObject({
      ok: true,
      status: 200,
    });
    expect(hostBoundary).toHaveBeenCalledWith('https://synthetic-host.test/fixture');
  });
});
