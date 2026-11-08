import type { Brief } from "../schema";
import type { TextProvider } from "./text";
import { AppError } from "../errors";
import { parseGenerated, responseJsonSchema, scriptPrompt } from "./output";
export class GeminiProvider implements TextProvider {
  readonly id = "gemini" as const;
  async generate(brief: Brief) {
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key)
      throw new AppError(
        503,
        "Set GEMINI_API_KEY in Codespaces secrets or .env.local, then restart the server.",
      );
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    if (!/^[a-zA-Z0-9._-]+$/.test(model))
      throw new AppError(503, "GEMINI_MODEL must be a model ID, not a URL.");
    let response: Response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          cache: "no-store",
          signal: AbortSignal.timeout(60000),
          redirect: "error",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
          },
          body: JSON.stringify({
            contents: [
              { role: "user", parts: [{ text: scriptPrompt(brief) }] },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              responseJsonSchema,
              maxOutputTokens: 16384,
              temperature: 0.7,
            },
          }),
        },
      );
    } catch {
      throw new AppError(
        502,
        "Gemini could not be reached or timed out. Check the connection and retry.",
      );
    }
    if (response.status === 429)
      throw new AppError(
        429,
        "Gemini quota or rate limit reached. Wait and retry, check your free-tier quota in AI Studio, or select Demo. Billing has not been enabled by this app.",
      );
    if ([401, 403].includes(response.status))
      throw new AppError(
        502,
        "Gemini rejected the API key or project access. Check key restrictions, account eligibility, and API access.",
      );
    if ([400, 404].includes(response.status))
      throw new AppError(
        502,
        "Gemini model unavailable or request unsupported. Check GEMINI_MODEL and your project access. No alternate model was selected.",
      );
    if (!response.ok)
      throw new AppError(
        502,
        "Gemini is temporarily unavailable. Retry later or select Demo.",
      );
    let data;
    try {
      data = await response.json();
    } catch {
      throw new AppError(
        502,
        "Gemini returned an unreadable response. Your saved script is preserved.",
      );
    }
    const candidate = data.candidates?.[0];
    if (
      data.promptFeedback?.blockReason ||
      (candidate && candidate.finishReason !== "STOP")
    )
      throw new AppError(
        502,
        "Gemini blocked or truncated the draft. Adjust the topic or duration and retry. Your saved script is preserved.",
      );
    const text = candidate?.content?.parts
      ?.filter(
        (p: { thought?: boolean; text?: string }) =>
          !p.thought && typeof p.text === "string",
      )
      .map((p: { text: string }) => p.text)
      .join("");
    return parseGenerated(text || "", brief);
  }
}
