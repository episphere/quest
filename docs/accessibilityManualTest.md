# Quest 2 accessibility manual test matrix

Scope: **Quest 2 participant runtime only**

Browser automation can inspect DOM semantics, focus, state, and live regions, but it does not run VoiceOver or JAWS and cannot prove what either screen reader announces. This matrix describes those manual accessibility testing processes.

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
  `fixture=navigationState.txt`.
- Keep Quest inside `#root > .row > #questionnaireRoot`.
- Start each scenario from a new browser page. Quest owns module-level state and a second render in the same page is not a supported isolation boundary.
- Do not enable browser extensions other than the screen reader under test.
- Record operating-system, browser, screen-reader, and Quest commit/version values before testing.
- Run `npm run test:e2e -- --grep "@canonical|@axe|@responsive|@windows-a11y"` first. Automated results are prerequisites, not substitutes for this matrix.

## Environment matrix

| ID | Operating system | Browser | Assistive technology | Required modes |
| --- | --- | --- | --- | --- |
| KBD-MAC | Current supported macOS | Safari | None | Full Keyboard Access on |
| VO-SAF | Current supported macOS | Safari | VoiceOver | Quick Nav off, then Quick Nav on |
| KBD-WIN | Windows 11 | Current Chrome and Edge | None | Browser default keyboard handling |
| JAWS-CHR | Windows 11 | Current Chrome | Current supported JAWS | Virtual Cursor, Forms Mode |
| JAWS-EDG | Windows 11 | Current Edge | Current supported JAWS | Virtual Cursor, Forms Mode |

“Current” must be replaced with exact version numbers in the test record. Playwright WebKit is not Safari plus VoiceOver, and Chromium with a Windows user-agent string is not JAWS.

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

## VoiceOver with Safari — issue #1079

First run with Quick Nav off. Repeat response navigation and activation with Quick Nav on, and record the VoiceOver command actually used.

1. Start VoiceOver before loading the page and open the canonical control fixture.
2. Confirm the survey boundary and the first question are announced once. The question must have a meaningful group/legend name.
3. Navigate by form controls and by VoiceOver cursor. Each response must expose role, name, and selected/checked state; styled labels alone are insufficient.
4. Activate a response with the VoiceOver default action (normally VO+Space). Confirm the visual selection, DOM checked state, and polite live announcement all agree.
5. Navigate forward. Focus must land at the newly active question context after the deliberate delay; it must not remain on a removed button or move to the PWA header/footer.
6. Use Back. Confirm the earlier response is restored and announced with the correct checked state.
7. Exercise text, number, select, date, and time controls. Confirm each control has a useful name and browser-native editing still works.
8. Trigger required and range validation. Confirm the error is announced, focus remains in the question, and correction clears the error.
9. Exercise the response grid. Confirm row prompt, column option, and selected state are available together.
10. Open and close soft-validation and submit dialogs. Confirm dialog name, focus entry, keyboard containment, close action, and return focus.

## JAWS with Chrome and Edge — issue #1079

Run each browser once. State explicitly whether each observation occurred in Virtual Cursor or Forms Mode.

1. Start JAWS before opening the canonical control fixture.
2. In Virtual Cursor, navigate to the survey and confirm the first question is announced once with its group name.
3. Enumerate form controls. Every choice must expose radio/checkbox role, name, and checked state; a focusable generic response container is not an adequate replacement.
4. Enter Forms Mode and activate a choice with the JAWS default action. Confirm visual state, DOM state, and live announcement agree.
5. Use the response container/list navigation supplied for Windows. Confirm there is no dead tab stop and no double activation.
6. For radio groups, verify native group exclusivity and arrow behavior while in the appropriate mode.
7. For “Other” text responses, use Up/Down navigation around the embedded text field. Confirm focus neither traps nor skips the neighboring response.
8. Exercise both grid fixtures. After a radio selection, confirm the next row prompt is announced; after the last radio row, confirm focus proceeds to Next. In the checkbox grid, confirm an intermediate selection stays in its cell and the terminal selection proceeds to Next.
9. Repeat Next, Back, validation, state restoration, async success/error, and modal focus scenarios from the VoiceOver matrix.
10. Exit Forms Mode and confirm the Virtual Cursor resumes at a sensible location in the active question.

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

## Test record

Copy this table into the issue or test report for every execution. Do not replace exact versions with “latest” or “current.”

| Field | Recorded value |
| --- | --- |
| Protocol version | 1.0.0 |
| Quest commit and Quest version |  |
| Questionnaire fixture/version |  |
| Environment ID |  |
| OS name, edition, and exact version |  |
| Browser name and exact version |  |
| Assistive technology and exact version |  |
| AT mode / Quick Nav / Full Keyboard Access |  |
| Tester and date |  |
| Automated prerequisite run URL/result |  |
| Steps passed |  |
| Steps failed |  |
| Issue/evidence links |  |
| Overall result | PASS / FAIL / BLOCKED |

Record each step separately; an aggregate PASS must never hide a skipped browser,
assistive-technology mode, or interaction.

| Environment ID | Procedure / step | AT mode | Result | Actual focus, role/name/state, and spoken output | Evidence / defect |
| --- | --- | --- | --- | --- | --- |
| KBD-MAC | Keyboard 1 | Full Keyboard Access | PASS / FAIL / BLOCKED / NOT RUN |  |  |
| VO-SAF | VoiceOver 1 | Quick Nav off | PASS / FAIL / BLOCKED / NOT RUN |  |  |
| VO-SAF | VoiceOver 1 | Quick Nav on | PASS / FAIL / BLOCKED / NOT RUN |  |  |
| KBD-WIN | Keyboard 1 | Browser default | PASS / FAIL / BLOCKED / NOT RUN |  |  |
| JAWS-CHR | JAWS 1 | Virtual Cursor | PASS / FAIL / BLOCKED / NOT RUN |  |  |
| JAWS-CHR | JAWS 1 | Forms Mode | PASS / FAIL / BLOCKED / NOT RUN |  |  |
| JAWS-EDG | JAWS 1 | Virtual Cursor | PASS / FAIL / BLOCKED / NOT RUN |  |  |
| JAWS-EDG | JAWS 1 | Forms Mode | PASS / FAIL / BLOCKED / NOT RUN |  |  |

Duplicate rows for every numbered step in the applicable procedure. `NOT RUN`
is not a pass and requires a reason in the final column.
