import { test, expect, type Locator, type Page } from "@playwright/test";

async function readable(locator: Locator, minimum = 14) {
  const sizes = await locator.evaluateAll((elements) =>
    elements.map((element) => parseFloat(getComputedStyle(element).fontSize)),
  );
  expect(sizes.length).toBeGreaterThan(0);
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(minimum);
}

async function noHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(() => {
      const main = document.querySelector("main")!;
      return (
        document.documentElement.scrollWidth <= innerWidth &&
        main.scrollWidth <= main.clientWidth
      );
    }),
  ).toBe(true);
}

test.beforeEach(async ({ request }) => {
  await request.put("/api/provider", { data: { provider: "demo" } });
});

test("short desktop window scrolls navigation and content independently with pinned Settings", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 500 });
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  const scroller = page.getByRole("region", { name: "Navigation items" });
  const main = page.getByRole("main");
  const settings = navigation.getByRole("button", {
    name: "Settings",
    exact: true,
  });
  const settingsPosition = await settings.boundingBox();
  expect(settingsPosition!.y + settingsPosition!.height).toBeLessThanOrEqual(
    500,
  );
  await readable(navigation.locator(".nav-item"));
  expect(
    await scroller.evaluate((el) => el.scrollHeight > el.clientHeight),
  ).toBe(true);

  // Native wheel events also cover the scrolling path used by touchpads.
  await scroller.hover();
  await page.mouse.wheel(0, 300);
  await expect
    .poll(() => scroller.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  expect(await main.evaluate((el) => el.scrollTop)).toBe(0);
  expect(await settings.boundingBox()).toEqual(settingsPosition);

  await scroller.evaluate((el) => {
    el.scrollTop = 0;
  });
  await scroller.focus();
  await page.keyboard.press("PageDown");
  await expect
    .poll(() => scroller.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  await scroller.press("Control+End");
  await expect
    .poll(() =>
      scroller.evaluate(
        (el) => el.scrollHeight - el.clientHeight - el.scrollTop,
      ),
    )
    .toBe(0);
  await navigation
    .getByRole("button", { name: "YouTube Analytics", exact: true })
    .focus();
  await expect(
    navigation.getByRole("button", { name: "YouTube Analytics", exact: true }),
  ).toBeInViewport();
  const sidebarScroll = await scroller.evaluate((el) => el.scrollTop);
  await main.hover({ position: { x: 200, y: 100 } });
  await page.mouse.wheel(0, 450);
  await expect
    .poll(() => main.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  expect(await scroller.evaluate((el) => el.scrollTop)).toBe(sidebarScroll);
  const mainScroll = await main.evaluate((el) => el.scrollTop);
  await main.focus();
  await page.keyboard.press("PageDown");
  await expect
    .poll(() => main.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(mainScroll);
  expect(await scroller.evaluate((el) => el.scrollTop)).toBe(sidebarScroll);
  expect(await page.evaluate(() => scrollY)).toBe(0);

  await settings.click();
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  expect(await main.evaluate((el) => el.scrollTop)).toBe(0);
  await readable(
    page.locator(".settings-panel p, .settings-panel li, .settings-panel code"),
  );
  await noHorizontalOverflow(page);
});

test("mobile menu keeps all items reachable and Settings pinned at short heights", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.goto("/");
  const menu = page.getByRole("button", { name: "Open navigation" });
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await expect(navigation).toBeHidden();
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  const scroller = page.getByRole("region", { name: "Navigation items" });
  const settings = navigation.getByRole("button", {
    name: "Settings",
    exact: true,
  });
  await expect(settings).toBeInViewport({ ratio: 1 });
  await expect(
    navigation.getByRole("button", { name: "Dashboard", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await scroller.focus();
  await page.keyboard.press("End");
  await expect
    .poll(() =>
      scroller.evaluate(
        (el) => el.scrollHeight - el.clientHeight - el.scrollTop,
      ),
    )
    .toBe(0);
  for (const item of await navigation.getByRole("button").all()) {
    await page.keyboard.press("Tab");
    await expect(item).toBeFocused();
    await expect(item).toBeInViewport({ ratio: 1 });
  }
  await expect(settings).toBeInViewport();
  await settings.press("Enter");
  await expect(navigation).toBeHidden();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await readable(page.locator(".settings-panel p, .settings-panel li"));
  await noHorizontalOverflow(page);
});

for (const width of [1440, 1024, 390, 320]) {
  test(`readable dashboard, project cards and script editor at ${width}px`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    const response = await request.post("/api/projects", {
      data: {
        title: `Readable UI ${width}`,
        topic: "A beginner guide to the northern lights",
        language: "en",
        format: "short",
        duration: 60,
      },
    });
    expect(response.status()).toBe(201);
    const project = await response.json();
    expect(
      (
        await request.post(`/api/projects/${project.id}/generate`, {
          data: { version: project.version },
        })
      ).status(),
    ).toBe(200);
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: `Readable UI ${width}`, exact: true }),
    ).toBeVisible();
    await readable(
      page.locator(
        ".page-heading p, .stat-card small, .project-meta, .project-row-info h3, .hero-copy p",
      ),
    );
    await noHorizontalOverflow(page);

    await page.goto(`/?view=studio&project=${project.id}`);
    const narration = page.getByLabel("Scene 1 narration", { exact: true });
    await expect(narration).toBeVisible();
    await readable(narration, 16);
    await readable(
      page.locator(".scene-name input, .demo-banner p, .editor-tabs button"),
    );
    await noHorizontalOverflow(page);
    await page.getByRole("tab", { name: /Scene plan/ }).click();
    await readable(
      page.locator(
        ".scene-plan-fields label, .scene-plan-fields input, .scene-plan-fields textarea",
      ),
    );
    await noHorizontalOverflow(page);
    await page.goto("/?view=projects");
    await expect(
      page.getByRole("heading", { name: `Readable UI ${width}`, exact: true }),
    ).toBeVisible();
    await readable(page.locator(".project-meta, .project-row-info h3"));
    await noHorizontalOverflow(page);
    await page.goto("/?view=create");
    await expect(
      page.getByLabel("Project name", { exact: true }),
    ).toBeVisible();
    await readable(
      page.locator(
        ".create-form label, .create-form input, .create-form textarea, .format-option strong",
      ),
    );
    await noHorizontalOverflow(page);
  });
}
