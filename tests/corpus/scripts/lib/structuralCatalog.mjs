/**
 * Build a reviewable description of a questionnaire after Quest has parsed it.
 *
 * This deliberately describes structure only.  It does not try to evaluate
 * conditions, navigate a questionnaire, or infer reachable paths.  Keeping
 * those concerns separate makes the catalog an honest denominator for the
 * later path-generation work.
 */

export const STRUCTURAL_CATALOG_SCHEMA_VERSION = 1;

const LOOP_SUFFIX = /_(\d+)_(\d+)[?!]?$/;
const ASYNC_MARKUP_ID = /^\[([^\]|?!]+)[?!]?\]$/;

function asArray(value) {
  return value == null ? [] : Array.from(value);
}

function normaliseString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalString(value) {
  const normalised = normaliseString(value);
  return normalised || null;
}

function safeDecode(value) {
  const text = normaliseString(value);
  if (!text) return '';

  try {
    return decodeURIComponent(text);
  } catch {
    // A malformed percent escape is useful evidence in the catalog.  Preserve
    // it instead of making generation fail before the malformed form can be
    // reviewed.
    return text;
  }
}

function getAttribute(element, attributeName) {
  if (!element?.getAttribute) return null;
  return element.getAttribute(attributeName);
}

function getSkipTarget(element) {
  return optionalString(getAttribute(element, 'skipto'))
    ?? optionalString(getAttribute(element, 'skipTo'));
}

function sourceQuestionId(question, index) {
  return optionalString(question?.questionID) ?? `__question_${index}`;
}

function exactQuestionId(question, fallback) {
  return optionalString(question?.questionIDExactSearch)
    ?? fallback.replace(/[?!]$/, '');
}

function controlDescriptor(element) {
  const tag = element?.tagName?.toLowerCase?.() ?? 'unknown';
  const type = optionalString(getAttribute(element, 'type'))
    ?? (tag === 'textarea' ? 'textarea' : tag === 'select' ? 'select' : null);
  const name = optionalString(getAttribute(element, 'name'));
  const value = optionalString(getAttribute(element, 'value'));

  return {
    id: optionalString(getAttribute(element, 'id')),
    tag,
    type,
    name,
    value,
    required: element?.hasAttribute?.('required') ?? false,
    noResponse: element?.classList?.contains?.('noresponse') ?? false,
  };
}

function conditionScope(element, form, attribute) {
  if (element === form) return 'question';
  if (attribute === 'if' && getSkipTarget(element)) return 'conditional-transition';
  if (element?.hasAttribute?.('data-gridrow')) return 'grid-row';
  if (element?.classList?.contains?.('grid-displayif')) return 'grid-inline';
  if (element?.classList?.contains?.('response')) return 'response';
  if (element?.classList?.contains?.('displayif')) return 'inline';
  return 'element';
}

function groupControls(elements) {
  const groups = [];
  const groupsByKey = new Map();

  for (const element of elements) {
    const descriptor = controlDescriptor(element);
    const key = [descriptor.tag, descriptor.type ?? '', descriptor.name ?? ''].join('\u0000');
    let group = groupsByKey.get(key);

    if (!group) {
      group = {
        tag: descriptor.tag,
        type: descriptor.type,
        name: descriptor.name,
        count: 0,
        required: false,
        noResponseCount: 0,
        values: [],
      };
      groupsByKey.set(key, group);
      groups.push(group);
    }

    group.count += 1;
    group.required ||= descriptor.required;
    group.noResponseCount += descriptor.noResponse ? 1 : 0;
    if (descriptor.value && !group.values.includes(descriptor.value)) {
      group.values.push(descriptor.value);
    }
  }

  return groups;
}

function isResponseControl(element) {
  const tag = element?.tagName?.toLowerCase?.();
  const type = normaliseString(getAttribute(element, 'type')).toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag !== 'input') return false;
  return !['button', 'hidden', 'reset', 'submit'].includes(type);
}

function conditionSitesForForm(form, questionId, questionIndex) {
  const sites = [];
  const conditionAttributes = ['displayif', 'data-displayif', 'if'];
  const candidates = [form, ...asArray(form?.querySelectorAll?.('[displayif], [data-displayif], [if]'))];

  for (const element of candidates) {
    for (const attribute of conditionAttributes) {
      const raw = getAttribute(element, attribute);
      if (raw == null) continue;
      sites.push({
        questionId,
        questionIndex,
        scope: conditionScope(element, form, attribute),
        element: element?.tagName?.toLowerCase?.() ?? 'unknown',
        elementId: optionalString(getAttribute(element, 'id')),
        attribute,
        rawCondition: normaliseString(raw),
        decodedCondition: safeDecode(raw),
      });
    }
  }

  return sites;
}

