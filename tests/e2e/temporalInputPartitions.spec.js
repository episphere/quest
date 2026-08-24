import { test, expect } from './support/test.js';
import { activeQuestion, expectHealthyHarness, goNext, openParticipant } from './support/harness.js';

const STANDARD_DESKTOPS = new Set(['chromium-desktop', 'firefox-desktop', 'webkit-desktop']);

const INPUTS = [
  {
    id: 'DATE_DYNAMIC', type: 'date',
    markup: '|date|id=DATE_DYNAMIC min=valueOrDefault(\'D_DATE_MIN\',\'2024-07-10\') max=valueOrDefault(\'D_DATE_MAX\',\'2024-07-20\')|',
    values: [['', false], ['2024-07-10', true], ['2024-07-20', true], ['2024-07-09', false], ['2024-07-21', false]],
  },
  {
    id: 'MONTH_DYNAMIC', type: 'month',
    markup: '|month|id=MONTH_DYNAMIC min=valueOrDefault(\'D_123456789_0_0\',\'2024-03\') max=valueOrDefault(\'D_987654321_0_0\',\'2024-09\')|',
    values: [['', false], ['2024-03', true], ['2024-09', true], ['2024-02', false], ['2024-10', false]],
  },
  {
    id: 'TIME_STATIC', type: 'time',
    markup: '|time|id=TIME_STATIC min=09:00 max=17:00|',
    values: [['', false], ['09:00', true], ['17:00', true], ['08:59', false], ['17:01', false]],
  },
  {
    id: 'NUMBER_DYNAMIC', type: 'number',
    markup: '|__|__|id=NUMBER_DYNAMIC min=_value(\'age\') max=sum(age,5)|',
    values: [['', false], ['45', true], ['50', true], ['44', false], ['51', false]],
  },
];

function surveyFor(input) {
  return `{"name":"TEST_${input.id}"}\n\n[${input.id}?] Enter a value.\n${input.markup}\n\n[END,end] Complete.`;
}

test.describe('temporal and dynamic numeric validation @core @canonical', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(!STANDARD_DESKTOPS.has(testInfo.project.name), 'Validation runs in the three desktop engines.');
  });

  for (const input of INPUTS) {
    test(`${input.type} accepts its valid boundary values and rejects its out-of-range values`, async ({ page }) => {
      for (const [value, valid] of input.values) {
        await openParticipant(page, { markdown: surveyFor(input), previousResults: { age: '45' } });
        const control = activeQuestion(page, input.id).locator(`#${input.id}`);
        if (value) await control.fill(value);
        await goNext(page);
        if (valid) await expect(activeQuestion(page, 'END')).toBeVisible();
        else await expect(activeQuestion(page, input.id)).toBeVisible();
        await expectHealthyHarness(page);
      }
    });
  }
});
