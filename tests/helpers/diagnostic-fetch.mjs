// Explicit test-only Node preload. Never used by the normal diagnostic command.
let calls = 0;
globalThis.fetch = async (url, init) => {
  if (String(url) !== "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent")
    throw new Error("Unexpected diagnostic destination");
  if (new Headers(init?.headers).get("x-goog-api-key") !== "diagnostic-fixture-key")
    throw new Error("Unexpected diagnostic credential");
  if (++calls > 6) throw new Error("Diagnostic exceeded request limit");
  const payload = JSON.parse(init.body);
  if (process.env.DIAGNOSTIC_FIXTURE_SCHEMA_REJECT === "1" && payload.generationConfig?.responseJsonSchema?.$schema)
    return Response.json({ error: { status: "INVALID_ARGUMENT", message: 'Unsupported keyword "$schema" SECRET_RAW_RESPONSE' } }, { status: 400 });
  return Response.json({ text: "SECRET_RAW_RESPONSE" });
};
