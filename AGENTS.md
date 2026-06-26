# AGENTS.md

## Overview

This repository is not a conventional web app or Node project. It is a Zen Browser / Firefox chrome mod package that injects:

- `tidy-tabs.uc.js`: the main browser-chrome script
- `userChrome.css`: styling for the custom button and separator animations
- `theme.json`: package metadata for the mod loader
- `preferences.json`: exposed preference toggles

The feature adds an AI-powered "Sort Tabs" button to Zen Browser's vertical tab UI. It groups ungrouped tabs by topic using Firefox local ML models, prefers matching tabs into existing groups first, creates new tab groups when needed, and patches Zen's "close unpinned tabs" behavior so grouped tabs are preserved.

## Repo Layout

- `tidy-tabs.uc.js`
  Main logic. Runs in the privileged browser UI context, not in page content.
- `userChrome.css`
  Styles and animations for the separator line, broom button, and sorting states.
- `theme.json`
  Mod manifest. Declares script injection target, chrome CSS, metadata, and dependency on `Vertex-Mods/Advanced-Tab-Groups`.
- `preferences.json`
  Exposes `browser.ml.enabled` as a UI toggle and forces it on by default.
- `README.md`
  Minimal public-facing description.
- `image.png`
  Preview asset.

## Runtime Model

This code executes inside Zen Browser's chrome context and depends on browser internals such as:

- `gBrowser`
- `gZenWorkspaces`
- `gZenUIManager`
- `MozXULElement`
- `ChromeUtils.importESModule(...)`

It is tightly coupled to Zen's tab/workspace DOM and APIs. Do not treat it like standard frontend code.

## Main Flow

High-level behavior in `tidy-tabs.uc.js`:

1. Initialization waits until the tab UI, command set, and `gZenWorkspaces` are available.
2. The script injects an SVG separator line and a custom `#sort-button` into each `.pinned-tabs-container-separator`.
3. Clicking the button triggers a command handler that starts an animation and runs sorting.
4. Sorting collects ungrouped tabs in the active workspace only.
5. It generates embeddings via Firefox local ML using `Mozilla/smart-tab-embedding`.
6. It tries to match tabs into existing groups by embedding similarity, then title similarity.
7. Remaining tabs are clustered by cosine similarity.
8. New clusters are named via `Mozilla/smart-tab-topic`.
9. Tabs are moved into existing groups or new groups are created with `gBrowser.addTabGroup(...)`.
10. The workspace tab container is reordered so groups appear before ungrouped tabs.
11. Button visibility is recomputed from workspace/group state.

## Important Functions

- `getFilteredTabs(...)`
  Central filter for workspace-scoped tab selection.
- `generateEmbedding(...)`
  Calls Firefox's local ML engine for tab-title embeddings.
- `askAIForMultipleTopics(...)`
  Core grouping pipeline: existing-group matching, clustering, and topic naming.
- `sortTabsByTopic(...)`
  Orchestrates the full sort, DOM moves, failure handling, and cleanup.
- `setupgZenWorkspacesHooks(...)`
  Hooks Zen workspace lifecycle methods so injected UI survives workspace updates.
- `patchClearButtonToPreserveGroups(...)`
  Overrides Zen's clear-tabs behavior to avoid deleting grouped tabs.
- `updateButtonsVisibilityState(...)`
  Controls when the sort button is shown.

## Editing Guidelines

- Keep all logic scoped to the active workspace using `zen-workspace-id`.
- Preserve support for existing tab groups before creating new ones.
- Be careful with DOM assumptions. Zen may re-render separators and workspace containers.
- Do not remove the initialization polling unless you replace it with something equally reliable in browser chrome context.
- Treat animations and cleanup as stateful. `sortAnimationId`, `isSorting`, and `isPlayingFailureAnimation` prevent bad overlap.
- Fail softly. The current script logs errors and continues where possible because browser chrome errors are user-visible and hard to recover from.
- Keep optional compatibility with `Advanced-Tab-Groups`; calls like `_useFaviconColor()` must remain guarded.
- Prefer small changes. This code relies on browser-specific globals that are not unit-tested here.

## CSS Guidelines

- `userChrome.css` is responsible for both layout and visual feedback.
- The custom button is intentionally inserted next to Zen's native clear button and inherits theme color behavior.
- The separator line animation depends on the script-created `#separator-path` SVG path.
- If you rename selectors or IDs in JS, update CSS in lockstep.

## Validation

There is no automated test suite in this repo.

Validate changes manually in Zen Browser:

1. Load/install the mod in the target Zen setup.
2. Confirm the sort button appears in the vertical tabs separator.
3. Test with:
   - many ungrouped tabs
   - an existing group plus one relevant ungrouped tab
   - multiple workspaces
   - pinned tabs, selected tabs, empty tabs, and glance tabs
4. Confirm grouped tabs survive the "close unpinned tabs" action.
5. Verify failure animation still triggers when no meaningful grouping can be produced.

## Constraints

- No build step, package manager, or local app server exists here.
- Changes should remain compatible with Firefox chrome JS and Zen-specific DOM/APIs.
- Browser ML must be enabled for AI behavior to work; the repo exposes this via `preferences.json`.
