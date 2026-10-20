import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { renderFreshQuest } from '../helpers/questRuntime.js';
import { analyzeQuestionnaireText } from './scripts/lib/corpus.mjs';
import {
  STRUCTURAL_CATALOG_SCHEMA_VERSION,
  buildStructuralCatalogRecord,
} from './scripts/lib/structuralCatalog.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const lock = JSON.parse(readFileSync(path.join(import.meta.dirname, 'lock.json'), 'utf8'));
const hostRegistry = JSON.parse(readFileSync(path.join(import.meta.dirname, 'hostPersonas.json'), 'utf8'));
const cacheDirectory = path.join(repositoryRoot, lock.cacheRoot, lock.commit);
const canonicalClock = new Date('2024-07-15T12:00:00.000Z');
const primaryPersona = hostRegistry.personas.find(({ id }) => id === 'external-branch-primary');

const aggregateCountFields = [
  'markerCount',
  'processorQuestionCount',
  'processedQuestionCount',
  'renderedFormCount',
  'controlCount',
  'responseControlCount',
  'explicitTransitionCount',
  'sequentialAdjacencyCount',
  'resolvedExplicitTransitionCount',
  'unresolvedExplicitTransitionCount',
  'conditionSiteCount',
  'gridQuestionCount',
  'gridRowCount',
  'loopStartCount',
  'loopDefinitionCount',
  'loopExpandedQuestionCount',
  'prefixOnlyTargetCount',
  'ambiguousPrefixTargetCount',
];

function comparePaths(left, right) {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

function asyncHooksFor(record) {
  return Object.values(hostRegistry.asyncHooks)
    .filter(({ module }) => module === record.module)
    .toSorted((left, right) => left.markupKey.localeCompare(right.markupKey));
}

function asyncQuestionMap(hooks) {
  return Object.fromEntries(hooks.map((hook) => [
    hook.markupKey,
    { func: hook.function, args: hook.args },
  ]));
}

function normalisedQuestionId(question, index) {
  return question.questionIDExactSearch
    ?? question.questionID?.replace(/[?!]$/, '')
    ?? `__question_${index}`;
}

function runtimeTargetResolver(processor, errorLog) {
  return (target, { questionIndex }) => {
    const originalIndex = processor.currentQuestionIndex;
    const errorStart = errorLog.length;

    try {
      processor.currentQuestionIndex = questionIndex;
      const result = processor.findQuestion(target);
      const resolverErrors = errorLog.splice(errorStart);
      if (!result?.question || result.index < 0 || resolverErrors.length > 0) {
        return { resolved: false, kind: resolverErrors.length ? 'oracle-error' : 'missing' };
      }

      const questions = processor.questions;
      const exactMatches = questions
        .map((question, index) => ({ id: normalisedQuestionId(question, index), index }))
        .filter(({ id }) => id === target);
      const prefixMatches = questions
        .map((question, index) => ({
          id: question.questionID ?? normalisedQuestionId(question, index),
          index,
        }))
        .filter(({ id }) => id.startsWith(target));
      const resolvedId = result.question.id || result.question.getAttribute('id');

      let kind = 'prefix-only';
      if (target === 'END') kind = 'terminal';
      else if (target.startsWith('_CONTINUE')) kind = 'virtual-loop';
      else if (exactMatches.some(({ index }) => index === result.index)) kind = 'exact';
      else if (prefixMatches.length > 1) kind = 'ambiguous-prefix';
      else if (new RegExp(`^${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_\\d+_\\d+[?!]?$`).test(resolvedId)) {
        kind = 'generated-loop';
      }

      return {
        resolved: true,
        kind,
        index: result.index,
        questionId: resolvedId,
      };
    } catch {
      errorLog.splice(errorStart);
      return { resolved: false, kind: 'oracle-exception' };
    } finally {
      processor.currentQuestionIndex = originalIndex;
    }
  };
}

function addResolutionCounts(survey) {
  const prefixOnlyTargetCount = survey.transitions
    .filter(({ resolution }) => resolution.kind === 'prefix-only').length;
  const ambiguousPrefixTargetCount = survey.transitions
    .filter(({ resolution }) => resolution.kind === 'ambiguous-prefix').length;
  const uniqueConditionExpressionCount = new Set(survey.conditionSites
    .map(({ decodedCondition }) => decodedCondition)
    .filter(Boolean)).size;

  return {
    ...survey,
    counts: {
      ...survey.counts,
      prefixOnlyTargetCount,
      ambiguousPrefixTargetCount,
      uniqueConditionExpressionCount,
    },
  };
}

function responseControlTypes(questionRecords) {
  const counts = {};
  for (const { controls } of questionRecords) {
    for (const control of controls) {
      const type = control.type ?? control.tag;
      if (['button', 'hidden', 'reset', 'submit'].includes(type)) continue;
      counts[type] = (counts[type] ?? 0) + control.count;
    }
  }
  return Object.fromEntries(Object.entries(counts).toSorted(([left], [right]) => left.localeCompare(right)));
}

function conditionSummary(conditionSites) {
  return {
    expressions: [...new Set(conditionSites.map(({ decodedCondition }) => decodedCondition))],
    sitesByScope: countValues(conditionSites.map(({ scope }) => scope)),
    sitesByAttribute: countValues(conditionSites.map(({ attribute }) => attribute)),
  };
}

function transitionSummary(transitions) {
  return {
    targets: [...new Set(transitions.map(({ to }) => to))],
    byKind: countValues(transitions.map(({ kind }) => kind)),
    byResolution: countValues(transitions.map(({ resolution }) => resolution.kind)),
    triggerTypes: countValues(transitions.map(({ control }) => control.type).filter(Boolean)),
    triggerValues: [...new Set(transitions.map(({ control }) => control.value).filter(Boolean))],
    conditionalExpressions: [...new Set(transitions
      .map(({ control }) => control.decodedCondition)
      .filter(Boolean))],
  };
}

function countValues(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).toSorted(([left], [right]) => left.localeCompare(right)));
}

