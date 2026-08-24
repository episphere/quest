import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from './support/test.js';
import {
  activeQuestion,
  expectHealthyHarness,
  goBack,
  goNext,
  openParticipant,
} from './support/harness.js';
import { readLockedMarkdown, repositoryRoot, treeAt } from './support/corpus.js';

const DESKTOP_ENGINES = new Set([
  'chromium-desktop',
  'firefox-desktop',
  'webkit-desktop',
]);
const hostPersonas = JSON.parse(readFileSync(join(repositoryRoot, 'tests', 'corpus', 'hostPersonas.json'), 'utf8'));
const profilePersona = hostPersonas.personas.find(({ id }) => id === 'external-branch-primary');

const INTRO_EXPECTATIONS = {
  en: {
    paragraphs: [
      { start: 'Welcome, Test Participant!', end: 'skip any questions that you do not want to answer.' },
      { start: 'For some questions,', end: 'Here is an example.' },
      { start: 'Let’s get started.', end: 'Let’s get started.' },
    ],
    popup: {
      text: 'example.',
      title: 'example',
      content: 'This is an example of how additional information will be displayed.',
    },
  },
  es: {
    paragraphs: [
      { start: '¡Bienvenido, Test Participant!', end: 'Se puede saltar cualquier pregunta que no desee responder.' },
      { start: 'En algunas preguntas,', end: 'Este es ejemplo.' },
      { start: 'Comencemos.', end: 'Comencemos.' },
    ],
    popup: {
      text: 'ejemplo.',
      title: 'ejemplo',
      content: 'Este es un ejemplo de cómo se verá la información adicional',
    },
  },
};

const ADDRESS_EXPECTATIONS = {
  en: {
    popupText: 'filtered or treated',
    popupTitle: 'Informational Text',
    popupContent: 'Please only include water that has not been filtered or treated through reverse osmosis, distillation, or filters that remove lead, chlorine, pesticides, or other chemicals. You can include water filtered with water softeners, which are filters that remove only sediment from the water.',
    fallbackAddress: 'the current address you provided',
  },
  es: {
    popupText: 'filtrado o potabilizado',
    popupTitle: 'Texto de ayuda',
    popupContent: 'Incluya solo agua que no se filtró ni que se potabilizó mediante ósmosis inversa, destilación o filtros que eliminan plomo, cloro, plaguicidas u otras sustancias químicas. Puede incluir agua filtrada con descalcificadores, que son filtros que solo eliminan los sedimentos del agua.',
    fallbackAddress: 'la dirección actual que nos dio',
  },
};

const addressState = {
  D_121490150: {
    D_255248624: '123',
    D_945532934: 'Production Avenue',
    D_303500597: 'Baltimore',
    D_195068098: 'Maryland',
    D_202784871: '21201',
    D_831127170: 'United States',
  },
  D_958419506: '901693169',
  treeJSON: treeAt('D_539909957', 'D_958419506'),
};

async function introProjection(question) {
  return question.locator('fieldset > legend.question-text').evaluate((legend) => {
    const profile = legend.querySelector('span[name="firstName"]');
    const popup = legend.querySelector('[data-bs-toggle="popover"]');
    const renderedText = legend.innerText.replace(/\r\n?/g, '\n');
    return {
      legendCount: legend.parentElement.querySelectorAll(':scope > legend.question-text').length,
      helperCount: legend.parentElement.querySelectorAll('.screen-reader-focus').length,
      helperTabIndex: legend.parentElement.querySelector('.screen-reader-focus')?.tabIndex ?? null,
      paragraphs: renderedText.split(/\n[ \t]*\n/).map((text) => text.trim()).filter(Boolean),
      paragraphSeparatorCount: (renderedText.match(/\n[ \t]*\n/g) ?? []).length,
      hasExcessiveParagraphSpacing: /(?:\n[ \t]*){3,}/.test(renderedText),
      whiteSpace: getComputedStyle(legend).whiteSpace,
      profile: profile && {
        name: profile.getAttribute('name'),
        text: profile.textContent,
      },
      popup: popup && {
        text: popup.textContent,
        title: popup.getAttribute('data-bs-original-title')
          || popup.getAttribute('data-bs-title')
          || popup.getAttribute('title'),
        content: popup.getAttribute('data-bs-content')?.trim(),
        trigger: popup.getAttribute('data-bs-trigger'),
      },
    };
  });
}

