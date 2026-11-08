import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { runGeminiDiagnostic, type DiagnosticRow, type DiagnosticServer } from "../scripts/gemini-diagnostic";
import { apiError } from "../src/lib/providers/gemini-api";
import { responseJsonSchema } from "../src/lib/providers/output";

const key = "diagnostic-private-key";
const marker = "PRIVATE_PROMPT_SCRIPT_ERROR";
const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent";
const app = {
  contents: [{ role: "user", parts: [{ text: marker }] }],
  generationConfig: { maxOutputTokens: 16384, temperature: 0.7, responseMimeType: "application/json", responseJsonSchema: { type: "object" } },
};
function secretError(code?: string) {
  return Object.assign(new Error(`${key} ${marker}`), code ? { code } : {});
}
function adapter(body = JSON.stringify(app), url = endpoint) {
  return { apiError, validationJsonSchema: responseJsonSchema, GeminiProvider: class {
    async generate() {
      await fetch(url, { method: "POST", headers: { "x-goog-api-key": key }, body });
      throw secretError(); // Expected rejection after intercepted HTTP 400.
    }
  } };
}
function harness() {
  const rows: DiagnosticRow[] = [];
  const server: DiagnosticServer = {
    ssrLoadModule: vi.fn().mockResolvedValue(adapter()),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const transport = vi.fn().mockImplementation(async () => Response.json({ text: `${key} ${marker}` }));
  const dependencies = {
    report: (row: DiagnosticRow) => rows.push(row),
    loadEnvironment: vi.fn().mockResolvedValue(undefined),
    createServer: vi.fn().mockResolvedValue(server),
    transport,
  };
  return { rows, server, dependencies, transport };
}
function privateOutput(rows: DiagnosticRow[]) {
  expect(JSON.stringify(rows)).not.toContain(key);
  expect(JSON.stringify(rows)).not.toContain(marker);
  expect(JSON.stringify(rows)).not.toContain("stack");
  expect(JSON.stringify(rows)).not.toContain("headers");
}
beforeEach(() => vi.stubEnv("GEMINI_API_KEY", key));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it.each([
  ["environment", "ERR_MODULE_NOT_FOUND", "MODULE_NOT_FOUND"],
  ["vite-setup", "ENOSPC", "FILE_WATCH_LIMIT"],
  ["vite-setup", "EADDRINUSE", "PORT_IN_USE"],
  ["adapter-loading", "ENOENT", "FILE_NOT_FOUND"],
  ["adapter-loading", "UNKNOWN_PRIVATE_CODE", "ADAPTER_LOAD_FAILED"],
] as const)("identifies %s failures using safe categories", async (stage, code, category) => {
  const h = harness();
  const originalFetch = globalThis.fetch;
  if (stage === "environment") h.dependencies.loadEnvironment.mockRejectedValue(secretError(code));
  else if (stage === "vite-setup") h.dependencies.createServer.mockRejectedValue(secretError(code));
  else vi.mocked(h.server.ssrLoadModule).mockRejectedValue(secretError(code));
  expect(await runGeminiDiagnostic(h.dependencies)).toEqual({ ok: false, requestsSent: 0 });
  expect(h.rows).toContainEqual(expect.objectContaining({ stage, classification: category, httpStatus: null }));
  expect(h.transport).not.toHaveBeenCalled();
  expect(globalThis.fetch).toBe(originalFetch);
  privateOutput(h.rows);
});

it("identifies a capture failure before fetch and restores fetch despite cleanup failure", async () => {
  const h = harness();
  const originalFetch = globalThis.fetch;
  vi.mocked(h.server.ssrLoadModule).mockResolvedValue({ GeminiProvider: class { async generate() { throw secretError(); } } });
  vi.mocked(h.server.close).mockRejectedValue(secretError());
  expect((await runGeminiDiagnostic(h.dependencies)).ok).toBe(false);
  expect(h.rows).toContainEqual(expect.objectContaining({ stage: "request-capture", classification: "CAPTURE_GENERATION_FAILED" }));
  expect(h.rows).toContainEqual(expect.objectContaining({ stage: "vite-cleanup", classification: "VITE_CLEANUP_FAILED" }));
  expect(globalThis.fetch).toBe(originalFetch);
  expect(h.transport).not.toHaveBeenCalled();
  privateOutput(h.rows);
});

it("does not mistake a Vite cleanup failure for a Google API failure", async () => {
  const h = harness();
  vi.mocked(h.server.close).mockRejectedValue(secretError());
  expect(await runGeminiDiagnostic(h.dependencies)).toEqual({ ok: false, requestsSent: 0 });
  expect(h.rows.at(-1)).toMatchObject({ stage: "vite-cleanup", classification: "VITE_CLEANUP_FAILED" });
  expect(h.transport).not.toHaveBeenCalled();
  privateOutput(h.rows);
});

it.each([
  ["invalid JSON", endpoint, "SYNTAX_ERROR"],
  [JSON.stringify(app), "https://untrusted.invalid/", "CAPTURE_ENDPOINT_MISMATCH"],
  ["{}", endpoint, "CAPTURE_PAYLOAD_INVALID"],
])("rejects unsafe or malformed captured requests without live calls: %s", async (body, url, category) => {
  const h = harness();
  vi.mocked(h.server.ssrLoadModule).mockResolvedValue(adapter(body, url));
  expect((await runGeminiDiagnostic(h.dependencies)).requestsSent).toBe(0);
  expect(h.rows).toContainEqual(expect.objectContaining({ stage: "payload-validation", classification: category }));
  expect(h.transport).not.toHaveBeenCalled();
  privateOutput(h.rows);
});

it("blocks adapter-loading network attempts before the capture phase", async () => {
  const h = harness();
  vi.mocked(h.server.ssrLoadModule).mockImplementation(async () => {
    try { await fetch(endpoint); } catch { /* Module swallows its network error. */ }
    return adapter();
  });
  expect((await runGeminiDiagnostic(h.dependencies)).ok).toBe(false);
  expect(h.rows).toContainEqual(expect.objectContaining({ stage: "adapter-loading", classification: "UNEXPECTED_SETUP_FETCH_BLOCKED" }));
  expect(h.transport).not.toHaveBeenCalled();
  privateOutput(h.rows);
});

it("performs six comparisons at most and keeps capture off the network", async () => {
  const h = harness();
  const originalFetch = globalThis.fetch;
  expect(await runGeminiDiagnostic(h.dependencies)).toEqual({ ok: true, requestsSent: 6 });
  expect(h.transport).toHaveBeenCalledTimes(6);
  expect(h.rows.filter(r => r.classification === "ACCEPTED").map(r => r.variant)).toEqual([
    "minimal-current", "app-prompt", "temperature", "json-mode", "json-schema", "actual-app-settings",
  ]);
  for (const [url, init] of h.transport.mock.calls) {
    expect(url).toBe(endpoint);
    expect(new Headers(init.headers).get("x-goog-api-key")).toBe(key);
    expect(init.redirect).toBe("error");
  }
  expect(globalThis.fetch).toBe(originalFetch);
  privateOutput(h.rows);
});

it("rejects multiple capture calls without forwarding them to Google", async () => {
  const h = harness();
  vi.mocked(h.server.ssrLoadModule).mockResolvedValue({ GeminiProvider: class {
    async generate() {
      const init = { method: "POST", headers: { "x-goog-api-key": key }, body: JSON.stringify(app) };
      await fetch(endpoint, init);
      await fetch(endpoint, init);
    }
  } });
  expect((await runGeminiDiagnostic(h.dependencies)).requestsSent).toBe(0);
  expect(h.rows).toContainEqual(expect.objectContaining({ stage: "request-capture", classification: "CAPTURE_MULTIPLE_REQUESTS" }));
  expect(h.transport).not.toHaveBeenCalled();
  privateOutput(h.rows);
});

it("rejects a mismatched capture key without printing either credential", async () => {
  const h = harness();
  vi.mocked(h.server.ssrLoadModule).mockResolvedValue({ GeminiProvider: class {
    async generate() {
      await fetch(endpoint, { method: "POST", headers: { "x-goog-api-key": "different-private-key" }, body: JSON.stringify(app) });
    }
  } });
  expect((await runGeminiDiagnostic(h.dependencies)).requestsSent).toBe(0);
  expect(h.rows).toContainEqual(expect.objectContaining({ stage: "payload-validation", classification: "CAPTURE_KEY_MISMATCH" }));
  expect(h.transport).not.toHaveBeenCalled();
  expect(JSON.stringify(h.rows)).not.toContain("different-private-key");
  privateOutput(h.rows);
});

it("keeps a response-cleanup error distinct from Google request failure", async () => {
  const h = harness();
  const response = Response.json({ text: marker });
  vi.spyOn(response.body!, "cancel").mockRejectedValue(secretError());
  h.transport.mockResolvedValue(response);
  expect((await runGeminiDiagnostic(h.dependencies)).ok).toBe(false);
  expect(h.rows.at(-1)).toMatchObject({ stage: "google-response", httpStatus: 200, classification: "RESPONSE_CLEANUP_FAILED", requestsSent: 1 });
  expect(h.transport).toHaveBeenCalledTimes(1);
  privateOutput(h.rows);
});

it("stops at the sixth request when the full-settings variant fails", async () => {
  const h = harness();
  let count = 0;
  h.transport.mockImplementation(async () => Response.json({ error: { message: marker } }, { status: ++count === 6 ? 503 : 200 }));
  expect(await runGeminiDiagnostic(h.dependencies)).toEqual({ ok: false, requestsSent: 6 });
  expect(h.transport).toHaveBeenCalledTimes(6);
  expect(h.rows.at(-1)).toMatchObject({ variant: "actual-app-settings", httpStatus: 503, classification: "SERVICE_UNAVAILABLE" });
  privateOutput(h.rows);
});

it.each([403, 429, 503])("reports Google HTTP %s and stops on the first failure", async status => {
  const h = harness();
  h.transport.mockImplementation(async () => Response.json({ error: { message: `${key} ${marker}` } }, { status }));
  expect(await runGeminiDiagnostic(h.dependencies)).toEqual({ ok: false, requestsSent: 1 });
  expect(h.rows.at(-1)).toMatchObject({ stage: "google-api-request", variant: "minimal-current", httpStatus: status });
  expect(h.transport).toHaveBeenCalledTimes(1);
  privateOutput(h.rows);
});

it.each([
  ["ENOTFOUND", "DNS_LOOKUP_FAILED"], ["ECONNREFUSED", "CONNECTION_REFUSED"],
  ["UND_ERR_CONNECT_TIMEOUT", "TIMEOUT"], ["SELF_SIGNED_CERT_IN_CHAIN", "TLS_CERTIFICATE_FAILED"],
  ["UNKNOWN_PRIVATE_CODE", "GOOGLE_REQUEST_FAILED"],
])("classifies safe nested Google network errors: %s", async (code, category) => {
  const h = harness();
  h.transport.mockRejectedValue(Object.assign(secretError(), { cause: secretError(code) }));
  expect((await runGeminiDiagnostic(h.dependencies)).ok).toBe(false);
  expect(h.rows.at(-1)).toMatchObject({ stage: "google-api-request", classification: category, httpStatus: null, requestsSent: 1 });
  expect(h.transport).toHaveBeenCalledTimes(1);
  privateOutput(h.rows);
});

it("identifies adapter exports and a missing key before sending requests", async () => {
  const h = harness();
  vi.mocked(h.server.ssrLoadModule).mockResolvedValue({});
  expect((await runGeminiDiagnostic(h.dependencies)).ok).toBe(false);
  expect(h.rows).toContainEqual(expect.objectContaining({ classification: "ADAPTER_EXPORT_MISSING" }));
  vi.stubEnv("GEMINI_API_KEY", "");
  const missing = harness();
  expect((await runGeminiDiagnostic(missing.dependencies)).ok).toBe(false);
  expect(missing.rows.at(-1)).toMatchObject({ stage: "environment", classification: "KEY_NOT_LOADED" });
  expect(missing.dependencies.createServer).not.toHaveBeenCalled();
});

it.each([false, true])("runs the checked-in CLI with real Vite/adapter loading from outside the repository; schema comparison=%s", async schemaComparison => {
  const script = fileURLToPath(new URL("../scripts/gemini-diagnostic.ts", import.meta.url));
  const mock = new URL("./helpers/diagnostic-fetch.mjs", import.meta.url).href;
  const { stdout, stderr } = await promisify(execFile)(process.execPath, ["--experimental-strip-types", script, ...(schemaComparison ? ["--schema-compare"] : [])], {
    cwd: tmpdir(),
    env: { ...process.env, GEMINI_API_KEY: "diagnostic-fixture-key", NODE_OPTIONS: `--import=${mock}`, DIAGNOSTIC_FIXTURE_SCHEMA_REJECT: schemaComparison ? "1" : "0" },
    timeout: 30000,
  });
  const rows: DiagnosticRow[] = stdout.trim().split("\n").map(line => JSON.parse(line));
  expect(rows.filter(r => r.classification === "ACCEPTED")).toHaveLength(schemaComparison ? 3 : 6);
  if (schemaComparison) expect(rows).toContainEqual(expect.objectContaining({
    variant: "schema-original", httpStatus: 400, classification: "SCHEMA_REJECTED",
    schema: expect.objectContaining({ rejectedKeywords: ["$schema"] }),
  }));
  expect(rows).toContainEqual(expect.objectContaining({ stage: "adapter-loading", classification: "OK" }));
  expect(rows).toContainEqual(expect.objectContaining({ stage: "request-capture", classification: "OK", requestsSent: 0 }));
  expect(rows.at(-1)?.requestsSent).toBe(schemaComparison ? 4 : 6);
  expect(stdout + stderr).not.toContain("diagnostic-fixture-key");
  expect(stdout + stderr).not.toContain("SECRET_RAW_RESPONSE");
}, 35000);

it("compares original and compatible schemas in four distinct requests and safely identifies a rejected field", async () => {
  const h = harness();
  h.transport.mockImplementation(async (_url, init) => {
    const config = JSON.parse(init.body).generationConfig;
    return config.responseJsonSchema?.$schema
      ? Response.json({ error: { status: "INVALID_ARGUMENT", message: `Unknown name "$schema" ${key} ${marker}` } }, { status: 400 })
      : Response.json({ text: marker });
  });
  expect(await runGeminiDiagnostic({ ...h.dependencies, schemaComparison: true })).toEqual({ ok: true, requestsSent: 4 });
  expect(h.transport).toHaveBeenCalledTimes(4);
  expect(h.rows).toContainEqual(expect.objectContaining({ variant: "schema-original", httpStatus: 400, schemaDetailAvailable: true, schema: { rejectedKeywords: ["$schema"], fieldPaths: [], complexityLimit: false } }));
  expect(h.rows.at(-1)).toMatchObject({ variant: "schema-compatible-full-limit", httpStatus: 200 });
  privateOutput(h.rows);
});

it.each(["credential", "compatible"])("stops schema comparison on a %s failure instead of treating it as an expected original rejection", async failure => {
  const h = harness();
  let calls = 0;
  h.transport.mockImplementation(async () => {
    calls++;
    if (failure === "credential" && calls === 2) return Response.json({ error: { status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] } }, { status: 400 });
    if (failure === "compatible" && calls === 3) return Response.json({ error: { status: "INVALID_ARGUMENT", message: 'Unsupported keyword "items"' } }, { status: 400 });
    return Response.json({});
  });
  const result = await runGeminiDiagnostic({ ...h.dependencies, schemaComparison: true });
  expect(result).toEqual({ ok: false, requestsSent: failure === "credential" ? 2 : 3 });
  privateOutput(h.rows);
});
it("reports missing provider field detail honestly rather than inventing a schema keyword", async () => {
  const h = harness();
  h.transport.mockImplementation(async () => Response.json({ error: { status: "INVALID_ARGUMENT", message: `${key} ${marker}` } }, { status: 400 }));
  expect((await runGeminiDiagnostic(h.dependencies)).ok).toBe(false);
  expect(h.rows.at(-1)).toMatchObject({ httpStatus: 400, schemaDetailAvailable: false });
  expect(h.rows.at(-1)).not.toHaveProperty("schema");
  privateOutput(h.rows);
});
it("distinguishes rejection of the outer request field from an inner schema keyword", async () => {
  const h = harness();
  h.transport.mockImplementation(async () => Response.json({ error: { status: "INVALID_ARGUMENT", message: `Unknown name "response_json_schema" at generation_config ${key}` } }, { status: 400 }));
  expect((await runGeminiDiagnostic(h.dependencies)).ok).toBe(false);
  expect(h.rows.at(-1)).toMatchObject({ classification: "UNSUPPORTED_REQUEST_FIELD", invalidFields: ["responseJsonSchema"], schemaDetailAvailable: false });
  expect(h.rows.at(-1)).not.toHaveProperty("schema");
  privateOutput(h.rows);
});

