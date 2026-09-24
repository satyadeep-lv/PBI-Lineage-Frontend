import { expect, test, type Page } from "@playwright/test";

// The lineage grid is wide; a narrow viewport leaves right-hand columns unrendered by AG Grid.
test.use({ viewport: { width: 1920, height: 1080 } });

const workspaceId = "11111111-1111-4111-8111-111111111111";
const semanticModelId = "22222222-2222-4222-8222-222222222222";

test("explorer's physical column lineage tab maps semantic objects to physical columns", async ({ page }) => {
  const lineageRequests: string[] = [];
  await mockColumnLineageBackend(page, lineageRequests);

  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/workspace/explorer");
  await expect(page.getByRole("heading", { name: "Explorer" })).toBeVisible({ timeout: 60_000 });

  // The XMLA-backed request must not fire until the operator opens the tab.
  expect(lineageRequests).toEqual([]);

  await page.getByRole("tab", { name: "Physical column lineage" }).click();
  await expect(page.getByRole("heading", { name: "Semantic object to physical column lineage" })).toBeVisible();

  // The workspace name is passed so the backend can skip its own lookup when opening XMLA.
  await expect.poll(() => lineageRequests.length).toBe(1);
  expect(lineageRequests[0]).toContain(`/api/v1/workspaces/${workspaceId}/semantic-models/${semanticModelId}/column-lineage`);
  expect(lineageRequests[0]).toContain("workspaceName=Finance");

  // Backend-reported counts, plus the resolved/unresolved split derived from the rows.
  const metrics = page.locator("p.text-xs", { hasText: "Semantic objects" });
  await expect(metrics.first()).toBeVisible();
  await expect(page.getByText("Rows with a physical column")).toBeVisible();
  await expect(page.getByText("Rows without a physical match")).toBeVisible();

  // Semantic side and physical side of the same mapping, asserted inside the grid only.
  const grid = page.getByRole("grid");
  await expect(grid.getByText("FACT_PAYMENTS[Total Payment]")).toBeVisible();
  await expect(grid.getByText("FACT_PAYMENTS[PAYMENT_AMOUNT]")).toBeVisible();
  await expect(grid.getByText("SALES_ANALYTICS.WAREHOUSE.FACT_PAYMENTS.PAYMENT_AMOUNT")).toBeVisible();
  await expect(grid.getByText("Same name assumed")).toBeVisible();
  await expect(grid.getByText("snowflake", { exact: true }).first()).toBeVisible();

  // A dependency the backend could not resolve is kept and labelled, never dropped or invented.
  await expect(grid.getByText("Not resolved")).toBeVisible();

  // Backend warnings are surfaced verbatim.
  await expect(page.getByText("Partition query could not be parsed.")).toBeVisible();

  await expect(page.getByRole("button", { name: "Copy table" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "CSV" }).first()).toBeVisible();

  await page.screenshot({ path: "test-results/column-lineage.png", fullPage: true });
  expect(browserErrors).toEqual([]);
});

