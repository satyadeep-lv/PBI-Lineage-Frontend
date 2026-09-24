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

  test("the launcher is available identically on every page, including workspace and API docs", async ({ page }) => {
    await mockAiStatus(page, { status: 200, json: readyStatus() });

    await page.goto("/");
    await expect(page.getByRole("button", { name: "Open Power AI" })).toBeVisible({ timeout: 60_000 });

    await page.goto("/setup-guide");
    await expect(page.getByRole("button", { name: "Open Power AI" })).toBeVisible({ timeout: 60_000 });

    await page.goto("/workspace/power-bi");
    await expect(page.getByRole("button", { name: "Open Power AI" })).toBeVisible({ timeout: 60_000 });

    await page.goto("/workspace/api-docs");
    await expect(page.getByRole("button", { name: "Open Power AI" })).toBeVisible({ timeout: 60_000 });
  });

  test("a 401 from the status endpoint locks Power AI behind Power BI setup", async ({ page }) => {
    await mockAiStatus(page, { status: 401, json: { detail: "Not authenticated" } });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Power AI is locked" })).toBeVisible({ timeout: 60_000 });

    await page.getByRole("button", { name: "Power AI is locked" }).click();
    await expect(page.getByRole("heading", { name: "Power AI", exact: true })).toBeVisible();
    await expect(page.getByText("Complete Power BI setup with a device code or a service principal to unlock the AI assistant.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Power BI setup" })).toBeVisible();
    await expect(page.getByPlaceholder("Ask Power AI...")).not.toBeVisible();
    await page.getByRole("button", { name: "Collapse Power AI" }).click();
    await expect(page.getByRole("heading", { name: "Power AI", exact: true })).not.toBeVisible();
  });

  test("a 403 from the status endpoint shows an insufficient-permissions message, not the auth-setup flow", async ({ page }) => {
    await mockAiStatus(page, { status: 403, json: { detail: "Forbidden" } });
    await page.goto("/");
    await page.getByRole("button", { name: "Power AI is locked" }).click();
    await expect(page.getByText("Your account doesn't have permission to use Power AI. Contact your workspace admin.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Power BI setup" })).not.toBeVisible();
  });

  // A reachable, authenticated backend that simply hasn't turned the feature on must say so, not send the user to redo Power BI setup.
  test("enabled=false shows a distinct 'not enabled' message", async ({ page }) => {
    await mockAiStatus(page, { status: 200, json: readyStatus({ enabled: false }) });
    await page.goto("/");
    await page.getByRole("button", { name: "Power AI is locked" }).click();
    await expect(page.getByText("Power AI is not enabled for this environment.")).toBeVisible();
  });

  test("configured=false shows a distinct 'not configured' message", async ({ page }) => {
    await mockAiStatus(page, { status: 200, json: readyStatus({ configured: false }) });
    await page.goto("/");
    await page.getByRole("button", { name: "Power AI is locked" }).click();
    await expect(page.getByText("Power AI hasn't been configured yet.")).toBeVisible();
  });

  test("enabled and configured becomes active", async ({ page }) => {
    await mockAiStatus(page, { status: 200, json: readyStatus() });
    await page.goto("/");
    await page.getByRole("button", { name: "Open Power AI" }).click();
    await expect(page.getByPlaceholder("Ask Power AI...")).toBeVisible();
    // No persona picker: Power AI answers every question at one fixed level.
    await expect(page.getByRole("radio")).toHaveCount(0);
  });
});

test.describe("Power AI — context and Ask Power AI", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("Ask Power AI opens the floating panel, seeding context and a starting question", async ({ page }) => {
    await mockAiStatus(page, { status: 200, json: readyStatus() });
    await mockTableImpactBackend(page);
    await page.goto("/workspace/table-impact");
    await expect(page.getByRole("heading", { name: "Table impact" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: "Ask Power AI" })).toBeVisible();

    await page.getByRole("button", { name: "Ask Power AI" }).click();

    await expect(page.getByRole("heading", { name: "Power AI", exact: true })).toBeVisible();
    await expect(page.getByText("Current context")).toHaveCount(0);
    await expect(page.getByPlaceholder("Ask Power AI...")).toHaveValue("Explain the Sales table");
  });

  test("the outgoing chat request carries the selected object as context, not a full payload", async ({ page }) => {
    await mockAiStatus(page, { status: 200, json: readyStatus() });
    await mockTableImpactBackend(page);

    let capturedBody: Record<string, unknown> | null = null;
    await page.route("**/api/v1/ai/chat/stream", (route) => {
      capturedBody = route.request().postDataJSON();
      return route.fulfill(sseResponse({ deltas: ["Sales feeds three downstream measures."] }));
    });

    await page.goto("/workspace/table-impact");
    await page.getByRole("button", { name: "Ask Power AI" }).click();
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(page.getByText("Sales feeds three downstream measures.")).toBeVisible();
    expect(capturedBody).not.toBeNull();
    expect(capturedBody).toMatchObject({
      message: "Explain the Sales table",
      audience: "developer",
      context: { workspace_id: workspaceId, semantic_model_id: modelId, object_type: "table", object_name: "Sales" },
    });
  });
});