const controlResource = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite";
it.each([200, 503, 429])("uses one metadata request and one same-key alternate-model control after a minimal 503; control status=%s", async status => {
  const h = harness();
  h.transport.mockImplementation(async (url) => {
    if (url === endpoint) return Response.json({ error: { message: `${key} ${marker}` } }, { status: 503 });
    if (url === controlResource) return Response.json({ name: "models/gemini-3.5-flash-lite", supportedGenerationMethods: ["generateContent"], description: marker });
    return Response.json({ text: marker }, { status });
  });
  expect(await runGeminiDiagnostic({ ...h.dependencies, availabilityComparison: true })).toEqual({ ok: false, requestsSent: 3 });
  expect(h.transport.mock.calls.map(([url]) => url)).toEqual([endpoint, controlResource, `${controlResource}:generateContent`]);
  expect(h.transport.mock.calls[1][1].method).toBe("GET");
  const first = h.transport.mock.calls[0][1];
  const control = h.transport.mock.calls[2][1];
  expect(control.body).toBe(first.body);
  for (const [, init] of h.transport.mock.calls) expect(new Headers(init.headers).get("x-goog-api-key")).toBe(key);
  expect(h.rows.at(-1)).toMatchObject({ model: "gemini-3.5-flash-lite", variant: "alternate-model-minimal", httpStatus: status, requestsSent: 3 });
  expect(h.rows.at(-1)?.profile).toEqual({ requestBytes: Buffer.byteLength(first.body), maxOutputTokens: 32, jsonMode: false, schema: false });
  privateOutput(h.rows);
});

