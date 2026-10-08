# AGENTS.md

## Overview

This repository is a Zen Browser chrome mod forked from `Vertex-Mods/Zen-Tidy-Tabs`.

It injects a brush button and separator line into Zen's vertical tabs sidebar, then sorts ungrouped tabs into AI-generated groups. The fork keeps the original Firefox local ML path, adds optional Gemini, OpenRouter, Groq, and Mistral providers, and treats provider output as the source of truth for grouping.

The runtime is now modular. `tidy-tabs.uc.js` is only a bootstrap loader that creates `window.BetterTidyTabs`, loads ordered module files, and starts the runtime.

## Files

- `tidy-tabs.uc.js`
  Bootstrap loader for the modular runtime.
- `modules/00-config.js`
  Shared constants, runtime state, DOM cache, and provider registry.
- `modules/10-utils.js`
  Shared tab, text, icon, and group helper functions.
- `modules/20-ai-common.js`
  Shared AI helpers such as embeddings, caching, prefs, provider context building, and compatible chat requests.
- `modules/30-provider-gemini.js`
  Gemini cloud provider implementation.
- `modules/31-provider-local.js`
  Firefox local AI provider implementation.
- `modules/32-provider-openrouter.js`
  OpenRouter cloud provider implementation.
- `modules/33-provider-groq.js`
  Groq cloud provider implementation.
- `modules/34-provider-mistral.js`
  Mistral cloud provider implementation.
- `modules/35-workspace-state.js`
  Group ownership, locks, sort eligibility, workspace snapshots, and Undo.
- `modules/40-sorting.js`
  Provider selection, fallback flow, group creation/reuse, and tab reordering.
- `modules/50-ui.js`
  Sidebar injection, command wiring, workspace hooks, clear-tabs patching, startup, and cleanup.
- `userChrome.css`
  Styles for the line, brush button, animations, and states.
- `theme.json`
  Sine/Zen mod manifest.
- `preferences.json`
  Sine settings surface for AI enablement, provider choice, and cloud-provider credentials.
- `README.md`
  Public fork documentation and install instructions.
- `CHANGELOG.md`
  Fork-only change history since the upstream fork point.

## Runtime Constraints

- This code runs in Zen/Firefox chrome context, not web-page context.
- It depends on Zen globals and browser internals such as `gBrowser`, `gZenWorkspaces`, `gZenUIManager`, and `MozXULElement`.
- Module loading depends on script order. There is no module system or bundler here.
- DOM timing is fragile. Zen may re-render the sidebar separators and workspace containers at any time.
- There is no build step or automated test suite.

## Current Product Behavior

- Injects the sort UI into `.pinned-tabs-container-separator`.
- Sorts only tabs from the active workspace.
- Normal sorting handles loose tabs. Reorganize workspace also includes tracked AI-created groups and groups explicitly allowed by the user.
- Unknown/manual group members are preserved; locked groups receive no additions or removals. Folders and split views are excluded.
- Group ownership and locks persist in a browser preference. Renames and manually added members protect a tracked group until the user allows reorganization again.
- Keeps one Undo snapshot per workspace for the current runtime and refuses restoration over subsequent manual layout changes.
- Passes current tabs and existing group context to the selected provider.
- Reuses an existing group only by exact normalized name when the provider chooses it.
- Creates new groups directly from provider-returned topic names.
- Leaves unassigned tabs untouched unless the provider explicitly places them in `Others`.
- Preserves grouped tabs during Zen's clear-tabs flow.
- Falls back to Firefox local AI when a cloud provider fails.
- Shows a runtime toast when OpenRouter, Groq, or Mistral fails and the mod falls back locally.
- Uses a stricter cloud prompt that forbids singleton groups and pushes ambiguous leftovers into `Others`.

## Module Naming

The numeric prefixes are intentional load-order markers:

- `00`
  Foundation and shared state.
- `10`
  General utilities.
- `20`
  Shared AI/runtime helpers.
- `30+`
  Concrete provider implementations.
- `40`
  Sorting orchestration.
- `50`
  UI/bootstrap wiring.

Leave gaps in the numbering so new modules can be inserted without renaming the whole tree. Example: a future provider could live at `36-provider-example.js`.

## Provider Model

The mod supports five providers:

- `firefox-local`
  Default. Uses Firefox local ML models and cached embeddings.
- `gemini`
  Optional cloud mode. Requires `extension.zen-tidy-tabs.gemini-api-key`.
