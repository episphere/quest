# Quest VoiceOver guide for Ops

Use this guide to test Quest surveys in the PWA, using Safari and VoiceOver on a Mac.

## Setup

1. In **Safari > Settings > Advanced**, enable **Press Tab to highlight each item on a webpage**. Enable **System Settings > Keyboard > Keyboard navigation**.
2. Turn on VoiceOver before opening the survey.

## VoiceOver Commands

**VO means holding Control + Option together.** Hold them while pressing the other keys shown below.

| Action | Keys |
| --- | --- |
| Turn VoiceOver on or off | Command + F5 (add Fn if needed) |
| Move between controls | Tab / Shift + Tab |
| Read the next or previous item | VO + Right Arrow / Left Arrow |
| Activate a button or control | VO + Space |
| Enter or leave a group, if needed | VO + Shift + Down Arrow / Up Arrow |
| Pause speech | Control |
| Repeat the last announcement | VO + Z |
| Dismiss a dialog, when supported | Escape |

Start with **arrow-key Quick Nav off**. VO + Shift + Q toggles it on current macOS. On older setups, press Left Arrow and Right Arrow together. Listen for “off.” Use VO + Q to turn Quick Nav off also, so you can type answers normally.

With Quick Nav off, use plain arrow keys to change a radio choice or move through a menu reached with Tab. Space toggles a checkbox reached with Tab. VO + Space activates the control VoiceOver names.

**Use both Tab and VO + arrow keys.** Behavior may vary based on navigation method.

## What to check

Work through surveys using the keyboard (no mouse).

- **Question entry and navigation:** The question is understandable when it appears. The survey’s Next and Back buttons move focus to the new question, not the app header/footer. Returning answers are preserved where expected. Use the survey’s Back button, not Safari’s.
- **Choices and fields:** Each control announces its label, type, and selected/checked state where applicable. Select, deselect, enter, and edit answers. Date/time fields may have separate segments. Check that each is understandable and editable. Note about single option (radio) vs select-all-that-apply (checkbox) questions: These will behave differently due to the differences in accessible handling with radio vs checkbox functionality.
- **Grids and multi-part questions:** When tabbing between answers, you can tell which row or subquestion each answer belongs to. The answer label and state are clear. If changing an earlier answer hides a follow-up, its controls are no longer reachable.
- **Validation:** Where assigned, try an invalid answer or leave a required answer empty. The error is announced, invalid answers cannot advance, and correcting the answer clears the error.
- **Dialogs:** Both the heading and full message are announced. Tab stays inside the dialog. Close, Cancel, and Escape work where available.
- **Connect integration:** Entering and leaving the survey works with the app’s surrounding navigation.

Note: A tone when entering a group does not necessarily mean failure: try Tab or VO + Right Arrow. To stop distracting speech, press Control and return to Safari.


[Apple VoiceOver basics](https://support.apple.com/guide/voiceover/get-started-with-voiceover-vo4be8816d70/mac) · [Quick Nav help](https://support.apple.com/guide/voiceover/quick-nav-vo27943/mac)
