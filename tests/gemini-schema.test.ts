import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { geminiResponseJsonSchema } from "../src/lib/providers/gemini-schema";
import { responseJsonSchema, parseGenerated } from "../src/lib/providers/output";
import { schemaRejection } from "../src/lib/providers/gemini-schema-error";
import { apiError } from "../src/lib/providers/gemini-api";
import { GeminiProvider } from "../src/lib/providers/gemini";
import { handle } from "../src/lib/http";

const key = "private-schema-test-key";
const brief = { title: "Creative ideas", topic: "Organizing a study desk", language: "en" as const, format: "short" as const, duration: 60 };
const scene = { heading: "An original idea", narration: "Begin with a new question and develop your own story.", visual: "Record your own notes.", duration: 60 };
const forbidden = new Set(["$schema", "minLength", "maxLength", "minItems", "maxItems", "minimum", "maximum"]);
function keywords(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const node = value as Record<string, unknown>;
  return [...Object.keys(node),
    ...Object.values((node.properties || {}) as object).flatMap(keywords),
    ...(node.items ? keywords(node.items) : [])];
}
beforeEach(() => vi.stubEnv("GEMINI_API_KEY", key));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("projects the validation document to Gemini's structural subset, keeping required fields and closed objects", () => {
  expect(keywords(responseJsonSchema)).toContain("$schema");
  expect(keywords(responseJsonSchema)).toContain("maxLength");
  expect(keywords(geminiResponseJsonSchema).filter(key => forbidden.has(key))).toEqual([]);
  expect(new Set(keywords(geminiResponseJsonSchema))).toEqual(new Set(["type", "properties", "items", "required", "additionalProperties"]));
  expect(geminiResponseJsonSchema.required).toEqual(["scenes"]);
  expect(geminiResponseJsonSchema.additionalProperties).toBe(false);
  const items = geminiResponseJsonSchema.properties!.scenes.items!;
  expect(items.required).toEqual(["heading", "narration", "visual", "duration"]);
  expect(items.additionalProperties).toBe(false);
  expect(items.properties!.duration.type).toBe("integer");
  expect(Object.keys(items.properties!)).toEqual(["heading", "narration", "visual", "duration"]);
});

it.each(["short", "long"] as const)("uses the compatible schema for a %s draft against a schema-rejecting HTTP fixture", async format => {
  const duration = format === "short" ? 60 : 300;
  const mock = vi.fn().mockImplementation(async (_url, init) => {
    const request = JSON.parse(init.body);
    if (keywords(request.generationConfig.responseJsonSchema).some(key => forbidden.has(key)))
      return Response.json({ error: { status: "INVALID_ARGUMENT", message: 'Unsupported keyword "$schema"' } }, { status: 400 });
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ scenes: [{ ...scene, duration }] }) }] } }] });
  });
  vi.stubGlobal("fetch", mock);
  const result = await new GeminiProvider("gemini-3.1-flash-lite").generate({ ...brief, format, duration });
  expect(result[0].duration).toBe(duration);
  expect(result[0].narration).toBe(scene.narration);
  expect(mock).toHaveBeenCalledTimes(1);
  expect(JSON.parse(mock.mock.calls[0][1].body).generationConfig.responseJsonSchema).toEqual(geminiResponseJsonSchema);
});

it.each([
  { ...scene, heading: "" }, { ...scene, narration: " " },
  { ...scene, narration: "a".repeat(12001) }, { ...scene, visual: "a".repeat(2001) },
  { ...scene, duration: 0 }, { ...scene, duration: 1.5 }, { ...scene, duration: 59 },
  { ...scene, unexpected: "not accepted" },
])("retains strict local validation after simplifying the provider schema: %#", invalid => {
  expect(() => parseGenerated(JSON.stringify({ scenes: [invalid] }), brief)).toThrow("invalid scene plan");
});
it("retains local scene-count bounds", () => {
  expect(() => parseGenerated('{"scenes":[]}', brief)).toThrow("invalid scene plan");
  expect(() => parseGenerated(JSON.stringify({ scenes: Array.from({ length: 61 }, () => ({ ...scene, duration: 1 })) }), { ...brief, duration: 61 })).toThrow("invalid scene plan");
});

