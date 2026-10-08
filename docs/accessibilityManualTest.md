# Quest 2 accessibility manual test matrix

Scope: **Quest 2 participant runtime only**

Browser automation can inspect DOM semantics, focus, state, and live regions, but it does not run VoiceOver or JAWS and cannot prove what either screen reader announces. This matrix describes those manual accessibility testing processes.

For the keyboard-only command guide, see
[`keyboardNavigation.md`](keyboardNavigation.md).

For VoiceOvcer testing, see
[Quest VoiceOver guide](voiceOverTestingGuide.md). The matrix below is the separate developer protocol using standalone test pages.

## Test boundary

- Use only non-production participant data and the canonical fixtures under `tests/fixtures/canonical/`.
- On the target test machine, install the Node version in `.node-version`, run `npm ci`, and install the
  browser binaries with `npx playwright install chromium firefox webkit`.
- Start the server with `npm run harness:start`. Leave that terminal running.
- Open
  `http://127.0.0.1:4173/tests/harness/participant.html?fixture=runtimeControls.txt`
  in Safari for VoiceOver, or in Chrome/Edge on Windows 11 for JAWS. The query
  loads the public synthetic canonical control fixture automatically.
- For radio-grid steps, reload a fresh page at the same URL with
  `fixture=gridResponsive.txt`; for checkbox-grid focus branches use
  `fixture=gridCheckboxFocus.txt`; for validation use
  `fixture=validation.txt`; for navigation/restoration use
  `fixture=navigationState.txt`; for compound radio subgroups use
  `fixture=compoundRadioGroups.txt` and repeat with
  `fixture=compoundRadioGroupsSpanish.txt&lang=es`; for conditionally displayed
  radio subgroups use `fixture=conditionalCompoundRadioGroups.txt` and
  repeat with `fixture=conditionalCompoundRadioGroupsSpanish.txt&lang=es`.
- Keep Quest inside `#root > .row > #questionnaireRoot`.
- Start each manual scenario from a new browser page. The participant harness intentionally permits one render per page so one scenario cannot contaminate the next; Quest's sequential-render behavior is covered separately by automation.
- Do not enable browser extensions other than the screen reader under test.
- Record operating-system, browser, screen-reader, and Quest commit/version values before testing.
- Run `npm run test:e2e -- --grep "@canonical|@axe|@responsive|@windows-a11y"` first. Automated results are prerequisites, not substitutes for this matrix.

## Runnable production-shaped scenarios

For the Module 1 weight-history controls, open both language-specific URLs:

- English: `http://127.0.0.1:4173/tests/harness/participant.html?fixture=module1WeightHistory.txt&scenario=weight-history-en&lang=en`
- Spanish: `http://127.0.0.1:4173/tests/harness/participant.html?fixture=module1WeightHistorySpanish.txt&scenario=weight-history-es&lang=es`

For each URL, navigate through all five visible weight fields. Confirm each field
includes its distinct age and unit context. In Spanish, type `18.5` with the
physical keyboard and confirm the field contains `185`: whole numbers are
accepted while decimal punctuation is filtered without a browser error.

## Runnable dialog and asynchronous scenarios

Start each check in a new page. Use these exact harness URLs and actions so the
same configured state is exercised in every browser and screen reader.

### Requested- and required-response dialogs

Open
`http://127.0.0.1:4173/tests/harness/participant.html?fixture=unansweredModals.txt`.

1. Leave `SOFT` unanswered and activate Next. Test every dismissal action in the requested-response dialog.
2. Reopen it, activate Continue Without Answering, and confirm `HARD` becomes active.
3. Leave `HARD` unanswered and activate Next. Test every dismissal action in the required-response dialog.
4. After each dismissal, immediately move to or activate a response. Wait at least one second and confirm focus does not jump back.

### Submit dialog

Open
`http://127.0.0.1:4173/tests/harness/participant.html?fixture=validation.txt`.

1. Enter `2`, activate Next, and activate Submit your survey.
2. Test Close, Cancel, Escape, and keyboard focus containment in the submit dialog.
3. After dismissal, immediately interact with the active question, wait at least one second, and confirm focus does not jump back.

