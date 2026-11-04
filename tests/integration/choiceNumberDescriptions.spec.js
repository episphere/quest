import { describe, expect, it } from 'vitest';
import { renderFreshQuest } from '../helpers/questRuntime.js';

const normalize = (text) => text.replace(/\s+/g, ' ').trim();
const captionText = 'times per day';
const rangeDescription = 'Value must be greater than or equal to 0. Value must be less than or equal to 999';

function parts(form, numberId) {
  const choice = form.querySelector('input[type="radio"][value="1"], input[type="checkbox"][value="1"]');
  const number = form.querySelector(`[id="${numberId}"]`);
  return {
    choice,
    number,
    label: choice.labels[0],
    description: form.querySelector(`[id="${numberId}-desc"]`),
    response: choice.closest('.response'),
  };
}

function expectScopedHint(form, numberId) {
  const { choice, number, label, description, response } = parts(form, numberId);

  expect(label.parentElement).toBe(response);
  expect(choice.nextElementSibling).toBe(label);
  expect(label.contains(number)).toBe(true);
  expect(label.contains(description)).toBe(false);
  expect(description.parentElement).toBe(response);
  expect(description.hidden).toBe(true);
  expect(description.textContent).toBe(rangeDescription);
  expect(number.getAttribute('aria-describedby')).toBe(description.id);
  const caption = label.querySelector(':scope > [data-quest-choice-caption]');
  expect(caption).not.toBeNull();
  expect(caption.id).not.toBe('');
  expect(caption.textContent.trim()).toBe(captionText);
  expect(choice.getAttribute('aria-labelledby')).toBe(caption.id);
  expect(number).toMatchObject({ name: form.id, type: 'number', min: '0', max: '999' });
  expect(number.getAttribute('aria-label')).toBe(captionText);
  expect(normalize(label.textContent)).toBe(captionText);
  return { choice, caption };
}

