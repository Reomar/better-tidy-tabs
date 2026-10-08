# Sorting validation

Run the dependency-free regressions:

```sh
node --test tests/sorting.test.cjs
```

The harness loads the real runtime modules and models chrome tabs, groups, native
moves, prefs, ownership, and Undo. It intercepts cloud requests and local ML.
All 12 fixtures use synthetic titles and URLs. Their supplied vectors test
clustering mechanics; they do not measure Mozilla's model quality. The four
mocked cloud transports test prompt construction, parsing and mapping, not a
hosted model's grouping quality. No test uses real keys or makes network requests.

Generation keeps Firefox's existing [pipeline request API](https://firefox-source-docs.mozilla.org/toolkit/components/ml/api.html)
and sets `do_sample: false` for [greedy decoding](https://huggingface.co/docs/transformers.js/api/utils/generation).

## Real engines in Zen

Reload the updated mod through Sine first. A repository checkout alone does not
update the installed browser-profile modules. Use a local test installation and
keep a rollback copy of the installed modules. Leave the normal settings fields
visible and keep credentials in Sine preferences.

Open Zen's parent-process Browser Console. Run the following with the checkout's
absolute file URLs (the example uses this repository's current location):

```js
var tidyTestWindow = Services.wm.getMostRecentWindow("navigator:browser");
Services.scriptloader.loadSubScript(
  "file:///Users/omarsakr/dev/playground/better-tidy-tabs/tests/fixtures.js",
  tidyTestWindow
);
Services.scriptloader.loadSubScript(
  "file:///Users/omarsakr/dev/playground/better-tidy-tabs/tests/live-validation.js",
  tidyTestWindow
);
var tidyValidationReport = await tidyTestWindow.BetterTidyTabsValidation.run();
console.log(JSON.stringify(tidyValidationReport, null, 2));
```

This calls all five real engines with synthetic tab metadata only. It does not
open pages, create groups, or move browser tabs. It temporarily disables sorting
to prevent overlapping requests. Cloud tests use configured credentials and make
12 requests per provider, plus any existing Gemini retry/model fallback requests.
Missing credentials, unavailable ML, rate limits and rejected results are reported
as unavailable/failed, never as acceptance. To run one engine at a time:

```js
await tidyTestWindow.BetterTidyTabsValidation.run({ providers: ["firefox-local"] });
```

Review each completed result's missedTogether and falseJoins against the fixtures.
Compare the local baseline and new totals. Require improved positive-pair coverage
without new negative-pair joins. Review names for coverage of all members,
recognizability, brand casing and unnecessary specificity; exact strings are not
the acceptance criterion. Synthetic fixture evidence does not prove relevance
for every person's real workspace.

## Manual browser gate

Use disposable test tabs and groups in a local test workspace:

- Sort related docs, GitHub issues, and searches across hosts. Related work should
  stay together; unrelated topics on YouTube or GitHub must not be forced together.
- Check duplicate group labels and long labels with identical shortened prefixes.
  Membership must remain separate, including existing destinations with the same name.
- Confirm uncertain loose tabs stay loose and uncertain editable-group members stay
  in their source group. A genuine no-op shows feedback without failure pulses.
- Reorganize old Others members with related loose tabs. Confirm topical members
  can leave and no new residual tabs are sent to Others.
- Verify unknown/manual group members, folders, split views and locks are protected.
  Explicit Allow reorganization should include an older group.
- Undo a normal sort, an emptied source, and an exchange between existing groups.
  Check labels, order, colors, icons, collapse and ownership. Edit the layout before
  Undo and confirm restoration is refused.
- Switch workspaces, reorder/move/pin/navigate/close a tab, rename a destination,
  or lock it while a response is pending. No stale result should undo that action.
- For every cloud provider, use an invalid key, an unavailable model and a rate
  limit. Confirm useful fallback feedback. Restore settings afterward.
- Confirm clear-tabs preserves grouped tabs. Reload the mod at least twice and
  check the separator, brush, menus and hooks for duplicate listeners.

Real model and browser validation remain required before publication. This runner
and the mocked suite do not certify release readiness on their own.
