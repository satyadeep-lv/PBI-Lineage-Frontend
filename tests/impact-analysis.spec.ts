import { expect, test, type Page } from "@playwright/test";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const workspaceId2 = "44444444-4444-4444-8444-444444444444";
const reportId = "22222222-2222-4222-8222-222222222222";
const modelId = "33333333-3333-4333-8333-333333333333";
const modelId2 = "55555555-5555-4555-8555-555555555555";

test("table impact preloads a searchable inventory across the selected workspace scope", async ({ page }) => {
  await mockBackend(page);

  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/workspace/table-impact");
  await expect(page.getByRole("heading", { name: "Table impact" })).toBeVisible({ timeout: 60_000 });

  const scopeButton = page.getByRole("button", { name: "Workspace scope", exact: true });
  await expect(scopeButton).toHaveText("All 2 workspaces");
  await expect(page.getByText("2 tables indexed across 2 workspaces.", { exact: true })).toBeVisible();

  const tableButton = page.getByRole("button", { name: "Table", exact: true });
  await tableButton.click();
  await page.getByPlaceholder("Search a table by name...").fill("Sales");
  await page.getByRole("option", { name: "Sales" }).click();

  // Whole-table downstream: 5 seed objects (2 columns, 1 calculated column, 2 measures), with
  // seed-to-seed edges (e.g. Amount -> Total Sales) surfaced even though both ends are seeds.
  await expect(page.getByLabel("Column", { exact: true })).toHaveValue("__whole_table__");
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  await expect(page.locator(".react-flow__edge")).toHaveCount(4);
  await expect(page.getByText("3 rows", { exact: true })).toBeVisible();

  // Collapsing a node hides its downstream subtree and re-lays-out the remaining nodes.
  const collapseButtons = page.locator(".react-flow__node button[aria-label=\"Collapse descendants\"]");
  await expect(collapseButtons.first()).toBeVisible();
  const nodeCountBeforeCollapse = await page.locator(".react-flow__node").count();
  await collapseButtons.first().click();
  await expect(page.locator(".react-flow__node")).not.toHaveCount(nodeCountBeforeCollapse);
  await expect(page.locator(".react-flow__node button[aria-label=\"Expand descendants\"]").first()).toBeVisible();

  // Narrow to a single column: only its own downstream chain remains.
  await page.getByLabel("Column", { exact: true }).selectOption({ label: "Amount" });
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await expect(page.locator(".react-flow__edge")).toHaveCount(3);
  await expect(page.locator(".react-flow__node").getByText("Sales[Amount]", { exact: true })).toBeVisible();
  await expect(page.getByText("3 rows", { exact: true })).toBeVisible();

  // Cross-workspace merge: the second workspace's table is discoverable from the same combobox,
  // and picking it switches the whole page (dax/analyze, evidence, diagram, grid) to that model.
  await tableButton.click();
  await page.getByPlaceholder("Search a table by name...").fill("Campaigns");
  await page.getByRole("option", { name: "Campaigns" }).click();
  await expect(page.getByRole("heading", { name: "Campaigns impact" })).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await expect(page.locator(".react-flow__edge")).toHaveCount(0);
  await expect(page.getByText("0 rows", { exact: true })).toBeVisible();

  // Narrowing the workspace scope removes that workspace's tables from the search entirely.
  await scopeButton.click();
  await page.getByRole("checkbox", { name: "Marketing" }).first().click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(scopeButton).toHaveText("1 of 2 selected");
  await expect(page.getByText("1 table indexed across 1 workspace.", { exact: true })).toBeVisible();
  await tableButton.click();
  await page.getByPlaceholder("Search a table by name...").fill("Campaigns");
  await expect(page.getByText("No matches.", { exact: true })).toBeVisible();

  await expect(page.getByRole("button", { name: "Copy table" })).toBeVisible();
  await expect(page.getByRole("button", { name: "CSV" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Excel" })).toBeVisible();

  await page.screenshot({ path: "test-results/table-impact.png", fullPage: true });
  expect(browserErrors).toEqual([]);
});

test("measure impact shows upstream and downstream dependents with report/visual evidence", async ({ page }) => {
  await mockBackend(page);

  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/workspace/measure-impact");
  await expect(page.getByRole("heading", { name: "Measure impact" })).toBeVisible({ timeout: 60_000 });

  const scopeButton = page.getByRole("button", { name: "Workspace scope", exact: true });
  await expect(scopeButton).toHaveText("All 2 workspaces");

  const measureButton = page.getByRole("button", { name: "Measure", exact: true });
  await measureButton.click();
  await page.getByPlaceholder("Search a measure by name...").fill("Total Sales");
  await page.getByRole("option", { name: "Total Sales" }).click();

  await expect(page.getByRole("heading", { name: "Sales[Total Sales] impact" })).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(3);
  await expect(page.locator(".react-flow__edge")).toHaveCount(2);
  await expect(page.locator(".react-flow__node").getByText("Sales[Amount]", { exact: true })).toBeVisible();
  await expect(page.locator(".react-flow__node").getByText("Sales[KPI]", { exact: true })).toBeVisible();
  await expect(page.getByText("2 rows", { exact: true })).toBeVisible();

  // Cross-workspace merge: the second workspace's measure is discoverable from the same combobox.
  await measureButton.click();
  await page.getByPlaceholder("Search a measure by name...").fill("ROI");
  await page.getByRole("option", { name: "ROI" }).click();
  await expect(page.getByRole("heading", { name: "Campaigns[ROI] impact" })).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);

  await page.screenshot({ path: "test-results/measure-impact.png", fullPage: true });
  expect(browserErrors).toEqual([]);
});

async function mockBackend(page: Page) {
  await page.route("**/openapi.json", (route) => route.fulfill({ json: { openapi: "3.1.0", info: { title: "PBI Lineage", version: "1" }, paths: {} } }));
  await page.route("**/api/v1/workspaces?top=100&skip=0", (route) => route.fulfill({ json: { workspaces: [{ id: workspaceId, name: "Finance" }, { id: workspaceId2, name: "Marketing" }] } }));
  await page.route("**/api/v1/workspaces/*/semantic-models", (route) => {
    const requestedWorkspaceId = new URL(route.request().url()).pathname.split("/")[4];
    const semanticModels = requestedWorkspaceId === workspaceId2 ? [{ id: modelId2, name: "Marketing Model" }] : [{ id: modelId, name: "Sales Model" }];
    return route.fulfill({ json: { semantic_models: semanticModels } });
  });
  await page.route("**/api/v1/workspaces/*/semantic-models/*/definition/parsed**", (route) => {
    const requestedModelId = new URL(route.request().url()).pathname.split("/")[6];
    return route.fulfill({ json: requestedModelId === modelId2 ? parsedModel2 : parsedModel });
  });
  await page.route("**/api/v1/lineage/dax/analyze", (route) => {
    const body = route.request().postDataJSON() as { semantic_model_id?: string } | null;
    return route.fulfill({ json: body?.semantic_model_id === modelId2 ? daxAnalysis2 : daxAnalysis });
  });
  await page.route("**/api/v1/lineage/estate/discover**", (route) => route.fulfill({ json: estateResponse }));
  await page.route("**/api/v1/explorer/measure-source-lineage", (route) => route.fulfill({ json: measureSourceLineageEvidence }));
  await page.route("**/api/v1/explorer/visual-source-lookup", (route) => route.fulfill({ json: visualSourceLookupEvidence }));
}

const estateResponse = {
  workspaces: [{
    workspace: { id: workspaceId, name: "Finance" },
    reports: [{ id: reportId, name: "Sales Performance", dataset_id: modelId, report_type: "PowerBIReport", format: "PBIR", is_owned_by_me: true }],
    semantic_models: [{ id: modelId, name: "Sales Model" }],
    report_bindings: [{ report_id: reportId, semantic_model_id: modelId, status: "matched" }],
  }],
  graph: { nodes: [], edges: [] },
  warnings: [],
  workspace_count: 1,
  report_count: 1,
  semantic_model_count: 1,
};

const measureSourceLineageEvidence = {
  rows: [{ report_id: reportId, semantic_table: "Sales", semantic_object_name: "Total Sales" }],
};

const visualSourceLookupEvidence = {
  rows: [{ report_id: reportId, page_id: "overview", visual_id: "sales-card", semantic_table: "Sales", semantic_object_name: "Total Sales", match_status: "matched" }],
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

const parsedModel2 = {
  workspace_id: workspaceId2,
  semantic_model_id: modelId2,
  format: "TMDL",
  tables: [{
    name: "Campaigns",
    source_path: "ANALYTICS.PUBLIC.CAMPAIGNS",
    expression: null,
    columns: [
      { name: "Spend", source_path: "ANALYTICS.PUBLIC.CAMPAIGNS", source_column: "SPEND", data_type: "decimal", expression: null },
    ],
    measures: [
      { name: "ROI", expression: "DIVIDE([Revenue], [Spend])" },
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

const daxAnalysis2 = { objects: [], dependencies: [], warnings: [], object_count: 2, dependency_count: 0 };
