import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  beforeEach(() => {
    vi.stubEnv("APP_ORIGIN", "");
    vi.stubEnv("CODESPACE_NAME", "");
    vi.stubEnv("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("accepts a direct same-origin JSON request", async () => {
    expect(
      await body(request("{}", { origin: "http://localhost:3000" })),
    ).toEqual({});
  });

  it("handles Next.js listening on 0.0.0.0 while a direct browser uses loopback", async () => {
    const direct = new Request("http://0.0.0.0:3000/api/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "127.0.0.1:3000",
        origin: "http://127.0.0.1:3000",
      },
      body: "{}",
    });
    expect(await body(direct)).toEqual({});
  });

  describe("private Codespaces forwarded requests", () => {
    const origin = "https://creator-3000.app.github.dev";
    beforeEach(() => vi.stubEnv("CODESPACE_NAME", "creator"));
    const proxyHeaders: Record<string, string>[] = [
      {},
      { host: "localhost:3000" },
      {
        host: "127.0.0.1:3000",
        "x-forwarded-host": "localhost:3000",
        "x-forwarded-proto": "http",
      },
      {
        host: "localhost:3000",
        "x-forwarded-host": "creator-3000.app.github.dev",
      },
      {
        host: "localhost:3000",
        "x-forwarded-host": "creator-3000.app.github.dev, internal-proxy:8080",
      },
    ];
    it.each(proxyHeaders)(
      "accepts its pinned public origin despite proxy rewriting: %j",
      async (headers) => {
        expect(
          await body(
            request("{}", {
              ...headers,
              origin,
              "sec-fetch-site": "same-origin",
            }),
          ),
        ).toEqual({});
      },
    );
    it.each([
      "https://another-3000.app.github.dev",
      "https://creator-3001.app.github.dev",
      "http://creator-3000.app.github.dev",
      "https://creator-3000.app.github.dev:444",
      "https://creator-3000.app.github.dev.attacker.example",
      "https://attacker.example",
    ])(
      "rejects a different origin even when forwarding headers claim it: %s",
      async (candidate) => {
        await expect(
          body(
            request("{}", {
              origin: candidate,
              "x-forwarded-host": new URL(candidate).host,
            }),
          ),
        ).rejects.toMatchObject({ status: 403 });
      },
    );
    it("uses the configured Codespaces forwarding domain exactly", async () => {
      vi.stubEnv(
        "GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN",
        "preview.example.org",
      );
      expect(
        await body(
          request("{}", { origin: "https://creator-3000.preview.example.org" }),
        ),
      ).toEqual({});
      await expect(body(request("{}", { origin }))).rejects.toMatchObject({
        status: 403,
      });
    });
    it("allows an explicit origin for an alternate forwarded port, never a wildcard", async () => {
      vi.stubEnv("APP_ORIGIN", "https://creator-4000.app.github.dev/");
      expect(
        await body(
          request("{}", { origin: "https://creator-4000.app.github.dev" }),
        ),
      ).toEqual({});
      await expect(body(request("{}", { origin }))).rejects.toMatchObject({
        status: 403,
      });
    });
  });

  it("does not trust a forged forwarded host outside Codespaces either", async () => {
    await expect(
      body(
        request("{}", {
          origin: "https://attacker.example",
          "x-forwarded-host": "attacker.example",
        }),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it.each(["https://localhost:3000", "http://localhost:3001"])(
    "checks scheme and port as well as hostname: %s",
    async (origin) => {
      await expect(body(request("{}", { origin }))).rejects.toMatchObject({
        status: 403,
      });
    },
  );
  it.each([
    "null",
    "not a URL",
    "http://localhost:3000/api/projects",
    "http://user:password@localhost:3000",
    "http://localhost:3000?query=yes",
    "http://localhost:3000#fragment",
    "http://localhost:3000#",
    "http://localhost:3000, https://attacker.example",
  ])(
    "returns 403 rather than 500 for an invalid origin: %s",
    async (origin) => {
      const response = await handle(async () => {
        await body(request("{}", { origin }));
        return new Response();
      });
      expect(response.status).toBe(403);
    },
  );
  it.each([
    "https://*.app.github.dev",
    "https://creator.app.github.dev/path",
    "null",
  ])("fails closed for invalid APP_ORIGIN: %s", async (origin) => {
    vi.stubEnv("APP_ORIGIN", origin);
    await expect(
      body(request("{}", { origin: "http://localhost:3000" })),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("rejects browser cross-site requests even if Origin is absent", async () => {
    await expect(
      body(request("{}", { "sec-fetch-site": "cross-site" })),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("keeps non-browser JSON tools working without Origin", async () => {
    expect(await body(request("{}"))).toEqual({});
  });
  it("continues requiring JSON content types", async () => {
    await expect(
      body(request("{}", { "content-type": "text/plain" })),
    ).rejects.toMatchObject({ status: 415 });
  });
  it("rejects cross-site writes", async () => {
    await expect(
      body(request("{}", { origin: "https://attacker.example" })),
    ).rejects.toThrow("Cross-site");
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
