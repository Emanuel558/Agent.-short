# Gemini 503 payload investigation

## Confirmed defect and remaining uncertainty

`generateProject` passed the entire saved Project object to a provider typed to accept Brief. TypeScript does not strip extra runtime fields. Consequently, serializing the brief also sent previous scenes/scripts, previous error messages, storage IDs, status, versions and timestamps. A synthetic prior-script example increased prompt size from 689 to 10,150 UTF-8 bytes. Those are reproduction measurements, not measurements from the user's private project.

The confirmed fix explicitly passes only title, topic, format, language and duration at the service boundary. This applies to all text providers. It keeps regeneration independent of old script size and avoids sending unrelated stored data. Existing scripts and revisions remain in SQLite. A regression compares the fresh-project and regeneration HTTP bodies for the same brief and verifies that they are identical, including after a 503.

**This is not proof that the extra data caused the live 503.** The user's secret and exact live request are unavailable in the assistant environment. A previously successful minimal request is not a simultaneous service-availability control. Google documents [503 as a transient service failure](https://ai.google.dev/gemini-api/docs/troubleshooting); request-dependent failures can only be narrowed by live comparisons.

## Minimal request versus actual application request

Both use the same official `v1beta/models/gemini-3.1-flash-lite:generateContent` path and server-side key header.

| Setting | Successful minimal control | AutoTube script request |
| --- | --- | --- |
| Text | Reply with OK. | Original-script instructions and the selected brief |
| Role | Default user | Explicit user |
| Output cap | 32 tokens | 16,384 tokens |
| Temperature | Model default | 0.7 |
| JSON MIME type | Omitted | `application/json` |
| Output schema | Omitted | `responseJsonSchema`, generated from the app's Zod validator |
| Existing script/storage fields | Absent | Present before this fix; excluded afterward |

