import type { Brief } from "../schema";
import type { TextProvider } from "./text";
import { AppError } from "../errors";
import {
  configuredGeminiModel,
  requireFreeTierModel,
  geminiKey,
  apiError,
  GEMINI_API,
} from "./gemini-api";
import { parseGenerated, responseJsonSchema, scriptPrompt } from "./output";
export class GeminiProvider implements TextProvider {
  readonly id = "gemini" as const;
  constructor(private readonly modelOverride?: string) {}
  async generate(brief: Brief) {
    const key = geminiKey();
    const model = configuredGeminiModel(this.modelOverride);
    requireFreeTierModel(model);
    let response: Response;
    try {
      response = await fetch(`${GEMINI_API}/models/${model}:generateContent`, {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(60000),
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: scriptPrompt(brief) }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseJsonSchema,
            maxOutputTokens: 16384,
            temperature: 0.7,
          },
        }),
      });
    } catch {
      throw new AppError(
        502,
        "Gemini could not be reached or timed out. Check the connection and retry.",
      );
    }
    if (!response.ok) throw await apiError(response, "generateContent");
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