async function richAddressProjection(question) {
  return question.locator('fieldset').evaluate((fieldset) => {
    const legend = fieldset.querySelector(':scope > legend.question-text');
    const helper = fieldset.querySelector(':scope > .screen-reader-focus');
    const firstResponse = fieldset.querySelector(':scope > .response');
    const popup = fieldset.querySelector('.response [data-bs-toggle="popover"]');
    const visibleAddress = Array.from(legend.querySelectorAll('.displayif'))
      .find((element) => element.style.display !== 'none' && element.querySelector('[forid], [original-forid]'));
    const conditionals = Array.from(legend.querySelectorAll('.displayif'), (element) => ({
      condition: element.getAttribute('displayif'),
      text: element.textContent.replace(/\s+/g, ' ').trim(),
      visible: getComputedStyle(element).display !== 'none',
    }));
    const radioLabels = Array.from(fieldset.querySelectorAll('.response input[type="radio"]'), (control) => ({
      id: control.id,
      labelCount: control.labels.length,
      labelFor: control.labels[0]?.htmlFor ?? null,
    }));

    return {
      legendCount: fieldset.querySelectorAll(':scope > legend.question-text').length,
      helperCount: fieldset.querySelectorAll(':scope > .screen-reader-focus').length,
      helperTabIndex: helper?.tabIndex ?? null,
      helperImmediatelyBeforeResponse: helper?.nextElementSibling === firstResponse,
      rawPipeVisible: legend.textContent.includes('{$'),
      renderedLegendText: legend.innerText.replace(/\s+/g, ' ').trim(),
      conditionals,
      visibleAddressText: visibleAddress?.innerText.replace(/\s+/g, ' ').trim() ?? null,
      pipedValues: visibleAddress
        ? Array.from(visibleAddress.querySelectorAll('[forid], [original-forid]'), (element) => ({
          id: element.getAttribute('original-forid') ?? element.getAttribute('forid'),
          text: element.textContent,
          parentTag: element.parentElement.tagName,
          visible: getComputedStyle(element).display !== 'none',
        }))
        : [],
      radioLabels,
      checkedRadio: fieldset.querySelector('input[type="radio"]:checked')?.id ?? null,
      popup: popup && {
        text: popup.textContent,
        title: popup.getAttribute('data-bs-original-title')
          || popup.getAttribute('data-bs-title')
          || popup.getAttribute('title'),
        content: popup.getAttribute('data-bs-content'),
        responseControlId: popup.closest('.response')?.querySelector('input[type="radio"]')?.id ?? null,
        responseLabelFor: popup.closest('.response')?.querySelector('label')?.htmlFor ?? null,
      },
    };
  });
}

test.describe('locked Module 1 intro markup fidelity @canonical @corpus', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      !DESKTOP_ENGINES.has(testInfo.project.name),
      'The production markup contract runs in the canonical desktop browser matrix.',
    );
  });

  for (const language of ['en', 'es']) {
    test(`keeps ${language} raw blank-line paragraphs, profile text, and popup markup through Next then Back`, async ({ page }, testInfo) => {
      const expectation = INTRO_EXPECTATIONS[language];
      const participantInputs = {
        ...profilePersona.previousResults,
        ...profilePersona.userProfile,
      };
      testInfo.annotations.push(
        { type: 'corpus-path', description: language === 'en' ? 'prod/module1.txt' : 'prod/module1Spanish.txt' },
        { type: 'host-persona', description: profilePersona.id },
      );

      await openParticipant(page, {
        markdown: readLockedMarkdown('module1', language),
        lang: language,
        previousResults: participantInputs,
        questVersion: '4.0',
      });

      const intro = activeQuestion(page, 'INTROM1');
      await expect(intro).toBeVisible();
      const initial = await introProjection(intro);

      expect(initial).toMatchObject({
        legendCount: 1,
        helperCount: 1,
        helperTabIndex: -1,
        paragraphSeparatorCount: 2,
        hasExcessiveParagraphSpacing: false,
        whiteSpace: 'pre-line',
        profile: { name: 'firstName', text: profilePersona.userProfile.firstName },
        popup: { ...expectation.popup, trigger: 'manual' },
      });
      // The real intro uses three raw text blocks and exactly two blank-line
      // separators; it does not rely on authored paragraph elements.
      expect(initial.paragraphs).toHaveLength(3);
      expectation.paragraphs.forEach(({ start, end }, index) => {
        expect(initial.paragraphs[index].startsWith(start)).toBe(true);
        expect(initial.paragraphs[index].endsWith(end)).toBe(true);
      });

      await goNext(page);
      await expect(activeQuestion(page, 'INTROBAC')).toBeVisible();
      await goBack(page);
      await expect(activeQuestion(page, 'INTROM1')).toBeVisible();

      expect(await introProjection(activeQuestion(page, 'INTROM1'))).toEqual(initial);
      await expectHealthyHarness(page);
    });
  }
});

