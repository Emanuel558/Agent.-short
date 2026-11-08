// Test-only preload. Never loaded by normal dev/start scripts. This exercises
// the real server Gemini adapter without a live credential or paid requests.
const originalFetch = globalThis.fetch;
globalThis.fetch = async function (input, init) {
  const address =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const url = new URL(address);
  if (url.hostname !== "generativelanguage.googleapis.com")
    return originalFetch(input, init);
  if (
    new Headers(init?.headers).get("x-goog-api-key") !==
    "autotube-e2e-gemini-key"
  )
    throw new Error("Invalid test Gemini credentials");
  if (url.pathname === "/v1beta/models")
    return Response.json({
      models: [
        {
          name: "models/gemini-3.1-flash-lite",
          supportedGenerationMethods: ["generateContent", "countTokens"],
        },
        {
          name: "models/gemini-2.5-flash-lite",
          supportedGenerationMethods: ["generateContent", "countTokens"],
        },
        {
          name: "models/gemini-2.5-flash",
          supportedGenerationMethods: ["generateContent"],
        },
        {
          name: "models/embedding-only",
          supportedGenerationMethods: ["embedContent"],
        },
        {
          name: "models/unknown-priced-model",
          supportedGenerationMethods: ["generateContent"],
        },
      ],
    });
  if (
    ![
      "/v1beta/models/gemini-3.1-flash-lite:generateContent",
      "/v1beta/models/gemini-2.5-flash:generateContent",
      "/v1beta/models/gemini-2.5-flash-lite:generateContent",
    ].includes(url.pathname)
  )
    return Response.json({ error: { status: "NOT_FOUND" } }, { status: 404 });
  const payload = JSON.parse(init.body);
  if (payload.generationConfig?.responseMimeType !== "application/json")
    throw new Error("Expected structured Gemini output");
  const prompt = payload.contents[0].parts[0].text;
  if (prompt.includes("simulate Gemini model not found"))
    return Response.json(
      {
        error: {
          status: "NOT_FOUND",
          message: "Private error with autotube-e2e-gemini-key and prompt",
        },
      },
      { status: 404 },
    );
  if (prompt.includes("simulate Gemini quota"))
    return new Response("", { status: 429 });
  const duration = Number(prompt.match(/"duration":(\d+)/)?.[1]);
  if (!Number.isInteger(duration))
    throw new Error("Test brief must contain a duration");
  const scenes = [
    {
      heading: "A fresh perspective",
      narration:
        "Begin with one ordinary object and ask a question you have never asked before.",
      visual: "Film an original close-up of a notebook.",
      duration: Math.floor(duration / 2),
    },
    {
      heading: "Turn curiosity into a story",
      narration:
        "Follow that question, record what you observe, and build your own explanation.",
      visual: "Show your own notes beside the object.",
      duration: Math.ceil(duration / 2),
    },
  ];
  return Response.json({
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ text: JSON.stringify({ scenes }) }] },
      },
    ],
  });
};
