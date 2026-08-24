import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import en from '../../i18n/en.js';
import es from '../../i18n/es.js';
import { QuestionProcessor } from '../../questionProcessor.js';
import { moduleParams } from '../../questionnaire.js';
import { initializeStateManager, getStateManager } from '../../stateManager.js';
import { initializeCustomMathJSFunctions } from '../../customMathJSImplementation.js';
import { renderFreshQuest } from '../helpers/questRuntime.js';
import { corpusCacheDirectory, loadCorpusLock } from './scripts/lib/corpus.mjs';

const DIRECT_PIPE = /^([A-Za-z_]\w*(?:\.\w+)?)$/;
const TOKEN = /\{([$#])([^}]+)\}/g;
const QUESTION_MARKER = /^\[([A-Z_][A-Z0-9_#]*)(?:[?!])?(?:\|[^\]]+\|)?(?:,[^\]]*)?\]/gm;
const LOOP_SUFFIX = /_\d+_\d+$/;

const EXPECTED_DIRECT_PIPES = {
  'module1/en': 71,
  'module1/es': 71,
  'module2/en': 19,
  'module2/es': 19,
  'module3/en': 171,
  'module3/es': 171,
  'module4/en': 5048,
  'module4/es': 5049,
  'module2024ConnectExperience/en': 3,
  'module2024ConnectExperience/es': 3,
  'moduleCOVID19/en': 30,
  'moduleCOVID19/es': 30,
  'moduleCancerScreeningHistory/en': 1,
  'moduleCancerScreeningHistory/es': 1,
};

const EXPECTED_TOKEN_COUNTS = {
  direct: 10687,
  user: 162,
  expression: 74,
  hashExpression: 89,
  other: 0,
};

const EXPECTED_DISPLAY_LISTS = [
  'module1/en/SIBSUM',
  'module1/en/CHILDSUM',
  'module1/es/SIBSUM',
  'module1/es/CHILDSUM',
  'moduleCOVID19/en/SRVCOV_COVSUMMARY_V1R0',
  'moduleCOVID19/es/SRVCOV_COVSUMMARY_V1R0',
];

const EXPECTED_LOCALE_DIFFERENCES = {
  module3: {
    englishOnly: ['D_349510816<-D_970325871'],
    spanishOnly: ['D_349510816<-D_700173707'],
  },
  module4: {
    englishOnly: [],
    spanishOnly: ['D_720221117<-D_814137809'],
  },
};

function withoutComments(markdown) {
  return markdown.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
}

function questionBlocks(markdown) {
  const markers = [...markdown.matchAll(QUESTION_MARKER)];
  return markers.map((marker, index) => ({
    id: marker[1],
    source: markdown.slice(marker.index, markers[index + 1]?.index ?? markdown.length),
  }));
}

function tokenInventory(markdown) {
  const counts = {
    direct: 0,
    user: 0,
    expression: 0,
    hashExpression: 0,
    other: 0,
  };

  for (const token of markdown.matchAll(TOKEN)) {
    const [, prefix, value] = token;
    if (prefix === '#') counts.hashExpression += 1;
    else if (value.startsWith('u:')) counts.user += 1;
    else if (value.startsWith('e:')) counts.expression += 1;
    else if (DIRECT_PIPE.test(value)) counts.direct += 1;
    else counts.other += 1;
  }

  return counts;
}

function gridRanges(markdown) {
  const grid = /\|grid[!?]*\|([^|]+)\|[^|]*\|[^|]*\|[^|]*\|/g;
  return [...markdown.matchAll(grid)].flatMap((match) => {
    const destination = match[1].match(/\bid=["']?([A-Za-z_]\w*)/i)?.[1];
    return destination ? [{ start: match.index, end: match.index + match[0].length, destination }] : [];
  });
}

function directPairs(markdown) {
  const markers = [...markdown.matchAll(QUESTION_MARKER)];
  const grids = gridRanges(markdown);
  return [...markdown.matchAll(TOKEN)].flatMap((token) => {
    const [, prefix, source] = token;
    if (prefix !== '$' || !DIRECT_PIPE.test(source)) return [];

    const grid = grids.find(({ start, end }) => token.index >= start && token.index < end);
    const questionIndex = markers.findLastIndex(({ index }) => index <= token.index);
    const destination = grid?.destination ?? markers[questionIndex]?.[1];
    return destination ? [{ destination, source }] : [];
  });
}

function displayListDestinations(markdown, module, locale) {
  return questionBlocks(markdown)
    .filter(({ source }) => source.includes('|displayList('))
    .map(({ id }) => `${module}/${locale}/${id}`);
}

function normaliseLoopId(id) {
  return id.replace(LOOP_SUFFIX, '');
}

function pipePairKey({ destination, source }) {
  return `${normaliseLoopId(destination)}<-${normaliseLoopId(source)}`;
}

function configureProcessor(locale) {
  moduleParams.i18n = locale === 'es' ? es : en;
  moduleParams.errorLogger = vi.fn();
  moduleParams.previousResults = {};
  moduleParams.asyncQuestionsMap = {};
  moduleParams.renderFullQuestionList = true;
  moduleParams.isRenderer = true;
  initializeStateManager();
  initializeCustomMathJSFunctions();
}

function directSourcesInText(text) {
  return new Set(
    [...text.matchAll(TOKEN)]
      .flatMap(([, prefix, value]) => (prefix === '$' && DIRECT_PIPE.test(value) ? [normaliseLoopId(value)] : [])),
  );
}

function gridSourcesInHTML(html) {
  return new Set(
    [...html.matchAll(/data-gridreplace=([^\s>]+)/g)]
      .map(([, source]) => normaliseLoopId(decodeURIComponent(source.replace(/["']/g, ''))))
      .filter((source) => DIRECT_PIPE.test(source)),
  );
}

function parsedPipePairs(markdown, locale, authoredPairs) {
  configureProcessor(locale);
  const processor = new QuestionProcessor(markdown, {
    current_date: new Date('2024-07-15T12:00:00.000Z'),
    current_day: 15,
    current_month: 7,
    current_month_str: 6,
    current_year: 2024,
    quest_format_date: '2024-7-15',
  }, locale === 'es' ? es : en);
  getStateManager().setQuestionProcessor(processor);
  const parsed = new Set();
  const remaining = new Set(authoredPairs);
  for (const [index, question] of processor.questions.entries()) {
    const destination = normaliseLoopId(question.questionIDExactSearch);
    const questionSources = new Set([
      ...directSourcesInText(question.questText ?? ''),
      ...gridSourcesInHTML(question.formElement ?? ''),
    ]);
    if (![...questionSources].some((source) => remaining.has(`${destination}<-${source}`))) continue;

    const form = processor.processQuestion(index);
    form.querySelectorAll('[forid]').forEach((element) => {
      parsed.add(pipePairKey({
        destination: form.id,
        source: decodeURIComponent(element.getAttribute('forid')),
      }));
    });
    form.querySelectorAll('[data-gridreplace]').forEach((element) => {
      const source = decodeURIComponent(element.dataset.gridreplace);
      if (DIRECT_PIPE.test(source)) parsed.add(pipePairKey({ destination: form.id, source }));
    });
    parsed.forEach((pair) => remaining.delete(pair));
    if (remaining.size === 0) break;
  }

  return parsed;
}

const lock = await loadCorpusLock();
const cacheDirectory = corpusCacheDirectory(lock);
const entries = lock.files.map((entry) => ({
  ...entry,
  path: resolve(cacheDirectory, entry.path),
}));
const unavailable = entries.filter(({ path }) => !existsSync(path));

describe.skipIf(unavailable.length > 0)('locked production response-piping structure @corpus', () => {
  it('inventories every direct pipe while keeping profile, computed, and expression tokens separate', () => {
    const directCounts = {};
    const totals = { direct: 0, user: 0, expression: 0, hashExpression: 0, other: 0 };
    const displayLists = [];

    for (const entry of entries) {
      const markdown = withoutComments(readFileSync(entry.path, 'utf8'));
      const inventory = tokenInventory(markdown);
      const key = `${entry.module}/${entry.locale}`;
      directCounts[key] = inventory.direct;
      displayLists.push(...displayListDestinations(markdown, entry.module, entry.locale));
      Object.keys(totals).forEach((name) => {
        totals[name] += inventory[name];
      });
    }

    expect(directCounts).toEqual({
      ...Object.fromEntries(entries.map(({ module, locale }) => [`${module}/${locale}`, 0])),
      ...EXPECTED_DIRECT_PIPES,
    });
    expect(totals).toEqual(EXPECTED_TOKEN_COUNTS);
    expect(displayLists).toEqual(EXPECTED_DISPLAY_LISTS);
  });

  it('keeps every authored destination/source pair in its own forid or grid-replacement runtime output', () => {
    for (const entry of entries) {
      const markdown = withoutComments(readFileSync(entry.path, 'utf8'));
      const authoredPairs = new Set(directPairs(markdown).map(pipePairKey));
      if (authoredPairs.size === 0) continue;
      const parsedPairs = parsedPipePairs(markdown, entry.locale, authoredPairs);

      expect(
        [...authoredPairs].filter((pair) => !parsedPairs.has(pair)),
        `${entry.module}/${entry.locale}: every authored destination/source pair must survive in its own runtime form`,
      ).toEqual([]);
    }
  }, 180_000);

  it('keeps English and Spanish source/destination pairs aligned except for the two audited differences', () => {
    const pairsByModule = new Map();
    for (const entry of entries) {
      if (!['en', 'es'].includes(entry.locale)) continue;
      const markdown = withoutComments(readFileSync(entry.path, 'utf8'));
      const pairs = new Set(directPairs(markdown).map(pipePairKey));
      const localePairs = pairsByModule.get(entry.module) ?? new Map();
      localePairs.set(entry.locale, pairs);
      pairsByModule.set(entry.module, localePairs);
    }

    for (const [module, localePairs] of pairsByModule) {
      const english = localePairs.get('en');
      const spanish = localePairs.get('es');
      if (!english || !spanish) continue;
      const actual = {
        englishOnly: [...english].filter((pair) => !spanish.has(pair)).sort(),
        spanishOnly: [...spanish].filter((pair) => !english.has(pair)).sort(),
      };
      expect(actual, `${module} EN/ES direct-pipe parity`).toEqual(
        EXPECTED_LOCALE_DIFFERENCES[module] ?? { englishOnly: [], spanishOnly: [] },
      );
    }
  });

  it('keeps rendered forid spans and grid replacements available through the participant render boundary', async () => {
    const entry = entries.find(({ module, locale }) => module === 'module3' && locale === 'en');
    const quest = await renderFreshQuest({
      markdown: readFileSync(entry.path, 'utf8'),
      params: { activate: false, isRenderer: true, lang: 'en' },
    });

    expect(quest.rendered).toBe(true);
    expect(quest.root.querySelectorAll('[forid]').length).toBeGreaterThan(100);
    const gridSources = [...quest.root.querySelectorAll('[data-gridreplace]')]
      .map((element) => decodeURIComponent(element.dataset.gridreplace));
    expect(gridSources).toEqual(expect.arrayContaining(['D_141874857', 'D_250456537', 'D_480426504']));
  });
});
