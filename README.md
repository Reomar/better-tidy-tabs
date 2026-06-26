# Better Tidy Tabs

`Better Tidy Tabs` is a fork of [Vertex-Mods/Zen-Tidy-Tabs](https://github.com/Vertex-Mods/Zen-Tidy-Tabs) for Zen Browser.

The original mod already had a good injection model and UI. This fork keeps that base, but changes how tabs are grouped and adds an optional cloud model path for cases where Firefox local AI is not enough.

## Fork Changes

- Keeps Firefox local AI as the default provider.
- Adds a provider dropdown so the user can choose `Firefox Local` or `Gemini`.
- Adds Gemini API key support for optional cloud grouping.
- Caches local embeddings to avoid recomputing the same tab vectors repeatedly.
- Shifts grouping toward active task and category instead of literal page-title similarity.
- Pushes weak leftovers into `Others` instead of creating many bad one-tab groups.
- Preserves the existing Zen sidebar injection, separator line, brush button, and Advanced Tab Groups integration.

## How Grouping Works

The current goal is task-first sorting:

- related tabs should be grouped by what you are doing
- category is a secondary signal
- isolated or weak matches should land in `Others`

That means the sorter should prefer broader groups like:

- `Tab Sorting Research`
- `Troubleshooting`
- `GitHub Sign In`
- `Others`

instead of splitting everything into tiny groups based on repo names or individual page titles.

## Install On Sine Mods

Import the repo directly from Zen:

1. Open `Settings`.
2. Open `Sine Mods`.
3. Click `Import`.
4. Paste:

```text
https://github.com/Reomar/better-tidy-tabs
```

5. Confirm the install.
6. Reload or restart Zen if Sine asks for it.

Sine installs the mod from the repository by reading `theme.json` and copying the mod files into your Zen profile.

## Settings

The mod currently exposes:

- `Enable AI`
- `AI Provider`
- `Gemini API Key`

### Firefox Local

- default mode
- runs on-device
- uses Firefox local ML
- best for privacy and zero API cost

### Gemini

- optional cloud mode
- requires a Gemini API key
- uses a low-cost request shape
- falls back to Firefox local AI if Gemini is unavailable

## Development Notes

- This is a browser chrome mod, not a normal web app.
- There is no build step or automated test suite here.
- Real validation is manual testing inside Zen Browser with Sine Mods.
