import { z } from "zod";
import { repository } from "@/lib/db";
import { body, handle, json } from "@/lib/http";
import { AppError } from "@/lib/errors";
import {
  FREE_TIER_MODELS,
  configuredGeminiModel,
  listGeminiModels,
  requireFreeTierModel,
} from "@/lib/providers/gemini-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function current() {
  try {
    return configuredGeminiModel(repository().getSetting("gemini-model"));
  } catch {
    return null;
  }
}
export const POST = (request: Request) =>
  handle(async () => {
    z.object({})
      .strict()
      .parse(await body(request));
    const models = await listGeminiModels();
    const recommendedModel =
      FREE_TIER_MODELS.find((id) => models.some((m) => m.id === id)) || null;
    return json({
      models,
      recommendedModel,
      currentModel: current(),
      currentModelListed: models.some((m) => m.id === current()),
      note: "Models listed by this key support generateContent. Listing does not establish generation access, free quota or billing status. No generation was requested.",
    });
  });
export const PUT = (request: Request) =>
  handle(async () => {
    const { model } = z
      .object({ model: z.string().trim().min(1).max(120).nullable() })
      .strict()
      .parse(await body(request));
    if (model === null) {
      repository().deleteSetting("gemini-model");
      return json({ model: current(), source: "GEMINI_MODEL or default" });
    }
    const id = configuredGeminiModel(model);
    requireFreeTierModel(id);
    const models = await listGeminiModels();
    if (!models.some((m) => m.id === id))
      throw new AppError(
        400,
        "This key did not list that model with generateContent support. No model was changed.",
      );
    repository().setSetting("gemini-model", id);
    return json({ model: id, source: "saved selection" });
  });
