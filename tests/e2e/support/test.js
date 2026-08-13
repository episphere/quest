import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect } from '@playwright/test';

const supportDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(supportDirectory, '..', '..', '..');
const canonicalImageAsset = {
  url: 'https://episphere.github.io/quest/images/FemaleBaldness1.png',
  path: join(repositoryRoot, 'tests', 'e2e', 'assets', 'FemaleBaldness1.png'),
};
const questRuntimeAssets = [
  {
    url: 'https://episphere.github.io/quest-dev/ActiveLogic.css',
    path: join(repositoryRoot, 'ActiveLogic.css'),
  },
  {
    url: 'https://episphere.github.io/quest-dev/Style1.css',
    path: join(repositoryRoot, 'Style1.css'),
  },
];
const versionedQuestRuntimeAsset = /^https:\/\/cdn\.jsdelivr\.net\/gh\/episphere\/quest@v[^/]+\/(ActiveLogic|Style1)\.css$/;
const FIREFOX_INSTALL_TRIGGER_DEPRECATION = /^\[JavaScript Warning: "InstallTrigger is deprecated and will be removed in the future\." \{file: "http:\/\/127\.0\.0\.1:\d+\/main\.js" line: 179\}\] \[source: http:\/\/127\.0\.0\.1:\d+\/main\.js\]$/;

const testServerPort = process.env.QUEST_PLAYWRIGHT_PORT ?? '4173';
const LOCAL_ORIGINS = new Set([
  `http://127.0.0.1:${testServerPort}`,
  `http://localhost:${testServerPort}`,
]);

function shouldUseLocalNetwork(urlString) {
  const url = new URL(urlString);
  return LOCAL_ORIGINS.has(url.origin) || ['about:', 'blob:', 'data:'].includes(url.protocol);
}

/**
 * Install the suite's offline policy on a Playwright Page. All
 * route registration is awaited so the first navigation cannot race the
 * policy.
 */
export async function installOfflineDiagnostics(page) {
  const diagnostics = {
    unexpectedRequests: [],
    fulfilledExternalRequests: [],
    pageErrors: [],
    consoleErrors: [],
    consoleWarnings: [],
    acknowledgedBrowserWarnings: [],
  };

  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.stack || error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const source = message.location().url;
      diagnostics.consoleErrors.push(source ? `${message.text()} [source: ${source}]` : message.text());
    } else if (message.type() === 'warning') {
      const source = message.location().url;
      const renderedMessage = source ? `${message.text()} [source: ${source}]` : message.text();

      // Firefox emits this deprecation when Quest reads InstallTrigger
      // for its existing browser branch. Keep the browser diagnostic
      // visible in the record without masking unrelated warnings.
      if (FIREFOX_INSTALL_TRIGGER_DEPRECATION.test(renderedMessage)) {
        diagnostics.acknowledgedBrowserWarnings.push(renderedMessage);
      } else {
        diagnostics.consoleWarnings.push(renderedMessage);
      }
    }
  });

  await page.route('**/*', async (route) => {
    if (shouldUseLocalNetwork(route.request().url())) {
      await route.continue();
      return;
    }

    diagnostics.unexpectedRequests.push(route.request().url());
    await route.abort('blockedbyclient');
  });

  await page.route(canonicalImageAsset.url, async (route) => {
    diagnostics.fulfilledExternalRequests.push(canonicalImageAsset.url);
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      path: canonicalImageAsset.path,
    });
  });

  // A Connect render normally supplies prefetched Markdown and retains the
  // questionnaire URL. Quest uses the nonempty URL as the signal to fetch
  // its two runtime stylesheets. Fulfill that production branch with the
  // exact checked-in CSS while keeping the browser deny-by-default.
  for (const asset of questRuntimeAssets) {
    await page.route(asset.url, async (route) => {
      diagnostics.fulfilledExternalRequests.push(asset.url);
      await route.fulfill({
        status: 200,
        contentType: 'text/css',
        path: asset.path,
      });
    });
  }

  await page.route(versionedQuestRuntimeAsset, async (route) => {
    const url = route.request().url();
    const fileName = new URL(url).pathname.split('/').at(-1);
    diagnostics.fulfilledExternalRequests.push(url);
    await route.fulfill({
      status: 200,
      contentType: 'text/css',
      path: join(repositoryRoot, fileName),
    });
  });

  return diagnostics;
}

/**
 * Every browser test receives a fresh Playwright page/context.
 */
export const test = base.extend({
  diagnostics: [async ({ page }, use) => {
    const diagnostics = await installOfflineDiagnostics(page);

    await use(diagnostics);

    expect.soft(diagnostics.unexpectedRequests, 'browser attempted an unapproved external request').toEqual([]);
    expect.soft(diagnostics.pageErrors, 'browser emitted an uncaught page error').toEqual([]);
    expect.soft(diagnostics.consoleErrors, 'browser emitted an unexpected console error').toEqual([]);
    expect.soft(diagnostics.consoleWarnings, 'browser emitted an unexpected console warning').toEqual([]);
  }, { auto: true }],
});

export function expectAndClearConsoleErrors(diagnostics, expectedPatterns, { allowedPatterns = [] } = {}) {
  const messages = diagnostics.consoleErrors.splice(0);
  const acceptedPatterns = [...expectedPatterns, ...allowedPatterns];

  for (const pattern of expectedPatterns) {
    expect(
      messages.some((message) => (
        pattern instanceof RegExp ? pattern.test(message) : message.includes(pattern)
      )),
      `expected a console error matching ${String(pattern)}; received ${JSON.stringify(messages)}`,
    ).toBe(true);
  }

  for (const message of messages) {
    expect(
      acceptedPatterns.some((pattern) => (
        pattern instanceof RegExp ? pattern.test(message) : message.includes(pattern)
      )),
      `unexpected console error while exercising a characterized failure: ${message}`,
    ).toBe(true);
  }
}

export function expectAndClearConsoleWarnings(diagnostics, expectedPatterns, { allowedPatterns = [] } = {}) {
  const messages = diagnostics.consoleWarnings.splice(0);
  const acceptedPatterns = [...expectedPatterns, ...allowedPatterns];

  for (const pattern of expectedPatterns) {
    expect(
      messages.some((message) => (
        pattern instanceof RegExp ? pattern.test(message) : message.includes(pattern)
      )),
      `expected a console warning matching ${String(pattern)}; received ${JSON.stringify(messages)}`,
    ).toBe(true);
  }

  for (const message of messages) {
    expect(
      acceptedPatterns.some((pattern) => (
        pattern instanceof RegExp ? pattern.test(message) : message.includes(pattern)
      )),
      `unexpected console warning while exercising a characterized warning: ${message}`,
    ).toBe(true);
  }
}

export { expect };
