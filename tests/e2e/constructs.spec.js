import { test, expect, expectAndClearConsoleWarnings } from './support/test.js';
import { expectHealthyHarness, readCanonicalFixture } from './support/harness.js';

const DESKTOP_ENGINES = new Set(['chromium-desktop', 'firefox-desktop', 'webkit-desktop']);

test.describe('canonical Markdown construct renderer @canonical @constructs', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      !DESKTOP_ENGINES.has(testInfo.project.name),
      'The construct renderer is checked in all three desktop browser engines.',
    );
  });

  test('renders every supported question/control family through the public API', async ({ page, diagnostics }) => {
    await page.goto('/tests/harness/participant.html');
    await page.waitForFunction(() => window.questHarness?.ready === true);

    const renderResult = await page.evaluate((markdown) => window.questHarness.render({
      activate: false,
      isRenderer: true,
      markdown,
      previousResults: {
        LIST_VALUE: ['one', 'two'],
        SAVED: 'restored',
        SHOW_BLOCK: '1',
        SHOW_CHECKBOX: '1',
        SHOW_GRID: '1',
        SHOW_INLINE: '1',
        SHOW_RADIO: '1',
        SHOW_ROW: '1',
      },
    }), readCanonicalFixture('allConstructs.txt'));

    expect(renderResult.result).toBe(true);
    const root = page.locator('#questionnaireRoot');

    await expect(root.locator('form.question')).toHaveCount(31);
    await expect(root.locator('#PLAIN [data-bs-toggle="popover"]')).toHaveAttribute('data-bs-content', 'Synthetic help text');
    await expect(root.locator('#PLAIN img')).toHaveAttribute('src', 'https://episphere.github.io/quest/images/FemaleBaldness1.png');
    await expect(root.locator('#PLAIN .displayif')).toHaveCount(2);
    await expect(root.locator('#PLAIN .displayList')).toHaveCount(2);

    await expect(root.locator('#RADIO input[type="radio"]')).toHaveCount(2);
    await expect(root.locator('#CHECKBOX input[type="checkbox"]')).toHaveCount(3);
    await expect(root.locator('#CHECKBOX')).toHaveAttribute('data-min-count', '1');
    await expect(root.locator('#CHECKBOX')).toHaveAttribute('data-max-count', '2');
    await expect(root.locator('#CHECKBOX input[data-reset="true"]')).toHaveCount(1);
    await expect(root.locator('#COMBINED #COMBINED_807835037')).toHaveAttribute('type', 'checkbox');
    await expect(root.locator('#COMBINED #COMBINED_807835037')).toHaveAttribute('skipto', 'EMAIL');
    await expect(root.locator('#COMBINED #COMBINED_TEXT')).toHaveAttribute('type', 'text');
    await expect(root.locator('#COMBINED_TEXTAREA #COMBINED_TEXTAREA_GROUP_1')).toHaveAttribute('type', 'radio');
    await expect(root.locator('#COMBINED_TEXTAREA #COMBINED_TEXTAREA_GROUP_1')).toHaveAttribute('skipto', 'EMAIL');
    await expect(root.locator('#COMBINED_TEXTAREA #COMBINED_TEXTAREA_VALUE')).toHaveJSProperty('tagName', 'TEXTAREA');
    await expect(root.locator('#COMBINED_TEXTAREA label[for="COMBINED_TEXTAREA_GROUP_1"] #COMBINED_TEXTAREA_VALUE')).toHaveCount(1);
    await expect(root.locator('#CONFIRM #CONFIRM_COPY')).not.toHaveAttribute('confirm');
    await expect(root.locator('#CONFIRM #CONFIRM_COPY')).toHaveAttribute('data-confirm', 'CONFIRM_ORIGINAL');
    await expect(root.locator('#CONFIRM #CONFIRM_ORIGINAL')).toHaveAttribute('data-confirmation-for', 'CONFIRM_COPY');

    const scalarControls = {
      EMAIL_VALUE: { type: 'email', name: 'Email address' },
      PHONE_VALUE: { type: 'tel', name: 'Telephone' },
      FULL_SSN_VALUE: { type: 'text', name: 'Full SSN' },
      SHORT_SSN_VALUE: { type: 'text', name: 'Last four SSN digits' },
      ZIP_VALUE: { type: 'text', name: 'ZIP code' },
      DATE_VALUE: { type: 'date', name: 'Date' },
      MONTH_VALUE: { type: 'month', name: 'Month' },
      NUMBER_VALUE: { type: 'number', name: 'Number' },
      TEXT_VALUE: { type: 'text', name: 'Text before, text after.' },
      TEXTBOX_VALUE: { type: 'text', name: 'Text-box macro' },
    };
    for (const [id, { type, name }] of Object.entries(scalarControls)) {
      await expect(root.locator(`#${id}`), `${id} should render as ${type}`).toHaveAttribute('type', type);
      await expect(root.locator(`#${id}`), `${id} should retain its caption`).toHaveAttribute('aria-label', name);
    }
    await expect(root.locator('#TIME_VALUE')).toHaveAttribute('type', 'time');
    await expect(root.locator('#TIME_VALUE')).not.toHaveAttribute('aria-label');
    await expect(root.locator('label[for="TIME_VALUE"]')).toHaveText('Time');
    await expect(root.locator('#STATE_VALUE')).toHaveJSProperty('tagName', 'SELECT');
    await expect(root.locator('#STATE_VALUE')).toHaveAttribute('aria-label', 'State');
    await expect(root.locator('#TEXTAREA_VALUE')).toHaveJSProperty('tagName', 'TEXTAREA');
    await expect(root.locator('#TEXTAREA_VALUE')).toHaveAttribute('aria-label', 'Long answer');
    await expect(root.locator('#HIDDEN_VALUE')).toHaveAttribute('data-hidden', 'true');
    await expect(root.locator('#YES_NO input[type="radio"]')).toHaveCount(2);
    await expect(root.locator('#YES_NO_PREFER input[type="radio"]')).toHaveCount(3);

    await expect(root.locator('#DEFAULT_SKIP input[type="hidden"][skipto="GRID_RADIO"]')).toHaveCount(1);
    await expect(root.locator('#NO_RESPONSE_SKIP input.noresponse[skipto="GRID_RADIO"]')).toHaveCount(1);
    await expect(root.locator('#GRID_RADIO input[type="radio"]')).toHaveCount(4);
    await expect(root.locator('#GRID_CHECKBOX input[type="checkbox"]')).toHaveCount(2);
    const rendererGridRadio = root.locator('#GRID_RADIO #GRID_ROW_A_0');
    const rendererGridCheckbox = root.locator('#GRID_CHECKBOX #GRID_CHECK_ROW_0');
    await expect(rendererGridRadio).not.toHaveAttribute('aria-labelledby');
    await expect(rendererGridRadio.locator('xpath=following-sibling::label')).toHaveText('First row Never');
    await expect(rendererGridCheckbox.locator('xpath=following-sibling::label')).toHaveText('A row Alpha');
    expect(await rendererGridRadio.evaluate((element) => element.labels?.length ?? 0)).toBe(1);
    expect(await rendererGridCheckbox.evaluate((element) => element.labels?.length ?? 0)).toBe(1);
    await expect(root.locator('form.question[id^="LOOP_ITEM_"]')).toHaveCount(2);

    expect(diagnostics.fulfilledExternalRequests).toContain(
      'https://episphere.github.io/quest/images/FemaleBaldness1.png',
    );
    expectAndClearConsoleWarnings(diagnostics, [
      /confirm element found: CONFIRM_ORIGINAL/,
      /confirm element found \(otherElement\):/,
    ]);
    await expectHealthyHarness(page);
  });
});
