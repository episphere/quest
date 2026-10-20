import { describe, expect, it, vi } from 'vitest';
import { renderFreshQuest } from '../helpers/questRuntime.js';

const markupSurvey = `
{"name":"MARKUP_FIDELITY"}

[SOURCE] Source response.
|__|id=SOURCE_VALUE|

[RICH] <b>Heading detail</b>

First production-style paragraph keeps <i>italic detail</i> and <u>underlined detail</u>.

Second production-style paragraph contains <b>|displayif=doesNotEqual(SOURCE,"")|{$SOURCE_VALUE}|</b> and includes |popup|more information|Help title|Popup detail|.

(1) Keep later response
(2) Clear later response

[SUMMARY] |displayif=doesNotEqual(SOURCE,"")|<b>Chosen source: {$SOURCE_VALUE}</b>|
|displayif=equals(SOURCE,"")|<i>Fallback participant</i>|

[END,end] Done.
`;

async function activeQuestion(quest, questionID) {
  if (questionID) {
    await vi.waitFor(() => {
      expect(quest.root.querySelector('form.question.active')?.id).toBe(questionID);
    });
  }
  return quest.root.querySelector('form.question.active');
}

async function next(quest) {
  (await activeQuestion(quest)).querySelector('.next').click();
}

async function back(quest) {
  (await activeQuestion(quest)).querySelector('.previous').click();
}

function nonWhitespaceChildOrder(element) {
  return Array.from(element.childNodes)
    .filter((node) => node.nodeType !== Node.TEXT_NODE || node.textContent.trim())
    .filter((node) => !node.classList?.contains('screen-reader-focus'))
    .map((node) => (
      node.nodeType === Node.TEXT_NODE
        ? `text:${node.textContent.replace(/\s+/g, ' ').trim()}`
        : node.tagName
    ));
}

function richSignature(question) {
  const fieldset = question.querySelector('fieldset');
  const legend = fieldset.querySelector(':scope > legend');
  const helper = fieldset.querySelector('.screen-reader-focus');
  const firstResponse = fieldset.querySelector('.response');
  const pipedValue = legend.querySelector('[original-forid="SOURCE_VALUE"], [forid="SOURCE_VALUE"]');
  const popover = legend.querySelector('[data-bs-toggle="popover"]');

  return {
    legendCount: fieldset.querySelectorAll(':scope > legend').length,
    helperCount: fieldset.querySelectorAll('.screen-reader-focus').length,
    helperTabIndex: helper.tabIndex,
    helperImmediatelyBeforeResponse: helper.nextElementSibling === firstResponse,
    helperParentTag: helper.parentElement.tagName,
    helperPrecedesPopover: Boolean(popover && (helper.compareDocumentPosition(popover) & Node.DOCUMENT_POSITION_FOLLOWING)),
    legendText: legend.textContent.replace(/\s+/g, ' ').trim(),
    legendChildOrder: nonWhitespaceChildOrder(legend),
    fieldsetBreakCount: fieldset.querySelectorAll(':scope > br').length,
    legendBreakCount: legend.querySelectorAll('br').length,
    boldTexts: Array.from(legend.querySelectorAll('b'), (element) => element.textContent),
    italicTexts: Array.from(legend.querySelectorAll('i'), (element) => element.textContent),
    underlinedTexts: Array.from(legend.querySelectorAll('u'), (element) => element.textContent),
    pipedValue: pipedValue && {
      text: pipedValue.textContent,
      parentTag: pipedValue.parentElement.tagName,
      boldText: pipedValue.closest('b')?.textContent,
      displayIf: pipedValue.closest('[displayif]')?.getAttribute('displayif'),
      visible: pipedValue.closest('[displayif]')?.style.display !== 'none',
    },
    popover: popover && {
      text: popover.textContent,
      title: popover.getAttribute('title'),
      content: popover.getAttribute('data-bs-content'),
      role: popover.getAttribute('role'),
      tabindex: popover.getAttribute('tabindex'),
      trigger: popover.getAttribute('data-bs-trigger'),
      parentTag: popover.parentElement.tagName,
    },
  };
}

function summarySignature(question) {
  const fieldset = question.querySelector('fieldset');
  const legend = fieldset.querySelector(':scope > legend');
  const displayIfs = Array.from(legend.querySelectorAll('[displayif]'));
  const helper = fieldset.querySelector('.screen-reader-focus');
  const populated = displayIfs.find((element) => element.getAttribute('displayif') === "doesNotEqual(SOURCE,'')");
  const fallback = displayIfs.find((element) => element.getAttribute('displayif') === "equals(SOURCE,'')");

  return {
    legendCount: fieldset.querySelectorAll(':scope > legend').length,
    helperCount: fieldset.querySelectorAll('.screen-reader-focus').length,
    helperTabIndex: helper.tabIndex,
    breakCount: fieldset.querySelectorAll('br').length,
    populated: { text: populated.textContent, display: populated.style.display },
    fallback: { text: fallback.textContent, display: fallback.style.display },
  };
}

