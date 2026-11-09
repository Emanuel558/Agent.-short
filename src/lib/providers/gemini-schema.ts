import { responseJsonSchema } from "./output";

export interface GeminiOutputSchema {
  type: string;
  properties?: Record<string, GeminiOutputSchema>;
  items?: GeminiOutputSchema;
  required?: string[];
  additionalProperties?: boolean;
}
// Gemini's constrained decoder needs the output structure, not a complete Zod
// validation document. All omitted constraints remain enforced by parseGenerated.
// https://ai.google.dev/gemini-api/docs/structured-output#json-schema-support
function structure(schema: unknown): GeminiOutputSchema {
  if (!schema || typeof schema !== "object") throw new Error("Invalid output schema structure");
  const node = schema as Record<string, unknown>;
  if (node.type === "object") {
    if (!node.properties || typeof node.properties !== "object" ||
        !Array.isArray(node.required) || !node.required.every(x => typeof x === "string"))
      throw new Error("Invalid output object schema");
    return {
      type: "object",
      properties: Object.fromEntries(Object.entries(node.properties).map(([key, child]) => [key, structure(child)])),
      required: [...node.required],
      ...(typeof node.additionalProperties === "boolean" ? { additionalProperties: node.additionalProperties } : {}),
    };
  }
  if (node.type === "array") return { type: "array", items: structure(node.items) };
  if (["string", "integer", "number", "boolean", "null"].includes(String(node.type)))
    return { type: String(node.type) };
  throw new Error("Unsupported output schema structure");
}

export const geminiResponseJsonSchema = structure(responseJsonSchema);