it("extracts allowlisted schema keywords and field paths from Google BadRequest details without echoing values", async () => {
  const error = await apiError(Response.json({ error: {
    status: "INVALID_ARGUMENT", message: `Invalid schema ${key} PRIVATE_PROMPT`,
    details: [{ "@type": "type.googleapis.com/google.rpc.BadRequest", fieldViolations: [
      { field: 'generation_config.response_json_schema["$schema"]', description: `Unknown name "$schema". ${key}` },
      { field: "generation_config.response_json_schema.properties[scenes].items.properties[narration].max_length", description: "Invalid constraint" },
      { field: `generation_config.response_json_schema.properties.${key}`, description: `PRIVATE_PROMPT ${key}` },
    ] }],
  } }, { status: 400 }), "generateContent");
  expect(error.diagnostic.reason).toBe("SCHEMA_REJECTED");
  expect(error.diagnostic.schema).toEqual({
    rejectedKeywords: ["$schema", "maxLength"],
    fieldPaths: ["generationConfig.responseJsonSchema.$schema", "generationConfig.responseJsonSchema.properties.scenes.items.properties.narration.maxLength"],
    complexityLimit: false,
  });
  const response = await handle(() => { throw error; });
  const exposed = await response.text();
  expect(exposed).not.toContain(key);
  expect(exposed).not.toContain("PRIVATE_PROMPT");
});

it.each(["$schema", "min_length", "maxItems"])("recognizes explicit rejection of a known keyword: %s", name => {
  const result = schemaRejection({ error: { message: `Unsupported keyword "${name}". ${key}` } });
  expect(result?.rejectedKeywords).toHaveLength(1);
  expect(JSON.stringify(result)).not.toContain(key);
});
it.each([
  ['Unsupported keyword max_length', "maxLength"],
  ['"$schema" is not supported', "$schema"],
  ["Unknown field 'min_items'", "minItems"],
])("recognizes safe variations of explicit rejection wording: %s", (message, expected) => {
  expect(schemaRejection({ error: { message: `${message} ${key}` } })?.rejectedKeywords).toEqual([expected]);
});
it("classifies a schema compiler state-budget error without exposing the raw explanation", async () => {
  const error = await apiError(Response.json({ error: { status: "INVALID_ARGUMENT", message: `Requested schema generates a constraint that exceeds the maximum number of states. ${key}` } }, { status: 400 }), "generateContent");
  expect(error.diagnostic.reason).toBe("SCHEMA_COMPLEXITY_LIMIT");
  expect(error.diagnostic.schema?.complexityLimit).toBe(true);
  expect(JSON.stringify(error.diagnostic)).not.toContain(key);
});
it("does not label echoed schema text or an arbitrary keyword/path as a rejected known field", () => {
  expect(schemaRejection({ error: { message: `Schema contains maxLength and $schema ${key}` } })).toBeUndefined();
  expect(schemaRejection({ error: { message: `Unknown name "${key}"`, details: [{ "@type": "type.googleapis.com/google.rpc.BadRequest", fieldViolations: [{ field: key, description: key }] }] } })).toBeUndefined();
});
it("preserves credential classification when Google explicitly identifies an invalid key", async () => {
  const error = await apiError(Response.json({ error: { status: "INVALID_ARGUMENT", message: 'Unsupported keyword "$schema"', details: [{ reason: "API_KEY_INVALID" }] } }, { status: 400 }), "generateContent");
  expect(error.diagnostic.reason).toBe("ACCESS_DENIED");
  expect(error.diagnostic.schema).toBeUndefined();
});
