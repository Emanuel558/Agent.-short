# Gemini model diagnosis and explicit selection

## Current outcome: Gemini 3.1 Flash-Lite

The user independently tested the official `v1beta` endpoints with the existing Codespaces key: `models.get` and minimal `generateContent` both returned HTTP 200 for `gemini-3.1-flash-lite`; 2.5 Flash-Lite generation returned 404 with the same key. This isolates a model-specific access/availability difference, not an AutoTube-only failure or blanket project/API-version failure. Google's [2.5 model notice](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite) limits access based on prior active usage, which is consistent with the evidence; no project-specific entitlement record was inspected.

The reviewed catalog now includes `gemini-3.1-flash-lite`. Google's [Standard text pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-lite), checked 2026-11-08, lists free-tier input and output. It is recommended first when returned by discovery with `generateContent` support, but never selected automatically. The distinct image model is not added. Existing 2.5 selections/defaults, the API key, project documents and revisions remain intact.

Use Settings → Check available Gemini models → choose `gemini-3.1-flash-lite` → Save Gemini model. Select Google Gemini and Save provider, then open a project and Generate with Gemini. Reload to verify persistence. The user's direct successful control is separate from the full structured-script browser acceptance; our automated generation uses mocked Google responses.

## What the original message proves

The old adapter combined upstream HTTP **400** and **404** into “model unavailable or request unsupported.” That message cannot establish the exact Google cause: 404 can mean model/API-version/method availability, while 400 can mean unsupported parameters, schema fields, or an invalid key. The user's raw Google status/body was not retained, so it cannot be reconstructed retrospectively. Do not claim the old model is definitely unavailable based on that message alone.

The assistant cannot access the user's live Codespace secret in its separate environment. Tests with a dummy key do not establish live model access; the direct live result above was reported by the user.

## Safe errors

Generation and model discovery now return `code: GEMINI_API_ERROR` with a `diagnostic` object containing the upstream HTTP status, operation, allowlisted Google status/reason, an application classification and known invalid request-field names. No raw Google message, arbitrary metadata, prompt, API key, cookie, or authorization header is exposed or logged.

## Investigating the reported generation 404

The reported 2.5 failure is **Google HTTP 404 / NOT_FOUND during generateContent**. AutoTube maps upstream failures to browser HTTP 502; that wrapper is not another Google status. Subsequent diagnostics confirmed matching saved/requested IDs and `v1beta`, with discovery advertising the method. The direct controls above then established a model-specific difference outside AutoTube.

The code trace uses these official endpoints, both with `GEMINI_API_KEY` in the `x-goog-api-key` header:

| Operation | Method and path | Meaning |
| --- | --- | --- |
| Discovery | `GET /v1beta/models` | Lists metadata, filtered for `supportedGenerationMethods` containing `generateContent`. A successful list is not a generation-access guarantee. |
| Generation | `POST /v1beta/models/{selectedModelId}:generateContent` | Sends the script prompt and structured-output configuration to the exact selected model. |

Saving a model writes its normalized ID to the SQLite `settings` row with key `gemini-model`. `generateProject` reads that row once and passes it to `GeminiProvider`. It overrides `GEMINI_MODEL`; no project-level model, browser value, or alternate model is substituted. A legacy `models/` prefix is stripped exactly once when forming the request. Both endpoints share the same fixed official host and API-version constant.

Generation errors now include `apiVersion`, `requestPath`, and a `request` snapshot:

```json
{
  "savedModelId": "gemini-2.5-flash-lite",
  "selectedModelId": "gemini-2.5-flash-lite",
  "modelSource": "saved selection",
  "apiVersion": "v1beta",
  "requestPath": "/v1beta/models/gemini-2.5-flash-lite:generateContent"
}
```

`savedModelId` is the stored SQLite value captured for that attempt (`null` if absent); `selectedModelId` is the normalized ID actually sent. If a stored value contains an optional prefix, the snapshot preserves it for comparison. Only reviewed free-tier IDs pass the guard before a generation request or its diagnostic can be produced. The same snapshot builds both the actual URL and diagnostic, even if Settings changes while generation is in flight.

After a generation 404, the server performs one **metadata-only** discovery operation with the **same captured key and v1beta version**. It never retries generation or switches models. Its result appears as `modelDiscovery`:

- `supportsGenerateContent: true`, HTTP 200: this exact ID is freshly listed with that method, despite its generation 404. This establishes a Google listing/generation discrepancy for the same request context; it does not prove generation permission or explain Google's internal availability.
- `supportsGenerateContent: false`, HTTP 200: the selected ID is absent or does not advertise the method. Discovery working for other IDs does not validate this selection. Explicitly choose a listed, reviewed free-tier model if you want to change it.
- `supportsGenerateContent: null`: discovery itself failed; `upstreamHttpStatus` gives its safe status when available. The original generation 404 is preserved.

