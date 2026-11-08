import type { Brief } from "../schema";
import type { TextProvider } from "./text";
import { AppError } from "../errors";
import { parseGenerated, responseJsonSchema, scriptPrompt } from "./output";
export class OllamaProvider implements TextProvider {
  readonly id = "ollama" as const;
  async generate(brief: Brief) {
    let response: Response;
    try {
      response = await fetch(
        `${(process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "")}/api/chat`,
        {
          method: "POST",
          signal: AbortSignal.timeout(60000),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: process.env.OLLAMA_MODEL || "llama3.2",
            stream: false,
            format: responseJsonSchema,
            messages: [{ role: "user", content: scriptPrompt(brief) }],
          }),
        },
      );
    } catch {
      throw new AppError(
        502,
        "Ollama is not reachable or timed out. Start the optional model server inside the Codespace (or configure OLLAMA_BASE_URL), or select Demo.",
      );
    }
    if (response.status === 404)
      throw new AppError(
        502,
        "Ollama model unavailable. Pull OLLAMA_MODEL on your model server first.",
      );
    if (!response.ok)
      throw new AppError(
        502,
        "Ollama rejected the request. Check its model and available memory.",
      );
    try {
      const data = await response.json();
      return parseGenerated(data.message?.content || "", brief);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        502,
        "Ollama returned an unreadable draft. Your saved script is preserved.",
      );
    }
  }
}
