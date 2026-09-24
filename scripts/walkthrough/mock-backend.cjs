/**
 * Fully fictional mock backend for the Home page walkthrough (capture.cjs) and
 * any other screenshot work. Every workspace, report, model, table, account and
 * ID below is invented placeholder data.
 *
 *   const { mockBackend } = require("./mock-backend.cjs");
 *   await mockBackend(page);                                  // happy path
 *   await mockBackend(page, { estateError: true });           // estate discovery 403
 *   await mockBackend(page, { microsoft: "partial" });        // Fabric needs attention
 *   await mockBackend(page, { microsoft: "none", database: "none" }); // nothing signed in
 *   await mockBackend(page, { onUnhandled: (path) => ... });  // report unmocked calls
 *
 * Report-scoped explorer datasets, impact inventories, DAX dependencies and
 * visual lineage are all derived from the parsed semantic-model definitions in
 * MODEL_DEFINITIONS, so every screen tells one consistent story.
 */

const uuid = (prefix, n) => `${prefix.slice(0, 4)}${String(n).padStart(4, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SOURCE_ACCOUNT = "demo-account.snowflakecomputing.com";

// ---------------------------------------------------------------------------
// Workspaces, semantic models and reports
// ---------------------------------------------------------------------------

const WORKSPACES = [
  { id: uuid("a1000000", 1), name: "Finance", is_read_only: false, is_on_dedicated_capacity: true },
  { id: uuid("a1000000", 2), name: "Sales Operations", is_read_only: false, is_on_dedicated_capacity: true },
  { id: uuid("a1000000", 3), name: "Marketing Analytics", is_read_only: true, is_on_dedicated_capacity: false },
  { id: uuid("a1000000", 4), name: "Supply Chain", is_read_only: false, is_on_dedicated_capacity: false },
  { id: uuid("a1000000", 5), name: "People Analytics", is_read_only: true, is_on_dedicated_capacity: true },
  { id: uuid("a1000000", 6), name: "Leadership Reporting", is_read_only: true, is_on_dedicated_capacity: true },
  { id: uuid("a1000000", 7), name: "Sandbox", is_read_only: false },
];
const [FIN, SALES, MKT, SC, PPL, LEAD, SANDBOX] = WORKSPACES.map((workspace) => workspace.id);
const workspaceById = new Map(WORKSPACES.map((workspace) => [workspace.id, workspace]));

let modelSeq = 0;
const model = (workspaceId, name, extra = {}) => ({ id: uuid("b2000000", ++modelSeq), name, workspaceId, ...extra });
const MODELS = [
  model(FIN, "Finance Model", { target_storage_mode: "Import", is_refreshable: true, is_on_prem_gateway_required: true }),
  model(FIN, "General Ledger", { target_storage_mode: "DirectQuery", is_refreshable: false, is_on_prem_gateway_required: true }),
  model(FIN, "Budget Planning", { target_storage_mode: "Import", is_refreshable: true, is_on_prem_gateway_required: false }),
  model(SALES, "Sales Model", { target_storage_mode: "Import", is_refreshable: true, is_on_prem_gateway_required: false }),
  model(SALES, "Pipeline Live", { target_storage_mode: "DirectQuery", is_refreshable: false, is_on_prem_gateway_required: false }),
  model(MKT, "Campaign Performance", { target_storage_mode: "Import", is_refreshable: true, is_on_prem_gateway_required: false }),
  model(MKT, "Web Analytics", { target_storage_mode: "Import", is_refreshable: true }),
  model(SC, "Inventory Model", { target_storage_mode: "Import", is_refreshable: true, is_on_prem_gateway_required: true }),
  model(SC, "Logistics Stream", { target_storage_mode: "DirectQuery", is_refreshable: false, is_on_prem_gateway_required: false }),
  model(PPL, "Headcount Model", { target_storage_mode: "Import", is_refreshable: true }),
  model(SANDBOX, "Prototype Lakehouse", { target_storage_mode: "DirectLake", is_refreshable: false, is_on_prem_gateway_required: false }),
  model(SANDBOX, "Scratch Model", {}),
];
const modelByName = Object.fromEntries(MODELS.map((item) => [item.name, item]));
const modelById = new Map(MODELS.map((item) => [item.id, item]));

let reportSeq = 0;
/** r(workspace, name, modelName|null, owned, type, format, binding) */
const r = (workspaceId, name, modelName, owned, type = "PowerBIReport", format = "PBIR", binding = "matched") => {
  const bound = modelName ? modelByName[modelName] : null;
  return {
    id: uuid("c3000000", ++reportSeq),
    name,
    workspaceId,
    dataset_id: bound ? bound.id : null,
    // Only set when the model lives in another workspace, the same way Power BI often omits it.
    dataset_workspace_id: bound && bound.workspaceId !== workspaceId ? bound.workspaceId : undefined,
    report_type: type,
    format,
    is_owned_by_me: owned,
    binding,
  };
};

const REPORTS = [
  r(FIN, "Sales Performance", "Finance Model", true),
  r(FIN, "Profit and Loss", "Finance Model", true),
  r(FIN, "Cash Flow Statement", "General Ledger", true, "PowerBIReport", "PBIX"),
  r(FIN, "Budget vs Actuals", "Budget Planning", false),
  r(FIN, "Accounts Receivable Aging", "General Ledger", true, "PaginatedReport", null),
  r(FIN, "Expense Drilldown", "Finance Model", undefined, "PowerBIReport", "PBIX"),
  r(FIN, "Quarterly Close Pack", "General Ledger", false, "PaginatedReport", null),
  r(SALES, "Pipeline Overview", "Pipeline Live", true),
  r(SALES, "Regional Sales", "Sales Model", false),
  r(SALES, "Account Health", "Sales Model", true, "PowerBIReport", "PBIX"),
  r(SALES, "Quota Attainment", "Sales Model", false),
  r(SALES, "Win Loss Analysis", "Pipeline Live", undefined),
  r(SALES, "Order Invoices", "Sales Model", false, "PaginatedReport", null),
  r(MKT, "Campaign Dashboard", "Campaign Performance", false),
  r(MKT, "Web Traffic", "Web Analytics", false, "PowerBIReport", "PBIX"),
  r(MKT, "Lead Funnel", "Campaign Performance", false),
  r(MKT, "Brand Sentiment", null, false, "PowerBIReport", "PBIR", "unresolved"),
  r(MKT, "Email Engagement", "Web Analytics", undefined, "PowerBIReport", "PBIX"),
  r(SC, "Inventory Levels", "Inventory Model", true),
  r(SC, "Supplier Scorecard", "Inventory Model", true, "PowerBIReport", "PBIX"),
  r(SC, "Shipment Tracking", "Logistics Stream", false),
  r(SC, "Warehouse Capacity", null, true, "PowerBIReport", "PBIR", "unresolved"),
  r(PPL, "Headcount Trends", "Headcount Model", false),
  r(PPL, "Attrition Analysis", "Headcount Model", false),
  r(PPL, "Hiring Pipeline", "Headcount Model", undefined, undefined, undefined),
  r(LEAD, "Executive Scorecard", "Finance Model", false),
  r(LEAD, "Board Pack", "Sales Model", false, "PaginatedReport", null),
  r(LEAD, "KPI Summary", "Finance Model", true),
  r(LEAD, "Strategic Initiatives", null, false, "PowerBIReport", "PBIR", "unresolved"),
  r(SANDBOX, "Lakehouse Prototype", "Prototype Lakehouse", true),
  r(SANDBOX, "Scratch Analysis", "Scratch Model", true, "PowerBIReport", "PBIX", null),
];
const reportById = new Map(REPORTS.map((report) => [report.id, report]));

const stripReport = ({ workspaceId: _w, binding: _b, ...report }) => report;
const stripModel = ({ workspaceId: _w, ...item }) => item;

// ---------------------------------------------------------------------------
// Parsed semantic-model definitions (TMDL-shaped, as /definition/parsed returns)
// ---------------------------------------------------------------------------

const col = (name, sourceColumn, dataType = "string") => ({ name, source_column: sourceColumn, data_type: dataType, expression: null });
const calc = (name, expression, dataType = "decimal") => ({ name, source_column: null, data_type: dataType, expression });
const msr = (name, expression) => ({ name, expression });
const tbl = (name, sourcePath, columns, measures = []) => ({
  name,
  source_path: sourcePath,
  expression: null,
  columns: columns.map((column) => ({ ...column, source_path: column.expression ? null : sourcePath })),
  measures,
  hierarchies: [],
});

const dateTable = (database) => tbl("Date", `${database}.SHARED.DIM_DATE`, [col("Date", "DATE_KEY", "dateTime"), col("Year", "CALENDAR_YEAR", "int64"), col("Month", "MONTH_NAME")]);

const MODEL_DEFINITIONS = {
  // The first table and its first measure are what Table impact and Measure impact open on.
  // Kept to three dependency ranks (columns -> base measures -> KPIs) so the LR diagrams stay legible.
  "Finance Model": [
    tbl("Sales", "ANALYTICS.FINANCE.FACT_SALES", [
      col("Amount", "AMOUNT", "decimal"),
      col("Discount", "DISCOUNT", "decimal"),
      col("Quantity", "QUANTITY", "int64"),
      col("Unit Cost", "UNIT_COST", "decimal"),
    ], [
      msr("Total Sales", "SUM(Sales[Amount]) - SUM(Sales[Discount])"),
      msr("Total Quantity", "SUM(Sales[Quantity])"),
      msr("Total Discount", "SUM(Sales[Discount])"),
      msr("Total Cost", "SUMX(Sales, Sales[Quantity] * Sales[Unit Cost])"),
    ]),
    tbl("KPIs", null, [], [
      msr("Gross Margin", "[Total Sales] - [Total Cost]"),
      msr("Avg Selling Price", "DIVIDE([Total Sales], [Total Quantity])"),
      msr("Discount Rate", "DIVIDE([Total Discount], [Total Sales] + [Total Discount])"),
    ]),
    tbl("Customers", "ANALYTICS.SHARED.DIM_CUSTOMER", [col("Region", "REGION"), col("Segment", "SEGMENT"), col("Customer Name", "CUSTOMER_NAME")]),
    dateTable("ANALYTICS"),
  ],
  "General Ledger": [
    tbl("GL Entries", "LEDGER.CORE.FACT_GL_ENTRY", [col("Debit", "DEBIT_AMOUNT", "decimal"), col("Credit", "CREDIT_AMOUNT", "decimal"), calc("Net Movement", "'GL Entries'[Debit] - 'GL Entries'[Credit]")], [
      msr("Balance", "SUM('GL Entries'[Net Movement])"),
      msr("Total Debits", "SUM('GL Entries'[Debit])"),
      msr("Total Credits", "SUM('GL Entries'[Credit])"),
    ]),
    tbl("Accounts", "LEDGER.CORE.DIM_ACCOUNT", [col("Account Name", "ACCOUNT_NAME"), col("Account Type", "ACCOUNT_TYPE")]),
    dateTable("LEDGER"),
  ],
  "Budget Planning": [
    tbl("Budget", "PLANNING.FPA.FACT_BUDGET", [col("Budget Amount", "BUDGET_AMOUNT", "decimal"), col("Cost Center", "COST_CENTER")], [msr("Total Budget", "SUM(Budget[Budget Amount])")]),
    tbl("Actuals", "PLANNING.FPA.FACT_ACTUALS", [col("Actual Amount", "ACTUAL_AMOUNT", "decimal")], [
      msr("Total Actuals", "SUM(Actuals[Actual Amount])"),
      msr("Budget Variance", "[Total Actuals] - [Total Budget]"),
    ]),
    tbl("Departments", "PLANNING.FPA.DIM_DEPARTMENT", [col("Department", "DEPARTMENT_NAME")]),
  ],
  "Sales Model": [
    tbl("Orders", "SALESDB.MART.FACT_ORDERS", [col("Order Amount", "ORDER_AMOUNT", "decimal"), col("Units", "UNITS", "int64"), col("Order Id", "ORDER_ID")], [
      msr("Revenue", "SUM(Orders[Order Amount])"),
      msr("Units Sold", "SUM(Orders[Units])"),
      msr("Order Count", "DISTINCTCOUNT(Orders[Order Id])"),
      msr("Avg Order Value", "DIVIDE([Revenue], [Order Count])"),
    ]),
    tbl("Targets", "SALESDB.MART.FACT_TARGETS", [col("Target Amount", "TARGET_AMOUNT", "decimal")], [
      msr("Target", "SUM(Targets[Target Amount])"),
      msr("Attainment %", "DIVIDE([Revenue], [Target])"),
    ]),
    tbl("Region", "SALESDB.MART.DIM_REGION", [col("Region Name", "REGION_NAME"), col("Country", "COUNTRY")]),
    tbl("Accounts", "SALESDB.MART.DIM_ACCOUNT", [col("Account Name", "ACCOUNT_NAME"), col("Industry", "INDUSTRY")]),
    dateTable("SALESDB"),
  ],
  "Pipeline Live": [
    tbl("Opportunities", "SALESDB.CRM.FACT_OPPORTUNITY", [col("Opportunity Amount", "AMOUNT", "decimal"), col("Probability", "PROBABILITY", "decimal"), col("Stage", "STAGE_NAME"), col("Is Won", "IS_WON", "boolean")], [
      msr("Pipeline Value", "SUM(Opportunities[Opportunity Amount])"),
      msr("Weighted Pipeline", "SUMX(Opportunities, Opportunities[Opportunity Amount] * Opportunities[Probability])"),
      msr("Win Rate", "DIVIDE(CALCULATE(COUNTROWS(Opportunities), Opportunities[Is Won] = TRUE()), COUNTROWS(Opportunities))"),
    ]),
    tbl("Owners", "SALESDB.CRM.DIM_OWNER", [col("Owner Team", "TEAM_NAME")]),
  ],
  "Campaign Performance": [
    tbl("Campaigns", "MARKETING.ADS.FACT_CAMPAIGN_DAY", [col("Spend", "SPEND", "decimal"), col("Clicks", "CLICKS", "int64"), col("Impressions", "IMPRESSIONS", "int64")], [
      msr("Total Spend", "SUM(Campaigns[Spend])"),
      msr("Total Clicks", "SUM(Campaigns[Clicks])"),
      msr("Click-through Rate", "DIVIDE([Total Clicks], SUM(Campaigns[Impressions]))"),
      msr("Cost per Click", "DIVIDE([Total Spend], [Total Clicks])"),
    ]),
    tbl("Channels", "MARKETING.ADS.DIM_CHANNEL", [col("Channel", "CHANNEL_NAME")]),
  ],
  "Web Analytics": [
    tbl("Sessions", "MARKETING.WEB.FACT_SESSION", [col("Session Id", "SESSION_ID"), col("Bounced", "IS_BOUNCE", "boolean"), col("Duration Seconds", "DURATION_SECONDS", "int64")], [
      msr("Session Count", "DISTINCTCOUNT(Sessions[Session Id])"),
      msr("Bounce Rate", "DIVIDE(CALCULATE([Session Count], Sessions[Bounced] = TRUE()), [Session Count])"),
      msr("Avg Session Duration", "AVERAGE(Sessions[Duration Seconds])"),
    ]),
    tbl("Pages", "MARKETING.WEB.DIM_PAGE", [col("Page Path", "PAGE_PATH")]),
  ],
  "Inventory Model": [
    tbl("Inventory", "SUPPLY.WMS.FACT_INVENTORY", [col("On Hand", "ON_HAND_QTY", "int64"), col("Daily Demand", "DAILY_DEMAND", "decimal")], [
      msr("Stock on Hand", "SUM(Inventory[On Hand])"),
      msr("Days of Supply", "DIVIDE([Stock on Hand], SUM(Inventory[Daily Demand]))"),
    ]),
    tbl("Products", "SUPPLY.WMS.DIM_PRODUCT", [col("Product Name", "PRODUCT_NAME"), col("Category", "CATEGORY")]),
    tbl("Warehouses", "SUPPLY.WMS.DIM_WAREHOUSE", [col("Warehouse", "WAREHOUSE_NAME")]),
  ],
  "Logistics Stream": [
    tbl("Shipments", "SUPPLY.TMS.FACT_SHIPMENT", [col("Transit Days", "TRANSIT_DAYS", "int64"), col("On Time", "IS_ON_TIME", "boolean"), col("Carrier", "CARRIER_NAME")], [
      msr("Avg Transit Days", "AVERAGE(Shipments[Transit Days])"),
      msr("On-Time %", "DIVIDE(CALCULATE(COUNTROWS(Shipments), Shipments[On Time] = TRUE()), COUNTROWS(Shipments))"),
    ]),
  ],
  "Headcount Model": [
    tbl("Employees", "PEOPLE.HR.FACT_EMPLOYEE", [col("Employee Key", "EMPLOYEE_KEY"), col("Department", "DEPARTMENT_NAME"), col("Is Leaver", "IS_LEAVER", "boolean")], [
      msr("Headcount", "DISTINCTCOUNT(Employees[Employee Key])"),
      msr("Leavers", "CALCULATE([Headcount], Employees[Is Leaver] = TRUE())"),
      msr("Attrition Rate", "DIVIDE([Leavers], [Headcount])"),
    ]),
    dateTable("PEOPLE"),
  ],
  "Prototype Lakehouse": [
    tbl("Events", "LAKEHOUSE.BRONZE.EVENTS", [col("Event Count", "EVENT_COUNT", "int64"), col("Event Type", "EVENT_TYPE")], [msr("Total Events", "SUM(Events[Event Count])")]),
  ],
  "Scratch Model": [
    tbl("Scratch", "SANDBOX.PUBLIC.SCRATCH", [col("Value", "VALUE", "decimal"), col("Label", "LABEL")], [msr("Total Value", "SUM(Scratch[Value])")]),
  ],
};

function parsedModel(modelId) {
  const item = modelById.get(modelId);
  if (!item) return null;
  return {
    workspace_id: item.workspaceId,
    semantic_model_id: item.id,
    format: "TMDL",
    tables: MODEL_DEFINITIONS[item.name] ?? [],
    relationships: [],
    warnings: [],
  };
}

// ---------------------------------------------------------------------------
// DAX dependency analysis, derived from the definitions above
// ---------------------------------------------------------------------------

const REFERENCE_PATTERN = /(?:'([^']+)'|([A-Za-z_][A-Za-z0-9_]*))?\[([^\]]+)\]/g;

function objectRef(table, name, objectType) {
  return { object_type: objectType, table_name: table, object_name: name, qualified_name: `${table}[${name}]` };
}

function resolveReference(tables, ownerTable, tableName, name) {
  const table = tableName ? tables.find((candidate) => candidate.name === tableName) : null;
  if (table) {
    if (table.measures.some((item) => item.name === name)) return objectRef(table.name, name, "measure");
    const column = table.columns.find((item) => item.name === name);
    if (column) return objectRef(table.name, name, column.expression ? "calculated_column" : "column");
    return null;
  }
  // A bare [Name]: measures are model-wide; otherwise a column of the owning table.
  const measureTable = tables.find((candidate) => candidate.measures.some((item) => item.name === name));
  if (measureTable) return objectRef(measureTable.name, name, "measure");
  const owner = tables.find((candidate) => candidate.name === ownerTable);
  const column = owner?.columns.find((item) => item.name === name);
  return column ? objectRef(owner.name, name, column.expression ? "calculated_column" : "column") : null;
}

function analyzeDax(parsed) {
  const tables = Array.isArray(parsed?.tables) ? parsed.tables : [];
  const objects = [];
  const dependencies = [];
  const seen = new Set();
  tables.forEach((table) => {
    const owners = [
      ...table.columns.map((column) => ({ ref: objectRef(table.name, column.name, column.expression ? "calculated_column" : "column"), expression: column.expression })),
      ...table.measures.map((measure) => ({ ref: objectRef(table.name, measure.name, "measure"), expression: measure.expression })),
    ];
    owners.forEach(({ ref, expression }) => {
      objects.push(ref);
      if (!expression) return;
      for (const match of expression.matchAll(REFERENCE_PATTERN)) {
        const source = resolveReference(tables, table.name, match[1] ?? match[2], match[3]);
        if (!source || source.qualified_name === ref.qualified_name) continue;
        const key = `${source.qualified_name}=>${ref.qualified_name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        dependencies.push({ source, target: ref, reference_text: match[0] });
      }
    });
  });
  return { objects, dependencies, warnings: [], object_count: objects.length, dependency_count: dependencies.length };
}

