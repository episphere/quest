import { test, expect } from './support/test.js';
import {
  activeQuestion,
  expectHealthyHarness,
  goBack,
  goNext,
  harnessSnapshot,
  openParticipant,
} from './support/harness.js';
import { readLockedMarkdown, treeAt } from './support/corpus.js';

const questName = 'D_506648060';
const deviceKinds = 'D_145727599';
const phoneKinds = 'D_470013848';
const otherPhoneText = 'D_495052121';
const tabletKinds = 'D_731524314';
const computerKinds = 'D_403175318';
const preferredDevice = 'D_260186214';
const personalDevice = 'D_210120853';
const joiningReasons = 'D_960544981';
const joiningReasonsDetail = 'D_674994176';

function response(question, response) {
  return `${question}_${response}`;
}

test.describe('locked 2024 Connect Experience derived conditions @corpus', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'The production derived-condition paths run once in Chromium.');
  });

  for (const language of ['en', 'es']) {
    test(`uses nested ${language} device responses in selectionCount, response conditions, and piped labels`, async ({ page }) => {
      await openParticipant(page, {
        markdown: readLockedMarkdown('module2024ConnectExperience', language),
        lang: language,
        previousResults: { age: '45', yob: '1981' },
        persistedData: { treeJSON: treeAt(deviceKinds) },
      });

      const devices = activeQuestion(page, deviceKinds);
      await devices.locator(`label[for="${response(deviceKinds, '386252749')}"]`).click();
      await devices.locator(`label[for="${response(deviceKinds, '153962804')}"]`).click();
      await goNext(page);

      const phones = activeQuestion(page, phoneKinds);
      await phones.locator(`label[for="${response(phoneKinds, '807835037')}"]`).click();
      await phones.locator(`#${otherPhoneText}`).fill('Synthetic phone');
      await phones.locator(`#${otherPhoneText}`).blur();
      await goNext(page);

      const tablets = activeQuestion(page, tabletKinds);
      await tablets.locator(`label[for="${response(tabletKinds, '515798638')}"]`).click();
      await goNext(page);

      // The unselected computer branch is skipped. The selectionCount condition
      // still sees one nested phone response plus one tablet response.
      await expect(activeQuestion(page, computerKinds)).toHaveCount(0);
      const preferred = activeQuestion(page, preferredDevice);
      await expect(preferred).toBeVisible();
      await expect(preferred.locator(`label[for="${response(preferredDevice, '793072415')}"]`)).toContainText('Synthetic phone');
      await expect(preferred.locator(`label[for="${response(preferredDevice, '515798638')}"]`)).toBeVisible();
      await expect(preferred.locator(`label[for="${response(preferredDevice, '482753957')}"]`)).toBeHidden();
      await expect(preferred).not.toContainText('{$');

      await preferred.locator(`label[for="${response(preferredDevice, '793072415')}"]`).click();
      await goNext(page);
      await expect(activeQuestion(page, personalDevice)).toBeVisible();

      await goBack(page);
      await expect(activeQuestion(page, preferredDevice)).toBeVisible();
      await expect(activeQuestion(page, preferredDevice).locator(`#${response(preferredDevice, '793072415')}`)).toBeChecked();

      const snapshot = await expectHealthyHarness(page);
      expect(snapshot.state.survey).toMatchObject({
        [deviceKinds]: ['386252749', '153962804'],
        [phoneKinds]: {
          [phoneKinds]: ['807835037'],
          [otherPhoneText]: 'Synthetic phone',
        },
        [tabletKinds]: {
          [tabletKinds]: ['515798638'],
        },
        [preferredDevice]: '793072415',
      });
      expect(snapshot.state.survey).not.toHaveProperty(computerKinds);

      const storedChanges = snapshot.logs.storeCalls.flatMap(({ changes }) => Object.entries(changes));
      expect(storedChanges).toEqual(expect.arrayContaining([
        [`${questName}.${phoneKinds}`, {
          [phoneKinds]: ['807835037'],
          [otherPhoneText]: 'Synthetic phone',
        }],
        [`${questName}.${preferredDevice}`, '793072415'],
      ]));
    });

    test(`enforces the production ${language} top-three response boundary without losing valid selections`, async ({ page }) => {
      await openParticipant(page, {
        markdown: readLockedMarkdown('module2024ConnectExperience', language),
        lang: language,
        previousResults: { age: '45', yob: '1981' },
        persistedData: { treeJSON: treeAt(joiningReasons) },
      });

      const reasons = activeQuestion(page, joiningReasons);
      const selected = ['925993577', '985468594', '604524950'];
      const overLimit = '815468840';

      for (const responseId of [...selected, overLimit]) {
        await reasons.locator(`label[for="${response(joiningReasons, responseId)}"]`).click();
      }

      await expect(reasons.locator('.validation-container')).toBeVisible();
      await goNext(page);
      await expect(activeQuestion(page, joiningReasons)).toBeVisible();

      await reasons.locator(`label[for="${response(joiningReasons, overLimit)}"]`).click();
      await expect(reasons.locator('.validation-container')).toHaveCount(0);
      await goNext(page);
      await expect(activeQuestion(page, joiningReasonsDetail)).toBeVisible();

      const snapshot = await expectHealthyHarness(page);
      expect(snapshot.state.survey[joiningReasons]).toEqual(selected);
      expect(snapshot.logs.storeCalls).toEqual(expect.arrayContaining([
        expect.objectContaining({
          changes: expect.objectContaining({ [`${questName}.${joiningReasons}`]: selected }),
        }),
      ]));
    });
  }
});
