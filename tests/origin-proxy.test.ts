import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { body } from "../src/lib/http";
const publicOrigin = "https://creator-3000.app.github.dev";
const baseline: Record<string, string> = {
  origin: "http://localhost:3000",
  host: "localhost:3000",
  "x-forwarded-host": "creator-3000.app.github.dev",
  "x-forwarded-proto": "https",
  "sec-fetch-site": "same-origin",
  "content-type": "application/json",
};
function request(method = "PUT", changes: Record<string, string> = {}) {
  return new Request(
    `http://0.0.0.0:3000/api/${method === "PUT" ? "provider" : "projects"}`,
    {
      method,
      headers: { ...baseline, ...changes },
      body: JSON.stringify(
        method === "PUT"
          ? { provider: "gemini" }
          : {
              title: "A story",
              topic: "Creative habits",
              language: "en",
              format: "short",
              duration: 60,
            },
      ),
    },
  );
}
beforeEach(() => {
  vi.stubEnv("APP_ORIGIN", publicOrigin);
  vi.stubEnv("CODESPACE_NAME", "creator");
  vi.stubEnv("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN", "app.github.dev");
});
afterEach(() => vi.unstubAllEnvs());
describe("Codespaces rewrites Origin as well as Host", () => {
  it.each(["POST", "PUT"])(
    "accepts a pinned, browser-same-origin %s after the tunnel rewrites Origin",
    async (method) => {
      await expect(body(request(method))).resolves.toHaveProperty(
        method === "PUT" ? "provider" : "title",
      );
    },
  );
  it("supports an HTTPS loopback Origin rewrite", async () => {
    await expect(
      body(request("PUT", { origin: "https://localhost:3000" })),
    ).resolves.toEqual({ provider: "gemini" });
  });
  const rejectedHeaders: Record<string, string>[] = [
    { "sec-fetch-site": "cross-site" },
    { "sec-fetch-site": "same-site" },
    { "sec-fetch-site": "" },
    { "x-forwarded-host": "attacker.example" },
    { "x-forwarded-host": "" },
    { "x-forwarded-host": "creator-3000.app.github.dev, attacker.example" },
    { "x-forwarded-proto": "http" },
    { "x-forwarded-proto": "" },
    { origin: "http://localhost:4000" },
    { host: "localhost:4000" },
    { origin: "https://attacker.example" },
  ];
  it.each(rejectedHeaders)(
    "rejects incomplete, foreign, or ambiguous proxy proof: %j",
    async (changes) => {
      await expect(body(request("PUT", changes))).rejects.toMatchObject({
        status: 403,
      });
    },
  );
  it("never bypasses a conflicting explicit APP_ORIGIN", async () => {
    vi.stubEnv("APP_ORIGIN", "https://another-3000.app.github.dev");
    await expect(body(request())).rejects.toMatchObject({ status: 403 });
  });
  it("does not trust forwarded headers outside this Codespace identity", async () => {
    vi.stubEnv("CODESPACE_NAME", "");
    await expect(body(request())).rejects.toMatchObject({ status: 403 });
  });
  it("still accepts the unmodified public Origin", async () => {
    await expect(
      body(request("PUT", { origin: publicOrigin })),
    ).resolves.toEqual({ provider: "gemini" });
  });
});

it("reports compared normalized origins without reflecting cookies, tokens, or body content", async () => {
  const { handle } = await import("../src/lib/http");
  const response = await handle(async () => {
    await body(
      request("PUT", {
        origin: "https://attacker.example",
        authorization: "Bearer private-test-secret",
        cookie: "session=private-test-cookie",
      }),
    );
    return new Response();
  });
  expect(response.status).toBe(403);
  const data = await response.json();
  expect(data.code).toBe("CSRF_ORIGIN_MISMATCH");
  expect(data.originCheck.expected).toBe(publicOrigin);
  expect(data.originCheck.source).toBe("APP_ORIGIN");
  expect(JSON.stringify(data)).not.toContain("private-test");
  expect(JSON.stringify(data)).not.toContain("gemini");
});
