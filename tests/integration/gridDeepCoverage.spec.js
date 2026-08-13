import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { renderFreshQuest } from '../helpers/questRuntime.js';

// This is the nine-row sleep grid from the locked production module2.txt
// corpus (commit 7ae99a22af325cf0e14be047a7636462db9bfd50). Keeping the authored
// IDs and response values makes the state-shape contract reviewable.
const PRODUCTION_SLEEP_GRID_SURVEY = `
{"name":"TEST_PRODUCTION_GRID"}
[GRID_LEAD] The next question uses a production response grid.
|grid?|id="D_981441822"|What is the chance that you would doze off or fall asleep (not just "feel tired") in each of these situations? If you are never or rarely in the situation, please make your best guess for what would happen.|[
[D_403155173] Sitting and reading;
[D_576621769] Watching television;
[D_988508028] Sitting inactive in public place (such as a theater or a meeting); [D_186488870] Riding as a passenger in a car for an hour without stopping;
[D_922388461] Lying down to rest in the afternoon;
[D_760686611] Sitting and talking to someone;
[D_354550061] Sitting quietly after a lunch that did not include alcohol;
[D_179705366] In a car, while you are stopped for a few minutes in traffic;
[D_955609858] At the dinner table;]|
(514068832:No chance)
(774439579:Slight Chance)
(747099514:Moderate Chance)
(977681388: High Chance)|
[END,end] Done.
`;

const CHECKBOX_GRID_SURVEY = `
{"name":"TEST_GRID_CHECKBOX_STATE"}
[GRID_LEAD] The next question uses a checkbox response grid.
|grid!|id="GRID_CHECKBOX_STATE"|Which supports apply?|[
[ROW_PHONE] First need;
[ROW_EMAIL] Second need;]|
[1:Phone][2:Email]|
[END,end] Done.
`;

// The two row conditions mirror the condition-driven symptom rows in the
// locked COVID module's D_114280729 grid, reduced to isolate completeness.
const CONDITIONAL_ROW_GRID_SURVEY = `
{"name":"TEST_CONDITIONAL_GRID"}
[GRID_LEAD] The next question uses condition-driven production-style rows.
|grid?|id="GRID_CONDITIONAL"|How long did you experience the following symptoms?|[
[D_374567479,displayif=equals(SHOW_TASTE,1)] Loss of taste or smell;
[D_966214244,displayif=equals(SHOW_FATIGUE,1)] Feeling generally more tired than you used to feel;]|
(232063618:Less than 1 month)
(948148236:Between 1 and 3 months)
(692824372:More than 3 months)|
[END,end] Done.
`;

function validationGridSurvey(prompt) {
  return `
{"name":"TEST_${prompt === '!' ? 'HARD' : 'SOFT'}_GRID"}
[GRID_LEAD] The next question uses a required response grid.
|grid${prompt}|id="GRID_VALIDATION"|Rate both items.|[
[ROW_ONE] First item;
[ROW_TWO] Second item;]|
(1:Never)
(2:Often)|
[END,end] Done.
`;
}

const productionAlcoholFrequencyRows = [
  'D_294629316', 'D_164707243', 'D_771426895', 'D_818310825',
  'D_843593800', 'D_175385712', 'D_772143730', 'D_602102163',
];
const productionAlcoholCheckboxRows = [
  'D_912659087', 'D_643512687', 'D_688123102', 'D_356133766',
  'D_690918725', 'D_178609656', 'D_261957180', 'D_715827646',
];
const productionAlcoholCheckboxValues = ['789689151', '663253668', '104676242', '137733407'];
const corpusLock = JSON.parse(readFileSync(join(import.meta.dirname, '../corpus/lock.json'), 'utf8'));
const module3Path = join(import.meta.dirname, '../..', corpusLock.cacheRoot, corpusLock.commit, 'prod/module3.txt');
const lockedModule3Markdown = existsSync(module3Path) ? readFileSync(module3Path, 'utf8') : null;

function treeAt(questionID) {
  return JSON.stringify({
    rootNode: { value: null, children: [{ value: questionID, children: [] }] },
    currentNode: questionID,
  });
}