**One targeted live test:** after loading the updated server code, keep the current key/model/settings unchanged. Open browser DevTools → Network, click **Generate with Gemini once**, and inspect the Response for `POST /api/projects/<id>/generate`. Share only `code` and `diagnostic`. The response now contains the captured SQLite selection, actual request ID/version/path, and same-key discovery comparison. No separate terminal command or raw headers/HAR is needed. The discovery recheck runs on the server and will not appear as a separate browser request. It has a 15-second total timeout; it can add that much time after a failed generation.

The live SQLite file, secret, and Google generation access are not accessible in the assistant's separate environment. Automated tests reproduce a successful model list plus a generation 404 at the HTTP boundary, with a selected model different from the environment default and a SQLite reopen. They confirm correct selection/path propagation, privacy, no inference retries, and preservation of existing scripts/history. They do not reproduce or resolve the live Google-side 404. Do not claim a model-path defect was found when none was reproduced.

| Diagnostic                                                  | Meaning and action                                                                                                                            |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 404 / MODEL_NOT_FOUND                                       | Requested model or API resource was not found. Check the official models list for generateContent support.                                    |
| 400 / UNSUPPORTED_REQUEST_FIELD                             | Google rejected a known request field. The diagnostic identifies its name; changing model availability alone does not establish a format fix. |
| 400 / INVALID_REQUEST                                       | Parameters were rejected. This does not establish that the model is missing.                                                                  |
| 400 / ACCESS_DENIED with API_KEY_INVALID or API_KEY_EXPIRED | Google specifically rejected the credential. Selecting a model does not replace or repair that key.                                           |
| 401/403 / ACCESS_DENIED                                     | Check project permissions, restrictions and free-tier eligibility. No billing is enabled by the app.                                          |
| 429 / QUOTA_LIMIT                                           | Wait or use Demo. Do not upgrade billing as an automatic recovery.                                                                            |

## Discover models with the existing key

In Settings or the Script Studio provider card, click **Check available Gemini models**. The server uses `GEMINI_API_KEY` in a header to call Google's official `GET /v1beta/models`, following pagination and filtering `supportedGenerationMethods` for `generateContent`.

This operation fetches metadata only: it does not generate text, change the provider/model/key, enable an API service, or enable billing. Model metadata does not report account billing, remaining free quota, or guarantee a successful generation request.

For available models, the UI intersects the model list with a small reviewed free-tier catalog. It recommends **gemini-3.1-flash-lite** if listed, then **gemini-2.5-flash-lite**, then **gemini-2.5-flash**. Recommendation never changes an existing selection. Unknown-pricing and paid-only models are not selectable through this workflow and are blocked before generation. If there is no reviewed candidate, use Demo. Review the catalog against current pricing when adding another model; do not guess by model name.

Google documents free Standard-tier text input/output for [Gemini 3.1 Flash-Lite](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-lite). Recommendation remains conditional on the key's model listing and account access. Free-tier eligibility, usage limits and account billing are controlled by Google; an already-billed project can incur charges. The app cannot infer billing status from the model list. Keep reviewing Google's current model availability and pricing notices.

## Change the model without changing the key

Choose a listed free-tier candidate and click **Save Gemini model**. The server rechecks membership and generateContent support, then saves only the model ID to SQLite. Existing projects and revision history remain intact. No inference is requested by saving. The active model appears beside the key-presence flag.

Precedence is: explicit saved selection → server `GEMINI_MODEL` → legacy default `gemini-2.5-flash`. A `models/` prefix is normalized. URLs and key-like values are rejected. **Use server GEMINI_MODEL setting** clears only the saved model override. It does not change the key or provider. UI selection does not require a restart; changes to server environment variables require loading that updated environment as usual.

## Live acceptance

1. Load the updated Phase 1 checkout in the existing Codespace. Keep the same key and database.
2. Discover models. Record the current model's listed/not-listed result and the recommended candidate, if any.
3. Explicitly select a listed free-tier candidate, save it, and select Gemini as the script provider.
4. Generate a short test script. Check its Gemini label and scene plan, save, reload and export. Repeat long-form only after the short test succeeds.
5. If generation fails, copy only `code` and `diagnostic` from that response in Network. They distinguish a remaining schema/request problem from model discovery or key access. Do not copy keys, raw headers, cookies or HAR files.

Do not mark live generation verified until this real-key check succeeds. Automated tests cover metadata pagination/filtering, safe errors, model selection and selected-model generation with Google's boundary mocked. The raw forwarded-origin integration and existing Phase 1 tests also remain required.

Official references: [Models API](https://ai.google.dev/api/models), [generateContent API](https://ai.google.dev/api/generate-content), [structured outputs](https://ai.google.dev/gemini-api/docs/structured-output).
