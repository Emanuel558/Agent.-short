import { GeminiProvider } from "../providers/gemini";
import { OllamaProvider } from "../providers/ollama";
import { validateGenerated } from "../providers/output";
import { AppError } from "../errors";
import { ProjectRepository } from "../db";
import { DemoProvider } from "../providers/demo";
import { OpenAICompatibleProvider } from "../providers/openai-compatible";
import { providerInfo, type TextProvider } from "../providers/text";
import { editSchema, validateSceneTiming } from "../schema";
export function saveProject(
  repo: ProjectRepository,
  id: string,
  input: unknown,
) {
  const data = editSchema.parse(input);
  const current = repo.get(id);
  if (current.status === "generating")
    throw new AppError(409, "Wait for generation to finish before saving.");
  if (!validateSceneTiming(data.scenes, current.duration))
    throw new AppError(
      400,
      `Scene durations must total ${current.duration} seconds.`,
    );
  if (data.scenes.some((s) => !s.narration.trim()))
    throw new AppError(400, "Each scene needs narration before saving.");
  return repo.update(
    id,
    data.version,
    {
      title: data.title,
      scenes: data.scenes,
      error: null,
      status: data.scenes.length ? "script_ready" : "draft",
    },
    "Script saved",
  );
}
export async function generateProject(
  repo: ProjectRepository,
  id: string,
  version: number,
  override?: TextProvider,
) {
  const current = repo.get(id);
  if (current.status === "generating")
    throw new AppError(409, "This project is already generating.");
  const savedModel = repo.getSetting("gemini-model");
  const info = providerInfo(repo.getSetting("text-provider"), savedModel);
  if (!override && !info.configured) throw new AppError(503, info.detail);
  const provider =
    override ||
    (info.id === "demo"
      ? new DemoProvider()
      : info.id === "gemini"
        ? new GeminiProvider(savedModel)
        : info.id === "ollama"
          ? new OllamaProvider()
          : new OpenAICompatibleProvider());
  const started = repo.update(
    id,
    version,
    { status: "generating", error: null },
    "Generation started",
  );
  try {
    // TypeScript's Brief type does not strip Project fields at runtime. Send
    // only the requested brief, never previous scripts/errors or storage data.
    const { title, topic, format, language, duration } = current;
    const scenes = await provider.generate({
      title, topic, format, language, duration,
    });
    validateGenerated(scenes, current);
    return repo.update(
      id,
      started.version,
      { scenes, provider: provider.id, status: "script_ready", error: null },
      "Script generated",
    );
  } catch (error) {
    const safe =
      error instanceof AppError
        ? error
        : new AppError(
            502,
            "Script generation failed. Your previous script is preserved. Please retry.",
          );
    repo.update(
      id,
      started.version,
      { status: "failed", error: safe.message },
      "Generation failed",
    );
    throw safe;
  }
}
