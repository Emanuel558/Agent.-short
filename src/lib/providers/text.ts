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
export function providerInfo(): ProviderInfo {
  const id = process.env.AI_PROVIDER || "demo";
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
      "AI_PROVIDER must be demo or openai-compatible. Update the server environment.",
  };
}
