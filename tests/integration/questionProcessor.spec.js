import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const ALL_CONSTRUCTS = readFileSync(
  resolve('tests/fixtures/canonical/allConstructs.txt'),
  'utf8',
);

const PRECALCULATED = {
  current_date: new Date('2026-03-15T12:00:00Z'),
  current_day: 15,
  current_month: 3,
  current_month_str: 2,
  current_year: 2026,
  quest_format_date: '2026-3-15',
  firstName: 'Synthetic',
};

const WHOLE_NUMBER_KEYPRESS_HANDLER = 'return (event.charCode == 8 || event.charCode == 0 || event.charCode == 13) ? null : event.charCode >= 48 && event.charCode <= 57';

async function createProcessor(markdown, initialState = {}, options = {}) {
  vi.resetModules();
  const questionnaire = await import('../../questionnaire.js');
  const language = options.language ?? 'en';
  const i18n = (await import(`../../i18n/${language}.js`)).default;
  questionnaire.moduleParams.i18n = i18n;
  questionnaire.moduleParams.errorLogger = vi.fn();
  questionnaire.moduleParams.previousResults = options.previousResults ?? {};
  questionnaire.moduleParams.asyncQuestionsMap = options.asyncQuestionsMap ?? {};
  questionnaire.moduleParams.renderFullQuestionList = options.renderFullQuestionList ?? true;
  questionnaire.moduleParams.isRenderer = options.isRenderer ?? true;

  const stateModule = await import('../../stateManager.js');
  stateModule.initializeStateManager();
  const state = stateModule.getStateManager();
  state.loadInitialSurveyState(initialState);

  const { initializeCustomMathJSFunctions } = await import('../../customMathJSImplementation.js');
  initializeCustomMathJSFunctions();
  const { QuestionProcessor } = await import('../../questionProcessor.js');
  const processor = new QuestionProcessor(markdown, PRECALCULATED, i18n);
  state.setQuestionProcessor(processor);
  return { processor, state, moduleParams: questionnaire.moduleParams };
}

function processById(processor, id) {
  return processor.findQuestion(id).question;
}