### Response-confirmation dialog

Open both language-specific URLs:

- English: `http://127.0.0.1:4173/tests/harness/participant.html?fixture=responseConfirmation.txt&lang=en`
- Spanish: `http://127.0.0.1:4173/tests/harness/participant.html?fixture=responseConfirmationSpanish.txt&lang=es`

For each URL:

1. Enter `65` in the weight field and move focus out of the field.
2. Confirm the response-confirmation dialog uses the selected language and test Close, Correct/Correcto, Incorrect/Incorrecto, and Escape.
3. Confirm each dismissal returns focus to the weight field. Immediately edit or navigate, wait at least one second, and confirm focus does not jump back.

### Configured store failure

Open
`http://127.0.0.1:4173/tests/harness/participant.html?fixture=navigationState.txt&scenario=store-failure`.

1. Select Yes and activate Next. The first store call is configured to return a non-success result and the store-error dialog must open.
2. Leave the dialog open for at least six seconds. Confirm it remains open and keyboard focus remains contained.
3. Dismiss it with Close. Confirm focus returns to the active question, then activate Next to exercise the configured successful retry.
4. Immediately interact after dismissal, wait at least one second, and confirm focus does not jump back.

### Asynchronous question success and error

For success, open
`http://127.0.0.1:4173/tests/harness/participant.html?fixture=asyncQuestion.txt&scenario=async-success`.
Select Clinical and activate Next. Confirm the `ASYNC` question finishes loading before focus reaches it, then select a host-provided option and continue.

For error, open
`http://127.0.0.1:4173/tests/harness/participant.html?fixture=asyncQuestion.txt&scenario=async-error`.
Select Research and activate Next. Confirm `ASYNC` remains active, focus moves to its in-question error, the error is announced once, the loading message disappears, and Tab proceeds to Next and then Back without stale or missing response markup.

The harness accepts only the documented `scenario` values and the `en` or `es`
language values. A scenario used with the wrong fixture is rejected before Quest renders.

## Environment matrix

| ID | Operating system | Browser | Assistive technology | Required modes |
| --- | --- | --- | --- | --- |
| KBD-MAC | Current supported macOS | Safari | None | Full Keyboard Access on |
| VO-SAF | Current supported macOS | Safari | VoiceOver | Quick Nav off, then Quick Nav on |
| KBD-WIN | Windows 11 | Current Chrome and Edge | None | Browser default keyboard handling |
| JAWS-CHR | Windows 11 | Current Chrome | Current supported JAWS | Virtual Cursor, Forms Mode |
| JAWS-EDG | Windows 11 | Current Edge | Current supported JAWS | Virtual Cursor, Forms Mode |

“Current” must be replaced with exact version numbers in the test record. Playwright WebKit is not Safari plus VoiceOver, and Chromium with a Windows user-agent string is not JAWS.

## Test record

Create a separate record for every environment, browser, assistive-technology mode, and fixture run. Do not use one blanket result for a scenario or environment.

Record these fields before starting:

| Field | Required value |
| --- | --- |
| Date and tester | Test date and tester name or initials |
| Quest revision | Exact commit SHA and Quest version, if versioned |
| Environment | Environment-matrix ID and exact operating-system version/build |
| Browser | Browser name and exact version |
| Assistive technology | Name and exact version, or `None` for keyboard-only runs |
| Mode | Full Keyboard Access, Quick Nav, Virtual Cursor, or Forms Mode state, as applicable |
| Fixture and viewport | Fixture filename and viewport dimensions |
| Automated prerequisite | Exact command and its pass/fail result |

Record every numbered or table step separately:

| Scenario and step | Result | Actual focus, role/name/state, and spoken output | Evidence or defect |
| --- | --- | --- | --- |
| Example: VoiceOver step 2 | `PASS`, `FAIL`, `BLOCKED`, or `NOT RUN` | Record the observed result. Do not write only “as expected” | Link evidence or explain the blocker/omission |

