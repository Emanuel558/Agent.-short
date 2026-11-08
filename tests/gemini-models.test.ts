import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  apiError,
  configuredGeminiModel,
  listGeminiModels,
  requireFreeTierModel,
} from "../src/lib/providers/gemini-api";
import { handle } from "../src/lib/http";
import { ProjectRepository } from "../src/lib/db";
import { generateProject } from "../src/lib/services/projects";
import { DemoProvider } from "../src/lib/providers/demo";
const brief = {
  title: "Model selection",
  topic: "Original creative storytelling",
  language: "en" as const,
  format: "short" as const,
  duration: 60,
};
beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-private-model-key");
  vi.stubEnv("GEMINI_MODEL", "gemini-2.5-flash");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("distinguishes model not found from unsupported parameters with safe upstream diagnostics", async () => {
  const missing = await apiError(
    Response.json(
      { error: { status: "NOT_FOUND", message: "test-private-model-key" } },
      { status: 404 },
    ),
    "generateContent",
  );
  expect(missing.diagnostic).toMatchObject({
    upstreamHttpStatus: 404,
    apiStatus: "NOT_FOUND",
    reason: "MODEL_NOT_FOUND",
  });
  const bad = await apiError(
    Response.json(
      {
        error: {
          status: "INVALID_ARGUMENT",
          message:
            'Unknown name "response_json_schema". Secret test-private-model-key and private prompt',
        },
      },
      { status: 400 },
    ),
    "generateContent",
  );
  expect(bad.diagnostic).toMatchObject({
    upstreamHttpStatus: 400,
    apiStatus: "INVALID_ARGUMENT",
    reason: "UNSUPPORTED_REQUEST_FIELD",
    invalidFields: ["responseJsonSchema"],
  });
  const response = await handle(() => {
    throw bad;
  });
  const data = await response.json();
  expect(data.code).toBe("GEMINI_API_ERROR");
  expect(JSON.stringify(data)).not.toContain("test-private");
  expect(JSON.stringify(data)).not.toContain("private prompt");
});
it("lists paginated generateContent models with the same server key and no key query parameter", async () => {
  const mock = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        models: [
          {
            name: "models/gemini-2.5-flash-lite",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/embedding-only",
            supportedGenerationMethods: ["embedContent"],
          },
        ],
        nextPageToken: "next token",
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        models: [
          {
            name: "models/unknown-priced-model",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/gemini-2.5-flash-lite",
            supportedGenerationMethods: ["generateContent"],
          },
        ],
      }),
    );
  vi.stubGlobal("fetch", mock);
  const models = await listGeminiModels();
  expect(models).toEqual([
    { id: "gemini-2.5-flash-lite", freeTierDocumented: true },
    { id: "unknown-priced-model", freeTierDocumented: false },
  ]);
  expect(mock.mock.calls[0][0]).toBe(
    "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
  );
  expect(mock.mock.calls[1][0]).toContain("pageToken=next+token");
  for (const call of mock.mock.calls) {
    expect(call[1].headers["x-goog-api-key"]).toBe("test-private-model-key");
    expect(call[0]).not.toContain("test-private-model-key");
    expect(call[1].redirect).toBe("error");
  }
});
it("does not treat models listing as permission to use unverified paid models", () => {
  expect(() => requireFreeTierModel("unknown-priced-model")).toThrow(
    "No paid-only model was requested",
  );
  expect(configuredGeminiModel("models/gemini-2.5-flash-lite")).toBe(
    "gemini-2.5-flash-lite",
  );
});
it("reports actual model-discovery status without exposing raw errors", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json(
        {
          error: {
            status: "PERMISSION_DENIED",
            message: "test-private-model-key",
          },
        },
        { status: 403 },
      ),
    ),
  );
  await expect(listGeminiModels()).rejects.toMatchObject({
    diagnostic: {
      operation: "models.list",
      upstreamHttpStatus: 403,
      apiStatus: "PERMISSION_DENIED",
    },
  });
});
it("detects repeated model pages instead of returning a misleading partial list", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(Response.json({ models: [], nextPageToken: "same" })),
      ),
  );
  await expect(listGeminiModels()).rejects.toThrow("invalid page sequence");
});
it("keeps a selected model and prior scripts across errors without changing the key", async () => {
  const repo = new ProjectRepository(":memory:");
  try {
    const p = repo.create(brief);
    const old = await generateProject(
      repo,
      p.id,
      p.version,
      new DemoProvider(),
    );
    repo.setSetting("text-provider", "gemini");
    repo.setSetting("gemini-model", "gemini-2.5-flash-lite");
    const mock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              status: "INVALID_ARGUMENT",
              message: "Unknown name responseJsonSchema",
            },
          },
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      scenes: [
                        {
                          heading: "Original draft",
                          narration:
                            "An original story begins with a new question.",
                          visual: "Record your own notes.",
                          duration: 60,
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", mock);
    await expect(
      generateProject(repo, p.id, old.version),
    ).rejects.toMatchObject({
      diagnostic: {
        upstreamHttpStatus: 400,
        reason: "UNSUPPORTED_REQUEST_FIELD",
      },
    });
    expect(repo.get(p.id).scenes).toEqual(old.scenes);
    const saved = await generateProject(repo, p.id, repo.get(p.id).version);
    expect(saved.provider).toBe("gemini");
    expect(saved.scenes[0].heading).toBe("Original draft");
    expect(mock.mock.calls[1][0]).toContain(
      "/gemini-2.5-flash-lite:generateContent",
    );
    expect(process.env.GEMINI_API_KEY).toBe("test-private-model-key");
    expect(repo.history(p.id).some((r) => r.project.provider === "demo")).toBe(
      true,
    );
  } finally {
    repo.close();
  }
});

it("recognizes a Google API_KEY_INVALID reason at HTTP 400 without exposing its metadata", async () => {
  const error = await apiError(
    Response.json(
      {
        error: {
          status: "INVALID_ARGUMENT",
          message: "private key test-private-model-key",
          details: [
            {
              reason: "API_KEY_INVALID",
              metadata: { apiKey: "test-private-model-key" },
            },
          ],
        },
      },
      { status: 400 },
    ),
    "generateContent",
  );
  expect(error.diagnostic).toMatchObject({
    upstreamHttpStatus: 400,
    apiReason: "API_KEY_INVALID",
    reason: "ACCESS_DENIED",
  });
  expect(JSON.stringify(error.diagnostic)).not.toContain(
    "test-private-model-key",
  );
});

it("blocks an unreviewed model before any inference request", async () => {
  const { GeminiProvider } = await import("../src/lib/providers/gemini");
  const mock = vi.fn();
  vi.stubGlobal("fetch", mock);
  await expect(
    new GeminiProvider("unknown-priced-model").generate(brief),
  ).rejects.toMatchObject({ status: 503 });
  expect(mock).not.toHaveBeenCalled();
});
