import { test, expect } from './support/test.js';
import {
  activeQuestion,
  expectHealthyHarness,
  flushHarness,
  goBack,
  goNext,
  harnessSnapshot,
  openParticipant,
  waitInHarness,
} from './support/harness.js';
import { readLockedMarkdown, treeAt } from './support/corpus.js';

const NATIVE_KEYBOARD_PROJECTS = new Set([
  'chromium-desktop',
  'firefox-desktop',
  'webkit-desktop',
  'chromium-windows-ua',
]);

// Playwright WebKit does not model Safari's Full Keyboard Access preference.
// The corresponding Safari traversal is covered by the manual protocol.
const TAB_PROJECTS = new Set([
  'chromium-desktop',
  'firefox-desktop',
  'chromium-windows-ua',
]);

const TEXTAREA_KEYBOARD_MARKDOWN = `{"name":"TEST_TEXTAREA_KEYBOARD"}

[NOTES?] Please enter two short notes.
|___|notes|

[END,end] Complete.`;

const LINK_KEYBOARD_MARKDOWN = `{"name":"TEST_LINK_KEYBOARD"}

[LINK] Review <a id="quest_keyboard_link" href="#quest_keyboard_target">keyboard help</a>.
<span id="quest_keyboard_target">Keyboard help target.</span>`;

const CHOICE_LINKED_TEXTAREA_MARKDOWN = `{"name":"TEST_CHOICE_LINKED_TEXTAREA"}

[OTHER?] Choose an option and add details if needed.
(1:OTHER_GROUP|OTHER_LABEL) Other details <textarea id="OTHER_TEXT"></textarea>
(2) No additional details

[END,end] Complete.`;

async function tabUntil(page, predicate, maximumPresses = 12) {
  const path = [];

  for (let press = 0; press < maximumPresses; press += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.id ?? null);
    path.push(focused);
    if (await predicate(focused)) return path;
  }

  throw new Error(`Focus did not reach the expected control after ${maximumPresses} Tab presses: ${JSON.stringify(path)}`);
}

async function tabUntilAction(page, clickType, maximumPresses = 12) {
  const path = [];

  for (let press = 0; press < maximumPresses; press += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => ({
      id: document.activeElement?.id ?? null,
      clickType: document.activeElement?.dataset?.clickType ?? null,
    }));
    path.push(focused);
    if (focused.clickType === clickType) return path;
  }

  throw new Error(`Focus did not reach the ${clickType} action after ${maximumPresses} Tab presses: ${JSON.stringify(path)}`);
}

async function pressSpace(page, control) {
  await control.focus();
  await expect(control).toBeFocused();
  await page.keyboard.press('Space');
  await waitInHarness(page, 150);
}

async function expectGridFocusIndicatorUnclipped(label) {
  const geometry = await label.evaluate((element) => {
    const labelStyle = getComputedStyle(element);
    const markerStyle = getComputedStyle(element, '::before');
    const pixels = (value) => Number.parseFloat(value) || 0;
    const markerWidth = pixels(markerStyle.width)
      + (markerStyle.boxSizing === 'border-box'
        ? 0
        : pixels(markerStyle.borderLeftWidth) + pixels(markerStyle.borderRightWidth));
    const markerHeight = pixels(markerStyle.height)
      + (markerStyle.boxSizing === 'border-box'
        ? 0
        : pixels(markerStyle.borderTopWidth) + pixels(markerStyle.borderBottomWidth));
    const focusExtent = Math.max(
      0,
      pixels(markerStyle.outlineWidth) + pixels(markerStyle.outlineOffset),
    );
    const labelRect = element.getBoundingClientRect();
    const markerCenterX = labelRect.left + (labelRect.width / 2);
    const markerCenterY = labelRect.top + (labelRect.height / 2);
    const paintBounds = {
      left: markerCenterX - (markerWidth / 2) - focusExtent,
      right: markerCenterX + (markerWidth / 2) + focusExtent,
      top: markerCenterY - (markerHeight / 2) - focusExtent,
      bottom: markerCenterY + (markerHeight / 2) + focusExtent,
    };
    const clippingAncestors = [];
    let ancestor = element.parentElement;

    while (ancestor) {
      const style = getComputedStyle(ancestor);
      const clipsX = ['hidden', 'clip', 'scroll', 'auto'].includes(style.overflowX);
      const clipsY = ['hidden', 'clip', 'scroll', 'auto'].includes(style.overflowY);
      if (clipsX || clipsY) {
        const rect = ancestor.getBoundingClientRect();
        clippingAncestors.push({
          tagName: ancestor.tagName,
          id: ancestor.id,
          className: ancestor.className,
          clipsX,
          clipsY,
          containsX: !clipsX
            || (paintBounds.left >= rect.left - 0.5 && paintBounds.right <= rect.right + 0.5),
          containsY: !clipsY
            || (paintBounds.top >= rect.top - 0.5 && paintBounds.bottom <= rect.bottom + 0.5),
        });
      }
      ancestor = ancestor.parentElement;
    }

    return {
      focusPaintWidth: markerWidth + (2 * focusExtent),
      focusPaintHeight: markerHeight + (2 * focusExtent),
      labelWidth: labelRect.width,
      labelHeight: labelRect.height,
      overflowX: labelStyle.overflowX,
      overflowY: labelStyle.overflowY,
      clippingAncestors,
    };
  });

  expect(
    geometry.overflowX === 'visible'
      || geometry.labelWidth + 0.5 >= geometry.focusPaintWidth,
    `Grid focus indicator is horizontally clipped: ${JSON.stringify(geometry)}`,
  ).toBe(true);
  expect(
    geometry.overflowY === 'visible'
      || geometry.labelHeight + 0.5 >= geometry.focusPaintHeight,
    `Grid focus indicator is vertically clipped: ${JSON.stringify(geometry)}`,
  ).toBe(true);
  expect(
    geometry.clippingAncestors.every(({ containsX, containsY }) => containsX && containsY),
    `A grid ancestor clips the focus indicator: ${JSON.stringify(geometry)}`,
  ).toBe(true);
}

