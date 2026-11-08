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
node --input-type=module <<'NODE'
import nextEnv from '@next/env';
import { createServer } from 'vite';
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const report = (stage, httpStatus, classification) =>
  console.log(JSON.stringify({ stage, httpStatus, classification }));

(async () => {
  if (!process.env.GEMINI_API_KEY?.trim())
    return report('setup', null, 'KEY_NOT_LOADED');
  const server = await createServer({
    configFile: false, logLevel: 'silent', appType: 'custom',
    server: { middlewareMode: true }
  });
  const originalFetch = globalThis.fetch;
  let captured;
  try {
    const { GeminiProvider } = await server.ssrLoadModule('/src/lib/providers/gemini.ts');
    globalThis.fetch = async (url, init) => {
      captured = { url, init };
      return Response.json({ error: { status: 'INVALID_ARGUMENT' } }, { status: 400 });
    };
    try {
      await new GeminiProvider('gemini-3.1-flash-lite').generate({
        title: 'Study desk ideas', topic: 'Three ways to organize a study desk',
        format: 'short', language: 'en', duration: 60
      });
    } catch { /* Capture only; no live request has been sent yet. */ }
  } finally {
    globalThis.fetch = originalFetch;
    await server.close();
  }
  if (!captured) return report('setup', null, 'REQUEST_CAPTURE_FAILED');
  const app = JSON.parse(captured.init.body);
  const config = app.generationConfig;
  const variant = extra => ({
    contents: app.contents,
    generationConfig: { maxOutputTokens: 32, ...extra }
  });
  const stages = [
    ['minimal-current', {
      contents: [{ role: 'user', parts: [{ text: 'Reply with OK.' }] }],
      generationConfig: { maxOutputTokens: 32 }
    }],
    ['app-prompt', variant({})],
    ['temperature', variant({ temperature: config.temperature })],
    ['json-mode', variant({ temperature: config.temperature, responseMimeType: config.responseMimeType })],
    ['json-schema', variant({ ...config, maxOutputTokens: 32 })],
    ['actual-app-settings', app]
  ];
  for (const [stage, payload] of stages) {
    const response = await originalFetch(captured.url, {
      ...captured.init, body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000)
    });
    const classification = response.ok ? 'ACCEPTED' : ({
      400: 'INVALID_REQUEST_OR_CREDENTIAL', 401: 'AUTHENTICATION_REJECTED',
      403: 'ACCESS_REJECTED', 404: 'MODEL_OR_RESOURCE_NOT_FOUND',
      429: 'QUOTA_OR_RATE_LIMIT', 503: 'SERVICE_UNAVAILABLE'
    })[response.status] || 'OTHER_HTTP_FAILURE';
    report(stage, response.status, classification);
    await response.body?.cancel();
    if (!response.ok) break;
  }
})().catch(() => report('diagnostic', null, 'SETUP_NETWORK_OR_TIMEOUT_FAILURE'));
NODE
```

Share only the JSON lines. If `minimal-current` also returns 503, the live failure is not limited to the app's schema or large token cap. A failure first appearing at a later stage narrows the difference, but one pass cannot exclude a transient outage between requests. If every stage returns 200, the synthetic app payload works now; it does not prove every user topic/duration works. No live outcome is claimed from the mock tests.
