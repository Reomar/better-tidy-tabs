# Better Tidy Tabs

<p align="center">
  <img src="./assets/hero-tabs-groups.png" alt="Loose browser tabs being sorted into topic groups" width="100%">
</p>

<p align="center">
  <strong>Sort Zen's sidebar tabs into groups that match your work.</strong><br/>
  Choose Firefox Local AI, Google Gemini, or OpenRouter.
</p>

<p align="center">
  <a href="https://github.com/Reomar/better-tidy-tabs">Open the GitHub repository</a>
</p>

## What it does

Better Tidy Tabs adds a brush button to Zen's vertical tabs sidebar. It sorts ungrouped tabs from the active workspace into groups based on their topic and browsing context.

- Groups tabs around the task, instead of splitting them by small differences in page titles.
- Reuses an existing group when the selected AI provider returns its exact name.
- Avoids singleton groups in cloud sorting and can put ambiguous tabs in `Others`.
- Leaves unassigned tabs alone unless the provider places them in `Others`.
- Shows feedback when OpenRouter fails, then tries Firefox Local AI.
- Caches local embeddings to speed up repeat sorting.
- Can add icons to groups when Advanced Tab Groups is installed.

Related research, issue pages, documentation, repositories, and searches can end up in the same broader group when they belong to one task. Tabs that do not fit can remain ungrouped or go into `Others`, depending on the provider's response.

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

Keep API keys in the mod settings. Do not add them to this repository.

## AI providers

### Firefox Local AI

Firefox Local AI groups tabs on your device and does not require a provider API key. Zen's `browser.ml.enable` preference must be true for the engine to run.

### Google Gemini

Gemini is an optional cloud provider. Add a Gemini API key in the mod settings. If Gemini is unavailable, the sorter falls back to Firefox Local AI. Gemini also has model fallback handling.

### OpenRouter

OpenRouter lets you choose a hosted model by its model name. Add your API key and model name in the mod settings. If OpenRouter fails, the mod shows feedback and falls back to Firefox Local AI.

## Grouping tips

- Keep each Zen workspace focused on one or two workstreams.
- Distinct tab titles give the provider more useful context.
- A cloud model can help when you want broader task grouping.

## About this fork

Better Tidy Tabs is a fork of [Vertex-Mods/Zen-Tidy-Tabs](https://github.com/Vertex-Mods/Zen-Tidy-Tabs). Credit goes to the original project and its contributors for the Zen sidebar integration, base sorting flow, and project foundation.
