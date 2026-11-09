import { AppError } from "../errors";
import { schemaRejection, type GeminiSchemaRejection } from "./gemini-schema-error";
export const GEMINI_API_VERSION = "v1beta";
export const GEMINI_API = `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}`;
// Reviewed against Google's Standard (not Batch) pricing on 2026-11-08.
// https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-lite
// Listing models does NOT establish billing status or remaining free quota.
export const FREE_TIER_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
] as const;
export function configuredGeminiModel(override?: string): string {
  const id = (override || process.env.GEMINI_MODEL || "gemini-2.5-flash")
    .trim()
    .replace(/^models\//, "");
  if (!/^[a-zA-Z0-9._-]{1,120}$/.test(id) || id.startsWith("AIza"))
    throw new AppError(
      503,
      "GEMINI_MODEL must be a model ID (optionally prefixed models/), not a URL.",
    );
  return id;
}
export function hasKnownFreeTier(id: string) {
  return (FREE_TIER_MODELS as readonly string[]).includes(id);
}
export function requireFreeTierModel(id: string) {
  if (!hasKnownFreeTier(id))
    throw new AppError(
      503,
      "This model has no verified free-tier entry in this app. Discover available models and explicitly choose a documented free-tier model, or use Demo. No paid-only model was requested.",
    );
}
export function geminiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key)
    throw new AppError(
      503,
      "GEMINI_API_KEY is missing on the server. Allow this repository to use your Codespaces secret and reload the server environment.",
    );
  return key;
}
export interface GeminiRequestContext {
  savedModelId: string | null;
  selectedModelId: string;
  modelSource: "saved selection" | "GEMINI_MODEL" | "default";
  apiVersion: typeof GEMINI_API_VERSION;
  requestPath: string;
}
/** Resolve once; only reviewed IDs may appear in request diagnostics. */
export function geminiRequestContext(savedModel?: string): GeminiRequestContext {
  const model = configuredGeminiModel(savedModel);
  requireFreeTierModel(model);
  return {
    // Preserve the stored value, including an optional models/ prefix, so it
    // can be compared with the normalized ID actually used in the URL.
    savedModelId: savedModel ?? null,
    selectedModelId: model,
    modelSource: savedModel
      ? "saved selection"
      : process.env.GEMINI_MODEL
        ? "GEMINI_MODEL"
        : "default",
    apiVersion: GEMINI_API_VERSION,
    requestPath: `/${GEMINI_API_VERSION}/models/${model}:generateContent`,
  };
}
export interface GeminiDiagnostic {
  operation: string;
  upstreamHttpStatus: number;
  apiStatus: string | null;
  apiReason: string | null;
  reason: string;
  invalidFields: string[];
  apiVersion: typeof GEMINI_API_VERSION;
  requestPath: string | null;
  request?: GeminiRequestContext;
  schema?: GeminiSchemaRejection;
  payload?: {
    requestBytes: number;
    promptBytes: number;
    schemaBytes: number;
    maxOutputTokens: number;
    responseMimeType: string;
    temperature: number;
  };
  modelDiscovery?: {
    supportsGenerateContent: boolean | null;
    upstreamHttpStatus: number | null;
  };
}
export class GeminiApiError extends AppError {
  constructor(
    message: string,
    public readonly diagnostic: GeminiDiagnostic,
  ) {
    super(
      diagnostic.upstreamHttpStatus === 429 ? 429 : 502,
      `Gemini HTTP ${diagnostic.upstreamHttpStatus}${diagnostic.apiStatus ? ` ${diagnostic.apiStatus}` : ""}: ${message}`,
    );
  }
}
export async function apiError(
  response: Response,
  operation: "models.list" | "generateContent",
  request?: GeminiRequestContext,
): Promise<GeminiApiError> {
  let payload: any;
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  const statuses = [
    "INVALID_ARGUMENT",
    "NOT_FOUND",
    "PERMISSION_DENIED",
    "UNAUTHENTICATED",
    "RESOURCE_EXHAUSTED",
    "FAILED_PRECONDITION",
    "UNAVAILABLE",
    "INTERNAL",
    "DEADLINE_EXCEEDED",
  ];
  const apiStatus = statuses.includes(payload?.error?.status)
    ? payload.error.status
    : null;
  const safeReasons = [
    "API_KEY_INVALID",
    "API_KEY_EXPIRED",
    "API_KEY_SERVICE_BLOCKED",
    "API_KEY_HTTP_REFERRER_BLOCKED",
    "API_KEY_IP_ADDRESS_BLOCKED",
    "BILLING_DISABLED",
    "SERVICE_DISABLED",
    "CONSUMER_INVALID",
    "RATE_LIMIT_EXCEEDED",
    "QUOTA_EXCEEDED",
    "LOCATION_POLICY_VIOLATED",
  ];
  const apiReason = Array.isArray(payload?.error?.details)
    ? payload.error.details
        .map((d: { reason?: string }) => d?.reason)
        .find(
          (reason: unknown) =>
            typeof reason === "string" && safeReasons.includes(reason),
        ) || null
    : null;
  // Use raw text only for classification. Never echo it, error details, prompts,
  // tokens, metadata or credentials. Provider messages can contain secret values.
  const raw =
    typeof payload?.error?.message === "string" ? payload.error.message : "";
  const knownFields = [
    "responseJsonSchema",
    "responseSchema",
    "responseMimeType",
    "maxOutputTokens",
    "temperature",
  ];
  const fields = knownFields.filter(
    (field) =>
      raw.includes(field) ||
      raw.includes(field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)),
  );
  const schema = schemaRejection(payload);
  let reason = "API_FAILURE",
    message = "The API request failed. Retry later or select Demo.";
  if (response.status === 429) {
    reason = "QUOTA_LIMIT";
    message =
      "Quota or rate limit reached. Wait and retry or select Demo. No billing was enabled.";
  } else if ([401, 403].includes(response.status)) {
    reason = "ACCESS_DENIED";
    message =
      "API key or project access rejected. Check key restrictions and account eligibility.";
  } else if (response.status === 404) {
    reason = "MODEL_NOT_FOUND";
    message =
      "The requested model or API resource was not found. Discover models available to this key; no alternate model was selected.";
  } else if (
    response.status === 400 &&
    ["API_KEY_INVALID", "API_KEY_EXPIRED"].includes(apiReason || "")
  ) {
    reason = "ACCESS_DENIED";
    message =
      "The API reports an invalid or expired credential. Model selection does not change your key; check its project access in AI Studio.";
  } else if (response.status === 400) {
    if (schema) reason = schema.complexityLimit ? "SCHEMA_COMPLEXITY_LIMIT" : "SCHEMA_REJECTED";
    else reason = fields.length && /unknown|unsupported|not supported|invalid json/i.test(raw)
      ? "UNSUPPORTED_REQUEST_FIELD" : "INVALID_REQUEST";
    message = schema
      ? "The API rejected the output schema. Check the safe schema keyword/path diagnostic. Your saved script is preserved."
      : reason === "UNSUPPORTED_REQUEST_FIELD"
        ? `The API rejected request fields: ${fields.join(", ")}. Model availability alone will not repair this request format.`
        : "The API rejected the generation parameters. This is a bad-request response, not proof that the model is missing. Check the selected model and supported request format.";
  } else if (response.status >= 500) {
    reason = "SERVICE_UNAVAILABLE";
    message =
      "The service is temporarily unavailable. Retry later or select Demo.";
  }
  return new GeminiApiError(message, {
    operation,
    upstreamHttpStatus: response.status,
    apiStatus,
    apiReason,
    reason,
    invalidFields: fields,
    apiVersion: GEMINI_API_VERSION,
    requestPath:
      request?.requestPath ||
      (operation === "models.list" ? `/${GEMINI_API_VERSION}/models` : null),
    ...(request ? { request } : {}),
    ...(response.status === 400 && schema && reason !== "ACCESS_DENIED" ? { schema } : {}),
  });
}
export interface AvailableGeminiModel {
  id: string;
  freeTierDocumented: boolean;
}
export async function listGeminiModels(
  key: string = geminiKey(),
): Promise<AvailableGeminiModel[]> {
  const signal = AbortSignal.timeout(15000);
  const seen = new Set<string>();
  const result = new Map<string, AvailableGeminiModel>();
  let token = "";
  for (let page = 0; page < 10; page++) {
    const url = new URL(`${GEMINI_API}/models`);
    url.searchParams.set("pageSize", "1000");
    if (token) url.searchParams.set("pageToken", token);
    let response: Response;
    try {
      response = await fetch(url.href, {
        headers: { "x-goog-api-key": key },
        cache: "no-store",
        redirect: "error",
        signal,
      });
    } catch {
      throw new AppError(
        502,
        "Gemini model discovery could not connect or timed out. No model or key was changed.",
      );
    }
    if (!response.ok) throw await apiError(response, "models.list");
    let data;
    try {
      data = await response.json();
    } catch {
      throw new AppError(502, "Gemini returned unreadable model metadata.");
    }
    if (!Array.isArray(data?.models))
      throw new AppError(502, "Gemini returned invalid model metadata.");
    for (const m of data.models) {
      if (
        !Array.isArray(m?.supportedGenerationMethods) ||
        !m.supportedGenerationMethods.includes("generateContent") ||
        typeof m.name !== "string" ||
        !/^models\/[a-zA-Z0-9._-]{1,120}$/.test(m.name) ||
        m.name.includes(key)
      )
        continue;
      const id = m.name.slice(7);
      result.set(id, { id, freeTierDocumented: hasKnownFreeTier(id) });
    }
    if (!data.nextPageToken)
      return [...result.values()].sort((a, b) => a.id.localeCompare(b.id));
    if (typeof data.nextPageToken !== "string" || seen.has(data.nextPageToken))
      throw new AppError(
        502,
        "Gemini model discovery returned an invalid page sequence.",
      );
    token = data.nextPageToken;
    seen.add(token);
  }
  throw new AppError(
    502,
    "Gemini model discovery exceeded its page limit. No partial recommendation was made.",
  );
}
