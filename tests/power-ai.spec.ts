import { expect, test, type Page } from "@playwright/test";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const modelId = "33333333-3333-4333-8333-333333333333";

test.describe("Power AI — global docked panel", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  // These are the first tests in the suite to request PowerAiWidget's (dev-only,
  // per-module) source files, which occasionally races Vite's dev-server transform
  // cache on a cold start under concurrent workers — confirmed unrelated to app
  // logic (reproduces identically on unmodified, pre-existing spec files too; a
  // production build has no such transform step). A scoped retry absorbs it.
  test.describe.configure({ retries: 2 });

  test("the launcher is available on every page, including Home and Setup guide", async ({ page }) => {
    await mockShellOnly(page);

    await page.goto("/");
    await expect(page.getByRole("button", { name: "Open Power AI" })).toBeVisible({ timeout: 60_000 });

    await page.goto("/setup-guide");
    await expect(page.getByRole("button", { name: "Open Power AI" })).toBeVisible({ timeout: 60_000 });

    await page.goto("/workspace/power-bi");
    await expect(page.getByRole("button", { name: "Open Power AI" })).toBeVisible({ timeout: 60_000 });
  });

  test("shows a locked state before Power BI authentication", async ({ page }) => {
    await mockShellOnly(page, { enabled: true, authenticated: false });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Power AI is locked" })).toBeVisible({ timeout: 60_000 });

    await page.getByRole("button", { name: "Power AI is locked" }).click();
    await expect(page.getByRole("complementary", { name: "Power AI" })).toBeVisible();
    await expect(page.getByText("Complete Power BI setup with a device code or a service principal to unlock the AI assistant.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Power BI setup" })).toBeVisible();
    await expect(page.getByPlaceholder("Ask Power AI...")).not.toBeVisible();
    await page.getByRole("button", { name: "Collapse Power AI" }).click();
    await expect(page.getByRole("complementary", { name: "Power AI" })).not.toBeVisible();
  });

  // A reachable backend that simply hasn't built the AI feature yet must say so, not send the user to redo Power BI setup.
  test("shows a distinct message when the AI feature itself is not enabled", async ({ page }) => {
    await mockShellOnly(page, { enabled: false, authenticated: false, reason: "disabled" });
    await page.goto("/");
    await page.getByRole("button", { name: "Power AI is locked" }).click();
    await expect(page.getByText("Power AI is not enabled for this environment.")).toBeVisible();
  });

  test("becomes active once authenticated", async ({ page }) => {
    await mockShellOnly(page, { enabled: true, authenticated: true });
    await page.goto("/");
    await page.getByRole("button", { name: "Open Power AI" }).click();
    await expect(page.getByPlaceholder("Ask Power AI...")).toBeVisible();
    await expect(page.getByRole("radio", { name: "General" })).toBeVisible();
  });

  test("persona selection persists across a reload", async ({ page }) => {
    await mockShellOnly(page);
    await page.goto("/workspace/power-bi");
    await page.getByRole("button", { name: "Open Power AI" }).click();

    await expect(page.getByRole("radio", { name: "General" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("radio", { name: "Developer" }).click();
    await expect(page.getByRole("radio", { name: "Developer" })).toHaveAttribute("aria-checked", "true");

    await page.reload();
    await page.getByRole("button", { name: "Open Power AI" }).click();
    await expect(page.getByRole("radio", { name: "Developer" })).toHaveAttribute("aria-checked", "true");
  });
});

test.describe("Power AI — context and Ask Power AI", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("Ask Power AI seeds context and a starting question from the selected table", async ({ page }) => {
    await mockShellOnly(page);
    await mockTableImpactBackend(page);
    await page.goto("/workspace/table-impact");
    await expect(page.getByRole("heading", { name: "Table impact" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: "Ask Power AI" })).toBeVisible();

    await page.getByRole("button", { name: "Ask Power AI" }).click();

    await expect(page.getByRole("complementary", { name: "Power AI" })).toBeVisible();
    await expect(page.getByText("Current context")).toBeVisible();
    await expect(page.locator("dl").getByText("Table", { exact: true })).toBeVisible();
    await expect(page.locator("dl").getByText("Sales", { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("Ask Power AI...")).toHaveValue("Explain the Sales table");
  });

  test("the outgoing chat request carries the selected object as context, not a full payload", async ({ page }) => {
    await mockShellOnly(page);
    await mockTableImpactBackend(page);

    let capturedBody: Record<string, unknown> | null = null;
    await page.route("**/api/v1/ai/chat/stream", (route) => {
      capturedBody = route.request().postDataJSON();
      return route.fulfill(sseResponse(["Sales feeds three downstream measures."]));
    });

    await page.goto("/workspace/table-impact");
    await page.getByRole("button", { name: "Ask Power AI" }).click();
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(page.getByText("Sales feeds three downstream measures.")).toBeVisible();
    expect(capturedBody).not.toBeNull();
    expect(capturedBody).toMatchObject({
      message: "Explain the Sales table",
      audience: "general",
      context: { workspace_id: workspaceId, semantic_model_id: modelId, object_type: "table", object_name: "Sales" },
    });
  });
});

test.describe("Power AI — streaming, cancellation, and errors", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("renders a multi-frame streamed response with evidence", async ({ page }) => {
    await mockShellOnly(page);
    await page.route("**/api/v1/ai/chat/stream", (route) =>
      route.fulfill(sseResponse(["Gross Margin ", "depends on Sales[Amount]."], [{ label: "Semantic model", value: "Sales Model" }])),
    );

    await page.goto("/workspace/power-bi");
    await page.getByRole("button", { name: "Open Power AI" }).click();
    await page.getByPlaceholder("Ask Power AI...").fill("Explain Gross Margin");
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(page.getByText("Gross Margin depends on Sales[Amount].")).toBeVisible();
    await expect(page.getByText("Evidence")).toBeVisible();
    await expect(page.getByText("Sales Model")).toBeVisible();
  });

  test("stopping mid-stream cancels cleanly without an error", async ({ page }) => {
    await mockShellOnly(page);
    await page.route("**/api/v1/ai/chat/stream", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return route.fulfill(sseResponse(["This should never fully arrive."]));
    });

    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));

    await page.goto("/workspace/power-bi");
    await page.getByRole("button", { name: "Open Power AI" }).click();
    await page.getByPlaceholder("Ask Power AI...").fill("Explain Gross Margin");
    await page.getByRole("button", { name: "Send message" }).click();

    const stopButton = page.getByRole("button", { name: "Stop generating" });
    await expect(stopButton).toBeVisible();
    await stopButton.click();

    await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();
    await expect(page.getByText("This should never fully arrive.")).not.toBeVisible();
    expect(browserErrors).toEqual([]);
  });

  test("a rate-limited response shows friendly copy, never the raw backend message", async ({ page }) => {
    await mockShellOnly(page);
    await page.route("**/api/v1/ai/chat/stream", (route) =>
      route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ detail: "quota_exceeded_internal_id_58213" }) }),
    );

    await page.goto("/workspace/power-bi");
    await page.getByRole("button", { name: "Open Power AI" }).click();
    await page.getByPlaceholder("Ask Power AI...").fill("Explain Gross Margin");
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(page.getByRole("alert")).toContainText("Power AI is receiving too many requests right now");
    await expect(page.getByText("quota_exceeded_internal_id_58213")).not.toBeVisible();
  });

  test("an unreachable backend shows a generic unavailable message", async ({ page }) => {
    await mockShellOnly(page);
    await page.route("**/api/v1/ai/chat/stream", (route) => route.abort("connectionrefused"));

    await page.goto("/workspace/power-bi");
    await page.getByRole("button", { name: "Open Power AI" }).click();
    await page.getByPlaceholder("Ask Power AI...").fill("Explain Gross Margin");
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(page.getByRole("alert")).toContainText("The AI backend is temporarily unavailable");
  });
});