function questionKind(questionId, grid) {
  const exactId = questionId.replace(/[?!]$/, '');
  if (grid) return 'grid';
  if (exactId === 'END') return 'terminal';
  if (exactId === 'END_OF_LOOP') return 'loop-boundary';
  if (exactId.startsWith('_CONTINUE')) return 'loop-continuation';
  return 'question';
}

function transitionKind(element) {
  const descriptor = controlDescriptor(element);
  if (descriptor.type !== 'hidden') return 'response';
  if (descriptor.noResponse) return 'no-response';
  if (getAttribute(element, 'if') != null) return 'conditional-default';
  return 'default';
}

function gridRecord(form, questionId, questionIndex) {
  if (!form?.hasAttribute?.('data-grid')) return null;

  const rows = asArray(form.querySelectorAll?.('[data-gridrow]'));
  const gridCells = asArray(form.querySelectorAll?.('[data-gridcell]'));
  const responseTypes = [...new Set(gridCells
    .map((cell) => normaliseString(getAttribute(cell, 'type')).toLowerCase())
    .filter(Boolean))];

  return {
    questionId,
    questionIndex,
    rowQuestionIds: rows.map((row) => optionalString(getAttribute(row, 'data-question-id'))).filter(Boolean),
    rowCount: rows.length,
    responseTypes,
    responseValues: [...new Set(gridCells
      .map((cell) => optionalString(getAttribute(cell, 'value')))
      .filter(Boolean))],
  };
}

function loopMarkerForForm(form, questionId, questionIndex) {
  const loopIndex = optionalString(getAttribute(form, 'loopindx'));
  const firstQuestion = optionalString(getAttribute(form, 'firstquestion'));
  const loopMaxQuestionId = optionalString(getAttribute(form, 'loopmax'));
  if (!loopIndex && !firstQuestion && !loopMaxQuestionId) return null;

  return {
    questionId,
    questionIndex,
    loopIndex,
    firstQuestion,
    loopMaxQuestionId,
  };
}

function buildLoopDefinitions(loopStarts, questionRecords) {
  const byLoopIndex = new Map();

  for (const start of loopStarts) {
    const key = start.loopIndex ?? 'unknown';
    const definition = byLoopIndex.get(key) ?? {
      loopIndex: start.loopIndex,
      loopMaxQuestionIds: [],
      iterationFirstQuestionIds: [],
      iterationStartIndexes: [],
    };
    if (start.loopMaxQuestionId && !definition.loopMaxQuestionIds.includes(start.loopMaxQuestionId)) {
      definition.loopMaxQuestionIds.push(start.loopMaxQuestionId);
    }
    definition.iterationFirstQuestionIds.push(start.questionId);
    definition.iterationStartIndexes.push(start.questionIndex);
    byLoopIndex.set(key, definition);
  }

  return [...byLoopIndex.values()].map((definition) => {
    const firstIndex = definition.iterationStartIndexes[0];
    const lastStartIndex = definition.iterationStartIndexes.at(-1);
    const boundary = questionRecords.find(({ index, id }) => (
      index > lastStartIndex && id === 'END_OF_LOOP'
    ));
    const continuationQuestionIds = questionRecords
      .filter(({ index, id }) => (
        index >= firstIndex
        && index < (boundary?.index ?? Number.POSITIVE_INFINITY)
        && id.startsWith(`_CONTINUE${definition.loopIndex}`)
      ))
      .map(({ id }) => id);

    return {
      ...definition,
      iterationCount: definition.iterationStartIndexes.length,
      continuationQuestionIds,
      boundaryIndex: boundary?.index ?? null,
    };
  });
}

function asyncIdSet(asyncQuestionIds) {
  const ids = new Set();
  for (const value of asyncQuestionIds ?? []) {
    const text = normaliseString(value);
    if (!text) continue;
    const markupMatch = text.match(ASYNC_MARKUP_ID);
    ids.add(markupMatch ? markupMatch[1] : text.replace(/[?!]$/, ''));
  }
  return ids;
}

