import { describe, expect, it, vi } from 'vitest';

import { readLockedMarkdown, treeAtPath } from '../e2e/support/corpus.js';
import { renderFreshQuest } from '../helpers/questRuntime.js';

const durationGridId = 'D_114280729';
const otherSymptomsId = 'D_110872086';
const noResponse = '104430631';
const symptomRows = {
  D_847578001: [
    'D_488415137',
    'D_167695804',
    'D_730334054',
    'D_215996690',
    'D_462737492',
    'D_469675296',
  ],
  D_136730307: [
    'D_962475128',
    'D_989576239',
    'D_338613869',
    'D_126794793',
    'D_218793117',
  ],
  D_751358419: [
    'D_524096053',
    'D_814101706',
    'D_635026188',
    'D_238135048',
    'D_632714520',
  ],
};
const symptomResponseIds = Object.values(symptomRows)
  .flat()
  .flatMap((id) => [`${id}_0`, `${id}_1`]);
const correctedDurationCondition = `someSelected("${symptomResponseIds.join('","')}")`;

function withCorrectedDurationCondition(markdown) {
  const durationHeader = /(\|grid\?\|id="D_114280729"\s+displayif=)[^|]+/;
  if (!durationHeader.test(markdown)) {
    throw new Error('Locked COVID Markdown is missing the D_114280729 grid header');
  }
  return markdown.replace(durationHeader, `$1${correctedDurationCondition}`);
}

function symptomState(selectedSymptomId = null, selectedSymptomValue = '724612102') {
  return Object.fromEntries(Object.entries(symptomRows).map(([gridId, rowIds]) => [
    gridId,
    Object.fromEntries(rowIds.map((rowId) => [
      rowId,
      rowId === selectedSymptomId ? selectedSymptomValue : '244354126',
    ])),
  ]));
}

async function resumeAtOtherSymptoms(
  markdown,
  locale,
  selectedSymptomId,
  selectedSymptomValue,
) {
  return renderFreshQuest({
    markdown,
    persistedData: {
      D_860011428: '1',
      D_694503437_1_1: '353358909',
      ...symptomState(selectedSymptomId, selectedSymptomValue),
      treeJSON: treeAtPath([otherSymptomsId]),
    },
    params: { lang: locale },
  });
}

async function selectNoOtherSymptomsAndAdvance(quest) {
  const otherSymptoms = quest.root.querySelector(`form.question.active#${otherSymptomsId}`);
  expect(otherSymptoms).not.toBeNull();
  otherSymptoms.querySelector(`#${otherSymptomsId}_${noResponse}`).click();
  otherSymptoms.querySelector('button.next').click();
}

describe('locked production COVID symptom-duration navigation', () => {
  const variants = ['en', 'es'].flatMap((locale) => {
    const locked = readLockedMarkdown('moduleCOVID19', locale);
    return [
      [locale, 'locked source', locked],
      [locale, 'corrected condition', withCorrectedDurationCondition(locked)],
    ];
  });

  it.each(variants)(
    '%s %s reaches D_114280729 and exposes only the selected symptom row',
    async (locale, _sourceLabel, markdown) => {
      const quest = await resumeAtOtherSymptoms(
        markdown,
        locale,
        'D_524096053',
        '178780048',
      );

      await selectNoOtherSymptomsAndAdvance(quest);
      await vi.waitFor(() => expect(
        quest.root.querySelector('form.question.active')?.id,
      ).toBe(durationGridId));

      const grid = quest.root.querySelector(`#${durationGridId}`);
      const exposedRowIds = Array.from(grid.querySelectorAll('tr[data-gridrow="true"]'))
        .filter((row) => row.style.display !== 'none' && row.dataset.hidden !== 'true')
        .map((row) => row.dataset.questionId);

      expect(grid.dataset.grid).toBe('true');
      expect(exposedRowIds).toEqual(['D_336856410']);
      expect(grid.querySelectorAll('tr[data-gridrow="true"][data-hidden="true"]')).toHaveLength(15);
      expect(quest.errors).toEqual([]);
    },
  );

  it.each(['en', 'es'])('%s all-no symptoms bypass D_114280729', async (locale) => {
    const quest = await resumeAtOtherSymptoms(
      readLockedMarkdown('moduleCOVID19', locale),
      locale,
      null,
    );

    await selectNoOtherSymptomsAndAdvance(quest);
    await vi.waitFor(() => expect(
      quest.root.querySelector('form.question.active')?.id,
    ).toBe('COV20_SKIP'));
    expect(quest.root.querySelector(`#${durationGridId}`)).toBeNull();

    quest.root.querySelector('#COV20_SKIP button.next').click();
    await vi.waitFor(() => expect(
      quest.root.querySelector('form.question.active')?.id,
    ).toBe('COV20A17_SKIP'));
    expect(quest.root.querySelector(`#${durationGridId}`)).toBeNull();
    expect(quest.errors).toEqual([]);
  });
});
