# Locked questionnaire corpus

`lock.json` pins the 29 production questionnaire files used by the test suite,
including the extensionless Diet Screener. Normal test runs never use mutable
`main`.

Run:

```sh
npm run corpus:fetch
npm run corpus:verify
npm run corpus:catalog:verify
```

Local and CI fetches use GitHub's public archive URL for the exact locked
commit. They do not read or require `GITHUB_TOKEN` or `GH_TOKEN`. After the
download, every selected file is checked against the SHA-256 and Git blob hash
recorded in `lock.json` before it is installed in the cache.

Verified files are stored under the ignored `.cache/questionnaire/`
directory. Chromium opens every locked survey in fresh Connect-shaped pages
twice: once as a participant startup smoke test and once in renderer/full-list
mode. Full-list mode must convert and append every entry produced by the real
`QuestionProcessor`, in order, without unexpected console, network, or
`errorLogger` failures.

`structuralCatalog.json` is the reviewable denominator produced through the
same full-list parser boundary. For each survey it records:

- marker and loop-expanded runtime counts
- ordered runtime question IDs
- response-control families
- transition targets, trigger values, and resolution classes
- condition expressions and site counts
- grid rows, loop boundaries, async hooks, and unresolved targets

The lock's `sourceQuestionCount` field counts question markers.
That is not always the number of runtime forms: grid row markers are folded
into grid forms, while loops are expanded to as many as 25 iterations. The
catalog uses the clearer name `markerCount` and separately reports the
actual parser-produced form count.

Regenerate the catalog only when a reviewed questionnaire lock or Quest parser
change intentionally changes its structure:

```sh
npm run corpus:catalog:update
git diff -- tests/corpus/structuralCatalog.json
```

Deeper behavior is covered with focused fixtures. This catalog describes parser output.
It does not yet claim that every node is reachable, evaluate both sides of every condition,
or generate completed participant paths.
