import { repository } from "@/lib/db";
import { body, handle, json } from "@/lib/http";
import { briefSchema } from "@/lib/schema";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = () => handle(() => json(repository().list()));
export const POST = (request: Request) =>
  handle(async () =>
    json(repository().create(briefSchema.parse(await body(request))), 201),
  );
