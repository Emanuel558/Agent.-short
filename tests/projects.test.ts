import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectRepository } from "../src/lib/db";
import { briefSchema, type Brief } from "../src/lib/schema";
import { generateProject, saveProject } from "../src/lib/services/projects";
import { DemoProvider } from "../src/lib/providers/demo";
import { exportProject } from "../src/lib/export";
const brief: Brief = {
  title: "A curious world",
  topic: "Why auroras appear",
  language: "en",
  format: "short",
  duration: 61,
};
let repo = new ProjectRepository(":memory:");
afterEach(() => {
  repo.close();
  repo = new ProjectRepository(":memory:");
});

describe("Project lifecycle", () => {
  it("creates, generates, edits, saves, reopens and exports without losing scene edits", async () => {
    const created = repo.create(brief);
    const generated = await generateProject(
      repo,
      created.id,
      created.version,
      new DemoProvider(),
    );
    expect(generated.status).toBe("script_ready");
    expect(generated.provider).toBe("demo");
    expect(generated.scenes.reduce((n, s) => n + s.duration, 0)).toBe(61);
    const scenes = generated.scenes.map((s, i) =>
      i
        ? s
        : {
            ...s,
            narration: "My original, researched narration.",
            visual: "My own aurora footage.",
          },
    );
    saveProject(repo, created.id, {
      title: "The aurora story",
      scenes,
      version: generated.version,
    });
    const reopened = repo.get(created.id);
    expect(reopened.scenes[0].narration).toBe(
      "My original, researched narration.",
    );
    const exported = JSON.parse(exportProject(reopened, "json"));
    expect(exported.schemaVersion).toBe(1);
    expect(exported.script).toContain("My original, researched narration.");
    expect(exportProject(reopened, "txt")).toContain("TEMPLATE DEMO");
    expect(exportProject(reopened, "txt")).toContain("My own aurora footage.");
    expect(repo.history(created.id).at(-1)?.project.scenes).toEqual([]);
  });
  it("persists across database close/reopen", () => {
    const dir = mkdtempSync(join(tmpdir(), "autotube-test-"));
    try {
      const path = join(dir, "projects.sqlite");
      const first = new ProjectRepository(path);
      const p = first.create(brief);
      first.close();
      const second = new ProjectRepository(path);
      expect(second.get(p.id).topic).toBe(brief.topic);
      expect(second.history(p.id)).toHaveLength(1);
      second.close();
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
  it("rejects a stale-tab save without overwriting either revision", () => {
    const p = repo.create(brief);
    saveProject(repo, p.id, {
      title: "Tab one",
      scenes: [],
      version: p.version,
    });
    expect(() =>
      saveProject(repo, p.id, {
        title: "Tab two",
        scenes: [],
        version: p.version,
      }),
    ).toThrow("another tab");
    expect(repo.get(p.id).title).toBe("Tab one");
    expect(repo.history(p.id)).toHaveLength(2);
  });
  it("preserves the last script if generation fails and allows retry", async () => {
    const p = repo.create(brief);
    const first = await generateProject(
      repo,
      p.id,
      p.version,
      new DemoProvider(),
    );
    const failing = {
      id: "openai-compatible" as const,
      generate: async () => {
        throw new Error("secret-token");
      },
    };
    await expect(
      generateProject(repo, p.id, first.version, failing),
    ).rejects.toThrow("previous script is preserved");
    const failed = repo.get(p.id);
    expect(failed.status).toBe("failed");
    expect(failed.scenes).toEqual(first.scenes);
    expect(failed.error).not.toContain("secret-token");
    const retry = await generateProject(
      repo,
      p.id,
      failed.version,
      new DemoProvider(),
    );
    expect(retry.status).toBe("script_ready");
  });
  it("rejects conflicting generation and saves while the provider is running", async () => {
    const p = repo.create(brief);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const running = generateProject(repo, p.id, p.version, {
      id: "demo",
      generate: async (b) => {
        await pending;
        return new DemoProvider().generate(b);
      },
    });
    const locked = repo.get(p.id);
    await expect(
      generateProject(repo, p.id, locked.version, new DemoProvider()),
    ).rejects.toThrow("already generating");
    expect(() =>
      saveProject(repo, p.id, {
        title: "Wait",
        scenes: [],
        version: locked.version,
      }),
    ).toThrow("Wait for generation");
    release();
    await running;
  });
  it("recovers an interrupted request instead of permanently locking the project", () => {
    const p = repo.create(brief);
    repo.update(p.id, p.version, { status: "generating" }, "Started");
    const future = Date.now() + 130000;
    const original = Date.now;
    Date.now = () => future;
    try {
      expect(repo.get(p.id).status).toBe("failed");
    } finally {
      Date.now = original;
    }
  });
  it("rejects invalid scene timing and empty narration without creating a revision", async () => {
    const p = repo.create(brief);
    const ready = await generateProject(
      repo,
      p.id,
      p.version,
      new DemoProvider(),
    );
    expect(() =>
      saveProject(repo, p.id, {
        title: p.title,
        scenes: ready.scenes.map((s, i) => (i ? s : { ...s, duration: 100 })),
        version: ready.version,
      }),
    ).toThrow("must total");
    expect(() =>
      saveProject(repo, p.id, {
        title: p.title,
        scenes: ready.scenes.map((s) => ({ ...s, narration: "  " })),
        version: ready.version,
      }),
    ).toThrow("needs narration");
    expect(repo.get(p.id).version).toBe(ready.version);
  });
  it("returns a clear error for missing projects", () => {
    expect(() => repo.get("missing")).toThrow("Project not found");
  });
});
describe("Brief boundaries", () => {
  it.each([
    { ...brief, duration: 181 },
    { ...brief, format: "long", duration: 59 },
    { ...brief, title: " " },
    { ...brief, language: "unknown" },
    { ...brief, duration: 60.5 },
  ])("rejects an invalid brief: %j", (input) => {
    expect(briefSchema.safeParse(input).success).toBe(false);
  });
  it("supports a 60-minute long-form plan", async () => {
    const b: Brief = {
      ...brief,
      format: "long",
      duration: 3600,
      language: "sv",
    };
    const scenes = await new DemoProvider().generate(briefSchema.parse(b));
    expect(scenes.reduce((n, s) => n + s.duration, 0)).toBe(3600);
    expect(scenes[0].narration).toContain("Varför");
  });
});
