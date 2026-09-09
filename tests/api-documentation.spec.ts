import { expect, test } from "@playwright/test";

test("API documentation validates and executes OpenAPI operations", async ({ page }) => {
  let postedBody: Record<string, unknown> | null = null;
  await page.route("**/openapi.json", (route) => route.fulfill({ json: openApiDocument }));
  await page.route("**/api/v1/health", (route) => route.fulfill({ json: { status: "ok" } }));
  await page.route("**/api/v1/test/*", async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "get-test-123" },
      body: JSON.stringify({ item_id: decodeURIComponent(url.pathname.split("/").pop() ?? ""), mode: url.searchParams.get("mode") }),
    });
  });
  await page.route("**/api/v1/test", async (route) => {
    postedBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      headers: { "content-type": "application/json", "x-request-id": "post-test-456" },
      body: JSON.stringify({ accepted: { name: postedBody.name, count: postedBody.count } }),
    });
  });

  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/workspace/api-docs");
  await expect(page.getByRole("heading", { name: "API documentation" })).toBeVisible();
  await expect(page.getByText("Execution enabled")).toBeVisible();

  const getOperation = page.locator("article").filter({ hasText: "Get test item" });
  await getOperation.getByRole("button", { name: "Execute" }).click();
  await getOperation.getByRole("button", { name: "Run API" }).click();
  await expect(getOperation.getByRole("alert")).toContainText("Set required value: item_id");

  await getOperation.getByLabel("item_id").fill("order 42");
  await getOperation.getByLabel("mode").selectOption("full");
  await getOperation.getByRole("button", { name: "Run API" }).click();
  await expect(getOperation.getByText("200", { exact: true })).toBeVisible();
  await expect(getOperation.getByText('"item_id": "order 42"')).toBeVisible();
  await expect(getOperation.getByText('"mode": "full"')).toBeVisible();
  await getOperation.getByRole("tab", { name: "Headers" }).click();
  await expect(getOperation.getByText('"x-request-id": "get-test-123"')).toBeVisible();
  await expect(getOperation.getByRole("button", { name: "Copy output" })).toBeEnabled();

  const postOperation = page.locator("article").filter({ hasText: "Create test item" });
  await postOperation.getByRole("button", { name: "Execute" }).click();
  const bodyEditor = postOperation.getByLabel("JSON request body");
  await expect(bodyEditor).toHaveValue(/"name": "Example item"/);
  await expect(bodyEditor).toHaveValue(/"count": 1/);

  await bodyEditor.fill("{");
  await postOperation.getByRole("button", { name: "Run API" }).click();
  await expect(postOperation.getByRole("alert")).toContainText("Request body is not valid JSON");

  await bodyEditor.fill(JSON.stringify({ name: "Created item", count: 2, client_secret: "temporary-secret" }, null, 2));
  await postOperation.getByRole("button", { name: "Run API" }).click();
  await expect(postOperation.getByText("201", { exact: true })).toBeVisible();
  await expect(postOperation.locator("pre")).toContainText('"name": "Created item"');
  await expect(bodyEditor).not.toHaveValue(/temporary-secret/);
  await expect(bodyEditor).toHaveValue(/"client_secret": ""/);
  expect(postedBody).toMatchObject({ client_secret: "temporary-secret" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "API documentation" })).toBeVisible();
  const mobileOperation = page.locator("article").filter({ hasText: "Create test item" });
  await mobileOperation.getByRole("button", { name: "Execute" }).click();
  await expect(mobileOperation.getByRole("button", { name: "Run API" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "test-results/api-documentation-mobile.png", fullPage: true });
  expect(browserErrors).toEqual([]);
});

const openApiDocument = {
  openapi: "3.1.0",
  info: { title: "PBI Lineage Test API", version: "1.0.0" },
  paths: {
    "/api/v1/test/{item_id}": {
      get: {
        tags: ["Testing"],
        summary: "Get test item",
        description: "Returns one test item for API execution verification.",
        operationId: "get_test_item",
        parameters: [
          { name: "item_id", in: "path", required: true, description: "Item name or identifier.", schema: { type: "string" } },
          { name: "mode", in: "query", required: false, description: "Response detail mode.", schema: { type: "string", enum: ["summary", "full"] } },
        ],
      },
    },
    "/api/v1/test": {
      post: {
        tags: ["Testing"],
        summary: "Create test item",
        description: "Creates a test item from a JSON body.",
        operationId: "create_test_item",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/TestRequest" } } },
        },
      },
    },
  },
  components: {
    schemas: {
      TestRequest: {
        type: "object",
        properties: {
          name: { type: "string", example: "Example item" },
          count: { type: "integer", default: 1 },
          client_secret: { type: "string" },
        },
      },
    },
  },
};
