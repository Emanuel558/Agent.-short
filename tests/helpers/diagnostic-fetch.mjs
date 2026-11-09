// Explicit test-only Node preload. Never used by the normal diagnostic command.
let calls = 0;
globalThis.fetch = async (url, init) => {
  const availability = process.env.DIAGNOSTIC_FIXTURE_AVAILABILITY === "1";
  const current = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent";
  const other = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite";
  if (String(url) !== current && !(availability && [other, `${other}:generateContent`].includes(String(url))))
    throw new Error("Unexpected diagnostic destination");
  if (new Headers(init?.headers).get("x-goog-api-key") !== "diagnostic-fixture-key")
    throw new Error("Unexpected diagnostic credential");
  if (++calls > 6) throw new Error("Diagnostic exceeded request limit");
  if (availability && String(url) === current) return Response.json({ error: { message: "SECRET_RAW_RESPONSE" } }, { status: 503 });
  if (availability && String(url) === other) return Response.json({ name: "models/gemini-3.5-flash-lite", supportedGenerationMethods: ["generateContent"] });
  const payload = JSON.parse(init.body);
  if (process.env.DIAGNOSTIC_FIXTURE_SCHEMA_REJECT === "1" && payload.generationConfig?.responseJsonSchema?.$schema)
    return Response.json({ error: { status: "INVALID_ARGUMENT", message: 'Unsupported keyword "$schema" SECRET_RAW_RESPONSE' } }, { status: 400 });
  return Response.json({ text: "SECRET_RAW_RESPONSE" });
};
