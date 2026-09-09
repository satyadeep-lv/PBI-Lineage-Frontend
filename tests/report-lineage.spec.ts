import { expect, test, type Page } from "@playwright/test";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const reportId = "22222222-2222-4222-8222-222222222222";
const modelId = "33333333-3333-4333-8333-333333333333";

test("report lineage exposes report evidence and focused dependency diagrams", async ({ page }) => {
  await mockBackend(page);

  const browserErrors: string[] = [];
  page.on("pageerror", (error) => {
    browserErrors.push(error.message);
    console.log(`Browser error: ${error.message}`);
  });
  page.on("requestfailed", (request) => console.log(`Request failed: ${request.url()} (${request.failure()?.errorText})`));

  await page.goto("/workspace/report-lineage");
  await expect(page.getByRole("heading", { name: "Report lineage" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByLabel("Report", { exact: true })).toHaveValue(`${workspaceId}:${reportId}`);
  await expect(page.getByText("Selected report ID:")).toContainText(reportId);
  await expect(page.getByText("Sales Performance", { exact: true }).first()).toBeVisible();

  const tableViews = [
    ["Database objects", "Database objects used"],
    ["Semantic objects", "Semantic objects"],
    ["Visual objects", "Visual objects"],
    ["Semantic source mapping", "Semantic source mapping"],
    ["Visual source mapping", "Visual semantic source mapping"],
  ] as const;
  for (const [tab, heading] of tableViews) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy table" })).toBeVisible();
    await expect(page.getByRole("button", { name: "CSV" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Excel" })).toBeVisible();
  }

  await page.getByRole("tab", { name: "Lineage", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Lineage diagrams" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sales Performance lineage" })).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(5);

  await page.getByRole("tab", { name: "Column lineage" }).click();
  await expect(page.getByText("4 exact DAX relationships ready")).toBeVisible();
  await expect(page.getByLabel("Column", { exact: true })).toHaveValue("column\u001fSales\u001fAmount");
  await expect(page.getByText("Sales[Amount]", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("Sales[Total Sales]", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Measure & calculated column" }).click();
  await page.getByLabel("Target calculation").selectOption({ label: "Total Sales (Measure)" });
  await expect(page.getByRole("heading", { name: "Measure lineage" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy DAX" })).toBeVisible();
  await expect(page.getByText("Sales[KPI]", { exact: true })).toBeVisible();
  await expect(page.locator(".react-flow__node").first()).toBeVisible();

  await page.screenshot({ path: "test-results/report-lineage.png", fullPage: true });
  expect(browserErrors).toEqual([]);
});

test("report lineage remains contained and usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockBackend(page);
  await page.goto("/workspace/report-lineage");

  await expect(page.getByRole("heading", { name: "Report lineage" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Workspace menu" })).toBeVisible();
  await page.getByRole("tab", { name: "Lineage", exact: true }).click();
  await page.getByRole("tab", { name: "Column lineage" }).click();
  await expect(page.getByLabel("Semantic table", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Column", { exact: true })).toBeVisible();
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "test-results/report-lineage-mobile.png", fullPage: true });
});

async function mockBackend(page: Page) {
  await page.route("**/openapi.json", (route) => route.fulfill({ json: { openapi: "3.1.0", info: { title: "PBI Lineage", version: "1" }, paths: {} } }));
  await page.route("**/api/v1/lineage/estate/discover**", (route) => route.fulfill({ json: estateResponse }));
  await page.route("**/api/v1/explorer/snapshot", (route) => route.fulfill({ json: snapshotResponse }));
  await page.route("**/api/v1/workspaces/*/semantic-models/*/definition/parsed**", (route) => route.fulfill({ json: parsedModel }));
  await page.route("**/api/v1/lineage/dax/analyze", (route) => route.fulfill({ json: daxAnalysis }));
}

const estateResponse = {
  workspaces: [{
    workspace: { id: workspaceId, name: "Finance" },
    reports: [{ id: reportId, name: "Sales Performance", dataset_id: modelId, report_type: "PowerBIReport", format: "PBIR", is_owned_by_me: true }],
    semantic_models: [{ id: modelId, name: "Sales Model" }],
    report_bindings: [{ report_id: reportId, semantic_model_id: modelId, status: "matched" }],
  }],
  graph: {
    nodes: [
      { node_id: "report-node", node_type: "report", name: "Sales Performance", workspace_id: workspaceId, report_id: reportId },
      { node_id: "model-node", node_type: "semantic_model", name: "Sales Model", workspace_id: workspaceId, semantic_model_id: modelId },
    ],
    edges: [{ source_id: "report-node", target_id: "model-node" }],
  },
  warnings: [],
  workspace_count: 1,
  report_count: 1,
  semantic_model_count: 1,
};

const semanticObjects = [
  { semantic_table: "Sales", semantic_object_type: "column", semantic_object_name: "Amount", semantic_data_type: "decimal", semantic_source_column: "AMOUNT", semantic_dax_expression: null, source_path: "SNOWFLAKE.SALES.AMOUNT" },
  { semantic_table: "Sales", semantic_object_type: "column", semantic_object_name: "Quantity", semantic_data_type: "int64", semantic_source_column: "QUANTITY", semantic_dax_expression: null, source_path: "SNOWFLAKE.SALES.QUANTITY" },
  { semantic_table: "Sales", semantic_object_type: "calculated_column", semantic_object_name: "Extended", semantic_data_type: "decimal", semantic_source_column: null, semantic_dax_expression: "Sales[Amount] * Sales[Quantity]", source_path: "Sales[Extended]" },
  { semantic_table: "Sales", semantic_object_type: "measure", semantic_object_name: "KPI", semantic_data_type: null, semantic_source_column: null, semantic_dax_expression: "DIVIDE([Total Sales], 100)", source_path: "Sales[KPI]" },
  { semantic_table: "Sales", semantic_object_type: "measure", semantic_object_name: "Total Sales", semantic_data_type: null, semantic_source_column: null, semantic_dax_expression: "SUM(Sales[Amount])", source_path: "Sales[Total Sales]" },
];

const layoutRows = [
  { page_id: "overview", page_name: "Overview", page_order: 0, visual_id: "sales-card", visual_name: "Total sales", visual_type: "card", field_usage: "value", field_role: "Values", field_type: "measure", table_name: "Sales", column_measure_name: "Total Sales", query_reference: "Sales.Total Sales" },
  { page_id: "overview", page_name: "Overview", page_order: 0, visual_id: "sales-chart", visual_name: "Sales by quantity", visual_type: "columnChart", field_usage: "value", field_role: "Values", field_type: "column", table_name: "Sales", column_measure_name: "Amount", query_reference: "Sales.Amount" },
];

const snapshotResponse = {
  generated_at: "2026-09-02T00:00:00Z",
  report_count: 1,
  semantic_model_count: 1,
  warnings: [],
  source_database_lineage: { count: 1, rows: [{ semantic_table: "Sales", source_id: "snowflake-sales", source_kind: "database", source_provider: "Snowflake", source_connector: "Snowflake", source_server: "account.snowflakecomputing.com", source_database: "ANALYTICS", source_schema: "PUBLIC", source_object_name: "SALES", source_object_type: "table", source_fully_qualified_name: "ANALYTICS.PUBLIC.SALES" }] },
  semantic_model_objects: { count: semanticObjects.length, rows: semanticObjects },
  measure_source_lineage: { count: 4, rows: [
    { semantic_table: "Sales", semantic_object_type: "measure", semantic_object_name: "Total Sales", semantic_dax_expression: "SUM(Sales[Amount])", source_semantic_table: "Sales", source_semantic_object_type: "column", source_semantic_object_name: "Amount", source_column_name: "AMOUNT", dependency_depth: 1, is_direct_dependency: true, source_provider: "Snowflake", source_fully_qualified_name: "ANALYTICS.PUBLIC.SALES" },
    { semantic_table: "Sales", semantic_object_type: "calculated_column", semantic_object_name: "Extended", semantic_dax_expression: "Sales[Amount] * Sales[Quantity]", source_semantic_table: "Sales", source_semantic_object_type: "column", source_semantic_object_name: "Amount", source_column_name: "AMOUNT", dependency_depth: 1, is_direct_dependency: true, source_provider: "Snowflake", source_fully_qualified_name: "ANALYTICS.PUBLIC.SALES" },
    { semantic_table: "Sales", semantic_object_type: "calculated_column", semantic_object_name: "Extended", semantic_dax_expression: "Sales[Amount] * Sales[Quantity]", source_semantic_table: "Sales", source_semantic_object_type: "column", source_semantic_object_name: "Quantity", source_column_name: "QUANTITY", dependency_depth: 1, is_direct_dependency: true, source_provider: "Snowflake", source_fully_qualified_name: "ANALYTICS.PUBLIC.SALES" },
    { semantic_table: "Sales", semantic_object_type: "measure", semantic_object_name: "KPI", semantic_dax_expression: "DIVIDE([Total Sales], 100)", source_semantic_table: "Sales", source_semantic_object_type: "measure", source_semantic_object_name: "Total Sales", source_column_name: null, dependency_depth: 1, is_direct_dependency: true, source_provider: "Snowflake", source_fully_qualified_name: "ANALYTICS.PUBLIC.SALES" },
  ] },
  report_layout: { count: layoutRows.length, rows: layoutRows },
  visual_source_lookup: { count: 2, rows: [
    { page_id: "overview", page_name: "Overview", visual_id: "sales-card", visual_name: "Total sales", visual_type: "card", field_usage: "value", field_role: "Values", field_type: "measure", visual_table_name: "Sales", visual_field_name: "Total Sales", semantic_table: "Sales", semantic_object_name: "Total Sales", semantic_object_type: "measure", semantic_object_source_path: "Sales[Total Sales]", match_status: "matched", match_confidence: 1, match_reason: "Exact table and object match" },
    { page_id: "overview", page_name: "Overview", visual_id: "sales-chart", visual_name: "Sales by quantity", visual_type: "columnChart", field_usage: "value", field_role: "Values", field_type: "column", visual_table_name: "Sales", visual_field_name: "Amount", semantic_table: "Sales", semantic_object_name: "Amount", semantic_object_type: "column", semantic_object_source_path: "SNOWFLAKE.SALES.AMOUNT", match_status: "matched", match_confidence: 1, match_reason: "Exact table and object match" },
  ] },
};

const parsedModel = {
  workspace_id: workspaceId,
  semantic_model_id: modelId,
  format: "TMDL",
  tables: [{
    name: "Sales",
    source_path: "ANALYTICS.PUBLIC.SALES",
    expression: null,
    columns: [
      { name: "Amount", source_path: "ANALYTICS.PUBLIC.SALES", source_column: "AMOUNT", data_type: "decimal", expression: null },
      { name: "Quantity", source_path: "ANALYTICS.PUBLIC.SALES", source_column: "QUANTITY", data_type: "int64", expression: null },
      { name: "Extended", source_path: null, source_column: null, data_type: "decimal", expression: "Sales[Amount] * Sales[Quantity]" },
    ],
    measures: [
      { name: "KPI", expression: "DIVIDE([Total Sales], 100)" },
      { name: "Total Sales", expression: "SUM(Sales[Amount])" },
    ],
    hierarchies: [],
  }],
  relationships: [],
  warnings: [],
};

const ref = (object_type: string, object_name: string) => ({ object_type, table_name: "Sales", object_name, qualified_name: `Sales[${object_name}]` });
const daxAnalysis = {
  objects: [],
  dependencies: [
    { source: ref("column", "Amount"), target: ref("measure", "Total Sales"), reference_text: "Sales[Amount]" },
    { source: ref("column", "Amount"), target: ref("calculated_column", "Extended"), reference_text: "Sales[Amount]" },
    { source: ref("column", "Quantity"), target: ref("calculated_column", "Extended"), reference_text: "Sales[Quantity]" },
    { source: ref("measure", "Total Sales"), target: ref("measure", "KPI"), reference_text: "[Total Sales]" },
  ],
  warnings: [],
  object_count: 5,
  dependency_count: 4,
};
