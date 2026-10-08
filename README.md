# Better Tidy Tabs

**Version 1.5.0** adds Groq and Mistral cloud sorting, workspace reorganization, and Undo.

<p align="center">
  <img src="./assets/hero-tabs-groups.png" alt="Loose browser tabs being sorted into topic groups" width="100%">
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

- Groups tabs around the task, instead of splitting them by small differences in page titles.
- Reuses an existing group when the selected AI provider returns its exact name.
- Cloud sorting looks for useful tasks in the incoming tabs before matching existing groups. A distinct task can get a new group even when other groups already exist.
- Avoids new single-tab topic groups in cloud sorting and can put unrelated or uncertain tabs in `Others`.
- Treats `Others` as the final home for leftovers. Its mixed contents are excluded from the cloud prompt's topic examples.
- Leaves unassigned tabs alone unless the provider places them in `Others`.
- Shows feedback when OpenRouter, Groq, or Mistral fails, then tries Firefox Local AI.
- Caches local embeddings to speed up repeat sorting.
- Can add icons to groups when Advanced Tab Groups is installed.

Related research, issue pages, documentation, repositories, and searches can end up in the same broader group when they belong to one task. Tabs that do not fit can remain ungrouped or go into `Others`, depending on the provider's response.

## Sort or reorganize

Click the brush to **Sort new tabs**. This assigns loose tabs to new or matching existing groups and keeps current group members in place.

Open the **...** menu beside the brush, or right-click the brush, for:

- **Reorganize workspace**: considers loose tabs together with groups created by Better Tidy Tabs. A tab previously placed in `Others` can move into a useful new group when related tabs appear. Unassigned tabs keep their current position or group.
- **Undo last sort**: restores the previous group membership, group names, and order for the active workspace. Closed tabs stay closed. If you changed the layout afterward, Undo skips restoration to preserve your edits. Undo lasts until the mod reloads or the browser window closes.
- **Group settings**: choose **Allow reorganization** to include an older or manually created group. Choose **Lock group** to prevent both sorting modes from adding or removing its tabs.

Groups created before this version have no ownership record, so they need **Allow reorganization** enabled explicitly. Renaming an AI-created group or adding tabs to it by hand protects it from reorganization until you enable that option again. Unlocked manual groups can receive matching incoming tabs, but their existing members stay in place.

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
- Groq Model Name (defaults to `openai/gpt-oss-20b`)
- Mistral API Key
- Mistral Model Name (defaults to `mistral-small-latest`)

Keep API keys in the mod settings. Do not add them to this repository.

## AI providers

### Firefox Local AI

Firefox Local AI groups tabs on your device and does not require a provider API key. Zen's `browser.ml.enable` preference must be true for the engine to run.

### Google Gemini

Gemini is an optional cloud provider. Add a Gemini API key in the mod settings. If Gemini is unavailable, the sorter falls back to Firefox Local AI. Gemini also has model fallback handling.

### OpenRouter

OpenRouter lets you choose a hosted model by its model name. Add your API key and model name in the mod settings. If OpenRouter fails, the mod shows feedback and falls back to Firefox Local AI.

### Groq

Groq is an optional cloud provider with a rate-limited free tier. Add a Groq API key in the mod settings. The default model is `openai/gpt-oss-20b`; you can change it with **Groq Model Name**. If Groq fails or reaches its rate limit, the mod shows feedback and falls back to Firefox Local AI.

### Mistral

Mistral is an optional cloud provider with a limited free API mode. Add a Mistral API key in the mod settings. The default model is `mistral-small-latest`; you can change it with **Mistral Model Name**. If Mistral fails or reaches its rate limit, the mod shows feedback and falls back to Firefox Local AI.

## Grouping tips

- Keep each Zen workspace focused on one or two workstreams.
- Distinct tab titles give the provider more useful context.
- A cloud model can help when you want broader task grouping.

## About this fork

Better Tidy Tabs is a fork of [Vertex-Mods/Zen-Tidy-Tabs](https://github.com/Vertex-Mods/Zen-Tidy-Tabs). Credit goes to the original project and its contributors for the Zen sidebar integration, base sorting flow, and project foundation.
