import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { GeminiProvider } from "../src/lib/providers/gemini";
import { OllamaProvider } from "../src/lib/providers/ollama";
import { providerInfo } from "../src/lib/providers/text";
import { ProjectRepository } from "../src/lib/db";
import { generateProject } from "../src/lib/services/projects";
import { DemoProvider } from "../src/lib/providers/demo";
const brief = {
  title: "A fresh idea",
  topic: "Creative habits",
  language: "en" as const,
  format: "short" as const,
  duration: 60,
};
const scene = {
  heading: "Hook",
  narration: "Make space for one original idea today.",
  visual: "Original notebook footage",
  duration: 60,
};
const success = (
  content = JSON.stringify({ scenes: [scene] }),
  reason = "STOP",
) =>
  Response.json({
    candidates: [
      { finishReason: reason, content: { parts: [{ text: content }] } },
    ],
  });
beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-server-secret");
  vi.stubEnv("GEMINI_MODEL", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("Gemini official API", () => {
  it("uses the official endpoint, default model, key header and structured output", async () => {
    const mock = vi.fn().mockResolvedValue(success());
    vi.stubGlobal("fetch", mock);
    const result = await new GeminiProvider().generate(brief);
    expect(result[0].narration).toBe(scene.narration);
    expect(mock.mock.calls[0][0]).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    );
    const args = mock.mock.calls[0][1];
    expect(args.headers["x-goog-api-key"]).toBe("test-server-secret");
    expect(args.redirect).toBe("error");
    expect(JSON.parse(args.body).generationConfig.responseMimeType).toBe(
      "application/json",
    );
    expect(JSON.stringify(providerInfo("gemini"))).not.toContain(
      "test-server-secret",
    );
  });
  it("fails clearly without a key and makes no network request", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);
    expect(providerInfo("gemini").configured).toBe(false);
    await expect(new GeminiProvider().generate(brief)).rejects.toMatchObject({
      status: 503,
    });
    expect(mock).not.toHaveBeenCalled();
  });
  it.each([
    [429, "quota"],
    [404, "model unavailable"],
    [400, "model unavailable"],
    [403, "API key"],
    [503, "temporarily unavailable"],
  ])(
    "explains HTTP %s without leaking upstream content",
    async (status, message) => {
      const mock = vi.fn().mockResolvedValue(
        new Response("private upstream details test-server-secret", {
          status: status as number,
        }),
      );
      vi.stubGlobal("fetch", mock);
      await expect(new GeminiProvider().generate(brief)).rejects.toThrow(
        message as string,
      );
      expect(mock).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    "{",
    JSON.stringify({ scenes: [] }),
    JSON.stringify({ scenes: [{ ...scene, duration: 20 }] }),
    JSON.stringify({ scenes: [{ ...scene, narration: " " }] }),
    JSON.stringify({ scenes: [{ ...scene, visual: "" }] }),
  ])("rejects invalid content before saving", async (content) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(success(content)));
    await expect(new GeminiProvider().generate(brief)).rejects.toThrow(
      "invalid scene plan",
    );
  });
  it.each(["MAX_TOKENS", "SAFETY"])(
    "rejects incomplete or blocked output: %s",
    async (reason) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(success(undefined, reason)),
      );
      await expect(new GeminiProvider().generate(brief)).rejects.toThrow(
        "blocked or truncated",
      );
    },
  );
  it("reports network failures safely", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("test-server-secret")),
    );
    await expect(new GeminiProvider().generate(brief)).rejects.toThrow(
      "could not be reached",
    );
  });
  it("supports an explicit model override without automatic fallback", async () => {
    vi.stubEnv("GEMINI_MODEL", "chosen-model");
    const mock = vi.fn().mockResolvedValue(success());
    vi.stubGlobal("fetch", mock);
    await new GeminiProvider().generate(brief);
    expect(mock.mock.calls[0][0]).toContain("/chosen-model:generateContent");
  });
});
it("uses Ollama native structured JSON API only when selected", async () => {
  vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434");
  vi.stubEnv("OLLAMA_MODEL", "local-model");
  const mock = vi.fn().mockResolvedValue(
    Response.json({
      message: { content: JSON.stringify({ scenes: [scene] }) },
    }),
  );
  vi.stubGlobal("fetch", mock);
  expect((await new OllamaProvider().generate(brief))[0].duration).toBe(60);
  expect(mock.mock.calls[0][0]).toBe("http://127.0.0.1:11434/api/chat");
  expect(JSON.parse(mock.mock.calls[0][1].body).model).toBe("local-model");
});
it("preserves existing projects/history across provider selection, failure, and Demo recovery", async () => {
  const repo = new ProjectRepository(":memory:");
  try {
    const p = repo.create(brief);
    const demo = await generateProject(
      repo,
      p.id,
      p.version,
      new DemoProvider(),
    );
    const history = repo.history(p.id);
    repo.setSetting("text-provider", "gemini");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 429 })),
    );
    await expect(
      generateProject(repo, p.id, demo.version),
    ).rejects.toMatchObject({ status: 429 });
    expect(repo.get(p.id).scenes).toEqual(demo.scenes);
    expect(
      repo.history(p.id).find((r) => r.version === history[0].version)?.project,
    ).toEqual(history[0].project);
    repo.setSetting("text-provider", "demo");
    const recovered = await generateProject(repo, p.id, repo.get(p.id).version);
    expect(recovered.status).toBe("script_ready");
    expect(recovered.provider).toBe("demo");
  } finally {
    repo.close();
  }
});
it("validates every provider at the service boundary before committing output", async () => {
  const repo = new ProjectRepository(":memory:");
  try {
    const p = repo.create(brief);
    await expect(
      generateProject(repo, p.id, p.version, {
        id: "demo",
        generate: async () => [{ ...scene, id: randomUUID(), duration: 1 }],
      }),
    ).rejects.toThrow("invalid scene plan");
    expect(repo.get(p.id).scenes).toEqual([]);
  } finally {
    repo.close();
  }
});