test.describe('locked Module 4 rich response markup fidelity @canonical @corpus', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      !DESKTOP_ENGINES.has(testInfo.project.name),
      'The production response-bearing rich-markup contract runs in the canonical desktop browser matrix.',
    );
  });

  for (const language of ['en', 'es']) {
    test(`keeps ${language} address piping, rich response text, and labels through Next then Back`, async ({ page }) => {
      const expectation = ADDRESS_EXPECTATIONS[language];
      await openParticipant(page, {
        markdown: readLockedMarkdown('module4', language),
        lang: language,
        persistedData: addressState,
      });

      const question = activeQuestion(page, 'D_539909957');
      await expect(question).toBeVisible();
      const initial = await richAddressProjection(question);

      expect(initial).toMatchObject({
        legendCount: 1,
        helperCount: 1,
        helperTabIndex: -1,
        helperImmediatelyBeforeResponse: true,
        rawPipeVisible: false,
        checkedRadio: null,
        popup: {
          text: expectation.popupText,
          title: expectation.popupTitle,
          content: expectation.popupContent,
          responseControlId: 'D_539909957_123108471',
          responseLabelFor: 'D_539909957_123108471',
        },
      });
      expect(initial.conditionals).toHaveLength(2);
      expect(initial.conditionals.filter(({ visible }) => visible)).toHaveLength(1);
      expect(initial.conditionals.filter(({ visible }) => !visible)).toHaveLength(1);
      expect(initial.conditionals.find(({ visible }) => !visible).text).toContain(expectation.fallbackAddress);
      expect(initial.renderedLegendText).not.toContain(expectation.fallbackAddress);
      expect(initial.visibleAddressText).toContain('123 Production Avenue');
      expect(initial.visibleAddressText).toContain('Baltimore');
      expect(initial.visibleAddressText).toContain('21201');
      expect(initial.pipedValues).toEqual(expect.arrayContaining([
        { id: 'D_255248624', text: '123', parentTag: 'B', visible: true },
        { id: 'D_945532934', text: 'Production Avenue', parentTag: 'B', visible: true },
        { id: 'D_303500597', text: 'Baltimore', parentTag: 'B', visible: true },
      ]));
      expect(initial.pipedValues.filter(({ visible }) => visible).map(({ id }) => id)).toEqual([
        'D_255248624',
        'D_945532934',
        'D_303500597',
        'D_195068098',
        'D_202784871',
        'D_831127170',
      ]);
      expect(initial.radioLabels).toHaveLength(8);
      expect(initial.radioLabels.every(({ id, labelCount, labelFor }) => (
        labelCount === 1 && labelFor === id
      ))).toBe(true);
      await question.locator('label[for="D_539909957_463122075"]').click();
      const selected = await richAddressProjection(question);
      expect(selected.checkedRadio).toBe('D_539909957_463122075');
      await goNext(page);
      await expect(activeQuestion(page)).toBeVisible();
      expect(await activeQuestion(page).getAttribute('id')).not.toBe('D_539909957');
      await goBack(page);
      await expect(activeQuestion(page, 'D_539909957')).toBeVisible();
      expect(await richAddressProjection(activeQuestion(page, 'D_539909957'))).toEqual(selected);
      await expectHealthyHarness(page);
    });
  }
});