/** Physical columns an object ultimately reads: [{ column, table }] with `table` fully qualified. */
function physicalSources(tables, qualifiedName, dependencies, visited = new Set()) {
  if (visited.has(qualifiedName)) return [];
  visited.add(qualifiedName);
  const match = /^(.*)\[(.*)\]$/.exec(qualifiedName);
  if (!match) return [];
  const table = tables.find((candidate) => candidate.name === match[1]);
  const column = table?.columns.find((item) => item.name === match[2]);
  if (column && !column.expression && column.source_column && table.source_path) return [{ column: column.source_column, table: table.source_path }];
  return dependencies
    .filter((dependency) => dependency.target.qualified_name === qualifiedName)
    .flatMap((dependency) => physicalSources(tables, dependency.source.qualified_name, dependencies, visited));
}

function uniqueSources(sources) {
  const byKey = new Map(sources.map((source) => [`${source.table}.${source.column}`, source]));
  return [...byKey.values()];
}

// ---------------------------------------------------------------------------
// Report-scoped evidence (pages, visuals, explorer datasets)
// ---------------------------------------------------------------------------

function reportScope(workspaceId, reportId) {
  const report = reportById.get(reportId);
  if (!report) return null;
  const workspace = workspaceById.get(workspaceId) ?? workspaceById.get(report.workspaceId);
  const boundModel = report.dataset_id ? modelById.get(report.dataset_id) : null;
  const parsed = boundModel ? parsedModel(boundModel.id) : null;
  const analysis = parsed ? analyzeDax(parsed) : { dependencies: [] };
  return { report, workspace, model: boundModel, tables: parsed?.tables ?? [], dependencies: analysis.dependencies };
}

