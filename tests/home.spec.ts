import { expect, test } from "@playwright/test";

test("home presents a focused product overview with clear primary and setup actions", async ({ page }) => {
  const browserErrors: string[] = [];
  const healthRequests: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/health")) healthRequests.push(request.url());
  });

  await page.goto("/");

  await expect(page).toHaveTitle("PBI Lineage Explorer");
  await expect(page.getByRole("heading", { level: 1, name: "PBI Lineage Explorer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start exploring", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Setup guide", exact: true })).toBeVisible();
  await expect(page.locator("main a")).toHaveCount(2);
  await expect(page.locator("main")).not.toContainText(/Snowflake/i);

  const primaryNavigation = page.getByRole("navigation", { name: "Primary navigation" });
  await expect(primaryNavigation.getByRole("link", { name: "Home", exact: true })).toBeVisible();
  await expect(primaryNavigation.getByRole("link", { name: "Setup guide", exact: true })).toBeVisible();
  await expect(primaryNavigation.getByRole("link", { name: "Workspace", exact: true })).toBeVisible();
  await expect(primaryNavigation.getByRole("link", { name: "API reference", exact: true })).toBeVisible();

  const productImage = page.getByRole("img", { name: "PBI Lineage Explorer report lineage workspace" });
  await expect(productImage).toBeVisible();
  expect(await productImage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByText("Developed by Satyadeep Singh")).toBeVisible();
  expect(healthRequests).toEqual([]);
  expect(browserErrors).toEqual([]);

  await page.screenshot({ path: "test-results/home-desktop.png", fullPage: true });

  await primaryNavigation.getByRole("link", { name: "Setup guide", exact: true }).click();
  await expect(page).toHaveURL(/\/setup-guide$/);
});

test("home navigation and content remain usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "PBI Lineage Explorer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start exploring", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open navigation menu" })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "test-results/home-mobile.png", fullPage: true });

  await page.getByRole("button", { name: "Open navigation menu" }).click();
  const mobileNavigation = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(mobileNavigation.getByRole("link", { name: "Setup guide", exact: true })).toBeVisible();
  await expect(mobileNavigation.getByRole("link", { name: "Workspace", exact: true })).toBeVisible();
  await expect(mobileNavigation.getByRole("link", { name: "API reference", exact: true })).toBeVisible();
});
