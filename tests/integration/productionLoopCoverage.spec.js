import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const corpusRoot = path.join(
  repositoryRoot,
  '.cache/questionnaire/7ae99a22af325cf0e14be047a7636462db9bfd50/prod',
);

const PRECALCULATED = {
  current_date: new Date('2026-03-15T12:00:00Z'),
  current_day: 15,
  current_month: 3,
  current_month_str: 'March',
  current_year: 2026,
  quest_format_date: '2026-3-15',
};

const LOOP_CASES = [
  {
    label: 'Module 1 siblings',
    file: 'module1.txt',
    countId: 'D_694265648',
    firstId: 'D_406098499',
    earlyExitId: 'D_607773106',
    loopIndex: 1,
    afterLoopId: 'CHILD',
    minimum: 0,
    maximum: 25,
  },
  {
    label: 'Module 1 children',
    file: 'module1.txt',
    countId: 'D_446999144',
    firstId: 'D_714001034',
    earlyExitId: 'D_718867914',
    loopIndex: 2,
    afterLoopId: 'SECTION5',
    minimum: 0,
    maximum: 25,
  },
  {
    label: 'COVID illnesses',
    file: 'moduleCOVID19.txt',
    countId: 'D_860011428',
    firstId: 'D_980800222_V2',
    earlyExitId: 'SRVCOV_COVSUMMARY_V1R0',
    loopIndex: 1,
    afterLoopId: 'COV19_SKIP',
    minimum: 1,
    maximum: 25,
  },
  {
    label: 'COVID vaccinations',
    file: 'moduleCOVID19.txt',
    countId: 'D_877074400_V2',
    firstId: 'D_715581797_V2',
    earlyExitId: 'SRVCOV_COV29_V1R0',
    loopIndex: 2,
    afterLoopId: 'END',
    minimum: 1,
    maximum: 10,
  },
];

function lockedMarkdown(file) {
  return readFileSync(path.join(corpusRoot, file), 'utf8');
}

function localizedFile(loop, language) {
  if (language === 'en') return loop.file;
  return loop.file === 'module1.txt' ? 'module1Spanish.txt' : 'moduleCOVID19Spanish.txt';
}

function exactQuestionIndex(processor, id) {
  return processor.questions.findIndex(({ questionIDExactSearch }) => questionIDExactSearch === id);
}

async function createProcessor(markdown, initialState = {}, language = 'en') {
  vi.resetModules();
  const questionnaire = await import('../../questionnaire.js');
  const i18n = (await import(`../../i18n/${language}.js`)).default;
  questionnaire.moduleParams.i18n = i18n;
  questionnaire.moduleParams.errorLogger = vi.fn();
  questionnaire.moduleParams.previousResults = {};
  questionnaire.moduleParams.asyncQuestionsMap = {};
  questionnaire.moduleParams.renderFullQuestionList = true;
  questionnaire.moduleParams.isRenderer = true;

  const stateModule = await import('../../stateManager.js');
  stateModule.initializeStateManager();
  const state = stateModule.getStateManager();
  state.loadInitialSurveyState(initialState);

  const { initializeCustomMathJSFunctions } = await import('../../customMathJSImplementation.js');
  initializeCustomMathJSFunctions();
  const { QuestionProcessor } = await import('../../questionProcessor.js');
  const processor = new QuestionProcessor(markdown, PRECALCULATED, i18n);
  state.setQuestionProcessor(processor);
  return { processor, state };
}

function prepareLoop(processor, firstId) {
  const firstIndex = exactQuestionIndex(processor, `${firstId}_1_1`);
  expect(firstIndex, `${firstId} should be expanded`).toBeGreaterThanOrEqual(0);
  processor.processQuestion(firstIndex);
  processor.setCurrentQuestionIndex('update', firstIndex);
  return firstIndex;
}

function continuationId(loopIndex, iteration) {
  return `_CONTINUE${loopIndex}_${iteration}_${iteration}`;
}

