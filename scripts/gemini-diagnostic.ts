import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { GeminiSchemaRejection } from "../src/lib/providers/gemini-schema-error";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent";
// Diagnostic control only, not an application provider/default/fallback.
// Standard text free tier verified 2026-11-08:
// https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite
const CONTROL_MODEL = "gemini-3.5-flash-lite";
const CONTROL_RESOURCE = `https://generativelanguage.googleapis.com/v1beta/models/${CONTROL_MODEL}`;
type Stage = "environment" | "vite-setup" | "adapter-loading" | "request-capture" | "payload-validation" | "vite-cleanup" | "google-api-request" | "google-response" | "google-model-metadata";
export interface DiagnosticRow {
  stage: Stage;
  httpStatus: number | null;
  classification: string;
  requestsSent: number;
  variant?: string;
  schema?: GeminiSchemaRejection;
  schemaDetailAvailable?: boolean;
  invalidFields?: string[];
  model?: string;
  profile?: { requestBytes: number; maxOutputTokens: number | null; jsonMode: boolean; schema: boolean };
  elapsedMs?: number;
  retryAfterSeconds?: number;
}
interface Provider {
  generate(brief: { title: string; topic: string; format: string; language: string; duration: number }): Promise<unknown>;
}
interface AdapterModule {
  GeminiProvider: new (model: string) => Provider;
  apiError?: (response: Response, operation: "generateContent") => Promise<{ diagnostic: { reason: string; schema?: GeminiSchemaRejection; invalidFields?: string[] } }>;
  validationJsonSchema?: unknown;
}
export interface DiagnosticServer {
  ssrLoadModule(path: string): Promise<unknown>;
  close(): Promise<void>;
}
interface Dependencies {
  report?: (row: DiagnosticRow) => void;
  loadEnvironment?: () => Promise<void>;
  createServer?: () => Promise<DiagnosticServer>;
  transport?: typeof fetch;
  schemaComparison?: boolean;
  availabilityComparison?: boolean;
}

