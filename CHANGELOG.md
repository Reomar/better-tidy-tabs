# Changelog

This changelog covers changes introduced in this fork after the upstream fork point at `1780bc1` from `Vertex-Mods/Zen-Tidy-Tabs`.

## Unreleased

- Fixed Groq to `openai/gpt-oss-20b`, removed its model-name setting, and enabled strict JSON Schema output with GPT-OSS-specific request parameters.

## [1.6.0] - 2026-10-08

- Improved all five engines to prefer inclusive activities spanning sites, repositories, and phases of work; uncertain tabs retain their existing membership.
- Added independent path/search context, representative existing-group samples, explicit destination identities, and complete grouped cloud-response validation.
- Separated provider bucket identity from display labels so duplicate and shortened names cannot combine unrelated assignments.
- Replaced local first-tab clustering with deterministic average-link clustering, bounded hostname/repository boosts, semantic guards, and clear existing-group matching.
- Improved local naming with Unicode keywords, workspace-relative ranking, at most three representative titles, preserved brands/acronyms, deterministic generation, and grounded fallbacks.
- Made valid empty results successful no-ops and protected manual tab reorders, stale destinations, and exchanges involving groups emptied by sorting.
- Added 108 dependency-free mocked chrome regression tests, 12 synthetic workspace fixtures, and a real-engine validation runner. Manual Zen and real-provider validation remains pending.

## [1.5.0] - 2026-10-08

- Added Groq and Mistral as optional cloud providers with editable model settings.
- Added workspace reorganization, persistent group ownership and locks, and one-step Undo.
- Improved cloud grouping prompts and fallback feedback, and prevented stale provider results from moving changed tabs.
- Fixed sort control visibility across Zen's vertical sidebar layouts.

## Added

- Cached local tab embeddings to make repeat Firefox-local sorts faster.
- Gemini as an optional cloud sorting provider.
- Gemini model fallback handling when one model variant fails.
- Advanced Tab Groups icon assignment from AI-generated group topics.
- OpenRouter as an optional cloud sorting provider with custom API key and model name settings.
- User-visible cloud-provider fallback feedback when OpenRouter, Groq, or Mistral fails and the mod falls back to Firefox local AI.
- A modular runtime split into config, shared AI helpers, provider modules, sorting, and UI/bootstrap layers.

## Changed

- Grouping became task-first instead of narrow title matching.
- Group ownership moved to the AI provider, so local heuristics no longer silently rename or merge model output afterward.
- Existing groups are reused only when the provider intentionally returns that group name.
- Cloud prompts were tightened to prefer fewer, broader groups and to send isolated tabs to `Others` instead of creating singleton groups.
- Cloud prompts now identify tasks in incoming tabs before considering existing-group reuse, and allow distinct tasks to form new groups.
- `Others` is considered only for residual tabs after topical grouping, and its mixed contents are excluded from existing-group examples sent to cloud providers.
- OpenRouter requests were tuned for better reliability on slower free models with:
  - lower output budgets
  - longer request timeout
  - provider-identifying request headers
- Repository metadata, fork identity, and Sine import paths were updated for `better-tidy-tabs`.

## Fixed

- Sorting now rechecks workspace, navigation, pinned status, and group membership before applying delayed AI results.
- Reloading the mod cancels pending sort results from the previous runtime.
- Gemini structured output request formatting.
- Gemini fallback behavior and invalid-response handling.
- Fallback group matching around existing groups.
- OpenRouter error normalization when the provider returns non-string error values.

## Notes

- Upstream behavior such as the Zen sidebar button, base local-AI sorting flow, and core Zen/Sine integration came from `Vertex-Mods/Zen-Tidy-Tabs` before this fork’s changes began.