function structuralTargetResolver(processor) {
  const questions = asArray(processor?.questions);

  return (target) => {
    const normalisedTarget = normaliseString(target);
    if (!normalisedTarget) return { resolved: false, kind: 'missing-target' };

    // `findQuestion('END')` intentionally resolves to the final processed
    // question, regardless of where an END marker occurs in source.
    if (normalisedTarget === 'END') {
      const index = questions.length - 1;
      return index >= 0
        ? { resolved: true, kind: 'terminal', index, questionId: sourceQuestionId(questions[index], index) }
        : { resolved: false, kind: 'missing-terminal' };
    }

    const exactIndex = questions.findIndex((question, index) => (
      exactQuestionId(question, sourceQuestionId(question, index)) === normalisedTarget
    ));
    if (exactIndex !== -1) {
      return {
        resolved: true,
        kind: 'exact',
        index: exactIndex,
        questionId: sourceQuestionId(questions[exactIndex], exactIndex),
      };
    }

    const prefixIndex = questions.findIndex((question, index) => (
      sourceQuestionId(question, index).startsWith(normalisedTarget)
    ));
    if (prefixIndex !== -1) {
      return {
        resolved: true,
        kind: normalisedTarget.startsWith('_CONTINUE') ? 'loop-continue' : 'prefix',
        index: prefixIndex,
        questionId: sourceQuestionId(questions[prefixIndex], prefixIndex),
      };
    }

    return { resolved: false, kind: 'unresolved' };
  };
}

function normaliseResolution(value) {
  if (value === true) return { resolved: true, kind: 'custom' };
  if (value === false || value == null) return { resolved: false, kind: 'custom' };
  if (typeof value === 'number') return { resolved: true, kind: 'custom', index: value };
  if (typeof value === 'string') return { resolved: true, kind: 'custom', questionId: value };
  if (typeof value === 'object') {
    return {
      resolved: Boolean(value.resolved),
      kind: optionalString(value.kind) ?? 'custom',
      ...(Number.isInteger(value.index) ? { index: value.index } : {}),
      ...(optionalString(value.questionId) ? { questionId: optionalString(value.questionId) } : {}),
    };
  }
  return { resolved: false, kind: 'custom' };
}

/**
 * Build a catalog record from a processed Quest survey.
 *
 * `resolveTarget`, receives `(target, context)` and may return
 * a boolean, an index/string, or `{ resolved, kind, index?, questionId? }`.
 * The fallback performs structural exact/prefix lookup only. Corpus tests
 * should inject a resolver that calls Quest when virtual loop routing matters.
 */