const httpCategory = (response: Response) => response.ok ? "ACCEPTED" : ({
  400: "INVALID_REQUEST_OR_CREDENTIAL", 401: "AUTHENTICATION_REJECTED",
  403: "ACCESS_REJECTED", 404: "MODEL_OR_RESOURCE_NOT_FOUND",
  429: "QUOTA_OR_RATE_LIMIT", 503: "SERVICE_UNAVAILABLE",
} as Record<number, string>)[response.status] || "OTHER_HTTP_FAILURE";
function retryAfter(response: Response): number | undefined {
  const raw = response.headers.get("retry-after");
  if (raw && /^\d{1,9}$/.test(raw) && Number(raw) > 0) return Number(raw);
  if (raw && /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), /.test(raw)) {
    const seconds = Math.ceil((Date.parse(raw) - Date.now()) / 1000);
    if (Number.isFinite(seconds) && seconds > 0) return seconds;
  }
}
function profile(payload: unknown): NonNullable<DiagnosticRow["profile"]> {
  const config = (payload as { generationConfig?: Record<string, unknown> }).generationConfig;
  return {
    requestBytes: Buffer.byteLength(JSON.stringify(payload)),
    maxOutputTokens: typeof config?.maxOutputTokens === "number" ? config.maxOutputTokens : null,
    jsonMode: config?.responseMimeType === "application/json",
    schema: !!config?.responseJsonSchema,
  };
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
  const report = (classification: string, httpStatus: number | null = null, variant?: string,
    details?: Partial<Pick<DiagnosticRow, "schema" | "schemaDetailAvailable" | "invalidFields" | "model" | "profile" | "elapsedMs" | "retryAfterSeconds">>) =>
    output({ stage, httpStatus, classification, requestsSent, ...(variant ? { variant } : {}), ...details });
  const begin = (next: Stage) => { stage = next; report("STARTED"); };
  let server: DiagnosticServer | undefined;
  let captured: { url: string; init: RequestInit } | undefined;
  let captures = 0;
  let unexpectedSetupFetch = false;
  let app: { contents: unknown; generationConfig: Record<string, unknown> } | undefined;
  let ready = false;
  let cleanupOk = true;
  let describeError: AdapterModule["apiError"];
  let validationSchema: unknown;
  const fail = () => ({ ok: false, requestsSent });
  try {
    begin("environment");
    if (dependencies.schemaComparison && dependencies.availabilityComparison) {
      report("OPTIONS_CONFLICT"); return fail();
    }
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
    describeError = adapter.apiError;
    validationSchema = adapter.validationJsonSchema;
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
    if (dependencies.schemaComparison && (!validationSchema || typeof validationSchema !== "object")) {
      report("CAPTURE_REFERENCE_SCHEMA_MISSING"); return fail();
    }
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
  const comparisons = dependencies.schemaComparison ? [
    ["json-mode-control", variant({ temperature: config.temperature, responseMimeType: config.responseMimeType })],
    ["schema-original", variant({ ...config, responseJsonSchema: validationSchema, maxOutputTokens: 32 })],
    ["schema-compatible", variant({ ...config, maxOutputTokens: 32 })],
    ["schema-compatible-full-limit", requestApp],
  ] as const : [
    ["minimal-current", { contents: [{ role: "user", parts: [{ text: "Reply with OK." }] }], generationConfig: { maxOutputTokens: 32 } }],
    ["app-prompt", variant({})],
    ["temperature", variant({ temperature: config.temperature })],
    ["json-mode", variant({ temperature: config.temperature, responseMimeType: config.responseMimeType })],
    ["json-schema", variant({ ...config, maxOutputTokens: 32 })],
    ["actual-app-settings", requestApp],
  ] as const;
  // Availability probes share the same global six-HTTP-request counter,
  // including the optional metadata GET. They never retry a failing payload.
  const availabilityProbe = async (name: string, url: string, payload?: unknown): Promise<Response | undefined> => {
    if (requestsSent >= 6) return;
    stage = payload ? "google-api-request" : "google-model-metadata";
    const model = url.startsWith(CONTROL_RESOURCE) ? CONTROL_MODEL : "gemini-3.1-flash-lite";
    const details = { model, ...(payload ? { profile: profile(payload) } : {}) };
    report("STARTED", null, name, details);
    const started = Date.now();
    try {
      requestsSent++;
      const response = await transport(url, {
        method: payload ? "POST" : "GET", cache: "no-store", redirect: "error",
        headers: captured!.init.headers,
        ...(payload ? { body: JSON.stringify(payload) } : {}),
        signal: AbortSignal.timeout(payload ? 60000 : 15000),
      });
      report(httpCategory(response), response.status, name, { ...details, elapsedMs: Date.now() - started, retryAfterSeconds: retryAfter(response) });
      return response;
    } catch (error) {
      report(safeCategory(error, "GOOGLE_REQUEST_FAILED"), null, name, { ...details, elapsedMs: Date.now() - started });
    }
  };
  const availabilityFollowup = async (name: string) => {
    const minimal = comparisons[0][1];
    if (name === "minimal-current") {
      const metadata = await availabilityProbe("alternate-model-metadata", CONTROL_RESOURCE);
      if (!metadata) return;
      if (!metadata.ok) { await metadata.body?.cancel().catch(() => {}); return; }
      let model;
      try { model = await metadata.json(); }
      catch { report("MODEL_METADATA_UNREADABLE", 200, "alternate-model-metadata"); return; }
      if (model?.name !== `models/${CONTROL_MODEL}` || !Array.isArray(model.supportedGenerationMethods) ||
          !model.supportedGenerationMethods.includes("generateContent")) {
        report("CONTROL_MODEL_NOT_ELIGIBLE", 200, "alternate-model-metadata"); return;
      }
      const response = await availabilityProbe("alternate-model-minimal", `${CONTROL_RESOURCE}:generateContent`, minimal);
      await response?.body?.cancel().catch(() => {});
    } else if (requestsSent < 6) {
      const response = await availabilityProbe("minimal-after-failure", ENDPOINT, minimal);
      await response?.body?.cancel().catch(() => {});
    }
  };
  // Independent hard cap, no retries, and stop on the first failed comparison.
  for (const [name, payload] of comparisons.slice(0, 6)) {
    if (requestsSent >= 6) return fail();
    stage = "google-api-request";
    const details = dependencies.availabilityComparison
      ? { model: "gemini-3.1-flash-lite", profile: profile(payload) } : {};
    report("STARTED", null, name, details);
    let response: Response;
    const started = Date.now();
    try {
      requestsSent++;
      response = await transport(ENDPOINT, {
        method: "POST", cache: "no-store", redirect: "error",
        headers: captured.init.headers,
        body: JSON.stringify(payload), signal: AbortSignal.timeout(60000),
      });
    } catch (error) {
      report(safeCategory(error, "GOOGLE_REQUEST_FAILED"), null, name, dependencies.availabilityComparison ? { ...details, elapsedMs: Date.now() - started } : undefined);
      return fail();
    }
    let failureReason: string | undefined;
    let schema: GeminiSchemaRejection | undefined;
    let invalidFields: string[] = [];
    if (response.status === 400 && describeError) {
      try {
        const described = await describeError(response.clone(), "generateContent");
        failureReason = described.diagnostic.reason;
        schema = described.diagnostic.schema;
        invalidFields = (described.diagnostic.invalidFields || []).filter(field =>
          ["responseJsonSchema", "responseSchema", "responseMimeType", "maxOutputTokens", "temperature"].includes(field));
      } catch {
        stage = "google-response";
        report("ERROR_DETAILS_UNREADABLE", response.status, name);
        await response.body?.cancel().catch(() => {});
        return fail();
      }
    }
    let category = httpCategory(response);
    if (failureReason && ["SCHEMA_REJECTED", "SCHEMA_COMPLEXITY_LIMIT", "UNSUPPORTED_REQUEST_FIELD", "ACCESS_DENIED"].includes(failureReason)) category = failureReason;
    report(category, response.status, name, {
      ...details,
      ...(dependencies.availabilityComparison ? { elapsedMs: Date.now() - started, retryAfterSeconds: retryAfter(response) } : {}),
      ...(response.status === 400 ? { ...(schema ? { schema } : {}), schemaDetailAvailable: !!schema, invalidFields } : {}),
    });
    try { await response.body?.cancel(); }
    catch (error) {
      stage = "google-response";
      report(safeCategory(error, "RESPONSE_CLEANUP_FAILED"), response.status, name);
      return fail();
    }
    if (dependencies.availabilityComparison && response.status === 503) {
      // Respect an explicit provider cooldown; do not wait/retry automatically.
      if (!retryAfter(response)) await availabilityFollowup(name);
      return fail();
    }
    // An opt-in, bounded schema comparison deliberately contrasts one legacy
    // 400 with the compatible schema. This is not a retry of the same payload.
    const expectedLegacyRejection = dependencies.schemaComparison && name === "schema-original" &&
      response.status === 400 && failureReason !== "ACCESS_DENIED";
    if (!response.ok && !expectedLegacyRejection) return fail();
  }
  return { ok: true, requestsSent };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  let last: DiagnosticRow = { stage: "environment", httpStatus: null, classification: "STARTED", requestsSent: 0 };
  const output = (row: DiagnosticRow) => { last = row; console.log(JSON.stringify(row)); };
  runGeminiDiagnostic({ report: output, schemaComparison: process.argv.includes("--schema-compare"),
    availabilityComparison: process.argv.includes("--availability") })
    .then(result => { process.exitCode = result.ok ? 0 : 1; }).catch(error => {
    // Even an unexpected diagnostic failure retains the last known phase.
    output({ ...last, classification: safeCategory(error, "INTERNAL_DIAGNOSTIC_FAILURE") });
    process.exitCode = 1;
  });
}
