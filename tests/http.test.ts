import { describe, expect, it } from "vitest";
import { body, handle } from "../src/lib/http";
import { briefSchema } from "../src/lib/schema";
function request(data: string, headers?: Record<string, string>) {
  return new Request("http://localhost:3000/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: data,
  });
}
describe("API request boundary", () => {
  it("rejects cross-site writes", async () => {
    await expect(
      body(request("{}", { origin: "https://attacker.example" })),
    ).rejects.toThrow("Cross-site");
  });
  it("accepts the Codespaces forwarded origin", async () => {
    expect(
      await body(
        request("{}", {
          origin: "https://creator-3000.app.github.dev",
          "x-forwarded-host": "creator-3000.app.github.dev",
        }),
      ),
    ).toEqual({});
  });
  it("rejects malformed and oversized input", async () => {
    await expect(body(request("{"))).rejects.toThrow("Invalid JSON");
    await expect(body(request("x".repeat(250001)))).rejects.toThrow(
      "too large",
    );
  });
  it("returns validation errors as HTTP 400", async () => {
    const response = await handle(() => {
      briefSchema.parse({});
      return new Response();
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("title");
  });
});
