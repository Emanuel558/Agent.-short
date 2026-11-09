export interface GeminiSchemaRejection {
  rejectedKeywords: string[];
  fieldPaths: string[];
  complexityLimit: boolean;
}
// Output values come only from this fixed vocabulary, never raw error text.
const KEYWORDS = [
  "$schema", "$ref", "$defs", "type", "properties", "items", "required",
  "additionalProperties", "minLength", "maxLength", "minimum", "maximum",
  "minItems", "maxItems", "enum", "format", "anyOf", "oneOf", "pattern",
  "propertyOrdering", "prefixItems", "uniqueItems",
];
const nodes = ["generationConfig.responseJsonSchema", "generationConfig.responseSchema"].flatMap(root =>
  [root, `${root}.properties.scenes`, `${root}.properties.scenes.items`,
    ...["heading", "narration", "visual", "duration"].map(name => `${root}.properties.scenes.items.properties.${name}`)]);
const PATHS = [...nodes, ...nodes.flatMap(path => KEYWORDS.map(key => `${path}.${key}`))];
const normalize = (value: string) => value
  .replace(/\[["'`]?([A-Za-z_$][A-Za-z0-9_$]*)["'`]?\]/g, ".$1").replace(/_/g, "").toLowerCase();
const keyword = (value: string) => KEYWORDS.find(key => normalize(key) === normalize(value));

export function schemaRejection(payload: unknown): GeminiSchemaRejection | undefined {
  if (!payload || typeof payload !== "object") return;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") return;
  const data = error as { message?: unknown; details?: unknown };
  const messages: string[] = typeof data.message === "string" ? [data.message.slice(0, 20000)] : [];
  const fields = new Set<string>();
  const rejected = new Set<string>();
  if (Array.isArray(data.details)) for (const detail of data.details.slice(0, 50)) {
    if (detail?.["@type"] !== "type.googleapis.com/google.rpc.BadRequest" || !Array.isArray(detail.fieldViolations)) continue;
    for (const violation of detail.fieldViolations.slice(0, 50)) {
      if (typeof violation?.description === "string") messages.push(violation.description.slice(0, 20000));
      if (typeof violation?.field !== "string") continue;
      const path = PATHS.find(path => normalize(path) === normalize(violation.field) ||
        normalize(path.slice("generationConfig.".length)) === normalize(violation.field));
      if (path) {
        fields.add(path);
        const key = keyword(path.split(".").at(-1)!);
        if (key) rejected.add(key);
      }
    }
  }
  let complexityLimit = false;
  for (const message of messages) {
    // Match explicit rejection wording and recognized keyword names only. Merely
    // echoing a schema or mentioning a keyword is not evidence of rejection.
    for (const match of message.matchAll(/(?:unknown|unsupported|unrecognized|invalid)\s+(?:name|field|keyword|property|key)\s*[:=]?\s*["'`]?([A-Za-z_$][A-Za-z0-9_$]{0,79})["'`]?/gi)) {
      const key = keyword(match[1]);
      if (key) rejected.add(key);
    }
    for (const match of message.matchAll(/["'`]([A-Za-z_$][A-Za-z0-9_$]{0,79})["'`]\s+(?:is\s+)?(?:not supported|not allowed|unsupported|invalid)/gi)) {
      const key = keyword(match[1]);
      if (key) rejected.add(key);
    }
    if (/(?:schema|constraint).{0,160}(?:too complex|too many states|state limit|state budget|complexity limit|exceeds?.{0,50}(?:maximum|limit|budget).{0,30}states)/is.test(message) ||
        /(?:too many states|exceeds? (?:the )?(?:constraint )?state (?:limit|budget))/i.test(message)) complexityLimit = true;
  }
  if (!rejected.size && !fields.size && !complexityLimit) return;
  return { rejectedKeywords: [...rejected].sort(), fieldPaths: [...fields].sort(), complexityLimit };
}
