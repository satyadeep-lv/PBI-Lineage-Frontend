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

  test("Power AI is a floating overlay on desktop too — it never reserves permanent canvas width", async ({ page }) => {
    await mockShellBackend(page);
    await page.goto("/workspace/power-bi");
    await expect(page.getByRole("heading", { name: "Connect Power BI and Fabric" })).toBeVisible({ timeout: 60_000 });

    await expect(page.getByRole("heading", { name: "Power AI", exact: true })).not.toBeVisible();
    const mainWidthClosed = await mainCanvasWidth(page);

    await page.getByRole("button", { name: "Open Power AI" }).click();
    await expect(page.getByRole("heading", { name: "Power AI", exact: true })).toBeVisible();

    // Opening Power AI floats over the canvas rather than shrinking it.
    const mainWidthOpen = await mainCanvasWidth(page);
    expect(mainWidthOpen).toBe(mainWidthClosed);

    // Left nav collapse still resizes the canvas independently, unaffected by Power AI.
    await page.getByRole("button", { name: "Collapse navigation" }).click();
    await expect(page.getByRole("button", { name: "Expand navigation" })).toBeVisible();
    const mainWidthNavCollapsed = await mainCanvasWidth(page);
    expect(mainWidthNavCollapsed).toBeGreaterThan(mainWidthOpen);
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

async function mockShellBackend(page: Page) {
  await page.route("**/openapi.json", (route) => route.fulfill({ json: { openapi: "3.1.0", info: { title: "PBI Lineage", version: "1" }, paths: {} } }));
  await page.route("**/api/v1/health", (route) => route.fulfill({ json: { status: "ok" } }));
  await page.route("**/api/v1/ai/status", (route) => route.fulfill({ json: { enabled: true, configured: true, streaming_enabled: true } }));
}
