import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent";
type Stage = "environment" | "vite-setup" | "adapter-loading" | "request-capture" | "payload-validation" | "vite-cleanup" | "google-api-request" | "google-response";
export interface DiagnosticRow {
  stage: Stage;
  httpStatus: number | null;
  classification: string;
  requestsSent: number;
  variant?: string;
}
interface Provider {
  generate(brief: { title: string; topic: string; format: string; language: string; duration: number }): Promise<unknown>;
}
interface AdapterModule { GeminiProvider: new (model: string) => Provider }
export interface DiagnosticServer {
  ssrLoadModule(path: string): Promise<unknown>;
  close(): Promise<void>;
}
interface Dependencies {
  report?: (row: DiagnosticRow) => void;
  loadEnvironment?: () => Promise<void>;
  createServer?: () => Promise<DiagnosticServer>;
  transport?: typeof fetch;
}

/** Classify only allowlisted codes/names. Never return messages or stacks. */
export function safeCategory(error: unknown, fallback: string): string {
  const codes: Record<string, string> = {
    ENOSPC: "FILE_WATCH_LIMIT", EMFILE: "FILE_DESCRIPTOR_LIMIT",
    EADDRINUSE: "PORT_IN_USE", EACCES: "PERMISSION_DENIED", EPERM: "PERMISSION_DENIED",
    ENOENT: "FILE_NOT_FOUND", ERR_MODULE_NOT_FOUND: "MODULE_NOT_FOUND",
    MODULE_NOT_FOUND: "MODULE_NOT_FOUND", ERR_PACKAGE_PATH_NOT_EXPORTED: "MODULE_EXPORT_UNAVAILABLE",
    ENOTFOUND: "DNS_LOOKUP_FAILED", EAI_AGAIN: "DNS_LOOKUP_FAILED",
    ECONNREFUSED: "CONNECTION_REFUSED", ECONNRESET: "CONNECTION_RESET",
    ETIMEDOUT: "TIMEOUT", UND_ERR_CONNECT_TIMEOUT: "TIMEOUT",
    UND_ERR_HEADERS_TIMEOUT: "TIMEOUT", UND_ERR_BODY_TIMEOUT: "TIMEOUT",
    CERT_HAS_EXPIRED: "TLS_CERTIFICATE_FAILED", DEPTH_ZERO_SELF_SIGNED_CERT: "TLS_CERTIFICATE_FAILED",
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: "TLS_CERTIFICATE_FAILED",
    SELF_SIGNED_CERT_IN_CHAIN: "TLS_CERTIFICATE_FAILED",
    ERR_TLS_CERT_ALTNAME_INVALID: "TLS_CERTIFICATE_FAILED",
  };
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const value = current as { code?: unknown; name?: unknown; cause?: unknown };
    if (typeof value.code === "string" && Object.hasOwn(codes, value.code)) return codes[value.code];
    if (value.name === "TimeoutError" || value.name === "AbortError") return "TIMEOUT";
    if (value.name === "SyntaxError") return "SYNTAX_ERROR";
    current = value.cause;
  }
  return fallback;
}

