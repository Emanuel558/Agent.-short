# Gemini 503 payload investigation

## Recurring 503: availability is a separate question

After commit 17112a0, the user reported `json-mode-control: 503` at request one. That control has **no schema** and caps output at **32 tokens**. Capturing the current synthetic diagnostic brief offline measured **883 request bytes** for that control, **1,257 bytes** for the full app request and **349 bytes** for its structural schema. These are source-based synthetic measurements, not the user's private project. The failed control did not exercise either schema or the 16,384-token cap. Earlier 200 results from another time do not establish current availability.

Google's [error reference](https://ai.google.dev/gemini-api/docs/api-errors) describes 503 as temporary overload or service unavailability. The [model page](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite) documents a 65,536-token output limit, above the app's cap. The [deprecation schedule](https://ai.google.dev/gemini-api/docs/deprecations) gives May 7, 2027 as 3.1 Flash-Lite's earliest shutdown date; that date has not been reached as of 2026-11-08. Neither the supplied 503 nor metadata access establishes a global incident, model shutdown, invalid key, exhausted quota or a need to enable billing.

The [Google AI Studio status dashboard](https://aistudio.google.com/status) is the relevant public service check. The assistant could fetch its shell but could not verify the rendered live incident state from this environment. No current global outage or all-clear is claimed. The private Codespace's key, project-tier/usage details and live generation remain inaccessible here. No production-generation configuration change is justified by the latest evidence.

### One bounded availability pass

Pull the Phase 1 branch, then run this from the repository directory:

```sh
node --experimental-strip-types scripts/gemini-diagnostic.ts --availability
```

Use this mode by itself, not together with `--schema-compare`. It has a single **six-HTTP-request total budget**, including metadata calls. No background loop or application retry is added.

- Start with `minimal-current`: the same 3.1 model/key/API version, a tiny harmless prompt, 32 output tokens, no JSON mode, schema or custom temperature.
- If that first request returns 503, check metadata for **gemini-3.5-flash-lite**, then issue one identical tiny request to it only when the exact model advertises `generateContent`. This branch uses at most **three total HTTP requests** (3.1 generation, alternate metadata, alternate generation), then stops. Google documents a [Standard text free tier](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite) for this exact control model, checked 2026-11-08. The probe does not add it to AutoTube's model catalog, change Settings, replace the key, or enable billing. Metadata still cannot guarantee free quota or generation permission; the single generation control supplies the access result.
- If the first minimal request succeeds, use the existing staged comparison: app prompt, temperature, JSON mode, current structural schema, then full output cap. A later 503 ends that sequence. If a slot remains, make **one** `minimal-after-failure` control on 3.1, then stop. It repeats the previously successful tiny baseline, not the failed larger/configured request. If the sixth request fails, the budget is exhausted and there is no seventh control.
- An explicit valid `Retry-After` header stops additional probes. Only the numeric interval is reported, with no automatic waiting/rerun. Other errors (400/401/403/404/429 or network failures) stop normally, without alternate-model probes.

Output remains safe JSON: fixed stage/variant/model names, HTTP status/classification, elapsed milliseconds, request byte counts, token cap, JSON/schema booleans, optional Retry-After seconds and the total `requestsSent`. No key, prompt, generated content, raw response or headers are printed. No SQLite or project data is read or written.

| Observed result | What it narrows; what it does not prove |
| --- | --- |
| Tiny 3.1 request 503; alternate tiny request 200 | Suggests model-specific availability/routing/capacity for this key. The same key can generate elsewhere; this does not prove 3.1 is retired or a global incident exists. |
| Both tiny model requests 503 | Supports a broader service/path/shared-project-capacity issue. One key and two models cannot establish a Google-wide outage. Check public status and the existing project's read-only usage/status view. |
| Alternate metadata or access fails | The cross-model comparison is inconclusive. Do not change keys or billing to force it. |
| A configured stage 503; following tiny control 200 | Associates failure with that request profile in this pass; changing load between requests remains possible. |
| A configured stage 503; following tiny control also 503 | Availability changed during the run; blaming that setting alone is unsupported. |
| Only full-cap request 503 | Associates the failure with the full-budget profile, but 16,384 is a valid published cap. The six-call budget prevents an extra final control, so a transient failure remains possible. |
| Schema 400 | The separate schema rejection path; use safe field diagnostics once service accepts the controls. |
| All configured stages 200 | The synthetic profile works at that time. This does not verify every real topic/duration or eliminate intermittent load. |

Share the JSON from **one pass**. Do not run either comparison in a loop. Live findings are required before changing the app's model or output settings; automated fixtures are not evidence of Google's current availability.

## Current finding: schema-stage HTTP 400

The user completed the live comparison with the same model/key: app prompt, temperature and JSON MIME mode returned HTTP 200, while adding the full Zod `responseJsonSchema` returned HTTP 400 at request five. This establishes rejection at the schema step for that comparison, rather than an output-token-limit failure (the failing stage still used 32 tokens). It does **not** identify which inner keyword was rejected, or establish that the earlier HTTP 503 had the same cause.

An offline inspection found a full draft-2020-12 validation document: root `$schema` metadata; `minLength`/`maxLength` on strings; `minimum`/`maximum` on duration; and `minItems`/`maxItems` on scenes. The nested object/array shape, integer type, required fields and `additionalProperties: false` are supported structures. Numeric and array bounds are valid documented keywords, not malformed constraints; they still add decoder constraints. String lengths are documented as ignored by Google's decoder. There are no references, unions, enums or incompatible type combinations in this schema.

The Gemini adapter now projects that document to a small **structural schema**: types, properties, items, required fields and closed objects. It omits document metadata and all bounds from the wire representation. The original strict Zod schema remains unchanged for local validation of nonempty strings, lengths, 1–60 scenes, integer duration bounds, extra properties and exact duration totals. Invalid output is rejected before saving, preserving previous scripts/history. Ollama keeps its existing schema. No API version, model selection, key, temperature, output cap, billing or automatic-retry changes accompany this compatibility change.

This addresses the rejected full validation-document representation, but **live acceptance of the new schema remains to be verified**. Do not claim that `$schema`, a length limit, or a particular bound was Google's confirmed rejected keyword: the old diagnostic discarded that detail. Contract fixtures simulate rejection and do not establish which keyword Google rejected for this key.

## Safe field diagnosis and original-versus-compatible comparison

Google HTTP 400 responses are now inspected for `google.rpc.BadRequest.fieldViolations` and explicit rejection wording. Only fixed, recognized schema keywords and canonical paths for scenes/heading/narration/visual/duration are returned in `diagnostic.schema`. Raw descriptions, arbitrary paths/keys, values, prompts, generated content and credentials are excluded. Explicit constraint-state-budget errors receive `SCHEMA_COMPLEXITY_LIMIT`; rejected known schema fields receive `SCHEMA_REJECTED`. Invalid-key reasons retain their credential classification.

The terminal diagnostic uses the same classifier. `invalidFields: ["responseJsonSchema"]` with `UNSUPPORTED_REQUEST_FIELD` identifies rejection of the outer request parameter rather than a specific inner keyword. `schemaDetailAvailable: true` means Google supplied a recognized keyword, known field path or complexity explanation; a root path alone still does not identify an inner keyword. `false` means there is no recognized field-level detail, and the script does not invent one.

After pulling the Phase 1 update, run this single command from the repository:

```sh
node --experimental-strip-types scripts/gemini-diagnostic.ts --schema-compare
```

This opt-in mode makes **at most four distinct requests**, within the six-request hard cap:

1. `json-mode-control`: current app prompt, temperature and JSON MIME mode, capped at 32 tokens, without a schema.
2. `schema-original`: same input/settings with the original full Zod schema, capped at 32 tokens. If it returns 400, print safe field diagnostics and proceed once to the different compatible payload. Explicit credential failures, 403, 429, 503 and network failures stop the comparison.
3. `schema-compatible`: same input/settings with the structural schema, capped at 32 tokens. Any failure stops here.
4. `schema-compatible-full-limit`: the actual app settings with the compatible schema and 16,384-token cap.

There are no retries of identical payloads. Only this explicit mode continues after the expected original-schema 400; the default six-step comparison below still stops on its first failure. Both modes use a harmless synthetic brief, the current server key and the same fixed model/version. They never save the diagnostic output or change SQLite, Settings or billing. A 200 at a 32-token cap establishes acceptance, not a complete valid script.

Share only the JSON lines. Original 400 plus compatible 200 supports the representation change for that run. If the original is also 200, do not claim deterministic rejection of a specific keyword. If the compatible schema still fails, the safe fields distinguish an outer-parameter problem, inner-schema rejection or unavailable provider detail. Test the real project's complete script in the browser after the compatible full-limit request succeeds.

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

Google's [3.1 Flash-Lite model page](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite) documents structured output and a 65,536-token output maximum. Thus 16,384 is within the published limit and is a cap, not a request to always generate that many tokens. The original Zod document serialized to 553 bytes; small byte size alone does not guarantee decoder compatibility. Google's [structured-output guide](https://ai.google.dev/gemini-api/docs/structured-output) documents `responseJsonSchema` and recommends local validation. The newly supplied schema-stage 400 prompted the structural projection above; the output cap and temperature are unchanged.

The 503 is an upstream response before AutoTube parses or saves the generated JSON. Output validation cannot produce Google's `UNAVAILABLE` status. There is one inference request per click and no new automatic retries or model fallback.

## Safe failure diagnostic

Generation errors include `diagnostic.payload` with UTF-8 request/prompt/schema byte counts plus `maxOutputTokens`, `responseMimeType` and `temperature`. Schema 400 errors additionally include only recognized schema keywords/paths when supplied by Google. The diagnostic does not contain the prompt, schema content, script, topic, project IDs, raw response, key or headers. It supplements the existing model/version/path and actual upstream HTTP status. These counts help compare a failing request without exposing its contents.

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