const PAGE_NAMES = ["Overview", "Detail", "Trends"];

function reportPages(report) {
  if (report.report_type === "PaginatedReport") return [{ name: "report-body", display_name: "Report body", order: 0 }];
  return PAGE_NAMES.map((display, order) => ({ name: display.toLowerCase(), display_name: display, order }));
}

/** A small, plausible set of visuals per report, built from its model's own measures and dimensions. */
function reportVisuals(scope) {
  if (!scope?.model || scope.report.report_type === "PaginatedReport") return [];
  const measures = scope.tables.flatMap((table) => table.measures.map((measure) => ({ table: table.name, name: measure.name, type: "measure", expression: measure.expression })));
  const dimensions = scope.tables
    .filter((table) => !table.measures.length && table.columns.length && table.name !== "Date")
    .flatMap((table) => table.columns.filter((column) => !column.expression).map((column) => ({ table: table.name, name: column.name, type: "column", expression: null })));
  const date = scope.tables.find((table) => table.name === "Date");
  const dateField = date ? { table: "Date", name: "Month", type: "column", expression: null } : dimensions[0];
  const m = (index) => measures[index % Math.max(1, measures.length)];
  const d = (index) => dimensions[index % Math.max(1, dimensions.length)];
  if (!measures.length) return [];

  const visuals = [
    { page: "Overview", id: "kpi-card", title: m(0).name, type: "card", fields: [["Values", m(0)]] },
    { page: "Overview", id: "by-dimension", title: d(0) ? `${m(0).name} by ${d(0).name}` : m(0).name, type: "clusteredColumnChart", fields: [["Category", d(0)], ["Values", m(0)]] },
    { page: "Overview", id: "secondary-card", title: m(1).name, type: "card", fields: [["Values", m(1)]] },
    { page: "Detail", id: "detail-table", title: `${d(1)?.name ?? "Detail"} breakdown`, type: "tableEx", fields: [["Rows", d(1)], ["Values", m(2)], ["Values", m(0)]] },
    { page: "Trends", id: "trend-line", title: `${m(3).name} over time`, type: "lineChart", fields: [["Axis", dateField], ["Values", m(3)]] },
  ];
  return visuals.map((visual) => ({ ...visual, fields: visual.fields.filter(([, field]) => Boolean(field)) }));
}

