import { expect, test, type Page } from "@playwright/test";

test.describe("desktop app shell", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("left navigation collapses, persists across reload, and preserves the active route", async ({ page }) => {
    await mockShellBackend(page);
    await page.goto("/workspace/database");
    await expect(page.getByRole("heading", { name: "Connect the Snowflake database" })).toBeVisible({ timeout: 60_000 });

    await expect(page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("button", { name: "Explorer" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Collapse navigation" })).toBeVisible();

    await page.getByRole("button", { name: "Collapse navigation" }).click();
    await expect(page.getByRole("button", { name: "Expand navigation" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Connect the Snowflake database" })).toBeVisible();
    expect(page.url()).toContain("/workspace/database");

    await page.reload();
    await expect(page.getByRole("heading", { name: "Connect the Snowflake database" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: "Expand navigation" })).toBeVisible();

    await page.getByRole("button", { name: "Expand navigation" }).click();
    await expect(page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("button", { name: "Explorer" })).toBeVisible();
  });

  test("Power AI docks beside the desktop workspace and preserves independent sidebar resizing", async ({ page }) => {
    await mockShellBackend(page);
    await page.goto("/workspace/power-bi");
    await expect(page.getByRole("heading", { name: "Connect Power BI and Fabric" })).toBeVisible({ timeout: 60_000 });

    await expect(page.getByRole("heading", { name: "Power AI", exact: true })).not.toBeVisible();
    const mainWidthClosed = await mainCanvasWidth(page);

    await page.getByRole("button", { name: "Open Power AI" }).click();
    await expect(page.getByRole("heading", { name: "Power AI", exact: true })).toBeVisible();

    // Wide desktop keeps all three columns visible: opening Power AI gives it
    // dedicated width instead of obscuring the workspace canvas. The canvas
    // eases into its narrower width (a short margin transition), so wait for it
    // to settle rather than reading the first frame.
    await expect.poll(() => mainCanvasWidth(page)).toBeLessThan(mainWidthClosed);
    const mainWidthOpen = await settledMainCanvasWidth(page);
    expect(mainWidthOpen).toBeLessThan(mainWidthClosed);

    // Left nav collapse still resizes the canvas independently, unaffected by Power AI.
    await page.getByRole("button", { name: "Collapse navigation" }).click();
    await expect(page.getByRole("button", { name: "Expand navigation" })).toBeVisible();
    await expect.poll(() => mainCanvasWidth(page)).toBeGreaterThan(mainWidthOpen);
  });

  test("theme selection supports dark, light, and persisted system preference", async ({ page }) => {
    await mockShellBackend(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/workspace/power-bi");
    await expect(page.getByRole("heading", { name: "Connect Power BI and Fabric" })).toBeVisible({ timeout: 60_000 });

    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.getByRole("button", { name: /Theme: system/i }).click();
    await page.getByRole("menuitem", { name: "Light" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("themePreference"))).toBe("light");

    await page.reload();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await expect(page.getByRole("heading", { name: "Connect Power BI and Fabric" })).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: "test-results/workspace-light-desktop.png", fullPage: true });
    await page.getByRole("button", { name: /Theme: light/i }).click();
    await page.getByRole("menuitem", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("themePreference"))).toBe("dark");
    await page.screenshot({ path: "test-results/workspace-dark-desktop.png", fullPage: true });

    await page.getByRole("button", { name: /Theme: dark/i }).click();
    await page.getByRole("menuitem", { name: "System" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("themePreference"))).toBe("system");
  });
});

test.describe("tablet app shell", () => {
  test.use({ viewport: { width: 900, height: 900 } });

  test("shows a persistent nav icon rail, and Power AI as an overlay that never reserves permanent width", async ({ page }) => {
    await mockShellBackend(page);
    await page.goto("/workspace/power-bi");
    await expect(page.getByRole("heading", { name: "Connect Power BI and Fabric" })).toBeVisible({ timeout: 60_000 });

    await expect(page.getByRole("button", { name: "Workspace menu" })).not.toBeVisible();
    await expect(page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("button", { name: "Explorer" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Power AI", exact: true })).not.toBeVisible();

    await page.getByRole("button", { name: "Open Power AI" }).click();
    await expect(page.getByRole("heading", { name: "Power AI", exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("Ask Power AI...")).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe("mobile app shell", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("hamburger opens a nav drawer, and a separate corner trigger opens the Power AI drawer", async ({ page }) => {
    await mockShellBackend(page);
    await page.goto("/workspace/power-bi");
    await expect(page.getByRole("heading", { name: "Connect Power BI and Fabric" })).toBeVisible({ timeout: 60_000 });

    await page.getByRole("button", { name: "Workspace menu" }).click();
    await expect(page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("button", { name: "Explorer" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("button", { name: "Explorer" })).not.toBeVisible();

    await page.getByRole("button", { name: "Open Power AI" }).click();
    await expect(page.getByRole("heading", { name: "Power AI", exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("Ask Power AI...")).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

async function mainCanvasWidth(page: Page) {
  return page.locator("main").first().evaluate((element) => element.getBoundingClientRect().width);
}

/** The canvas width once two readings a transition-length apart agree. */
async function settledMainCanvasWidth(page: Page) {
  let previous = await mainCanvasWidth(page);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.waitForTimeout(250);
    const current = await mainCanvasWidth(page);
    if (Math.abs(current - previous) < 0.5) return current;
    previous = current;
  }
  throw new Error(`Main canvas width never settled (last reading ${previous}px)`);
}

async function mockShellBackend(page: Page) {
  await page.route("**/openapi.json", (route) => route.fulfill({ json: { openapi: "3.1.0", info: { title: "PBI Lineage", version: "1" }, paths: {} } }));
  await page.route("**/api/v1/health", (route) => route.fulfill({ json: { status: "ok" } }));
  await page.route("**/api/v1/ai/status", (route) => route.fulfill({ json: { enabled: true, configured: true, streaming_enabled: true } }));
}