function updateSource(input, value) {
  input.value = value;
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

describe('question markup fidelity', () => {
  it('keeps production-style rich markup stable through navigation and source edits', async () => {
    const quest = await renderFreshQuest({ markdown: markupSurvey });
    const sourceInput = (await activeQuestion(quest, 'SOURCE')).querySelector('#SOURCE_VALUE');

    updateSource(sourceInput, 'Original participant');
    await next(quest);

    const rich = await activeQuestion(quest, 'RICH');
    const richBeforeNavigation = richSignature(rich);
    const legendText = rich.querySelector('legend').textContent;
    const responseControls = Array.from(rich.querySelectorAll('.response input'));

    expect(richBeforeNavigation).toEqual({
      legendCount: 1,
      helperCount: 1,
      helperTabIndex: -1,
      helperImmediatelyBeforeResponse: false,
      helperParentTag: 'LEGEND',
      helperPrecedesPopover: true,
      legendText: 'Heading detail First production-style paragraph keeps italic detail and underlined detail. Second production-style paragraph contains Original participant and includes more information.',
      legendChildOrder: ['B', 'BR', 'text:First production-style paragraph keeps', 'I', 'text:and', 'U', 'text:.', 'text:Second production-style paragraph contains', 'B', 'text:and includes', 'A', 'text:.'],
      fieldsetBreakCount: 1,
      legendBreakCount: 1,
      boldTexts: ['Heading detail', 'Original participant'],
      italicTexts: ['italic detail'],
      underlinedTexts: ['underlined detail'],
      pipedValue: {
        text: 'Original participant',
        parentTag: 'SPAN',
        boldText: 'Original participant',
        displayIf: "doesNotEqual(SOURCE,'')",
        visible: true,
      },
      popover: {
        text: 'more information',
        title: 'Help title',
        content: 'Popup detail',
        role: 'button',
        tabindex: '0',
        trigger: 'manual',
        parentTag: 'LEGEND',
      },
    });
    expect(legendText).toContain('Heading detail\n\nFirst production-style paragraph');
    expect(legendText).toContain('underlined detail.\n\nSecond production-style paragraph');
    expect(responseControls).toHaveLength(2);
    for (const control of responseControls) {
      expect(control.labels).toHaveLength(1);
      expect(control.labels[0].htmlFor).toBe(control.id);
      expect(control.labels[0].control).toBe(control);
    }

    responseControls[0].click();
    await next(quest);
    const summary = await activeQuestion(quest, 'SUMMARY');

    expect(summarySignature(summary)).toEqual({
      legendCount: 1,
      helperCount: 1,
      helperTabIndex: -1,
      breakCount: 1,
      populated: { text: 'Chosen source: Original participant', display: '' },
      fallback: { text: 'Fallback participant', display: 'none' },
    });

    await back(quest);
    const reactivatedRich = await activeQuestion(quest, 'RICH');
    expect(richSignature(reactivatedRich)).toEqual(richBeforeNavigation);
    expect(reactivatedRich.querySelector('#RICH_1').checked).toBe(true);

    await back(quest);
    const returnedSource = await activeQuestion(quest, 'SOURCE');
    updateSource(returnedSource.querySelector('#SOURCE_VALUE'), '');
    await next(quest);

    const richWithoutSource = await activeQuestion(quest, 'RICH');
    expect(richWithoutSource.querySelectorAll(':scope > fieldset > legend')).toHaveLength(1);
    expect(richWithoutSource.querySelectorAll('.screen-reader-focus')).toHaveLength(1);
    expect(richWithoutSource.querySelector('#RICH_1').checked).toBe(false);
    expect(richWithoutSource.querySelector('#RICH_2').checked).toBe(false);
    expect(quest.state.getSurveyState().RICH).toBeUndefined();
    expect(richSignature(richWithoutSource).pipedValue).toMatchObject({ text: '', visible: false });

    await next(quest);
    const fallbackSummary = await activeQuestion(quest, 'SUMMARY');
    const fallbackSignature = summarySignature(fallbackSummary);
    expect(fallbackSignature).toEqual({
      legendCount: 1,
      helperCount: 1,
      helperTabIndex: -1,
      breakCount: 1,
      populated: { text: 'Chosen source: ', display: 'none' },
      fallback: { text: 'Fallback participant', display: '' },
    });

    await back(quest);
    await back(quest);
    const sourceForUpdate = await activeQuestion(quest, 'SOURCE');
    updateSource(sourceForUpdate.querySelector('#SOURCE_VALUE'), 'Updated participant');
    await next(quest);

    const richWithUpdatedSource = await activeQuestion(quest, 'RICH');
    expect(richSignature(richWithUpdatedSource)).toMatchObject({
      legendCount: 1,
      helperCount: 1,
      helperTabIndex: -1,
      pipedValue: { text: 'Updated participant', visible: true },
    });
    expect(richWithUpdatedSource.querySelector('#RICH_1').checked).toBe(false);

    await next(quest);
    const updatedSummary = await activeQuestion(quest, 'SUMMARY');
    expect(summarySignature(updatedSummary)).toEqual({
      ...fallbackSignature,
      populated: { text: 'Chosen source: Updated participant', display: '' },
      fallback: { text: 'Fallback participant', display: 'none' },
    });
    expect(quest.errors).toEqual([]);
  });
});
