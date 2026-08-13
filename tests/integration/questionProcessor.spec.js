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
    expect(all.querySelector('#TIME_VALUE').getAttribute('aria-label')).toBe('Enter Time');
    expect(all.querySelector('#HIDDEN_VALUE').dataset.hidden).toBe('true');
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

  it('continues to the next authored iteration, then exits when the response boundary changes', async () => {
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

  it('preserves authored loop metadata and English teen ordinals', async () => {
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
});
