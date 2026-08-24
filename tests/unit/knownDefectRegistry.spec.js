import { describe, expect, it } from 'vitest';
import { allKnownDefects } from '../knownDefects/registry.js';

describe('known-defect policy registry', () => {
  it('keeps every accepted defect owned, traceable, reasoned, and unexpired', () => {
    const today = new Date().toISOString().slice(0, 10);
    const ids = new Set();

    for (const entry of allKnownDefects) {
      expect(entry.localDefectId).toMatch(/^(?:QD-|CONNECT-)/);
      expect(ids.has(entry.localDefectId), `duplicate local defect ID: ${entry.localDefectId}`).toBe(false);
      ids.add(entry.localDefectId);
      expect(entry.owner).toBeTruthy();
      expect(entry.target).toBeTruthy();
      expect(entry.reason).toBeTruthy();
      expect(entry.expiry).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.expiry.localeCompare(today), `${entry.localDefectId} expired on ${entry.expiry}`).toBeGreaterThanOrEqual(0);
    }
  });
});
