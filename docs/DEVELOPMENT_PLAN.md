# AutoTube AI: six-phase development plan

This roadmap groups the requested end-to-end workflow into six phases. The request supplied a detailed Phase 1 scope but no separate six-phase breakdown; Phases 2–6 below are proposed milestones for review, not implemented features. Each phase needs working code, automated checks, honest capability labels, and user approval before advancing.

## Phase 1 — Foundation and script generation (this PR)

- Responsive dark dashboard, sidebar, real local project counts and recent projects.
- New video projects: name, topic, language, duration, Shorts 9:16 and long-form 16:9.
- Free, labeled template demo provider and configurable server-side OpenAI-compatible text provider.
- Editable narration, scene headings, visual planning notes, and scene durations.
- SQLite persistence, revision history, reopen, JSON and TXT script exports.
- Draft/generating/ready/failed states, loading feedback, actionable errors, stale-tab protection.
- Codespaces dev container, beginner documentation, Vitest and browser tests.
- Future research, voice, and media service interfaces only.

Acceptance: create → generate → edit → save → reopen → export works in a browser, without paid APIs. Later-phase navigation shows clear unavailable states. No media, trends, research, analytics or publishing is simulated as functioning.

**Approval gate: stop here until the user approves Phase 1.**

## Phase 2 — Inspiration, research and original concepts (not implemented)

- YouTube Data API metadata/search adapters; distinguish actual observed performance from inferred trends. Never promise virality.
- Analyze user-supplied YouTube URLs from available metadata. Transcript access must respect API availability and permissions; do not assume arbitrary videos have downloadable transcripts.
- Screenshot upload with file validation, OCR (Tesseract free alternative), and optional replaceable vision model for richer analysis.
- Original concept suggestions and a topic research workspace with source links, dates, citations, and fact-check flags. Avoid copying scripts or creators’ distinctive expression.
- Free API quota limits and manual URL/research input as a fallback. Quota exhaustion should be visible; no scraping bypass.
- Acceptance: cited research and original concepts remain editable and source limitations are visible.

## Phase 3 — Voice and licensed media (not implemented)

- Piper TTS worker with explicit voice-model setup and license tracking. Check engine and individual voice-model licenses. No paid service required.
- Optional voice adapters; downloadable/user-supplied narration as fallback if compute is insufficient.
- Pexels API stock search and per-asset provenance/license records. Keys stay on the server. API limits and asset availability remain visible.
- User-owned or appropriately licensed uploaded media as fallback. Music must have a tracked license; never assume popular songs are free to reuse.
- Disk limits, cancellation and cleanup for media jobs. Keep media and voice models outside Git.
- Acceptance: actual audio and usable licensed assets can be previewed with provenance.

## Phase 4 — Assembly, subtitles and preview (not implemented)

- FFmpeg worker pipeline for 9:16 and 16:9 assembly, scene timing, crop/fit, transitions, music ducking, and export.
- Whisper/faster-whisper transcription with word/segment timing, subtitle editing and ASS/SRT output. No claims of synchronized subtitles without real timestamps.
- Render job queue, progress, cancellation, bounded resources, storage cleanup and recoverable failures.
- Preview actual rendered output. CPU-only free alternatives with explicit processing-time constraints.
- Acceptance: playable videos with real voice, licensed footage, music and synchronized subtitles; no upload before user review.

## Phase 5 — Approval, packaging and YouTube publishing (not implemented)

- Thumbnail editor (free manual canvas/typography option), replaceable image adapter, original title, description and tags.
- Explicit review of video, thumbnail, metadata, content rights and synthetic-media disclosures where applicable.
- YouTube OAuth with minimal scopes, secure token handling, disconnect/revocation and upload progress.
- Upload/schedule through the YouTube Data API with clear quota limits, API project verification/audit restrictions and processing states. Browser download plus manual YouTube Studio upload is the free fallback.
- AI agent orchestrates implemented services with visible steps and approval checkpoints. Never claim autonomous uploading when permissions or API restrictions prevent it.
- Acceptance: the approved artifact is the one uploaded; scheduled status is confirmed by YouTube.

## Phase 6 — Analytics, iteration and platform hardening (not implemented)

- YouTube Analytics API (separate from Data API) for authorized channel performance, freshness timestamps and metric definitions.
- Explainable improvement suggestions grounded in retrieved data, with no guaranteed outcomes. CSV import as a free fallback.
- Authentication, per-user isolation, retention policy, durable storage, backups, rate limits, accessible UI review and deployment security. Add identity before any public or shared deployment, even if that happens earlier than Phase 6.
- Acceptance: reported metrics match available API data and missing permissions are explained honestly.

## Cross-phase architecture and cost rules

Keep orchestration independent of text, voice, research, media, publishing and analytics adapters. Run secrets and heavy work server-side. Introduce a real job queue before media work. SQLite is appropriate for one development instance; migrate storage and data ownership deliberately for a hosted multi-user service. Model weights, FFmpeg outputs, uploaded screenshots, exports and user data do not belong in Git.

Free tools can require significant CPU/RAM/disk and have usage quotas. Each feature must state what is installed, configured, tested and available, and provide a manual or open-source fallback when practical. A roadmap, interface or mock test does not establish a functioning external integration.
