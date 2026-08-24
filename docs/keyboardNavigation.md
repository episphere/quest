# Quest 2 keyboard controls

Use this guide for keyboard-only operation without VoiceOver or JAWS.
Screen readers may reserve or reroute these keys. Use the screen reader's normal
navigation and activation commands when assistive technology is running.

## Commands

| Control | Command | Expected behavior |
| --- | --- | --- |
| Move between controls | **Tab** / **Shift+Tab** | Move forward / backward in a logical order. Focus is always visible. |
| Link | **Enter** | Open or follow the link once. |
| Button, including Next, Back, Reset, and dialog buttons | **Enter** or **Space** | Run the button's action once. |
| Survey actions | **Tab** | Move through **Next**, **Reset**, then **Back**. This logical keyboard order is intentional even though desktop layout displays Back, Reset, Next. |
| Checkbox, including checkbox-grid choices | **Space** | Check or uncheck the focused choice. Tab moves to each checkbox. |
| Radio-button question | **Tab** into the group, **Arrow keys** within it, **Space** to select | Tab treats the group as one stop. Arrows move and select one choice; Tab then leaves the group. Enter is not required to select a radio button. |
| “Other” choice with a text field | **Space**, then **Tab** | Select the choice, then enter its text field. Arrow keys stay in the text field; they do not navigate responses. |
| Grid, one answer per row | **Tab** between rows, **Arrow keys** within a row | Move to and select one choice in the current row without moving focus to another row or to Next. |
| Grid, one or more answers per row | **Tab** between choices, **Space** to toggle | Visit each choice and check or uncheck any that apply. Selection does not move focus automatically. |
| Native dropdown (`select`) | **Tab** to focus it; then use the browser/OS commands | Arrow keys navigate. Space or Alt+Down may open it, Enter may commit, and Escape may dismiss it. The exact open/close sequence varies by browser and operating system. |
| Text, number, date, month, time, and textarea fields | Use the control's native editing keys | Arrow keys move the caret or operate the native control. Enter makes a new line in a textarea; it does not advance from a single-line field. Tab leaves the field. |
| Question help popup | **Enter** or **Space** to toggle; **Escape** to close | Tab closes the popup and continues to the next control. |
| Unanswered-question dialog | **Tab** / **Shift+Tab**, then **Enter** or **Space**; **Escape** to close | Focus stays inside the dialog. An optional question offers **Continue Without Answering**; a required question does not. Returning places focus back at the question. |

For grids, follow the question's selection instruction, not the appearance of
the circles or boxes. **Choose one answer per row** uses the first grid command.
**Select all that apply** uses the second. A screen reader should also announce
each choice as a radio button or checkbox. If the visible question does not say
whether one or multiple answers are allowed, report it; users should not have
to guess.

## Tester expectations

- Test without a screen reader first. Repeat assistive-technology testing using
  `accessibilityManualTest.md`.
- For Safari, enable **Press Tab to highlight each item on a web page** and/or
  macOS Keyboard Navigation before testing.
- Confirm every focused control has a visible indicator.
- Confirm each command performs one action, updates the visible state, and is
  stored. Use Back to confirm the stored selection is restored.
- Confirm arrow keys remain native inside text fields and that Quest does not
  impose a custom key sequence on native dropdowns.
- After Next, Back, or dialog dismissal, confirm focus moves to the current
  question prompt. The prompt itself must not become an extra Tab stop.
- Test radio and checkbox grids at desktop and phone widths. Focus, selection,
  and stored data must agree in both layouts.
- Apply this guide only inside Quest. Focus behavior on the surrounding
  ConnectApp page is a separate integration responsibility.

## Why these commands

Quest uses native HTML links, buttons, inputs, and dropdowns wherever possible.
Native controls provide established keyboard behavior and allow the browser,
operating system, and assistive technology to work together.

Issue [#1587](https://github.com/episphere/connect/issues/1587) describes the
right overall goal, with two portability clarifications:

- A native radio group is one Tab stop. Arrow keys move and select within it.
- A native dropdown must keep the platform's behavior. Quest must not force one
  Space/Enter/Escape sequence on every browser. In particular, Escape is not a
  portable command for committing a new selection.

References:

- [WCAG 2.1.1: Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html)
- [WCAG 2.4.3: Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html)
- [WAI-ARIA button keyboard pattern](https://www.w3.org/WAI/ARIA/apg/patterns/button/)
- [WAI-ARIA link keyboard pattern](https://www.w3.org/WAI/ARIA/apg/patterns/link/)
- [WAI-ARIA checkbox keyboard pattern](https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/)
- [WAI-ARIA radio-group keyboard pattern](https://www.w3.org/WAI/ARIA/apg/patterns/radio/)
- [WAI-ARIA modal-dialog keyboard pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [HTML `select` element](https://html.spec.whatwg.org/multipage/form-elements.html#the-select-element)
- [Safari keyboard shortcuts](https://support.apple.com/guide/safari/cpsh003/mac)
