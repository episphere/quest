import { describe, expect, it, vi } from 'vitest';
import { renderFreshQuest } from '../helpers/questRuntime.js';

async function loadRuntime() {
  const quest = await renderFreshQuest();
  const questionnaire = await import('../../questionnaire.js');
  return { quest, ...questionnaire };
}

describe('questionnaire runtime helpers', () => {
  it('formats SSN and telephone values only for non-Backspace keyup events', async () => {
    const { parseSSN, parsePhoneNumber } = await loadRuntime();
    const ssn = document.createElement('input');
    const phone = document.createElement('input');
    ssn.value = '123456789';
    phone.value = '5555551212';

    parseSSN({ type: 'keyup', target: ssn, code: 'Digit9' });
    parsePhoneNumber({ type: 'keyup', target: phone, code: 'Digit2' });
    expect(ssn.value).toBe('123-45-6789');
    expect(phone.value).toBe('555-555-1212');

    ssn.value = '12345';
    phone.value = '555555';
    parseSSN({ type: 'keyup', target: ssn, code: 'Backspace' });
    parsePhoneNumber({ type: 'keyup', target: phone, code: 'Backspace' });
    expect(ssn.value).toBe('12345');
    expect(phone.value).toBe('555555');
  });

  it('exchanges literal, numeric, and state-backed validation attributes without evaluating dates as arithmetic', async () => {
    const { quest, callExchangeValues } = await loadRuntime();
    quest.state.loadInitialSurveyState({ AGE: '7' });
    const form = document.createElement('form');
    form.innerHTML = `
      <input id="NUMBER" type="number" min="valueOrDefault(&quot;AGE&quot;,2)" max="10">
      <input id="MONTH" type="month" min="2026-02" max="2026-12">
      <input id="DATE" type="date" min="2026-02-03" max="2026-12-31">
    `;
    document.body.appendChild(form);
    const number = form.querySelector('#NUMBER');
    const month = form.querySelector('#MONTH');
    const date = form.querySelector('#DATE');

    callExchangeValues(number);
    callExchangeValues(month);
    callExchangeValues(date);

    expect(number.dataset.min).toBe('7');
    expect(number.dataset.max).toBe('10');
    expect(month.dataset.min).toBe('2026-02');
    expect(month.dataset.max).toBe('2026-12');
    expect(date.dataset.min).toBe('2026-02-03');
    expect(date.dataset.max).toBe('2026-12-31');
  });

  it('resolves one and many forid values, optional fallbacks, and display containers from state', async () => {
    const { quest, handleForIDAttributes } = await loadRuntime();
    quest.state.loadInitialSurveyState({ SIMPLE: 'saved', SHOW: '1', CONCEPT: '123456789' });

    const one = document.createElement('span');
    one.setAttribute('forid', 'SIMPLE');
    one.setAttribute('optional', 'fallback');
    document.body.appendChild(one);
    handleForIDAttributes([one]);
    expect(one.textContent).toBe('saved');
    expect(one.getAttribute('original-forid')).toBe('SIMPLE');

    const fallback = document.createElement('span');
    fallback.setAttribute('forid', 'MISSING');
    fallback.setAttribute('optional', 'fallback');
    document.body.appendChild(fallback);
    handleForIDAttributes([fallback]);
    expect(fallback.textContent).toBe('fallback');

    const container = document.createElement('div');
    container.innerHTML = `
      <span class="displayif" displayif="equals(SHOW,1)"><span forid="SIMPLE"></span></span>
      <span class="displayif" displayif="equals(SHOW,1)"><span forid="MISSING"></span></span>
    `;
    document.body.appendChild(container);
    const many = [...container.querySelectorAll('[forid]')];
    handleForIDAttributes(many);
    expect(many[0].textContent).toBe('saved');
    expect(many[0].parentElement.style.display).toBe('');
    expect(many[1].style.display).toBe('none');
    expect(many[1].parentElement.style.display).toBe('none');
  });

  it('renders runtime condition text and hides concept IDs from displayif output', async () => {
    const { quest, manageDisplayIfSpansAndDivs } = await loadRuntime();
    quest.state.loadInitialSurveyState({ TEXT: 'resolved response', CONCEPT: '>123456789<' });
    const value = document.createElement('span');
    value.setAttribute('displayif', 'exists("TEXT")');
    value.innerHTML = 'exists("TEXT")';
    const concept = document.createElement('span');
    concept.setAttribute('displayif', 'exists("CONCEPT")');
    concept.innerHTML = '&gt;123456789&lt;';
    document.body.append(value, concept);

    manageDisplayIfSpansAndDivs(value);
    manageDisplayIfSpansAndDivs(concept);
    expect(value.innerHTML).toBe('resolved response');
    expect(concept.style.display).toBe('none');
  });

  it('accepts only the confirmed response-modal value while preserving edit and dismissal prompts', async () => {
    const { quest, textboxinput } = await loadRuntime();
    const form = quest.root.querySelector('#Q1');
    form.querySelector('fieldset').innerHTML = `
      <div class="response">
        <input type="radio" id="OTHER" name="Q1" value="99">
        <input type="number" id="OTHER_TEXT" name="Q1" modalif="value > 5" softedit="true" modalvalue="${encodeURIComponent('Confirm this value')}">
      </div>
    `;
    quest.state.setNumResponseInputs('Q1', 2);
    const radio = form.querySelector('#OTHER');
    const text = form.querySelector('#OTHER_TEXT');
    text.value = '6';
    text.focus();

    textboxinput(text);

    const responseModal = quest.root.querySelector('#softModalResponse');
    expect(radio.checked).toBe(true);
    expect(responseModal.classList).toContain('show');
    expect(quest.root.querySelector('#modalResponseBody').innerText).toBe('Confirm this value');
    expect(responseModal.getAttribute('aria-describedby')).toBe('modalResponseBody');
    expect(document.activeElement).toBe(quest.root.querySelector('#modalResponseBody'));
    expect(quest.state.getActiveQuestionState().Q1).toEqual({ Q1: '99', OTHER_TEXT: '6' });

    responseModal.querySelector('#modalResponseContinueButton').click();
    globalThis.bootstrap.Modal.getInstance(responseModal).hide();
    expect(document.activeElement).toBe(text);
    expect(text.dataset.acceptedModalValue).toBe('6');

    textboxinput(text);
    expect(responseModal.classList).not.toContain('show');
    expect(quest.state.getActiveQuestionState().Q1).toEqual({ Q1: '99', OTHER_TEXT: '6' });

    text.value = '7';
    textboxinput(text);
    expect(responseModal.classList).toContain('show');
    expect(text.hasAttribute('data-accepted-modal-value')).toBe(false);
    responseModal.querySelector('#modalResponseCloseButton').click();
    globalThis.bootstrap.Modal.getInstance(responseModal).hide();
    expect(document.activeElement).toBe(text);

    textboxinput(text);
    expect(responseModal.classList).toContain('show');
    responseModal.querySelector('.btn-close').click();
    globalThis.bootstrap.Modal.getInstance(responseModal).hide();
    textboxinput(text);
    expect(responseModal.classList).toContain('show');
    globalThis.bootstrap.Modal.getInstance(responseModal).hide();
    textboxinput(text);
    expect(responseModal.classList).toContain('show');
    expect(quest.state.getActiveQuestionState().Q1).toEqual({ Q1: '99', OTHER_TEXT: '7' });

    const hostControl = document.createElement('button');
    document.body.appendChild(hostControl);
    hostControl.focus();
    globalThis.bootstrap.Modal.getInstance(responseModal).hide();
    expect(document.activeElement).toBe(hostControl);

    textboxinput(text);
    const inputFocus = vi.spyOn(text, 'focus');
    responseModal._questRenderDisposal = true;
    globalThis.bootstrap.Modal.getInstance(responseModal).hide();
    expect(inputFocus).not.toHaveBeenCalled();
  });

  it('clears mutually exclusive checkbox and text siblings, including stale validation UI', async () => {
    const { quest, handleXOR, moduleParams } = await loadRuntime();
    const { validationError } = await import('../../validate.js');
    const form = quest.root.querySelector('#Q1');
    form.querySelector('fieldset').innerHTML = `
      <div id="XOR_GROUP">
        <input type="checkbox" id="CHECK" name="CHECK" value="1" xor="GROUP" checked>
        <input type="text" id="TEXT" name="TEXT" value="old" xor="GROUP" aria-describedby="existing-hint">
      </div>
    `;
    quest.state.setNumResponseInputs('Q1', 2);
    quest.state.setResponse('Q1', 'CHECK', 2, ['1']);
    quest.state.setResponse('Q1', 'TEXT', 2, 'old');
    const check = form.querySelector('#CHECK');
    const text = form.querySelector('#TEXT');
    validationError(text, moduleParams.i18n.validationInputEmptyField);
    const errorId = form.querySelector('.validation-container').id;
    expect(text.getAttribute('aria-describedby').split(/\s+/)).toEqual(['existing-hint', errorId]);

    expect(handleXOR(check)).toBe('1');
    expect(text.value).toBe('');
    expect(text.classList).not.toContain('invalid');
    expect(form.querySelector('.validation-container')).toBeNull();
    expect(text.hasAttribute('aria-invalid')).toBe(false);
    expect(text.getAttribute('aria-describedby')).toBe('existing-hint');
    expect(quest.state.getActiveQuestionState().Q1.TEXT).toBeUndefined();

    text.value = '';
    expect(handleXOR(text)).toBeNull();
  });

  it('evaluates grid completeness, linked input completeness, and selected response families', async () => {
    const {
      gridHasAllAnswers,
      numUnansweredGridQuestions,
      radioCbHasAllAnswers,
      getSelectedResponses,
    } = await loadRuntime();
    const form = document.createElement('form');
    form.innerHTML = `
      <fieldset>
        <table><tbody>
          <tr data-gridrow="true" data-question-id="ROW1"><td><input type="radio" name="ROW1" value="1" checked></td></tr>
          <tr data-gridrow="true" data-question-id="ROW2"><td><input type="radio" name="ROW2" value="1"></td></tr>
          <tr data-gridrow="true" data-question-id="HIDDEN" style="display:none"><td><input type="radio" name="HIDDEN" value="1"></td></tr>
        </tbody></table>
        <input type="text" id="TEXT" value="filled">
        <input type="hidden" id="SKIP" checked>
      </fieldset>
    `;
    const fieldset = form.querySelector('fieldset');
    document.body.appendChild(form);

    expect(gridHasAllAnswers(fieldset)).toBe(false);
    expect(numUnansweredGridQuestions(fieldset)).toBe(1);
    form.querySelector('[name="ROW2"]').checked = true;
    expect(gridHasAllAnswers(fieldset)).toBe(true);
    expect(numUnansweredGridQuestions(fieldset)).toBe(0);
    expect(getSelectedResponses(fieldset).map(({ id }) => id)).toEqual(expect.arrayContaining(['TEXT', 'SKIP']));

    const linked = document.createElement('form');
    linked.innerHTML = `
      <input type="checkbox" checked><input type="text" value=""><input type="checkbox"><input type="submit">
    `;
    expect(radioCbHasAllAnswers(linked)).toBe(false);
    linked.querySelector('input[type="text"]').value = 'complete';
    expect(radioCbHasAllAnswers(linked)).toBe(true);
  });

  it('uses the media query boundary for mobile detection', async () => {
    const { isMobileDevice } = await loadRuntime();
    window.matchMedia.mockReturnValueOnce({ matches: true });
    expect(isMobileDevice()).toBe(true);
    window.matchMedia.mockReturnValueOnce({ matches: false });
    expect(isMobileDevice()).toBe(false);
    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 575.98px)');
  });
});
