import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./errors";
import { assertSameOrigin, OriginRejection } from "./origin";
export const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function body(request: Request): Promise<unknown> {
  assertSameOrigin(request);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError(415, "Send JSON data.");
  if (Number(request.headers.get("content-length")) > 250000)
    throw new AppError(413, "Project data is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "Request data is required.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 250000) {
      await reader.cancel();
      throw new AppError(413, "Project data is too large.");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError(400, "Invalid JSON data.");
  }
}
export async function handle(
  action: () => Promise<Response> | Response,
): Promise<Response> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ZodError)
      return json(
        {
          error: error.issues
            .map((i) => `${i.path.join(".") || "Input"}: ${i.message}`)
            .join(" "),
        },
        400,
      );
    if (error instanceof OriginRejection)
      return json(
        {
          error: error.message,
          code: error.code,
          originCheck: error.originCheck,
        },
        error.status,
      );
    if (error instanceof AppError)
      return json({ error: error.message }, error.status);
    // Never send upstream error bodies or environment values to the browser.
    console.error(
      "AutoTube request failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    return json(
      { error: "The request could not be completed. Please retry." },
      500,
    );
  }
}
export type ProjectContext = { params: Promise<{ id: string }> };
