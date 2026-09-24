import { expect, test, type Page } from "@playwright/test";

// Reading a grid's own export back is the only reliable way to assert on columns
// AG Grid has virtualized out of the DOM.
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const workspaceId = "11111111-1111-4111-8111-111111111111";
const reportId = "22222222-2222-4222-8222-222222222222";
const modelId = "33333333-3333-4333-8333-333333333333";

/** The five report-scoped views, shared with Explorer, in the order they are offered. */
const sections = [
  ["Page details", "Report page details"],
  ["Source DB lineage", "Source database lineage"],
  ["Semantic objects", "Semantic model objects"],
  ["Semantic - DB objects mappings", "Semantic to database object mappings"],
  ["Report visuals", "Report visual lineage"],
] as const;

test("report lineage offers the explorer report sections for one estate-wide report", async ({ page }) => {
  await mockBackend(page);

  const browserErrors: string[] = [];
  page.on("pageerror", (error) => {
    browserErrors.push(error.message);
    console.log(`Browser error: ${error.message}`);
  });
  page.on("requestfailed", (request) => console.log(`Request failed: ${request.url()} (${request.failure()?.errorText})`));

  await page.goto("/workspace/report-lineage");
  await expect(page.getByRole("heading", { name: "Report lineage" })).toBeVisible({ timeout: 60_000 });

  // Granularity is one report, picked by name from anywhere in the estate.
  await expect(page.getByLabel("Report", { exact: true })).toHaveValue(`${workspaceId}:${reportId}`);
  await expect(page.getByText("Selected report ID:")).toContainText(reportId);
  await expect(page.getByText("Sales Performance", { exact: true }).first()).toBeVisible();

  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveText(sections.map(([label]) => label));

  for (const [tab, heading] of sections) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy table" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "CSV" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Excel" }).first()).toBeVisible();
  }

  // Source DB lineage carries the composite-model hop and offers its tables to a Snowflake trace.
  // The Via column is off-screen at this width and AG Grid keeps off-screen cells
  // out of the DOM entirely, so it is read back through the export instead.
  await page.getByRole("tab", { name: "Source DB lineage", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Source database lineage" })).toBeVisible();
  await page.getByRole("button", { name: "Copy table" }).first().click();
  const exported = await page.evaluate(() => navigator.clipboard.readText());
  expect(exported).toContain("via");
  expect(exported).toContain("Shared / Reference Model / Region");
  expect(exported).toContain("Direct");
  // An unresolved row is still listed rather than hidden.
  expect(exported).toContain("Not resolved");
  await expect(page.getByText("Snowflake object lineage")).toBeVisible();
  await expect(page.getByLabel("Fully qualified table")).toHaveValue("ANALYTICS.PUBLIC.SALES");

  // The mapping grid feeds both the measure definition panel and the column trace.
  await page.getByRole("tab", { name: "Semantic - DB objects mappings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Semantic to database object mappings" })).toBeVisible();
  await expect(page.getByText("Measure definition with Power AI")).toBeVisible();
  await expect(page.getByLabel("Measure", { exact: true })).toBeVisible();
  await expect(page.getByText("Snowflake column lineage")).toBeVisible();
  await expect(page.getByLabel("Database column")).toHaveValue("AMOUNT");

  await page.getByRole("tab", { name: "Report visuals", exact: true }).click();
  await expect(page.getByText("Linked semantic model:")).toContainText("Sales Model");
  await expect(page.getByText("2 rows").first()).toBeVisible();

  await page.screenshot({ path: "test-results/report-lineage.png", fullPage: true });
  expect(browserErrors).toEqual([]);
});

test("the removed report lineage tabs are gone", async ({ page }) => {
  await mockBackend(page);
  await page.goto("/workspace/report-lineage");
  await expect(page.getByRole("heading", { name: "Report lineage" })).toBeVisible({ timeout: 60_000 });

  for (const gone of ["Report information", "Database objects", "Visual objects", "Semantic source mapping", "Visual source mapping", "Lineage"]) {
    await expect(page.getByRole("tab", { name: gone, exact: true })).toHaveCount(0);
  }
});

