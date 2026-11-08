import { test, expect } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.put("/api/provider", { data: { provider: "demo" } });
  await request.put("/api/gemini/models", { data: { model: null } });
});
test.afterEach(async ({ request }) => {
  await request.put("/api/provider", { data: { provider: "demo" } });
  await request.put("/api/gemini/models", { data: { model: null } });
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
    page.getByRole("alert").filter({ hasText: "Quota or rate limit" }),
  ).toContainText("Quota or rate limit");
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

test("discover and explicitly save a free-tier candidate, then generate without changing keys", async ({
  page,
  request,
}) => {
  const p = await (
    await request.post("/api/projects", {
      data: {
        title: "Discovered model test",
        topic: "Original creative storytelling",
        language: "en",
        format: "short",
        duration: 60,
      },
    })
  ).json();
  await page.goto(`/?view=studio&project=${p.id}`);
  await page
    .getByRole("button", { name: "Check available Gemini models", exact: true })
    .click();
  await expect(
    page.getByText("Recommended candidate:", { exact: false }),
  ).toContainText("gemini-2.5-flash-lite");
  await expect(
    page
      .getByLabel("Available free-tier model")
      .getByRole("option", { name: "unknown-priced-model", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Available free-tier model")
    .selectOption("gemini-2.5-flash-lite");
  await page
    .getByRole("button", { name: "Save Gemini model", exact: true })
    .click();
  await expect(page.getByTestId("gemini-key-status")).toContainText(
    "gemini-2.5-flash-lite",
  );
  const discovery = await (
    await request.post("/api/gemini/models", { data: {} })
  ).json();
  expect(discovery.apiVersion).toBe("v1beta");
  expect(discovery.generationRequest).toMatchObject({
    savedModelId: "gemini-2.5-flash-lite",
    selectedModelId: "gemini-2.5-flash-lite",
    modelSource: "saved selection",
    requestPath: "/v1beta/models/gemini-2.5-flash-lite:generateContent",
  });
  await page.getByLabel("Script provider").selectOption("gemini");
  await page
    .getByRole("button", { name: "Save provider", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Provider saved" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Generate with Gemini", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Gemini-generated draft · review required"),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("gemini-key-status")).toContainText(
    "gemini-2.5-flash-lite",
  );
  expect(await (await request.get("/api/provider")).text()).not.toContain(
    "autotube-e2e-gemini-key",
  );
  await page
    .getByRole("button", {
      name: "Use server GEMINI_MODEL setting",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("gemini-key-status")).toContainText(
    "gemini-2.5-flash.",
  );
});

test("a listed model returning 404 reports the saved selection and actual request without losing scripts", async ({
  page,
  request,
}) => {
  const project = await (
    await request.post("/api/projects", {
      data: {
        title: "404 request comparison",
        topic: "simulate Gemini model not found",
        language: "en",
        format: "short",
        duration: 60,
      },
    })
  ).json();
  const prior = await (
    await request.post(`/api/projects/${project.id}/generate`, {
      data: { version: project.version },
    })
  ).json();
  const selection = await request.put("/api/gemini/models", {
    data: { model: "gemini-2.5-flash-lite" },
  });
  expect(selection.ok()).toBe(true);
  await request.put("/api/provider", { data: { provider: "gemini" } });
  await page.goto(`/?view=studio&project=${project.id}`);
  page.on("dialog", (dialog) => dialog.accept());
  const responsePromise = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/projects/${project.id}/generate`) &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Generate with Gemini", exact: true })
    .click();
  const response = await responsePromise;
  expect(response.status()).toBe(502);
  const data = await response.json();
  expect(data.diagnostic).toMatchObject({
    operation: "generateContent",
    upstreamHttpStatus: 404,
    apiStatus: "NOT_FOUND",
    apiVersion: "v1beta",
    requestPath: "/v1beta/models/gemini-2.5-flash-lite:generateContent",
    request: {
      savedModelId: "gemini-2.5-flash-lite",
      selectedModelId: "gemini-2.5-flash-lite",
      modelSource: "saved selection",
    },
    modelDiscovery: { supportsGenerateContent: true, upstreamHttpStatus: 200 },
  });
  expect(JSON.stringify(data)).not.toContain("autotube-e2e-gemini-key");
  expect(JSON.stringify(data)).not.toContain("Private error");
  await expect(
    page.getByRole("alert").filter({ hasText: "Gemini HTTP 404" }),
  ).toBeVisible();
  await page.reload();
  const saved = await (
    await request.get(`/api/projects/${project.id}`)
  ).json();
  expect(saved.scenes).toEqual(prior.scenes);
  expect(saved.status).toBe("failed");
  await expect(page.getByTestId("gemini-key-status")).toContainText(
    "gemini-2.5-flash-lite",
  );
});
