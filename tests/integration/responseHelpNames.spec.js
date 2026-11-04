import { describe, expect, it } from 'vitest';
import { renderFreshQuest } from '../helpers/questRuntime.js';

const help = '|popup|filtered or treated|Informational Text|Please only include water that has not been filtered or treated through reverse osmosis, distillation, or filters that remove lead, chlorine, pesticides, or other chemicals. You can include water filtered with water softeners, which are filters that remove only sediment from the water.|';
const staticCaption = `Water from the tap or refrigerator that has <b>not</b> been ${help}`;
const expectedName = 'Water from the tap or refrigerator that has not been filtered or treated';
const ownedNameAttribute = 'data-quest-help-choice-name';

async function renderChoice({ caption = staticCaption, attributes = '', responseAttributes = '', beforeChoice = '', ...options } = {}) {
  const quest = await renderFreshQuest({
    markdown: `
      {"name":"RESPONSE_HELP_NAMES"}
      [WATER?] What is the main source of water that you drink?
      ${beforeChoice}
      <div class="response" ${responseAttributes}><input type="radio" id="WATER_1" name="WATER" value="1" ${attributes}><label for="WATER_1">${caption}</label></div>
      (2) Water from a refrigerator that has a water filter
      [END,end] Done.
    `,
    ...options,
  });
  const form = quest.root.querySelector('#WATER');
  const radio = form.querySelector('#WATER_1');
  return { ...quest, form, radio, label: radio.labels[0] };
}

