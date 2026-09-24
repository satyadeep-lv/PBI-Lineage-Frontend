import { expect, test, type Page } from "@playwright/test";

const workspace = { id: "11111111-1111-4111-8111-111111111111", name: "Finance" };

/** The working screens the workspace navigation offers, in order, with the meta text each one shows when expanded. */
const workspaceSections = [
  ["Power BI", "Step 1"],
  ["Database", "Step 2"],
  ["Overview", "Access"],
  ["Explorer", "Inventory"],
  ["Report lineage", "Reports"],
  ["Table impact", "Impact"],
  ["Measure impact", "Impact"],
] as const;

test.describe("workspace navigation", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("lists exactly the working screens, with Overview before Explorer", async ({ page }) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    await mockShellBackend(page);

    await page.goto("/workspace/power-bi");
    await expect(page.getByRole("heading", { name: "Connect Power BI and Fabric" })).toBeVisible({ timeout: 60_000 });

    const navigation = page.getByRole("navigation", { name: "Workspace navigation" });
    const items = navigation.getByRole("button");
    await expect(items).toHaveCount(workspaceSections.length);
    for (const [index, [label, meta]] of workspaceSections.entries()) {
      await expect(items.nth(index)).toHaveAccessibleName(`${label} ${meta}`);
    }
    await expect(navigation.getByRole("button", { name: /Power BI/ })).toHaveAttribute("aria-current", "page");

    // Removed entries: the guide moved to the header's Documents menu, Scanner is unlinked, and API documentation is a Documents page.
    await expect(navigation.getByRole("button", { name: /Setup guide|Scanner|API documentation|API reference|Home/i })).toHaveCount(0);
    await expect(navigation.getByText("Setup", { exact: true })).toBeVisible();
    await expect(navigation.getByText(/^\s*(Explore|Reference)\s*$/i)).toHaveCount(0);

    const overviewBox = await navigation.getByRole("button", { name: /^Overview/ }).boundingBox();
    const explorerBox = await navigation.getByRole("button", { name: /^Explorer/ }).boundingBox();
    expect(overviewBox && explorerBox && overviewBox.y < explorerBox.y).toBe(true);

    // The collapsed icon rail offers the same items, named exactly by their labels.
    await page.getByRole("button", { name: "Collapse navigation" }).click();
    await expect(page.getByRole("button", { name: "Expand navigation" })).toBeVisible();
    await expect(items).toHaveCount(workspaceSections.length);
    for (const [index, [label]] of workspaceSections.entries()) {
      await expect(items.nth(index)).toHaveAccessibleName(label);
    }
    await page.getByRole("button", { name: "Expand navigation" }).click();

    await navigation.getByRole("button", { name: /^Overview/ }).click();
    await expect(page).toHaveURL(/\/workspace\/overview$/);
    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
    await expect(navigation.getByRole("button", { name: /^Overview/ })).toHaveAttribute("aria-current", "page");
    expect(browserErrors).toEqual([]);
  });

  test("the Documents menu marks the current document and opens API reference without the workspace navigation", async ({ page }) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    await mockShellBackend(page);

    const primaryNavigation = page.getByRole("navigation", { name: "Primary navigation" });
    const documentsMenu = primaryNavigation.getByRole("button", { name: "Documents", exact: true });
    const setupGuideItem = page.getByRole("menuitem", { name: "Setup guide", exact: true });
    const apiReferenceItem = page.getByRole("menuitem", { name: "API reference", exact: true });

    await page.goto("/");
    await expect(primaryNavigation.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(documentsMenu).not.toHaveClass(/after:bg-fabric/);
    await documentsMenu.click();
    await expect(setupGuideItem).not.toHaveAttribute("aria-current", "page");
    await expect(apiReferenceItem).not.toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");
    await expect(setupGuideItem).toHaveCount(0);

    await page.goto("/setup-guide");
    await expect(page.getByRole("heading", { name: "Set up PBI Lineage Explorer" })).toBeVisible();
    await expect(documentsMenu).toHaveClass(/after:bg-fabric/);
    await expect(primaryNavigation.getByRole("link", { name: "Home", exact: true })).not.toHaveAttribute("aria-current", "page");
    await documentsMenu.click();
    await expect(setupGuideItem).toHaveAttribute("aria-current", "page");
    await expect(apiReferenceItem).not.toHaveAttribute("aria-current", "page");

    await apiReferenceItem.click();
    await expect(page).toHaveURL(/\/workspace\/api-docs$/);
    await expect(page.getByRole("heading", { name: "API documentation" })).toBeVisible({ timeout: 60_000 });
    // API reference is a Documents page: no workspace navigation in the DOM at all, and Workspace is not the active tab.
    await expect(page.locator('nav[aria-label="Workspace navigation"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Collapse navigation" })).toHaveCount(0);
    // With no sidebar column, the page canvas takes the layout's full width.
    await expect.poll(() => mainWidthShare(page)).toBeGreaterThan(0.99);
    await expect(documentsMenu).toHaveClass(/after:bg-fabric/);
    await expect(primaryNavigation.getByRole("link", { name: "Workspace", exact: true })).not.toHaveAttribute("aria-current", "page");
    await documentsMenu.click();
    await expect(apiReferenceItem).toHaveAttribute("aria-current", "page");
    await expect(setupGuideItem).not.toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");

    // Back in a working screen, Workspace is the active tab again and Documents is not.
    await primaryNavigation.getByRole("link", { name: "Workspace", exact: true }).click();
    await expect(page).toHaveURL(/\/workspace\/power-bi$/);
    await expect(primaryNavigation.getByRole("link", { name: "Workspace", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(documentsMenu).not.toHaveClass(/after:bg-fabric/);
    await expect(page.getByRole("navigation", { name: "Workspace navigation" })).toBeVisible();
    await expect.poll(() => mainWidthShare(page)).toBeLessThan(0.9);
    expect(browserErrors).toEqual([]);
  });
});

/** The page canvas's width as a share of the layout row it sits in (1 when no sidebar column takes room). */
function mainWidthShare(page: Page) {
  return page.locator("main").first().evaluate((element) => element.getBoundingClientRect().width / element.parentElement!.getBoundingClientRect().width);
}

test("API reference has no workspace menu on mobile, while working screens keep it", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockShellBackend(page);

  await page.goto("/workspace/power-bi");
  await expect(page.getByRole("heading", { name: "Connect Power BI and Fabric" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Workspace menu" })).toBeVisible();

  await page.goto("/workspace/api-docs");
  await expect(page.getByRole("heading", { name: "API documentation" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Workspace menu" })).toHaveCount(0);
  await expect(page.locator('nav[aria-label="Workspace navigation"]')).toHaveCount(0);

  await page.getByRole("button", { name: "Open navigation menu" }).click();
  const mobileNavigation = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(mobileNavigation.getByRole("link", { name: "API reference", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(mobileNavigation.getByRole("link", { name: "Workspace", exact: true })).not.toHaveAttribute("aria-current", "page");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("the unlinked Scanner route still renders the Scanner", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await mockShellBackend(page);

  await page.goto("/workspace/scanner");
  await expect(page.getByRole("heading", { name: "Scanner" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Run scan", exact: true })).toBeVisible();

  const navigation = page.getByRole("navigation", { name: "Workspace navigation" });
  await expect(navigation.getByRole("button", { name: /Scanner/ })).toHaveCount(0);
  await expect(navigation.locator('[aria-current="page"]')).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});

test("the header shows the transparent logo mark for each theme, and the page links the favicon", async ({ page, request }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await mockShellBackend(page);

  const homeLink = page.getByRole("link", { name: "PBI Lineage Explorer home" });
  const visibleLogo = homeLink.locator("img:visible");

  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect(homeLink.locator("img")).toHaveCount(2);
  await expect(visibleLogo).toHaveCount(1);
  await expect(visibleLogo).toHaveAttribute("src", /\/tab_logo\.png$/);
  await expect.poll(() => visibleLogo.evaluate((image: HTMLImageElement) => (image.complete ? image.naturalWidth : 0))).toBeGreaterThan(0);

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(visibleLogo).toHaveCount(1);
  await expect(visibleLogo).toHaveAttribute("src", /\/tab_logo-dark\.png$/);
  await expect.poll(() => visibleLogo.evaluate((image: HTMLImageElement) => (image.complete ? image.naturalWidth : 0))).toBeGreaterThan(0);

  // The favicon is linked first, with the high-resolution PNG mark after it; both are served.
  const icons = page.locator('head link[rel="icon"]');
  await expect(page.locator('head link[rel="icon"][href="/favicon.ico"]')).toHaveCount(1);
  await expect(icons.first()).toHaveAttribute("href", "/favicon.ico");
  await expect(page.locator('head link[rel="icon"][href="/tab_logo.png"]')).toHaveCount(1);
  for (const path of ["/favicon.ico", "/tab_logo.png", "/tab_logo-dark.png"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect((await response.body()).length, path).toBeGreaterThan(0);
  }
  expect(browserErrors).toEqual([]);
});

/**
 * Every backend read is answered here — health, AI status, the OpenAPI catalog,
 * and a one-workspace estate — so no request reaches a real backend.
 */
async function mockShellBackend(page: Page) {
  await page.route("**/openapi.json", (route) => route.fulfill({ json: { openapi: "3.1.0", info: { title: "PBI Lineage", version: "1" }, paths: {} } }));
  await page.route("**/api/v1/**", (route) => {
    const url = new URL(route.request().url()).pathname;
    if (url.endsWith("/health")) return route.fulfill({ json: { status: "ok" } });
    if (url.endsWith("/ai/status")) return route.fulfill({ json: { enabled: true, configured: true, streaming_enabled: true } });
    if (url.endsWith("/workspaces")) return route.fulfill({ json: { workspaces: [workspace] } });
    if (url.includes("/lineage/estate/discover")) {
      return route.fulfill({ json: { workspaces: [{ workspace, reports: [], semantic_models: [], report_bindings: [] }], warnings: [], workspace_count: 1, report_count: 0, semantic_model_count: 0 } });
    }
    return route.fulfill({ json: {} });
  });
}
