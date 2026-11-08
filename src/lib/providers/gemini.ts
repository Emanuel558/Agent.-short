import type { Brief } from "../schema";
import type { TextProvider } from "./text";
import { AppError } from "../errors";
import {
  geminiKey,
  geminiRequestContext,
  listGeminiModels,
  GeminiApiError,
  apiError,
  GEMINI_API,
} from "./gemini-api";
import { parseGenerated, responseJsonSchema, scriptPrompt } from "./output";
export class GeminiProvider implements TextProvider {
  readonly id = "gemini" as const;
  constructor(private readonly modelOverride?: string) {}
  async generate(brief: Brief) {
    const key = geminiKey();
    // Snapshot the selected ID and source before awaiting any external request.
    // Build diagnostics and the actual URL from that same snapshot.
    const request = geminiRequestContext(this.modelOverride);
    const model = request.selectedModelId;
    const prompt = scriptPrompt(brief);
    const generationConfig = {
      responseMimeType: "application/json",
      responseJsonSchema,
      maxOutputTokens: 16384,
      temperature: 0.7,
    };
    const requestBody = JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig,
    });
    let response: Response;
    try {
      response = await fetch(new URL(request.requestPath, GEMINI_API).href, {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(60000),
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: requestBody,
      });
    } catch {
      throw new AppError(
        502,
        "Gemini could not be reached or timed out. Check the connection and retry.",
      );
    }
    if (!response.ok) {
      const error = await apiError(response, "generateContent", request);
      // Sizes and fixed configuration only: no prompt, schema content, key,
      // response text, project identity or user data in browser diagnostics.
      error.diagnostic.payload = {
        requestBytes: Buffer.byteLength(requestBody),
        promptBytes: Buffer.byteLength(prompt),
        schemaBytes: Buffer.byteLength(JSON.stringify(responseJsonSchema)),
        maxOutputTokens: generationConfig.maxOutputTokens,
        responseMimeType: generationConfig.responseMimeType,
        temperature: generationConfig.temperature,
      };
      if (response.status === 404) {
        // Metadata only, using this attempt's captured key and API version.
        // Never retry inference, select a fallback, or replace the original 404.
        try {
          const models = await listGeminiModels(key);
          error.diagnostic.modelDiscovery = {
            supportsGenerateContent: models.some((m) => m.id === model),
            upstreamHttpStatus: 200,
          };
        } catch (discoveryError) {
          error.diagnostic.modelDiscovery = {
            supportsGenerateContent: null,
            upstreamHttpStatus:
              discoveryError instanceof GeminiApiError
                ? discoveryError.diagnostic.upstreamHttpStatus
                : null,
          };
        }
      }
      throw error;
    }
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