describe('QuestionProcessor constructs', () => {
  it('removes comments, captures the module name, and preserves hard/soft/plain semantics', async () => {
    const { processor, moduleParams } = await createProcessor(`
      // line comment
      {"name":"PROCESSOR_TEST"}
      /* block comment */
      [SOFT?] Optional response.
      (1) Yes
      [HARD!] Required response.
      [1] Choice
      [PLAIN] Information only.
      [END,end] Done.
    `);

    expect(moduleParams.questName).toBe('PROCESSOR_TEST');
    expect(processor.questions.map(({ questionID }) => questionID)).toEqual(['SOFT?', 'HARD!', 'PLAIN', 'END']);
    expect(processById(processor, 'SOFT').getAttribute('softedit')).toBe('true');
    expect(processById(processor, 'HARD').getAttribute('hardedit')).toBe('true');
    expect(processById(processor, 'PLAIN').querySelectorAll('input')).toHaveLength(0);
  });

  it('renders every scalar input family with stable IDs, types, descriptions, and limits', async () => {
    const { processor } = await createProcessor(`
      {"name":"INPUT_TYPES"}
      [TEXT?] Text |__|id=TEXT_VALUE minlen=2 maxlen=8|
      [NUMBER?] Number |__|__|id=NUMBER_VALUE min=1 max=10|
      [AREA?] Notes |___|NOTES|
      [EMAIL?] Email |@|id=EMAIL_VALUE|
      [PHONE?] Phone |tel|id=PHONE_VALUE|
      [FULLSSN?] SSN |SSN|id=FULL_SSN|
      [SMALLSSN?] Last four |SSNsm|id=SMALL_SSN|
      [ZIP?] Zip |zip|id=ZIP_VALUE|
      [STATE?] State |state|id=STATE_VALUE|
      [DATE?] Date |date|id=DATE_VALUE min=2020-01-01 max=2030-12-31|
      [MONTH?] Month |month|id=MONTH_VALUE min=2020-01 max=2030-12|
      [TIME?] Time |time|id=TIME_VALUE|
      [HIDDEN] Hidden |hidden|id=HIDDEN_VALUE|
      [END,end] Done.
    `);

    processor.processAllQuestions();
    const forms = [...processor.getAllProcessedQuestions().values()];
    const all = document.createElement('div');
    forms.forEach((form) => all.append(form));

    expect(all.querySelector('#TEXT_VALUE')).toMatchObject({ type: 'text' });
    expect(all.querySelector('#TEXT_VALUE').dataset).toMatchObject({ minlen: '2', maxlen: '8' });
    expect(all.querySelector('#NUMBER_VALUE')).toMatchObject({ type: 'number', min: '1', max: '10' });
    expect(all.querySelector('#NUMBER_VALUE').dataset).toMatchObject({ min: '1', max: '10' });
    expect(all.querySelector('#NOTES').tagName).toBe('TEXTAREA');
    expect(all.querySelector('#EMAIL_VALUE').type).toBe('email');
    expect(all.querySelector('#PHONE_VALUE').type).toBe('tel');
    expect(all.querySelector('#FULL_SSN').classList).toContain('SSN');
    expect(all.querySelector('#SMALL_SSN').classList).toContain('SSNsm');
    expect(all.querySelector('#ZIP_VALUE').classList).toContain('zipcode');
    expect(all.querySelector('#STATE_VALUE').querySelectorAll('option').length).toBeGreaterThan(50);
    expect(all.querySelector('#DATE_VALUE').getAttribute('aria-describedby')).toBe('DATE_VALUE-desc');
    expect(all.querySelector('#MONTH_VALUE').dataset.minDateUneval).toBe('2020-01');
    expect(all.querySelector('#EMAIL_VALUE').getAttribute('aria-label')).toBe('Email');
    expect(all.querySelector('#PHONE_VALUE').getAttribute('aria-label')).toBe('Phone');
    expect(all.querySelector('#FULL_SSN').getAttribute('aria-label')).toBe('SSN');
    expect(all.querySelector('#SMALL_SSN').getAttribute('aria-label')).toBe('Last four');
    expect(all.querySelector('#ZIP_VALUE').getAttribute('aria-label')).toBe('Zip');
    expect(all.querySelector('#STATE_VALUE').getAttribute('aria-label')).toBe('State');
    expect(all.querySelector('#DATE_VALUE').getAttribute('aria-label')).toBe('Date');
    expect(all.querySelector('#MONTH_VALUE').getAttribute('aria-label')).toBe('Month');
    const time = all.querySelector('#TIME_VALUE');
    expect(time.hasAttribute('aria-label')).toBe(false);
    expect(time.labels).toHaveLength(1);
    expect(time.labels[0].htmlFor).toBe('TIME_VALUE');
    expect(time.labels[0].textContent).toBe('Time');
    expect(all.querySelector('#NUMBER_VALUE').getAttribute('aria-label')).toBe('Number');
    expect(all.querySelector('#TEXT_VALUE').getAttribute('aria-label')).toBe('Text');
    expect(all.querySelector('#NOTES').getAttribute('aria-label')).toBe('Notes');
    expect(all.querySelector('#AREA [data-click-type="reset"]')).not.toBeNull();
    expect(all.querySelector('#HIDDEN_VALUE').dataset.hidden).toBe('true');
  });

  it('renders Reset for actual textarea tags without matching response-free prose', async () => {
    const { processor } = await createProcessor(`
      {"name":"RESET_CONTROL_DETECTION"}
      [PROSE] Your input will help, but this page has no response control.
      [UPPERCASE_TEXTAREA?] Enter notes. <TEXTAREA id="UPPER_NOTES"></TEXTAREA>
      [END,end] Done.
    `);

    expect(processById(processor, 'PROSE').querySelector('[data-click-type="reset"]')).toBeNull();
    expect(processById(processor, 'UPPERCASE_TEXTAREA').querySelector('#UPPER_NOTES')).not.toBeNull();
    expect(processById(processor, 'UPPERCASE_TEXTAREA').querySelector('[data-click-type="reset"]'))
      .not.toBeNull();
  });

  it.each([
    {
      language: 'en',
      labels: ['Age at diagnosis', 'Year at diagnosis'],
      fallbackLabels: {
        FALLBACK_EMAIL: 'Enter a value',
        FALLBACK_PHONE: 'Enter a value',
        FALLBACK_SSN: 'Enter a value',
        FALLBACK_SSN_LAST_FOUR: 'Enter a value',
        FALLBACK_ZIP: 'Enter a value',
        FALLBACK_STATE: 'Choose a State',
        FALLBACK_DATE: 'Enter a value',
        FALLBACK_MONTH: 'Enter a value',
        FALLBACK_TIME: 'Enter a value',
        FALLBACK_NUMBER: 'Enter a value',
        FALLBACK_TEXT: 'Enter a value',
        FALLBACK_TEXTAREA: 'Enter a value',
      },
      rangedDescription: 'Value must be greater than or equal to 1. Value must be less than or equal to 10',
      unboundedDescription: 'Enter a value',
      dateDescription: 'Enter a value',
      monthDescription: 'Format should match YYYY-MM',
    },
    {
      language: 'es',
      labels: ['Edad al momento del diagnóstico', 'Año del diagnóstico'],
      fallbackLabels: {
        FALLBACK_EMAIL: 'Introduzca un valor',
        FALLBACK_PHONE: 'Introduzca un valor',
        FALLBACK_SSN: 'Introduzca un valor',
        FALLBACK_SSN_LAST_FOUR: 'Introduzca un valor',
        FALLBACK_ZIP: 'Introduzca un valor',
        FALLBACK_STATE: 'Elija un Estado',
        FALLBACK_DATE: 'Introduzca un valor',
        FALLBACK_MONTH: 'Introduzca un valor',
        FALLBACK_TIME: 'Introduzca un valor',
        FALLBACK_NUMBER: 'Introduzca un valor',
        FALLBACK_TEXT: 'Introduzca un valor',
        FALLBACK_TEXTAREA: 'Introduzca un valor',
      },
      rangedDescription: 'El valor debe ser mayor o igual a 1. El valor debe ser menor o igual a 10',
      unboundedDescription: 'Introduzca un valor',
      dateDescription: 'Introduzca un valor',
      monthDescription: 'Debe tener el formato AAAA-MM',
    },
  ])('gives generated scalar controls distinct names and localized fallback guidance in $language', async ({
    language,
    labels,
    fallbackLabels,
    rangedDescription,
    unboundedDescription,
    dateDescription,
    monthDescription,
  }) => {
    const [ageLabel, yearLabel] = labels;
    const { processor } = await createProcessor(`
      {"name":"NUMERIC_NAMES_${language.toUpperCase()}"}
      [COMPOUND?] Diagnosis details.
      |__|__|id=AGE_VALUE min=1 max=10| ${ageLabel}
      |__|__|__|__|id=YEAR_VALUE| ${yearLabel}
      [FALLBACK?] Prompts on their own lines.
      |@|id=FALLBACK_EMAIL|
      |tel|id=FALLBACK_PHONE|
      |SSN|id=FALLBACK_SSN|
      |SSNsm|id=FALLBACK_SSN_LAST_FOUR|
      |zip|id=FALLBACK_ZIP|
      |state|id=FALLBACK_STATE|
      |date|id=FALLBACK_DATE|
      |month|id=FALLBACK_MONTH|
      |time|id=FALLBACK_TIME|
      |__|__|id=FALLBACK_NUMBER|
      |__|id=FALLBACK_TEXT|
      |___|FALLBACK_TEXTAREA|
      [END,end] Done.
    `, {}, { language });

    const compound = processById(processor, 'COMPOUND');
    const fallback = processById(processor, 'FALLBACK');

    expect(compound.querySelector('#AGE_VALUE')).toMatchObject({
      type: 'number',
      name: 'COMPOUND',
      min: '1',
      max: '10',
    });
    expect(compound.querySelector('#AGE_VALUE').getAttribute('aria-label')).toBe(ageLabel);
    expect(compound.querySelector('#YEAR_VALUE').getAttribute('aria-label')).toBe(yearLabel);
    expect(new Set(Array.from(compound.querySelectorAll('input[type="number"]'), (input) => input.getAttribute('aria-label'))).size).toBe(2);
    expect(compound.querySelector('#AGE_VALUE-desc').textContent).toBe(rangedDescription);
    expect(compound.querySelector('#YEAR_VALUE-desc').textContent).toBe(unboundedDescription);
    for (const [id, accessibleName] of Object.entries(fallbackLabels)) {
      const control = fallback.querySelector(`#${id}`);
      const nameSource = control.getAttribute('aria-label')
        || Array.from(control.labels ?? [], (label) => label.textContent).join(' ');
      expect(nameSource, id).toBe(accessibleName);
    }
    expect(fallback.querySelector('#FALLBACK_NUMBER').getAttribute('aria-describedby')).toBeNull();
    expect(fallback.querySelector('#FALLBACK_NUMBER-desc')).toBeNull();
    expect(fallback.querySelector('#FALLBACK_DATE-desc').textContent).toBe(dateDescription);
    expect(fallback.querySelector('#FALLBACK_MONTH-desc').textContent).toBe(monthDescription);
  });

  it.each([
    {
      language: 'en',
      fallbackName: 'Enter a value',
      zeroDescription: 'Value must be greater than or equal to 0. Value must be less than or equal to 10',
      minDescription: 'Value must be greater than or equal to 2',
      maxDescription: 'Value must be less than or equal to 8',
    },
    {
      language: 'es',
      fallbackName: 'Introduzca un valor',
      zeroDescription: 'El valor debe ser mayor o igual a 0. El valor debe ser menor o igual a 10',
      minDescription: 'El valor debe ser mayor o igual a 2',
      maxDescription: 'El valor debe ser menor o igual a 8',
    },
  ])('keeps number names and descriptions distinct in $language', async ({
    language,
    fallbackName,
    zeroDescription,
    minDescription,
    maxDescription,
  }) => {
    const { processor } = await createProcessor(`
      {"name":"NUMBER_SEMANTICS_${language.toUpperCase()}"}
      [NUMBERS?] Number semantics.
      <span id="ZERO_LABEL">Zero minimum</span>
      <span id="existing-number-hint">Existing hint</span>
      <span id="second-number-hint">Second hint</span>
      <span id="fallback-number-hint">Fallback hint</span>
      |__|__|id=ZERO_VALUE min=0 max=10 aria-labelledby='ZERO_LABEL' aria-describedby='existing-number-hint ZERO_VALUE-desc existing-number-hint'|
      |__|__|id=MIN_ONLY_VALUE min=2|
      |__|__|id=MAX_ONLY_VALUE max=8|
      |__|__|id=EXPLICIT_VALUE aria-label='Explicit number' aria-describedby='second-number-hint existing-number-hint second-number-hint'|
      |__|__|id=REFERENCED_FALLBACK_VALUE aria-describedby='fallback-number-hint REFERENCED_FALLBACK_VALUE-desc'|
      |__|__|id=FALLBACK_VALUE|
      [END,end] Done.
    `, {}, { language });
    const question = processById(processor, 'NUMBERS');
    const zero = question.querySelector('#ZERO_VALUE');
    const minOnly = question.querySelector('#MIN_ONLY_VALUE');
    const maxOnly = question.querySelector('#MAX_ONLY_VALUE');
    const explicit = question.querySelector('#EXPLICIT_VALUE');
    const referencedFallback = question.querySelector('#REFERENCED_FALLBACK_VALUE');
    const fallback = question.querySelector('#FALLBACK_VALUE');

    expect(zero.getAttribute('aria-labelledby')).toBe('ZERO_LABEL');
    expect(zero.hasAttribute('aria-label')).toBe(false);
    expect(zero.getAttribute('aria-describedby').split(/\s+/)).toEqual([
      'existing-number-hint',
      'ZERO_VALUE-desc',
    ]);
    expect(zero.outerHTML.match(/aria-describedby=/g)).toHaveLength(1);
    expect(question.querySelector('#ZERO_VALUE-desc').textContent).toBe(zeroDescription);
    expect(zero.placeholder).toBe(fallbackName);
    expect(zero.dataset.min).toBe('0');

    expect(minOnly.getAttribute('aria-describedby')).toBe('MIN_ONLY_VALUE-desc');
    expect(question.querySelector('#MIN_ONLY_VALUE-desc').textContent).toBe(minDescription);
    expect(maxOnly.getAttribute('aria-describedby')).toBe('MAX_ONLY_VALUE-desc');
    expect(question.querySelector('#MAX_ONLY_VALUE-desc').textContent).toBe(maxDescription);

    expect(explicit.getAttribute('aria-label')).toBe('Explicit number');
    expect(explicit.getAttribute('aria-describedby').split(/\s+/)).toEqual([
      'second-number-hint',
      'existing-number-hint',
      'EXPLICIT_VALUE-desc',
    ]);
    expect(explicit.outerHTML.match(/aria-describedby=/g)).toHaveLength(1);
    expect(question.querySelector('#EXPLICIT_VALUE-desc').textContent).toBe(fallbackName);
    expect(explicit.getAttribute('aria-describedby').split(/\s+/).map(
      (id) => question.querySelector(`#${id}`).textContent,
    )).toEqual(['Second hint', 'Existing hint', fallbackName]);
    expect(question.querySelectorAll('#EXPLICIT_VALUE-desc')).toHaveLength(1);

    expect(referencedFallback.getAttribute('aria-label')).toBe(fallbackName);
    expect(referencedFallback.getAttribute('aria-describedby').split(/\s+/)).toEqual([
      'fallback-number-hint',
      'REFERENCED_FALLBACK_VALUE-desc',
    ]);
    expect(referencedFallback.outerHTML.match(/aria-describedby=/g)).toHaveLength(1);
    expect(question.querySelector('#REFERENCED_FALLBACK_VALUE-desc').textContent).toBe(fallbackName);
    for (const id of referencedFallback.getAttribute('aria-describedby').split(/\s+/)) {
      expect(question.querySelectorAll(`[id="${id}"]`), id).toHaveLength(1);
    }

    expect(fallback.getAttribute('aria-label')).toBe(fallbackName);
    expect(fallback.hasAttribute('aria-describedby')).toBe(false);
    expect(question.querySelector('#FALLBACK_VALUE-desc')).toBeNull();

    const numbers = Array.from(question.querySelectorAll('input[type="number"]'));
    expect(numbers.map(({ id }) => id)).toEqual([
      'ZERO_VALUE',
      'MIN_ONLY_VALUE',
      'MAX_ONLY_VALUE',
      'EXPLICIT_VALUE',
      'REFERENCED_FALLBACK_VALUE',
      'FALLBACK_VALUE',
    ]);
    expect(new Set(numbers.map(({ id }) => id)).size).toBe(numbers.length);
    const descriptionIds = Array.from(
      question.querySelectorAll('[id$="-desc"]'),
      ({ id }) => id,
    );
    expect(descriptionIds).toHaveLength(5);
    expect(new Set(descriptionIds).size).toBe(descriptionIds.length);
  });

  it('preserves explicit accessible names and never mistakes metadata or choice markup for a name', async () => {
    const { processor } = await createProcessor(`
      {"name":"SCALAR_NAME_BOUNDARIES"}
      [NUMBER?] Number.
      |__|__|id=EXPLICIT_NUMBER min=1 max=2 aria-label='Explicit number'|
      [DATE?] <span id="EXPLICIT_DATE_LABEL">Explicit date</span>
      |date|id=EXPLICIT_DATE aria-labelledby='EXPLICIT_DATE_LABEL'|
      [METADATA?] Metadata is not a label.
      |__|id=METADATA_TEXT data-aria-label=metadata|
      [HASH?] Duration.
      |__|__|id=HASH_NUMBER| # of Hours
      [RADIO_SCALAR?] Pick one.
      (1) Email |@|id=CHOICE_EMAIL|
      [CHECK_SCALAR?] Pick any.
      [1] Date |date|id=CHOICE_DATE|
      [PREFIX_NUMBER?] Pick one.
      (1) times per day |__|__|id=PREFIX_NUMBER_VALUE|
      [SUFFIX_NUMBER?] Elija una opción.
      (1) |__|__|id=SUFFIX_NUMBER_VALUE| veces al día
      [PAREN_CAPTION?] Contact option (1) |@|id=PAREN_EMAIL|
      [BRACKET_CAPTION?] Appointment [2] |date|id=BRACKET_DATE|
      [END,end] Done.
    `);

    const number = processById(processor, 'NUMBER').querySelector('#EXPLICIT_NUMBER');
    expect(number.id).toBe('EXPLICIT_NUMBER');
    expect(number.getAttribute('aria-label')).toBe('Explicit number');
    expect(number.getAttribute('aria-describedby')).toBe('EXPLICIT_NUMBER-desc');

    const date = processById(processor, 'DATE').querySelector('#EXPLICIT_DATE');
    expect(date.id).toBe('EXPLICIT_DATE');
    expect(date.hasAttribute('aria-label')).toBe(false);
    expect(date.getAttribute('aria-labelledby')).toBe('EXPLICIT_DATE_LABEL');
    expect(date.getAttribute('aria-describedby')).toBe('EXPLICIT_DATE-desc');

    const metadata = processById(processor, 'METADATA').querySelector('#METADATA_TEXT');
    expect(metadata.dataset.ariaLabel).toBe('metadata');
    expect(metadata.getAttribute('aria-label')).toBe('Enter a value');

    const hashNumber = processById(processor, 'HASH').querySelector('#HASH_NUMBER');
    expect(hashNumber.getAttribute('aria-label')).toBe('# of Hours');

    const choiceEmail = processById(processor, 'RADIO_SCALAR').querySelector('#CHOICE_EMAIL');
    const choiceDate = processById(processor, 'CHECK_SCALAR').querySelector('#CHOICE_DATE');
    expect(choiceEmail.getAttribute('aria-label')).toBe('Email');
    expect(choiceDate.getAttribute('aria-label')).toBe('Date');
    expect(processById(processor, 'PREFIX_NUMBER').querySelector('#PREFIX_NUMBER_VALUE').getAttribute('aria-label'))
      .toBe('times per day');
    expect(processById(processor, 'SUFFIX_NUMBER').querySelector('#SUFFIX_NUMBER_VALUE').getAttribute('aria-label'))
      .toBe('veces al día');
    expect(processById(processor, 'PAREN_CAPTION').querySelector('#PAREN_EMAIL').getAttribute('aria-label'))
      .toBe('Contact option (1)');
    expect(processById(processor, 'BRACKET_CAPTION').querySelector('#BRACKET_DATE').getAttribute('aria-label'))
      .toBe('Appointment [2]');
    expect(`${choiceEmail.getAttribute('aria-label')} ${choiceDate.getAttribute('aria-label')}`).not.toMatch(
      /<|>|class=|response|label=/i,
    );
  });

  it('protects accessible names from later choice parsing', async () => {
    const { processor } = await createProcessor(`
      {"name":"SCALAR_CHOICE_DELIMITERS"}
      [QUESTA11YOPTION_0_END?] Scalar names.
      |@|id=SCALAR_EMAIL aria-label='Contact option (1) [2] &amp; more'|
      |date|id=SCALAR_DATE aria-label='Appointment [2]'|
      |time|id=SCALAR_TIME aria-label='Preferred time (3)'|
      |__|__|id=SCALAR_NUMBER aria-label='Amount [4]'|
      [END,end] Done.
    `);
    const question = processById(processor, 'QUESTA11YOPTION_0_END');

    expect(question.querySelector('#SCALAR_EMAIL').getAttribute('aria-label')).toBe('Contact option (1) [2] & more');
    expect(question.querySelector('#SCALAR_DATE').getAttribute('aria-label')).toBe('Appointment [2]');
    expect(question.querySelector('#SCALAR_TIME').getAttribute('aria-label')).toBe('Preferred time (3)');
    expect(question.querySelector('#SCALAR_NUMBER').getAttribute('aria-label')).toBe('Amount [4]');
    expect(question.querySelector('#SCALAR_NUMBER').name).toBe('QUESTA11YOPTION_0_END');
    expect(question.querySelectorAll('input')).toHaveLength(4);
    expect(question.querySelectorAll('input[type="radio"], input[type="checkbox"]')).toHaveLength(0);
    expect(question.querySelectorAll('.response')).toHaveLength(0);
    expect(question.querySelector('label[for="SCALAR_TIME"]')).toBeNull();
  });

  it('includes conditional caption text only when it matches the scalar condition', async () => {
    const { processor } = await createProcessor(`
      {"name":"CONDITIONAL_SCALAR_NAMES"}
      [MATCHED?] Weight history.
      |displayif=equals(D_TRIGGER,1)|18 years old|
      |__|__|id=MATCHED_NUMBER displayif=equals(D_TRIGGER,1)||displayif=equals(D_TRIGGER,1)|Pounds|
      [MISMATCHED?] Stable caption |displayif=equals(D_TRIGGER,1)|optional qualifier| |__|__|id=MISMATCHED_NUMBER displayif=equals(D_TRIGGER,2)|
      [ALTERNATES?] Number of times |displayif=equals(D_TRIGGER,1)|fills||displayif=equals(D_TRIGGER,2)|filled| |__|__|id=ALTERNATE_NUMBER|
      [END,end] Done.
    `);

    expect(processById(processor, 'MATCHED').querySelector('#MATCHED_NUMBER').getAttribute('aria-label'))
      .toBe('18 years old, Pounds');
    expect(processById(processor, 'MISMATCHED').querySelector('#MISMATCHED_NUMBER').getAttribute('aria-label'))
      .toBe('Enter a value');
    expect(processById(processor, 'ALTERNATES').querySelector('#ALTERNATE_NUMBER').getAttribute('aria-label'))
      .toBe('Enter a value');
  });

  it('keeps generated number handlers intact inside display conditions', async () => {
    const { processor } = await createProcessor(`
      {"name":"CONDITIONAL_NUMBER_HANDLER"}
      [WEIGHT?] Weight history.
      |displayif=equals(SHOW_WEIGHT,1)|18 years old|
      |displayif=equals(SHOW_WEIGHT,1)||__|__|__|id=WEIGHT_VALUE min=0 max=999||displayif=equals(SHOW_WEIGHT,1)|Pounds|
      [END,end] Done.
    `);

    const weight = processById(processor, 'WEIGHT');
    const input = weight.querySelector('#WEIGHT_VALUE');
    const handler = input.getAttribute('onkeypress');

    expect(handler).toBe(WHOLE_NUMBER_KEYPRESS_HANDLER);
    expect(input.closest('.displayif')?.getAttribute('displayif')).toBe('equals(SHOW_WEIGHT,1)');
    expect(weight.querySelectorAll('.displayif')).toHaveLength(3);
    expect(weight.textContent).not.toContain('|displayif=');
    expect(weight.textContent).toContain('18 years old');
    expect(weight.textContent).toContain('Pounds');
  });

  it('does not add a visible delimiter to an already-closed conditional number', async () => {
    const { processor } = await createProcessor(`
      {"name":"CLOSED_CONDITIONAL_NUMBER"}
      [WEIGHT?] Enter a weight.
      |displayif=equals(SHOW_WEIGHT,1)||__|__|id=WEIGHT_VALUE||
      [END,end] Done.
    `);

    const weight = processById(processor, 'WEIGHT');
    const input = weight.querySelector('#WEIGHT_VALUE');

    expect(input.getAttribute('onkeypress')).toBe(WHOLE_NUMBER_KEYPRESS_HANDLER);
    expect(input.getAttribute('aria-label')).toBe('Enter a value');
    expect(input.closest('.displayif')?.getAttribute('displayif')).toBe('equals(SHOW_WEIGHT,1)');
    expect(weight.textContent).not.toContain('|');
  });

  it('renders radios, checkboxes, reset choices, named groups, labels, and yes/no macros', async () => {
    const { processor } = await createProcessor(`
      {"name":"CHOICES"}
      [RADIO?] Pick one.
      (1) One
      (2:NAMED|CUSTOM_LABEL) Two
      [CHECK?] Pick many.
      [1] First
      [99*] None
      [YN?] Answer. #YN
      [YNP?] Answer. #YNP
      [END,end] Done.
    `);

    const radio = processById(processor, 'RADIO');
    const check = processById(processor, 'CHECK');
    const yn = processById(processor, 'YN');
    const ynp = processById(processor, 'YNP');

    expect(radio.querySelectorAll('input[type="radio"]')).toHaveLength(2);
    expect(radio.querySelector('#NAMED_2').name).toBe('NAMED');
    expect(radio.querySelector('label[for="NAMED_2"]').id).toBe('CUSTOM_LABEL');
    expect(check.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    expect(check.querySelector('#CHECK_99').dataset.reset).toBe('true');
    expect(yn.querySelectorAll('[role="radiogroup"] input')).toHaveLength(2);
    expect(ynp.querySelectorAll('[role="radiogroup"] input')).toHaveLength(3);
  });

  it('renders grids, inline conditions, piped values, expressions, popovers, images, and hidden skips', async () => {
    const { processor } = await createProcessor(`
      {"name":"COMPOSITES"}
      [INTRO] Hello {$u:firstName}; saved {$SAVED:missing}; result {#1+1}.
      |displayif=equals(SHOW,1)|Visible text|
      |popup|More|Help|Synthetic help text|
      |image|example.org/test.png|40,80|
      < |if=equals(SHOW,1)| -> TARGET >
      [GRID_LEAD] Rate each.
      |grid?|id="GRID"|Frequency|[ROW_A] Alpha;[ROW_B] Beta;|(1: Never)(2: Often)|
      [TARGET] Target.
      [END,end] Done.
    `);

    const intro = processById(processor, 'INTRO');
    processor.processAllQuestions();
    const grid = processById(processor, 'GRID');

    expect(intro.querySelector('[name="firstName"]').textContent).toBe('Synthetic');
    expect(intro.querySelector('[forid="SAVED"]').getAttribute('optional')).toBe(encodeURIComponent('missing'));
    expect(intro.querySelector('[data-encoded-expression]')).not.toBeNull();
    expect(intro.querySelector('.displayif').getAttribute('displayif')).toBe('equals(SHOW,1)');
    expect(intro.querySelector('[data-bs-toggle="popover"]').getAttribute('data-bs-content')).toBe('Synthetic help text');
    expect(intro.querySelector('[data-bs-toggle="popover"]').getAttribute('data-bs-trigger')).toBe('manual');
    expect(intro.querySelector('img').src).toBe('https://example.org/test.png');
    expect(intro.querySelector('input[type="hidden"]').getAttribute('skipto')).toBe('TARGET');
    expect(grid.dataset.grid).toBe('true');
    expect(grid.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(grid.querySelectorAll('input[type="radio"]')).toHaveLength(4);
  });

  it('replaces fixed date tags deterministically', async () => {
    const { processor } = await createProcessor(`
      {"name":"DATES"}
      [Q] #currentYear #currentMonth #today #today + 2 #today - 20.
      [END,end] Done.
    `);
    const form = processById(processor, 'Q');

    expect(form.textContent.replace(/\s+/g, ' ')).toContain('2026 3 2026-3-15 2026-3-17 2026-2-23');
  });

  it('unrolls loop boundaries with deterministic IDs and loop metadata', async () => {
    const { processor } = await createProcessor(`
      {"name":"LOOPS"}
      [COUNT?] Count |__|__|id=D_123456789 min=0 max=2|
      <loop max=2>
        [ITEM?,displayif=greaterThanOrEqual(D_123456789,#loop)] Enter the {##} item.
        |__|id=ITEM_VALUE|
      </loop>
      [END,end] Done.
    `, { D_123456789: '2' });

    const ids = processor.questions.map(({ questionIDExactSearch }) => questionIDExactSearch);
    expect(ids).toEqual(['COUNT', 'ITEM_1_1', 'ITEM_2_2', 'END_OF_LOOP', 'END']);
    const first = processById(processor, 'ITEM_1_1');
    const second = processById(processor, 'ITEM_2_2');
    expect(first.textContent).toContain('1st item');
    expect(second.textContent).toContain('2nd item');
    expect(first.getAttribute('firstquestion')).toBe('1');
    expect(second.getAttribute('firstquestion')).toBe('2');
    expect(first.getAttribute('loopmax')).toBe('D_123456789');
  });

  it('renders the complete construct inventory through a reset full module graph', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { processor, moduleParams } = await createProcessor(ALL_CONSTRUCTS, {
      LIST_VALUE: ['one', 'two'],
      SAVED: 'restored',
      SHOW_BLOCK: '1',
      SHOW_CHECKBOX: '1',
      SHOW_GRID: '1',
      SHOW_INLINE: '1',
      SHOW_RADIO: '1',
      SHOW_ROW: '1',
    });
    processor.processAllQuestions();

    const forms = [...processor.getAllProcessedQuestions().values()];
    const root = document.createElement('div');
    forms.forEach((form) => root.append(form));

    expect(forms.map((form) => form.id)).toEqual([
      'PLAIN',
      'RADIO',
      'CHECKBOX',
      'COMBINED',
      'COMBINED_TEXTAREA',
      'CONFIRM',
      'EMAIL',
      'PHONE',
      'FULL_SSN',
      'SHORT_SSN',
      'ZIP',
      'STATE',
      'DATE',
      'MONTH',
      'TIME',
      'NUMBER',
      'TEXT',
      'TEXTBOX',
      'TEXTAREA',
      'HIDDEN',
      'YES_NO',
      'YES_NO_PREFER',
      'DEFAULT_SKIP',
      'NO_RESPONSE_SKIP',
      'GRID_RADIO',
      'GRID_CHECKBOX',
      'D_900000002',
      'LOOP_ITEM_1_1',
      'LOOP_ITEM_2_2',
      'END_OF_LOOP',
      'END',
    ]);
    expect(root.querySelectorAll('#PLAIN .displayif')).toHaveLength(2);
    expect(root.querySelectorAll('#PLAIN .displayList')).toHaveLength(2);
    expect(root.querySelector('#PLAIN [data-bs-toggle="popover"]')?.dataset.bsContent).toBe('Synthetic help text');
    expect(root.querySelector('#PLAIN img')?.src).toBe('https://episphere.github.io/quest/images/FemaleBaldness1.png');
    expect(root.querySelectorAll('#RADIO input[type="radio"]')).toHaveLength(2);
    expect(root.querySelectorAll('#CHECKBOX input[type="checkbox"]')).toHaveLength(3);
    expect(root.querySelector('#CHECKBOX')?.dataset).toMatchObject({ minCount: '1', maxCount: '2' });
    expect(root.querySelector('#CHECKBOX input[data-reset="true"]')).not.toBeNull();
    expect(root.querySelector('#COMBINED_807835037')?.getAttribute('skipto')).toBe('EMAIL');
    expect(root.querySelector('#COMBINED_TEXT')?.type).toBe('text');
    expect(root.querySelector('#COMBINED_TEXT')?.getAttribute('aria-label')).toBe('Other');
    expect(root.querySelector('#COMBINED_TEXTAREA_GROUP_1')?.getAttribute('skipto')).toBe('EMAIL');
    expect(root.querySelector('#COMBINED_TEXTAREA_VALUE')?.tagName).toBe('TEXTAREA');
    expect(root.querySelector('#CONFIRM_COPY')?.getAttribute('confirm')).toBeNull();
    expect(root.querySelector('#CONFIRM_COPY')?.dataset.confirm).toBe('CONFIRM_ORIGINAL');
    expect(root.querySelector('#CONFIRM_ORIGINAL')?.dataset.confirmationFor).toBe('CONFIRM_COPY');

    expect(root.querySelector('#EMAIL_VALUE')?.type).toBe('email');
    expect(root.querySelector('#PHONE_VALUE')?.type).toBe('tel');
    expect(root.querySelector('#FULL_SSN_VALUE')?.classList).toContain('SSN');
    expect(root.querySelector('#SHORT_SSN_VALUE')?.classList).toContain('SSNsm');
    expect(root.querySelector('#ZIP_VALUE')?.classList).toContain('zipcode');
    expect(root.querySelector('#STATE_VALUE')?.tagName).toBe('SELECT');
    expect(root.querySelector('#DATE_VALUE')?.type).toBe('date');
    expect(root.querySelector('#MONTH_VALUE')?.type).toBe('month');
    expect(root.querySelector('#TIME_VALUE')?.type).toBe('time');
    expect(root.querySelector('#NUMBER_VALUE')?.type).toBe('number');
    expect(root.querySelector('#TEXT_VALUE')?.type).toBe('text');
    expect(root.querySelector('#TEXTBOX_VALUE')?.type).toBe('text');
    expect(root.querySelector('#TEXTAREA_VALUE')?.tagName).toBe('TEXTAREA');
    expect(root.querySelector('#HIDDEN_VALUE')?.dataset.hidden).toBe('true');
    expect(root.querySelectorAll('#YES_NO input[type="radio"]')).toHaveLength(2);
    expect(root.querySelectorAll('#YES_NO_PREFER input[type="radio"]')).toHaveLength(3);
    expect(root.querySelector('#DEFAULT_SKIP input[type="hidden"]')?.getAttribute('skipto')).toBe('GRID_RADIO');
    expect(root.querySelector('#NO_RESPONSE_SKIP input.noresponse')?.getAttribute('skipto')).toBe('GRID_RADIO');
    expect(root.querySelectorAll('#GRID_RADIO input[type="radio"]')).toHaveLength(4);
    expect(root.querySelectorAll('#GRID_CHECKBOX input[type="checkbox"]')).toHaveLength(2);
    expect(root.querySelectorAll('form.question[id^="LOOP_ITEM_"]')).toHaveLength(2);
    expect(moduleParams.errorLogger).not.toHaveBeenCalled();
  });

  it('caches processed questions and reports invalid indexes and IDs through the host logger', async () => {
    const { processor, moduleParams } = await createProcessor(`
      {"name":"CACHE"}
      [Q1] First.
      [Q2] Second.
      [END,end] Done.
    `);

    const first = processor.processQuestion(0);
    expect(processor.processQuestion(0)).toBe(first);
    expect(processor.processQuestion(-1)).toBeNull();
    expect(processor.findQuestion('MISSING')).toEqual({ question: null, index: -1 });
    expect(moduleParams.errorLogger).toHaveBeenCalledWith(expect.stringContaining('question not found'));
  });
});

describe('QuestionProcessor navigation and processing lifecycle', () => {
  const NAVIGATION_MARKDOWN = `
    {"name":"NAVIGATION"}
    [Q10] Prefix neighbor.
    [Q1] First.
    [Q2] Second.
    [END,end] Done.
  `;

  it('prefers exact IDs and transfers the active question during explicit forward and back navigation', async () => {
    const { processor, moduleParams } = await createProcessor(
      NAVIGATION_MARKDOWN,
      {},
      { renderFullQuestionList: false },
    );

    const initial = processor.loadInitialQuestionOnStartup('Q1');
    expect(initial.id).toBe('Q1');
    expect(initial.classList).toContain('active');
    expect(processor.findQuestion('Q1').index).toBe(1);

    const second = processor.loadNextQuestion('Q2');
    expect(second.id).toBe('Q2');
    expect(initial.classList).not.toContain('active');
    expect(second.classList).toContain('active');

    const previous = processor.loadPreviousQuestion('Q1');
    expect(previous).toBe(initial);
    expect(second.classList).not.toContain('active');
    expect(initial.classList).toContain('active');
    expect(moduleParams.errorLogger).not.toHaveBeenCalled();
  });

  it('advances sequentially and returns null without moving past either navigation boundary', async () => {
    const { processor, moduleParams } = await createProcessor(NAVIGATION_MARKDOWN);

    expect(processor.getNextSequentialQuestionID()).toBe('Q1');
    expect(processor.currentQuestionIndex).toBe(1);

    processor.setCurrentQuestionIndex('update', processor.questions.length - 1);
    expect(processor.getNextSequentialQuestionID()).toBeNull();
    expect(processor.currentQuestionIndex).toBe(processor.questions.length - 1);

    processor.setCurrentQuestionIndex('update', 0);
    expect(processor.loadPreviousQuestion('Q1')).toBeNull();

    processor.setCurrentQuestionIndex('update', -1);
    expect(processor.getCurrentQuestion()).toBeNull();
    expect(moduleParams.errorLogger).toHaveBeenCalledTimes(3);
  });

  it('reports empty and missing startup targets without activating a question', async () => {
    const empty = await createProcessor('{"name":"EMPTY"}');
    expect(empty.processor.loadInitialQuestionOnStartup('Q1')).toBeNull();
    expect(empty.moduleParams.errorLogger).toHaveBeenCalledWith(
      expect.stringContaining('no questions found'),
      [],
    );

    const missing = await createProcessor(NAVIGATION_MARKDOWN);
    expect(missing.processor.loadInitialQuestionOnStartup('MISSING')).toBeNull();
    expect(missing.moduleParams.errorLogger).toHaveBeenCalledWith(
      expect.stringContaining('question not found'),
      'MISSING',
    );
  });

  it('logs invalid active-class and forward-navigation boundaries without unloading the active form', async () => {
    const { processor, moduleParams } = await createProcessor(NAVIGATION_MARKDOWN);
    const active = processor.loadInitialQuestionOnStartup('Q1');

    expect(processor.manageActiveQuestionClass(null, active)).toBeNull();
    expect(active.classList).toContain('active');

    processor.currentQuestionIndex = processor.questions.length;
    expect(processor.loadNextQuestion('END')).toBeNull();
    expect(processor.currentQuestionIndex).toBe(processor.questions.length);
    expect(moduleParams.errorLogger).toHaveBeenCalledTimes(2);
  });

  it('processes partial batches once, clamps ranges, and makes completion idempotent', async () => {
    const { processor } = await createProcessor(NAVIGATION_MARKDOWN);
    const processQuestion = vi.spyOn(processor, 'processQuestion');

    processor.processAllQuestions(-10, 2);
    expect([...processor.getAllProcessedQuestions().keys()]).toEqual([0, 1]);
    expect(processor.isProcessingComplete).toBe(false);

    processQuestion.mockClear();
    processor.processAllQuestions(0, 3);
    expect(processQuestion).toHaveBeenCalledTimes(1);
    expect(processQuestion).toHaveBeenCalledWith(2);

    processor.processAllQuestions(0, 100);
    expect(processor.getAllProcessedQuestions()).toHaveLength(4);
    expect(processor.isProcessingComplete).toBe(true);

    processQuestion.mockClear();
    processor.processAllQuestions();
    expect(processQuestion).not.toHaveBeenCalled();
  });
});

describe('QuestionProcessor loop runtime', () => {
  const LOOP_MARKDOWN = `
    {"name":"LOOP_RUNTIME"}
    [COUNT?] Count |__|__|id=D_100 min=0 max=2|
    <loop max=2>
      [ITEM?,displayif=greaterThanOrEqual(D_100,#loop)] Item {##}.
      |__|id=ITEM_VALUE|
    </loop>
    [AFTER] After the loop.
    [END,end] Done.
  `;

  it('continues to the next iteration, then exits when the response boundary changes', async () => {
    const { processor, moduleParams } = await createProcessor(LOOP_MARKDOWN, { D_100: '2' });
    const firstLoopIndex = processor.questions.findIndex(({ questionIDExactSearch }) => questionIDExactSearch === 'ITEM_1_1');
    processor.processQuestion(firstLoopIndex);
    processor.setCurrentQuestionIndex('update', firstLoopIndex);

    expect(processor.getLoopData()).toMatchObject({
      locationIndex: firstLoopIndex,
      loopMaxQuestionID: 'D_100',
      loopMaxResponse: 2,
      loopFirstQuestionID: 'ITEM',
    });
    expect(processor.findQuestion('_CONTINUE1_1_1')).toMatchObject({
      question: expect.objectContaining({ id: 'ITEM_2_2' }),
    });

    processor.checkLoopMaxData();
    processor.checkLoopMaxData('UNRELATED', '1');
    processor.checkLoopMaxData('D_100', 'not-a-number');
    expect(processor.getLoopData().loopMaxResponse).toBe(2);
    expect(moduleParams.errorLogger).toHaveBeenCalledWith(expect.stringContaining('invalid response'));

    processor.checkLoopMaxData('D_100', '1');
    const afterLoop = processor.findQuestion('_CONTINUE1_1_1');
    expect(afterLoop.question.id).toBe('AFTER');
    expect(afterLoop.index).toBe(processor.questions.findIndex(({ questionIDExactSearch }) => questionIDExactSearch === 'AFTER'));

    processor.checkLoopMaxData('D_100', '0');
    expect(processor.findQuestion('_CONTINUE1_1_1').question.id).toBe('AFTER');
  });

  it('reconstructs loop data when resuming after the first iteration', async () => {
    const { processor } = await createProcessor(LOOP_MARKDOWN, { D_100: '2' });
    const secondLoopIndex = processor.questions.findIndex(({ questionIDExactSearch }) => questionIDExactSearch === 'ITEM_2_2');
    processor.setCurrentQuestionIndex('update', secondLoopIndex);

    expect(processor.loopDataArr).toEqual([]);
    expect(processor.getLoopData()).toMatchObject({
      locationIndex: secondLoopIndex - 1,
      loopMaxResponse: 2,
      loopFirstQuestionID: 'ITEM',
    });
  });

  it('selects the nearest preceding loop and localizes generated ordinals', async () => {
    const { processor } = await createProcessor(`
      {"name":"MULTIPLE_LOOPS"}
      [D_101?] First count |__|__|id=D_101|
      <loop max=1>
        [FIRST?,displayif=greaterThanOrEqual(D_101,#loop)] First {##}.
      </loop>
      [D_102?] Second count |__|__|id=D_102|
      <loop max=1>
        [SECOND?,displayif=greaterThanOrEqual(D_102,#loop)] Second {##}.
      </loop>
      [END,end] Done.
    `, { D_101: '1', D_102: '1' }, { language: 'es' });

    processor.processAllQuestions();
    const secondLoopIndex = processor.questions.findIndex(({ questionIDExactSearch }) => questionIDExactSearch === 'SECOND_1_1');
    processor.setCurrentQuestionIndex('update', secondLoopIndex);

    expect(processor.getLoopData()).toMatchObject({
      loopMaxQuestionID: 'D_102',
      loopFirstQuestionID: 'SECOND',
    });
    expect(processById(processor, 'SECOND_1_1').textContent).toContain('1o');
  });

  it('returns explicit fallbacks when no loop metadata or terminal marker exists', async () => {
    const { processor, moduleParams } = await createProcessor(`
      {"name":"NO_LOOP"}
      [Q1] Only question.
      [END,end] Done.
    `);

    expect(processor.getLoopData()).toBeNull();
    expect(processor.findEndOfLoop()).toEqual({ question: null, index: -1 });
    expect(processor.findQuestion('_CONTINUE1_1_1')).toBeNull();
    expect(moduleParams.errorLogger).toHaveBeenCalledWith(expect.stringContaining('no end of loop found'));
    expect(moduleParams.errorLogger).toHaveBeenCalledWith(expect.stringContaining('loop data not found'));
  });

  it('preserves loop metadata and English teen ordinals', async () => {
    const { processor } = await createProcessor(`
      {"name":"LOOP_ORDINALS"}
      [D_300?] Count |__|__|id=D_300|
      <loop max=13>
        [ITEM?|firstquestion=#loop|,displayif=greaterThanOrEqual(D_300,#loop)] Item {##}.
      </loop>
      [END,end] Done.
    `, { D_300: '13' });

    expect(processById(processor, 'ITEM_11_11').textContent).toContain('11th');
    expect(processById(processor, 'ITEM_12_12').textContent).toContain('12th');
    expect(processById(processor, 'ITEM_13_13').textContent).toContain('13th');
    expect(processById(processor, 'ITEM_1_1')).toMatchObject({
      id: 'ITEM_1_1',
    });
    expect(processById(processor, 'ITEM_1_1').getAttribute('firstquestion')).toBe('1');
    expect(processById(processor, 'ITEM_1_1').getAttribute('loopmax')).toBe('D_300');
  });
});

describe('QuestionProcessor grid and related-form lookup', () => {
  const LOOKUP_MARKDOWN = `
    {"name":"LOOKUPS"}
    [D_200] Existing dependency.
    [COMPOUND?] Compound |__|id=COMPOUND_VALUE|
    [CONDITIONAL?] Conditional |__|id=CONDITIONAL_VALUE displayif=doesNotExist("D_200")|
    [HIDDEN] Hidden |hidden|id=HIDDEN_VALUE|
    |grid?|id="GRID_LOOKUP"|Frequency|[ROW_A] Alpha;|(1: Never)(2: Often)|
    [END,end] Done.
  `;

  it('resolves grid response values and reports unknown grid controls', async () => {
    const { processor, moduleParams } = await createProcessor(LOOKUP_MARKDOWN);

    expect(processor.findGridRadioCheckboxEle('ROW_A_0')).toBe('1');
    expect(processor.findGridRadioCheckboxEle('ROW_A_1')).toBe('2');
    processor.findQuestion('GRID_LOOKUP').question.querySelector('#ROW_A_0').value = '';
    expect(processor.findGridRadioCheckboxEle('ROW_A_0')).toBeNull();
    expect(processor.findGridRadioCheckboxEle('MISSING_GRID_CONTROL')).toBeNull();
    expect(moduleParams.errorLogger).toHaveBeenCalledWith(expect.stringContaining('MISSING_GRID_CONTROL'));
  });

  it('finds owning forms while excluding same-ID, hidden, conditional, and missing controls', async () => {
    const withDependency = await createProcessor(LOOKUP_MARKDOWN, { D_200: 'present' });
    expect(withDependency.processor.findRelatedFormID('COMPOUND_VALUE')).toBe('COMPOUND');
    expect(withDependency.processor.findRelatedFormID('COMPOUND')).toBe('');
    expect(withDependency.processor.findRelatedFormID('HIDDEN_VALUE')).toBe('');
    expect(withDependency.processor.findRelatedFormID('CONDITIONAL_VALUE')).toBe('CONDITIONAL');
    expect(withDependency.processor.findRelatedFormID('MISSING_CONTROL')).toBe('');
    expect(withDependency.moduleParams.errorLogger).toHaveBeenCalledWith(expect.stringContaining('MISSING_CONTROL'));

    const withoutDependency = await createProcessor(LOOKUP_MARKDOWN);
    expect(withoutDependency.processor.findRelatedFormID('CONDITIONAL_VALUE')).toBe('');
  });
});

describe('QuestionProcessor parser boundaries', () => {
  it('adds a localized placeholder to an otherwise empty host-provided async question', async () => {
    const { processor } = await createProcessor(`
      {"name":"ASYNC_PLACEHOLDER"}
      [ASYNC?]
      [END,end] Done.
    `, {}, {
      asyncQuestionsMap: {
        '[ASYNC?]': { func: 'loadSyntheticQuestion', args: [] },
      },
    });

    expect(processById(processor, 'ASYNC').textContent).toContain('Loading...');
  });

  it('generates stable default IDs and renders terminal button variants', async () => {
    const { processor } = await createProcessor(`
      {"name":"PARSER_BOUNDARIES"}
      [EMAIL?] Email |@|
      [PHONE?] Phone |tel|
      [DATE?] Date |date|
      [MONTH?] Month |month|
      [TIME?] Time |time|
      [STOP?,end=noback] Stop here |__||
      [END,end] Done.
    `);

    expect(processById(processor, 'EMAIL').querySelector('#EMAIL_email')).not.toBeNull();
    expect(processById(processor, 'PHONE').querySelector('#PHONE_tel')).not.toBeNull();
    expect(processById(processor, 'DATE').querySelector('#DATE_date')).not.toBeNull();
    expect(processById(processor, 'MONTH').querySelector('#MONTH_month')).not.toBeNull();
    expect(processById(processor, 'TIME').querySelector('#TIME_time')).not.toBeNull();

    const stop = processById(processor, 'STOP');
    expect(stop.querySelector('.next')).toBeNull();
    expect(stop.querySelector('.previous')).toBeNull();
    expect(stop.querySelector('[data-click-type="reset"]')).not.toBeNull();

    const end = processById(processor, 'END');
    expect(end.querySelector('[data-click-type="submitSurvey"]')).not.toBeNull();
    expect(end.querySelector('.previous')).not.toBeNull();
    expect(end.querySelector('.next')).toBeNull();
  });

  it('preserves legacy alphanumeric choice, nested-text, naming, and skip metadata', async () => {
    const { processor } = await createProcessor(`
      {"name":"LEGACY_COMBINED_CONTROLS"}
      [DEFAULT_GROUP?] Other response.
      [other] Explain <input type="text" id="DEFAULT_TEXT"></input> -> END
      [NAMED_GROUP?] Named response.
      (other:CUSTOM_GROUP) Explain <input type="text" id="NAMED_TEXT"></input> -> END
      [EXPLICIT_ID_GROUP?] Explicit ID response.
      [other|id=EXPLICIT_CHOICE] Explain <input type="text" id="EXPLICIT_TEXT"></input> -> END
      [END,end] Done.
    `);

    const defaultChoice = processById(processor, 'DEFAULT_GROUP').querySelector('#DEFAULT_GROUP_other');
    expect(defaultChoice).toMatchObject({
      type: 'checkbox',
      name: 'DEFAULT_GROUP',
      value: 'other',
    });
    expect(defaultChoice.getAttribute('skipto')).toBe('END');
    expect(defaultChoice.labels[0].querySelector('#DEFAULT_TEXT')).not.toBeNull();

    const namedChoice = processById(processor, 'NAMED_GROUP').querySelector('#CUSTOM_GROUP');
    expect(namedChoice).toMatchObject({
      type: 'radio',
      name: 'CUSTOM_GROUP',
      value: 'other',
    });
    expect(namedChoice.getAttribute('skipto')).toBe('END');
    expect(namedChoice.labels[0].querySelector('#NAMED_TEXT')).not.toBeNull();

    const explicitChoice = processById(processor, 'EXPLICIT_ID_GROUP').querySelector('#EXPLICIT_CHOICE');
    expect(explicitChoice).toMatchObject({
      type: 'checkbox',
      name: 'EXPLICIT_ID_GROUP',
      value: 'other',
    });
    expect(explicitChoice.getAttribute('skipto')).toBe('END');
    expect(explicitChoice.labels[0].querySelector('#EXPLICIT_TEXT')).not.toBeNull();
  });

  it('handles optionless text controls, restored dates, wide ranges, and titleless popovers', async () => {
    const { processor } = await createProcessor(`
      {"name":"SCALAR_PARTITIONS"}
      [PROFILE] Missing profile {$u:notProvided}; direct value {$DIRECT_VALUE}.
      |popup|More|Titleless help text|
      [DATE_VALUE?] Date |date|value=2026-03-15|
      [MONTH_VALUE?] Month |month|value=2026-03|
      [WIDE_NUMBER?] Number |__|__|min=1 max=100|
      [DEFAULT_TEXTBOX?] Text [text box]
      [DEFAULT_TEXTAREA?] Notes |___|
      [END,end] Done.
    `);

    const profile = processById(processor, 'PROFILE');
    expect(profile.querySelector('[name="notProvided"]').textContent).toBe('');
    expect(profile.querySelector('[forid="DIRECT_VALUE"]').getAttribute('optional')).toBeNull();
    expect(profile.querySelector('[data-bs-toggle="popover"]')).toMatchObject({
      title: '',
    });
    expect(profile.querySelector('[data-bs-toggle="popover"]').dataset.bsContent).toBe('Titleless help text');
    expect(processById(processor, 'DATE_VALUE').querySelector('input').value).toBe('2026-03-15');
    expect(processById(processor, 'MONTH_VALUE').querySelector('input').value).toBe('2026-03');
    expect(processById(processor, 'WIDE_NUMBER').querySelector('input')).toMatchObject({
      id: 'WIDE_NUMBER_num',
      placeholder: 'Enter a value',
    });
    expect(processById(processor, 'DEFAULT_TEXTBOX').querySelector('#DEFAULT_TEXTBOX_text')).not.toBeNull();
    expect(processById(processor, 'DEFAULT_TEXTAREA').querySelector('#DEFAULT_TEXTAREA_ta')).not.toBeNull();
  });

  it('parses production-sized pipe-rich prompts before number and linked-text controls', async () => {
    const longConditionalLine = '|displayif=equals(D_TRIGGER,1)|<b>home</b>|'.repeat(150);
    expect(`[LONG_NUMBER?] ${longConditionalLine}`.length).toBeGreaterThan(6_401);

    const { processor, moduleParams } = await createProcessor(`
      {"name":"LONG_TEXT_INPUT_LINES"}
      [LONG_NUMBER?] ${longConditionalLine}
      Year moved out |__|__|__|__|id=LONG_NUMBER_VALUE min=1900 max=2030|
      [LONG_TEXT?] ${longConditionalLine}
      (807835037) Other: Please describe |__|id=LONG_TEXT_VALUE|
      [END,end] Done.
    `);

    expect(() => processor.processAllQuestions()).not.toThrow();

    const longNumber = processById(processor, 'LONG_NUMBER');
    expect(longNumber.querySelectorAll('input')).toHaveLength(1);
    expect(longNumber.querySelector('#LONG_NUMBER_VALUE')).toMatchObject({
      name: 'LONG_NUMBER',
      type: 'number',
    });
    expect(longNumber.querySelector('#LONG_NUMBER_VALUE').getAttribute('aria-label'))
      .toBe('Year moved out');

    const longText = processById(processor, 'LONG_TEXT');
    expect(longText.querySelectorAll('input[type="text"]')).toHaveLength(1);
    expect(longText.querySelector('#LONG_TEXT_VALUE')).toMatchObject({
      name: 'LONG_TEXT',
      type: 'text',
    });
    expect(longText.querySelector('#LONG_TEXT_VALUE').getAttribute('aria-label'))
      .toBe('Other: Please describe');
    expect(longText.querySelectorAll('input[type="radio"]')).toHaveLength(1);
    expect(longText.querySelector('input[type="radio"]').labels).toHaveLength(1);

    expect(longNumber.innerHTML).not.toContain('|__|');
    expect(longText.innerHTML).not.toContain('|__|');
    expect(moduleParams.errorLogger).not.toHaveBeenCalled();
  });
});