function compactSurvey(survey) {
  return {
    schemaVersion: survey.schemaVersion,
    module: survey.module,
    locale: survey.locale,
    language: survey.language,
    path: survey.path,
    sha256: survey.sha256,
    questName: survey.questName,
    version: survey.version,
    markerCount: survey.markerCount,
    runtimeQuestionIds: survey.processedQuestionIds,
    responseControlsByType: responseControlTypes(survey.questionRecords),
    explicitTransitions: transitionSummary(survey.transitions),
    conditions: conditionSummary(survey.conditionSites),
    grids: survey.grids,
    loops: survey.loops.definitions.map((definition) => ({
      loopIndex: definition.loopIndex,
      loopMaxQuestionIds: definition.loopMaxQuestionIds,
      iterationCount: definition.iterationCount,
      iterationStartIndexes: definition.iterationStartIndexes,
      boundaryIndex: definition.boundaryIndex,
    })),
    unresolvedTargets: survey.unresolvedTargets,
    asyncQuestionIds: survey.asyncQuestionIds,
    counts: survey.counts,
  };
}

function sumCounts(surveys) {
  return Object.fromEntries(aggregateCountFields.map((field) => [
    field,
    surveys.reduce((total, survey) => total + (survey.counts[field] ?? 0), 0),
  ]));
}

function moduleSummaries(surveys) {
  return [...Map.groupBy(surveys, ({ module }) => module)]
    .map(([module, moduleSurveys]) => ({
      module,
      counts: sumCounts(moduleSurveys),
      surveys: moduleSurveys.map(({ locale, path: surveyPath, counts }) => ({
        locale,
        path: surveyPath,
        markerCount: counts.markerCount,
        processorQuestionCount: counts.processorQuestionCount,
        gridQuestionCount: counts.gridQuestionCount,
        loopDefinitionCount: counts.loopDefinitionCount,
        explicitTransitionCount: counts.explicitTransitionCount,
        conditionSiteCount: counts.conditionSiteCount,
        unresolvedExplicitTransitionCount: counts.unresolvedExplicitTransitionCount,
      })),
    }))
    .toSorted(({ module: left }, { module: right }) => left.localeCompare(right));
}

