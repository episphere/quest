import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from './support/test.js';
import {
  activeQuestion,
  expectHealthyHarness,
  flushHarness,
  goBack,
  goNext,
  harnessSnapshot,
  openParticipant,
  waitInHarness,
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
      // separators; it does not rely on paragraph elements.
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

test.describe('locked Module 1 conditional scalar semantics @canonical @corpus', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      !DESKTOP_ENGINES.has(testInfo.project.name),
      'Conditional scalar semantics run in the desktop browser matrix.',
    );
  });

  for (const scalarCase of [
    {
      language: 'en',
      dialogName: 'Response Requested',
      dialogDescription: 'Is the weight correct?',
      closeButton: 'Close',
      correctButton: 'Correct',
      incorrectButton: 'Incorrect',
      weightDescription: 'Value must be greater than or equal to 0. Value must be less than or equal to 999',
      names: [
        'a. 18 years old, Pounds (lbs)',
        'b. 25 years old, Pounds (lbs)',
        'c. 35 years old, Pounds (lbs)',
        'd. 45 years old, Pounds (lbs)',
        'e. 55 years old, Pounds (lbs)',
      ],
    },
    {
      language: 'es',
      dialogName: 'Respuesta Solicitada',
      dialogDescription: '¿Este peso es correcto?',
      closeButton: 'Cerrar',
      correctButton: 'Correcto',
      incorrectButton: 'Incorrecto',
      weightDescription: 'El valor debe ser mayor o igual a 0. El valor debe ser menor o igual a 999',
      names: [
        'a. 18 años, NÚM. DE LIBRAS (lbs)',
        'b. 25 años, NÚM. DE LIBRAS (lbs)',
        'c. 35 años, NÚM. DE LIBRAS (lbs)',
        'd. 45 años, NÚM. DE LIBRAS (lbs)',
        'e. 55 años, NÚM. DE LIBRAS (lbs)',
      ],
    },
  ]) {
    test(`gives every ${scalarCase.language} weight-history field distinct conditional context`, async ({ page }, testInfo) => {
      await openParticipant(page, {
        markdown: readLockedMarkdown('module1', scalarCase.language),
        lang: scalarCase.language,
        previousResults: {
          ...profilePersona.previousResults,
          ...profilePersona.userProfile,
          age: '60',
        },
        persistedData: { treeJSON: treeAt('D_912857732') },
      });

      const question = activeQuestion(page, 'D_912857732');
      const weightInputs = question.locator('input[type="number"]:visible');
      await expect(weightInputs).toHaveCount(scalarCase.names.length);
      await expect(question).not.toContainText('|displayif=');
      for (const [index, accessibleName] of scalarCase.names.entries()) {
        await expect(weightInputs.nth(index)).toHaveAccessibleName(accessibleName);
      }
      expect(await weightInputs.evaluateAll((inputs) => (
        new Set(inputs.map((input) => input.getAttribute('aria-label'))).size
      ))).toBe(scalarCase.names.length);

      const firstWeight = question.locator('#D_821387277');
      await expect(firstWeight).toHaveAccessibleDescription(scalarCase.weightDescription);
      await firstWeight.pressSequentially('18.5');
      await expect(firstWeight).toHaveValue('185');
      await firstWeight.fill('');

      await firstWeight.fill('65');
      await firstWeight.blur();
      const responseModal = page.locator('#softModalResponse');
      const responseDialog = page.getByRole('dialog', { name: scalarCase.dialogName });
      await expect(responseModal).toHaveClass(/show/);
      await expect(responseDialog).toHaveAccessibleDescription(scalarCase.dialogDescription);
      await expect(responseDialog.locator('[role="alert"]')).toHaveCount(0);
      await expect(responseDialog.locator('#modalResponseBody')).toHaveAttribute('tabindex', '-1');
      await expect(responseDialog.locator('#modalResponseBody')).toBeFocused();
      const closeButton = responseDialog.getByRole('button', { name: scalarCase.closeButton, exact: true });
      const correctButton = responseDialog.getByRole('button', { name: scalarCase.correctButton, exact: true });
      const incorrectButton = responseDialog.getByRole('button', { name: scalarCase.incorrectButton, exact: true });
      await expect(closeButton).toBeVisible();
      await expect(correctButton).toBeVisible();
      await expect(incorrectButton).toBeVisible();
      await responseModal.evaluate((element) => {
        element.addEventListener('hidden.bs.modal', () => {
          element.__questFocusAtHidden = document.activeElement?.id ?? null;
        }, { once: true });
      });
      await correctButton.click();
      await expect(responseModal).not.toHaveClass(/show/);
      expect(await responseModal.evaluate((element) => element.__questFocusAtHidden)).toBe('D_821387277');
      await expect(firstWeight).toBeFocused();
      await expect(firstWeight).toHaveAttribute('data-accepted-modal-value', '65');
      await firstWeight.press('Tab');
      await expect(responseModal).not.toHaveClass(/show/);

      await firstWeight.fill('66');
      await firstWeight.blur();
      await expect(responseModal).toHaveClass(/show/);
      await expect(responseDialog.locator('#modalResponseBody')).toBeFocused();
      if (testInfo.project.name === 'chromium-desktop') {
        await incorrectButton.click();
      } else if (testInfo.project.name === 'firefox-desktop') {
        await closeButton.click();
      } else {
        await page.keyboard.press('Escape');
      }
      await expect(responseModal).not.toHaveClass(/show/);
      await expect(firstWeight).toBeFocused();
      await expect(firstWeight).not.toHaveAttribute('data-accepted-modal-value');

      await firstWeight.press('Tab');
      await expect(responseModal).toHaveClass(/show/);
      await correctButton.click();
      await expect(responseModal).not.toHaveClass(/show/);
      await expect(firstWeight).toBeFocused();
      await expect(firstWeight).toHaveAttribute('data-accepted-modal-value', '66');

      await firstWeight.fill('180');
      await waitInHarness(page, 250);
      await expect(firstWeight).toBeFocused();
      await expect(firstWeight).toHaveValue('180');

      if (testInfo.project.name === 'chromium-desktop') {
        const thirdWeight = question.locator('#D_950080618');
        const expectedWeights = {
          D_821387277: '180',
          D_950080618: '175',
        };
        await firstWeight.blur();
        await thirdWeight.pressSequentially('175');
        await thirdWeight.blur();
        await flushHarness(page);
        let snapshot = await harnessSnapshot(page);
        expect(snapshot.state.active.D_912857732).toEqual(expectedWeights);

        await goNext(page);
        await flushHarness(page);
        snapshot = await harnessSnapshot(page);
        expect(snapshot.state.survey.D_912857732).toEqual(expectedWeights);
        const responseKey = 'D_726699695_V2.D_912857732';
        const storeCall = snapshot.logs.storeCalls.find(({ changes }) => (
          Object.hasOwn(changes, responseKey)
        ));
        expect(storeCall?.changes[responseKey]).toEqual(expectedWeights);
        expect(Object.keys(storeCall.changes)).toEqual(expect.arrayContaining([
          responseKey,
          'D_726699695_V2.treeJSON',
        ]));

        await goBack(page);
        await expect(activeQuestion(page, 'D_912857732')).toBeVisible();
        await expect(firstWeight).toHaveValue('180');
        await expect(thirdWeight).toHaveValue('175');
      } else {
        await firstWeight.fill('');
        await firstWeight.blur();
      }

      await expectHealthyHarness(page);
    });
  }

  test('keeps inapplicable Spanish weight fields hidden while the visible fields accept whole numbers', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-desktop',
      'One real-browser condition-boundary check is sufficient. The full naming matrix runs in every desktop engine.',
    );

    await openParticipant(page, {
      markdown: readLockedMarkdown('module1', 'es'),
      lang: 'es',
      previousResults: {
        ...profilePersona.previousResults,
        ...profilePersona.userProfile,
        age: '30',
      },
      persistedData: { treeJSON: treeAt('D_912857732') },
    });

    const question = activeQuestion(page, 'D_912857732');
    await expect(question.locator('input[type="number"]:visible')).toHaveCount(2);
    await expect(question.locator('#D_821387277')).toBeVisible();
    await expect(question.locator('#D_121646540')).toBeVisible();
    await expect(question.locator('#D_950080618')).toBeHidden();
    await expect(question.locator('#D_407167089')).toBeHidden();
    await expect(question.locator('#D_503154158')).toBeHidden();

    const firstWeight = question.locator('#D_821387277');
    await firstWeight.pressSequentially('18.5');
    await expect(firstWeight).toHaveValue('185');
    await expectHealthyHarness(page);
  });
});
