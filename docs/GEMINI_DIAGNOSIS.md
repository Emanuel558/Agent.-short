# Gemini model diagnosis and explicit selection

## What the original message proves

The old adapter combined upstream HTTP **400** and **404** into “model unavailable or request unsupported.” That message cannot establish the exact Google cause: 404 can mean model/API-version/method availability, while 400 can mean unsupported parameters, schema fields, or an invalid key. The user's raw Google status/body was not retained, so it cannot be reconstructed retrospectively. Do not claim the old model is definitely unavailable based on that message alone.

The assistant cannot access the user's live Codespace secret in its separate environment. Tests with a dummy key do not establish the user's live model access. A live models response and, if needed, the new safe generation diagnostic are required for account-specific conclusions.

## Safe errors

Generation and model discovery now return `code: GEMINI_API_ERROR` with a `diagnostic` object containing the upstream HTTP status, operation, allowlisted Google status/reason, an application classification and known invalid request-field names. No raw Google message, arbitrary metadata, prompt, API key, cookie, or authorization header is exposed or logged.

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

For available models, the UI intersects the model list with a small reviewed free-tier catalog. It recommends **gemini-2.5-flash-lite** if listed, then the existing **gemini-2.5-flash** if listed. Unknown-pricing and paid-only models are not selectable through this workflow and are blocked before generation. If there is no reviewed candidate, use Demo. Review the catalog against current pricing when adding another model; do not guess by model name.

Google documents free Standard-tier text input/output for [Gemini 2.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash-lite). Recommendation remains conditional on the key's model listing and account access. Free-tier eligibility, usage limits and account billing are controlled by Google; an already-billed project can incur charges. The app cannot infer billing status from the model list. The older Flash ID has a documented alias transition from December 1, 2026; keep reviewing [Google's pricing/model notices](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash).

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
