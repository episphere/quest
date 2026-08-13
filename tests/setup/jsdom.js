import { afterEach, beforeEach, expect, vi } from 'vitest';

let unexpectedNetworkAttempts = [];

function networkTarget(input) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input?.url ?? String(input);
}

function installOfflineNetworkBoundary() {
  unexpectedNetworkAttempts = [];

  const denyFetch = vi.fn(async (input) => {
    const target = networkTarget(input);
    unexpectedNetworkAttempts.push({ transport: 'fetch', target });
    throw new Error(`Unexpected jsdom fetch blocked by the offline test boundary: ${target}`);
  });
  Object.defineProperty(denyFetch, 'questDenyByDefault', { value: true });
  vi.stubGlobal('fetch', denyFetch);

  class OfflineXMLHttpRequest {
    static questDenyByDefault = true;

    open(method, url) {
      this.method = method;
      this.url = networkTarget(url);
    }

    send() {
      const target = this.url ?? '<unopened request>';
      unexpectedNetworkAttempts.push({
        transport: 'XMLHttpRequest',
        method: this.method ?? null,
        target,
      });
      throw new Error(`Unexpected jsdom XMLHttpRequest blocked by the offline test boundary: ${target}`);
    }

    abort() {}
    setRequestHeader() {}
  }

  vi.stubGlobal('XMLHttpRequest', OfflineXMLHttpRequest);
}

class BootstrapComponentStub {
  static instances = new WeakMap();

  constructor(element) {
    this._element = element;
    this.constructor.instances.set(element, this);
  }

  static getInstance(element) {
    return this.instances.get(element) ?? null;
  }

  show() {
    this._element?.classList.add('show');
    this._element?.dispatchEvent(new Event('shown.bs.modal'));
  }

  hide() {
    this._element?.classList.remove('show');
    this._element?.dispatchEvent(new Event('hidden.bs.modal'));
  }

  dispose() {
    this.constructor.instances.delete(this._element);
  }
}

beforeEach(() => {
  installOfflineNetworkBoundary();
  document.documentElement.lang = 'en';
  document.body.innerHTML = '';

  globalThis.bootstrap = {
    Modal: class ModalStub extends BootstrapComponentStub {},
    Popover: class PopoverStub extends BootstrapComponentStub {},
  };

  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

  Element.prototype.scrollIntoView = vi.fn();
  URL.createObjectURL = vi.fn(() => 'blob:quest-test');
  URL.revokeObjectURL = vi.fn();

  if (!globalThis.CSS) globalThis.CSS = {};
  if (!globalThis.CSS.escape) {
    globalThis.CSS.escape = (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, (match) => `\\${match}`);
  }
});

afterEach(() => {
  expect(
    unexpectedNetworkAttempts,
    'jsdom attempted network access without an explicit per-test host-boundary stub',
  ).toEqual([]);
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  delete globalThis.bootstrap;
});
