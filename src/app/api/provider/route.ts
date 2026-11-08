import { z } from "zod";
import { repository } from "@/lib/db";
import { providerInfo } from "@/lib/providers/text";
import { body, handle, json } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function settings() {
  return {
    ...providerInfo(repository().getSetting("text-provider")),
    options: ["gemini", "ollama", "demo", "openai-compatible"].map((id) =>
      providerInfo(id),
    ),
  };
}
export const GET = () => handle(() => json(settings()));
export const PUT = (request: Request) =>
  handle(async () => {
    const { provider } = z
      .object({
        provider: z.enum(["gemini", "ollama", "demo", "openai-compatible"]),
      })
      .strict()
      .parse(await body(request));
    repository().setSetting("text-provider", provider);
    return json(settings());
  });
