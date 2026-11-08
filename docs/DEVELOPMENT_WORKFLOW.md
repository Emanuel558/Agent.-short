# Proposed AutoTube AI development workflow

This process is proposed for work after the current origin patch passes live acceptance. It does not approve or implement Phase 2.

## Gates for every change

1. **Observe:** record the failing action, deployed commit, browser URL, sanitized request/response evidence, expected result and actual result. Distinguish browser headers from headers received by the application after a proxy.
2. **Reproduce:** make the smallest regression fail on the existing code. Use the same transport/proxy behavior as the reported environment. Do not substitute a localhost-only test for a forwarded-origin bug.
3. **Explain:** identify the exact rejecting condition and configuration source. Mark unobserved production values as unknown. No configuration guessing or weakening security to make a test green.
4. **Fix:** implement the smallest service-level change and include negative/security controls. Keep secrets server-side, migrations additive where practical, and existing user data recoverable.
5. **Verify in CI:** unit/domain tests → TypeScript → production build → production forwarded-route integration → browser workflows at desktop/mobile sizes. Test error recovery and reload/persistence, not just a successful click.
6. **Verify in the user's environment:** deploy the recorded commit to the intended private Codespace and execute a short acceptance script with observable results. External APIs need a separate live check; a mock proves the app's handling, not account access or provider availability.
7. **Review:** PR describes the final behavior, cause, tests, remaining limits, changed files, migration effects and rollback. Use separate statuses for implementation, automated verification and live acceptance. Only mark an issue fixed once its acceptance evidence is recorded.
8. **Advance:** obtain explicit approval for the next phase. A roadmap or passing mock never grants that approval.

If access is blocked, complete independent investigation, state exactly what is unavailable, and request one targeted sanitized observation. Never request API keys, cookies, authorization headers or full HAR files. Do not repeat generic restarts as a diagnosis.

## Phase acceptance templates

| Phase                                  | Automated acceptance                                                                                                                                                          | Live acceptance before closure                                                                                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1: projects/scripts                    | Forwarded create/provider-save; both formats; provider validation/errors; scene edit/save/reopen/history/export; old SQLite migration; CSRF negative cases; no key disclosure | Correct private Codespace commit; creation 201; provider save 200; reload persists; one real configured-model script with error recovery; Gemini output labeled |
| 2: inspiration/research (not approved) | Validate URL/screenshot inputs; fixture-based metadata/OCR; citations retain provenance; quota/permission errors are visible                                                  | Authorized source retrieval works and cited claims can be checked; unavailable sources are disclosed                                                            |
| 3: voice/media (not approved)          | Verify actual audio metadata and media files; track per-asset licenses/provenance; missing models/keys/compute and cancellation are handled                                   | Play the generated audio and selected licensed assets; confirm installed model/voice licenses                                                                   |
| 4: rendering/subtitles (not approved)  | Inspect real FFmpeg output, aspect ratio, duration, audio tracks and subtitle timestamps; recover failed/cancelled jobs                                                       | Play the complete exported artifact and review subtitle synchronization at representative timestamps                                                            |
| 5: review/publishing (not approved)    | Test approval boundaries, OAuth errors, retries/idempotency, metadata and scheduling payloads                                                                                 | The user-approved exact artifact uploads through authorized access; YouTube confirms its actual state                                                           |
| 6: analytics/hardening (not approved)  | Metric definitions/freshness, missing data, ownership isolation, retention and backup restoration                                                                             | Authorized channel metrics match retrieved data; restore a backup; verify user boundaries before sharing                                                        |

Each phase PR must specialize these templates into concrete inputs, expected outputs, measurable checks, free-tool/quota constraints, and evidence links. Authentication and per-user isolation must precede any public/shared deployment, regardless of phase order.

## Current Phase 1 command sequence

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run test:forwarded
npx playwright install --with-deps chromium
npm run test:e2e
```

Run all commands inside Codespaces/CI, not on the school computer. GitHub Actions enforces these checks; the documented live script in ORIGIN_REGRESSION.md is an additional acceptance gate.
