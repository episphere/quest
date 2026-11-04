import { test, expect } from './support/test.js';
import {
  activeQuestion,
  expectHealthyHarness,
  flushHarness,
  goBack,
  goNext,
  harnessSnapshot,
  openParticipant,
} from './support/harness.js';
import { readLockedMarkdown, treeAt } from './support/corpus.js';
import en from '../../i18n/en.js';
import es from '../../i18n/es.js';

const DESKTOP_ENGINES = new Set([
  'chromium-desktop',
  'firefox-desktop',
  'webkit-desktop',
  'chromium-windows-ua',
]);
const DAILY_CHOICE = '706062016';
const WEEKLY_CHOICE = '594557208';
const QUESTION_ID = 'D_285545471';
const NUMBER_ID = 'D_936382173';
const BEVERAGE_RESPONSES = {
  D_831438612: ['863839736', '531671855', '525375987', '995797773', '431441193'],
};
const LOCALES = {
  en: { caption: 'times per day', translations: en },
  es: { caption: 'veces al día', translations: es },
};

function rangeDescription(locale) {
  const { translations } = LOCALES[locale];
  return [
    translations.validationNumberGreaterThan.replace('{0}', '0'),
    translations.validationNumberLessThan.replace('{0}', '999'),
  ].join('. ');
}

async function openTapWaterQuestion(page, locale) {
  return openParticipant(page, {
    markdown: readLockedMarkdown('module4', locale),
    lang: locale,
    previousResults: { age: '45' },
    persistedData: { ...BEVERAGE_RESPONSES, treeJSON: treeAt(QUESTION_ID) },
  });
}

async function expectScopedControls(question, locale) {
  const radio = question.locator(`input[type="radio"][value="${DAILY_CHOICE}"]`);
  const label = question.locator(`label[for="${await radio.getAttribute('id')}"]`);
  const number = question.locator(`[id="${NUMBER_ID}"]`);
  const hint = question.locator('[data-quest-number-description]');
  const caption = label.locator(':scope > [data-quest-choice-caption]');

  await expect(radio).toHaveAccessibleName(LOCALES[locale].caption);
  await expect(number).toHaveAccessibleName(LOCALES[locale].caption);
  await expect(number).toHaveAccessibleDescription(rangeDescription(locale));
  await expect(hint).toBeHidden();

  return { radio, label, number, caption };
}

function choiceValidationMarkdown(type) {
  const choice = type === 'radio' ? '(1)' : '[1]';
  return `{"name":"TEST_SELECTED_VALIDATION_STYLE"}
[CHOICE?] ${es.enterValue}
${choice} ${LOCALES.es.caption} |__|__|id=CHOICE_COUNT min=0 max=999|

[END,end] Complete.`;
}

