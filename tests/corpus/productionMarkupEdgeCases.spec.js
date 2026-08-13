import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { renderFreshQuest } from '../helpers/questRuntime.js';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const corpusLock = JSON.parse(readFileSync(path.join(import.meta.dirname, 'lock.json'), 'utf8'));
const hostPersonas = JSON.parse(readFileSync(path.join(import.meta.dirname, 'hostPersonas.json'), 'utf8'));
const profilePersona = hostPersonas.personas.find(({ id }) => id === 'external-branch-primary');
const lockedCorpusRoot = path.join(repositoryRoot, corpusLock.cacheRoot, corpusLock.commit);

function lockedMarkdown(file) {
  const record = corpusLock.files.find(({ path: sourcePath }) => sourcePath === `prod/${file}`);
  expect(record, `prod/${file} must remain in the locked questionnaire manifest`).toBeTruthy();
  const sourcePath = path.join(lockedCorpusRoot, record.path);
  expect(
    existsSync(sourcePath),
    `Locked corpus cache is absent. Run npm run corpus:fetch for ${corpusLock.commit}.`,
  ).toBe(true);
  return readFileSync(sourcePath, 'utf8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function lockedQuestion(file, questionId) {
  const lines = lockedMarkdown(file).split(/\r?\n/);
  const questionHeader = new RegExp(`^\\[${escapeRegExp(questionId)}(?:[?!])?(?=\\||,|\\])`);
  const nextQuestionHeader = /^\[[A-Z_][A-Z0-9_#]*[?!]?(?=\||,|\])/;
  const start = lines.findIndex((line) => questionHeader.test(line));
  expect(start, `${file} must contain locked question ${questionId}`).toBeGreaterThanOrEqual(0);
  const relativeEnd = lines.slice(start + 1).findIndex((line) => nextQuestionHeader.test(line));
  const end = relativeEnd < 0 ? lines.length : start + 1 + relativeEnd;
  const block = lines.slice(start, end).join('\n').trimEnd();
  expect(block.startsWith(`[${questionId}`)).toBe(true);
  return block;
}

function survey(name, ...questions) {
  return `{"name":"${name}"}\n\n${questions.join('\n\n')}\n\n[END,end] Done.`;
}

async function renderLockedFullList(file) {
  const previousResults = {
    ...profilePersona.previousResults,
    ...profilePersona.userProfile,
  };
  return renderFreshQuest({
    markdown: lockedMarkdown(file),
    previousResults,
    params: {
      activate: false,
      isRenderer: true,
      showProgressBarInQuest: false,
    },
  });
}

describe('locked production markup edge cases', () => {
  it('renders each production popup variant without re-authoring its question block', async () => {
    const titlelessBlock = lockedQuestion('module2.txt', 'D_674976924');
    const conditionalBlock = lockedQuestion('module2.txt', 'D_486574018');
    const boldBlock = lockedQuestion('module2.txt', 'D_133297530');
    const responseBlock = lockedQuestion('module3.txt', 'D_857219333');

    expect(titlelessBlock).toContain('|popup|shift worker|Shift work is work');
    expect(conditionalBlock).toMatch(/^\[D_486574018\?,displayif=/);
    expect(conditionalBlock).toContain('|displayif=or(equals(D_391951010');
    expect(boldBlock).toMatch(/^\[D_133297530\?,displayif=/);
    expect(boldBlock).toContain('|popup|<b>eclampsia or pre-eclampsia</b>|');
    expect(responseBlock).toContain('(696181630) |popup|Hazel|Informational Text|');

    const module2Quest = await renderLockedFullList('module2.txt');
    const titlelessPopup = module2Quest.root.querySelector('#D_674976924 [data-bs-toggle="popover"]');
    expect(titlelessPopup).toMatchObject({ textContent: 'shift worker', title: '' });
    expect(titlelessPopup.dataset.bsContent).toContain('schedule different from the traditional 9:00AM');

    const conditionalQuestion = module2Quest.root.querySelector('[id^="D_486574018_"]');
    expect(decodeURIComponent(conditionalQuestion.getAttribute('displayif'))).toContain('greaterThan(D_405571048,1)');
    const conditionalPopups = conditionalQuestion.querySelectorAll('.displayif [data-bs-toggle="popover"]');
    expect(conditionalPopups).toHaveLength(2);
    expect(Array.from(conditionalPopups, ({ dataset }) => dataset.bsContent)).toEqual([
      expect.stringContaining('breast pump'),
      expect.stringContaining('breast pump'),
    ]);

    const boldQuestion = module2Quest.root.querySelector('[id^="D_133297530_"]');
    expect(decodeURIComponent(boldQuestion.getAttribute('displayif'))).toContain('greaterThan(D_405571048,1)');
    const boldPopup = boldQuestion.querySelector('[data-bs-toggle="popover"]');
    expect(boldPopup).toMatchObject({ title: 'Eclampsia or Pre-eclampsia' });
    expect(boldPopup.querySelector('b')?.textContent).toBe('eclampsia or pre-eclampsia');
    expect(module2Quest.errors).toEqual([]);

    const module3Quest = await renderLockedFullList('module3.txt');
    const responsePopup = module3Quest.root.querySelector('#D_857219333 .response [data-bs-toggle="popover"]');
    expect(responsePopup).toMatchObject({ textContent: 'Hazel', title: 'Informational Text' });
    const popupResponse = responsePopup.closest('.response');
    expect(popupResponse.querySelector('input[type="radio"]')?.id).toBe('D_857219333_696181630');
    expect(popupResponse.querySelector('label')?.htmlFor).toBe('D_857219333_696181630');
    expect(module3Quest.errors).toEqual([]);
  });

  it('preserves current rendering of locked nonstandard breaks and unmatched paragraph closings', async () => {
    const nonstandardBreak = lockedQuestion('module2.txt', 'D_466346054');
    const medicationSource = lockedQuestion('module2.txt', 'D_881200765');
    const unmatchedParagraph = lockedQuestion('module1.txt', 'D_869387390');
    const siblingNameSource = lockedQuestion('module1.txt', 'D_406098499');
    expect(nonstandardBreak).toContain('?</br></br>');
    expect(unmatchedParagraph).toContain('today?</p>');

    const breakQuest = await renderFreshQuest({
      // Keep both authored production blocks intact; placing the dependent
      // source after the active target lets Quest resolve the pipe without
      // changing the malformed target markup under characterization.
      markdown: survey('PRODUCTION_NONSTANDARD_BREAK', nonstandardBreak, medicationSource),
    });
    const fertilityQuestion = breakQuest.root.querySelector('#D_466346054');
    expect(fertilityQuestion.querySelector('legend')?.textContent).toContain('the other fertility medication');
    expect(fertilityQuestion.querySelector('input[type="number"]')).not.toBeNull();
    expect(breakQuest.errors).toEqual([]);

    const paragraphQuest = await renderFreshQuest({
      markdown: survey('PRODUCTION_UNMATCHED_PARAGRAPH', unmatchedParagraph, siblingNameSource),
    });
    const siblingQuestion = paragraphQuest.root.querySelector('#D_869387390');
    expect(siblingQuestion.querySelector('legend')?.textContent.replace(/\s+/g, ' ')).toContain('How old is your sibling today?');
    expect(siblingQuestion.querySelector('fieldset p')?.textContent.trim()).toBe('');
    expect(siblingQuestion.querySelector('input[type="number"]')).not.toBeNull();
    expect(paragraphQuest.errors).toEqual([]);
  });

  it('prepares the complete locked QoL compound question through the public render boundary', async () => {
    const quest = await renderFreshQuest({
      markdown: lockedMarkdown('moduleQoL.txt'),
      params: { isRenderer: true },
    });
    const question = quest.root.querySelector('#D_284353934');
    const fieldset = question.querySelector('fieldset');
    const legend = fieldset.querySelector(':scope > legend');

    expect(legend?.textContent).toContain(
      'Please respond to each question by selecting the response that best describes you.',
    );
    expect(legend?.textContent).toContain('Are you able to do chores such as vacuuming or yard work?');
    expect(fieldset.querySelectorAll(':scope > .screen-reader-focus')).toHaveLength(1);
    expect(question.querySelectorAll('input[type="radio"]')).toHaveLength(20);
    expect(new Set(Array.from(question.querySelectorAll('input[type="radio"]'), (input) => input.name))).toEqual(new Set([
      'D_559540891',
      'D_917425212',
      'D_783201540',
      'D_780866928',
    ]));
    expect(quest.errors).toEqual([]);
  });
});
