import { z } from "zod";

export const languages = {
  en: "English",
  sv: "Swedish",
  es: "Spanish",
  fr: "French",
  de: "German",
} as const;
export const briefSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    topic: z.string().trim().min(3).max(1000),
    format: z.enum(["short", "long"]),
    language: z.enum(["en", "sv", "es", "fr", "de"]),
    duration: z.number().int().min(15).max(3600),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (p.format === "short" && p.duration > 180)
      ctx.addIssue({
        code: "custom",
        path: ["duration"],
        message: "Shorts must be 15–180 seconds.",
      });
    if (p.format === "long" && p.duration < 60)
      ctx.addIssue({
        code: "custom",
        path: ["duration"],
        message: "Long-form videos must be at least 60 seconds.",
      });
  });
export const sceneSchema = z
  .object({
    id: z.string().uuid(),
    heading: z.string().trim().min(1).max(120),
    narration: z.string().max(12000),
    visual: z.string().max(2000),
    duration: z.number().int().min(1).max(3600),
  })
  .strict();
export const scenesSchema = z.array(sceneSchema).max(60);
export const editSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    scenes: scenesSchema,
    version: z.number().int().positive(),
  })
  .strict();
export const versionSchema = z
  .object({ version: z.number().int().positive() })
  .strict();
export type Brief = z.infer<typeof briefSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type ProjectStatus = "draft" | "generating" | "script_ready" | "failed";
export type ProviderId = "demo" | "openai-compatible";
export interface Project extends Brief {
  id: string;
  scenes: Scene[];
  status: ProjectStatus;
  version: number;
  provider: ProviderId | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface Revision {
  id: number;
  version: number;
  reason: string;
  createdAt: string;
  project: Project;
}
export function scriptText(project: Pick<Project, "scenes">): string {
  return project.scenes.map((s) => s.narration).join("\n\n");
}
export function validateSceneTiming(scenes: Scene[], duration: number) {
  return (
    scenes.length === 0 ||
    scenes.reduce((sum, s) => sum + s.duration, 0) === duration
  );
}
