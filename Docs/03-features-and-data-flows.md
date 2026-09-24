# Features and Data Flows

## Application flow

```
Home
  -> Setup Guide from the header, footer, or workspace menu
       -> Microsoft/Fabric/Scanner/current database connector/backend prerequisites
  -> Start
  -> Power BI setup
       -> device-code session OR service-principal session
       -> Power BI and Fabric readiness
  -> Database setup
       -> optional source-system session (currently Snowflake)
  -> Explorer
       -> workspace -> report or semantic model
       -> report detail / semantic objects / mappings / diagrams
  -> Report Lineage
       -> report selected across the whole estate
       -> snapshot evidence tabs
       -> report / column / calculation diagrams
  -> API documentation
       -> OpenAPI group and operation
       -> parameters and JSON body
       -> authenticated execution
       -> response body and headers
```

## Static Setup Guide

`app/routes/setup-guide.tsx` and
`app/components/setup-guide/setup-guide.tsx` render `/setup-guide`.
The guide performs no provider requests. It documents responsible roles,
device-code/service-principal/browser-SSO choices, the exact delegated scopes
requested by this backend, Scanner tenant settings, optional XMLA, all four
supported Snowflake authentication methods, backend `.env` policy, IIS/Vite
connectivity, the ordered in-app workflow, verification, troubleshooting, and
official Microsoft/Snowflake references. Wide tables and code examples scroll
inside their containers rather than widening mobile pages.

## Home

`app/routes/home.tsx` renders `/` as a database-neutral product overview. It
uses a tested Report Lineage workspace capture, explains the investigation
questions and evidence path at a high level, and contains one primary Start
action to Power BI setup. Navigation links stay in the shared header and
footer. Home disables the backend health query because no connection is needed
to read the overview.

## Authentication and session behavior

### Device code (`app/components/workspace/power-bi-setup.tsx`)

1. Form posts tenant/client IDs to `POST /api/v1/auth/microsoft/device/start`.
2. Backend returns the Microsoft verification URL, user code, session ID.
3. Frontend polls/checks device session status
   (`GET /api/v1/auth/microsoft/device/{session_id}/status`).
4. FastAPI stores provider tokens server-side and sets the session cookie.

### Service principal

1. Form posts tenant ID, client ID, client secret to
   `POST /api/v1/auth/microsoft/service-principal/session`.
2. Power BI and Fabric application-token readiness are shown independently;
   status may be `authenticated` or `partial`.
3. The frontend clears the client secret field immediately after submission
   and never persists it (not in Zustand, not in query cache).

### Snowflake (`app/components/workspace/database-setup.tsx`)

Create/check/delete a backend Snowflake session
(`POST`/`GET`/`DELETE /api/v1/auth/snowflake/session[...]`). Optional
enrichment only — it does not replace Power BI estate discovery.

### Shared request rules

- All requests use `credentials: "include"` so the HTTP-only backend cookie
  is sent (`app/lib/use-api-executor.ts`).
- An optional administrative key lives only in Zustand memory
  (`useAppStore().adminKey`) and is attached by the shared executor as
  `X-Lineage-Admin-Key`. There is **no visible UI field** for it by design —
  it's meant to be set only by an approved host integration.
- Sensitive fields (password/secret/token/private-key/passcode) typed into
  the API-documentation JSON editor are cleared after execution.
- Successful Power BI auth invalidates Explorer/Report Lineage TanStack Query
  caches; logout removes those cached datasets.

## Explorer (`app/components/workspace/explorer.tsx`, ~920 lines)

Workspace-scoped investigation, entry point `GET /api/v1/workspaces`. Names
are the primary UI identity; IDs are shown only as supporting context below a
selected name.

Levels, in order of drill-down:

1. Workspace assets and access.
2. Report detail and pages.
3. Report-specific semantic lineage.
4. Semantic tables, columns, measures, hierarchies, relationships, DAX.
5. Database-column → semantic-object mapping.
6. Column/measure dependency diagrams (React Flow).

Heavy report/semantic-model requests fire only after selection and are
cached via `heavyQueryOptions` (`staleTime: 5 min`, `gcTime: 30 min`,
`retry: false`) so tabs reuse prepared data instead of re-fetching. Domain
types (`Workspace`, `Report`, `SemanticModel`, `ParsedColumn`, ...) are
defined locally in the component, matching backend response shapes.

**Important invariant**: a report can use a semantic model owned by a
*different* workspace. Never assume the report's workspace ID applies to its
model — the model's own workspace ID must be used unless estate evidence
confirms the model is local to the report's workspace.

## Report Lineage (`app/components/workspace/report-lineage.tsx` +
`report-lineage-diagrams.tsx`)

Cross-workspace, report-first view.

1. `GET /api/v1/lineage/estate/discover?top=5000&skip=0` returns an
   `EstateResponse`: reports from every accessible workspace, a
   `workspaces[]` inventory (each with `report_bindings` marking
   `matched`/`unresolved` semantic-model links), and a `graph` of
   `EstateNode`/edges for composite-model resolution.
