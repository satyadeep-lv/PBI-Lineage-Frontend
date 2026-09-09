# Features and Data Flows

## Application flow

```
Home
  -> Power BI setup
       -> device-code session OR service-principal session
       -> Power BI and Fabric readiness
  -> Database setup
       -> optional Snowflake session
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

React Flow is remounted whenever graph identity changes, so a new selection
fits itself to the viewport instead of inheriting the previous pan/zoom.

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

Two components are **retained but unused** by the current route:
`api-domain-canvas.tsx` (alternate full-domain operation selector/executor)
and `api-output-panel.tsx` (its response renderer). Current documentation
uses `ApiExecutionPanel` inside `ApiDocumentation` instead. Don't build on
top of the retained pair without first checking whether they're still meant
to be dead code — see [05-file-reference.md](05-file-reference.md).

## Table copy and export rules

- AG Grid enables text selection and per-cell copy controls.
- "Copy table" produces tab-separated content suitable for spreadsheets.
- CSV/Excel-compatible exports prepend parent workspace/report/semantic-model
  names and IDs; filenames use the selected parent object's *name*, not its
  internal ID.
- DAX expressions remain complete in copied/exported data even when
  visually truncated in a grid cell.