describe('deep grid state coverage', () => {
  it('restores every independently keyed row in the locked production sleep grid', async () => {
    const restoredRows = {
      D_403155173: '774439579',
      D_576621769: '747099514',
      D_988508028: '977681388',
      D_186488870: '514068832',
      D_922388461: '774439579',
      D_760686611: '747099514',
      D_354550061: '977681388',
      D_179705366: '514068832',
      D_955609858: '774439579',
    };
    const quest = await renderFreshQuest({
      markdown: PRODUCTION_SLEEP_GRID_SURVEY,
      persistedData: {
        D_981441822: restoredRows,
        treeJSON: treeAt('D_981441822'),
      },
    });
    const grid = quest.root.querySelector('#D_981441822');

    expect(grid.dataset.grid).toBe('true');
    expect(grid.querySelectorAll('tr[data-gridrow="true"]')).toHaveLength(9);
    expect(grid.querySelectorAll('th[scope="col"]')).toHaveLength(4);
    for (const [rowId, value] of Object.entries(restoredRows)) {
      expect(grid.querySelector(`input[name="${rowId}"][value="${value}"]`).checked).toBe(true);
    }
    expect(quest.state.getActiveQuestionState()).toEqual({ D_981441822: restoredRows });
    expect(quest.state.getResponseToQuestionMapping()).toMatchObject({
      'D_403155173.D_981441822': 'D_981441822.D_403155173',
      'D_955609858.D_981441822': 'D_981441822.D_955609858',
    });
    expect(quest.errors).toEqual([]);
  });

  it('tracks checkbox rows independently through delegated select, deselect, and reset flows', async () => {
    const quest = await renderFreshQuest({
      markdown: CHECKBOX_GRID_SURVEY,
      persistedData: { treeJSON: treeAt('GRID_CHECKBOX_STATE') },
    });
    const grid = quest.root.querySelector('#GRID_CHECKBOX_STATE');
    const phone = grid.querySelector('#ROW_PHONE_0');
    const email = grid.querySelector('#ROW_EMAIL_1');

    phone.click();
    email.click();
    expect(quest.state.getActiveQuestionState()).toEqual({
      GRID_CHECKBOX_STATE: {
        ROW_PHONE: ['1'],
        ROW_EMAIL: ['2'],
      },
    });

    phone.click();
    expect(phone.checked).toBe(false);
    expect(email.checked).toBe(true);
    expect(quest.state.getCache()['ROW_PHONE.GRID_CHECKBOX_STATE']).toBeUndefined();
    expect(quest.state.getResponseToQuestionMapping()['ROW_PHONE.GRID_CHECKBOX_STATE']).toBeUndefined();

    grid.querySelector('button.reset').click();
    expect(grid.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(0);
    expect(quest.state.getActiveQuestionState().GRID_CHECKBOX_STATE).toBeUndefined();
    expect(quest.errors).toEqual([]);
  });

  it('excludes hidden production-style conditional rows from required grid completeness', async () => {
    const quest = await renderFreshQuest({
      markdown: CONDITIONAL_ROW_GRID_SURVEY,
      persistedData: {
        SHOW_TASTE: '1',
        SHOW_FATIGUE: '0',
        treeJSON: treeAt('GRID_CONDITIONAL'),
      },
    });
    const grid = quest.root.querySelector('#GRID_CONDITIONAL');
    const visibleRow = grid.querySelector('[data-question-id="D_374567479"]');
    const hiddenRow = grid.querySelector('[data-question-id="D_966214244"]');

    expect(visibleRow.style.display).not.toBe('none');
    expect(hiddenRow.style.display).toBe('none');
    expect(hiddenRow.dataset.hidden).toBe('true');
    visibleRow.querySelector('input[value="232063618"]').click();
    grid.querySelector('button.next').click();

    await vi.waitFor(() => expect(quest.root.querySelector('form.question.active')?.id).toBe('END'));
    expect(quest.root.querySelector('#softModal').classList.contains('show')).toBe(false);
    expect(quest.errors).toEqual([]);
  });

  it.each([
    ['?', 'softModal'],
    ['!', 'hardModal'],
  ])('shows the %s grid validation state before an unanswered grid can advance', async (prompt, modalId) => {
    const quest = await renderFreshQuest({
      markdown: validationGridSurvey(prompt),
      persistedData: { treeJSON: treeAt('GRID_VALIDATION') },
    });
    const grid = quest.root.querySelector('#GRID_VALIDATION');

    grid.querySelector('button.next').click();
    await vi.waitFor(() => expect(quest.root.querySelector(`#${modalId}`).classList.contains('show')).toBe(true));
    expect(quest.root.querySelector(`#${modalId} [role="alert"]`)).not.toBeNull();
    expect(quest.root.querySelector('form.question.active')?.id).toBe('GRID_VALIDATION');
    expect(quest.errors).toEqual([]);
  });

  it.skipIf(!lockedModule3Markdown)('stores and restores independently selected arrays in the locked production Module 3 checkbox grid', async () => {
    const markdown = lockedModule3Markdown;
    const seededState = {
      D_141874857: '16',
      D_480426504: '24',
      D_633553324: {
        D_294629316: '950039557',
        D_164707243: '402048066',
      },
      treeJSON: treeAt('D_470862706'),
    };
    const quest = await renderFreshQuest({ markdown, persistedData: seededState });
    const grid = quest.root.querySelector('#D_470862706');
    const visibleRows = Array.from(grid.querySelectorAll('tr[data-gridrow="true"]'))
      .filter((row) => row.style.display !== 'none');

    expect(visibleRows.map((row) => row.dataset.questionId)).toEqual(['D_912659087', 'D_643512687']);
    expect(grid.querySelectorAll('tr[data-gridrow="true"][data-hidden="true"]')).toHaveLength(6);
    expect(grid.querySelectorAll('[data-gridreplace]')).not.toHaveLength(0);
    expect(grid.querySelectorAll('input[type="checkbox"]')).toHaveLength(32);

    grid.querySelector('input[name="D_912659087"][value="789689151"]').click();
    grid.querySelector('input[name="D_912659087"][value="104676242"]').click();
    grid.querySelector('input[name="D_643512687"][value="663253668"]').click();
    const expectedRows = {
      D_912659087: ['789689151', '104676242'],
      D_643512687: ['663253668'],
    };
    expect(quest.state.getActiveQuestionState()).toEqual({ D_470862706: expectedRows });

    grid.querySelector('button.next').click();
    await vi.waitFor(() => expect(quest.root.querySelector('form.question.active')?.id).toBe('INTROSE'));
    const storedState = quest.state.getSurveyState();
    expect(storedState).toMatchObject({ D_470862706: expectedRows });
    expect(quest.calls.store.at(-1)['D_965707586.D_470862706']).toEqual(expectedRows);

    const restored = await renderFreshQuest({
      markdown,
      persistedData: { ...storedState, treeJSON: treeAt('D_470862706') },
    });
    const restoredGrid = restored.root.querySelector('#D_470862706');
    for (const [rowId, values] of Object.entries(expectedRows)) {
      for (const value of values) {
        expect(restoredGrid.querySelector(`input[name="${rowId}"][value="${value}"]`).checked).toBe(true);
      }
    }
    expect(restoredGrid.querySelectorAll('tr[data-gridrow="true"][data-hidden="true"]')).toHaveLength(6);
    expect(restored.errors).toEqual([]);
  });

  it('keeps Module 3 English and Spanish production checkbox-grid IDs and axes in parity', () => {
    const catalog = JSON.parse(readFileSync(join(import.meta.dirname, '../corpus/structuralCatalog.json'), 'utf8'));
    const variants = catalog.surveys
      .filter(({ module, locale }) => module === 'module3' && ['en', 'es'].includes(locale))
      .map(({ locale, grids }) => ({ locale, grid: grids.find(({ questionId }) => questionId === 'D_470862706') }));

    expect(variants).toHaveLength(2);
    for (const { grid } of variants) {
      expect(grid).toMatchObject({
        rowCount: 8,
        rowQuestionIds: productionAlcoholCheckboxRows,
        responseTypes: ['checkbox'],
        responseValues: productionAlcoholCheckboxValues,
      });
    }
  });
});
