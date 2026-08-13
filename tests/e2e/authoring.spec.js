import {
  test,
  expect,
  expectAndClearConsoleErrors,
  expectAndClearConsoleWarnings,
} from './support/test.js';
import { readCanonicalFixture } from './support/harness.js';
import {
  AUTHORING_BOOTSTRAP_CSS_URL,
  AUTHORING_BOOTSTRAP_JS_URL,
  DEMO_MODULE_URL,
  GITHUB_BLOB_MODULE_URL,
  GITHUB_RAW_MODULE_URL,
  GITHUB_WEB_RAW_MODULE_URL,
  HTTP_ERROR_MODULE_URL,
  LIBRE_BASKERVILLE_FONT_URL,
  LIBRE_BASKERVILLE_STYLESHEET_URL,
  REJECTED_MODULE_URL,
  TEST_MODULE_URL,
  closeAuthoringSettings,
  installAuthoringRoutes,
  openAuthoringSettings,
  renderAuthoringMarkdown,
  waitForAuthoringReady,
} from './support/authoring.js';

const DESKTOP_ENGINES = new Set(['chromium-desktop', 'firefox-desktop', 'webkit-desktop']);
const CONDITIONAL_MARKDOWN = `
  {"name":"PREVIOUS_RESULTS_AUTHORING"}
  [START] Begin the conditional test.
  [HIDDEN,displayif=equals(EXTERNAL_FLAG,0)] Prior data did not match.
  [VISIBLE,displayif=equals(EXTERNAL_FLAG,1)] Prior data matched.
  [END] Done.
`;

async function readQuestParamsIndexedDb(page) {
  return page.evaluate(async () => {
    const supportsDatabaseEnumeration = typeof indexedDB.databases === 'function';
    const databases = supportsDatabaseEnumeration ? await indexedDB.databases() : [];
    const questDatabase = databases.find((database) => database.name === 'questParams');
    if (!questDatabase) {
      return {
        supportsDatabaseEnumeration,
        databases,
        objectStores: [],
        records: {},
      };
    }

    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('questParams');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const objectStores = [...database.objectStoreNames];
    const keys = ['logic', 'styling', 'previousResults'];
    const transaction = database.transaction('params', 'readonly');
    const store = transaction.objectStore('params');
    const values = await Promise.all(keys.map((key) => new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    })));
    database.close();

    return {
      supportsDatabaseEnumeration,
      databases,
      objectStores,
      records: Object.fromEntries(keys.map((key, index) => [key, values[index]])),
    };
  });
}