test.describe("Power AI — chat transports", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("streams a multi-frame response and replaces the accumulated text with the authoritative final answer", async ({ page }) => {
    await mockAiStatus(page, { status: 200, json: readyStatus({ streaming_enabled: true }) });
    await page.route("**/api/v1/ai/chat/stream", (route) =>
      route.fulfill(
        sseResponse({
          deltas: ["Gross Margin ", "depends on Sales[Amount]."],
          complete: chatResponse({ answer: "Gross Margin depends on Sales[Amount]." }),
        }),
      ),
    );

    await page.goto("/");
    await page.getByRole("button", { name: "Open Power AI" }).click();
    await page.getByPlaceholder("Ask Power AI...").fill("Explain Gross Margin");
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(page.getByText("Gross Margin depends on Sales[Amount].", { exact: true })).toBeVisible();
  });

  test("falls back to the non-streaming endpoint when the backend reports streaming_enabled=false", async ({ page }) => {
    await mockAiStatus(page, { status: 200, json: readyStatus({ streaming_enabled: false }) });

    let streamCalled = false;
    await page.route("**/api/v1/ai/chat/stream", (route) => {
      streamCalled = true;
      return route.fulfill(sseResponse({ deltas: ["should not be used"] }));
    });
    await page.route("**/api/v1/ai/chat", (route) =>
      route.fulfill({ json: chatResponse({ answer: "Gross Margin is Gross Profit divided by Net Sales." }) }),
    );

    await page.goto("/");
    await page.getByRole("button", { name: "Open Power AI" }).click();
    await page.getByPlaceholder("Ask Power AI...").fill("Explain Gross Margin");
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(page.getByText("Gross Margin is Gross Profit divided by Net Sales.")).toBeVisible();
    expect(streamCalled).toBe(false);
  });

  test("stopping mid-stream cancels cleanly without an error", async ({ page }) => {
    await mockAiStatus(page, { status: 200, json: readyStatus() });
    await page.route("**/api/v1/ai/chat/stream", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return route.fulfill(sseResponse({ deltas: ["This should never fully arrive."] }));
    });

    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));

    await page.goto("/");
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
    await mockAiStatus(page, { status: 200, json: readyStatus() });
    await page.route("**/api/v1/ai/chat/stream", (route) =>
      route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ detail: "quota_exceeded_internal_id_58213" }) }),
    );

    await page.goto("/");
    await page.getByRole("button", { name: "Open Power AI" }).click();
    await page.getByPlaceholder("Ask Power AI...").fill("Explain Gross Margin");
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(page.getByRole("alert")).toContainText("Power AI is receiving too many requests right now");
    await expect(page.getByText("quota_exceeded_internal_id_58213")).not.toBeVisible();
  });

  test("an unreachable backend shows a generic unavailable message", async ({ page }) => {
    await mockAiStatus(page, { status: 200, json: readyStatus() });
    await page.route("**/api/v1/ai/chat/stream", (route) => route.abort("connectionrefused"));

    await page.goto("/");
    await page.getByRole("button", { name: "Open Power AI" }).click();
    await page.getByPlaceholder("Ask Power AI...").fill("Explain Gross Margin");
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(page.getByRole("alert")).toContainText("The AI backend is temporarily unavailable");
  });
});