function visualSourceRows(scope) {
  return reportVisuals(scope).flatMap((visual) => visual.fields.map(([role, field]) => {
    const sources = uniqueSources(physicalSources(scope.tables, `${field.table}[${field.name}]`, scope.dependencies));
    return {
      page_name: visual.page,
      page_id: visual.page.toLowerCase(),
      visual_id: visual.id,
      visual_title: visual.title,
      visual_type: visual.type,
      field_role: role,
      semantic_table: field.table,
      semantic_object_name: field.name,
      semantic_object_type: field.type,
      dax_expression: field.expression,
      source_columns: [...new Set(sources.map((source) => source.column))],
      source_tables: [...new Set(sources.map((source) => source.table))],
      via_workspace_name: null,
      resolution_status: sources.length ? "resolved" : "partial",
      resolution_note: sources.length ? null : "No physical column behind this field.",
    };
  }));
}

function reportVisualSourceColumns(scope) {
  const rows = visualSourceRows(scope);
  const resolved = rows.filter((row) => row.resolution_status === "resolved").length;
  return {
    workspace_id: scope.workspace.id,
    workspace_name: scope.workspace.name,
    report_id: scope.report.id,
    report_name: scope.report.name,
    semantic_model_id: scope.model?.id ?? null,
    semantic_model_name: scope.model?.name ?? null,
    semantic_model_workspace_id: scope.model?.workspaceId ?? null,
    total_field_reference_count: rows.length,
    resolved_count: resolved,
    partial_count: rows.length - resolved,
    unresolved_count: 0,
    rows,
    warnings: [],
  };
}