test.describe('checked-in authoring application @authoring', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      !DESKTOP_ENGINES.has(testInfo.project.name),
      'The authoring suite runs in each desktop browser engine.',
    );
  });

  test('renders a complete module and switches to participant-style active logic @cross-browser-authoring', async ({ page, diagnostics }) => {
    await installAuthoringRoutes(page, diagnostics);
    await page.goto('/index.html');
    await waitForAuthoringReady(page);
    await renderAuthoringMarkdown(page, readCanonicalFixture('runtimeControls.txt'));

    await expect(page.locator('#rendering form.question')).toHaveCount(8);
    await expect(page.locator('#rendering form.question:visible')).toHaveCount(8);
    await expect(page.locator('#pagestyle')).toHaveAttribute('href', 'Default.css');
    await expect(page.locator('#pagelogic')).toHaveAttribute('href', 'Default.css');

    await openAuthoringSettings(page);
    await page.getByRole('switch', { name: 'Activate Logic' }).check();
    await expect(page.locator('#pagelogic')).toHaveAttribute('href', 'ActiveLogic.css');
    await expect(page.locator('#rendering form.question')).toHaveCount(1);
    await expect(page.locator('#rendering form.question.active')).toHaveCount(1);

    await page.getByRole('switch', { name: 'Use Styling' }).check();
    await expect(page.locator('#pagestyle')).toHaveAttribute('href', 'Style1.css');
    await expect(page.locator('#rendering form.question.active')).toHaveCount(1);
  });

  test('loads previous results before rendering and applies them to authored conditions', async ({ page, diagnostics }) => {
    await installAuthoringRoutes(page, diagnostics);
    await page.goto('/index.html');
    await waitForAuthoringReady(page);

    await openAuthoringSettings(page);
    await page.getByRole('textbox', { name: 'json input' }).fill('{"EXTERNAL_FLAG":"1"}');
    await page.getByRole('button', { name: 'Add JSON to Memory' }).click();
    await expect(page.locator('#loadDisplay')).toHaveText('Added JSON successfully.');
    await page.getByRole('switch', { name: 'Activate Logic' }).check();
    await closeAuthoringSettings(page);

    await renderAuthoringMarkdown(page, CONDITIONAL_MARKDOWN);
    await expect(page.locator('#rendering #START.active')).toBeVisible();
    await page.locator('#rendering #START button.next').click();
    await expect(page.locator('#rendering #VISIBLE.active')).toBeVisible();
    await expect(page.locator('#rendering #HIDDEN')).toHaveCount(0);
  });

  test('loads a module through the Settings URL control and preserves it as a hash', async ({ page, diagnostics }) => {
    const markdown = readCanonicalFixture('navigationState.txt');
    await installAuthoringRoutes(page, diagnostics, {
      modules: { [TEST_MODULE_URL]: markdown },
    });
    await page.goto('/index.html');
    await waitForAuthoringReady(page);
    await openAuthoringSettings(page);

    await page.getByRole('textbox', { name: 'url', exact: true }).fill(TEST_MODULE_URL);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load' }),
      page.getByRole('button', { name: 'Load URL' }).click(),
    ]);
    await waitForAuthoringReady(page);

    await expect(page.locator('#markupTextArea')).toHaveValue(markdown);
    await expect(page.locator('#rendering form.question')).toHaveCount(4);
    expect(diagnostics.fulfilledExternalRequests).toContain(TEST_MODULE_URL);
    expect(decodeURIComponent(new URL(page.url()).hash)).toBe(`#${TEST_MODULE_URL}`);
  });

  test('honors query run/style/url parameters without exposing the authoring chrome', async ({ page, diagnostics }) => {
    const markdown = readCanonicalFixture('navigationState.txt');
    await installAuthoringRoutes(page, diagnostics, {
      modules: { [TEST_MODULE_URL]: markdown },
    });
    const query = new URLSearchParams({
      url: TEST_MODULE_URL,
      run: '',
      style: 'Style1.css',
    });

    await page.goto(`/index.html?${query}`);
    await waitForAuthoringReady(page);

    await expect(page.locator('#markupTextArea')).toHaveValue(markdown);
    await expect(page.locator('#logic')).toBeChecked();
    await expect(page.locator('#questNavbar')).toBeHidden();
    await expect(page.locator('#markup')).toBeHidden();
    await expect(page.locator('#renderText')).toBeHidden();
    await expect(page.locator('#rendering').locator('form.question.active')).toHaveCount(1);
    await expect(page.locator('#rendering').locator('..')).not.toHaveClass(/col-md-6/);
    await expect(page.locator('#pagelogic')).toHaveAttribute('href', 'Style1.css');
  });

  test('honors structured hash run/style parameters alongside a query module URL', async ({ page, diagnostics }) => {
    const markdown = readCanonicalFixture('navigationState.txt');
    await installAuthoringRoutes(page, diagnostics, {
      modules: { [TEST_MODULE_URL]: markdown },
    });

    await page.goto(
      `/index.html?url=${encodeURIComponent(TEST_MODULE_URL)}#run&style=Style1.css`,
    );
    await waitForAuthoringReady(page);

    await expect(page.locator('#markupTextArea')).toHaveValue(markdown);
    await expect(page.locator('#logic')).toBeChecked();
    await expect(page.locator('#questNavbar')).toBeHidden();
    await expect(page.locator('#markup')).toBeHidden();
    await expect(page.locator('#renderText')).toBeHidden();
    await expect(page.locator('#rendering form.question.active')).toHaveCount(1);
    await expect(page.locator('#pagelogic')).toHaveAttribute('href', 'Style1.css');
  });

  test('makes non-control query parameters available as previous results', async ({ page, diagnostics }) => {
    await installAuthoringRoutes(page, diagnostics, {
      modules: { [TEST_MODULE_URL]: CONDITIONAL_MARKDOWN },
    });
    const query = new URLSearchParams({
      url: TEST_MODULE_URL,
      run: '',
      style: 'Style1.css',
      config: 'host-only',
      EXTERNAL_FLAG: '1',
    });

    await page.goto(`/index.html?${query}`);
    await waitForAuthoringReady(page);
    await expect(page.locator('#rendering #START.active')).toBeVisible();
    await page.locator('#rendering #START button.next').click();

    await expect(page.locator('#rendering #VISIBLE.active')).toBeVisible();
    await expect(page.locator('#rendering #HIDDEN')).toHaveCount(0);
    await expect(page.locator('#jsonInput')).toHaveValue('');
  });

  test('loads Demo through URL state and clears that state after a manual edit', async ({ page, diagnostics }) => {
    const markdown = readCanonicalFixture('validation.txt');
    await installAuthoringRoutes(page, diagnostics, { demoMarkdown: markdown });
    await page.goto('/index.html');
    await waitForAuthoringReady(page);

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load' }),
      page.getByRole('link', { name: 'Demo' }).click(),
    ]);
    await waitForAuthoringReady(page);

    await expect(page.locator('#markupTextArea')).toHaveValue(markdown);
    expect(decodeURIComponent(new URL(page.url()).hash)).toBe(`#${DEMO_MODULE_URL}`);
    expect(new URL(page.url()).search).toBe('');

    const textarea = page.locator('#markupTextArea');
    await textarea.fill(`${markdown}\n[MANUAL_NOTE] Locally edited.`);
    await textarea.blur();

    await expect.poll(() => new URL(page.url()).hash).toBe('');
    expect(new URL(page.url()).search).toBe('');
    expect(new URL(page.url()).pathname).toMatch(/\/index\.html$/);
  });

  test('serves the locked Libre Baskerville authoring font without network access', async ({ page, diagnostics }) => {
    await installAuthoringRoutes(page, diagnostics);
    await page.goto('/index.html');
    await waitForAuthoringReady(page);

    const loaded = await page.evaluate(async () => {
      await document.fonts.load('16px "Libre Baskerville"');
      return {
        ready: document.fonts.check('16px "Libre Baskerville"'),
        family: getComputedStyle(document.querySelector('.text-baskerville')).fontFamily,
      };
    });

    expect(loaded.ready).toBe(true);
    expect(loaded.family).toContain('Libre Baskerville');
    expect(diagnostics.fulfilledExternalRequests).toContain(LIBRE_BASKERVILLE_STYLESHEET_URL);
    expect(diagnostics.fulfilledExternalRequests).toContain(LIBRE_BASKERVILLE_FONT_URL);
  });

  test('preserves the checked-in Bootstrap SRI contract while serving exact local assets', async ({ page, diagnostics }) => {
    await installAuthoringRoutes(page, diagnostics);
    await page.goto('/index.html');
    await waitForAuthoringReady(page);

    const stylesheet = page.locator(`link[href="${AUTHORING_BOOTSTRAP_CSS_URL}"]`);
    const script = page.locator(`script[src="${AUTHORING_BOOTSTRAP_JS_URL}"]`);
    await expect(stylesheet).toHaveAttribute(
      'integrity',
      'sha384-T3c6CoIi6uLrA9TneNEoa7RxnatzjcDSCmG1MXxSR1GAsXEV/Dwwykc2MPK8M2HN',
    );
    await expect(script).toHaveAttribute(
      'integrity',
      'sha384-C6RzsynM9kWDrMNeT87bh95OGNyZPhcTNXj1NW7RuBCsyN/o0jlpcV8Qyq46cDfL',
    );
    await expect(stylesheet).toHaveAttribute('crossorigin', 'anonymous');
    await expect(script).toHaveAttribute('crossorigin', 'anonymous');
    expect(await page.evaluate(() => typeof globalThis.bootstrap?.Modal)).toBe('function');
    expect(diagnostics.fulfilledExternalRequests).toEqual(expect.arrayContaining([
      AUTHORING_BOOTSTRAP_CSS_URL,
      AUTHORING_BOOTSTRAP_JS_URL,
    ]));
  });

  test('loads a module supplied as the legacy bare hash parameter', async ({ page, diagnostics }) => {
    const markdown = readCanonicalFixture('validation.txt');
    await installAuthoringRoutes(page, diagnostics, { demoMarkdown: markdown });

    await page.goto(`/index.html#${encodeURIComponent(DEMO_MODULE_URL)}`);
    await waitForAuthoringReady(page);

    await expect(page.locator('#markupTextArea')).toHaveValue(markdown);
    await expect(page.locator('#rendering form.question')).toHaveCount(2);
    expect(diagnostics.fulfilledExternalRequests).toContain(DEMO_MODULE_URL);
  });

  test('normalizes GitHub blob/raw paths and leaves raw-host URLs unchanged', async ({ page, diagnostics }) => {
    const markdown = readCanonicalFixture('validation.txt');
    await installAuthoringRoutes(page, diagnostics, {
      modules: { [GITHUB_RAW_MODULE_URL]: markdown },
    });

    await page.goto(`/index.html?url=${encodeURIComponent(GITHUB_BLOB_MODULE_URL)}`);
    await waitForAuthoringReady(page);
    await expect(page.locator('#markupTextArea')).toHaveValue(markdown);

    await page.goto(`/index.html?url=${encodeURIComponent(GITHUB_WEB_RAW_MODULE_URL)}`);
    await waitForAuthoringReady(page);
    await expect(page.locator('#markupTextArea')).toHaveValue(markdown);

    await page.goto(`/index.html?url=${encodeURIComponent(GITHUB_RAW_MODULE_URL)}`);
    await waitForAuthoringReady(page);
    await expect(page.locator('#markupTextArea')).toHaveValue(markdown);

    expect(
      diagnostics.fulfilledExternalRequests.filter((url) => url === GITHUB_RAW_MODULE_URL),
    ).toHaveLength(3);
    expect(diagnostics.fulfilledExternalRequests).not.toContain(GITHUB_BLOB_MODULE_URL);
    expect(diagnostics.fulfilledExternalRequests).not.toContain(GITHUB_WEB_RAW_MODULE_URL);
  });

  test('renders a deterministic error document for a non-200 module response', async ({ page, diagnostics }) => {
    await installAuthoringRoutes(page, diagnostics, {
      modules: {
        [HTTP_ERROR_MODULE_URL]: { status: 503, body: 'temporarily unavailable' },
      },
    });

    await page.goto(`/index.html?url=${encodeURIComponent(HTTP_ERROR_MODULE_URL)}`);
    await waitForAuthoringReady(page);

    await expect(page.locator('#markupTextArea')).toHaveValue(/Problem retrieving questionnaire module/);
    await expect(page.locator('#markupTextArea')).toHaveValue(/HTTP response code: 503/);
    expectAndClearConsoleErrors(
      diagnostics,
      [/Failed to fetch from .*not-found\.txt: 503/],
      { allowedPatterns: [/Failed to load resource/] },
    );
  });

  test('renders a deterministic error document for a rejected module request', async ({ page, diagnostics }) => {
    await installAuthoringRoutes(page, diagnostics, {
      modules: {
        [REJECTED_MODULE_URL]: { abort: 'failed' },
      },
    });

    await page.goto(`/index.html?url=${encodeURIComponent(REJECTED_MODULE_URL)}`);
    await waitForAuthoringReady(page);

    await expect(page.locator('#markupTextArea')).toHaveValue(/Error retrieving questionnaire module/);
    expectAndClearConsoleErrors(
      diagnostics,
      [/Error fetching module from .*rejected\.txt/],
      {
        allowedPatterns: [
          /Failed to load resource/,
          /NetworkError/,
          /Load failed/,
          /Cross-Origin Request Blocked/,
        ],
      },
    );
  });

  test('debounces rapid author edits and renders only the last scheduled markup', async ({ page, diagnostics }) => {
    await installAuthoringRoutes(page, diagnostics);
    await page.goto('/index.html');
    await waitForAuthoringReady(page);
    await page.clock.install();

    const textarea = page.locator('#markupTextArea');
    await textarea.fill('{"name":"FIRST_EDIT"}\n[FIRST] The discarded edit.');
    await textarea.dispatchEvent('keyup', { key: 'a' });
    await page.clock.fastForward(400);
    await textarea.fill('{"name":"SECOND_EDIT"}\n[SECOND] The final edit.');
    await textarea.dispatchEvent('keyup', { key: 'b' });
    await page.clock.fastForward(500);
    await expect(page.locator('#rendering #SECOND')).toBeVisible();
    await expect(page.locator('#rendering #FIRST')).toHaveCount(0);
  });

  test('applies language, markup visibility, font-size, and clearing controls', async ({ page, diagnostics }) => {
    await installAuthoringRoutes(page, diagnostics);
    await page.goto('/index.html');
    await waitForAuthoringReady(page);

    await openAuthoringSettings(page);
    await page.locator('#langSelect').selectOption('es');
    await page.getByRole('switch', { name: 'Hide Markup' }).check();
    await expect(page.locator('#markup')).toBeHidden();
    await expect(page.locator('#renderText')).toBeHidden();
    await page.getByRole('switch', { name: 'Hide Markup' }).uncheck();
    await expect(page.locator('#markup')).toBeVisible();
    await closeAuthoringSettings(page);

    await renderAuthoringMarkdown(page, readCanonicalFixture('runtimeControls.txt'));
    await expect(page.locator('#rendering #CHOICE button.next')).toContainText('Siguiente');

    const textarea = page.locator('#markupTextArea');
    const initialFontSize = await textarea.evaluate((element) => (
      Number.parseFloat(getComputedStyle(element).fontSize)
    ));
    await page.getByRole('button', { name: 'Increase Font Size' }).click();
    await expect.poll(() => textarea.evaluate((element) => (
      Number.parseFloat(getComputedStyle(element).fontSize)
    ))).toBe(initialFontSize + 1);
    await page.getByRole('button', { name: 'Decrease Font Size' }).click();
    await expect.poll(() => textarea.evaluate((element) => (
      Number.parseFloat(getComputedStyle(element).fontSize)
    ))).toBe(initialFontSize);

    await textarea.fill('');
    await textarea.dispatchEvent('keyup', { key: 'Backspace' });
    await expect(page.locator('#rendering form.question')).toHaveCount(0);
  });

  test('shows empty and populated response-table states without exposing treeJSON', async ({ page, diagnostics }) => {
    await installAuthoringRoutes(page, diagnostics);
    await page.goto('/index.html');
    await waitForAuthoringReady(page);

    await page.getByRole('button', { name: 'View Current Responses' }).click();
    await expect(page.locator('#currentResponsesTable')).toContainText('No responses found');
    await page.locator('#cache').getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('#cache')).not.toHaveClass(/show/);

    await renderAuthoringMarkdown(page, readCanonicalFixture('runtimeControls.txt'));
    await openAuthoringSettings(page);
    await page.getByRole('switch', { name: 'Activate Logic' }).check();
    await closeAuthoringSettings(page);
    await page.locator('#rendering #CHOICE input[type="radio"]').first().check();
    await page.locator('#rendering #CHOICE button.next').click();
    await expect(page.locator('#rendering #CHECKS.active')).toBeVisible();
    await page.getByRole('button', { name: 'View Current Responses' }).click();

    const table = page.locator('#currentResponsesTable');
    await expect(table.locator('thead')).toContainText('Id');
    await expect(table.locator('thead')).toContainText('Value');
    await expect(table.locator('tbody')).toContainText('CHOICE');
    await expect(table.locator('tbody')).not.toContainText('treeJSON');
  });
});

