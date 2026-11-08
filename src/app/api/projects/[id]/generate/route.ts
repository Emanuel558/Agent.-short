import { repository } from "@/lib/db";
import { body, handle, json, type ProjectContext } from "@/lib/http";
import { generateProject } from "@/lib/services/projects";
import { versionSchema } from "@/lib/schema";
export const runtime = "nodejs";
export const maxDuration = 90;
export const POST = (request: Request, context: ProjectContext) =>
  handle(async () => {
    const { version } = versionSchema.parse(await body(request));
    return json(
      await generateProject(repository(), (await context.params).id, version),
    );
  });
