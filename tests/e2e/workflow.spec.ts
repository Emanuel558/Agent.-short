import { test, expect } from "@playwright/test";

test("create, generate, edit, save, reload, history and both exports", async ({
  page,
  request,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Let’s make something great." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Template demo", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("dashboard.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Create a video", exact: true })
    .click();
  await page
    .getByLabel("Project name", { exact: true })
    .fill("Aurora story browser test");
  await page
    .getByLabel("What’s your video about?")
    .fill("Why the northern lights appear");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Aurora story browser test",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Generate demo script", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Template demo · no AI model or research used"),
  ).toBeVisible();
  const narration = page.getByLabel("Scene 1 narration", { exact: true });
  await narration.fill("My original aurora script for testing.");
  await expect(
    page.getByText("Unsaved changes", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /Scene plan/ }).click();
  await page
    .getByLabel("Visual direction")
    .first()
    .fill("Use my own sky photography.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("All changes saved.")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("editor.png"),
    fullPage: true,
  });
  const id = new URL(page.url()).searchParams.get("project")!;
  await page.reload();
  await expect(
    page.getByLabel("Scene 1 narration", { exact: true }),
  ).toHaveValue("My original aurora script for testing.");
  await page.getByRole("tab", { name: "History", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Script saved/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Script generated/ }).click();
  await page.getByRole("button", { name: "Load revision as draft" }).click();
  await expect(
    page.getByText("Unsaved changes", { exact: true }),
  ).toBeVisible();
  // Restore the latest saved state to test exports, rather than saving a historical draft.
  page.on("dialog", (dialog) => dialog.accept());
  await page.reload();
  for (const format of ["json", "txt"]) {
    const response = await request.get(
      `/api/projects/${id}/export?format=${format}`,
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["content-disposition"]).toContain(`.${format}`);
    const text = await response.text();
    expect(text).toContain("My original aurora script for testing.");
    expect(text).toContain("Use my own sky photography.");
  }
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "TXT", exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/\.txt$/);
  await page.getByRole("button", { name: "All projects", exact: true }).click();
  await page.getByRole("button", { name: /Aurora story browser test/ }).click();
  await expect(
    page.getByLabel("Scene 1 narration", { exact: true }),
  ).toHaveValue("My original aurora script for testing.");
  expect(errors).toEqual([]);
});

test("long-form, validation, and API conflict response", async ({
  request,
}) => {
  const invalid = await request.post("/api/projects", {
    data: {
      title: "No",
      topic: "Test",
      language: "en",
      format: "short",
      duration: 999,
    },
  });
  expect(invalid.status()).toBe(400);
  const create = await request.post("/api/projects", {
    data: {
      title: "Long story",
      topic: "Creative habits",
      language: "sv",
      format: "long",
      duration: 300,
    },
  });
  expect(create.status()).toBe(201);
  const p = await create.json();
  const generation = await request.post(`/api/projects/${p.id}/generate`, {
    data: { version: p.version },
  });
  expect(generation.status()).toBe(200);
  const ready = await generation.json();
  expect(ready.scenes).toHaveLength(8);
  const conflict = await request.put(`/api/projects/${p.id}`, {
    data: { title: "Old tab", scenes: [], version: p.version },
  });
  expect(conflict.status()).toBe(409);
  const crossSite = await request.post("/api/projects", {
    headers: { origin: "https://attacker.example" },
    data: {},
  });
  expect(crossSite.status()).toBe(403);
  const missing = await request.get("/api/projects/does-not-exist");
  expect(missing.status()).toBe(404);
});

test("mobile navigation and planned features stay clear and fit the screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Voice Studio" }).click();
  await expect(page.getByText("PLANNED · PHASE 3")).toBeVisible();
  await expect(
    page.getByText(/Voice Studio is not implemented in Phase 1/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Start with a script" }).click();
  await expect(page.getByLabel("Project name", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
