import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from './test.js';

const supportDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(supportDirectory, '..', '..', '..');

const paths = {
  index: join(repositoryRoot, 'index.html'),
  bootstrapCss: join(repositoryRoot, 'node_modules', 'bootstrap-authoring', 'dist', 'css', 'bootstrap.min.css'),
  bootstrapJs: join(repositoryRoot, 'node_modules', 'bootstrap-authoring', 'dist', 'js', 'bootstrap.bundle.min.js'),
  fontAwesomeCss: join(repositoryRoot, 'node_modules', '@fortawesome', 'fontawesome-free', 'css', 'fontawesome.min.css'),
  localForageJs: join(repositoryRoot, 'node_modules', 'localforage', 'dist', 'localforage.min.js'),
  fontLock: join(repositoryRoot, 'tests', 'e2e', 'assets', 'fonts.lock.json'),
};

const fontLock = JSON.parse(readFileSync(paths.fontLock, 'utf8'));
const libreBaskerville = fontLock.assets.find((asset) => asset.family === 'Libre Baskerville');
if (!libreBaskerville) {
  throw new Error('The authoring asset lock is missing Libre Baskerville.');
}

const libreBaskervillePath = join(repositoryRoot, 'tests', 'e2e', 'assets', ...libreBaskerville.path.split('/'));
const libreBaskervilleBytes = readFileSync(libreBaskervillePath);
const libreBaskervilleDigest = createHash('sha256').update(libreBaskervilleBytes).digest('hex');
if (libreBaskervilleBytes.byteLength !== libreBaskerville.bytes
  || libreBaskervilleDigest !== libreBaskerville.sha256) {
  throw new Error('The pinned Libre Baskerville authoring asset failed its integrity check.');
}

const libreBaskervilleLicensePath = join(
  repositoryRoot,
  'tests',
  'e2e',
  'assets',
  ...libreBaskerville.licensePath.split('/'),
);
const libreBaskervilleLicenseDigest = createHash('sha256')
  .update(readFileSync(libreBaskervilleLicensePath))
  .digest('hex');
if (libreBaskervilleLicenseDigest !== libreBaskerville.licenseSha256) {
  throw new Error('The pinned Libre Baskerville license failed its integrity check.');
}

export const LIBRE_BASKERVILLE_STYLESHEET_URL = libreBaskerville.stylesheetUrl;
export const LIBRE_BASKERVILLE_FONT_URL = libreBaskerville.url;
export const AUTHORING_BOOTSTRAP_CSS_URL = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css';
export const AUTHORING_BOOTSTRAP_JS_URL = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js';

const LIBRE_BASKERVILLE_CSS = `
  @font-face {
    font-family: 'Libre Baskerville';
    font-style: normal;
    font-weight: 400;
    font-display: swap;
    src: url('${LIBRE_BASKERVILLE_FONT_URL}') format('truetype');
  }
`;

const AUTHORING_EXTERNAL_ASSETS = [
  {
    url: AUTHORING_BOOTSTRAP_CSS_URL,
    path: paths.bootstrapCss,
    contentType: 'text/css',
  },
  {
    url: AUTHORING_BOOTSTRAP_JS_URL,
    path: paths.bootstrapJs,
    contentType: 'application/javascript',
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.2/css/fontawesome.min.css',
    path: paths.fontAwesomeCss,
    contentType: 'text/css',
  },
  {
    url: 'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.10.0/localforage.min.js',
    path: paths.localForageJs,
    contentType: 'application/javascript',
  },
];

export const DEMO_MODULE_URL = 'https://raw.githubusercontent.com/episphere/quest/main/questionnaires/demo.txt';
export const TEST_MODULE_URL = 'https://questionnaire.test/canonical.txt';
export const HTTP_ERROR_MODULE_URL = 'https://questionnaire.test/not-found.txt';
export const REJECTED_MODULE_URL = 'https://questionnaire.test/rejected.txt';
export const GITHUB_BLOB_MODULE_URL = 'https://github.com/episphere/questionnaire/blob/locked/prod/canonical.txt';
export const GITHUB_WEB_RAW_MODULE_URL = 'https://github.com/episphere/questionnaire/raw/locked/prod/canonical.txt';
export const GITHUB_RAW_MODULE_URL = 'https://raw.githubusercontent.com/episphere/questionnaire/locked/prod/canonical.txt';

