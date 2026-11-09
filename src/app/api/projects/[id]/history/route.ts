import { repository } from "@/lib/db";
import { handle, json, type ProjectContext } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (_: Request, context: ProjectContext) =>
  handle(async () => json(repository().history((await context.params).id)));
