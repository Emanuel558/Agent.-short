import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { runGeminiDiagnostic, type DiagnosticRow, type DiagnosticServer } from "../scripts/gemini-diagnostic";

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
  return { GeminiProvider: class {
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

it("runs the checked-in CLI with real Vite/adapter loading from outside the repository", async () => {
  const script = fileURLToPath(new URL("../scripts/gemini-diagnostic.ts", import.meta.url));
  const mock = new URL("./helpers/diagnostic-fetch.mjs", import.meta.url).href;
  const { stdout, stderr } = await promisify(execFile)(process.execPath, ["--experimental-strip-types", script], {
    cwd: tmpdir(),
    env: { ...process.env, GEMINI_API_KEY: "diagnostic-fixture-key", NODE_OPTIONS: `--import=${mock}` },
    timeout: 30000,
  });
  const rows: DiagnosticRow[] = stdout.trim().split("\n").map(line => JSON.parse(line));
  expect(rows.filter(r => r.classification === "ACCEPTED")).toHaveLength(6);
  expect(rows).toContainEqual(expect.objectContaining({ stage: "adapter-loading", classification: "OK" }));
  expect(rows).toContainEqual(expect.objectContaining({ stage: "request-capture", classification: "OK", requestsSent: 0 }));
  expect(rows.at(-1)?.requestsSent).toBe(6);
  expect(stdout + stderr).not.toContain("diagnostic-fixture-key");
  expect(stdout + stderr).not.toContain("SECRET_RAW_RESPONSE");
}, 35000);