it.each(["missing-method", "http-error", "network"])("stops the alternate-model check when metadata is unusable: %s", async failure => {
  const h = harness();
  h.transport.mockImplementation(async url => {
    if (url === endpoint) return Response.json({}, { status: 503 });
    if (failure === "network") throw secretError("ENOTFOUND");
    if (failure === "http-error") return Response.json({ error: { message: marker } }, { status: 403 });
    return Response.json({ name: "models/gemini-3.5-flash-lite", supportedGenerationMethods: ["embedContent"] });
  });
  expect(await runGeminiDiagnostic({ ...h.dependencies, availabilityComparison: true })).toEqual({ ok: false, requestsSent: 2 });
  expect(h.transport).toHaveBeenCalledTimes(2);
  expect(h.rows).toContainEqual(expect.objectContaining({ variant: "minimal-current", httpStatus: 503 }));
  privateOutput(h.rows);
});

it.each([200, 503])("makes one tiny same-model control after a later 503, not a retry of the failing profile: %s", async status => {
  const h = harness();
  let count = 0;
  h.transport.mockImplementation(async () => Response.json({}, { status: ++count === 4 ? 503 : count === 5 ? status : 200 }));
  expect(await runGeminiDiagnostic({ ...h.dependencies, availabilityComparison: true })).toEqual({ ok: false, requestsSent: 5 });
  expect(h.transport.mock.calls[4][1].body).toBe(h.transport.mock.calls[0][1].body);
  expect(h.transport.mock.calls[4][1].body).not.toBe(h.transport.mock.calls[3][1].body);
  expect(h.rows.at(-1)).toMatchObject({ variant: "minimal-after-failure", httpStatus: status, requestsSent: 5 });
  privateOutput(h.rows);
});