function semanticObjectRows(scope) {
  if (!scope?.model) return [];
  const context = { workspace_id: scope.workspace.id, workspace_name: scope.workspace.name, report_id: scope.report.id, report_name: scope.report.name, semantic_model_id: scope.model.id };
  return scope.tables.flatMap((table) => [
    ...table.columns.map((column) => ({
      ...context,
      semantic_table: table.name,
      semantic_object_type: column.expression ? "calculated_column" : "column",
      semantic_object_name: column.name,
      semantic_data_type: column.data_type,
      semantic_source_column: column.source_column,
      semantic_dax_expression: column.expression,
    })),
    ...table.measures.map((measure) => ({
      ...context,
      semantic_table: table.name,
      semantic_object_type: "measure",
      semantic_object_name: measure.name,
      semantic_data_type: null,
      semantic_source_column: null,
      semantic_dax_expression: measure.expression,
    })),
  ]);
}

function splitQualified(qualifiedName) {
  const [database, schema, ...rest] = qualifiedName.split(".");
  return { database, schema, table: rest.join(".") };
}

function reportSourceTableRows(scope) {
  if (!scope?.model) return [];
  return scope.tables.filter((table) => table.source_path).map((table) => {
    const { database, schema, table: tableName } = splitQualified(table.source_path);
    return {
      workspace_name: scope.workspace.name,
      report_name: scope.report.name,
      report_id: scope.report.id,
      semantic_model_id: scope.model.id,
      source_account: SOURCE_ACCOUNT,
      source_database: database,
      source_schema: schema,
      table_name: tableName,
      source_object_type: tableName.startsWith("DIM_") ? "view" : "table",
    };
  });
}

