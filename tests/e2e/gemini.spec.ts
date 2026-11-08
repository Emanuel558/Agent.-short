import { test, expect } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.put("/api/provider", { data: { provider: "demo" } });
});
test.afterEach(async ({ request }) => {
  await request.put("/api/provider", { data: { provider: "demo" } });
});

for (const format of ["short", "long"] as const) {
  test(`Generate with Gemini saves narration and scenes for ${format} videos`, async ({
    page,
    request,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const created = await request.post("/api/projects", {
      data: {
        title: `Gemini ${format} workflow`,
        topic: "Original creative storytelling",
        language: "en",
        format,
        duration: format === "short" ? 60 : 300,
      },
    });
    const project = await created.json();
    await page.goto(`/?view=studio&project=${project.id}`);
    await expect(page.getByTestId("gemini-key-status")).toContainText(
      "loaded on server",
    );
    await page.getByLabel("Script provider").selectOption("gemini");
    await page
      .getByRole("button", { name: "Save provider", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Provider saved");
    await page
      .getByRole("button", { name: "Generate with Gemini", exact: true })
      .first()
      .click();
    await expect(
      page.getByText("Gemini-generated draft · review required"),
    ).toBeVisible();
    await expect(page.getByLabel("Scene 1 narration")).toHaveValue(
      /ordinary object/,
    );
    const saved = await (
      await request.get(`/api/projects/${project.id}`)
    ).json();
    expect(saved.provider).toBe("gemini");
    expect(
      saved.scenes.reduce(
        (n: number, s: { duration: number }) => n + s.duration,
        0,
      ),
    ).toBe(saved.duration);
    await page.reload();
    await expect(page.getByLabel("Scene 1 narration")).toHaveValue(
      /ordinary object/,
    );
    const exportResponse = await request.get(
      `/api/projects/${project.id}/export?format=json`,
    );
    expect(await exportResponse.text()).toContain("ordinary object");
    // Only safe status/model information reaches the browser, never the key.
    expect(await (await request.get("/api/provider")).text()).not.toContain(
      "autotube-e2e-gemini-key",
    );
    expect(await page.content()).not.toContain("autotube-e2e-gemini-key");
    expect(errors).toEqual([]);
    await request.put("/api/provider", { data: { provider: "demo" } });
  });
}

test("Gemini usage-limit errors reach the browser without losing saved scripts", async ({
  page,
  request,
}) => {
  const response = await request.post("/api/projects", {
    data: {
      title: "Gemini quota recovery",
      topic: "simulate Gemini quota",
      language: "en",
      format: "short",
      duration: 60,
    },
  });
  const project = await response.json();
  await request.put("/api/provider", { data: { provider: "demo" } });
  const demo = await (
    await request.post(`/api/projects/${project.id}/generate`, {
      data: { version: project.version },
    })
  ).json();
  await request.put("/api/provider", { data: { provider: "gemini" } });
  await page.goto(`/?view=studio&project=${project.id}`);
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Generate with Gemini", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "quota or rate limit" }),
  ).toContainText("quota or rate limit");
  const failed = await (
    await request.get(`/api/projects/${project.id}`)
  ).json();
  expect(failed.scenes).toEqual(demo.scenes);
  expect(failed.status).toBe("failed");
  const revisions = await (
    await request.get(`/api/projects/${project.id}/history`)
  ).json();
  expect(
    revisions.some(
      (r: { project: { status: string } }) =>
        r.project.status === "script_ready",
    ),
  ).toBe(true);
  await request.put("/api/provider", { data: { provider: "demo" } });
});
