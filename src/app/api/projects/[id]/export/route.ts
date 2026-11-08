import { repository } from "@/lib/db";
import { handle, type ProjectContext } from "@/lib/http";
import { exportProject } from "@/lib/export";
import { AppError } from "@/lib/errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request, context: ProjectContext) =>
  handle(async () => {
    const format = new URL(request.url).searchParams.get("format") || "json";
    if (format !== "json" && format !== "txt")
      throw new AppError(400, "Choose JSON or TXT export.");
    const project = repository().get((await context.params).id);
    const filename =
      project.title.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 70) ||
      "autotube-script";
    return new Response(exportProject(project, format), {
      headers: {
        "Content-Type":
          format === "json"
            ? "application/json; charset=utf-8"
            : "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.${format}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