it("keeps the global six-request cap when the full output-cap profile fails", async () => {
  const h = harness();
  let count = 0;
  h.transport.mockImplementation(async () => Response.json({}, { status: ++count === 6 ? 503 : 200 }));
  expect(await runGeminiDiagnostic({ ...h.dependencies, availabilityComparison: true })).toEqual({ ok: false, requestsSent: 6 });
  expect(h.transport).toHaveBeenCalledTimes(6);
  expect(h.rows.at(-1)).toMatchObject({ variant: "actual-app-settings", httpStatus: 503, profile: { maxOutputTokens: 16384, schema: true, jsonMode: true } });
  privateOutput(h.rows);
});

it.each(["120", new Date(Date.now() + 120000).toUTCString()])("honors Retry-After by stopping without another request: %s", async delay => {
  const h = harness();
  h.transport.mockImplementation(async () => Response.json({}, { status: 503, headers: { "Retry-After": delay } }));
  expect(await runGeminiDiagnostic({ ...h.dependencies, availabilityComparison: true })).toEqual({ ok: false, requestsSent: 1 });
  expect(h.transport).toHaveBeenCalledTimes(1);
  expect(h.rows.at(-1)?.retryAfterSeconds).toBeGreaterThan(0);
  privateOutput(h.rows);
});

