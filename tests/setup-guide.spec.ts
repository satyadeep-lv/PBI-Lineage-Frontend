import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/health", (route) => route.fulfill({ json: { status: "ok" } }));
});

test("setup guide is available from navigation and leads into the application", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/setup-guide");

  await expect(page).toHaveTitle("Setup Guide | PBI Lineage Explorer");
  await expect(page.getByRole("heading", { name: "Set up PBI Lineage Explorer" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Configure Power BI and Fabric" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Enable the Power BI Admin Scanner" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Configure optional Snowflake access" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Configure the FastAPI backend and host" })).toBeVisible();
  await expect(page.getByText("Developed by Satyadeep Singh")).toBeVisible();

  await expect(page.getByRole("link", { name: "Power BI REST API overview" })).toHaveAttribute(
    "href",
    "https://learn.microsoft.com/en-us/rest/api/power-bi/",
  );
  await expect(page.getByRole("link", { name: "SNOWFLAKE.CORE.GET_LINEAGE" })).toHaveAttribute(
    "href",
    "https://docs.snowflake.com/en/sql-reference/functions/get_lineage-snowflake-core",
  );

  await page.screenshot({ path: "test-results/setup-guide-desktop.png" });

  await page.getByRole("button", { name: "View overview" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "PBI Lineage Explorer" })).toBeVisible();

  await page.goto("/workspace/power-bi");
  await page.getByRole("button", { name: "Setup guide Start", exact: true }).click();
  await expect(page).toHaveURL(/\/setup-guide$/);
  await expect(page.getByRole("heading", { name: "Set up PBI Lineage Explorer" })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("setup guide remains contained and usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/setup-guide");

  await expect(page.getByRole("heading", { name: "Set up PBI Lineage Explorer" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Setup guide sections on small screens" })).toBeVisible();
  const startPowerBi = page.getByRole("button", { name: "Start Power BI setup" });
  await startPowerBi.scrollIntoViewIfNeeded();
  await expect(startPowerBi).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "test-results/setup-guide-mobile.png" });

  await page.setViewportSize({ width: 820, height: 900 });
  await expect(page.getByRole("button", { name: "Open navigation menu" })).toBeVisible();
  const tabletOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(tabletOverflow).toBeLessThanOrEqual(1);
});
