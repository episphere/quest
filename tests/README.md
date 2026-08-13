# Quest test suite

Quest owns this standalone Node 24 test package. It does not boot the Connect
PWA; browser tests embed Quest in a stable Connect-shaped page and call the
existing `transform.render(...)` API.

## Setup

1. Use the Node patch in `.node-version` and `.nvmrc`.
2. Run `npm ci`.
3. Run `npx playwright install chromium firefox webkit`.
4. Run `npm run corpus:fetch` once. The command downloads the immutable
   questionnaire revision in `tests/corpus/lock.json` and verifies its hashes.
   No GitHub token is required.

## Useful commands

- `npm test` — the fast unit and jsdom integration loop; it deliberately omits
  the slower locked-corpus catalog.
- `npm run test:corpus` — corpus integrity, structure, piping, address, and
  structural-catalog checks against the pinned questionnaire revision.
- `npm run test:coverage` — the complete Vitest suite, including corpus checks,
  with pragmatic aggregate coverage thresholds.
- `npm run test:e2e:chromium` — the complete curated Chromium suite, including
  startup and renderer/full-list checks for each locked production survey.
- `npm run test:e2e:cross-browser` — representative canonical, accessibility,
  and authoring checks in Firefox and WebKit; the full authoring suite remains
  in Chromium.
- `npm run test:e2e:responsive` — the phone and tablet Chromium contracts.
- `npm run test:e2e:windows` — the Windows-user-agent accessibility branch.
- `npm run test:known-defects` — visible expected failures for confirmed
  pre-existing defects.
- `npm run test:pr` — the complete local equivalent of the required CI lanes.
- `npm run corpus:catalog:verify` — regenerate the real parser denominator in
  memory and fail if it differs from the reviewed structural catalog.
- `npm run corpus:catalog:update` — intentionally update that catalog for
  review after a locked corpus or parser change.
- `npm run harness:start` — serve the participant and authoring harnesses for
  manual inspection.

## Scope

The suite protects parsing, rendering, delegated events, validation,
conditions, queues and loops, back/resume state, host storage and async errors,
authoring, keyboard/focus behavior, representative responsive layouts, and
full-list conversion of all locked production files. It does not implement a
second Quest navigation engine or attempt to enumerate every theoretical
response combination.

Each ordinary participant render uses a fresh page because Quest retains some
module-level state. All runtime assets are served locally, and unexpected
external requests fail the test.

The embedded-event tests prove that ordinary host capture and bubble observers
coexist with Quest's delegated listeners. This standalone repository cannot
prove that the current Connect PWA never calls `preventDefault()` or
`stopImmediatePropagation()` first; that requires one focused integration test
in the PWA when the accessibility investigation resumes.

See `docs/accessibilityManualTest.md` for the VoiceOver and JAWS
acceptance protocol. Automated browser tests characterize intended native
keyboard behavior but do not claim to run either screen reader.