describe('static response names with inline help', () => {
  it.each([
    ['aria-label', 'Existing choice name'],
    ['aria-labelledby', 'existing-choice-name'],
  ])('preserves an existing radio %s', async (attribute, value) => {
    const quest = await renderChoice({
      attributes: `${attribute}="${value}"`,
      beforeChoice: attribute === 'aria-labelledby'
        ? '<span id="existing-choice-name">Existing choice name</span>'
        : '',
    });

    expect(quest.radio.getAttribute(attribute)).toBe(value);
    expect(quest.radio.hasAttribute(ownedNameAttribute)).toBe(false);
    expect(quest.label.querySelector('[data-bs-toggle="popover"]')).not.toBeNull();
    expect(quest.errors).toEqual([]);
  });

  it('does not freeze a piped response into the radio name', async () => {
    const quest = await renderChoice({
      caption: `Water from {$SOURCE} that has <b>not</b> been ${help}`,
      persistedData: { SOURCE: 'the tap' },
    });
    const piped = quest.label.querySelector('span[forid]');

    expect(piped.textContent).toBe('the tap');
    expect(quest.radio.hasAttribute('aria-label')).toBe(false);
    expect(quest.radio.hasAttribute(ownedNameAttribute)).toBe(false);
    expect(quest.label.querySelector('[data-bs-toggle="popover"]')).not.toBeNull();
    expect(quest.errors).toEqual([]);
  });

  it.each([
    ['caption', { caption: `Water from the tap that has |displayif=equals(SHOW,1)|<b>not</b>| been ${help}` }],
    ['response', { responseAttributes: `displayif="${encodeURIComponent('equals(SHOW,1)')}"` }],
  ])('leaves conditional %s wording under its existing naming rules', async (kind, configuration) => {
    const quest = await renderChoice({
      ...configuration,
      persistedData: { SHOW: '1' },
    });
    const conditional = kind === 'caption'
      ? quest.label.querySelector('.displayif')
      : quest.radio.closest('.response');

    expect(decodeURIComponent(conditional.getAttribute('displayif'))).toBe('equals(SHOW,1)');
    expect(conditional.style.display).toBe('');
    expect(quest.radio.hasAttribute('aria-label')).toBe(false);
    expect(quest.radio.hasAttribute(ownedNameAttribute)).toBe(false);
    expect(quest.errors).toEqual([]);
  });

  it('does not replace the naming of a response containing another input', async () => {
    const quest = await renderChoice({
      caption: `${staticCaption} |__|__|id=WATER_COUNT min=0 max=999|`,
    });

    expect(quest.label.querySelector('#WATER_COUNT').type).toBe('number');
    expect(quest.radio.hasAttribute('aria-label')).toBe(false);
    expect(quest.radio.hasAttribute(ownedNameAttribute)).toBe(false);
    expect(quest.errors).toEqual([]);
  });

  it.each([
    ['a bare formatting node', '#WATER label b', 'visibility', 'hidden'],
    ['the response container', '#WATER .response', 'display', 'none'],
  ])('removes its copied name when %s becomes CSS-hidden', async (_, selector, property, value) => {
    const quest = await renderChoice();
    expect(quest.radio.getAttribute('aria-label')).toBe(expectedName);
    const style = document.createElement('style');
    style.textContent = `${selector} { ${property}: ${value}; }`;
    document.head.appendChild(style);
    try {
      const { prepareQuestionDOM } = await import('../../questionnaire.js');
      await prepareQuestionDOM(quest.form);

      expect(window.getComputedStyle(document.querySelector(selector)).getPropertyValue(property)).toBe(value);
      expect(quest.radio.hasAttribute('aria-label')).toBe(false);
      expect(quest.radio.hasAttribute(ownedNameAttribute)).toBe(false);
      expect(quest.errors).toEqual([]);
    } finally {
      style.remove();
    }
  });

  it('removes and restores its name when the label, response, or radio becomes aria-hidden', async () => {
    const quest = await renderChoice();
    const { prepareQuestionDOM } = await import('../../questionnaire.js');

    for (const element of [quest.label, quest.radio.closest('.response'), quest.radio]) {
      expect(quest.radio.getAttribute('aria-label')).toBe(expectedName);
      element.setAttribute('aria-hidden', 'true');
      await prepareQuestionDOM(quest.form);
      expect(quest.radio.hasAttribute('aria-label')).toBe(false);
      expect(quest.radio.hasAttribute(ownedNameAttribute)).toBe(false);

      element.removeAttribute('aria-hidden');
      await prepareQuestionDOM(quest.form);
      expect(quest.radio.getAttribute('aria-label')).toBe(expectedName);
      expect(quest.radio.getAttribute(ownedNameAttribute)).toBe(expectedName);
    }
    expect(quest.errors).toEqual([]);
  });

  it('refreshes its cached name, clears stale names, and preserves a host override without moving label content', async () => {
    const quest = await renderChoice();
    const { prepareQuestionDOM } = await import('../../questionnaire.js');
    const originalNodes = [...quest.label.childNodes];
    const bold = quest.label.querySelector('b');
    const helpButton = quest.label.querySelector('[data-bs-toggle="popover"]');
    expect(quest.radio.getAttribute('aria-label')).toBe(expectedName);
    expect(quest.radio.getAttribute(ownedNameAttribute)).toBe(expectedName);
    expect(helpButton.getAttribute('role')).toBe('button');
    expect(helpButton.getAttribute('aria-expanded')).toBe('false');

    quest.label.firstChild.textContent = 'Water from the tap that has ';
    const refreshedName = 'Water from the tap that has not been filtered or treated';
    await prepareQuestionDOM(quest.form);
    expect(quest.radio.getAttribute('aria-label')).toBe(refreshedName);
    expect(quest.radio.getAttribute(ownedNameAttribute)).toBe(refreshedName);
    expect([...quest.label.childNodes]).toEqual(originalNodes);
    expect(quest.label.querySelector('b')).toBe(bold);
    expect(quest.label.querySelector('[data-bs-toggle="popover"]')).toBe(helpButton);

    quest.label.setAttribute('displayif', '1 == 1');
    await prepareQuestionDOM(quest.form);
    expect(quest.radio.hasAttribute('aria-label')).toBe(false);
    expect(quest.radio.hasAttribute(ownedNameAttribute)).toBe(false);

    quest.label.removeAttribute('displayif');
    await prepareQuestionDOM(quest.form);
    expect(quest.radio.getAttribute('aria-label')).toBe(refreshedName);
    bold.hidden = true;
    await prepareQuestionDOM(quest.form);
    expect(quest.radio.hasAttribute('aria-label')).toBe(false);
    expect(quest.radio.hasAttribute(ownedNameAttribute)).toBe(false);

    bold.hidden = false;
    await prepareQuestionDOM(quest.form);
    expect(quest.radio.getAttribute('aria-label')).toBe(refreshedName);
    quest.radio.setAttribute('aria-label', 'Host-provided choice name');
    quest.label.setAttribute('displayif', '1 == 1');
    await prepareQuestionDOM(quest.form);
    expect(quest.radio.getAttribute('aria-label')).toBe('Host-provided choice name');
    expect(quest.radio.hasAttribute(ownedNameAttribute)).toBe(false);
    expect(quest.errors).toEqual([]);
  });
});