Use `BLOCKED` only when an external condition prevents the step. Use `NOT RUN` only with a reason. A scenario passes only when every required step has an explicit `PASS`; an aggregate environment-level pass cannot replace the per-step record.

## Keyboard-only baseline — issue #1587

Run KBD-MAC and KBD-WIN without a screen reader. Repeat in both Chrome and Edge for KBD-WIN.

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Tab from “Participant dashboard” | Focus follows DOM order and is always visibly indicated; it does not disappear into a hidden control. |
| 2 | Shift+Tab | Focus returns to the immediately preceding operable control. |
| 3 | Focus a link and press Enter | The link performs its native action. |
| 4 | Focus Next, Reset, and Back; press Enter, then repeat with Space | Each button performs exactly one action with either key. |
| 5 | Focus an unchecked checkbox and press Space twice | Checked state becomes true, then false; the live message agrees with state. |
| 6 | Focus a radio group and use Up/Down and Left/Right | Focus and selection move within the group; exactly one option remains checked. |
| 7 | Focus a native select; use Alt+Down or Space as appropriate for the browser, arrows, Enter, and Escape | The browser opens, navigates, commits, and dismisses the native control without a custom Quest key trap. |
| 8 | On a text question, Tab through actions | Tab order is Next, Reset, Back even though desktop visual order is Back, Reset, Next. |
| 9 | Repeat the response-grid fixture at phone width | Each stacked response remains operable and its checked state is visible. |

Raw browser key expectations apply only to this keyboard-only baseline. Do not file a failure solely because a screen reader reserves or reroutes one of these keys.

Standards note for issue #1587: a custom element with `role="button"` must activate with both Enter and Space, as specified by the [WAI-ARIA button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/button/). Native `<select>` interaction is implemented by the browser and operating system. The portable Quest contract is that the control remains native, its keys are not canceled, and committed state persists—not that Space, Enter, or Escape has one identical expand/select/collapse sequence in every environment. See the [HTML Standard's select element](https://html.spec.whatwg.org/multipage/form-elements.html#the-select-element) and [WCAG 2.1.1 keyboard guidance](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html).

## VoiceOver with Safari — issue #1079

First run with Quick Nav off. Repeat response navigation and activation with Quick Nav on, and record the VoiceOver command actually used.

1. Start VoiceOver before loading the page and open the canonical control fixture.
2. Confirm the survey boundary and the first question are announced once. The question must have a meaningful group/legend name.
3. Navigate by form controls and by VoiceOver cursor. Each response must expose role, name, and selected/checked state; styled labels alone are insufficient.
4. Activate a response with the VoiceOver default action (normally VO+Space). Confirm the visual selection, DOM checked state, and polite live announcement all agree.
5. Immediately navigate forward after selecting a response. The newly active question must be announced once and receive focus promptly; focus must not remain on a removed button, move to the PWA header/footer, or jump away after the participant starts using a response. The previous response's delayed “Selected” or “Unselected” message must not interrupt or replay over the new question.
6. Use Back immediately after another selection. Confirm the earlier response is restored and announced with the correct checked state, and that the response announcement from the question being left does not replay.
7. Exercise text, number, select, date, and time controls. Confirm each control has a useful name and browser-native editing still works. In Module 1 weight history, verify that each field includes its distinct age and unit context; in Spanish question `D_912857732`, type with the physical keyboard and confirm whole numbers are accepted without a browser error while decimal punctuation is filtered. In a Module 4 backup-address form, verify that City, State/Province, Zip code, and Country remain distinguishable.
8. Trigger required and range validation. Confirm the error is announced, focus remains in the question, and correction clears the error.
9. Exercise the response grid. Confirm row prompt, column option, and selected state are available together.
10. Open and close requested-response, required-response, submit, response-confirmation, and configured store-error dialogs. Confirm dialog name and description, focus entry, keyboard containment, each close action, and immediate return to the invoking control or active question context. Leave the store-error dialog open for at least six seconds and confirm it remains open with focus contained, then dismiss it manually. After each dismissal, immediately move to or activate a response, wait at least one second, and confirm focus never jumps back.
11. Open each compound-radio fixture. Enter both activity groups and traverse all answers. Confirm VoiceOver announces the visible activity prompt as the radio-group name, each answer as the radio name, and its checked state. Confirm the activity prompt is not a separate empty or alert stop.
12. Open each conditional compound-radio fixture. Select both travel modes and continue. Confirm each mode prompt is announced once when entering its group; each answer name and checked state is announced once; and exiting does not repeat the full answer list. Use Back, remove one mode, and continue again. Confirm the removed group is absent, the retained group is still named correctly, and no duplicate, empty, or separate repeated-prompt stop is announced.