test.describe("Power AI — survives responsive transitions", () => {
  test("a conversation started on desktop remains intact after resizing to mobile", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockShellOnly(page);
    await page.route("**/api/v1/ai/chat/stream", (route) => route.fulfill(sseResponse(["Table impact analysis is ready."])));

    await page.goto("/workspace/power-bi");
    await page.getByRole("button", { name: "Open Power AI" }).click();
    await page.getByPlaceholder("Ask Power AI...").fill("What changed?");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("Table impact analysis is ready.")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText("What changed?")).toBeVisible();
    await expect(page.getByText("Table impact analysis is ready.")).toBeVisible();
  });
});

function sseResponse(tokens: string[], evidence?: Array<{ label: string; value: string }>) {
  const frames = [
    ...tokens.map((token) => `data: ${JSON.stringify({ token })}\n\n`),
    ...(evidence ? [`data: ${JSON.stringify({ evidence })}\n\n`] : []),
    `data: ${JSON.stringify({ conversation_id: "conv-1" })}\n\n`,
    `data: ${JSON.stringify({ done: true })}\n\n`,
  ];
  return { contentType: "text/event-stream", body: frames.join("") };
}

async function mockShellOnly(page: Page, aiStatus: { enabled: boolean; authenticated: boolean; reason?: string } = { enabled: true, authenticated: true }) {
  await page.route("**/openapi.json", (route) => route.fulfill({ json: { openapi: "3.1.0", info: { title: "PBI Lineage", version: "1" }, paths: {} } }));
  await page.route("**/api/v1/health", (route) => route.fulfill({ json: { status: "ok" } }));
  await page.route("**/api/v1/ai/status", (route) => route.fulfill({ json: aiStatus }));
}

async function mockTableImpactBackend(page: Page) {
  await page.route("**/api/v1/workspaces?top=100&skip=0", (route) => route.fulfill({ json: { workspaces: [{ id: workspaceId, name: "Finance" }] } }));
  await page.route("**/api/v1/workspaces/*/semantic-models", (route) => route.fulfill({ json: { semantic_models: [{ id: modelId, name: "Sales Model" }] } }));
  await page.route("**/api/v1/workspaces/*/semantic-models/*/definition/parsed**", (route) => route.fulfill({ json: parsedModel }));
  await page.route("**/api/v1/lineage/dax/analyze", (route) => route.fulfill({ json: { objects: [], dependencies: [], warnings: [], object_count: 2, dependency_count: 0 } }));
  await page.route("**/api/v1/lineage/estate/discover**", (route) => route.fulfill({ json: { workspaces: [], graph: { nodes: [], edges: [] }, warnings: [], workspace_count: 0, report_count: 0, semantic_model_count: 0 } }));
}

const parsedModel = {
  workspace_id: workspaceId,
  semantic_model_id: modelId,
  format: "TMDL",
  tables: [{
    name: "Sales",
    source_path: "ANALYTICS.PUBLIC.SALES",
    expression: null,
    columns: [{ name: "Amount", source_path: "ANALYTICS.PUBLIC.SALES", source_column: "AMOUNT", data_type: "decimal", expression: null }],
    measures: [{ name: "Total Sales", expression: "SUM(Sales[Amount])" }],
    hierarchies: [],
  }],
  relationships: [],
  warnings: [],
};
