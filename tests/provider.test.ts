import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleProvider } from "../src/lib/providers/openai-compatible";
import { providerInfo } from "../src/lib/providers/text";
const brief = {
  title: "Auroras",
  topic: "Auroras explained",
  language: "en" as const,
  format: "short" as const,
  duration: 60,
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function setup() {
  vi.stubEnv("AI_PROVIDER", "openai-compatible");
  vi.stubEnv("AI_BASE_URL", "http://localhost:11434/v1");
  vi.stubEnv("AI_MODEL", "local-test-model");
  vi.stubEnv("AI_API_KEY", "server-only-test-secret");
}
describe("Server text provider", () => {
  it("defaults to an explicitly labeled demo", () => {
    vi.stubEnv("AI_PROVIDER", "");
    expect(providerInfo()).toMatchObject({
      id: "demo",
      label: "Template demo",
      configured: true,
    });
  });
  it("reports missing model configuration and invalid providers without fallback", () => {
    vi.stubEnv("AI_PROVIDER", "invalid");
    expect(providerInfo().configured).toBe(false);
    vi.stubEnv("AI_PROVIDER", "openai-compatible");
    vi.stubEnv("AI_BASE_URL", "");
    expect(providerInfo().configured).toBe(false);
  });
  it("validates structured model output and keeps the key in the outbound server request only", async () => {
    setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  scenes: [
                    {
                      heading: "Hook",
                      narration: "An original draft.",
                      visual: "Original footage",
                      duration: 60,
                    },
                  ],
                }),
              },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const result = await new OpenAICompatibleProvider().generate(brief);
    expect(result[0].narration).toBe("An original draft.");
    expect(result[0].id).toBeTruthy();
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://localhost:11434/v1/chat/completions",
    );
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer server-only-test-secret",
    );
    expect(JSON.stringify(providerInfo())).not.toContain(
      "server-only-test-secret",
    );
  });
  it.each([
    "not json",
    JSON.stringify({ scenes: [] }),
    JSON.stringify({
      scenes: [{ heading: "x", narration: "y", visual: "z", duration: 2 }],
    }),
  ])("rejects malformed or mistimed output", async (content) => {
    setup();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ choices: [{ message: { content } }] }),
        ),
    );
    await expect(
      new OpenAICompatibleProvider().generate(brief),
    ).rejects.toThrow("invalid scene plan");
  });
  it("does not expose upstream error details or use demo on failure", async () => {
    setup();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("secret provider details", { status: 401 }),
        ),
    );
    await expect(
      new OpenAICompatibleProvider().generate(brief),
    ).rejects.toThrow("rejected the request");
  });
  it("handles connection failure safely", async () => {
    setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("secret")));
    await expect(
      new OpenAICompatibleProvider().generate(brief),
    ).rejects.toThrow("could not be reached");
  });
});
