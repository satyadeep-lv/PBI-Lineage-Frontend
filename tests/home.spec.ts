import { expect, test, type Locator } from "@playwright/test";

const walkthroughName = "Animated walkthrough of PBI Lineage Explorer";

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

  // Home and Workspace are links; the reference material lives under the Documents menu.
  const primaryNavigation = page.getByRole("navigation", { name: "Primary navigation" });
  await expect(primaryNavigation.getByRole("link")).toHaveCount(2);
  await expect(primaryNavigation.getByRole("link", { name: "Home", exact: true })).toBeVisible();
  await expect(primaryNavigation.getByRole("link", { name: "Workspace", exact: true })).toBeVisible();
  await expect(primaryNavigation.getByRole("link", { name: "Setup guide" })).toHaveCount(0);
  await expect(primaryNavigation.getByRole("link", { name: "API reference" })).toHaveCount(0);
  const documentsMenu = primaryNavigation.getByRole("button", { name: "Documents", exact: true });
  await expect(documentsMenu).toBeVisible();

  // The walkthrough animation replaces the old static product screenshot.
  const walkthrough = page.getByRole("img", { name: walkthroughName });
  await expect(walkthrough).toHaveCount(1);
  await walkthrough.scrollIntoViewIfNeeded();
  await expect(walkthrough).toBeVisible();
  await expect.poll(() => naturalWidth(walkthrough)).toBeGreaterThan(0);
  await expect(page.getByRole("img", { name: "PBI Lineage Explorer report lineage workspace" })).toHaveCount(0);
  await expect(page.getByText("Developed by Satyadeep Singh")).toBeVisible();
  expect(healthRequests).toEqual([]);
  expect(browserErrors).toEqual([]);

  await page.screenshot({ path: "test-results/home-desktop.png", fullPage: true });

  await documentsMenu.click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem")).toHaveCount(2);
  await expect(menu.getByRole("menuitem", { name: "Setup guide", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "API reference", exact: true })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Setup guide", exact: true }).click();
  await expect(page).toHaveURL(/\/setup-guide$/);
  await expect(page.getByRole("heading", { name: "Set up PBI Lineage Explorer" })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("the walkthrough follows the theme and shows its still poster under reduced motion", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const walkthrough = page.getByRole("img", { name: walkthroughName });
  await walkthrough.scrollIntoViewIfNeeded();
  await expect(walkthrough).toHaveCount(1);
  await expect.poll(() => currentSrc(walkthrough)).toMatch(/\/how-to-use-dark\.gif$/);
  await expect.poll(() => naturalWidth(walkthrough)).toBeGreaterThan(0);

  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.reload();
  await walkthrough.scrollIntoViewIfNeeded();
  await expect(walkthrough).toHaveCount(1);
  await expect(walkthrough).toBeVisible();
  await expect.poll(() => currentSrc(walkthrough)).toMatch(/\.png$/);
  await expect.poll(() => currentSrc(walkthrough)).toMatch(/\/how-to-use-light\.png$/);
  await expect.poll(() => naturalWidth(walkthrough)).toBeGreaterThan(0);
  expect(browserErrors).toEqual([]);
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
  await expect(mobileNavigation.getByText("Documents", { exact: true })).toBeVisible();
  await expect(mobileNavigation.getByRole("link", { name: "Setup guide", exact: true })).toBeVisible();
  await expect(mobileNavigation.getByRole("link", { name: "Workspace", exact: true })).toBeVisible();
  await expect(mobileNavigation.getByRole("link", { name: "API reference", exact: true })).toBeVisible();
});

function naturalWidth(image: Locator) {
  return image.evaluate((element: HTMLImageElement) => (element.complete ? element.naturalWidth : 0));
}

function currentSrc(image: Locator) {
  return image.evaluate((element: HTMLImageElement) => element.currentSrc);
}
