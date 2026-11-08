import type { Brief, ProviderId, Scene } from "../schema";
export interface TextProvider {
  readonly id: ProviderId;
  generate(brief: Brief): Promise<Scene[]>;
}
export interface ProviderInfo {
  id: ProviderId | "invalid";
  label: string;
  configured: boolean;
  detail: string;
}
export function providerInfo(
  id: string = process.env.AI_PROVIDER || "demo",
): ProviderInfo {
  if (id === "gemini")
    return {
      id,
      label: "Google Gemini",
      configured: !!process.env.GEMINI_API_KEY,
      detail: process.env.GEMINI_API_KEY
        ? "Cloud AI · gemini-2.5-flash by default (server-configurable). Free-tier limits and model availability depend on Google. Review facts before use."
        : "Add GEMINI_API_KEY as a server-side Codespaces secret or in .env.local, then restart. No billing is enabled by the app.",
    };
  if (id === "ollama")
    return {
      id,
      label: "Ollama (local)",
      configured: true,
      detail:
        "Optional inference on your model server. Requires Ollama running with OLLAMA_MODEL (default llama3.2). Selecting this does not install or start it.",
    };
  if (id === "demo")
    return {
      id,
      label: "Template demo",
      configured: true,
      detail:
        "Free, offline templates. No AI model or research is used. Replace bracketed prompts with researched content.",
    };
  if (id === "openai-compatible") {
    let valid = false;
    try {
      valid =
        ["http:", "https:"].includes(
          new URL(process.env.AI_BASE_URL || "").protocol,
        ) && !!process.env.AI_MODEL;
    } catch {
      /* missing configuration */
    }
    return {
      id,
      label: "AI text model",
      configured: valid,
      detail: valid
        ? "Server-configured OpenAI-compatible model. Generated claims still need fact-checking."
        : "Set AI_BASE_URL and AI_MODEL on the server. An API key is optional for local models.",
    };
  }
  return {
    id: "invalid",
    label: "Provider unavailable",
    configured: false,
    detail:
      "AI_PROVIDER must be gemini, ollama, demo, or openai-compatible. Update the server environment.",
  };
}