it("opens a pre-settings SQLite database without rewriting projects or revisions", async () => {
  const { default: Database } = await import("better-sqlite3");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "autotube-legacy-"));
  const path = join(dir, "old.sqlite");
  const old = {
    ...brief,
    id: randomUUID(),
    scenes: [],
    status: "draft",
    version: 1,
    provider: null,
    error: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  try {
    const db = new Database(path);
    db.exec(
      "CREATE TABLE projects(id TEXT PRIMARY KEY,document TEXT NOT NULL,updated_at TEXT NOT NULL); CREATE TABLE revisions(id INTEGER PRIMARY KEY AUTOINCREMENT,project_id TEXT NOT NULL,version INTEGER NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL,document TEXT NOT NULL,UNIQUE(project_id,version));",
    );
    db.prepare("INSERT INTO projects VALUES(?,?,?)").run(
      old.id,
      JSON.stringify(old),
      old.updatedAt,
    );
    db.prepare(
      "INSERT INTO revisions(project_id,version,reason,created_at,document) VALUES(?,?,?,?,?)",
    ).run(old.id, 1, "Project created", old.createdAt, JSON.stringify(old));
    db.close();
    let repo = new ProjectRepository(path);
    expect(repo.get(old.id)).toEqual(old);
    expect(repo.history(old.id)[0].project).toEqual(old);
    repo.setSetting("text-provider", "gemini");
    repo.close();
    repo = new ProjectRepository(path);
    expect(repo.getSetting("text-provider")).toBe("gemini");
    expect(repo.get(old.id)).toEqual(old);
    expect(repo.history(old.id)).toHaveLength(1);
    repo.close();
  } finally {
    rmSync(dir, { recursive: true });
  }
});