test("report lineage remains contained and usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockBackend(page);
  await page.goto("/workspace/report-lineage");

  await expect(page.getByRole("heading", { name: "Report lineage" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Workspace menu" })).toBeVisible();

  await page.getByRole("tab", { name: "Semantic objects", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Semantic model objects" })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "test-results/report-lineage-mobile.png", fullPage: true });
});

/**
 * One handler for every backend read, so the routes stay in an order-independent
 * switch rather than relying on Playwright's reverse-registration matching.
 */
async function mockBackend(page: Page) {
  await page.route("**/openapi.json", (route) => route.fulfill({ json: { openapi: "3.1.0", info: { title: "PBI Lineage", version: "1" }, paths: {} } }));
  await page.route("**/api/v1/**", (route) => {
    const url = new URL(route.request().url()).pathname;
    if (url.includes("/lineage/estate/discover")) return route.fulfill({ json: estateResponse });
    if (url.endsWith("/explorer/report-source-tables")) return route.fulfill({ json: reportSourceTables });
    if (url.endsWith("/explorer/semantic-model-objects")) return route.fulfill({ json: { rows: semanticObjects, count: semanticObjects.length, warnings: [] } });
    if (url.endsWith("/explorer/snapshot")) return route.fulfill({ json: snapshotResponse });
    if (url.endsWith("/pages")) return route.fulfill({ json: reportPages });
    if (url.endsWith("/definition/normalized")) return route.fulfill({ json: normalizedReport });
    if (url.endsWith("/semantic-lineage")) return route.fulfill({ json: semanticLineage });
    if (url.endsWith("/definition/parsed")) return route.fulfill({ json: parsedModel });
    if (url.endsWith("/metadata")) return route.fulfill({ json: { reconciliation: { matched_count: 5, definition_only_count: 0, xmla_only_count: 0 } } });
    if (url.endsWith(`/reports/${reportId}`)) return route.fulfill({ json: reportDetail });
    return route.fulfill({ json: {} });
  });
}

const reportDetail = { id: reportId, name: "Sales Performance", dataset_id: modelId, report_type: "PowerBIReport", format: "PBIR", is_owned_by_me: true };

const estateResponse = {
  workspaces: [{
    workspace: { id: workspaceId, name: "Finance" },
    reports: [reportDetail],
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

const reportPages = { pages: [{ name: "overview", display_name: "Overview", order: 0 }, { name: "detail", display_name: "Detail", order: 1 }] };

const context = { workspace_id: workspaceId, workspace_name: "Finance", report_id: reportId, report_name: "Sales Performance", semantic_model_id: modelId };

const semanticObjects = [
  { ...context, semantic_table: "Sales", semantic_object_type: "column", semantic_object_name: "Amount", semantic_data_type: "decimal", semantic_source_column: "AMOUNT", semantic_dax_expression: null },
  { ...context, semantic_table: "Sales", semantic_object_type: "column", semantic_object_name: "Quantity", semantic_data_type: "int64", semantic_source_column: "QUANTITY", semantic_dax_expression: null },
  { ...context, semantic_table: "Sales", semantic_object_type: "calculated_column", semantic_object_name: "Extended", semantic_data_type: "decimal", semantic_source_column: null, semantic_dax_expression: "Sales[Amount] * Sales[Quantity]" },
  { ...context, semantic_table: "Sales", semantic_object_type: "measure", semantic_object_name: "Total Sales", semantic_data_type: null, semantic_source_column: null, semantic_dax_expression: "SUM(Sales[Amount])" },
];

/** A direct table plus one reached through another workspace's model, to exercise the Via column. */
const reportSourceTables = {
  rows: [
    { workspace_name: "Finance", report_name: "Sales Performance", report_id: reportId, semantic_model_id: modelId, source_account: "account.snowflakecomputing.com", source_database: "ANALYTICS", source_schema: "PUBLIC", table_name: "SALES", source_object_type: "table" },
    { workspace_name: "Finance", report_name: "Sales Performance", report_id: reportId, semantic_model_id: modelId, source_account: null, source_database: null, source_schema: null, table_name: null, source_object_type: "unknown", via_workspace_name: "Shared", via_semantic_model_name: "Reference Model", via_semantic_table: "Region" },
  ],
  count: 2,
  warnings: [],
};

const snapshotResponse = {
  warnings: [],
  semantic_model_objects: { count: semanticObjects.length, rows: semanticObjects },
  measure_source_lineage: { count: 1, rows: [{ semantic_table: "Sales", semantic_object_name: "Total Sales", source_column_name: "AMOUNT", source_fully_qualified_name: "ANALYTICS.PUBLIC.SALES" }] },
  source_database_lineage: { count: 1, rows: [{ semantic_table: "Sales", source_fully_qualified_name: "ANALYTICS.PUBLIC.SALES" }] },
};

const normalizedReport = { page_count: 2, visual_count: 2, source_part_count: 6, warnings: [] };

const semanticLineage = {
  total_field_reference_count: 2,
  matched_field_reference_count: 2,
  unmatched_field_reference_count: 0,
  field_matches: [
    { page_display_name: "Overview", visual_title: "Total sales", visual_type: "card", status: "matched", semantic_object: { object_type: "measure", table_name: "Sales", object_name: "Total Sales" }, match_confidence: 1 },
    { page_display_name: "Overview", visual_title: "Sales by quantity", visual_type: "columnChart", status: "matched", semantic_object: { object_type: "column", table_name: "Sales", object_name: "Amount" }, match_confidence: 1 },
  ],
  warnings: [],
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
    measures: [{ name: "Total Sales", expression: "SUM(Sales[Amount])" }],
    hierarchies: [],
  }],
  relationships: [],
  warnings: [],
};
