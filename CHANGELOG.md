# Changelog

All notable user-visible changes to AS Adventurer are recorded here.

## Unreleased

### Added

- Opt-in secure LAN mode using HTTPS and secure WebSockets on trusted private networks.
- Machine registration with isolated private model storage and shared read-only global models.
- AI Actor creation, actor-scoped state, speech sessions, emotes, nested sub-animations, and OBS sources.
- Reusable Streamer.bot state-control helper and a companion actor-capability discovery helper.
- Actor-token-authenticated `GET /api/actors/:actorId/capabilities` for AI self-control discovery.
- URL-free capability responses containing dedicated installed expression names, Type 1 and Type 2 emote names, and nested sub-emote names.
- `AI_SELF_ACTOR_CONTROLS.md` covering the hidden command protocol, profile mappings, queue isolation, playback timing, failure behavior, and security boundary.

### Changed

- Production TTS continues to use one serial queue by design so only one synthesized voice is audible at a time.
- AI self-control is designed as a sanitized visual intent carried with each immutable TTS queue item rather than direct model access to actor credentials or HTTP endpoints.
- Expression capability discovery reports dedicated installed assets for the existing logical expression protocol instead of advertising every fallback expression.
- Fresh and updated feature checkouts use `agent/ai-self-actor-controls` against `main` through draft PR #9.

### Security

- Capability responses exclude actor tokens, token hashes, machine tokens, authenticated OBS addresses, media URLs, media filenames, certificate material, and filesystem paths.
- Raw actor tokens remain persisted Streamer.bot globals and are not added to OpenAI prompts, AI responses, logs, repository files, or status records.
- The capability helper rejects public Internet destinations and clear-text HTTP for non-loopback hosts.

### Validated

- JavaScript syntax passed for the capability module and LAN bootstrap.
- A local harness passed actor-token authentication, dedicated expression discovery, Type 1/Type 2 emote discovery, and nested sub-emote discovery.
- The harness confirmed that capability output did not contain the test token, token hash, media filename, or asset URL.
- Structural delimiter checks passed for the companion C# helper source.

### Pending

- Compile and exercise the companion helper in Streamer.bot.
- Install and live-test the personalized UniversalBot hidden-command integration.
- Copy visual intent into production TTS queue items and synchronize it with playback.
- Validate malformed commands, cross-actor isolation, failure cleanup, remote OBS recovery, LAN restart recovery, and the Windows package.
- Keep PR #9 draft and unmerged until validation completes and explicit owner approvals are given.