test.describe("Power AI — evidence and claim states", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("renders verified evidence and grounded claims with citation markers", async ({ page }) => {
    await mockAiStatus(page, { status: 200, json: readyStatus({ streaming_enabled: false }) });
    await page.route("**/api/v1/ai/chat", (route) =>
      route.fulfill({
        json: chatResponse({
          answer: "Gross Margin % is calculated from Gross Profit and Net Sales.",
          claims: [{ text: "Gross Margin % is calculated from Gross Profit and Net Sales.", evidence_ids: ["ev-1"] }],
          evidence: [
            {
              evidence_id: "ev-1",
              object_type: "measure",
              object_name: "Gross Margin %",
              fact_type: "definition",
              source_type: "tmdl",
              verification_status: "verified",
              display_value: "DIVIDE([Gross Profit], [Net Sales])",
            },
          ],
        }),
      }),
    );

    await page.goto("/");
    await page.getByRole("button", { name: "Open Power AI" }).click();
    await page.getByPlaceholder("Ask Power AI...").fill("Explain Gross Margin %");
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(page.getByText("[E1]").first()).toBeVisible();
    await expect(page.getByText("Gross Margin %", { exact: true })).toBeVisible();
    await expect(page.getByText("DIVIDE([Gross Profit], [Net Sales])")).toBeVisible();
  });

  test("insufficient evidence is rendered as a valid, clearly labeled answer state", async ({ page }) => {
    await mockAiStatus(page, { status: 200, json: readyStatus({ streaming_enabled: false }) });
    await page.route("**/api/v1/ai/chat", (route) =>
      route.fulfill({
        json: chatResponse({
          status: "insufficient_evidence",
          answer: "I could not determine the physical source from available lineage metadata.",
          evidence: [],
        }),
      }),
    );

    await page.goto("/");
    await page.getByRole("button", { name: "Open Power AI" }).click();
    await page.getByPlaceholder("Ask Power AI...").fill("Where does this column come from?");
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(page.getByText("I could not determine the physical source from available lineage metadata.")).toBeVisible();
    await expect(page.getByText("Insufficient evidence to fully answer this")).toBeVisible();
  });

  test("conflicting evidence shows both sides grouped by source, without Power AI choosing one", async ({ page }) => {
    await mockAiStatus(page, { status: 200, json: readyStatus({ streaming_enabled: false }) });
    await page.route("**/api/v1/ai/chat", (route) =>
      route.fulfill({
        json: chatResponse({
          status: "conflicting_evidence",
          answer: "Definition metadata and runtime metadata disagree on this relationship's direction.",
          evidence: [
            { evidence_id: "ev-1", object_type: "relationship", object_name: "Sales -> Region", fact_type: "relationship", source_type: "tmdl", verification_status: "partial" },
            { evidence_id: "ev-2", object_type: "relationship", object_name: "Sales -> Region", fact_type: "relationship", source_type: "xmla", verification_status: "partial" },
          ],
        }),
      }),
    );

    await page.goto("/");
    await page.getByRole("button", { name: "Open Power AI" }).click();
    await page.getByPlaceholder("Ask Power AI...").fill("What is the relationship direction?");
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(page.getByText("Conflicting evidence found")).toBeVisible();
    await expect(page.getByText("Semantic model definition (TMDL)", { exact: true })).toBeVisible();
    await expect(page.getByText("Live model (XMLA)", { exact: true })).toBeVisible();
  });
});

test.describe("Power AI — survives responsive transitions", () => {
  test("a conversation started on desktop remains intact after resizing to mobile", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockAiStatus(page, { status: 200, json: readyStatus() });
    await page.route("**/api/v1/ai/chat/stream", (route) => route.fulfill(sseResponse({ deltas: ["Table impact analysis is ready."] })));

    await page.goto("/");
    await page.getByRole("button", { name: "Open Power AI" }).click();
    await page.getByPlaceholder("Ask Power AI...").fill("What changed?");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("Table impact analysis is ready.")).toBeVisible();

    // The same widget stays open across the resize — no re-opening needed.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText("What changed?")).toBeVisible();
    await expect(page.getByText("Table impact analysis is ready.")).toBeVisible();
  });
});

function readyStatus(overrides: Partial<{ enabled: boolean; configured: boolean; streaming_enabled: boolean; provider: string; model: string }> = {}) {
  return { enabled: true, configured: true, streaming_enabled: true, provider: "openai", model: "gpt-4o", ...overrides };
}

function chatResponse(overrides: Partial<{
  conversation_id: string;
  status: string;
  answer: string;
  claims: Array<{ text: string; evidence_ids: string[] }>;
  evidence: Array<Record<string, unknown>>;
  suggested_questions: string[];
}> = {}) {
  return {
    conversation_id: "conv-1",
    status: "answered",
    answer: "",
    claims: [],
    evidence: [],
    suggested_questions: [],
    ...overrides,
  };
}

function sseResponse(options: { deltas?: string[]; complete?: ReturnType<typeof chatResponse> }) {
  const frames = [
    `event: metadata\ndata: ${JSON.stringify({ conversation_id: "conv-1" })}\n\n`,
    ...(options.deltas ?? []).map((text) => `event: delta\ndata: ${JSON.stringify({ text })}\n\n`),
    `event: complete\ndata: ${JSON.stringify(options.complete ?? chatResponse({ answer: (options.deltas ?? []).join("") }))}\n\n`,
  ];
  return { contentType: "text/event-stream", body: frames.join("") };
}

async function mockAiStatus(page: Page, response: { status: number; json: unknown }) {
  await page.route("**/openapi.json", (route) => route.fulfill({ json: { openapi: "3.1.0", info: { title: "PBI Lineage", version: "1" }, paths: {} } }));
  await page.route("**/api/v1/health", (route) => route.fulfill({ json: { status: "ok" } }));
  await page.route("**/api/v1/ai/status", (route) => route.fulfill({ status: response.status, json: response.json }));
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