async function openPlainTextarea(page) {
  await openParticipant(page, { markdown: TEXTAREA_KEYBOARD_MARKDOWN });
  const textarea = activeQuestion(page, 'NOTES').locator('#notes');
  await textarea.fill('first\nsecond');
  return textarea;
}

async function textareaSelectionState(textarea) {
  return textarea.evaluate((element) => ({
    focused: document.activeElement === element,
    start: element.selectionStart,
    end: element.selectionEnd,
  }));
}

test.describe('native participant keyboard navigation @canonical @keyboard @windows-a11y', () => {
  test('native textarea ArrowDown retains focus and moves the multiline caret', async ({ page }, testInfo) => {
    test.skip(!NATIVE_KEYBOARD_PROJECTS.has(testInfo.project.name), 'The native textarea contract runs in every desktop engine and the Windows browser branch.');

    const textarea = await openPlainTextarea(page);
    await textarea.focus();
    await textarea.evaluate((element) => element.setSelectionRange(0, 0));
    await expect(textarea).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await waitInHarness(page, 25);

    const state = await textareaSelectionState(textarea);
    expect(state.focused).toBe(true);
    expect(state.start).toBeGreaterThan(0);
    expect(state.end).toBe(state.start);
  });

  test('native textarea ArrowUp retains focus and moves the multiline caret', async ({ page }, testInfo) => {
    test.skip(!NATIVE_KEYBOARD_PROJECTS.has(testInfo.project.name), 'The native textarea contract runs in every desktop engine and the Windows browser branch.');

    const textarea = await openPlainTextarea(page);
    await textarea.focus();
    await textarea.evaluate((element) => element.setSelectionRange(6, 6));
    await expect(textarea).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await waitInHarness(page, 25);

    const state = await textareaSelectionState(textarea);
    expect(state.focused).toBe(true);
    expect(state.start).toBe(0);
    expect(state.end).toBe(0);
  });

  test('standalone textarea Reset clears its visible value and active response with native keyboard activation', async ({ page }, testInfo) => {
    test.skip(!NATIVE_KEYBOARD_PROJECTS.has(testInfo.project.name), 'The textarea Reset contract runs in every desktop engine and the Windows browser branch.');

    await openParticipant(page, {
      markdown: TEXTAREA_KEYBOARD_MARKDOWN,
      persistedData: {
        NOTES: 'Previously stored notes',
        treeJSON: JSON.stringify({
          rootNode: { value: null, children: [{ value: 'NOTES?', children: [] }] },
          currentNode: 'NOTES?',
        }),
      },
    });
    const question = activeQuestion(page, 'NOTES');
    const textarea = question.locator('#notes');
    const reset = question.getByRole('button', { name: 'Reset this answer' });
    await expect(textarea).toHaveValue('Previously stored notes');

    for (const [key, value] of [
      ['Enter', 'Clear this response with Enter'],
      ['Space', 'Clear this response with Space'],
    ]) {
      await textarea.fill(value);
      await textarea.blur();
      expect((await harnessSnapshot(page)).state.active.NOTES).toBe(value);

      await reset.focus();
      await expect(reset).toBeFocused();
      await page.keyboard.press(key);
      await expect(textarea).toHaveValue('');
      await expect(reset).toBeFocused();
      expect((await harnessSnapshot(page)).state.active.NOTES).toBeUndefined();
    }

    await goNext(page);
    await page.getByRole('button', { name: 'Continue Without Answering' }).click();
    await expect(activeQuestion(page, 'END')).toBeVisible();
    const snapshot = await expectHealthyHarness(page);
    const deletion = snapshot.logs.storeCalls.findLast(({ changes }) => (
      Object.hasOwn(changes, 'TEST_TEXTAREA_KEYBOARD.NOTES')
    ));
    expect(deletion.changes['TEST_TEXTAREA_KEYBOARD.NOTES']).toBeUndefined();
  });

  test('choice-linked textarea arrows remain native and move its multiline caret', async ({ page }, testInfo) => {
    test.skip(!NATIVE_KEYBOARD_PROJECTS.has(testInfo.project.name), 'The native textarea contract runs in every desktop engine and the Windows browser branch.');

    await openParticipant(page, { markdown: CHOICE_LINKED_TEXTAREA_MARKDOWN });
    const textarea = activeQuestion(page, 'OTHER').locator('#OTHER_TEXT');
    await textarea.fill('first\nsecond');
    await textarea.focus();
    await textarea.evaluate((element) => element.setSelectionRange(0, 0));
    await page.evaluate(() => {
      const root = document.querySelector('#questionnaireRoot');
      root.addEventListener('keydown', (event) => {
        if (event.target.id === 'OTHER_TEXT') {
          root.dataset.lastOtherArrow = JSON.stringify({
            defaultPrevented: event.defaultPrevented,
            activeId: document.activeElement?.id ?? null,
          });
        }
      }, { once: true });
    });

    await page.keyboard.press('ArrowDown');
    await waitInHarness(page, 25);

    const state = await textareaSelectionState(textarea);
    expect(state.focused).toBe(true);
    expect(state.start).toBeGreaterThan(0);
    expect(await page.locator('#questionnaireRoot').evaluate((root) => (
      JSON.parse(root.dataset.lastOtherArrow)
    ))).toEqual({ defaultPrevented: false, activeId: 'OTHER_TEXT' });
  });

  test('native links activate with Enter inside the Quest event boundary', async ({ page }, testInfo) => {
    test.skip(!NATIVE_KEYBOARD_PROJECTS.has(testInfo.project.name), 'The native link contract runs in every desktop engine and the Windows browser branch.');

    await openParticipant(page, { markdown: LINK_KEYBOARD_MARKDOWN });
    const link = activeQuestion(page, 'LINK').getByRole('link', { name: 'keyboard help' });
    await link.focus();
    await expect(link).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#quest_keyboard_target');
  });

  test('keyboard radio selection keeps focus, exclusivity, state, storage, and Back restoration', async ({ page }, testInfo) => {
    test.skip(!NATIVE_KEYBOARD_PROJECTS.has(testInfo.project.name), 'The native control contract runs in every desktop engine and the Windows browser branch.');

    await openParticipant(page);
    const question = activeQuestion(page, 'CHOICE');
    const first = question.locator('#CHOICE_1');
    const second = question.locator('#CHOICE_2');

    await pressSpace(page, first);
    await expect(first).toBeChecked();
    await expect(second).not.toBeChecked();
    await expect(first).toBeFocused();

    await page.keyboard.press('ArrowRight');
    await waitInHarness(page, 150);
    await expect(first).not.toBeChecked();
    await expect(second).toBeChecked();
    await expect(second).toBeFocused();

    // Both horizontal and vertical native radio arrows are part of #1587.
    // Do not lock browser-specific wraparound behavior at the group edges.
    await page.keyboard.press('ArrowUp');
    await waitInHarness(page, 150);
    await expect(first).toBeChecked();
    await expect(second).not.toBeChecked();
    await expect(first).toBeFocused();

    expect((await harnessSnapshot(page)).state.active).toMatchObject({ CHOICE: '1' });
    await goNext(page);
    await expect(activeQuestion(page, 'CHECKS')).toBeVisible();
    await flushHarness(page);

    const stored = await harnessSnapshot(page);
    expect(stored.state.survey).toMatchObject({ CHOICE: '1' });
    expect(stored.logs.storeCalls.some(({ changes }) => (
      changes['TEST_RUNTIME.CHOICE'] === '1'
    ))).toBe(true);

    await goBack(page);
    await expect(activeQuestion(page, 'CHOICE')).toBeVisible();
    await expect(activeQuestion(page, 'CHOICE').locator('#CHOICE_1')).toBeChecked();
    await expect(activeQuestion(page, 'CHOICE').locator('.screen-reader-focus')).toBeFocused();
  });

  test('Tab gives a radio group one native stop and preserves its selected member', async ({ page }, testInfo) => {
    test.skip(!TAB_PROJECTS.has(testInfo.project.name), 'Safari Full Keyboard Access has a separate manual contract.');

    await openParticipant(page);
    const first = activeQuestion(page, 'CHOICE').locator('#CHOICE_1');
    const second = activeQuestion(page, 'CHOICE').locator('#CHOICE_2');
    await page.locator('#host-before').focus();
    await expect(page.locator('#host-before')).toBeFocused();

    const path = await tabUntil(page, (id) => id === 'CHOICE_1');
    expect(path).toContain('CHOICE_1');
    await expect(first).toBeFocused();
    const firstLabel = activeQuestion(page, 'CHOICE').locator('label[for="CHOICE_1"]');
    const secondLabel = activeQuestion(page, 'CHOICE').locator('label[for="CHOICE_2"]');
    await expect(firstLabel).toHaveCSS('outline-style', 'solid');
    await expect(firstLabel).toHaveCSS('outline-width', '3px');
    await expect(firstLabel).toHaveCSS('outline-color', 'rgb(28, 93, 134)');
    await expect(secondLabel).toHaveCSS('outline-style', 'none');
    await page.keyboard.press('Space');
    await expect(first).toBeChecked();
    await expect(firstLabel).toHaveCSS('outline-style', 'solid');

    await page.keyboard.press('ArrowRight');
    await waitInHarness(page, 150);
    await expect(second).toBeChecked();
    await expect(second).toBeFocused();

    await page.locator('#host-before').focus();
    const selectedPath = await tabUntil(page, (id) => id === 'CHOICE_2');
    expect(selectedPath.some((id) => id === null)).toBe(false);
    await expect(second).toBeFocused();

    const afterGroup = await tabUntilAction(page, 'next');
    expect(afterGroup.map(({ id }) => id)).not.toContain('CHOICE_1');
    await expect(activeQuestion(page, 'CHOICE').getByRole('button', { name: 'Next question' })).toBeFocused();
    await waitInHarness(page, 150);
    await expect(activeQuestion(page, 'CHOICE').getByRole('button', { name: 'Next question' })).toBeFocused();

    await expect(activeQuestion(page, 'CHOICE').locator('.response[tabindex]')).toHaveCount(0);
    await expect(activeQuestion(page, 'CHOICE').locator('#srFocusHelper')).toHaveCount(0);
  });

  test('keeps the production Module 1 marital-status radio group in native post-render keyboard order', async ({ page }, testInfo) => {
    test.skip(!TAB_PROJECTS.has(testInfo.project.name), 'Safari Full Keyboard Access has a separate manual contract.');

    const questionId = 'D_783167257';
    await openParticipant(page, {
      markdown: readLockedMarkdown('module1'),
      persistedData: { treeJSON: treeAt(questionId, 'SECTION1') },
    });

    const question = activeQuestion(page, questionId);
    const focusTarget = question.locator('.screen-reader-focus');
    const first = question.locator(`#${questionId}_514080822`);
    const second = question.locator(`#${questionId}_522680498`);
    const firstLabel = question.locator(`label[for="${questionId}_514080822"]`);
    const next = question.getByRole('button', { name: 'Next question' });

    await expect(focusTarget).toBeFocused();
    await expect(focusTarget).toHaveAttribute('tabindex', '-1');
    await expect(question.locator('input[type="radio"]')).toHaveCount(7);
    await expect(question.locator('input[type="radio"]:checked')).toHaveCount(0);
    await expect(question.locator('.response[tabindex]')).toHaveCount(0);
    await expect(question.locator('#srFocusHelper')).toHaveCount(0);
    expect(await focusTarget.evaluate((helper, firstRadioId) => {
      const firstRadio = document.getElementById(firstRadioId);
      return Boolean(helper.compareDocumentPosition(firstRadio) & Node.DOCUMENT_POSITION_FOLLOWING);
    }, `${questionId}_514080822`)).toBe(true);

    await page.keyboard.press('Tab');
    await expect(first).toBeFocused();
    await expect(firstLabel).toHaveCSS('outline-style', 'solid');

    await page.keyboard.press('Space');
    await waitInHarness(page, 150);
    await expect(first).toBeFocused();
    await expect(first).toBeChecked();
    const afterSpace = await harnessSnapshot(page);
    expect(afterSpace.state.active).toMatchObject({ [questionId]: '514080822' });
    expect(afterSpace.logs.events).toContainEqual(expect.objectContaining({
      type: 'keydown',
      key: ' ',
      defaultPrevented: false,
      target: expect.objectContaining({ id: `${questionId}_514080822` }),
    }));
    expect(afterSpace.logs.events).toContainEqual(expect.objectContaining({
      type: 'change',
      target: expect.objectContaining({ id: `${questionId}_514080822` }),
    }));

    await page.keyboard.press('ArrowDown');
    await waitInHarness(page, 150);
    await expect(second).toBeFocused();
    await expect(second).toBeChecked();
    await expect(first).not.toBeChecked();
    const afterArrow = await harnessSnapshot(page);
    expect(afterArrow.state.active).toMatchObject({ [questionId]: '522680498' });
    expect(afterArrow.logs.events).toContainEqual(expect.objectContaining({
      type: 'keydown',
      key: 'ArrowDown',
      defaultPrevented: false,
      target: expect.objectContaining({ id: `${questionId}_514080822` }),
    }));
    expect(afterArrow.logs.events).toContainEqual(expect.objectContaining({
      type: 'change',
      target: expect.objectContaining({ id: `${questionId}_522680498` }),
    }));

    await page.keyboard.press('Tab');
    await expect(next).toBeFocused();
    await expect(question.locator('input[type="radio"]:checked')).toHaveCount(1);
    await page.keyboard.press('Shift+Tab');
    await expect(second).toBeFocused();

    await next.focus();
    await page.keyboard.press('Enter');
    await expect(activeQuestion(page, 'RACEETHINTRO')).toBeVisible();
    await flushHarness(page);
    expect((await harnessSnapshot(page)).logs.storeCalls.some(({ changes }) => (
      changes['D_726699695_V2.D_783167257'] === '522680498'
    ))).toBe(true);

    await goBack(page);
    await expect(activeQuestion(page, questionId).locator('.screen-reader-focus')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(activeQuestion(page, questionId).locator(`#${questionId}_522680498`)).toBeFocused();
    await expect(activeQuestion(page, questionId).locator(`#${questionId}_522680498`)).toBeChecked();
    await expectHealthyHarness(page);
  });

  test('keeps the production Module 1 race multi-select native through linked text, XOR, storage, and Back', async ({ page }, testInfo) => {
    test.skip(!TAB_PROJECTS.has(testInfo.project.name), 'Safari Full Keyboard Access has a separate manual contract.');

    const questionId = 'D_384191091';
    const firstId = `${questionId}_583826374`;
    const secondId = `${questionId}_636411467`;
    const otherId = `${questionId}_807835037`;
    const otherTextId = 'D_747350323';
    const exclusiveId = `${questionId}_178420302`;
    await openParticipant(page, {
      markdown: readLockedMarkdown('module1'),
      persistedData: { treeJSON: treeAt(questionId, 'RACEETHINTRO') },
    });

    const question = activeQuestion(page, questionId);
    const first = question.locator(`#${firstId}`);
    const second = question.locator(`#${secondId}`);
    const other = question.locator(`#${otherId}`);
    const otherText = question.locator(`#${otherTextId}`);
    const exclusive = question.locator(`#${exclusiveId}`);

    await expect(question.locator('.screen-reader-focus')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(first).toBeFocused();
    await page.keyboard.press('Space');
    await expect(first).toBeChecked();
    await expect(first).toBeFocused();
    await page.keyboard.press('Space');
    await expect(first).not.toBeChecked();
    await expect(first).toBeFocused();

    await page.keyboard.press('Space');
    await page.keyboard.press('Tab');
    await expect(second).toBeFocused();
    await page.keyboard.press('Space');
    await expect(second).toBeChecked();
    await expect(second).toBeFocused();

    await tabUntil(page, (id) => id === otherId);
    await page.keyboard.press('Space');
    await waitInHarness(page, 25);
    await expect(other).toBeChecked();
    await expect(other).toBeFocused();

    const afterOther = await harnessSnapshot(page);
    expect(afterOther.logs.events).toContainEqual(expect.objectContaining({
      type: 'keydown',
      key: ' ',
      defaultPrevented: false,
      target: expect.objectContaining({ id: otherId }),
    }));

    await page.keyboard.press('Tab');
    await expect(otherText).toBeFocused();
    await page.keyboard.type('keyboard-test');
    const caretBeforeLeft = await otherText.evaluate((element) => element.selectionStart);
    await page.keyboard.press('ArrowLeft');
    await expect(otherText).toBeFocused();
    expect(await otherText.evaluate((element) => element.selectionStart)).toBe(caretBeforeLeft - 1);
    await page.keyboard.press('Shift+Tab');
    await expect(other).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(otherText).toBeFocused();

    await tabUntilAction(page, 'next');
    await page.keyboard.press('Enter');
    await expect(activeQuestion(page, 'D_362270886')).toBeVisible();
    await flushHarness(page);
    const stored = await harnessSnapshot(page);
    expect(stored.logs.storeCalls.some(({ changes }) => {
      const response = changes['D_726699695_V2.D_384191091'];
      return response?.D_747350323 === 'keyboard-test'
        && response?.D_384191091?.join(',') === '583826374,636411467,807835037';
    })).toBe(true);

    await goBack(page);
    const restored = activeQuestion(page, questionId);
    await expect(restored.locator('.screen-reader-focus')).toBeFocused();
    await expect(restored.locator(`#${firstId}`)).toBeChecked();
    await expect(restored.locator(`#${secondId}`)).toBeChecked();
    await expect(restored.locator(`#${otherId}`)).toBeChecked();
    await expect(restored.locator(`#${otherTextId}`)).toHaveValue('keyboard-test');
    await page.keyboard.press('Tab');
    await expect(restored.locator(`#${firstId}`)).toBeFocused();

    await tabUntil(page, (id) => id === exclusiveId);
    await page.keyboard.press('Space');
    await waitInHarness(page, 25);
    await expect(exclusive).toBeFocused();
    await expect(exclusive).toBeChecked();
    await expect(restored.locator(`#${firstId}`)).not.toBeChecked();
    await expect(restored.locator(`#${secondId}`)).not.toBeChecked();
    await expect(restored.locator(`#${otherId}`)).not.toBeChecked();
    await expect(restored.locator(`#${otherTextId}`)).toHaveValue('');

    await tabUntilAction(page, 'next');
    await page.keyboard.press('Enter');
    await expect(activeQuestion(page, 'D_588212264')).toBeVisible();
    await flushHarness(page);
    const afterExclusive = await harnessSnapshot(page);
    expect(afterExclusive.logs.storeCalls.some(({ changes }) => (
      changes['D_726699695_V2.D_384191091']?.D_384191091?.join(',') === '178420302'
    ))).toBe(true);

    await goBack(page);
    await expect(activeQuestion(page, questionId).locator(`#${exclusiveId}`)).toBeChecked();
    await expectHealthyHarness(page);
  });

  test('keeps pointer-only focus convenience for the production Module 1 linked Other response', async ({ page }, testInfo) => {
    test.skip(!NATIVE_KEYBOARD_PROJECTS.has(testInfo.project.name), 'The pointer regression runs in each desktop browser engine and the Windows browser branch.');

    const questionId = 'D_384191091';
    await openParticipant(page, {
      markdown: readLockedMarkdown('module1'),
      persistedData: { treeJSON: treeAt(questionId, 'RACEETHINTRO') },
    });

    const question = activeQuestion(page, questionId);
    const other = question.locator(`#${questionId}_807835037`);
    const otherText = question.locator('#D_747350323');
    await question.locator(`label[for="${questionId}_807835037"]`).click({ position: { x: 8, y: 8 } });
    await expect(other).toBeChecked();
    await expect(otherText).toBeFocused();
  });

  test('keeps the production Module 1 textarea arrows, storage, and Back restoration native', async ({ page }, testInfo) => {
    test.skip(!TAB_PROJECTS.has(testInfo.project.name), 'Safari Full Keyboard Access has a separate manual contract.');

    const questionId = 'D_868232409';
    const textareaId = `${questionId}_ta`;
    await openParticipant(page, {
      markdown: readLockedMarkdown('module1'),
      previousResults: { age: '45' },
      persistedData: { treeJSON: treeAt(questionId, 'D_700374192') },
    });

    const question = activeQuestion(page, questionId);
    const textarea = question.locator(`#${textareaId}`);
    const next = question.getByRole('button', { name: 'Next question' });
    const back = question.getByRole('button', { name: 'Back to the previous question' });
    await expect(question.locator('.screen-reader-focus')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(textarea).toBeFocused();
    await page.keyboard.type('first line');
    await page.keyboard.press('Enter');
    await page.keyboard.type('second line');

    await textarea.evaluate((element) => element.setSelectionRange(0, 0));
    await page.keyboard.press('ArrowDown');
    const afterDown = await textarea.evaluate((element) => ({
      focused: document.activeElement === element,
      caret: element.selectionStart,
    }));
    expect(afterDown.focused).toBe(true);
    expect(afterDown.caret).toBeGreaterThan(0);
    await page.keyboard.press('ArrowUp');
    await expect(textarea).toBeFocused();
    expect(await textarea.evaluate((element) => element.selectionStart)).toBe(0);

    await page.keyboard.press('Tab');
    await expect(next).toBeFocused();
    await tabUntilAction(page, 'previous');
    await expect(back).toBeFocused();
    await next.focus();
    await expect(next).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(activeQuestion(page, 'D_739294356')).toBeVisible();
    await flushHarness(page);
    expect((await harnessSnapshot(page)).logs.storeCalls.some(({ changes }) => (
      changes['D_726699695_V2.D_868232409'] === 'first line\nsecond line'
    ))).toBe(true);

    await goBack(page);
    await expect(activeQuestion(page, questionId).locator('.screen-reader-focus')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(activeQuestion(page, questionId).locator(`#${textareaId}`)).toBeFocused();
    await expect(activeQuestion(page, questionId).locator(`#${textareaId}`)).toHaveValue('first line\nsecond line');
    await expectHealthyHarness(page);
  });

  test('Tab reaches each checkbox, and keyboard toggles persist through Next and Back', async ({ page }, testInfo) => {
    test.skip(!TAB_PROJECTS.has(testInfo.project.name), 'Safari Full Keyboard Access has a separate manual contract.');

    await openParticipant(page);
    const choice = activeQuestion(page, 'CHOICE').locator('#CHOICE_1');
    await pressSpace(page, choice);
    await goNext(page);
    await expect(activeQuestion(page, 'CHECKS')).toBeVisible();

    const checks = activeQuestion(page, 'CHECKS');
    const email = checks.locator('#CHECKS_1');
    const text = checks.locator('#CHECKS_2');
    await page.locator('#host-before').focus();
    await tabUntil(page, (id) => id === 'CHECKS_1');
    await expect(email).toBeFocused();
    const emailLabel = checks.locator('label[for="CHECKS_1"]');
    const textLabel = checks.locator('label[for="CHECKS_2"]');
    await expect(emailLabel).toHaveCSS('outline-style', 'solid');
    await expect(emailLabel).toHaveCSS('outline-width', '3px');
    await expect(emailLabel).toHaveCSS('outline-color', 'rgb(28, 93, 134)');
    await expect(textLabel).toHaveCSS('outline-style', 'none');
    await page.keyboard.press('Space');
    await waitInHarness(page, 150);
    await expect(email).toBeChecked();
    await expect(email).toBeFocused();

    await tabUntil(page, (id) => id === 'CHECKS_2');
    await expect(text).toBeFocused();
    await page.keyboard.press('Space');
    await waitInHarness(page, 150);
    await expect(text).toBeChecked();
    await expect(text).toBeFocused();

    expect((await harnessSnapshot(page)).state.active).toMatchObject({ CHECKS: ['1', '2'] });
    await goNext(page);
    await expect(activeQuestion(page, 'TEXT')).toBeVisible();
    await flushHarness(page);

    const stored = await harnessSnapshot(page);
    expect(stored.state.survey).toMatchObject({ CHECKS: ['1', '2'] });
    expect(stored.logs.storeCalls.some(({ changes }) => (
      Array.isArray(changes['TEST_RUNTIME.CHECKS'])
      && changes['TEST_RUNTIME.CHECKS'].join(',') === '1,2'
    ))).toBe(true);

    await goBack(page);
    await expect(activeQuestion(page, 'CHECKS')).toBeVisible();
    await expect(activeQuestion(page, 'CHECKS').locator('#CHECKS_1')).toBeChecked();
    await expect(activeQuestion(page, 'CHECKS').locator('#CHECKS_2')).toBeChecked();
  });

  test('native select arrows retain focus without a Quest key trap, and native selection persists on blur', async ({ page }, testInfo) => {
    test.skip(!NATIVE_KEYBOARD_PROJECTS.has(testInfo.project.name), 'The native select contract runs in every desktop engine and the Windows browser branch.');

    await openParticipant(page, { fixture: 'nativeSelect.txt' });
    const select = activeQuestion(page, 'STATE').locator('#home_state');
    await select.focus();
    await expect(select).toBeFocused();
    await page.evaluate(() => {
      const root = document.querySelector('#questionnaireRoot');
      root.addEventListener('keydown', (event) => {
        if (event.target.id === 'home_state') {
          root.dataset.lastNativeSelectKeydown = JSON.stringify({
            defaultPrevented: event.defaultPrevented,
            activeId: document.activeElement?.id ?? null,
          });
        }
      }, { once: true });
    });
    await page.keyboard.press('ArrowDown');
    const nativeKeydown = await page.locator('#questionnaireRoot').evaluate((root) => (
      JSON.parse(root.dataset.lastNativeSelectKeydown)
    ));
    expect(nativeKeydown).toEqual({ defaultPrevented: false, activeId: 'home_state' });
    await expect(select).toBeFocused();

    // Native popup open/commit/dismiss keys are platform controls. Exercise
    // state persistence separately without pretending a single arrow must
    // change a disabled placeholder in every browser/OS combination.
    await select.selectOption('MD');
    const selectedValue = await select.inputValue();
    await select.blur();
    await waitInHarness(page, 50);
    expect((await harnessSnapshot(page)).state.active).toMatchObject({ STATE: selectedValue });
    await goNext(page);
    await expect(activeQuestion(page, 'END')).toBeVisible();
    await flushHarness(page);
    const stored = await harnessSnapshot(page);
    expect(stored.state.survey).toMatchObject({ STATE: selectedValue });
    expect(stored.logs.storeCalls.some(({ changes }) => (
      changes['TEST_NATIVE_SELECT.STATE'] === selectedValue
    ))).toBe(true);
  });

  test('native grid radio keyboard selection keeps its visual proxy, state, storage, and Back restoration aligned', async ({ page }, testInfo) => {
    test.skip(!new Set(['chromium-desktop', 'chromium-windows-ua']).has(testInfo.project.name), 'The grid keyboard path runs in Chromium and the Windows user-agent parity project.');

    await page.setViewportSize({ width: 1_000, height: 800 });
    await openParticipant(page, { fixture: 'gridResponsive.txt' });
    await goNext(page);
    const grid = activeQuestion(page, 'GRID_RATE');
    const never = grid.locator('#GRID_WALK_0');
    const neverLabel = never.locator('xpath=following-sibling::label');
    const sometimes = grid.locator('#GRID_WALK_1');
    const sometimesLabel = sometimes.locator('xpath=following-sibling::label');

    await expect(grid.locator('.screen-reader-focus')).toBeFocused();
    await expect(grid.locator('.screen-reader-focus')).toHaveAttribute('tabindex', '-1');
    await page.keyboard.press('Tab');
    await expect(never).toBeFocused();
    const focusMarkerBeforeSelection = await neverLabel.evaluate((label) => {
      const style = getComputedStyle(label, '::before');
      return {
        borderColor: style.borderColor,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        outlineColor: style.outlineColor,
      };
    });
    expect(focusMarkerBeforeSelection.borderColor).toBe('rgb(28, 93, 134)');
    expect(focusMarkerBeforeSelection).toMatchObject({
      outlineStyle: 'solid',
      outlineWidth: '3px',
      outlineColor: 'rgb(28, 93, 134)',
    });
    await expectGridFocusIndicatorUnclipped(neverLabel);
    await page.keyboard.press('ArrowRight');
    await waitInHarness(page, 300);
    await expect(sometimes).toBeChecked();
    await expect(sometimes).toBeFocused();
    await expect(grid.locator('#srFocusHelper')).toHaveCount(0);
    await expect(sometimesLabel).toBeVisible();

    const marker = await sometimesLabel.evaluate((label) => {
      const selectedStyle = getComputedStyle(label, '::after');
      const focusStyle = getComputedStyle(label, '::before');
      return {
        display: selectedStyle.display,
        width: Number.parseFloat(selectedStyle.width),
        focusOutlineStyle: focusStyle.outlineStyle,
        focusOutlineWidth: focusStyle.outlineWidth,
        focusOutlineColor: focusStyle.outlineColor,
      };
    });
    expect(marker.display).toBe('block');
    expect(marker.width).toBeGreaterThan(0);
    expect(marker).toMatchObject({
      focusOutlineStyle: 'solid',
      focusOutlineWidth: '3px',
      focusOutlineColor: 'rgb(28, 93, 134)',
    });

    await page.keyboard.press('Tab');
    await expect(grid.locator('#GRID_CYCLE_0')).toBeFocused();

    const selectedValue = await sometimes.getAttribute('value');
    expect((await harnessSnapshot(page)).state.active).toMatchObject({
      GRID_RATE: { GRID_WALK: selectedValue },
    });

    // Complete the second required row through the existing pointer path so
    // the keyboard selection can cross Quest's normal storage boundary.
    await grid.locator('tr[data-question-id="GRID_CYCLE"] label', { hasText: 'Sometimes' }).click();
    await expect(grid.locator('#GRID_CYCLE_1')).toBeChecked();
    await goNext(page);
    await expect(activeQuestion(page, 'END')).toBeVisible();
    await flushHarness(page);

    const stored = await harnessSnapshot(page);
    expect(stored.state.survey).toMatchObject({
      GRID_RATE: { GRID_WALK: selectedValue },
    });
    expect(stored.logs.storeCalls.some(({ changes }) => (
      changes['TEST_GRID.GRID_RATE']?.GRID_WALK === selectedValue
    ))).toBe(true);

    await activeQuestion(page, 'END').getByRole('button', { name: 'Back to the previous section' }).click();
    await expect(activeQuestion(page, 'GRID_RATE')).toBeVisible();
    const restoredChoice = activeQuestion(page, 'GRID_RATE').locator('#GRID_WALK_1');
    await expect(restoredChoice).toBeChecked();
    await expect(restoredChoice).not.toHaveAttribute('aria-labelledby');
    await expect(restoredChoice.locator('xpath=following-sibling::label').locator('.grid-label-row-context'))
      .toHaveText('Walking');
    await expect(restoredChoice).toHaveAccessibleName(
      'Walking Sometimes',
    );
  });

  test('native checkbox-grid traversal and selection retain native focus', async ({ page }, testInfo) => {
    test.skip(!new Set(['chromium-desktop', 'chromium-windows-ua']).has(testInfo.project.name), 'The checkbox-grid keyboard path runs in Chromium and the Windows user-agent parity project.');

    await page.setViewportSize({ width: 1_000, height: 800 });
    await openParticipant(page, { fixture: 'gridCheckboxFocus.txt' });
    await goNext(page);
    const grid = activeQuestion(page, 'GRID_CHECK');
    const controls = [
      grid.locator('#GRID_CHECK_ROW_A_0'),
      grid.locator('#GRID_CHECK_ROW_A_1'),
      grid.locator('#GRID_CHECK_ROW_B_0'),
      grid.locator('#GRID_CHECK_ROW_B_1'),
    ];

    await expect(grid.locator('.screen-reader-focus')).toBeFocused();
    await expect(grid.locator('.screen-reader-focus')).toHaveAttribute('tabindex', '-1');
    await expect(grid.locator('#srFocusHelper')).toHaveCount(0);

    for (const [index, control] of controls.entries()) {
      await page.keyboard.press('Tab');
      await expect(control).toBeFocused();
      if (index === 0) {
        await expectGridFocusIndicatorUnclipped(
          control.locator('xpath=following-sibling::label'),
        );
      }
      if (index === 0 || index === controls.length - 1) {
        await page.keyboard.press('Space');
        await waitInHarness(page, 150);
        await expect(control).toBeChecked();
        await expect(control).toBeFocused();
      }
    }

    await page.keyboard.press('Tab');
    await expect(grid.getByRole('button', { name: 'Next question' })).toBeFocused();
    await waitInHarness(page, 150);
    await expect(grid.getByRole('button', { name: 'Next question' })).toBeFocused();
    await expect(grid.locator('.response[tabindex]')).toHaveCount(0);
  });

  test('focus and selected-state indicators survive Windows forced-colors mode', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Forced-colors rendering is exercised once in Chromium.');
    await page.emulateMedia({ forcedColors: 'active' });
    await openParticipant(page);
    const choice = activeQuestion(page, 'CHOICE').locator('#CHOICE_1');
    const label = activeQuestion(page, 'CHOICE').locator('label[for="CHOICE_1"]');
    await choice.focus();
    await page.keyboard.press('Space');
    await expect(choice).toBeChecked();
    await expect(label).toHaveCSS('outline-style', 'solid');
    await expect(label).toHaveCSS('outline-width', '3px');
    expect(await label.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        forcedColorAdjust: style.forcedColorAdjust,
        backgroundColor: style.backgroundColor,
        color: style.color,
      };
    })).toMatchObject({ forcedColorAdjust: 'none' });

    await openParticipant(page, { fixture: 'gridResponsive.txt' });
    await goNext(page);
    const gridChoice = activeQuestion(page, 'GRID_RATE').locator('#GRID_WALK_1');
    const gridLabel = gridChoice.locator('xpath=following-sibling::label');
    await gridChoice.focus();
    await page.keyboard.press('Space');
    await expect(gridChoice).toBeChecked();
    const forcedMarker = await gridLabel.evaluate((element) => ({
      focusOutlineStyle: getComputedStyle(element, '::before').outlineStyle,
      focusOutlineWidth: getComputedStyle(element, '::before').outlineWidth,
      markerBackground: getComputedStyle(element, '::after').backgroundColor,
      markerForcedColorAdjust: getComputedStyle(element, '::after').forcedColorAdjust,
    }));
    expect(forcedMarker).toMatchObject({
      focusOutlineStyle: 'solid',
      focusOutlineWidth: '3px',
      markerForcedColorAdjust: 'none',
    });
    expect(forcedMarker.markerBackground).not.toBe('rgba(0, 0, 0, 0)');
  });
});