describe('locked production loop expansion and navigation', () => {
  it.each(['en', 'es'])('keeps Module 1 and COVID loop definitions aligned in %s', async (language) => {
    const module1File = language === 'en' ? 'module1.txt' : 'module1Spanish.txt';
    const covidFile = language === 'en' ? 'moduleCOVID19.txt' : 'moduleCOVID19Spanish.txt';
    const module1 = await createProcessor(lockedMarkdown(module1File), {}, language);
    const covid = await createProcessor(lockedMarkdown(covidFile), {}, language);

    for (const loop of LOOP_CASES) {
      const processor = loop.file === 'module1.txt' ? module1.processor : covid.processor;
      const first = processor.processQuestion(exactQuestionIndex(processor, `${loop.firstId}_1_1`));
      const last = processor.processQuestion(exactQuestionIndex(processor, `${loop.firstId}_25_25`));

      expect(first.id).toBe(`${loop.firstId}_1_1`);
      expect(last.id).toBe(`${loop.firstId}_25_25`);
      expect(first.getAttribute('firstquestion')).toBe('1');
      expect(first.getAttribute('loopmax')).toBe(loop.countId);
      expect(first.getAttribute('loopindx')).toBe(String(loop.loopIndex));
      const countControl = processor.processQuestion(exactQuestionIndex(processor, loop.countId))
        .querySelector('input[type="number"]');
      expect(countControl).not.toBeNull();
      expect(Number(countControl.min)).toBe(loop.minimum);
      expect(countControl.max).toBe(loop.maximum === 25 && loop.countId === 'D_860011428' ? '' : String(loop.maximum));
    }
  });

  it.each(LOOP_CASES)('$label respects valid participant bounds in English and Spanish', async (loop) => {
    const validCounts = [...new Set([loop.minimum, 1, 2, loop.maximum])].sort((left, right) => left - right);
    for (const language of ['en', 'es']) {
      for (const count of validCounts) {
        const { processor } = await createProcessor(
          lockedMarkdown(localizedFile(loop, language)),
          { [loop.countId]: String(count) },
          language,
        );
        prepareLoop(processor, loop.firstId);

        const firstContinuation = processor.findQuestion(continuationId(loop.loopIndex, 1));
        expect(firstContinuation.question, `${loop.label}, ${language}, count ${count}`).not.toBeNull();

        if (count < 2) {
          expect(firstContinuation.question.id).toBe(loop.afterLoopId);
        } else {
          expect(firstContinuation.question.id).toBe(`${loop.firstId}_2_2`);
        }

        const lastIndex = exactQuestionIndex(processor, `${loop.firstId}_${loop.maximum}_${loop.maximum}`);
        processor.setCurrentQuestionIndex('update', lastIndex);
        expect(processor.findQuestion(continuationId(loop.loopIndex, loop.maximum)).question.id).toBe(loop.afterLoopId);
      }
    }
  });

  it('keeps the COVID vaccination copies 11 through 25 outside valid participant navigation', async () => {
    const vaccineLoop = LOOP_CASES.find(({ label }) => label === 'COVID vaccinations');
    const { processor } = await createProcessor(lockedMarkdown(vaccineLoop.file), {
      [vaccineLoop.countId]: String(vaccineLoop.maximum),
    });
    prepareLoop(processor, vaccineLoop.firstId);

    const finalValidIndex = exactQuestionIndex(
      processor,
      `${vaccineLoop.firstId}_${vaccineLoop.maximum}_${vaccineLoop.maximum}`,
    );
    processor.setCurrentQuestionIndex('update', finalValidIndex);
    expect(processor.findQuestion(continuationId(vaccineLoop.loopIndex, vaccineLoop.maximum)).question.id)
      .toBe(vaccineLoop.afterLoopId);

    expect(exactQuestionIndex(processor, `${vaccineLoop.firstId}_11_11`)).toBeGreaterThan(finalValidIndex);
    expect(exactQuestionIndex(processor, `${vaccineLoop.firstId}_25_25`)).toBeGreaterThan(finalValidIndex);
  });

  it.each(LOOP_CASES)('$label routes an authored early exit to the next iteration', async (loop) => {
    const { processor } = await createProcessor(lockedMarkdown(loop.file), { [loop.countId]: '2' });
    prepareLoop(processor, loop.firstId);
    const earlyExitIndex = exactQuestionIndex(processor, `${loop.earlyExitId}_1_1`);
    expect(earlyExitIndex, `${loop.earlyExitId} should be expanded`).toBeGreaterThanOrEqual(0);
    processor.setCurrentQuestionIndex('update', earlyExitIndex);

    expect(processor.findQuestion(continuationId(loop.loopIndex, 1)).question.id)
      .toBe(`${loop.firstId}_2_2`);
  });

  it.each(LOOP_CASES)('$label reconstructs loop state from a persisted second iteration without losing suffixed response keys', async (loop) => {
    const initialState = {
      [loop.countId]: '2',
      [`${loop.firstId}_1_1`]: 'first response',
      [`${loop.firstId}_2_2`]: 'second response',
    };
    const { processor, state } = await createProcessor(lockedMarkdown(loop.file), initialState);
    const secondIndex = exactQuestionIndex(processor, `${loop.firstId}_2_2`);
    processor.setCurrentQuestionIndex('update', secondIndex);

    expect(processor.loopDataArr).toEqual([]);
    expect(processor.getLoopData()).toMatchObject({
      loopMaxQuestionID: loop.countId,
      loopMaxResponse: 2,
      loopFirstQuestionID: loop.firstId,
    });
    expect(state.getSurveyState()).toMatchObject(initialState);
    expect(state.getSurveyState()).not.toHaveProperty(loop.firstId);
  });
});
