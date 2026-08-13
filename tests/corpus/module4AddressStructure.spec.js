import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { corpusCacheDirectory, loadCorpusLock } from './scripts/lib/corpus.mjs';

const QUESTION_MARKER = /^\[([A-Z_][A-Z0-9_#]*)(?:[?!])?(?:,[^\]]*)?\]/gm;
const INPUT_ID = /\|__\|id=(D_\d+)/g;
const QUOTED_ID = /"(D_\d+)"/g;
const PIPED_ID = /\{\$(D_\d+)\}/g;
const EXPECTED_INTERSECTION_COUNT = 26;

function unique(values) {
  return [...new Set(values)];
}

function idsIn(text, pattern) {
  return [...text.matchAll(pattern)].map(([, id]) => id);
}

function questionBlocks(markdown) {
  const markers = [...markdown.matchAll(QUESTION_MARKER)];
  return markers.map((marker, index) => ({
    id: marker[1],
    source: markdown.slice(marker.index, markers[index + 1]?.index),
    header: markdown.slice(marker.index, markdown.indexOf('\n', marker.index)),
  }));
}

function fieldId(source, labels) {
  const labelPattern = labels.join('|');
  const match = source.match(new RegExp(`(?:${labelPattern})\\s*\\|__\\|id=(D_\\d+)`, 'i'));
  return match?.[1] ?? null;
}

function summaryDisplayArms(source) {
  const armStarts = [...source.matchAll(/\|displayif=([^|]+)\|/g)];
  return armStarts.flatMap((armStart, index) => {
    const addressCondition = armStart[1].match(/^(noneExist|someExist)\(([^)]*)\)/);
    if (!addressCondition) return [];
    const contentStart = armStart.index + armStart[0].length;
    const nextArmStart = armStarts[index + 1]?.index ?? source.length;
    const lineEnd = source.indexOf('\n', contentStart);
    const contentBoundary = Math.min(nextArmStart, lineEnd === -1 ? source.length : lineEnd);
    const authoredContent = source.slice(contentStart, contentBoundary);
    const closingPipe = authoredContent.lastIndexOf('|');
    const content = closingPipe === -1 ? authoredContent : authoredContent.slice(0, closingPipe);
    return [{
      kind: addressCondition[1],
      conditionIds: idsIn(addressCondition[2], QUOTED_ID),
      content,
      contentIds: idsIn(content, PIPED_ID),
    }];
  });
}

function getAddressFamily(blocks, intersectionIndex) {
  const primary = blocks[intersectionIndex - 2];
  const backup = blocks[intersectionIndex - 1];
  const intersection = blocks[intersectionIndex];
  const summary = blocks[intersectionIndex + 1];
  const primaryInputIds = idsIn(primary.source, INPUT_ID);
  const backupInputIds = idsIn(backup.source, INPUT_ID);
  const crossStreetIds = idsIn(intersection.source, INPUT_ID);
  const conditionIds = idsIn(intersection.header, QUOTED_ID);

  return {
    primary,
    backup,
    intersection,
    summary,
    primaryInputIds,
    backupInputIds,
    crossStreetIds,
    conditionIds,
    streetNumber: fieldId(primary.source, ['Street number', 'Número de la calle']),
    streetName: fieldId(primary.source, ['Full Street name', 'Nombre completo de la calle']),
    localityIds: [
      fieldId(primary.source, ['City', 'Ciudad']),
      fieldId(primary.source, ['State/Province', 'Estado o provincia']),
      fieldId(primary.source, ['Zip code', 'Código postal']),
      fieldId(primary.source, ['Country', 'País']),
    ],
  };
}

async function readModule4(locale) {
  const lock = await loadCorpusLock();
  const cacheDirectory = corpusCacheDirectory(lock);
  const entry = lock.files.find((file) => file.module === 'module4' && file.locale === locale);
  const filePath = resolve(cacheDirectory, entry.path);
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : null;
}

const english = await readModule4('en');
const spanish = await readModule4('es');

describe.skipIf(!english || !spanish)('locked Module 4 address-family structure @corpus', () => {

  it('characterizes the three duplicated displayif tokens as a math assignment that retains the intended fallback predicate', async () => {
    const blocks = questionBlocks(english);
    const duplicated = blocks.filter(({ header }) => header.includes('displayif=displayif='));
    const spanishDuplicated = questionBlocks(spanish).filter(({ header }) => header.includes('displayif=displayif='));
    expect(duplicated.map(({ id }) => id)).toEqual(['D_398762737', 'D_205492848', 'D_763354979']);
    expect(spanishDuplicated.map(({ id }) => id)).toEqual(duplicated.map(({ id }) => id));

    vi.resetModules();
    const questionnaire = await import('../../questionnaire.js');
    questionnaire.moduleParams.errorLogger = vi.fn();
    questionnaire.moduleParams.previousResults = {};
    const stateModule = await import('../../stateManager.js');
    stateModule.initializeStateManager();
    stateModule.getStateManager().loadInitialSurveyState({ D_288498031: 'Lakeview' });
    const { initializeCustomMathJSFunctions } = await import('../../customMathJSImplementation.js');
    initializeCustomMathJSFunctions();
    const { evaluateCondition } = await import('../../evaluateConditions.js');

    const condition = duplicated[0].header.match(/displayif=(.*?)\]/)?.[1];
    expect(condition).toBe('displayif=noneExist("D_985267931","D_111275683") and someExist("D_288498031","D_195845897","D_936129960","D_924583345","D_536516743","D_283900560","D_467947502","D_368486703")');
    expect(evaluateCondition(condition)).toBe(true);
    stateModule.getStateManager().loadInitialSurveyState({});
    expect(evaluateCondition(condition)).toBe(false);
  });

  it('keeps every primary, backup, cross-street, and summary family internally consistent in English and Spanish', () => {
    const byLocale = new Map([
      ['en', questionBlocks(english)],
      ['es', questionBlocks(spanish)],
    ]);
    const familiesByLocale = new Map();

    for (const [locale, blocks] of byLocale) {
      const intersectionIndexes = blocks.flatMap((block, index) => (
        /cross streets|intersección/i.test(block.source) ? [index] : []
      ));
      expect(intersectionIndexes, `${locale} intersection-family count`).toHaveLength(EXPECTED_INTERSECTION_COUNT);

      const families = intersectionIndexes.map((index) => getAddressFamily(blocks, index));
      familiesByLocale.set(locale, families);

      for (const family of families) {
        expect(family.primaryInputIds.length, `${locale} ${family.primary.id} primary field count`).toBeGreaterThanOrEqual(7);
        expect(unique(family.primaryInputIds), `${locale} ${family.primary.id} primary IDs`).toEqual(family.primaryInputIds);
        expect(family.backupInputIds, `${locale} ${family.backup.id} backup fields`).toHaveLength(4);
        expect(family.crossStreetIds, `${locale} ${family.intersection.id} cross streets`).toHaveLength(2);
        expect(family.streetNumber, `${locale} ${family.primary.id} street number`).toBeTruthy();
        expect(family.streetName, `${locale} ${family.primary.id} street name`).toBeTruthy();
        expect(family.localityIds, `${locale} ${family.primary.id} locality fields`).not.toContain(null);

        const expectedConditionIds = unique([
          family.streetNumber,
          family.streetName,
          ...family.backupInputIds,
          ...family.localityIds,
        ]).sort();
        expect(unique(family.conditionIds).sort(), `${locale} ${family.intersection.id} fallback predicate IDs`)
          .toEqual(expectedConditionIds);
        expect(family.intersection.header, `${locale} ${family.intersection.id} no-street predicate`)
          .toContain(`noneExist("${family.streetNumber}","${family.streetName}")`);
        expect(family.intersection.header, `${locale} ${family.intersection.id} locality predicate`)
          .toContain('someExist(');

        const expectedSummaryIds = unique([
          ...family.primaryInputIds.slice(family.primaryInputIds.indexOf(family.streetNumber)),
          ...family.backupInputIds,
          ...family.crossStreetIds,
        ]);
        const summaryArms = summaryDisplayArms(family.summary.source);
        expect(summaryArms, `${locale} ${family.summary.id} display arms`).toHaveLength(2);
        const emptyArm = summaryArms.find(({ kind }) => kind === 'noneExist');
        const populatedArm = summaryArms.find(({ kind }) => kind === 'someExist');
        expect(emptyArm, `${locale} ${family.summary.id} empty arm`).toBeTruthy();
        expect(populatedArm, `${locale} ${family.summary.id} populated arm`).toBeTruthy();
        expect(unique(emptyArm.conditionIds).sort(), `${locale} ${family.summary.id} empty condition IDs`)
          .toEqual(unique(populatedArm.conditionIds).sort());
        expect(emptyArm.contentIds, `${locale} ${family.summary.id} empty arm must not pipe address fields`)
          .toEqual([]);
        expect(unique(populatedArm.contentIds).sort(), `${locale} ${family.summary.id} populated address fields`)
          .toEqual([...expectedSummaryIds].sort());
      }
    }

    const englishFamilies = familiesByLocale.get('en');
    const spanishFamilies = familiesByLocale.get('es');
    expect(englishFamilies.map((family) => family.intersection.id)).toEqual(
      spanishFamilies.map((family) => family.intersection.id),
    );
    for (let index = 0; index < englishFamilies.length; index += 1) {
      const englishFamily = englishFamilies[index];
      const spanishFamily = spanishFamilies[index];
      expect(spanishFamily.primary.id).toBe(englishFamily.primary.id);
      expect(spanishFamily.backup.id).toBe(englishFamily.backup.id);
      expect(spanishFamily.summary.id).toBe(englishFamily.summary.id);
      expect(spanishFamily.primaryInputIds).toEqual(englishFamily.primaryInputIds);
      expect(spanishFamily.backupInputIds).toEqual(englishFamily.backupInputIds);
      expect(spanishFamily.crossStreetIds).toEqual(englishFamily.crossStreetIds);
      expect(unique(spanishFamily.conditionIds).sort()).toEqual(unique(englishFamily.conditionIds).sort());
    }
  });
});
