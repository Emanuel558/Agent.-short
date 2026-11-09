import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { ProjectRepository } from "../src/lib/db";
import { generateProject } from "../src/lib/services/projects";
import { handle } from "../src/lib/http";

const brief = {
  title: "Studieidéer på svenska",
  topic: "Organizing a study desk",
  format: "short" as const,
  language: "sv" as const,
  duration: 60,
};
beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "private-payload-test-key");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("keeps the outbound brief constant when regenerating a project with old scripts, errors and storage metadata", async () => {
  const repo = new ProjectRepository(":memory:");
  try {
    repo.setSetting("text-provider", "gemini");
    repo.setSetting("gemini-model", "gemini-3.1-flash-lite");
    const project = repo.create(brief);
    const mock = vi.fn().mockImplementation(async () => Response.json({
      error: { status: "UNAVAILABLE", message: "private-payload-test-key" },
    }, { status: 503 }));
    vi.stubGlobal("fetch", mock);
    await expect(generateProject(repo, project.id, project.version)).rejects.toMatchObject({
      diagnostic: { upstreamHttpStatus: 503 },
    });
    const oldScene = {
      id: randomUUID(),
      heading: "Saved earlier",
      narration: "PREVIOUS_SCRIPT_PRIVATE ".repeat(400),
      visual: "Earlier visual notes",
      duration: 60,
    };
    const saved = repo.update(project.id, repo.get(project.id).version, {
      scenes: [oldScene], error: "PREVIOUS_ERROR_PRIVATE", status: "failed",
    }, "Saved before regeneration");
    const history = repo.history(project.id);
    const response = await handle(async () => {
      await generateProject(repo, project.id, saved.version);
      return Response.json({});
    });
    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.diagnostic.upstreamHttpStatus).toBe(503);
    // Exactly one inference per user attempt; no automatic 503 retry.
    expect(mock).toHaveBeenCalledTimes(2);
    expect(mock.mock.calls[1][1].body).toBe(mock.mock.calls[0][1].body);
    const prompt = JSON.parse(mock.mock.calls[1][1].body).contents[0].parts[0].text;
    for (const marker of ["PREVIOUS_SCRIPT_PRIVATE", "PREVIOUS_ERROR_PRIVATE", project.id, oldScene.id])
      expect(prompt).not.toContain(marker);
    expect(prompt).toContain(JSON.stringify(brief));
    expect(repo.get(project.id).scenes).toEqual([oldScene]);
    for (const revision of history)
      expect(repo.history(project.id).find(r => r.version === revision.version)).toEqual(revision);
    const exposed = JSON.stringify(data);
    for (const marker of ["private-payload-test-key", "PREVIOUS_SCRIPT_PRIVATE", "PREVIOUS_ERROR_PRIVATE", brief.title, brief.topic, project.id])
      expect(exposed).not.toContain(marker);
  } finally {
    repo.close();
  }
});

it.each([400, 429, 503])("reports only payload sizes and configuration after HTTP %s, without retrying", async status => {
  const repo = new ProjectRepository(":memory:");
  try {
    repo.setSetting("text-provider", "gemini");
    repo.setSetting("gemini-model", "gemini-3.1-flash-lite");
    const project = repo.create(brief);
    const mock = vi.fn().mockImplementation(async () => Response.json({
      error: {
        status: status === 503 ? "UNAVAILABLE" : status === 429 ? "RESOURCE_EXHAUSTED" : "INVALID_ARGUMENT",
        message: "private-payload-test-key",
      },
    }, { status }));
    vi.stubGlobal("fetch", mock);
    const response = await handle(async () => {
      await generateProject(repo, project.id, project.version);
      return Response.json({});
    });
    expect(mock).toHaveBeenCalledTimes(1);
    const [, request] = mock.mock.calls[0];
    const payload = JSON.parse(request.body);
    const data = await response.json();
    expect(data.diagnostic.payload).toEqual({
      requestBytes: Buffer.byteLength(request.body),
      promptBytes: Buffer.byteLength(payload.contents[0].parts[0].text),
      schemaBytes: Buffer.byteLength(JSON.stringify(payload.generationConfig.responseJsonSchema)),
      maxOutputTokens: 16384,
      responseMimeType: "application/json",
      temperature: 0.7,
    });
    expect(data.diagnostic.payload.promptBytes).toBeGreaterThan(payload.contents[0].parts[0].text.length);
    expect(data.diagnostic.request.selectedModelId).toBe("gemini-3.1-flash-lite");
    expect(data.diagnostic.upstreamHttpStatus).toBe(status);
    for (const marker of ["private-payload-test-key", brief.title, brief.topic, project.id])
      expect(JSON.stringify(data)).not.toContain(marker);
  } finally {
    repo.close();
  }
});
