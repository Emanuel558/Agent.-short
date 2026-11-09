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
import { GeminiProvider } from "../src/lib/providers/gemini";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
            name: "models/gemini-3.1-flash-lite",
            supportedGenerationMethods: ["generateContent"],
          },
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
    { id: "gemini-3.1-flash-lite", freeTierDocumented: true },
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

it.each(["unknown-priced-model", "gemini-3.1-flash-lite-image"])(
  "blocks an unreviewed model before any inference request: %s",
  async (model) => {
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);
    await expect(
      new GeminiProvider(model).generate(brief),
    ).rejects.toMatchObject({ status: 503 });
    expect(mock).not.toHaveBeenCalled();
  },
);

it.each(["short", "long"] as const)(
  "uses a saved Gemini 3.1 selection after reopening SQLite for a %s script, preserving prior revisions",
  async (format) => {
    const dir = mkdtempSync(join(tmpdir(), "autotube-gemini-31-"));
    const path = join(dir, "projects.sqlite");
    let repo = new ProjectRepository(path);
    try {
      const duration = format === "short" ? 60 : 300;
      const project = repo.create({ ...brief, format, duration });
      const prior = await generateProject(
        repo,
        project.id,
        project.version,
        new DemoProvider(),
      );
      const history = repo.history(project.id);
      repo.setSetting("text-provider", "gemini");
      repo.setSetting("gemini-model", "gemini-3.1-flash-lite");
      repo.close();
      repo = new ProjectRepository(path);
      expect(repo.get(project.id)).toEqual(prior);
      expect(repo.history(project.id)).toEqual(history);
      const scenes = [{
        heading: "Original Gemini 3.1 draft",
        narration: "Begin an original story by asking a new question.",
        visual: "Record your own notebook and research notes.",
        duration,
      }];
      const mock = vi.fn().mockResolvedValue(
        Response.json({
          candidates: [{
            finishReason: "STOP",
            content: { parts: [{ text: JSON.stringify({ scenes }) }] },
          }],
        }),
      );
      vi.stubGlobal("fetch", mock);
      const generated = await generateProject(repo, project.id, prior.version);
      expect(generated.provider).toBe("gemini");
      expect(generated.status).toBe("script_ready");
      expect(generated.scenes[0].heading).toBe("Original Gemini 3.1 draft");
      expect(generated.scenes[0].duration).toBe(duration);
      expect(mock).toHaveBeenCalledTimes(1);
      const [url, init] = mock.mock.calls[0];
      expect(url).toBe(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent",
      );
      expect(init.headers["x-goog-api-key"]).toBe("test-private-model-key");
      const config = JSON.parse(init.body).generationConfig;
      expect(config.responseMimeType).toBe("application/json");
      expect(config.responseJsonSchema).toBeTruthy();
      for (const revision of history)
        expect(
          repo.history(project.id).find(r => r.version === revision.version),
        ).toEqual(revision);
      repo.close();
      repo = new ProjectRepository(path);
      expect(repo.getSetting("gemini-model")).toBe("gemini-3.1-flash-lite");
      expect(repo.get(project.id)).toEqual(generated);
      expect(process.env.GEMINI_API_KEY).toBe("test-private-model-key");
    } finally {
      repo.close();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

it("traces a persisted SQLite selection to the exact generation URL when listing succeeds but generation returns 404", async () => {
  const dir = mkdtempSync(join(tmpdir(), "autotube-gemini-404-"));
  const path = join(dir, "projects.sqlite");
  let repo = new ProjectRepository(path);
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const p = repo.create(brief);
    const old = await generateProject(repo, p.id, p.version, new DemoProvider());
    repo.setSetting("text-provider", "gemini");
    repo.setSetting("gemini-model", "gemini-2.5-flash-lite");
    repo.close();
    repo = new ProjectRepository(path);
    expect(repo.getSetting("gemini-model")).toBe("gemini-2.5-flash-lite");

    const mock = vi.fn().mockImplementation(async (_url, init) => {
      if (init.method === "POST") {
        // A configuration change during a request must not change diagnostics,
        // the model selected for this attempt or the key used for its recheck.
        vi.stubEnv("GEMINI_API_KEY", "changed-after-request-key");
        repo.setSetting("gemini-model", "gemini-2.5-flash");
        return Response.json(
          {
            error: {
              status: "NOT_FOUND",
              message: "test-private-model-key private prompt",
            },
          },
          { status: 404 },
        );
      }
      return Response.json({
        models: [
          {
            name: "models/gemini-2.5-flash-lite",
            supportedGenerationMethods: ["generateContent"],
          },
        ],
      });
    });
    vi.stubGlobal("fetch", mock);
    const response = await handle(() =>
      generateProject(repo, p.id, old.version).then(() => Response.json({})),
    );
    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.diagnostic).toEqual({
      operation: "generateContent",
      upstreamHttpStatus: 404,
      apiStatus: "NOT_FOUND",
      apiReason: null,
      reason: "MODEL_NOT_FOUND",
      invalidFields: [],
      apiVersion: "v1beta",
      payload: {
        requestBytes: expect.any(Number),
        promptBytes: expect.any(Number),
        schemaBytes: expect.any(Number),
        maxOutputTokens: 16384,
        responseMimeType: "application/json",
        temperature: 0.7,
      },
      requestPath: "/v1beta/models/gemini-2.5-flash-lite:generateContent",
      request: {
        savedModelId: "gemini-2.5-flash-lite",
        selectedModelId: "gemini-2.5-flash-lite",
        modelSource: "saved selection",
        apiVersion: "v1beta",
        requestPath: "/v1beta/models/gemini-2.5-flash-lite:generateContent",
      },
      modelDiscovery: { supportsGenerateContent: true, upstreamHttpStatus: 200 },
    });
    expect(mock.mock.calls.map(([url]) => url)).toEqual([
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
    ]);
    expect(
      mock.mock.calls.filter(([, init]) => init.method === "POST"),
    ).toHaveLength(1);
    for (const [, init] of mock.mock.calls) {
      expect(init.headers["x-goog-api-key"]).toBe("test-private-model-key");
      expect(init.redirect).toBe("error");
    }
    expect(repo.get(p.id).scenes).toEqual(old.scenes);
    expect(repo.history(p.id).some((r) => r.project.provider === "demo")).toBe(
      true,
    );
    const exposed = JSON.stringify([
      data,
      log.mock.calls,
      warn.mock.calls,
      errorLog.mock.calls,
    ]);
    for (const secret of [
      "test-private-model-key",
      "changed-after-request-key",
      "private prompt",
    ])
      expect(exposed).not.toContain(secret);
  } finally {
    repo.close();
    rmSync(dir, { recursive: true, force: true });
    log.mockRestore();
    warn.mockRestore();
    errorLog.mockRestore();
  }
});

it.each([
  { models: [], expected: false },
  {
    models: [{ name: "models/gemini-2.5-flash-lite", supportedGenerationMethods: ["embedContent"] }],
    expected: false,
  },
  {
    models: [{ name: "models/gemini-2.5-flash-lite", supportedGenerationMethods: ["generateContent"] }],
    expected: true,
  },
])(
  "checks the actual selected ID and method after a 404: $expected",
  async ({ models, expected }) => {
    const mock = vi.fn()
      .mockResolvedValueOnce(
        Response.json({ error: { status: "NOT_FOUND" } }, { status: 404 }),
      )
      .mockResolvedValueOnce(Response.json({ models }));
    vi.stubGlobal("fetch", mock);
    await expect(
      new GeminiProvider("models/gemini-2.5-flash-lite").generate(brief),
    ).rejects.toMatchObject({
      status: 502,
      diagnostic: {
        request: {
          savedModelId: "models/gemini-2.5-flash-lite",
          selectedModelId: "gemini-2.5-flash-lite",
          requestPath: "/v1beta/models/gemini-2.5-flash-lite:generateContent",
        },
        modelDiscovery: { supportsGenerateContent: expected, upstreamHttpStatus: 200 },
      },
    });
    expect(mock.mock.calls[0][0]).not.toContain("models/models/");
    expect(mock).toHaveBeenCalledTimes(2);
  },
);

it.each([403, "network"])(
  "preserves the original generation 404 when its metadata check fails: %s",
  async (failure) => {
    const mock = vi.fn().mockResolvedValueOnce(
      Response.json({ error: { status: "NOT_FOUND" } }, { status: 404 }),
    );
    if (failure === "network")
      mock.mockRejectedValueOnce(new Error("test-private-model-key"));
    else
      mock.mockResolvedValueOnce(Response.json(
        { error: { status: "PERMISSION_DENIED", message: "test-private-model-key" } },
        { status: failure as number },
      ));
    vi.stubGlobal("fetch", mock);
    await expect(
      new GeminiProvider("gemini-2.5-flash-lite").generate(brief),
    ).rejects.toMatchObject({
      status: 502,
      diagnostic: {
        upstreamHttpStatus: 404,
        reason: "MODEL_NOT_FOUND",
        modelDiscovery: {
          supportsGenerateContent: null,
          upstreamHttpStatus: failure === "network" ? null : 403,
        },
      },
    });
    expect(mock).toHaveBeenCalledTimes(2);
  },
);

it.each([
  { env: "gemini-2.5-flash-lite", source: "GEMINI_MODEL", id: "gemini-2.5-flash-lite" },
  { env: "", source: "default", id: "gemini-2.5-flash" },
])(
  "reports the effective model source without a SQLite override: $source",
  async ({ env, source, id }) => {
    vi.stubEnv("GEMINI_MODEL", env);
    const mock = vi.fn().mockResolvedValue(
      Response.json({ error: { status: "INVALID_ARGUMENT" } }, { status: 400 }),
    );
    vi.stubGlobal("fetch", mock);
    await expect(new GeminiProvider().generate(brief)).rejects.toMatchObject({
      diagnostic: {
        request: {
          savedModelId: null,
          selectedModelId: id,
          modelSource: source,
          apiVersion: "v1beta",
        },
      },
    });
    expect(mock).toHaveBeenCalledTimes(1);
  },
);