export function buildStructuralCatalogRecord({
  record = {},
  processor,
  renderedRoot,
  asyncQuestionIds = [],
  resolveTarget,
} = {}) {
  const questions = asArray(processor?.questions);
  const renderedForms = asArray(renderedRoot?.querySelectorAll?.('form.question'));
  const asyncIds = asyncIdSet(asyncQuestionIds);
  const targetResolver = typeof resolveTarget === 'function'
    ? resolveTarget
    : structuralTargetResolver(processor);
  const questionRecords = [];
  const transitions = [];
  const conditionSites = [];
  const grids = [];
  const loops = [];
  let controlCount = 0;
  let responseControlCount = 0;

  for (const [questionIndex, question] of questions.entries()) {
    const questionId = sourceQuestionId(question, questionIndex);
    const form = processor?.processedQuestions?.get?.(questionIndex) ?? renderedForms[questionIndex] ?? null;
    const controls = asArray(form?.querySelectorAll?.('input, textarea, select, button'));
    const skipElements = asArray(form?.querySelectorAll?.('[skipto], [skipTo]'));
    const formConditions = conditionSitesForForm(form, questionId, questionIndex);
    const grid = gridRecord(form, questionId, questionIndex);
    const loop = loopMarkerForForm(form, questionId, questionIndex);
    const loopSuffix = questionId.match(LOOP_SUFFIX);

    controlCount += controls.length;
    responseControlCount += controls.filter(isResponseControl).length;
    conditionSites.push(...formConditions);
    if (grid) grids.push(grid);
    if (loop) loops.push(loop);

    const transitionStart = transitions.length;
    for (const element of skipElements) {
      const target = getSkipTarget(element);
      if (!target) continue;
      const resolution = normaliseResolution(targetResolver(target, {
        record,
        processor,
        sourceQuestion: question,
        questionId,
        questionIndex,
        element,
      }));
      const descriptor = controlDescriptor(element);
      transitions.push({
        from: questionId,
        fromIndex: questionIndex,
        to: target,
        kind: transitionKind(element),
        control: {
          id: descriptor.id,
          tag: descriptor.tag,
          type: descriptor.type,
          name: descriptor.name,
          value: descriptor.value,
          noResponse: descriptor.noResponse,
          rawCondition: optionalString(getAttribute(element, 'if')),
          decodedCondition: getAttribute(element, 'if') == null
            ? null
            : safeDecode(getAttribute(element, 'if')),
        },
        resolution,
      });
    }

    questionRecords.push({
      index: questionIndex,
      id: questionId,
      exactId: exactQuestionId(question, questionId),
      domId: optionalString(getAttribute(form, 'id')),
      kind: questionKind(questionId, grid),
      async: asyncIds.has(exactQuestionId(question, questionId)),
      loopIteration: loopSuffix
        ? { iteration: Number(loopSuffix[1]), copy: Number(loopSuffix[2]) }
        : null,
      controls: groupControls(controls),
      controlCount: controls.length,
      responseControlCount: controls.filter(isResponseControl).length,
      conditionSiteCount: formConditions.length,
      explicitTransitionCount: transitions.length - transitionStart,
    });
  }

  const unresolvedByTarget = new Map();
  transitions.forEach((transition, transitionIndex) => {
    if (transition.resolution.resolved) return;
    const unresolved = unresolvedByTarget.get(transition.to) ?? {
      target: transition.to,
      transitionIndexes: [],
      fromQuestionIds: [],
    };
    unresolved.transitionIndexes.push(transitionIndex);
    if (!unresolved.fromQuestionIds.includes(transition.from)) {
      unresolved.fromQuestionIds.push(transition.from);
    }
    unresolvedByTarget.set(transition.to, unresolved);
  });

  const loopContinuationQuestionIds = questionRecords
    .filter(({ id }) => id.startsWith('_CONTINUE'))
    .map(({ id }) => id);
  const loopSentinelIndexes = questionRecords
    .filter(({ id }) => id === 'END_OF_LOOP')
    .map(({ index }) => index);
  const loopDefinitions = buildLoopDefinitions(loops, questionRecords);

  return {
    schemaVersion: STRUCTURAL_CATALOG_SCHEMA_VERSION,
    module: record.module ?? null,
    locale: record.locale ?? record.language ?? null,
    language: record.language ?? record.locale ?? null,
    path: record.path ?? null,
    questName: record.questName ?? null,
    version: record.version ?? null,
    authoredMarkerCount: Number.isInteger(record.sourceQuestionCount) ? record.sourceQuestionCount : null,
    processedQuestionIds: questionRecords.map(({ id }) => id),
    questionRecords,
    transitions,
    conditionSites,
    grids,
    loops: {
      definitions: loopDefinitions,
      starts: loops,
      continuationQuestionIds: loopContinuationQuestionIds,
      sentinelIndexes: loopSentinelIndexes,
      loopExpandedQuestionCount: questionRecords.filter(({ loopIteration }) => loopIteration !== null).length,
    },
    unresolvedTargets: [...unresolvedByTarget.values()],
    counts: {
      authoredMarkerCount: Number.isInteger(record.sourceQuestionCount) ? record.sourceQuestionCount : null,
      processorQuestionCount: questions.length,
      processedQuestionCount: processor?.processedQuestions?.size ?? questionRecords.filter(({ domId }) => domId !== null).length,
      renderedFormCount: renderedForms.length,
      controlCount,
      responseControlCount,
      explicitTransitionCount: transitions.length,
      sequentialAdjacencyCount: Math.max(questions.length - 1, 0),
      resolvedExplicitTransitionCount: transitions.filter(({ resolution }) => resolution.resolved).length,
      unresolvedExplicitTransitionCount: transitions.filter(({ resolution }) => !resolution.resolved).length,
      conditionSiteCount: conditionSites.length,
      gridQuestionCount: grids.length,
      gridRowCount: grids.reduce((count, grid) => count + grid.rowCount, 0),
      loopStartCount: loops.length,
      loopDefinitionCount: loopDefinitions.length,
      loopExpandedQuestionCount: questionRecords.filter(({ loopIteration }) => loopIteration !== null).length,
    },
  };
}
