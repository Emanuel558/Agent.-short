import { repository } from "@/lib/db";
import { body, handle, json, type ProjectContext } from "@/lib/http";
import { saveProject } from "@/lib/services/projects";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (_: Request, context: ProjectContext) =>
  handle(async () => json(repository().get((await context.params).id)));
export const PUT = (request: Request, context: ProjectContext) =>
  handle(async () =>
    json(
      saveProject(repository(), (await context.params).id, await body(request)),
    ),
  );
