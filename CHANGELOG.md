# Changelog

This changelog covers changes introduced in this fork after the upstream fork point at `1780bc1` from `Vertex-Mods/Zen-Tidy-Tabs`.

## Added

- Cached local tab embeddings to make repeat Firefox-local sorts faster.
- Gemini as an optional cloud sorting provider.
- Gemini model fallback handling when one model variant fails.
- Advanced Tab Groups icon assignment from AI-generated group topics.
- OpenRouter as an optional cloud sorting provider with custom API key and model name settings.
- User-visible cloud-provider fallback feedback when OpenRouter fails and the mod falls back to Firefox local AI.
- A modular runtime split into config, shared AI helpers, provider modules, sorting, and UI/bootstrap layers.

## Changed

- Grouping became task-first instead of narrow title matching.
- Group ownership moved to the AI provider, so local heuristics no longer silently rename or merge model output afterward.
- Existing groups are reused only when the provider intentionally returns that group name.
- Cloud prompts were tightened to prefer fewer, broader groups and to send isolated tabs to `Others` instead of creating singleton groups.
- OpenRouter requests were tuned for better reliability on slower free models with:
  - lower output budgets
  - longer request timeout
  - provider-identifying request headers
- Repository metadata, fork identity, and Sine import paths were updated for `better-tidy-tabs`.

## Fixed

- Gemini structured output request formatting.
- Gemini fallback behavior and invalid-response handling.
- Fallback group matching around existing groups.
- OpenRouter error normalization when the provider returns non-string error values.

## Notes

- Upstream behavior such as the Zen sidebar button, base local-AI sorting flow, and core Zen/Sine integration came from `Vertex-Mods/Zen-Tidy-Tabs` before this fork’s changes began.