## JAWS with Chrome and Edge — issue #1079

Run each browser once. State explicitly whether each observation occurred in Virtual Cursor or Forms Mode.

1. Start JAWS before opening the canonical control fixture.
2. In Virtual Cursor, navigate to the survey and confirm the first question is announced once with its group name.
3. Enumerate form controls. Every choice must expose radio/checkbox role, name, and checked state; a focusable generic response container is not an adequate replacement.
4. Enter Forms Mode and activate a choice with the JAWS default action. Confirm visual state, DOM state, and live announcement agree.
5. Tab through the response list. Focus must land on native inputs and actions only. Generic response containers and empty helper elements must not become stops.
6. For radio groups, verify native group exclusivity and arrow behavior while in the appropriate mode.
7. For “Other” text responses, confirm Up/Down remains native text-editing navigation and Tab/Shift+Tab leaves the field in document order. Quest must not turn editing arrows into response-navigation commands.
8. Exercise both grid fixtures. In Forms Mode, radio arrows must move only within the current row's native group, and Tab must reach the next row. Selecting a radio or checkbox must not automatically move focus to another row or to Next. Confirm JAWS announces the row prompt, column option, and checked state together.
9. Repeat Next, Back, validation, state restoration, async success/error, and modal focus scenarios from the VoiceOver matrix, including its scalar-control checks and the immediate-navigation check that an old response announcement never replays on the newly active question.
10. Exit Forms Mode and confirm the Virtual Cursor resumes at a sensible location in the active question.
11. Open each compound-radio fixture. In Virtual Cursor and Forms Mode, enter both activity groups and traverse all answers. Confirm JAWS announces the visible activity prompt when entering its group, preserves the concise answer name and checked state, and does not expose the activity prompt as a separate alert or form control.
12. Open each conditional compound-radio fixture. Select both travel modes and continue. In Virtual Cursor and Forms Mode, confirm each mode prompt is announced once on group entry; each answer name and checked state is announced once; and exiting does not repeat the full answer list. Use Back, remove one mode, and continue again. Confirm the removed group is absent, the retained group remains correctly named, and no duplicate, empty, or separate repeated-prompt stop is exposed.

The conditional fixture follows the WAI-ARIA radio-group contract: the visible
mode prompt names a `radiogroup`, and `aria-owns` associates native radios that
cannot safely be moved under that prompt in Quest's established conditional
layout. See the [radio role](https://www.w3.org/TR/wai-aria/#radio),
[`aria-owns`](https://www.w3.org/TR/wai-aria/#aria-owns), and the
[ARIA radio-group pattern](https://www.w3.org/WAI/ARIA/apg/patterns/radio/).

## Evidence to capture

For every failure, record:

- environment ID and exact OS/browser/screen-reader versions;
- Quick Nav, Virtual Cursor, or Forms Mode state;
- fixture, question ID, response ID, and viewport;
- the physical keys and screen-reader command used;
- expected versus actual role, accessible name, checked state, focus target, and spoken output;
- whether visual DOM state and stored Quest state changed;
- a minimal reproduction trace or video with participant data removed;
- the related issue: [#1079](https://github.com/episphere/connect/issues/1079) for JAWS/VoiceOver behavior or [#1587](https://github.com/episphere/connect/issues/1587) for keyboard-only operation.

Pass only when the keyboard-only matrix succeeds independently and both screen readers expose correct role/name/state and predictable focus. A Playwright pass, a user-agent simulation, or success in only one screen-reader mode is not sufficient.