test.describe('cross-browser authoring storage and export boundaries @authoring', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      !DESKTOP_ENGINES.has(testInfo.project.name),
      'IndexedDB persistence, the injected LocalForage failure, and downloads run in each desktop browser engine.',
    );
  });

  test('uses a nonpersistent host adapter when LocalForage initialization fails @cross-browser-authoring', async ({ page, diagnostics }) => {
    await installAuthoringRoutes(page, diagnostics, {
      localForageMode: 'initialization-failure',
    });
    await page.goto('/index.html');
    await waitForAuthoringReady(page);
    expectAndClearConsoleErrors(diagnostics, [/Failed to initialize LocalForage/]);

    await openAuthoringSettings(page);
    await page.getByRole('switch', { name: 'Activate Logic' }).check();
    await closeAuthoringSettings(page);
    await renderAuthoringMarkdown(page, readCanonicalFixture('validation.txt'));

    await expect(page.locator('#rendering form.question.active')).toHaveCount(1);
    await expect(page.locator('#pagelogic')).toHaveAttribute('href', 'ActiveLogic.css');
    expectAndClearConsoleWarnings(diagnostics, [
      /Using memory for getItem \(LF fallback\): previousResults/,
      /Using memory for setItem \(LF fallback\): logic/,
    ]);

    await page.reload({ waitUntil: 'load' });
    await waitForAuthoringReady(page);
    expectAndClearConsoleErrors(diagnostics, [/Failed to initialize LocalForage/]);
    expectAndClearConsoleWarnings(diagnostics, [
      /Using memory for getItem \(LF fallback\): previousResults/,
    ]);
    await expect(page.locator('#logic')).not.toBeChecked();
    await expect(page.locator('#pagelogic')).toHaveAttribute('href', 'Default.css');
  });

  test('persists settings/results, rejects invalid JSON, and clears previous results @cross-browser-authoring', async ({ page, diagnostics }) => {
    await installAuthoringRoutes(page, diagnostics);
    await page.goto('/index.html');
    await waitForAuthoringReady(page);

    await openAuthoringSettings(page);
    await page.getByRole('switch', { name: 'Activate Logic' }).check();
    await page.getByRole('switch', { name: 'Use Styling' }).check();
    await page.getByRole('textbox', { name: 'json input' }).fill('{"PERSISTED":"yes"}');
    await page.getByRole('button', { name: 'Add JSON to Memory' }).click();
    await expect(page.locator('#loadDisplay')).toHaveText('Added JSON successfully.');

    await page.reload({ waitUntil: 'load' });
    await waitForAuthoringReady(page);
    await expect(page.locator('#logic')).toBeChecked();
    await expect(page.locator('#styling')).toBeChecked();
    await expect(page.locator('#jsonInput')).toHaveValue('{"PERSISTED":"yes"}');
    await expect(page.locator('#pagelogic')).toHaveAttribute('href', 'ActiveLogic.css');
    await expect(page.locator('#pagestyle')).toHaveAttribute('href', 'Style1.css');

    await openAuthoringSettings(page);
    await page.getByRole('textbox', { name: 'json input' }).fill('{not valid JSON');
    await page.getByRole('button', { name: 'Add JSON to Memory' }).click();
    await expect(page.locator('#loadDisplay')).toHaveText('Error: Invalid JSON format.');
    expectAndClearConsoleErrors(diagnostics, [/Error updating previous results/]);

    await page.getByRole('textbox', { name: 'json input' }).fill('');
    await page.getByRole('button', { name: 'Add JSON to Memory' }).click();
    await expect(page.locator('#loadDisplay')).toHaveText('Cleared previous results.');

    await page.getByRole('textbox', { name: 'json input' }).fill('{"CLEAR_ME":true}');
    await page.getByRole('button', { name: 'Add JSON to Memory' }).click();
    await page.getByRole('button', { name: 'Clear Memory' }).click();
    await expect(page.locator('#loadDisplay')).toHaveText('Previous results cleared successfully');
    await expect(page.locator('#jsonInput')).toHaveValue('');

    await page.reload({ waitUntil: 'load' });
    await waitForAuthoringReady(page);
    await expect(page.locator('#jsonInput')).toHaveValue('');
    await expect(page.locator('#logic')).toBeChecked();
    await expect(page.locator('#styling')).toBeChecked();
  });

  test('stores settings and previous results in the explicit questParams IndexedDB database', async ({ page, diagnostics }) => {
    await installAuthoringRoutes(page, diagnostics);
    await page.goto('/index.html');
    await waitForAuthoringReady(page);

    await openAuthoringSettings(page);
    await page.getByRole('switch', { name: 'Activate Logic' }).check();
    await page.getByRole('switch', { name: 'Use Styling' }).check();
    await page.getByRole('textbox', { name: 'json input' }).fill('{"IDB":"verified"}');
    await page.getByRole('button', { name: 'Add JSON to Memory' }).click();

    let storage;
    await expect.poll(async () => {
      storage = await readQuestParamsIndexedDb(page);
      return storage.records;
    }).toEqual({
      logic: true,
      styling: true,
      previousResults: '{"IDB":"verified"}',
    });
    expect(storage.supportsDatabaseEnumeration).toBe(true);
    expect(storage.databases.map((database) => database.name)).toContain('questParams');
    expect(storage.objectStores).toContain('params');
  });

  test('downloads the exact authored markup under the requested export name', async ({ page, diagnostics }) => {
    const markdown = readCanonicalFixture('navigationState.txt');
    await installAuthoringRoutes(page, diagnostics);
    await page.goto('/index.html');
    await waitForAuthoringReady(page);
    await renderAuthoringMarkdown(page, markdown);
    await openAuthoringSettings(page);
    await page.getByRole('textbox', { name: 'File Name' }).fill('quest-export.txt');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Save', exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('quest-export.txt');

    const chunks = [];
    const stream = await download.createReadStream();
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString('utf8')).toBe(markdown);
  });
});