it("rejects conflicting diagnostic modes before setup or network requests", async () => {
  const h = harness();
  expect(await runGeminiDiagnostic({ ...h.dependencies, schemaComparison: true, availabilityComparison: true })).toEqual({ ok: false, requestsSent: 0 });
  expect(h.rows.at(-1)?.classification).toBe("OPTIONS_CONFLICT");
  expect(h.dependencies.loadEnvironment).not.toHaveBeenCalled();
  expect(h.transport).not.toHaveBeenCalled();
});

it("runs the real availability CLI with mocked first-model failure and alternate-model success", async () => {
  const script = fileURLToPath(new URL("../scripts/gemini-diagnostic.ts", import.meta.url));
  const mock = new URL("./helpers/diagnostic-fetch.mjs", import.meta.url).href;
  const result = await promisify(execFile)(process.execPath, ["--experimental-strip-types", script, "--availability"], {
    cwd: tmpdir(), timeout: 30000,
    env: { ...process.env, GEMINI_API_KEY: "diagnostic-fixture-key", NODE_OPTIONS: `--import=${mock}`, DIAGNOSTIC_FIXTURE_AVAILABILITY: "1", DIAGNOSTIC_FIXTURE_SCHEMA_REJECT: "0" },
  }).then(value => ({ ...value, code: 0 })).catch(error => ({ stdout: String(error.stdout || ""), stderr: String(error.stderr || ""), code: error.code }));
  expect(result.code).toBe(1); // The original model remains unavailable.
  const rows: DiagnosticRow[] = result.stdout.trim().split("\n").map(line => JSON.parse(line));
  expect(rows).toContainEqual(expect.objectContaining({ variant: "minimal-current", httpStatus: 503 }));
  expect(rows.at(-1)).toMatchObject({ variant: "alternate-model-minimal", httpStatus: 200, requestsSent: 3 });
  expect(result.stdout + result.stderr).not.toContain("diagnostic-fixture-key");
  expect(result.stdout + result.stderr).not.toContain("SECRET_RAW_RESPONSE");
}, 35000);