Google's [3.1 Flash-Lite model page](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite) documents structured output and a 65,536-token output maximum. Thus 16,384 is within the published limit and is a cap, not a request to always generate that many tokens. The current schema serializes to 553 bytes. Google's [structured-output guide](https://ai.google.dev/gemini-api/docs/structured-output) documents `responseJsonSchema`; it says string-length constraints emitted by Zod are ignored by the API and should be enforced locally. AutoTube already validates them locally. No unsupported-field or token-limit error was supplied, so the schema, token cap and temperature are retained instead of guessing which parameter caused a 503.

The 503 is an upstream response before AutoTube parses or saves the generated JSON. Output validation cannot produce Google's `UNAVAILABLE` status. There is one inference request per click and no new automatic retries or model fallback.

## Safe failure diagnostic

Generation errors now include `diagnostic.payload` with UTF-8 request/prompt/schema byte counts plus `maxOutputTokens`, `responseMimeType` and `temperature`. The diagnostic does not contain the prompt, schema content, script, topic, project IDs, raw response, key or headers. It supplements the existing model/version/path and actual upstream HTTP status. These counts help compare a failing request without exposing its contents.

## One bounded live comparison

After loading the updated code in the Codespace, run the following **from the repository directory**. It uses the existing development dependencies, captures the real Gemini adapter's request for a harmless synthetic 60-second brief, and uses the same model/key/API version. It does not read or write SQLite, change Settings, replace the key or enable billing. It never prints prompts, generated text, schemas, credentials or raw Google errors.

This makes **at most six distinct generation requests**, not six retries. It stops on the first failed request. Each stage adds one difference: the actual app prompt, temperature, JSON mode, schema, then the original output cap. The first five stages cap output at 32 tokens and may truncate; HTTP 200 only means that configuration was accepted. The last stage uses the actual adapter configuration. All calls consume the existing project's quota; this does not establish account billing status.

```sh
node --experimental-strip-types scripts/gemini-diagnostic.ts
```

The checked-in script replaces the old inline command, whose single catch-all category hid the failing operation. Pull the current Phase 1 branch before running it. It works on the project's supported Node versions using built-in TypeScript stripping; no package installation is performed. The app itself is not started or modified. Paths and environment-file loading are resolved from the script's repository location, rather than relying on the terminal's current directory for Vite setup.

Each JSON line contains a fixed `stage`, `classification`, nullable `httpStatus`, and `requestsSent`. Google comparisons also include a fixed `variant` name. `STARTED` and `OK` show setup progress; error categories never contain the raw exception, message, stack, path, prompt, key, schema, or response body.

| Stage | What it identifies | Example safe failure categories |
| --- | --- | --- |
| `environment` | Loading Next environment support and checking key presence | `MODULE_NOT_FOUND`, `KEY_NOT_LOADED`, `ENVIRONMENT_LOAD_FAILED` |
| `vite-setup` | Importing Vite and creating the one-shot loader | `FILE_WATCH_LIMIT`, `FILE_DESCRIPTOR_LIMIT`, `PORT_IN_USE`, `VITE_SETUP_FAILED` |
| `adapter-loading` | Loading the actual Gemini adapter module and checking its export | `FILE_NOT_FOUND`, `MODULE_NOT_FOUND`, `SYNTAX_ERROR`, `ADAPTER_LOAD_FAILED`, `ADAPTER_EXPORT_MISSING` |
| `request-capture` | Running the adapter against a blocked-network synthetic capture | `CAPTURE_GENERATION_FAILED`, `CAPTURE_NO_REQUEST`, `CAPTURE_MULTIPLE_REQUESTS` |
| `payload-validation` | Checking the captured endpoint, authentication header presence/match and payload shape | `CAPTURE_ENDPOINT_MISMATCH`, `CAPTURE_KEY_MISMATCH`, `CAPTURE_PAYLOAD_INVALID` |
| `vite-cleanup` | Closing the loader and restoring the original fetch | `VITE_CLEANUP_FAILED` |
| `google-api-request` | Sending one specific live comparison | `TIMEOUT`, `DNS_LOOKUP_FAILED`, `CONNECTION_REFUSED`, `TLS_CERTIFICATE_FAILED`, `GOOGLE_REQUEST_FAILED`, `SERVICE_UNAVAILABLE` |
| `google-response` | Discarding an unread response body after status was reported | `RESPONSE_CLEANUP_FAILED` |

For example, `{"stage":"adapter-loading","httpStatus":null,"classification":"MODULE_NOT_FOUND","requestsSent":0}` identifies a loader failure before any live Google requests. `{"stage":"google-api-request","httpStatus":null,"classification":"TIMEOUT","requestsSent":1,"variant":"minimal-current"}` identifies a timeout during the first comparison. A numeric HTTP status means a response was received; DNS/TLS/connection/timeout categories have no HTTP status.

The loader disables unnecessary file watching, HMR sockets and dependency discovery for this one-shot capture. Network fetches during setup/loading are blocked, not forwarded; capture performs no live Google request. The original fetch is restored even when capture or cleanup fails. A cleanup failure is reported separately and prevents the live comparisons. If an earlier phase and cleanup both fail, both categories are retained. No setup failure is relabeled as a Google API failure.

Tests inject failures into setup, adapter loading, capture, validation, cleanup and transport, verify that error messages containing dummy secrets never appear in output, and assert the six-call cap and stop-on-failure behavior. A subprocess test also executes this exact CLI with real Vite and the real adapter from outside the repository; only the Google transport is mocked. These tests cannot establish which phase failed in the user's live Codespace until the new output is captured.

Share only the JSON lines. If `minimal-current` also returns 503, the live failure is not limited to the app's schema or large token cap. A failure first appearing at a later stage narrows the difference, but one pass cannot exclude a transient outage between requests. If every stage returns 200, the synthetic app payload works now; it does not prove every user topic/duration works. No live outcome is claimed from the mock tests.
