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
  static eventNamespace = 'modal';

  constructor(element) {
    this._element = element;
    this.constructor.instances.set(element, this);
  }

  static getInstance(element) {
    return this.instances.get(element) ?? null;
  }

  static getOrCreateInstance(element, options) {
    return this.getInstance(element) ?? new this(element, options);
  }

  show() {
    if (!this._element || this._element.classList.contains('show')) return;

    this._element.classList.add('show');
    this._element.dispatchEvent(new Event(`shown.bs.${this.constructor.eventNamespace}`));
  }

  hide() {
    if (!this._element || !this._element.classList.contains('show')) return;

    this._element.classList.remove('show');
    this._element.dispatchEvent(new Event(`hidden.bs.${this.constructor.eventNamespace}`));
  }

  toggle() {
    if (this._element?.classList.contains('show')) {
      this.hide();
    } else {
      this.show();
    }
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
    Modal: class ModalStub extends BootstrapComponentStub {
      static instances = new WeakMap();
      static eventNamespace = 'modal';
    },
    Popover: class PopoverStub extends BootstrapComponentStub {
      static instances = new WeakMap();
      static eventNamespace = 'popover';

      static nextTipId = 1;

      constructor(element) {
        super(element);
        this._tip = null;
      }

      _getTipElement() {
        if (!this._tip) {
          this._tip = this._element.ownerDocument.createElement('div');
          this._tip.id = `test-popover-${this.constructor.nextTipId++}`;
          this._tip.classList.add('popover');
          this._tip.setAttribute('role', 'tooltip');
        }

        return this._tip;
      }

      show() {
        const tip = this._getTipElement();
        if (tip.classList.contains('show')) return;

        this._element.setAttribute('aria-describedby', tip.id);
        this._element.ownerDocument.body.append(tip);
        tip.classList.add('show');
        this._element.dispatchEvent(new Event(`shown.bs.${this.constructor.eventNamespace}`));
      }

      hide() {
        const tip = this._tip;
        if (!tip?.classList.contains('show')) return;

        tip.classList.remove('show');
        this._element.removeAttribute('aria-describedby');
        tip.remove();
        this._tip = null;
        this._element.dispatchEvent(new Event(`hidden.bs.${this.constructor.eventNamespace}`));
      }

      toggle() {
        if (this._tip?.classList.contains('show')) {
          this.hide();
        } else {
          this.show();
        }
      }

      dispose() {
        this._element.removeAttribute('aria-describedby');
        this._tip?.remove();
        this._tip = null;
        super.dispose();
      }
    },
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