describe('choice-linked numeric descriptions', () => {
  it('scopes generated checkbox-number guidance without changing its nested input', async () => {
    const quest = await renderFreshQuest({ markdown: `
      {"name":"CHECKBOX_NUMBER_HINT"}
      [CHECK?] Select all that apply.
      [1] times per day |__|__|id=CHECK_NUMBER min=0 max=999|
      [END,end] Done.
    ` });
    const form = quest.root.querySelector('#CHECK');
    const { choice } = expectScopedHint(form, 'CHECK_NUMBER');
    expect(choice.type).toBe('checkbox');
  });

  it('preserves custom description nodes and references while moving only the generated hint', async () => {
    const quest = await renderFreshQuest({ markdown: `
      {"name":"CUSTOM_NUMBER_HINTS"}
      [CUSTOM?] Pick one.
      <span id="outside-hint">Outside guidance.</span>
      (1) times per day <span id="inside-hint">Inside guidance.</span> |__|__|id=CUSTOM_NUMBER min=0 max=999 aria-describedby='inside-hint outside-hint'|
      (2) Custom number <input type="number" id="RAW_NUMBER" name="CUSTOM" aria-label="Custom number" aria-describedby="RAW_NUMBER-desc"><span id="RAW_NUMBER-desc" class="visually-hidden">Custom guidance.</span>
      [END,end] Done.
    ` });
    const form = quest.root.querySelector('#CUSTOM');
    const { label, number, description, response } = parts(form, 'CUSTOM_NUMBER');
    expect(description.parentElement).toBe(response);
    expect(description.hidden).toBe(true);
    expect(label.contains(description)).toBe(false);
    expect(label.contains(number)).toBe(true);
    expect(label.querySelector('#inside-hint').textContent).toBe('Inside guidance.');
    expect(label.querySelector('#inside-hint').hidden).toBe(false);
    expect(form.querySelector('#outside-hint').closest('label')).toBeNull();
    expect(form.querySelector('#outside-hint').hidden).toBe(false);
    expect(number.getAttribute('aria-describedby').split(/\s+/)).toEqual([
      'inside-hint', 'outside-hint', 'CUSTOM_NUMBER-desc',
    ]);
    expect(form.querySelector('#RAW_NUMBER-desc').closest('label')).toBe(form.querySelector('#CUSTOM_2').labels[0]);
    expect(form.querySelector('#RAW_NUMBER-desc').hidden).toBe(false);
    expect(form.querySelector('#RAW_NUMBER').getAttribute('aria-describedby')).toBe('RAW_NUMBER-desc');
  });

  it('leaves standalone numeric hint placement and explicit names unchanged', async () => {
    const quest = await renderFreshQuest({ markdown: `
      {"name":"STANDALONE_NUMBER_HINT"}
      [NUMBER?] times per day |__|__|id=STANDALONE_NUMBER min=0 max=999 aria-label='Specific number'|
      [END,end] Done.
    ` });
    const form = quest.root.querySelector('#NUMBER');
    const number = form.querySelector('#STANDALONE_NUMBER');
    const description = form.querySelector('#STANDALONE_NUMBER-desc');
    expect(number.nextElementSibling).toBe(description);
    expect(description.closest('.response')).toBeNull();
    expect(description.hidden).toBe(false);
    expect(description.textContent).toBe(rangeDescription);
    expect(number.getAttribute('aria-label')).toBe('Specific number');
    expect(number.getAttribute('aria-describedby')).toBe(description.id);
  });

  it('keeps generated caption IDs unique when its preferred ID already exists', async () => {
    const existingId = 'COLLISION_1-caption';
    const quest = await renderFreshQuest({ markdown: `
      {"name":"CHOICE_CAPTION_COLLISION"}
      [COLLISION?] Pick one.
      <span id="${existingId}">Existing content.</span>
      (1) times per day |__|__|id=COLLISION_NUMBER min=0 max=999|
      (2) Other frequency
      [END,end] Done.
    ` });
    const form = quest.root.querySelector('#COLLISION');
    const { caption } = expectScopedHint(form, 'COLLISION_NUMBER');
    expect(caption.id).not.toBe(existingId);
    expect(form.querySelector(`[id="${existingId}"]`).textContent).toBe('Existing content.');
    const ids = Array.from(form.querySelectorAll('[id]'), ({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(quest.errors).toEqual([]);
  });

  it('avoids caption IDs already mounted in the host document', async () => {
    const existingId = 'HOST_COLLISION_1-caption';
    let hostCaption;
    const quest = await renderFreshQuest({
      markdown: `
        {"name":"HOST_CAPTION_COLLISION"}
        [HOST_COLLISION?] Pick one.
        (1) times per day |__|__|id=HOST_COLLISION_NUMBER min=0 max=999|
        [END,end] Done.
      `,
      params: {
        retrieve: async () => {
          hostCaption = document.createElement('span');
          hostCaption.id = existingId;
          hostCaption.textContent = 'Existing host content.';
          document.body.prepend(hostCaption);
          return { data: {} };
        },
      },
    });
    const form = quest.root.querySelector('#HOST_COLLISION');
    const { caption } = expectScopedHint(form, 'HOST_COLLISION_NUMBER');

    expect(hostCaption.isConnected).toBe(true);
    expect(caption.id).not.toBe(existingId);
    expect(document.getElementById(existingId)).toBe(hostCaption);
    expect(hostCaption.textContent).toBe('Existing host content.');
    expect(document.querySelectorAll(`[id="${existingId}"]`)).toHaveLength(1);
    expect(document.getElementById(caption.id)).toBe(caption);
    expect(quest.errors).toEqual([]);
  });

  it.each([
    ['aria-label', 'Existing choice name'],
    ['aria-labelledby', 'existing-choice-name'],
  ])('does not replace an existing choice %s', async (attribute, value) => {
    const quest = await renderFreshQuest({ markdown: `
      {"name":"EXPLICIT_CHOICE_NUMBER_NAME"}
      [EXPLICIT?] Pick one.
      <span id="existing-choice-name">Existing choice name</span>
      <div class="response"><input type="radio" id="EXPLICIT_CHOICE" name="EXPLICIT" value="1" ${attribute}="${value}"><label for="EXPLICIT_CHOICE">times per day |__|__|id=EXPLICIT_NUMBER min=0 max=999|</label></div>
      [END,end] Done.
    ` });
    const form = quest.root.querySelector('#EXPLICIT');
    const choice = form.querySelector('#EXPLICIT_CHOICE');
    expect(choice.getAttribute(attribute)).toBe(value);
    if (attribute === 'aria-label') expect(choice.hasAttribute('aria-labelledby')).toBe(false);
    if (attribute === 'aria-labelledby') expect(choice.hasAttribute('aria-label')).toBe(false);
    expect(choice.labels[0].querySelector('[data-quest-choice-caption]')).toBeNull();
    expect(choice.labels[0].querySelector('#EXPLICIT_NUMBER')).not.toBeNull();
    expect(form.querySelector('#EXPLICIT_NUMBER').getAttribute('aria-describedby')).toBe('EXPLICIT_NUMBER-desc');
  });

  it('keeps a conditional numeric hint with its existing visibility wrapper', async () => {
    const quest = await renderFreshQuest({ markdown: `
      {"name":"CONDITIONAL_NUMBER_HINT"}
      [CONDITIONAL?] Pick one.
      (1) times per day <span class="displayif" displayif="equals(FLAG,1)">|__|__|id=CONDITIONAL_NUMBER min=0 max=999|</span>
      (2) Other frequency
      [END,end] Done.
    ` });
    const form = quest.root.querySelector('#CONDITIONAL');
    const { label, number, description } = parts(form, 'CONDITIONAL_NUMBER');
    const wrapper = number.closest('.displayif');
    expect(wrapper).not.toBeNull();
    expect(description.parentElement).toBe(wrapper);
    expect(description.hidden).toBe(false);
    expect(label.contains(description)).toBe(true);
    expect(number.getAttribute('aria-describedby')).toBe(description.id);
    expect(description.textContent).toBe(rangeDescription);
  });
});
