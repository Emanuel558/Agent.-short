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