function measureSourceRows(scope) {
  if (!scope?.model) return [];
  return scope.tables.flatMap((table) => [
    ...table.measures.map((measure) => measure.name),
    ...table.columns.filter((column) => column.expression).map((column) => column.name),
  ].flatMap((name) => uniqueSources(physicalSources(scope.tables, `${table.name}[${name}]`, scope.dependencies)).map((source) => ({
    report_id: scope.report.id,
    semantic_table: table.name,
    semantic_object_name: name,
    source_column_name: source.column,
    source_fully_qualified_name: source.table,
  }))));
}

function snapshot(scope) {
  const objects = semanticObjectRows(scope);
  const measureLineage = measureSourceRows(scope);
  const sourceLineage = scope?.tables.filter((table) => table.source_path).map((table) => ({ semantic_table: table.name, source_fully_qualified_name: table.source_path })) ?? [];
  return {
    warnings: [],
    semantic_model_objects: { count: objects.length, rows: objects },
    measure_source_lineage: { count: measureLineage.length, rows: measureLineage },
    source_database_lineage: { count: sourceLineage.length, rows: sourceLineage },
  };
}

function scopesFromBody(body) {
  const selections = Array.isArray(body?.reports) ? body.reports : body?.report_id ? [body] : [];
  return selections.map((selection) => reportScope(selection.workspace_id, selection.report_id)).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Estate discovery and auth
// ---------------------------------------------------------------------------

function buildEstate() {
  const nodes = [];
  const edges = [];
  MODELS.forEach((item) => nodes.push({ node_id: `model-${item.id}`, node_type: "semantic_model", name: item.name, workspace_id: item.workspaceId, semantic_model_id: item.id }));
  REPORTS.forEach((report) => {
    nodes.push({ node_id: `report-${report.id}`, node_type: "report", name: report.name, workspace_id: report.workspaceId, report_id: report.id });
    if (report.dataset_id && report.binding === "matched") edges.push({ source_id: `report-${report.id}`, target_id: `model-${report.dataset_id}` });
  });
  return {
    workspaces: WORKSPACES.map((workspace) => ({
      workspace,
      reports: REPORTS.filter((report) => report.workspaceId === workspace.id).map(stripReport),
      semantic_models: MODELS.filter((item) => item.workspaceId === workspace.id).map(stripModel),
      report_bindings: REPORTS.filter((report) => report.workspaceId === workspace.id && report.binding).map((report) => ({
        report_id: report.id,
        semantic_model_id: report.binding === "matched" ? report.dataset_id : null,
        status: report.binding,
      })),
    })),
    graph: { nodes, edges },
    warnings: [{ code: "workspace_scan_partial", message: "Sandbox returned a partial inventory; 2 items could not be read with the current permissions." }],
    workspace_count: WORKSPACES.length,
    report_count: REPORTS.length,
    semantic_model_count: MODELS.length,
  };
}

function microsoftStatus(mode) {
  if (mode === "none") return { status: 401, json: { detail: "Not authenticated" } };
  if (mode === "pending") return { json: { status: "pending" } };
  if (mode === "partial") {
    return {
      json: {
        status: "partial",
        powerbi: { connected: true, message: "Power BI API token acquired.", granted_roles: ["Tenant.Read.All"] },
        fabric: { connected: false, message: "Fabric API consent has not been granted for this application.", missing_scopes: ["Item.Read.All", "Workspace.Read.All"] },
      },
    };
  }
  return {
    json: {
      status: "authenticated",
      powerbi: { connected: true, message: "Power BI API token acquired.", granted_roles: ["Tenant.Read.All"] },
      fabric: { connected: true, message: "Fabric API token acquired.", granted_roles: ["Workspace.Read.All"] },
    },
  };
}

function requestBody(route) {
  try {
    return route.request().postDataJSON();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

async function mockBackend(page, options = {}) {
  const { estateError = false, microsoft = "authenticated", database = "authenticated", estateDelayMs = 0, onUnhandled } = options;
  const estate = buildEstate();

  await page.route("**/openapi.json", (route) => route.fulfill({ json: { openapi: "3.1.0", info: { title: "PBI Lineage", version: "1" }, paths: {} } }));
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = (body, status = 200) => route.fulfill({ status, json: body });

    if (path.endsWith("/api/v1/health")) return json({ status: "ok" });
    if (path.endsWith("/api/v1/ai/status")) return json({ enabled: true, configured: true, streaming_enabled: true });

    if (path.endsWith("/auth/microsoft/device/status")) {
      const response = microsoftStatus(microsoft);
      return json(response.json, response.status ?? 200);
    }
    if (path.endsWith("/auth/microsoft/service-principal/session/status")) return json({ detail: "No service principal session" }, 401);
    if (path.endsWith("/auth/snowflake/session/status")) {
      if (database === "none") return json({ detail: "No database session" }, 401);
      return json({ status: "authenticated", authentication_method: "key_pair", current_role: "LINEAGE_READER", current_warehouse: "COMPUTE_WH", current_database: "ANALYTICS", current_schema: "PUBLIC" });
    }

    if (path.includes("/lineage/estate/discover")) {
      if (estateDelayMs) await new Promise((resolve) => setTimeout(resolve, estateDelayMs));
      if (estateError) return json({ error: { code: "forbidden", message: "Estate discovery requires the lineage administrative access.", provider: "lineage", request_id: "req-demo-0001" } }, 403);
      return json(estate);
    }
    if (path.endsWith("/lineage/dax/analyze")) return json(analyzeDax(requestBody(route)));

    if (/\/api\/v1\/workspaces\/?$/.test(path)) return json({ workspaces: WORKSPACES });
    const workspaceMatch = path.match(/\/api\/v1\/workspaces\/([^/]+)\/(reports|semantic-models)\/?$/);
    if (workspaceMatch) {
      const [, workspaceId, kind] = workspaceMatch;
      if (kind === "reports") return json({ reports: REPORTS.filter((report) => report.workspaceId === workspaceId).map(stripReport) });
      return json({ semantic_models: MODELS.filter((item) => item.workspaceId === workspaceId).map(stripModel) });
    }
    const parsedMatch = path.match(/\/semantic-models\/([^/]+)\/definition\/parsed\/?$/);
    if (parsedMatch) {
      const parsed = parsedModel(parsedMatch[1]);
      return parsed ? json(parsed) : json({ detail: "Semantic model not found" }, 404);
    }
    if (/\/semantic-models\/[^/]+\/metadata\/?$/.test(path)) return json({ reconciliation: { matched_count: 18, definition_only_count: 1, xmla_only_count: 0 } });

    if (path.endsWith("/explorer/report-source-tables")) {
      const rows = scopesFromBody(requestBody(route)).flatMap(reportSourceTableRows);
      return json({ rows, count: rows.length, warnings: [] });
    }
    if (path.endsWith("/explorer/semantic-model-objects")) {
      const rows = scopesFromBody(requestBody(route)).flatMap(semanticObjectRows);
      return json({ rows, count: rows.length, warnings: [] });
    }
    if (path.endsWith("/explorer/snapshot")) {
      const [scope] = scopesFromBody(requestBody(route));
      return json(snapshot(scope ?? null));
    }
    if (path.endsWith("/explorer/report-visual-source-columns")) {
      const [scope] = scopesFromBody(requestBody(route));
      return scope ? json(reportVisualSourceColumns(scope)) : json({ detail: "Report not found" }, 404);
    }
    if (path.endsWith("/explorer/measure-source-lineage")) {
      const rows = scopesFromBody(requestBody(route)).flatMap(measureSourceRows);
      return json({ rows, count: rows.length, warnings: [] });
    }
    if (path.endsWith("/explorer/visual-source-lookup")) {
      const rows = scopesFromBody(requestBody(route)).flatMap((scope) => visualSourceRows(scope).map((row) => ({
        report_id: scope.report.id,
        report_name: scope.report.name,
        workspace_name: scope.workspace.name,
        page_id: row.page_id,
        page_name: row.page_name,
        visual_id: row.visual_id,
        visual_name: row.visual_title,
        visual_type: row.visual_type,
        semantic_table: row.semantic_table,
        semantic_object_name: row.semantic_object_name,
        match_status: "matched",
      })));
      return json({ rows, count: rows.length, warnings: [] });
    }

    const reportMatch = path.match(/\/workspaces\/([^/]+)\/reports\/([^/]+)(?:\/(pages|definition\/normalized))?\/?$/);
    if (reportMatch) {
      const [, workspaceId, reportId, part] = reportMatch;
      const scope = reportScope(workspaceId, reportId);
      if (!scope) return json({ detail: "Report not found" }, 404);
      if (part === "pages") return json({ pages: reportPages(scope.report) });
      if (part === "definition/normalized") {
        const visuals = reportVisuals(scope);
        return json({ semantic_model: scope.model ? { semantic_model_id: scope.model.id, path: null } : null, page_count: reportPages(scope.report).length, visual_count: visuals.length, source_part_count: visuals.length + 4, warnings: [] });
      }
      return json(stripReport(scope.report));
    }

    if (onUnhandled) onUnhandled(`${route.request().method()} ${path}`);
    return json({});
  });
}

module.exports = {
  mockBackend,
  fixture: { WORKSPACES, MODELS, REPORTS, MODEL_DEFINITIONS, buildEstate, parsedModel, analyzeDax },
};