async function environment() {
  const module = await import("@next/env");
  module.default.loadEnvConfig(ROOT, true, { info() {}, error() {} });
}
async function viteServer(): Promise<DiagnosticServer> {
  const { createServer } = await import("vite");
  return createServer({
    root: ROOT, configFile: false, envFile: false, logLevel: "silent", appType: "custom",
    // A one-shot capture needs no file watcher, socket listener or dependency scan.
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
}

export async function runGeminiDiagnostic(dependencies: Dependencies = {}) {
  const output = dependencies.report || ((row: DiagnosticRow) => console.log(JSON.stringify(row)));
  const originalFetch = globalThis.fetch;
  const transport = dependencies.transport || originalFetch;
  let stage: Stage = "environment";
  let requestsSent = 0;
  const report = (classification: string, httpStatus: number | null = null, variant?: string) =>
    output({ stage, httpStatus, classification, requestsSent, ...(variant ? { variant } : {}) });
  const begin = (next: Stage) => { stage = next; report("STARTED"); };
  let server: DiagnosticServer | undefined;
  let captured: { url: string; init: RequestInit } | undefined;
  let captures = 0;
  let unexpectedSetupFetch = false;
  let app: { contents: unknown; generationConfig: Record<string, unknown> } | undefined;
  let ready = false;
  let cleanupOk = true;
  const fail = () => ({ ok: false, requestsSent });
  try {
    begin("environment");
    await (dependencies.loadEnvironment || environment)();
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) { report("KEY_NOT_LOADED"); return fail(); }
    report("OK");
    // No adapter or Vite setup fetch may escape to the network. Capture only
    // during generate(), and retain no raw errors in diagnostic output.
    globalThis.fetch = async (input, init) => {
      if (stage !== "request-capture") {
        unexpectedSetupFetch = true;
        throw new Error("Blocked setup fetch");
      }
      captures++;
      captured = { url: typeof input === "string" ? input : input instanceof URL ? input.href : input.url, init: init || {} };
      return Response.json({ error: { status: "INVALID_ARGUMENT" } }, { status: 400 });
    };
    begin("vite-setup");
    server = await (dependencies.createServer || viteServer)();
    report("OK");
    begin("adapter-loading");
    const adapter = await server.ssrLoadModule("/src/lib/providers/gemini.ts") as Partial<AdapterModule> | null;
    if (unexpectedSetupFetch) { report("UNEXPECTED_SETUP_FETCH_BLOCKED"); return fail(); }
    if (typeof adapter?.GeminiProvider !== "function") { report("ADAPTER_EXPORT_MISSING"); return fail(); }
    report("OK");
    begin("request-capture");
    try {
      await new adapter.GeminiProvider("gemini-3.1-flash-lite").generate({
        title: "Study desk ideas", topic: "Three ways to organize a study desk",
        format: "short", language: "en", duration: 60,
      });
    } catch (error) {
      // Exactly one intercepted request and the intentional synthetic HTTP 400
      // are expected. A rejection before capture is a setup failure.
      if (!captured) { report(safeCategory(error, "CAPTURE_GENERATION_FAILED")); return fail(); }
    }
    if (!captured) { report("CAPTURE_NO_REQUEST"); return fail(); }
    if (captures !== 1) { report("CAPTURE_MULTIPLE_REQUESTS"); return fail(); }
    report("OK");
    begin("payload-validation");
    const headers = new Headers(captured.init.headers);
    if (captured.url !== ENDPOINT || captured.init.method !== "POST") {
      report("CAPTURE_ENDPOINT_MISMATCH"); return fail();
    }
    if (headers.get("x-goog-api-key") !== key) { report("CAPTURE_KEY_MISMATCH"); return fail(); }
    if (typeof captured.init.body !== "string") { report("CAPTURE_BODY_INVALID"); return fail(); }
    app = JSON.parse(captured.init.body);
    if (!app || !Array.isArray(app.contents) || !app.contents.length ||
      !app.generationConfig?.responseJsonSchema ||
      app.generationConfig.responseMimeType !== "application/json" ||
      !Number.isInteger(app.generationConfig.maxOutputTokens) ||
      typeof app.generationConfig.temperature !== "number") {
      report("CAPTURE_PAYLOAD_INVALID"); return fail();
    }
    report("OK");
    ready = true;
  } catch (error) {
    const fallback = {
      environment: "ENVIRONMENT_LOAD_FAILED", "vite-setup": "VITE_SETUP_FAILED",
      "adapter-loading": "ADAPTER_LOAD_FAILED", "request-capture": "CAPTURE_FAILED",
      "payload-validation": "CAPTURE_PAYLOAD_INVALID",
    }[stage as "environment" | "vite-setup" | "adapter-loading" | "request-capture" | "payload-validation"];
    report(safeCategory(error, fallback));
  } finally {
    globalThis.fetch = originalFetch;
    if (server) {
      begin("vite-cleanup");
      try { await server.close(); report("OK"); }
      catch (error) { cleanupOk = false; report(safeCategory(error, "VITE_CLEANUP_FAILED")); }
    }
  }
  if (!ready || !cleanupOk || !app || !captured) return fail();
  const requestApp = app;
  const config = requestApp.generationConfig;
  const variant = (extra: Record<string, unknown>) => ({
    contents: requestApp.contents, generationConfig: { maxOutputTokens: 32, ...extra },
  });
  const comparisons = [
    ["minimal-current", { contents: [{ role: "user", parts: [{ text: "Reply with OK." }] }], generationConfig: { maxOutputTokens: 32 } }],
    ["app-prompt", variant({})],
    ["temperature", variant({ temperature: config.temperature })],
    ["json-mode", variant({ temperature: config.temperature, responseMimeType: config.responseMimeType })],
    ["json-schema", variant({ ...config, maxOutputTokens: 32 })],
    ["actual-app-settings", requestApp],
  ] as const;
  // Independent hard cap, no retries, and stop on the first failed comparison.
  for (const [name, payload] of comparisons.slice(0, 6)) {
    if (requestsSent >= 6) return fail();
    stage = "google-api-request";
    report("STARTED", null, name);
    let response: Response;
    try {
      requestsSent++;
      response = await transport(ENDPOINT, {
        method: "POST", cache: "no-store", redirect: "error",
        headers: captured.init.headers,
        body: JSON.stringify(payload), signal: AbortSignal.timeout(60000),
      });
    } catch (error) {
      report(safeCategory(error, "GOOGLE_REQUEST_FAILED"), null, name);
      return fail();
    }
    const category = response.ok ? "ACCEPTED" : ({
      400: "INVALID_REQUEST_OR_CREDENTIAL", 401: "AUTHENTICATION_REJECTED",
      403: "ACCESS_REJECTED", 404: "MODEL_OR_RESOURCE_NOT_FOUND",
      429: "QUOTA_OR_RATE_LIMIT", 503: "SERVICE_UNAVAILABLE",
    } as Record<number, string>)[response.status] || "OTHER_HTTP_FAILURE";
    report(category, response.status, name);
    try { await response.body?.cancel(); }
    catch (error) {
      stage = "google-response";
      report(safeCategory(error, "RESPONSE_CLEANUP_FAILED"), response.status, name);
      return fail();
    }
    if (!response.ok) return fail();
  }
  return { ok: true, requestsSent };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  let last: DiagnosticRow = { stage: "environment", httpStatus: null, classification: "STARTED", requestsSent: 0 };
  const output = (row: DiagnosticRow) => { last = row; console.log(JSON.stringify(row)); };
  runGeminiDiagnostic({ report: output }).then(result => { process.exitCode = result.ok ? 0 : 1; }).catch(error => {
    // Even an unexpected diagnostic failure retains the last known phase.
    output({ ...last, classification: safeCategory(error, "INTERNAL_DIAGNOSTIC_FAILURE") });
    process.exitCode = 1;
  });
}