async function buildSurveyCatalog(record) {
  const sourcePath = path.join(cacheDirectory, record.path);
  expect(
    existsSync(sourcePath),
    `Locked corpus cache is absent. Run npm run corpus:fetch for ${lock.commit}.`,
  ).toBe(true);

  const markdown = readFileSync(sourcePath, 'utf8');
  const sourceAnalysis = analyzeQuestionnaireText(markdown);
  const hooks = asyncHooksFor(record);
  const previousResults = {
    ...primaryPersona.previousResults,
    ...primaryPersona.userProfile,
  };
  const rendered = await renderFreshQuest({
    markdown,
    previousResults,
    params: {
      activate: false,
      asyncQuestionsMap: asyncQuestionMap(hooks),
      isRenderer: true,
      lang: record.locale,
      questVersion: record.version,
      showProgressBarInQuest: false,
    },
  });

  expect(rendered.rendered, `${record.path}: transform.render failed in full-list mode`).toBe(true);
  expect(rendered.errors, `${record.path}: Quest logged a full-list rendering error`).toEqual([]);
  expect(sourceAnalysis.questName).toBe(record.questName);
  expect(sourceAnalysis.version).toBe(record.version);
  expect(sourceAnalysis.questionIds).toHaveLength(record.sourceQuestionCount);

  const processor = rendered.state.getQuestionProcessor();
  expect(processor.processedQuestions.size, `${record.path}: not every runtime entry was processed`)
    .toBe(processor.questions.length);
  expect(rendered.root.querySelectorAll('form.question'), `${record.path}: not every runtime entry was appended`)
    .toHaveLength(processor.questions.length);

  const scalarInputTypes = new Set([
    'date', 'email', 'month', 'number', 'password', 'search', 'tel', 'text', 'time', 'url',
  ]);
  const scalarControls = Array.from(rendered.root.querySelectorAll('input, select, textarea')).filter((control) => (
    control.tagName !== 'INPUT'
    || (scalarInputTypes.has(control.type) && !control.hasAttribute('data-hidden'))
  ));
  const explicitLabelTargets = new Set(Array.from(
    rendered.root.querySelectorAll('label[for]'),
    (label) => label.htmlFor,
  ));
  const implicitlyLabelledControls = new Set(
    rendered.root.querySelectorAll('label input, label select, label textarea'),
  );
  const missingScalarNames = [];
  const leakedScalarNames = [];
  scalarControls.forEach((control) => {
    const ariaLabel = control.getAttribute('aria-label')?.trim() ?? '';
    const ariaLabelledBy = control.getAttribute('aria-labelledby')?.trim() ?? '';
    const controlTarget = `${record.path}#${control.id || control.name}`;
    const hasNativeLabel = explicitLabelTargets.has(control.id)
      || implicitlyLabelledControls.has(control);
    if (!ariaLabel && !ariaLabelledBy && !hasNativeLabel) {
      missingScalarNames.push(controlTarget);
    }
    if (ariaLabel && /<|>|\||->|(?:^|\s)(?:displayif|forid)\s*=/i.test(ariaLabel)) {
      leakedScalarNames.push(`${controlTarget}: ${ariaLabel}`);
    }
  });
  expect(missingScalarNames, `${record.path}: scalar controls without an accessible name source`).toEqual([]);
  expect(leakedScalarNames, `${record.path}: scalar names containing parser syntax`).toEqual([]);

  const survey = buildStructuralCatalogRecord({
    record,
    processor,
    renderedRoot: rendered.root,
    asyncQuestionIds: hooks.map(({ markupKey }) => markupKey),
    resolveTarget: runtimeTargetResolver(processor, rendered.errors),
  });

  return compactSurvey(addResolutionCounts({
    ...survey,
    sha256: record.sha256,
    asyncQuestionIds: hooks.map(({ questionId }) => questionId),
  }));
}

describe('locked production structural catalog', () => {
  it('matches every parser-produced form and explicit target', async () => {
    expect(primaryPersona, 'The structural catalog requires the primary locked host persona.').toBeTruthy();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(canonicalClock);

    const surveys = [];
    for (const record of lock.files.toSorted(comparePaths)) {
      surveys.push(await buildSurveyCatalog(record));
    }

    const catalog = {
      schemaVersion: STRUCTURAL_CATALOG_SCHEMA_VERSION,
      corpus: {
        repository: lock.repository,
        commit: lock.commit,
        environment: lock.environment,
        fileCount: lock.files.length,
        moduleCount: lock.expectedModuleCount,
      },
      oracle: {
        boundary: 'transform.render with isRenderer=true and activate=false',
        hostPersona: primaryPersona.id,
        fixedDate: canonicalClock.toISOString(),
        sequentialAdjacency: 'Adjacent runtimeQuestionIds; path feasibility is intentionally not inferred.',
      },
      counts: sumCounts(surveys),
      modules: moduleSummaries(surveys),
      surveys,
    };

    expect(catalog.surveys).toHaveLength(29);
    expect(catalog.counts.processorQuestionCount).toBe(catalog.counts.processedQuestionCount);
    expect(catalog.counts.processorQuestionCount).toBe(catalog.counts.renderedFormCount);
    expect(catalog.counts.unresolvedExplicitTransitionCount).toBe(0);
    expect(catalog.counts.prefixOnlyTargetCount).toBe(0);
    expect(catalog.counts.ambiguousPrefixTargetCount).toBe(0);
    await expect(`${JSON.stringify(catalog, null, 2)}\n`)
      .toMatchFileSnapshot('./structuralCatalog.json');
  }, 180_000);
});