const LOCALFORAGE_FALLBACK_SCRIPT = `
  window.localforage = {
    createInstance() {
      throw new Error('Synthetic LocalForage initialization failure');
    },
    clear() {
      return Promise.resolve();
    }
  };
`;

function normalizeModuleResponse(response) {
  if (typeof response === 'string') {
    return { status: 200, body: response, contentType: 'text/plain' };
  }

  return {
    status: response.status ?? 200,
    body: response.body ?? '',
    contentType: response.contentType ?? 'text/plain',
    abort: response.abort,
  };
}

export async function installAuthoringRoutes(page, diagnostics, {
  demoMarkdown = '',
  localForageMode = 'normal',
  modules = {},
} = {}) {
  // Preserve the checked-in page's SRI and crossorigin declarations. The
  // intercepted authoring assets are byte-identical to its pinned versions;
  // the participant harness separately uses Connect-shaped Bootstrap 5.3.3.
  const importMap = `
    <script type="importmap">
      {"imports":{"https://cdn.jsdelivr.net/npm/mathjs@13.0.3/+esm":"/tests/harness/mathjsLocal.js"}}
    </script>
  `;
  const readinessProbe = `
    <script>
      (() => {
        const originalAddEventListener = EventTarget.prototype.addEventListener;
        const requiredListeners = new Set(['updater:click', 'markupTextArea:keyup']);

        EventTarget.prototype.addEventListener = function (type, listener, options) {
          const result = originalAddEventListener.call(this, type, listener, options);
          const listenerKey = this && this.id ? this.id + ':' + type : '';
          requiredListeners.delete(listenerKey);
          if (requiredListeners.size === 0) {
            window.__questAuthoringReady = true;
            EventTarget.prototype.addEventListener = originalAddEventListener;
          }
          return result;
        };
      })();
    </script>
  `;
  const localIndex = readFileSync(paths.index, 'utf8')
    .replace('</head>', `${importMap}${readinessProbe}</head>`);

  await page.route('**/index.html*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: localIndex,
    });
  });

  for (const asset of AUTHORING_EXTERNAL_ASSETS) {
    await page.route(asset.url, async (route) => {
      diagnostics.fulfilledExternalRequests.push(asset.url);

      if (asset.url.includes('localforage') && localForageMode === 'initialization-failure') {
        await route.fulfill({
          status: 200,
          contentType: 'application/javascript',
          body: LOCALFORAGE_FALLBACK_SCRIPT,
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: asset.contentType,
        headers: { 'access-control-allow-origin': '*' },
        path: asset.path,
      });
    });
  }

  await page.route('https://fonts.googleapis.com/**', async (route) => {
    diagnostics.fulfilledExternalRequests.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'text/css',
      body: LIBRE_BASKERVILLE_CSS,
    });
  });

  await page.route(LIBRE_BASKERVILLE_FONT_URL, async (route) => {
    diagnostics.fulfilledExternalRequests.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: libreBaskerville.mimeType,
      path: libreBaskervillePath,
    });
  });

  await page.route(DEMO_MODULE_URL, async (route) => {
    diagnostics.fulfilledExternalRequests.push(DEMO_MODULE_URL);
    await route.fulfill({ status: 200, contentType: 'text/plain', body: demoMarkdown });
  });

  for (const [url, moduleResponse] of Object.entries(modules)) {
    const response = normalizeModuleResponse(moduleResponse);
    await page.route(url, async (route) => {
      diagnostics.fulfilledExternalRequests.push(url);
      if (response.abort) {
        await route.abort(response.abort);
        return;
      }

      await route.fulfill({
        status: response.status,
        contentType: response.contentType,
        body: response.body,
      });
    });
  }
}

export async function waitForAuthoringReady(page) {
  await page.waitForLoadState('load');
  await page.waitForFunction(() => {
    const textarea = document.getElementById('markupTextArea');
    return Boolean(
      window.localforage
      && window.__questAuthoringReady === true
      && textarea
      && !textarea.disabled,
    );
  });
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}

export async function renderAuthoringMarkdown(page, markdown) {
  const textarea = page.locator('#markupTextArea');
  await textarea.fill(markdown);
  await textarea.dispatchEvent('keyup', { key: 'a' });
  await page.waitForFunction(() => document.querySelectorAll('#rendering form.question').length > 0);
}

export async function openAuthoringSettings(page) {
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.locator('#settings')).toHaveClass(/show/);
}

export async function closeAuthoringSettings(page) {
  await page.locator('#settings').getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('#settings')).not.toHaveClass(/show/);
}
