# Better Tidy Tabs

**Version 1.6.0** improves inclusive grouping and naming across all five engines. Version 1.5.0 introduced Groq, Mistral, workspace reorganization, and Undo.

<p align="center">
  <img src="./assets/hero-tabs-groups.png" alt="Better Tidy Tabs sorting loose browser tabs into topic groups" width="100%">
</p>

<p align="center">
  <strong>Sort Zen's sidebar tabs into groups that match your work.</strong><br/>
  Choose Firefox Local AI, Google Gemini, OpenRouter, Groq, or Mistral.
</p>

<p align="center">
  <a href="https://github.com/Reomar/better-tidy-tabs">Open the GitHub repository</a>
</p>

## What it does

Better Tidy Tabs adds a brush button and an actions menu to Zen's vertical tabs sidebar. It groups tabs from the active workspace based on their topic and browsing context.

- Keeps related research, documentation, implementation, and troubleshooting in broader coherent groups.
- Uses matching hostnames as supporting evidence. A shared platform does not force unrelated topics together, and one activity can span several sites or repositories.
- Reuses the exact existing destination selected by the provider, with its existing label preserved.
- Requires at least two tabs for a new group. One tab can join a clearly matching existing group.
- Leaves uncertain loose tabs loose and uncertain grouped tabs in their existing groups.
- Does not create `Others` or add new residual tabs to an existing `Others` group. Related members of an old `Others` group can leave during reorganization.
- Chooses membership before naming; shortened labels and identical group names never combine separate provider buckets.
- Generates short English labels, preserving recognizable brands and acronyms. Existing group labels retain their original spelling.
- Shows cloud failure feedback and tries Firefox Local AI. A valid result with no clear groups is a successful no-op.
- Caches local embeddings and can add icons when Advanced Tab Groups is installed.

Related issue pages, documentation, repositories, and searches can share `Payments`
when they serve the same activity. There is no requirement to split by repository,
project, site, or phase of work. Unrelated tabs remain where they are.

## Sort or reorganize

Click the brush to **Sort new tabs**. This assigns loose tabs to new or matching existing groups and keeps current group members in place.

Open the **...** menu beside the brush, or right-click the brush, for:

- **Reorganize workspace**: considers loose tabs together with groups created by Better Tidy Tabs. A tab previously placed in `Others` can move into a useful new group when related tabs appear. Unassigned tabs keep their current position or group.
- **Undo last sort**: restores the previous group membership, group names, and order for the active workspace. Closed tabs stay closed. If you changed the layout afterward, Undo skips restoration to preserve your edits. Undo lasts until the mod reloads or the browser window closes.
- **Group settings**: choose **Allow reorganization** to include an older or manually created group. Choose **Lock group** to prevent both sorting modes from adding or removing its tabs.

Groups created before version 1.5.0 have no ownership record, so they need **Allow reorganization** enabled explicitly. Renaming an AI-created group or adding tabs to it by hand protects it from reorganization until you enable that option again. Unlocked manual groups can receive matching incoming tabs, but their existing members stay in place.

Pinned tabs, folders, split views, empty tabs, and Glance tabs are excluded. Group ownership and locks are stored in the browser profile. Switching workspaces while the AI is responding cancels applying the result.

## Install in Zen

Add the GitHub repository through Sine Mods:

1. Open Zen's Settings and go to **Sine Mods**.
2. Click **Import**.
3. Add `Reomar/better-tidy-tabs`. You can also paste the full address:

   ```text
   https://github.com/Reomar/better-tidy-tabs
   ```

4. If Sine flags the repository's JavaScript as unofficial or dangerous, enable **Use JS from unofficial sources**. The mod needs permission to run its browser code.
5. Confirm the import, enable Better Tidy Tabs, then reload the mod or restart Zen if needed.

Allowing JavaScript from an unofficial source and enabling Firefox's local ML engine are separate settings. Use the steps below if you want to sort with Firefox Local AI.

## Enable Firefox ML in Zen

Zen turns off Firefox's local ML engine by default. To use Firefox Local AI:

1. Enter `about:config` in Zen's address bar and accept the warning.
2. Search for `browser.ml.enable`.
3. Set the Boolean preference to `true`.
4. Open Better Tidy Tabs' Sine settings and set **Sorting Engine** to **Firefox Local AI**.

Zen checks `browser.ml.enable` before creating the ML engine. The separate `browser.ml.enabled` preference does not turn that engine on by itself.

## Settings

Sine Mods provides these settings for Better Tidy Tabs:

- Enable AI
- Sorting Engine
- Gemini API Key
- OpenRouter API Key
- OpenRouter Model Name
- Groq API Key
- Mistral API Key
- Mistral Model Name (defaults to `mistral-small-latest`)

Keep API keys in the mod settings. Do not add them to this repository.

## AI providers

### Firefox Local AI

Firefox Local AI groups tabs on your device and does not require a provider API key. Zen's `browser.ml.enable` preference must be true for the engine to run.

It uses deterministic average-link clustering with semantic guards. Matching hostnames provide a modest boost; matching GitHub repositories provide stronger evidence. Existing-group reuse requires a clear match for the whole candidate. Naming uses at most three representative titles and distinctive keywords relative to workspace vocabulary, with grounded repository/hostname fallbacks. The current naming model is English-focused; these changes do not replace it or add browsing-history tracking.

### Google Gemini

Gemini is an optional cloud provider. Add a Gemini API key in the mod settings. If Gemini is unavailable, the sorter falls back to Firefox Local AI. Gemini also has model fallback handling.

### OpenRouter

OpenRouter lets you choose a hosted model by its model name. Add your API key and model name in the mod settings. If OpenRouter fails, the mod shows feedback and falls back to Firefox Local AI.

### Groq

Groq is an optional cloud provider with a rate-limited free tier. Add a Groq API key in the mod settings. It uses the fixed `openai/gpt-oss-20b` model with strict JSON Schema output and model-tuned reasoning settings. If Groq fails or reaches its rate limit, the mod shows feedback and falls back to Firefox Local AI.

### Mistral

Mistral is an optional cloud provider with a limited free API mode. Add a Mistral API key in the mod settings. The default model is `mistral-small-latest`; you can change it with **Mistral Model Name**. If Mistral fails or reaches its rate limit, the mod shows feedback and falls back to Firefox Local AI.

## Grouping tips

- Keep each Zen workspace focused on one or two workstreams.
- Distinct tab titles give the provider more useful context.
- A cloud model can help when you want broader task grouping.

## Development and validation

Run `node --test tests/sorting.test.cjs` for the dependency-free mocked regressions.
The 12 synthetic workspace fixtures compare the old and new local clustering
mechanics and exercise all four cloud transports. Supplied vectors and mocked
responses do not measure real model relevance.

[Validation instructions](tests/README.md) include a runner for all five real
engines in Zen without creating or moving browser tabs, plus the required manual
sidebar, fallback, locks, stale-response, clear-tabs and Undo checks. Live checks
remain necessary before release.

## About this fork

Better Tidy Tabs is a fork of [Vertex-Mods/Zen-Tidy-Tabs](https://github.com/Vertex-Mods/Zen-Tidy-Tabs). Credit goes to the original project and its contributors for the Zen sidebar integration, base sorting flow, and project foundation.
