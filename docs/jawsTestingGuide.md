# Quest JAWS guide
.
1. Start JAWS before the survey. Complete sign-in and license activation separately.
2. These commands use **Laptop** layout: open JAWS with **Caps Lock + Ctrl + Shift + J**, then choose **Options > Basics > Keyboard layout > Laptop**. Hold **Caps Lock** for JAWS commands. Add **Fn** to function keys if needed.

## Commands

**Virtual Cursor** is for reading and finding controls with letters. **Forms Mode** is for typing and control arrows. **Enter** on a field or radio enters Forms Mode. **Caps Lock + Semicolon** returns to reading.

Hold keys joined by **+** together. Press letter shortcuts alone. Add **Shift** to move backward.

| Action | Keys |
| --- | --- |
| Move between controls | Tab / Shift + Tab |
| Find a radio / checkbox | A / X |
| Find an edit field / dropdown / button | E / C / B |
| Select a radio or toggle a checkbox | Space |
| Activate a button | Enter or Space |
| Read the focused control | Caps Lock + Tab |
| Toggle Virtual Cursor | Caps Lock + Z. Listen for “on” for letter shortcuts |
| Stop current speech | Ctrl |
| Dismiss a dialog where supported | Escape |

## Example checks

1. **Choices:** **A**, **Space** selects a radio. **Enter**, then use arrows to change the choice within its group. Only one should be selected. If arrows read letters, press **Enter** on the radio first. For a checkbox, **X**, **Space** checks. **Space** again unchecks.
2. **Text:** **E**, **Enter**, type `Alex`, **Left Arrow** once, then `Z` produces `AleZx`. **Enter** keeps the question open. **Tab** leaves the field. Editing an Other text field must not change its checkbox/radio.
3. **Navigation:** **Caps Lock + Semicolon**, **B** until the survey’s **Next** or **Back**, then **Enter**. Back clears the form being left. Earlier saved answers return. Forward to the cleared form should show empty answers. Also navigate immediately after selecting: hear the new question without an old selection replaying or focus jumping later.
4. **Dialogs:** Hear the heading and full message. **Tab / Shift + Tab** stays inside the dialog boundary.

## Other checks

- Grids: hear row/subquestion, answer, and checked state. Hidden follow-ups must disappear from navigation.
- Fields: distinguish weight ages/units and address fields (City, State/Province, Zip code, Country). In assigned Spanish weight-history tests, typing `18.5` produces `185` without a browser error.
- Errors: hear a meaningful message. Save-error dialogs stay open for at least six seconds until dismissed.

## If JAWS stops responding

Check mode and sign-in/activation prompts. Restart with **Caps Lock + F4** (add **Fn** if needed), confirm quitting, then open **JAWS 2026** once from Start.

[JAWS commands](https://www.freedomscientific.com/training/jaws/hotkeys/) · [Forms Mode](https://support.freedomscientific.com/SurfsUp/9-Forms.htm) · [Virtual Cursor](https://support.freedomscientific.com/teachers/lessons/4.2.3_VirtualPCCursor.htm) · [Sign-in help](https://www.freedomscientific.com/training/vispero-account-frequently-asked-questions/)

Detailed scenarios and results: [developer test matrix](accessibilityManualTest.md).