async function validationGeometry(message) {
  return message.evaluate((element) => {
    const label = element.closest('label').getBoundingClientRect();
    const box = element.getBoundingClientRect();
    const text = element.firstElementChild;
    const range = document.createRange();
    range.selectNodeContents(text);
    const textRects = Array.from(range.getClientRects());
    const withinLabel = (rect) => rect.left >= label.left - 1
      && rect.right <= label.right + 1
      && rect.top >= label.top - 1
      && rect.bottom <= label.bottom + 1;
    const luminance = (color) => color.match(/[\d.]+/g).slice(0, 3)
      .map((component) => {
        const value = Number(component) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const foreground = luminance(getComputedStyle(text).color);
    const background = luminance(getComputedStyle(element).backgroundColor);
    return {
      contrast: (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05),
      boxFits: withinLabel(box),
      textFits: textRects.length > 0 && textRects.every(withinLabel),
      textLineCount: textRects.length,
    };
  });
}

async function expectNormalValidationBackplate(label, message) {
  await expect(label).toHaveCSS('background-color', 'rgb(60, 145, 222)');
  await expect(message).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(message.locator(':scope > span')).toHaveCSS('color', 'rgb(193, 18, 31)');
  const geometry = await validationGeometry(message);
  expect(geometry.contrast).toBeGreaterThanOrEqual(4.5);
  expect(geometry.boxFits).toBe(true);
  expect(geometry.textFits).toBe(true);
}

test.describe('locked tap-water choice and number descriptions @canonical @corpus', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      !DESKTOP_ENGINES.has(testInfo.project.name),
      'Native names, descriptions, and response state run in the desktop browser matrix; speech remains a manual AT check.',
    );
  });

  // The six production variants share this label structure. Check the distinct
  // EN/ES caption positions on one representative real question per language.
  for (const locale of ['en', 'es']) {
    test(`keeps the ${locale} daily choice separate from number limits, entered values, and validation`, async ({ page }) => {
      await openTapWaterQuestion(page, locale);
      const question = activeQuestion(page, QUESTION_ID);
      const { radio, number, caption, label } = await expectScopedControls(question, locale);
      const announcer = page.locator('#ariaLiveSelectionAnnouncer');
      await expect(number).toHaveValue('');
      await expect(radio).not.toBeChecked();
      await caption.click();
      await expect(announcer).toHaveText(`${LOCALES[locale].caption} Selected.`);
      await number.fill('3');
      await number.press('Tab');
      await expect(radio).toHaveAccessibleName(LOCALES[locale].caption);
      await expect(number).toHaveValue('3');
      await expect(number).toHaveAccessibleDescription(rangeDescription(locale));

      // Start from another choice so invalid entry must generate a fresh daily
      // selection announcement, rather than passing on the earlier message.
      const weeklyLabel = question.locator(`label[for="${QUESTION_ID}_${WEEKLY_CHOICE}"]`);
      await weeklyLabel.click();
      await expect(announcer).toHaveText(`${(await weeklyLabel.textContent()).trim()} Selected.`);
      await number.fill('1000');
      await number.press('Tab');
      const maxError = LOCALES[locale].translations.validationNumberLessThan.replace('{0}', '999');
      await expect(number).toHaveAttribute('aria-invalid', 'true');
      await expect(label.locator('.validation-container')).toHaveText(maxError);
      await expect(number).toHaveAccessibleDescription(`${rangeDescription(locale)} ${maxError}`);
      await expect(radio).toBeChecked();
      await expectNormalValidationBackplate(label, label.locator('.validation-container'));
      await expect(radio).toHaveAccessibleName(LOCALES[locale].caption);
      await expect(announcer).toHaveText(`${LOCALES[locale].caption} Selected.`);
      await number.fill('3');
      await number.press('Tab');
      await expect(question.locator('.validation-container')).toHaveCount(0);
      await expect(number).not.toHaveAttribute('aria-invalid');
      await expectScopedControls(question, locale);
      await expectHealthyHarness(page);
    });
  }

  test('preserves daily typing, switching, filled-number reset, host payload, Back, and persisted reload', async ({ page }) => {
    await openTapWaterQuestion(page, 'en');
    let question = activeQuestion(page, QUESTION_ID);
    let { radio, number, caption } = await expectScopedControls(question, 'en');
    const response = { [QUESTION_ID]: DAILY_CHOICE, [NUMBER_ID]: '3' };

    await caption.click();
    await number.fill('3');
    await number.press('Tab');
    await expect(radio).toBeChecked();
    expect((await harnessSnapshot(page)).state.active[QUESTION_ID]).toEqual(response);

    await question.locator(`label[for="${QUESTION_ID}_${WEEKLY_CHOICE}"]`).click();
    await expect(number).toHaveValue('');
    await expect(radio).not.toBeChecked();
    expect((await harnessSnapshot(page)).state.active[QUESTION_ID]).toEqual({ [QUESTION_ID]: WEEKLY_CHOICE });
    await number.fill('2');
    await number.press('Tab');
    await expect(radio).toBeChecked();
    await expect(number).toHaveValue('2');
    await question.getByRole('button', { name: 'Reset this answer' }).click();
    await expect(question.locator('input[type="radio"]:checked')).toHaveCount(0);
    await expect(number).toHaveValue('');
    // The existing reset path can retain an undefined deletion tombstone.
    expect((await harnessSnapshot(page)).state.active[QUESTION_ID]).toBeUndefined();

    // Typing into the unchanged nested number field still selects its own
    // response through the existing focusout path.
    await number.fill('3');
    await number.press('Tab');
    await expect(radio).toBeChecked();
    expect((await harnessSnapshot(page)).state.active[QUESTION_ID]).toEqual(response);
    await goNext(page);
    await flushHarness(page);
    await expect(activeQuestion(page, 'D_831438612')).toBeVisible();
    const committed = await expectHealthyHarness(page);
    expect(committed.logs.storeCalls).toHaveLength(1);
    const changes = committed.logs.storeCalls[0].changes;
    expect(changes).toEqual({
      [`D_716117817.${QUESTION_ID}`]: response,
      'D_716117817.treeJSON': expect.any(String),
    });
    expect(committed.state.survey[QUESTION_ID]).toEqual(response);

    await goBack(page);
    question = activeQuestion(page, QUESTION_ID);
    ({ radio, number } = await expectScopedControls(question, 'en'));
    await expect(radio).toBeChecked();
    await expect(number).toHaveValue('3');

    // Use the same response and tree written to the host, not a rewritten
    // response schema or a synthetic replacement questionnaire.
    await openParticipant(page, {
      markdown: readLockedMarkdown('module4', 'en'),
      lang: 'en',
      previousResults: { age: '45' },
      persistedData: {
        ...BEVERAGE_RESPONSES,
        [QUESTION_ID]: changes[`D_716117817.${QUESTION_ID}`],
        treeJSON: changes['D_716117817.treeJSON'],
      },
    });
    question = activeQuestion(page, QUESTION_ID);
    ({ radio, number } = await expectScopedControls(question, 'en'));
    await expect(radio).toBeChecked();
    await expect(number).toHaveValue('3');
    expect((await harnessSnapshot(page)).state.active[QUESTION_ID]).toEqual(response);
    await expectHealthyHarness(page);
  });

  test('keeps selected checkbox validation readable and contained at a 320px viewport without styling unselected messages', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await openParticipant(page, { markdown: choiceValidationMarkdown('checkbox'), lang: 'es' });
    const question = activeQuestion(page, 'CHOICE');
    const checkbox = question.getByRole('checkbox', { name: LOCALES.es.caption, exact: true });
    const label = question.locator('label[for="CHOICE_1"]');
    const number = question.locator('#CHOICE_COUNT');
    await label.locator('[data-quest-choice-caption]').click();
    await number.fill('1000');
    await number.press('Tab');
    await expect(checkbox).toBeChecked();
    const message = label.locator('.validation-container');
    await expect(message).toHaveText(es.validationNumberLessThan.replace('{0}', '999'));
    await expectNormalValidationBackplate(label, message);
    expect((await validationGeometry(message)).textLineCount).toBeGreaterThan(1);
    await expect(checkbox).toHaveAccessibleName(LOCALES.es.caption);

    // Isolate CSS selection scope while retaining the same error node. Normal
    // checkbox change handling clears that node, so do not dispatch a change.
    await checkbox.evaluate((element) => { element.checked = false; });
    await expect(message).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(message.locator(':scope > span')).toHaveCSS('color', 'rgb(193, 18, 31)');
    await expectHealthyHarness(page);
  });

  test('uses system validation colors within selected radio and checkbox tiles in forced-colors mode', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'System-palette rendering is checked once in Chromium.');
    await page.emulateMedia({ forcedColors: 'active' });
    for (const type of ['radio', 'checkbox']) {
      await openParticipant(page, { markdown: choiceValidationMarkdown(type), lang: 'es' });
      const question = activeQuestion(page, 'CHOICE');
      const choice = question.getByRole(type, { name: LOCALES.es.caption, exact: true });
      const label = question.locator('label[for="CHOICE_1"]');
      const number = question.locator('#CHOICE_COUNT');
      await label.locator('[data-quest-choice-caption]').click();
      await number.fill('1000');
      await number.press('Tab');
      const message = label.locator('.validation-container');
      await expect(message).toHaveText(es.validationNumberLessThan.replace('{0}', '999'));
      const palette = await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.cssText = 'position:absolute;forced-color-adjust:none;color:CanvasText;background-color:Canvas;border:1px solid Highlight';
        document.body.appendChild(probe);
        const style = getComputedStyle(probe);
        const colors = { text: style.color, canvas: style.backgroundColor, highlight: style.borderTopColor };
        probe.remove();
        return colors;
      });
      await expect(choice).toBeChecked();
      await expect(choice).toHaveAccessibleName(LOCALES.es.caption);
      await expect(label).toHaveCSS('forced-color-adjust', 'none');
      await expect(label).toHaveCSS('background-color', palette.highlight);
      await expect(message).toHaveCSS('forced-color-adjust', 'auto');
      await expect(message).toHaveCSS('background-color', palette.canvas);
      await expect(message.locator(':scope > span')).toHaveCSS('color', palette.text);
      const geometry = await validationGeometry(message);
      expect(geometry.boxFits).toBe(true);
      expect(geometry.textFits).toBe(true);
      await expectHealthyHarness(page);
    }
  });
});