2. The report selector shows `report name - workspace name`; the report ID
   appears only after selection.
3. `POST /api/v1/explorer/snapshot` prepares an `ExplorerSnapshot`: physical
   source rows, semantic-model object rows, measure/column dependency rows,
   report layout rows, and visual-source-lookup rows for the selected
   report — see the row types at the top of `report-lineage.tsx` for exact
   fields (`SourceRow`, `SemanticObjectRow`, `MeasureSourceRow`,
   `ReportLayoutRow`, `VisualSourceRow`).
4. Parsed TMDL and exact DAX dependency analysis load in the background.
5. Snapshot and exact-dependency results are cached for 10 minutes.

Evidence tabs: report information, database objects, semantic objects/DAX,
visual objects/pages/roles/fields, semantic source mapping, visual source
mapping, and lineage diagrams.

Diagram modes (`report-lineage-diagrams.tsx`, React Flow):

- **Report/database**: physical source → semantic table → semantic model →
  report → page → optional visual expansion.
- **Column lineage**: source evidence → selected semantic column →
  calculations that use it, 1–6 levels deep.
- **Measure/calculated column**: upstream inputs → selected target →
  downstream dependents, 1–6 levels deep.

React Flow stays mounted while graph identity changes. Once ELK finishes a
layout, the viewport API fits the visible nodes without discarding React Flow's
interaction state; a reset-layout control restores automatic positions after
manual dragging.

## Shared Lineage Diagram Engine

Explorer, Report Lineage, Table Impact, and Measure Impact build the same
`LineageGraph` contract and render it through
`app/components/workspace/lineage/lineage-diagram.tsx`. ELK computes layered
left-to-right or top-to-bottom positions in a Web Worker, React Flow renders
directed arrowheads and draggable nodes, and each custom node can collapse or
restore its descendants. Large graphs cull offscreen elements and avoid costly
edge animation; their initial viewport favors the target's nearest nodes while
the standard Fit View control remains available for the complete graph.
`app/lib/dependency-graph.ts` provides the shared breadth-first dependency
closure used to turn DAX references into those graphs.

## Table Impact

`app/components/workspace/table-impact.tsx` preloads every parseable semantic
model in the selected workspace scope through `fetchEstateInventory`. The
operator searches one combined table list, optionally selects one column, and
chooses upstream or downstream traversal. Exact DAX dependencies come from
`POST /api/v1/lineage/dax/analyze`; estate bindings and batched Explorer
lookups attach report and visual usage. Diagram and AG Grid results degrade
independently when elevated lineage evidence is unavailable.

## Measure Impact

`app/components/workspace/measure-impact.tsx` uses the same scoped inventory
and evidence pipeline but starts from one measure. It computes upstream input
columns/measures and downstream dependent calculations together, then renders
their direction, depth, DAX evidence, report usage, and visual usage in a
collapsible diagram and exportable grid.

## Power BI Admin Scanner

`app/components/workspace/scanner.tsx`, `app/lib/scanner-api.ts`, and
`app/lib/use-workspace-scan.ts` implement the backend's four-step scanner
workflow: submit 1-100 workspace IDs, poll status every four seconds, stop at
`Succeeded`/`Failed`, and fetch the immutable result once. The page exposes
workspaces/tags, reports/dashboards/tiles, semantic objects and M expressions,
dependencies, and datasource instances. Explorer reuses the same hook for an
explicit single-workspace scan in Assets & access. Scans never start
automatically because Microsoft applies tenant quotas.

## API Documentation and execution
(`app/components/workspace/api-documentation.tsx` +
`api-execution-panel.tsx`)

The app reads `/openapi.json` at runtime (`fetchOpenApi` in
`app/lib/api-catalog.ts`). `flattenEndpoints` converts each FastAPI
operation into an `ApiEndpoint`, grouped by its first OpenAPI tag.

Per operation, the UI provides:

- Method, route, operation name, description.
- Path/query/header inputs generated from OpenAPI `parameters`.
- Required-field validation and enum selectors (from `schema.enum`).
- An editable JSON body generated from the request schema (local `$ref`
  resolution across objects, arrays, enums, defaults, examples, `allOf`,
  `oneOf`, `anyOf` — see `api-catalog.ts`).
- Curated blank templates for credential/setup operations
  (`SETUP_ENDPOINT_DEFINITIONS`), so those operations still show up even if
  they're temporarily absent from the live OpenAPI doc.
- Authenticated execution via the shared `useApiExecutor` hook (same cookie +
  admin-key policy as the rest of the app).
- Status, elapsed duration, response body, response headers, with
  body/header tabs and copyable output.

## Table copy and export rules

- AG Grid enables text selection and per-cell copy controls.
- "Copy table" produces tab-separated content suitable for spreadsheets.
- CSV/Excel-compatible exports prepend parent workspace/report/semantic-model
  names and IDs; filenames use the selected parent object's *name*, not its
  internal ID.
- DAX expressions remain complete in copied/exported data even when
  visually truncated in a grid cell.