- `openrouter`
  Optional cloud mode. Requires `extension.zen-tidy-tabs.openrouter-api-key` and `extension.zen-tidy-tabs.openrouter-model`.
- `groq`
  Optional cloud mode. Requires `extension.zen-tidy-tabs.groq-api-key`; the model defaults to `openai/gpt-oss-20b` and can be changed with `extension.zen-tidy-tabs.groq-model`.
- `mistral`
  Optional cloud mode. Requires `extension.zen-tidy-tabs.mistral-api-key`; the model defaults to `mistral-small-latest` and can be changed with `extension.zen-tidy-tabs.mistral-model`.

All providers should implement the same contract:

- register through `window.BetterTidyTabs.registerProvider(...)`
- expose a stable `id`
- expose `assignTopics(context)`
- return an array of `{ tab, topic, iconId }` assignments on success
- return `null` when the provider is unavailable so the orchestration layer can fall back cleanly

Cloud providers should not own fallback to local AI themselves. Fallback belongs in `modules/40-sorting.js`.

The settings UI intentionally keeps all cloud-provider API key fields always visible. Sine's conditional preference rendering currently throws in `preferences.sys.mjs`, so do not reintroduce conditional field visibility unless that upstream bug is confirmed fixed.

## Grouping Intent

The provider prompt should group by task and browsing context, not by narrow page-title fragments.

Good outcomes:

- several GitHub, docs, and search tabs for the same task collapse into one broader task group
- existing groups are reused only when the provider intentionally names them
- isolated tabs land in `Others` instead of becoming singleton groups

Bad outcomes:

- many single-tab groups
- local code silently renaming or merging provider output
- local heuristics overriding what the provider already decided

## Important Areas

- `modules/30-provider-gemini.js`
  Prompt shape, JSON handling, request retries, and model fallback.
- `modules/31-provider-local.js`
  Embedding-cluster naming and local assignment generation.
- `modules/32-provider-openrouter.js`
  OpenRouter request handling, request-size tuning, response parsing, and user-facing failure mapping.
- `modules/33-provider-groq.js` and `modules/34-provider-mistral.js`
  OpenAI-compatible chat requests, configurable models, JSON parsing, and local fallback feedback.
- `modules/20-ai-common.js`
  Embedding cache behavior, shared provider context, provider preferences, and OpenAI-compatible chat requests.
- `modules/35-workspace-state.js`
  Persistent ownership and locks, eligibility, workspace layout snapshots, and Undo.
- `modules/40-sorting.js`
  Provider selection, cloud-to-local fallback, provider feedback, assignment-to-group translation, and tab moves.
- `modules/50-ui.js`
  Sidebar injection, visibility updates, workspace hooks, runtime toasts, cleanup, and clear-tabs patching.

Be careful when changing any of those paths because failures are visible directly in the browser UI.

## Editing Rules

- Keep logic scoped to the active workspace via `zen-workspace-id`.
- Preserve compatibility with existing tab groups and `Advanced-Tab-Groups`.
- Do not assume sidebar parents exist; guard DOM access aggressively.
- If a module depends on another module's exports, keep the load order valid.
- If JS changes IDs or selectors, update `userChrome.css` in lockstep.
- Prefer soft failure and fallback over throwing from chrome context.
- Do not reintroduce local semantic merge logic unless the product intent changes.
- Keep file-level and function-level comments concise and practical.
- Use ASCII unless the file already needs something else.

## Validation

Manual validation in Zen is required:

1. Import or reload the mod through Sine Mods.
2. Confirm the separator line and brush button appear when sortable tabs exist.
3. Test Firefox Local AI, Gemini, OpenRouter, Groq, and Mistral.
4. Test existing-group reuse by exact provider-chosen name plus new-group creation.
5. Confirm `Others` only appears when the provider explicitly returns it.
6. Confirm clear-tabs still preserves grouped tabs.
7. Reload the mod more than once and confirm duplicate listeners or broken hooks do not appear.
8. Test each cloud provider with an invalid key, an unavailable model, and a rate limit; confirm fallback to local AI shows a useful toast.
9. Reorganize a tracked group together with related loose tabs; confirm tabs can leave Others and move into new or existing topics.
10. Confirm unknown groups keep their members, explicit Allow reorganization includes old groups, and locked groups receive no additions or removals.
11. Undo a sort and a reorganization, including a source group emptied by reassignment. Confirm membership, group labels, colors, collapsed state, and order are restored.
12. Switch workspaces or move/pin/navigate a tab while a provider is responding; confirm stale results do not move those tabs.