test("physical column lineage filters by object type and by resolved physical column", async ({ page }) => {
  await mockColumnLineageBackend(page, []);

  await page.goto("/workspace/explorer");
  await expect(page.getByRole("heading", { name: "Explorer" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("tab", { name: "Physical column lineage" }).click();

  const grid = page.getByRole("grid");
  await expect(grid.getByText("FACT_PAYMENTS[Total Payment]")).toBeVisible();

  // Narrowing to calculated columns drops the measure rows.
  await page.getByLabel("Semantic object type").selectOption("Calculated column");
  await expect(grid.getByText("DIM_CUSTOMER[Customer Tier]")).toBeVisible();
  await expect(grid.getByText("FACT_PAYMENTS[Total Payment]")).toHaveCount(0);

  // Resolved-only hides the row with no physical match.
  await page.getByLabel("Semantic object type").selectOption("All");
  await expect(grid.getByText("Not resolved")).toBeVisible();
  await page.getByLabel("Only rows with a resolved physical column").check();
  await expect(grid.getByText("Not resolved")).toHaveCount(0);
  await expect(grid.getByText("FACT_PAYMENTS[Total Payment]")).toBeVisible();
});

test("physical column lineage reports an unavailable XMLA connection instead of blanking", async ({ page }) => {
  await mockColumnLineageBackend(page, [], {
    lineage: (route) => route.fulfill({ status: 503, json: { detail: "XMLA endpoint is not enabled for this capacity." } }),
  });

  await page.goto("/workspace/explorer");
  await expect(page.getByRole("heading", { name: "Explorer" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("tab", { name: "Physical column lineage" }).click();

  await expect(page.getByText("XMLA endpoint is not enabled for this capacity.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Semantic object to physical column lineage" })).toBeVisible();
});

async function mockColumnLineageBackend(
  page: Page,
  requests: string[],
  options: { lineage?: Parameters<Page["route"]>[1] } = {},
) {
  await page.route("**/openapi.json", (route) => route.fulfill({ json: { openapi: "3.1.0", info: { title: "PBI Lineage", version: "1" }, paths: {} } }));
  await page.route("**/api/v1/workspaces?top=100&skip=0", (route) => route.fulfill({ json: { workspaces: [{ id: workspaceId, name: "Finance" }] } }));
  await page.route("**/api/v1/workspaces/*/reports", (route) => route.fulfill({ json: { reports: [] } }));
  await page.route("**/api/v1/workspaces/*/semantic-models", (route) => route.fulfill({ json: { semantic_models: [{ id: semanticModelId, name: "Payments Model" }] } }));
  await page.route("**/definition/parsed*", (route) => route.fulfill({ json: { name: "Payments Model", tables: [] } }));
  await page.route("**/api/v1/lineage/dax/analyze", (route) => route.fulfill({ json: { objects: [], dependencies: [] } }));

  await page.route("**/column-lineage*", (route) => {
    requests.push(route.request().url());
    if (options.lineage) return options.lineage(route, route.request());
    return route.fulfill({ json: columnLineageResponse });
  });
}

const columnLineageResponse = {
  workspace_id: workspaceId,
  semantic_model_id: semanticModelId,
  object_count: 3,
  row_count: 3,
  rows: [
    {
      semantic_table: "FACT_PAYMENTS",
      semantic_object_type: "measure",
      semantic_object_name: "Total Payment",
      semantic_dax_expression: "sum(FACT_PAYMENTS[PAYMENT_AMOUNT])",
      referenced_semantic_table: "FACT_PAYMENTS",
      referenced_semantic_column: "PAYMENT_AMOUNT",
      dependency_depth: 1,
      is_direct_dependency: true,
      physical_columns: [
        {
          source_id: "source:c4437debdd70366f8b2c16df",
          provider: "snowflake",
          server: "NQDOMMQ-JZ33509.snowflakecomputing.com",
          database: "SALES_ANALYTICS",
          schema_name: "WAREHOUSE",
          object_name: "FACT_PAYMENTS",
          column_name: "PAYMENT_AMOUNT",
          resolution_method: "same_name_assumed",
          fully_qualified_name: "SALES_ANALYTICS.WAREHOUSE.FACT_PAYMENTS.PAYMENT_AMOUNT",
        },
      ],
    },
    {
      semantic_table: "DIM_CUSTOMER",
      semantic_object_type: "calculated_column",
      semantic_object_name: "Customer Tier",
      semantic_dax_expression: "IF(DIM_CUSTOMER[REVENUE] > 1000, \"Gold\", \"Silver\")",
      referenced_semantic_table: "DIM_CUSTOMER",
      referenced_semantic_column: "REVENUE",
      dependency_depth: 1,
      is_direct_dependency: true,
      physical_columns: [
        {
          source_id: "source:a1b2c3d4e5f6",
          provider: "snowflake",
          server: "NQDOMMQ-JZ33509.snowflakecomputing.com",
          database: "SALES_ANALYTICS",
          schema_name: "WAREHOUSE",
          object_name: "DIM_CUSTOMER",
          column_name: "REVENUE",
          resolution_method: "native_query_select",
          fully_qualified_name: "SALES_ANALYTICS.WAREHOUSE.DIM_CUSTOMER.REVENUE",
        },
      ],
    },
    {
      semantic_table: "FACT_PAYMENTS",
      semantic_object_type: "measure",
      semantic_object_name: "Payment Count",
      semantic_dax_expression: "COUNTROWS(FACT_PAYMENTS)",
      referenced_semantic_table: null,
      referenced_semantic_column: null,
      dependency_depth: null,
      is_direct_dependency: null,
      physical_columns: [],
    },
  ],
  warnings: [
    { code: "partition_query_unparsed", message: "Partition query could not be parsed.", object_name: "FACT_PAYMENTS", source_path: null },
  ],
};
