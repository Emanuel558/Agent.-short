# Phase 1 acceptance guide

Run in a private GitHub Codespace using the README. No API key is needed.

| Requirement                  | How to review                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard and sidebar        | Open Dashboard at desktop and narrow mobile widths. Empty accounts show zero real project counts.                                                 |
| Create both formats          | Create one Short at 60 seconds and one long-form project at 300 seconds. Confirm 9:16 / 16:9 labels.                                              |
| Topic, language and duration | Try English and Swedish; demo narration and headings localize. Try a custom target duration.                                                      |
| Generate scripts             | Click Generate demo script; verify the demo label and bracketed research prompts.                                                                 |
| Edit and scene plan          | Edit narration, heading, visual direction, and scene duration. Total duration must match the brief before saving.                                 |
| Save and reopen              | Save, navigate to Projects, reopen, then refresh the browser. Edits persist.                                                                      |
| Project history              | Preview earlier revisions. Load a revision as a draft and explicitly save to restore.                                                             |
| Exports                      | Save, download JSON and TXT. Check edited text and visual plan are present.                                                                       |
| Task feedback                | Observe generation/loading messages. Invalid timing gives a clear error without losing edits.                                                     |
| Conflict handling            | Open one project in two tabs. Save in the first, then save different text in the second. The second gets a conflict and retains its unsaved text. |
| Provider failure             | With an unreachable configured model endpoint, generation fails visibly and preserves the previously saved script. Restart with demo to continue. |
| Later phases                 | Voice, footage, research, editor, agent, and analytics pages state they are not implemented.                                                      |
| Secrets and data             | Confirm `.env.local`, `data/`, and generated files are ignored by Git.                                                                            |

Automated coverage: Vitest exercises persistence, revision atomicity/conflicts, validation, failed/interrupted generation, request boundaries and mocked model responses. Playwright exercises the real demo-backed UI, both exports, history, long-form API behavior, and mobile navigation. A real external model and GitHub’s Codespaces provisioning are not executed by those tests; the dev container config and Node 22 checks support reproducible setup.

JSON export schema version is 1. Phase 1 supports export only, not import. TXT is a readable script and plan, not a video or subtitle file.

Origin regression tests cover rewritten/missing/chained forwarding headers, the exact Codespace host, alternate-port configuration, other Codespaces, spoofed forwarding hosts, scheme/port differences, malformed origins, and browser Fetch Metadata. Extension compatibility tests inject Grammarly's body attributes before hydration and exercise real project creation. A separate test deliberately alters an application heading to verify descendant hydration diagnostics remain enabled. These simulate proxy/extension behavior; the user's live private Codespace and installed Grammarly extension are not accessed by CI.

Gemini update: select Gemini, Ollama, or Demo in Settings and save, then reload to verify the choice persists. With a server-side `GEMINI_API_KEY`, Gemini should return validated narration and scene plans; without a key it explains setup. Quota/model failures preserve previous scripts. Select Demo after a cloud failure to recover without network inference. Editing a project name before generation now saves the edit and continues. Tests cover the official Gemini request protocol, quota/access/model errors, malformed/truncated outputs, Ollama's native endpoint, provider selection, and opening a pre-settings SQLite database without changing its projects/history. Live Gemini/Ollama access requires your own configuration and is not claimed by mocked tests.

Gemini browser acceptance: verify the key-presence status and model, choose Gemini beside Generate Script, save the choice, and use Generate with Gemini for both formats. Successful results are labeled Gemini-generated and survive reload/export. The Playwright Gemini suite uses a test-only server-side fetch mock at the official API boundary; no API-route or project-storage mocks replace the application flow. Check the public provider response and browser HTML contain no test credential. Normal development has no mock enabled.

Model discovery acceptance: with a server key loaded, explicitly check available models; verify only generateContent entries are candidates and unknown pricing cannot be selected. Save a reviewed candidate, reload, confirm the active model, then generate and export without changing the key. For failures, record the safe upstream HTTP/API status and application reason; HTTP 400 and 404 must remain distinguishable. Model listing and mocked generation do not establish real-key free quota or billing status.

Gemini 3.1 acceptance: in Settings, discover and explicitly save `gemini-3.1-flash-lite`, then save Gemini as the provider. Reload Settings to verify both choices. Open an existing project; choosing a model must leave its script and revisions unchanged. Generate, review, save, reload and export a Short and a long-form script. Verify prior revisions remain available. Browser automation covers the Settings selection/reload/generation flow, and repository tests reopen SQLite before and after 3.1 generation for both formats. The user reported direct real-key 3.1 HTTP 200 success; a complete live structured-script browser result remains a separate acceptance check.
