import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFreshModuleGraph } from '../helpers/questRuntime.js';

function appendInput({ type = 'text', value = '', attributes = {}, className = '' } = {}) {
  const form = document.createElement('form');
  const input = document.createElement('input');
  input.type = type;
  input.value = value;
  input.className = className;
  Object.entries(attributes).forEach(([key, attributeValue]) => {
    input.setAttribute(key, attributeValue === true ? '' : String(attributeValue));
  });
  form.appendChild(input);
  document.body.appendChild(form);
  return { form, input };
}

describe('validation through exported behavior', () => {
  let validateInput;
  let validationError;
  let clearValidationError;
  let moduleParams;

  beforeEach(async () => {
    ({ questionnaire: { moduleParams } } = await loadFreshModuleGraph());
    ({ validateInput, validationError, clearValidationError } = await import('../../validate.js'));
  });

  it('marks required empty values invalid and clears the message after correction', () => {
    const { form, input } = appendInput({
      type: 'text',
      attributes: {
        'data-required': true,
        'aria-describedby': 'existing-hint extra-hint',
      },
    });
    input.insertAdjacentHTML('beforebegin', '<span id="existing-hint"></span><span id="extra-hint"></span>');

    validateInput(input);
    const error = input.nextElementSibling;
    expect(input.classList).toContain('invalid');
    expect(form.classList).toContain('invalid');
    expect(error.firstElementChild.innerText).toContain('Please fill out this field');
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.getAttribute('aria-atomic')).toBe('true');
    expect(error.id).toMatch(/^quest-validation-error-/);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby').split(/\s+/)).toEqual([
      'existing-hint',
      'extra-hint',
      error.id,
    ]);

    input.value = 'valid';
    validateInput(input);
    expect(input.classList).not.toContain('invalid');
    expect(form.classList).not.toContain('invalid');
    expect(input.nextElementSibling).toBeNull();
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    expect(input.getAttribute('aria-describedby')).toBe('existing-hint extra-hint');
  });

  it('updates one live error relationship and restores the existing invalid state exactly', () => {
    const { input } = appendInput({
      attributes: {
        'aria-describedby': 'existing-hint',
        'aria-invalid': 'grammar',
      },
    });

    validationError(input, moduleParams.i18n.validationInputEmptyField);
    const error = input.nextElementSibling;
    validationError(input, moduleParams.i18n.validationInputEmptyField);

    expect(input.parentElement.querySelectorAll('.validation-container')).toHaveLength(1);
    expect(input.getAttribute('aria-describedby').split(/\s+/)).toEqual(['existing-hint', error.id]);
    expect(input.getAttribute('aria-invalid')).toBe('true');

    clearValidationError(input);
    expect(input.getAttribute('aria-describedby')).toBe('existing-hint');
    expect(input.getAttribute('aria-invalid')).toBe('grammar');
  });

  it('can return a static programmatic error target without live-region semantics', () => {
    const { input } = appendInput();

    const error = validationError(
      input,
      moduleParams.i18n.validationInputEmptyField,
      [input],
      { liveRegion: false },
    );
    error.tabIndex = -1;

    expect(error).toBe(input.nextElementSibling);
    expect(error.firstElementChild.innerText).toContain(moduleParams.i18n.validationInputEmptyField);
    expect(error.tabIndex).toBe(-1);
    expect(error.hasAttribute('role')).toBe(false);
    expect(error.hasAttribute('aria-atomic')).toBe(false);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby').split(/\s+/)).toContain(error.id);
  });

  it.each([
    ['1', { 'data-min': '2', 'data-max': '8' }, 'greater than or equal to 2'],
    ['9', { 'data-min': '2', 'data-max': '8' }, 'less than or equal to 8'],
  ])('validates numeric boundaries for %s', (value, attributes, expected) => {
    const { input } = appendInput({ type: 'number', value, attributes });
    validateInput(input);
    expect(input.nextElementSibling.firstElementChild.innerText).toContain(expected);
  });

  it('accepts an in-range number', () => {
    const { input } = appendInput({ type: 'number', value: '5', attributes: { 'data-min': '2', 'data-max': '8' } });
    validateInput(input);
    expect(input.classList).not.toContain('invalid');
  });

  it.each([
    ['email', 'invalid', 'email address'],
    ['tel', '555-123', 'phone number'],
    ['text', '000-00-0000', 'valid Social Security Number', 'SSN'],
    ['text', '0000', 'last four digits', 'SSNsm'],
  ])('rejects invalid %s input', (type, value, message, className = '') => {
    const { input } = appendInput({ type, value, className });
    validateInput(input);
    expect(input.nextElementSibling.firstElementChild.innerText).toContain(message);
  });

  it.each([
    ['email', 'person@example.org'],
    ['tel', '555-555-1212'],
    ['text', '123-45-6789', 'SSN'],
    ['text', '1234', 'SSNsm'],
  ])('accepts a valid %s input', (type, value, className = '') => {
    const { input } = appendInput({ type, value, className });
    validateInput(input);
    expect(input.classList).not.toContain('invalid');
  });

  it('validates minimum, maximum, and exact text length', () => {
    const short = appendInput({ value: 'a', attributes: { 'data-minlen': 2 } }).input;
    validateInput(short);
    expect(short.nextElementSibling.firstElementChild.innerText).toContain('at least 2');

    const long = appendInput({ value: 'abcd', attributes: { 'data-maxlen': 3 } }).input;
    validateInput(long);
    expect(long.nextElementSibling.firstElementChild.innerText).toContain('at most 3');

    const exact = appendInput({ value: 'ab', attributes: { 'data-minlen': 3, 'data-maxlen': 3 } }).input;
    validateInput(exact);
    expect(exact.nextElementSibling.firstElementChild.innerText).toContain('should have 3');
  });

  it('normalizes MM-YYYY month input and enforces month boundaries', () => {
    const input = document.createElement('input');
    const form = document.createElement('form');
    input.setAttribute('type', 'month');
    Object.defineProperty(input, 'value', { value: '02-2026', writable: true });
    input.dataset.minDate = encodeURIComponent('2026-01');
    input.dataset.maxDate = encodeURIComponent('2026-12');
    form.appendChild(input);
    document.body.appendChild(form);

    validateInput(input);
    expect(input.value).toBe('2026-02');
    expect(input.classList).not.toContain('invalid');
  });

  it.each([
    ['2025-12-31', { 'data-min-date': '2026-01-01' }, 'after 1/1/2026'],
    ['2027-01-01', { 'data-max-date': '2026-12-31' }, 'before 12/31/2026'],
  ])('validates date boundary %s', (value, attributes, message) => {
    const { input } = appendInput({ type: 'date', value, attributes });
    validateInput(input);
    expect(input.nextElementSibling.firstElementChild.innerText).toContain(message);
  });

  it('accepts a date inside its configured boundaries', () => {
    const { input } = appendInput({
      type: 'date',
      value: '2026-06-15',
      attributes: { 'data-min-date': '2026-01-01', 'data-max-date': '2026-12-31' },
    });
    validateInput(input);
    expect(input.classList).not.toContain('invalid');
  });

  it.each([
    ['not-a-month', {}, 'YYYY-MM'],
    ['2025-12', { min: '2026-01' }, 'after 2026-01'],
    ['2027-01', { max: '2026-12' }, 'before 2026-12'],
  ])('rejects invalid or out-of-range month value %s', (value, boundaries, message) => {
    const input = document.createElement('input');
    const form = document.createElement('form');
    input.setAttribute('type', 'month');
    Object.defineProperty(input, 'value', { value, writable: true });
    if (boundaries.min) input.dataset.minDate = encodeURIComponent(boundaries.min);
    if (boundaries.max) input.dataset.maxDate = encodeURIComponent(boundaries.max);
    form.appendChild(input);
    document.body.appendChild(form);

    validateInput(input);
    expect(input.nextElementSibling.firstElementChild.innerText).toContain(message);
  });

  it('validates checkbox minimum and maximum counts at the end of a response list', () => {
    const form = document.createElement('form');
    form.dataset.minCount = '2';
    form.dataset.maxCount = '2';
    form.innerHTML = `
      <span id="checkbox-hint"></span>
      <div class="response"><input type="checkbox" name="CHOICES" value="1" checked aria-describedby="checkbox-hint"></div>
      <div class="response"><input type="checkbox" name="CHOICES" value="2"></div>
      <div class="response"><input type="checkbox" name="CHOICES" value="3"></div>
    `;
    document.body.appendChild(form);
    const inputs = [...form.querySelectorAll('input')];
    const lastResponse = form.lastElementChild;

    validateInput(inputs[0]);
    const minimumError = lastResponse.nextElementSibling;
    expect(minimumError.firstElementChild.innerText).toContain('selected 1');
    inputs.forEach((input) => {
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby').split(/\s+/)).toContain(minimumError.id);
    });

    inputs[1].checked = true;
    validateInput(inputs[1]);
    expect(lastResponse.classList).not.toContain('invalid');
    inputs.forEach((input) => expect(input.hasAttribute('aria-invalid')).toBe(false));
    expect(inputs[0].getAttribute('aria-describedby')).toBe('checkbox-hint');
    expect(inputs[1].hasAttribute('aria-describedby')).toBe(false);
    expect(inputs[2].hasAttribute('aria-describedby')).toBe(false);

    inputs[2].checked = true;
    validateInput(inputs[2]);
    const maximumError = lastResponse.nextElementSibling;
    expect(maximumError.firstElementChild.innerText).toContain('selected 3');
    inputs.forEach((input) => {
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby').split(/\s+/)).toContain(maximumError.id);
    });
  });

  it('adds mismatch errors to both confirmation fields and clears both after correction', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const form = document.createElement('form');
    form.innerHTML = `
      <input type="text" id="ORIGINAL" value="first">
      <input type="text" id="CONFIRM" value="second" data-confirm="ORIGINAL">
    `;
    document.body.appendChild(form);
    const original = form.querySelector('#ORIGINAL');
    const confirmation = form.querySelector('#CONFIRM');

    validateInput(confirmation);
    expect(original.classList).toContain('invalid');
    expect(confirmation.classList).toContain('invalid');
    expect(confirmation.nextElementSibling.firstElementChild.innerText).toContain('do not match');
    expect(original.getAttribute('aria-invalid')).toBe('true');
    expect(confirmation.getAttribute('aria-invalid')).toBe('true');
    expect(original.getAttribute('aria-describedby')).not.toBe(confirmation.getAttribute('aria-describedby'));

    confirmation.value = 'first';
    validateInput(confirmation);
    expect(original.classList).not.toContain('invalid');
    expect(confirmation.classList).not.toContain('invalid');
    expect(original.hasAttribute('aria-invalid')).toBe(false);
    expect(confirmation.hasAttribute('aria-invalid')).toBe(false);
  });

  it('intentionally skips validation for native radio and time controls', () => {
    const radio = appendInput({ type: 'radio', value: '1' }).input;
    const time = appendInput({ type: 'time', value: '10:30' }).input;
    validateInput(radio);
    validateInput(time);
    expect(moduleParams.errorLogger).not.toHaveBeenCalled();
  });

  it('reports unsupported input types through the host logger', () => {
    const { input } = appendInput({ type: 'color', value: '#ffffff' });
    validateInput(input);
    expect(moduleParams.errorLogger).toHaveBeenCalledWith(expect.stringContaining('no handle for type: color'), input);
  });
});
