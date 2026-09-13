# PBI Lineage Explorer Frontend

Browser application for exploring Power BI assets, semantic models, DAX
dependencies, physical database evidence, report visuals, and downstream
lineage. It runs as a separate source-control project from the FastAPI backend
and is designed for static hosting in IIS on the same Windows EC2 machine.

Developed by **Satyadeep Singh**.

## What This Project Does

The application turns the backend API surface into guided operational views:

- Authenticate Power BI and Fabric with a device code or service principal.
- Create and inspect an optional Snowflake session.
- Browse Power BI workspaces, reports, and semantic models by name.
- Inspect report pages, semantic objects, DAX, source paths, and XMLA evidence.
- Map physical database columns to semantic columns and calculations.
- Trace report, column, measure, and calculated-column lineage through
  directed, collapsible diagrams with automatic layout.
- Analyze table impact: every calculation that depends on a semantic table
  (or one column), cross-referenced with the reports and visuals that use it.
- Analyze measure impact: upstream inputs and downstream dependents for a
  single measure, cross-referenced with the reports and visuals that use it.
- Run the Power BI Admin metadata scanner (one workspace from Explorer, or up
  to 100 at once from a dedicated Scanner page) to see dashboards, app
  linkage, ownership, datasource instances and misconfiguration, and
  per-table M-query source expressions.
- Copy individual table values or full tables for analysis.
- Download table data as CSV or Excel-compatible `.xls` files with parent
  workspace, report, and semantic-model context.
- Browse and execute every operation published by FastAPI OpenAPI from the
  in-application API documentation view.

The frontend does not own Power BI, Fabric, or Snowflake credentials. It sends
them to FastAPI when required and relies on backend-managed HTTP-only session
cookies for subsequent requests.

## Repository Boundary

Keep the backend and frontend as sibling directories and independent Git
repositories:

```text
C:\Users\Administrator\Desktop\
|-- PBI-Lineage-Backend\       FastAPI, backend tests, Docker image, backend Git repo
`-- PBI-Lineage-Frontend\      React application, static build, frontend Git repo
```

Do not place the frontend inside the backend repository and do not copy backend
runtime files, Python environments, secrets, or Docker volumes into this
project. The two applications communicate only over HTTP.

Backend reference context:

```text
C:\Users\Administrator\Desktop\PBI-Lineage-Backend\REF_DOC\PROJECT_CONTEXT.md
```

Frontend reference context:

```text
C:\Users\Administrator\Desktop\PBI-Lineage-Frontend\REF_DOC\PROJECT_CONTEXT.md
```

`REF_DOC/` is currently ignored by this repository, so the frontend context is
local documentation unless the ignore rule is intentionally changed.

## Technology Stack

| Area | Implementation | Responsibility |
| --- | --- | --- |
| Language | TypeScript | Strict application and API integration types. |
| UI | React 19 | Component rendering and local interaction state. |
| Framework | React Router Framework Mode | Route definitions, SPA build, metadata, and error boundary. |
| Build | Vite | Development server, dependency optimization, proxy, and production bundling. |
| Styling | Tailwind CSS 4 | Utility styling and design tokens. |
| Components | shadcn/ui with Base UI | Accessible buttons, inputs, dialogs, sheets, tabs, and related primitives. |
| Icons | Lucide React | Consistent interface icons. |
| Server state | TanStack Query v5 | API caching, loading/error states, invalidation, and background preparation. |
| UI state | Zustand | API origin and ephemeral administrative key state. |
| Graphs | XYFlow / React Flow with `@dagrejs/dagre` layout | Directed, auto-laid-out, collapsible report, column, measure, table-impact, and measure-impact diagrams. |
| Tables | AG Grid Community | Sortable/filterable analysis tables and selectable values. |
| Forms | React Hook Form and Zod | Setup form state and validation. |
| API catalog | Runtime OpenAPI parser | Discovers and groups current FastAPI operations. |
| API generation | Orval installed | Available for future generated clients; no generated Orval client is currently committed. |
| Unit/component tests | Vitest and React Testing Library installed | Test dependencies are ready; focused unit suites have not yet been added. |
| E2E | Playwright | Desktop/mobile report-lineage and API-execution browser coverage. |
| Production frontend | IIS static site | Serves `build/client` and provides SPA fallback/reverse proxy rules. |
| Production backend | Existing Windows Docker deployment | FastAPI remains independently built and operated. |

## Prerequisites

1. Windows machine with the backend available at `http://127.0.0.1:8000` for
   local development.
2. Node.js and npm on `PATH`.
3. Power BI/Fabric application registration and permissions expected by the
   backend.
4. Optional Snowflake connection details for Snowflake enrichment.
5. Playwright browser binaries when running browser tests.

This project was last validated locally with:

```text
Node.js v24.19.0
npm 11.17.0
```

## Installation

Open a new PowerShell window after installing Node.js, then run:

```powershell
cd C:\Users\Administrator\Desktop\PBI-Lineage-Frontend
node --version
npm --version
npm ci
npx playwright install chromium
```

Use `npm ci` for a reproducible installation from `package-lock.json`. Use
`npm install` only when dependencies are intentionally being changed.

If PowerShell blocks `npm.ps1`, use the Windows command shim:

```powershell
npm.cmd ci
npm.cmd run dev
```

## Environment Configuration

The preferred deployment is same-origin: IIS serves the frontend and proxies
backend routes. In that model no frontend environment variable is required.

Optional `.env`:

```dotenv
VITE_API_ORIGIN=
```

Behavior:

- Blank `VITE_API_ORIGIN` means same-origin requests such as `/api/v1/health`.
- During development, Vite proxies `/api`, `/openapi.json`, and `/docs` to
  `http://127.0.0.1:8000`.
- A non-empty value must be the backend origin without `/api/v1`; trailing
  slashes and a final `/api/v1` are normalized by the Zustand store.
- Cross-origin production deployment requires matching backend CORS and cookie
  `SameSite`/`Secure` configuration. Same-origin proxying is strongly preferred.

Never put tenant secrets, client secrets, Snowflake passwords, access tokens,
session IDs, or API keys in `.env`, source files, route state, or Git.

## Development

Start FastAPI first and verify:

```text
http://127.0.0.1:8000/docs
```

Then start the frontend:

```powershell
cd C:\Users\Administrator\Desktop\PBI-Lineage-Frontend
npm run dev
```

Open:

```text
http://localhost:5173
```

Use `localhost` consistently. Binding the server to `127.0.0.1` while React
Router generates development imports for `localhost` can cause failed dynamic
module requests during optimization reloads.

Vite explicitly prebundles TanStack Query, XYFlow, and AG Grid because they are
used behind lazy analysis routes. A clean install can still spend time building
its dependency cache once. Wait for Vite to finish before refreshing repeatedly.

Do not run `npm run build` while actively using the same Vite process. The build
writes `build/`, which can trigger development file-watcher reloads. Stop the
development server, build, and then restart it.

## Commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install exact locked dependencies. |
| `npm run dev` | Start React Router/Vite development server. |
| `npm run typecheck` | Generate React Router types and run strict TypeScript checks. |
| `npm run build` | Produce the SPA client and React Router server artifacts. |
| `npm run start` | Serve `build/server/index.js`; useful for optional Node-hosted validation, not the target IIS deployment. |
| `npx playwright test` | Run all Playwright browser tests. |
| `npx playwright test tests/report-lineage.spec.ts` | Run only report-lineage desktop/mobile coverage. |
| `npx playwright test tests/impact-analysis.spec.ts` | Run only table-impact/measure-impact coverage. |
| `npx playwright test tests/scanner.spec.ts` | Run only Scanner page and Explorer scan-panel coverage. |

## Route Map

| Route | View | Data responsibility |
| --- | --- | --- |
| `/` | Overview | Product purpose, value, workflow, and start action. |
| `/workspace` | Power BI setup | Default workspace route. |
| `/workspace/power-bi` | Power BI setup | Device-code and service-principal authentication. |
| `/workspace/database` | Database setup | Snowflake connection, status, and logout. |
| `/workspace/explorer` | Explorer | Workspace-scoped report/model investigation. |
| `/workspace/report-lineage` | Report Lineage | Report-focused evidence across all accessible workspaces. |
| `/workspace/table-impact` | Table impact | Table/column-level downstream or upstream impact across a semantic model, cross-referenced with the reports and visuals that use it. |
| `/workspace/measure-impact` | Measure impact | Measure-level upstream and downstream dependency impact, cross-referenced with the reports and visuals that use it. |
| `/workspace/scanner` | Scanner | Power BI Admin metadata scan across one or more workspaces: dashboards, datasource instances, table sources, dataset ownership. |
| `/workspace/api-docs` | API documentation | Grouped OpenAPI reference and execution workbench. |
| `/workspace/<tag-slug>` | Filtered API documentation | API documentation prefiltered to one OpenAPI tag when selected by the sidebar. |

Unknown workspace sections fall back to API documentation. Unknown top-level
routes are handled by the React Router error boundary in development and require
IIS SPA fallback in production.

## Application Flow

```text
Home
  -> Power BI setup
       -> device-code session OR service-principal session
       -> Power BI and Fabric readiness
  -> Database setup
       -> optional Snowflake session
  -> Explorer
       -> workspace
       -> report or semantic model
       -> report detail / semantic objects / mappings / diagrams
  -> Report Lineage
       -> report selected across the whole estate
       -> snapshot evidence tabs
       -> report / column / calculation diagrams
  -> Table Impact
       -> workspace -> semantic model -> table (or one column)
       -> downstream or upstream impact diagram and grid
       -> cross-report and cross-visual evidence
  -> Measure Impact
       -> workspace -> semantic model -> table -> measure
       -> upstream and downstream impact diagram and grid
       -> cross-report and cross-visual evidence
  -> Scanner
       -> workspace scope (1-100) -> run scan -> poll status
       -> dashboards, datasource instances, table sources, dataset ownership
  -> API documentation
       -> OpenAPI group and operation
       -> parameters and JSON body
       -> authenticated execution
       -> response body and headers
```

## Authentication And Session Behavior

### Device Code

1. The setup form sends tenant and client IDs to
   `POST /api/v1/auth/microsoft/device/start`.
2. The backend returns the Microsoft verification URL, user code, and session
   identifier.
3. The browser polls or manually checks device session status.
4. FastAPI stores provider tokens in its session and sets the browser cookie.

### Service Principal

1. The form posts tenant ID, client ID, and client secret to
   `POST /api/v1/auth/microsoft/service-principal/session`.
2. Power BI and Fabric application-token readiness are presented independently.
3. Status may be `authenticated` or `partial`.
4. The frontend clears the client secret after submission and never persists it.

### Snowflake

The database setup form creates, checks, and deletes the backend Snowflake
session. Snowflake is optional enrichment; it does not replace Power BI estate
discovery.

### Shared Request Rules

- Requests use `credentials: "include"` so HTTP-only backend cookies are sent.
- The optional lineage administrative key exists only in Zustand memory and is
  added as `X-Lineage-Admin-Key` by shared request helpers.
- The API execution UI never renders that administrative header as a field.
- Password, secret, token, private-key, and passcode fields entered in the API
  JSON editor are cleared after execution.
- Successful Power BI authentication invalidates Explorer and Report Lineage
  caches. Logout removes those cached datasets.
- Every workspace page (Explorer, Report Lineage, Table Impact, Measure
  Impact, Scanner) shows the same `PowerBiAuthRequired` empty state
  (`app/components/workspace/auth-required.tsx`) whenever its first Power
  BI-backed query fails — a heading, a one-line explanation, and a button
  back to Power BI setup, rather than a page-specific error message.

## Explorer Data Flow

Explorer begins with `GET /api/v1/workspaces` and keeps names as the primary UI
identity. IDs appear below selected names only as supporting technical context.

Major levels:

1. Workspace assets and access.
2. Report page details.
3. Report visual field lineage.
4. Semantic tables, columns, measures, hierarchies, relationships, and DAX.
5. Database-column to semantic-object mapping.
6. Column and measure dependency diagrams.

Heavy report and semantic-model requests begin after selection and are cached by
TanStack Query. Tabs reuse prepared data instead of repeating provider calls.

A report can use a semantic model from another workspace. Never substitute the
report workspace ID for the model workspace ID unless estate evidence confirms
the model is local.

The Assets & access tab's dashboards, app linkage, and ownership sections are
empty until the operator explicitly runs a metadata scan for the selected
workspace (see Scanner Data Flow) — this is never triggered automatically.

## Report Lineage Data Flow

1. `GET /api/v1/lineage/estate/discover?top=5000&skip=0` returns reports from
   all accessible workspaces plus graph bindings.
2. The selector displays `report name - workspace name` and shows the report ID
   after selection.
3. `POST /api/v1/explorer/snapshot` prepares physical, semantic, DAX, report
   layout, and visual source evidence for the selected report.
4. Parsed TMDL and exact DAX analysis load in the background.
5. Snapshot and exact dependency results are cached for ten minutes.

Evidence tabs:

- Report information.
- Database objects.
- Semantic objects and DAX expressions.
- Visual objects, pages, roles, and fields.
- Semantic source mapping.
- Visual source mapping.
- Lineage diagrams.

Diagram modes:

- Report and database: physical source -> semantic table -> semantic model ->
  report -> page -> optional visual expansion.
- Column lineage: source evidence -> selected semantic column -> calculations
  that use it, from one to six levels.
- Measure and calculated column: upstream inputs -> selected target -> downstream
  dependent calculations, from one to six levels.

All three modes render through the shared, directed, collapsible lineage
diagram engine described below. React Flow is remounted when graph identity
changes so a new selection is fitted inside the viewport rather than
inheriting the previous pan or zoom.

## Lineage Diagram Engine

Explorer, Report Lineage, Table Impact, and Measure Impact all render their
diagrams through one shared engine in `app/components/workspace/lineage/`,
so every dependency diagram in the application looks and behaves the same
way:

- `lineage-types.ts` defines the diagram-agnostic `LineageGraph` shape
  (`LineageGraphNode`/`LineageGraphEdge`) that every feature builds toward.
- `lineage-layout.ts` runs `@dagrejs/dagre` to automatically compute a
  layered, left-to-right or top-to-bottom position for every node; no feature
  hand-computes `x`/`y` coordinates.
- `lineage-node.tsx` renders a tone-colored card per object kind with a
  collapse/expand chevron. Collapsing a node hides every node strictly
  farther from the diagram's root through it (an undirected "display tree"
  computed with breadth-first search, rooted at the focal node or at
  in-degree-zero nodes), so collapse behaves correctly even in bidirectional
  upstream+downstream diagrams such as Measure Impact.
- `lineage-diagram.tsx` exports `<LineageDiagram>`, which owns collapse
  state, derives the currently visible node/edge subset, lays it out with
  dagre, and renders it with React Flow. Edges always carry an arrowhead
  (`MarkerType.ArrowClosed`), so dependency direction is visible without
  reading labels.

`app/lib/dependency-graph.ts` complements the diagram engine with
`computeDependencyClosure`, a single multi-source breadth-first search over
`dax/analyze`'s flat dependency-edge list that Explorer, Report Lineage,
Table Impact, and Measure Impact all use to answer "what feeds this object,
and what does it feed" from one or more seed objects, plus
`closureToLineageGraph`, which turns that closure into a `LineageGraph` ready
for `<LineageDiagram>`. `app/lib/lineage-api.ts`'s `fetchEstateInventory`
complements both: it parses every semantic model across a chosen workspace
scope up front so Table Impact and Measure Impact can offer one searchable
table/measure picker instead of a workspace-then-model-then-table cascade.

## Table Impact Data Flow

1. A "Workspace scope" multi-select (every accessible workspace checked by
   default) drives `fetchEstateInventory`, which lists every semantic model
   in the scoped workspaces and parses each one's definition (concurrency-
   limited; one inaccessible model is skipped with a visible notice rather
   than failing the page). The resulting tables populate one searchable
   "Table" combobox up front — no workspace-then-model cascade — with each
   entry disambiguated by its model and workspace name. A "Refresh inventory"
   button forces a re-fetch. Picking a table optionally narrows to one
   column; the default "Whole table" selection unions the closure of every
   column, calculated column, calculated table, and measure defined on it.
2. `POST /api/v1/lineage/dax/analyze` supplies the full dependency-edge list
   for the picked table's model (its parsed definition is already in hand
   from the inventory fetch, so no second parse call is needed);
   `computeDependencyClosure` walks it from the selected seed(s) to produce
   the downstream (default) or upstream impact set, at any depth, selectable
   with a Downstream/Upstream toggle.
3. `GET /api/v1/lineage/estate/discover` (shared and cached with Report
   Lineage) is filtered to the reports bound to this semantic model across
   every workspace, then `POST /api/v1/explorer/measure-source-lineage` and
   `POST /api/v1/explorer/visual-source-lookup` are called in batches of up
   to 50 reports to attach report/visual usage counts to each impacted
   object.
4. Results render as a directed, collapsible diagram and a matching AG Grid
   table (table, object, type, depth, direct/transitive, sample DAX
   reference, report count, visual count), exportable the same way as
   Explorer and Report Lineage.
5. The exact-DAX call and the estate/evidence calls degrade independently: a
   missing administrative key or an unreachable `/lineage/*` route shows a
   status notice instead of blocking the page. Evidence is capped at the
   first 300 bound reports per model, with a visible notice if the cap is
   reached.

## Measure Impact Data Flow

Same workspace-scoped inventory and picker pattern as Table Impact, narrowed
to a single measure and always bidirectional:

1. The same "Workspace scope" multi-select and `fetchEstateInventory` call
   populate one searchable "Measure" combobox (entries labeled
   `Table[Measure]`) across every parsed model in scope.
2. `computeDependencyClosure` returns both the measure's upstream inputs
   (columns, calculated columns, other measures it reads) and its downstream
   dependents (other measures that read it) from the same `dax/analyze` edge
   list, in one pass.
3. Report/visual evidence is attached the same way as Table Impact.
4. The diagram renders every upstream and downstream node around the
   selected measure in one directed, collapsible graph; the grid adds a
   Direction column (Upstream/Downstream) since both directions share one
   table.

## Scanner Data Flow

`app/lib/scanner-api.ts` and `app/lib/use-workspace-scan.ts` drive Microsoft's
real four-step Power BI Admin "metadata scanning" workflow
(`GetModifiedWorkspaces` / `PostWorkspaceInfo` / `GetScanStatus` /
`GetScanResult`, wrapped 1:1 by the backend's `/api/v1/scanner/*` router).
This is the only asynchronous, multi-step backend workflow in the
application — everything else is a single cached request.

1. The operator explicitly picks a workspace scope (1 to 100 workspaces; the
   backend rejects more) and clicks "Run scan" — never automatic, since
   submissions, status checks, and result reads all count against the
   tenant's real hourly Power BI Admin API quota (Microsoft caps modified-
   workspace discovery at 30/hour, scan submissions at 500/hour with at most
   16 simultaneous, and result reads at 500/hour; the backend does not
   locally emulate or soften these limits).
2. `POST /api/v1/scanner/workspaces/scan` returns a `scan_id`.
   `useWorkspaceScan` polls `GET .../scans/{id}/status` on a fixed 4-second
   interval (via TanStack Query's `refetchInterval`) until `status` is
   `Succeeded` or `Failed`, then stops polling.
3. Once `Succeeded`, `GET .../scans/{id}/result` is fetched once and cached
   indefinitely for that `scan_id` (a completed scan's result is immutable,
   and re-fetching it would burn the same result-read quota for no benefit).
4. The result's `payload` is Microsoft's raw, backend-unvalidated JSON. The
   frontend reads it defensively and never assumes a field is present. It
   never contains app *display names* (only `appId` linkage) or full sharing
   ACLs (only `createdBy`/`modifiedBy`/`configuredBy` identities) — the UI is
   labeled accordingly rather than overclaiming.
5. `get_artifact_users` (which can return user identifiers) is never set to
   `true` anywhere in the frontend and has no UI toggle.

`app/lib/scanner-api.ts` models the payload field-for-field against Microsoft's
own reference
([Get Scan Result](https://learn.microsoft.com/en-us/rest/api/power-bi/admin/workspace-info-get-scan-result)):
every type in that page's "Definitions" section (`WorkspaceInfo`,
`WorkspaceInfoReport`, `WorkspaceInfoDashboard`, `WorkspaceInfoTile`,
`WorkspaceInfoDataset`, `Table`, `Column`, `Measure`, dataset `Expression`s,
`Role`/`RoleMember`/`RoleTablePermission`, `WorkspaceInfoDataflow`,
`WorkspaceInfoDatamart`, `Datasource`/`DatasourceConnectionDetails`,
dependency/tag/endorsement/sensitivity-label/user-access types, and so on) has
a corresponding TypeScript type in `app/lib/scanner-api.ts`. The Scanner page
currently exposes five tabs, each one or more stacked, exportable AG Grid
tables:

- **Workspaces** — one row per scanned workspace, plus every tag applied
  anywhere in the scan (workspace, report, dashboard, semantic model,
  dataflow, or datamart).
- **Reports & dashboards** — reports, dashboards, and dashboard tiles.
- **Semantic models** — datasets, tables, columns, measures, table M-query
  sources, and dataset-level shared/parameter expressions. Each dataset row
  also carries table/expression/role/relationship counts.
- **Dependencies** — every report-to-semantic-model link plus each item's
  declared upstream dataflows, datamarts, and semantic models, in one grid.
- **Datasource instances** — full connection details for both the regular and
  misconfigured instance lists, each cross-referenced back to which datasets/
  dataflows/datamarts use it.

Relationships, RLS roles/role members, dataflows, datamarts, and per-item
`*User` access-right arrays are still fully typed in `scanner-api.ts` and
still contribute counts to the top-level summary strip and to the Workspaces/
Semantic models grids — they don't currently have their own dedicated
browsing tab.

Explorer's per-workspace scan panel (see below) intentionally stays a small,
three-section subset of this — the full field-by-field browser lives only on
the dedicated Scanner page.

Two surfaces share this same hook and data layer:
- **Explorer's Assets & access tab** scans only the currently selected
  workspace and fills in three sections that were previously placeholders:
  Dashboards, App linkage, and Ownership.
- **The dedicated Scanner page** scans up to 100 workspaces at once and
  browses the fuller payload across all of them: Dashboards, Datasource
  instances (with a separately highlighted Misconfigured datasource
  instances section), Table sources (the actual M-query `source` expression
  per table, across every scanned workspace without per-report navigation),
  and Dataset ownership/configuration.

Scan progress and results are held in component/query memory only and reset
when the workspace scope changes or the component unmounts — consistent with
the rest of the application's no-persistence-beyond-session posture.

## API Documentation And Execution

The application reads `/openapi.json` at runtime. `flattenEndpoints` converts
each FastAPI operation into the frontend endpoint model and groups operations by
their first OpenAPI tag.

For every operation, the documentation view provides:

- Method, route, operation name, and description.
- Path, query, and ordinary header inputs from OpenAPI parameters.
- Required-field validation.
- Enum selectors where OpenAPI supplies enum values.
- An editable JSON body generated from the request schema.
- Curated blank templates for credential/setup operations.
- Authenticated execution with cookies and the existing ephemeral key policy.
- HTTP status, elapsed duration, response body, and response headers.
- Body/header tabs and copyable output.
- Backend validation/error details for non-success responses.

The runtime schema template generator resolves local
`#/components/schemas/...` references, objects, arrays, enums, defaults,
examples, `allOf`, `oneOf`, and `anyOf`. Templates are starting points; the
operator must still enter IDs and values valid for the connected tenant.

## Table Copy And Export Rules

- AG Grid enables text selection and per-cell copy controls.
- `Copy table` creates tab-separated content suitable for spreadsheets and
  analysis tools.
- CSV and Excel-compatible exports prepend parent workspace, report, and
  semantic-model names and IDs.
- Export filenames use the selected parent object name instead of an internal ID.
- DAX expressions remain complete in copied/exported data even when visually
  abbreviated in a cell.
- Table Impact and Measure Impact share this behavior through a common
  `ImpactGrid` component and `app/lib/grid-export.ts` helpers, so exports look
  and behave the same across every table in the application.

## State Ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| Backend health | TanStack Query in `AppHeader` | Refetched every 15 seconds. |
| OpenAPI document | TanStack Query in workspace route | Current browser query cache. |
| Explorer/report data | TanStack Query | Selection-keyed cache with feature-specific stale times. |
| API execution result | `useApiExecutor` | Current workspace route mount. |
| API origin | Zustand | In-memory page lifetime, initialized from `VITE_API_ORIGIN`. |
| Administrative key | Zustand | Ephemeral memory only; no visible input or persistence. |
| Diagram collapse/expand state | `LineageDiagram` component state | Current diagram mount; resets whenever the underlying graph changes. |
| Scan progress (`scan_id`, status, result) | `useWorkspaceScan` + TanStack Query | Component/query memory only; resets when the workspace scope changes or the component unmounts. |
| Form inputs | React Hook Form or component state | Current component mount. |
| Power BI/Snowflake session | FastAPI cookie/session | Backend policy controls lifetime. |

## Folder Hierarchy

Generated `node_modules/`, `.react-router/`, `build/`, `test-results/`, and
`playwright-report/` directories are intentionally omitted.

```text
PBI-Lineage-Frontend/
|-- .agents/
|   `-- skills/react-router/
|       |-- SKILL.md
|       `-- references/
|           |-- declarative-mode.md
|           |-- data-mode.md
|           |-- framework-mode.md
|           `-- rsc.md
|-- app/
|   |-- components/
|   |   |-- ui/
|   |   |   |-- badge.tsx
|   |   |   |-- button.tsx
|   |   |   |-- card.tsx
|   |   |   |-- checkbox.tsx
|   |   |   |-- command.tsx
|   |   |   |-- dialog.tsx
|   |   |   |-- dropdown-menu.tsx
|   |   |   |-- input-group.tsx
|   |   |   |-- input.tsx
|   |   |   |-- label.tsx
|   |   |   |-- select.tsx
|   |   |   |-- separator.tsx
|   |   |   |-- sheet.tsx
|   |   |   |-- skeleton.tsx
|   |   |   |-- sonner.tsx
|   |   |   |-- switch.tsx
|   |   |   |-- table.tsx
|   |   |   |-- tabs.tsx
|   |   |   |-- textarea.tsx
|   |   |   |-- toast.tsx
|   |   |   `-- tooltip.tsx
|   |   |-- workspace/
|   |   |   |-- api-documentation.tsx
|   |   |   |-- api-domain-canvas.tsx
|   |   |   |-- api-execution-panel.tsx
|   |   |   |-- api-output-panel.tsx
|   |   |   |-- auth-required.tsx
|   |   |   |-- database-setup.tsx
|   |   |   |-- explorer.tsx
|   |   |   |-- impact-grid.tsx
|   |   |   |-- impact-picker.tsx
|   |   |   |-- lineage/
|   |   |   |   |-- lineage-diagram.tsx
|   |   |   |   |-- lineage-layout.ts
|   |   |   |   |-- lineage-node.tsx
|   |   |   |   `-- lineage-types.ts
|   |   |   |-- measure-impact.tsx
|   |   |   |-- power-bi-setup.tsx
|   |   |   |-- report-lineage-diagrams.tsx
|   |   |   |-- report-lineage.tsx
|   |   |   |-- scanner.tsx
|   |   |   |-- table-impact.tsx
|   |   |   `-- workspace-sidebar.tsx
|   |   |-- app-footer.tsx
|   |   `-- app-header.tsx
|   |-- lib/
|   |   |-- api-catalog.ts
|   |   |-- dependency-graph.ts
|   |   |-- grid-export.ts
|   |   |-- lineage-api.ts
|   |   |-- query-provider.tsx
|   |   |-- scanner-api.ts
|   |   |-- use-api-executor.ts
|   |   |-- use-workspace-scan.ts
|   |   `-- utils.ts
|   |-- routes/
|   |   |-- home.tsx
|   |   `-- workspace.tsx
|   |-- stores/
|   |   `-- app-store.ts
|   |-- welcome/
|   |   |-- logo-dark.svg
|   |   |-- logo-light.svg
|   |   `-- welcome.tsx
|   |-- app.css
|   |-- root.tsx
|   `-- routes.ts
|-- public/
|   `-- favicon.ico
|-- tests/
|   |-- api-documentation.spec.ts
|   |-- impact-analysis.spec.ts
|   |-- report-lineage.spec.ts
|   `-- scanner.spec.ts
|-- .dockerignore
|-- .gitignore
|-- components.json
|-- Dockerfile
|-- package-lock.json
|-- package.json
|-- playwright.config.ts
|-- react-router.config.ts
|-- README.md
|-- tsconfig.json
`-- vite.config.ts
```

## File Responsibilities

### Root Configuration

| File | Purpose and fulfilled responsibility |
| --- | --- |
| `README.md` | Primary source-controlled setup, architecture, operation, deployment, troubleshooting, and file-reference handbook. |
| `package.json` | Declares runtime/dev dependencies and the `dev`, `build`, `start`, and `typecheck` commands. |
| `package-lock.json` | Locks the exact dependency graph for reproducible `npm ci` installs. |
| `vite.config.ts` | Registers React Router and Tailwind plugins, resolves `~/*`, prebundles heavy lazy-route packages, and proxies local backend paths. |
| `react-router.config.ts` | Selects SPA mode with `ssr: false` for IIS static hosting. |
| `tsconfig.json` | Enforces strict TypeScript, browser/ES2022 libraries, bundler resolution, and `~/*` aliases. |
| `components.json` | Configures shadcn style, aliases, Tailwind CSS entry, Base UI behavior, and Lucide icons. |
| `playwright.config.ts` | Defines browser-test directory, localhost dev server reuse, timeouts, traces, and failure screenshots. |
| `Dockerfile` | Optional Node 24 multi-stage build/server image retained for non-IIS validation; IIS static hosting remains the production target. |
| `.dockerignore` | Excludes dependencies, generated builds, local context, and README from Docker build context. |
| `.gitignore` | Excludes dependencies, generated React Router/build/test artifacts, environment files, and local context documents. |
| `public/favicon.ico` | Browser/site icon copied unchanged into the production client output. |

### Application Bootstrap And Routes

| File | Purpose and fulfilled responsibility |
| --- | --- |
| `app/routes.ts` | Declares the index route and optional workspace section route in React Router Framework Mode. |
| `app/root.tsx` | Creates the HTML shell, loads global CSS, installs QueryProvider, renders route outlets/scripts, restores scroll, and handles route errors. |
| `app/app.css` | Imports Tailwind, shadcn, animation, and Geist font styles; defines light/dark design tokens, radii, and global minimum width. |
| `app/routes/home.tsx` | Renders the product overview, value/time-saving summary, workflow, and setup entry point. |
| `app/routes/workspace.tsx` | Owns the shared workspace shell, OpenAPI query, endpoint catalog, API executor, sidebar routing, mobile navigation, and lazy Explorer/Report Lineage loading. |

### Shared Application Components

| File | Purpose and fulfilled responsibility |
| --- | --- |
| `app/components/app-header.tsx` | Renders product identity and a TanStack Query backend-health badge refreshed every 15 seconds. |
| `app/components/app-footer.tsx` | Renders the mandatory developer attribution and current-year copyright on all pages. |

### Workspace Components

| File | Purpose and fulfilled responsibility |
| --- | --- |
| `app/components/workspace/workspace-sidebar.tsx` | Defines setup, exploration, table/measure-impact, report-lineage, and API-documentation navigation for desktop/mobile shells. |
| `app/components/workspace/power-bi-setup.tsx` | Validates and executes device-code/service-principal setup, presents provider readiness, clears secrets, and invalidates identity-dependent caches. |
| `app/components/workspace/database-setup.tsx` | Validates Snowflake connection input and presents connect/status/logout information without raw setup JSON. |
| `app/components/workspace/explorer.tsx` | Implements workspace-scoped report/model exploration, background heavy queries, AG Grid tables, copy/export, semantic mapping, column/measure diagrams rendered through the shared lineage engine, and an opt-in metadata scan panel for the current workspace's dashboards, app linkage, and ownership. |
| `app/components/workspace/report-lineage.tsx` | Discovers reports across workspaces, resolves composite model ownership, prepares report snapshots, and renders report evidence tabs/tables. |
| `app/components/workspace/report-lineage-diagrams.tsx` | Builds selectable report/database, column, measure, and calculated-column dependency graphs with depth controls and evidence copy, rendered through the shared lineage engine. |
| `app/components/workspace/table-impact.tsx` | Resolves a semantic table's or column's downstream/upstream DAX impact and cross-report/visual evidence into a directed diagram and an exportable AG Grid table. |
| `app/components/workspace/measure-impact.tsx` | Resolves a single measure's upstream inputs and downstream dependents and cross-report/visual evidence into one bidirectional diagram and an exportable AG Grid table. |
| `app/components/workspace/auth-required.tsx` | `PowerBiAuthRequired`: the shared "Power BI authentication is required" empty state shown whenever a page's first Power BI-backed query fails, with a link back to Power BI setup. Used by Explorer, Report Lineage, Table Impact, Measure Impact, and Scanner. |
| `app/components/workspace/impact-grid.tsx` | Shared AG Grid wrapper for Table Impact and Measure Impact: teal theme, copyable cells, and a copy/CSV/Excel export toolbar. |
| `app/components/workspace/scanner.tsx` | Runs the Power BI Admin metadata scanner across a chosen workspace scope (1-100) and browses the result across five tabs (Workspaces, Reports & dashboards, Semantic models, Dependencies, Datasource instances), each an exportable AG Grid table modeled field-for-field against Microsoft's GetScanResult schema. |
| `app/components/workspace/impact-picker.tsx` | Shared pickers for Table Impact and Measure Impact: `WorkspaceScopeSelect` (multi-select workspace scope with select-all/clear) and `ObjectSearchSelect` (a `Command`-based searchable combobox over a preloaded table/measure inventory). |
| `app/components/workspace/api-documentation.tsx` | Groups/searches OpenAPI operations and expands the selected operation into the active execution workbench. |
| `app/components/workspace/api-execution-panel.tsx` | Renders parameter/body inputs, validates JSON, executes through the shared hook, clears sensitive values, and presents copyable body/header output. |
| `app/components/workspace/api-domain-canvas.tsx` | Retained alternate full-domain operation selector/executor. It is not routed by the current workspace; current documentation uses `ApiExecutionPanel`. |
| `app/components/workspace/api-output-panel.tsx` | Response renderer used by the retained alternate `ApiDomainCanvas`; not used by the current documentation execution panel. |

### Lineage Diagram Engine

Shared by Explorer, Report Lineage, Table Impact, and Measure Impact so every
dependency diagram in the application is directed, auto-laid-out, and
collapsible in the same way.

| File | Purpose and fulfilled responsibility |
| --- | --- |
| `app/components/workspace/lineage/lineage-types.ts` | Declares the diagram-agnostic `LineageGraph`/`LineageGraphNode`/`LineageGraphEdge` shapes every feature builds toward, plus the React Flow node-data type. |
| `app/components/workspace/lineage/lineage-layout.ts` | Runs `@dagrejs/dagre` to compute layered node positions for a given direction (`LR`/`TB`) and estimates node height from detail-text length. |
| `app/components/workspace/lineage/lineage-node.tsx` | Custom React Flow node: tone-colored card per object kind, with a collapse/expand chevron and a hidden-descendant count when the node has children. |
| `app/components/workspace/lineage/lineage-diagram.tsx` | Exports `<LineageDiagram>`: builds an undirected "display tree" from the graph, owns collapse state, derives the visible node/edge subset, lays it out with dagre, and renders it with directed arrowheads via React Flow. |

### API, Query, Utility, And State Files

| File | Purpose and fulfilled responsibility |
| --- | --- |
| `app/lib/api-catalog.ts` | Defines OpenAPI/frontend endpoint types, fallback setup operations, request templates, schema example generation, endpoint flattening, URL construction, response parsing, method styles, and formatting helpers. |
| `app/lib/dependency-graph.ts` | Pure multi-source DAX dependency traversal (`computeDependencyClosure`) shared by Explorer, Report Lineage, Table Impact, and Measure Impact, plus `closureToLineageGraph`, which turns a closure into a `LineageGraph` for `<LineageDiagram>`. |
| `app/lib/lineage-api.ts` | Shared admin-key-aware `requestJson` fetch helper for every `/lineage/*` and `/explorer/*` call, plus `boundReportsForModel`, chunked/concurrency-limited `fetchBatchedExplorer`, `fetchEstateInventory` (workspace-scoped table/measure inventory for Table/Measure Impact), and lineage query-key factories. |
| `app/lib/scanner-api.ts` | Typed `startScan`/`getScanStatus`/`getScanResult` calls onto `/api/v1/scanner/*` (built on `requestJson`), `DEFAULT_SCAN_FLAGS`, and a full, defensive TypeScript model of Microsoft's real (backend-untyped) GetScanResult payload — every type and field from the official reference page. |
| `app/lib/use-workspace-scan.ts` | `useWorkspaceScan` hook: drives the scanner's submit-then-poll-then-fetch workflow via TanStack Query's `refetchInterval`, never runs automatically, and resets when the workspace scope changes. Shared by Explorer's scan panel and the Scanner page. |
| `app/lib/grid-export.ts` | Shared CSV/Excel/copy-table export helpers (`downloadCsv`, `downloadExcel`, `toTabSeparatedValues`, `withExportContext`) used by `ImpactGrid` and available for reuse by other tables. |
| `app/lib/use-api-executor.ts` | Executes a catalog endpoint with path/query/header values, cookies, optional ephemeral key, JSON body handling, timing, headers, and normalized failure results. |
| `app/lib/query-provider.tsx` | Creates one QueryClient with default retry, stale-time, and focus-refetch behavior for the application lifetime. |
| `app/lib/utils.ts` | Exposes shared class-name composition used by shadcn and custom components. |
| `app/stores/app-store.ts` | Owns normalized API origin and ephemeral admin-key memory using Zustand. |

### UI Primitives

These files are local shadcn/Base UI building blocks. Keep application behavior
in feature components and primitive behavior/styling here.

| File | Purpose and fulfilled responsibility |
| --- | --- |
| `app/components/ui/badge.tsx` | Compact status/category labels. |
| `app/components/ui/button.tsx` | Button variants, sizes, and rendered-link/button behavior. |
| `app/components/ui/card.tsx` | Card structure primitives; use only for genuinely framed items. |
| `app/components/ui/checkbox.tsx` | Accessible binary checkbox control. |
| `app/components/ui/command.tsx` | Command/search list composition based on cmdk. |
| `app/components/ui/dialog.tsx` | Accessible modal dialog primitives. |
| `app/components/ui/dropdown-menu.tsx` | Accessible action/option menus. |
| `app/components/ui/input-group.tsx` | Inputs with leading/trailing controls or content. |
| `app/components/ui/input.tsx` | Standard text/password/number input styling. |
| `app/components/ui/label.tsx` | Accessible form labels. |
| `app/components/ui/select.tsx` | Base UI select trigger, content, and option primitives. |
| `app/components/ui/separator.tsx` | Horizontal/vertical semantic separators. |
| `app/components/ui/sheet.tsx` | Responsive side sheet used by mobile workspace navigation. |
| `app/components/ui/skeleton.tsx` | Loading placeholder primitive. |
| `app/components/ui/sonner.tsx` | Sonner toast-host integration. |
| `app/components/ui/switch.tsx` | Accessible on/off switch. |
| `app/components/ui/table.tsx` | Semantic HTML table styling primitives. |
| `app/components/ui/tabs.tsx` | Accessible tab list, trigger, and content primitives. |
| `app/components/ui/textarea.tsx` | Multi-line input used by JSON request editors. |
| `app/components/ui/toast.tsx` | Local toast content/action structure. |
| `app/components/ui/tooltip.tsx` | Hover/focus descriptions for icon controls. |

### Tests, Context, And Retained Template Files

| File | Purpose and fulfilled responsibility |
| --- | --- |
| `tests/report-lineage.spec.ts` | Mocks backend contracts and verifies evidence tabs, exports, report/column/calculation graphs, desktop layout, and mobile containment. |
| `tests/impact-analysis.spec.ts` | Mocks a two-workspace, two-model backend fixture and verifies Table Impact's and Measure Impact's workspace-scope multi-select, searchable table/measure picker (including cross-workspace merging and scope narrowing), directed/collapsible diagrams, impact grids, and evidence status. |
| `tests/scanner.spec.ts` | Mocks the four `/api/v1/scanner/*` endpoints (including a status route that reports "Running" before "Succeeded", proving the poll loop works) against a fixture covering every entity type, and verifies both the dedicated Scanner page's multi-workspace scan-and-browse flow across all five tabs and Explorer's single-workspace scan panel replacing its dashboards/app-linkage/ownership placeholders. |
| `tests/api-documentation.spec.ts` | Mocks OpenAPI/backend operations and verifies GET/POST execution, JSON validation, response metadata, and output copying behavior. |
| `REF_DOC/PROJECT_CONTEXT.md` | Local continuity document containing current frontend contracts and implementation constraints; ignored by Git. |
| `app/welcome/welcome.tsx` | Unused React Router starter welcome component retained from scaffolding; no current route imports it. |
| `app/welcome/logo-light.svg` | Unused light starter logo referenced only by the retained welcome component. |
| `app/welcome/logo-dark.svg` | Unused dark starter logo referenced only by the retained welcome component. |

### Local Agent Reference Files

| File | Purpose and fulfilled responsibility |
| --- | --- |
| `.agents/skills/react-router/SKILL.md` | Local coding-agent instructions for React Router work. It is tooling guidance, not runtime code. |
| `.agents/skills/react-router/references/framework-mode.md` | Agent reference for Framework Mode conventions. |
| `.agents/skills/react-router/references/data-mode.md` | Agent reference for Data Mode conventions. |
| `.agents/skills/react-router/references/declarative-mode.md` | Agent reference for Declarative Mode conventions. |
| `.agents/skills/react-router/references/rsc.md` | Agent reference for React Server Component considerations. |

## Testing

Run static checks:

```powershell
npm run typecheck
npm run build
```

Run browser tests:

```powershell
npx playwright test
```

Playwright starts or reuses `http://localhost:5173`, intercepts backend calls,
and does not require a live authenticated tenant for contract-driven UI tests.
Use a real tenant-authenticated session for final provider acceptance because
mocked tests cannot prove Microsoft/Fabric permissions or tenant data quality.

Generated browser artifacts are written to ignored `test-results/` and
`playwright-report/` directories.

## Production Build

Stop the development server and run:

```powershell
cd C:\Users\Administrator\Desktop\PBI-Lineage-Frontend
npm ci
npm run typecheck
npm run build
```

Deploy this directory to the IIS site root:

```text
C:\Users\Administrator\Desktop\PBI-Lineage-Frontend\build\client
```

Do not deploy source, `node_modules`, `.env`, tests, Playwright output, or the
React Router server bundle when IIS is serving the static SPA.

## IIS Setup

Recommended Windows features/modules:

1. IIS Static Content.
2. IIS URL Rewrite module.
3. Application Request Routing (ARR) with proxy enabled.

Recommended site settings:

- Physical path: deployed `build/client` directory.
- Application pool: `No Managed Code`.
- HTTPS binding for production.
- Backend container published only to loopback or an internal interface.

Place a `web.config` in the deployed `build/client` directory. Example:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="FastAPI API" stopProcessing="true">
          <match url="^(api/.*|openapi\.json)$" />
          <action type="Rewrite" url="http://127.0.0.1:8000/{R:0}" />
        </rule>
        <rule name="React SPA" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="/index.html" />
        </rule>
      </rules>
    </rewrite>
    <staticContent>
      <remove fileExtension=".json" />
      <mimeMap fileExtension=".json" mimeType="application/json" />
    </staticContent>
  </system.webServer>
</configuration>
```

Keep `/docs` private unless there is an explicit operational requirement. The
application documentation uses `/openapi.json` and does not need to expose the
Swagger page publicly.

## Deployment Verification

After IIS deployment verify:

1. `/` loads without a Node process.
2. `/workspace/report-lineage` loads directly after a hard refresh.
3. `/api/v1/health` returns through IIS.
4. `/openapi.json` returns through IIS.
5. Power BI login sets and reuses the backend session cookie.
6. API documentation can execute a harmless GET such as health/status.
7. CSV/Excel downloads work in the browser.
8. The footer shows `Developed by Satyadeep Singh` and copyright.

## Troubleshooting

### `npm` or `node` is not recognized

- Install Node.js for all users or add its installation directory to system
  `PATH`.
- Close and reopen PowerShell after changing `PATH`.
- Verify with `where.exe node` and `where.exe npm`.

### PowerShell blocks `npm.ps1`

Use `npm.cmd`, or apply an approved organizational execution policy. Do not
disable machine security policy only for this project.

### Vite shows `bundling dependencies` for a long time

- Wait for the first dependency optimization to complete.
- Use `http://localhost:5173`, not a different host name.
- Avoid refreshing continuously while optimization is running.
- Stop concurrent `npm run build` processes.
- If the optimizer cache is genuinely stale, stop Vite, remove
  `node_modules/.vite`, and start it again.

### Page remains on `Loading Explorer`

- Check the Vite console for a failed dynamic import.
- Confirm `localhost:5173` matches the server URL.
- Confirm AG Grid and XYFlow are listed in `optimizeDeps.include`.
- Run `npm run typecheck` to catch a failed lazy module compilation.

### Backend badge is offline

- Verify FastAPI at `http://127.0.0.1:8000/api/v1/health`.
- Verify Vite proxy configuration.
- Check Docker port publishing and Windows Firewall rules.

### API execution returns 401 or 403

- Complete Power BI setup for Microsoft operations.
- Complete Snowflake setup for Snowflake operations.
- Confirm the connected identity has required Power BI/Fabric permissions.
- A protected lineage route can require an administrative key supplied by the
  approved host integration; the visible UI intentionally does not request it.

### Report is listed but definition/semantic tabs are partial

Listing permission does not guarantee PBIR, TMDL, Fabric, or XMLA access. Read
the warning shown for the selected report and verify provider permissions and
capacity. The UI intentionally keeps available evidence visible.

### Direct IIS route returns 404

Install URL Rewrite and verify the SPA fallback rewrites non-file/non-directory
requests to `/index.html` after the API proxy rule.

### Authentication works in development but not IIS

- Prefer same-origin IIS proxying.
- Verify HTTPS, cookie domain/path, `Secure`, and `SameSite` policy.
- Confirm ARR preserves relevant headers and response cookies.

## Security Rules

- Never commit credentials, tokens, cookies, API keys, `.env`, or provider
  response captures.
- Do not expose FastAPI port 8000 to the public internet.
- Do not add a visible admin-key field without an explicit security decision.
- Keep service-principal and Snowflake secrets transient.
- Treat downloaded lineage data as tenant metadata and protect it accordingly.
- Review DELETE/logout or scan-start operations before running them from API
  documentation; the workbench executes the selected backend operation exactly.

## Current Limitations

- Live provider acceptance requires a real Power BI/Fabric session and tenant
  permissions.
- XMLA and definition access depend on capacity and provider policy.
- Physical source analysis can require optional backend administrative policy.
- Dashboards, app linkage, and ownership are only available after an explicit
  metadata scan (Explorer's Assets tab or the Scanner page) — never invented
  or assumed present before a scan has succeeded. The scan payload never
  contains app *names* (only `appId` linkage) or full sharing ACLs, only
  creator/last-editor/configuring identities.
- Orval, Vitest, and React Testing Library are installed but generated clients
  and focused unit/component suites are not yet committed.
- `ApiDomainCanvas`, `ApiOutputPanel`, and `app/welcome/` are retained but not
  used by current routes; remove them only as a deliberate cleanup change.
- Table Impact and Measure Impact compute cross-report/visual evidence from at
  most the first 300 reports bound to a semantic model (a visible notice
  appears if that cap is reached); see "Suggested Backend Endpoints" below for
  the change that would remove it.
- Scan progress and results are not persisted: navigating away from Explorer
  or the Scanner page and back starts fresh. Scans are also subject to real
  Microsoft tenant hourly limits (30 modified-workspace checks, 500 scan
  submissions, 500 result reads) that the backend passes through rather than
  emulating locally — repeated scanning can be throttled by Microsoft, not
  just by this application.

## Suggested Backend Endpoints

Table Impact and Measure Impact are built entirely on existing
`PBI-Lineage-Backend` endpoints (`dax/analyze`, `estate/discover`,
`explorer/measure-source-lineage`, `explorer/visual-source-lookup`). Three
backend additions would simplify or remove current limitations; none are
implemented here because this repository does not modify the backend:

1. `GET /api/v1/lineage/estate/bindings?semantic_model_id={id}`: return only
   the report/workspace pairs bound to one model, instead of filtering a full
   `estate/discover` response client-side.
2. `POST /api/v1/lineage/impact/table` and `.../impact/measure`: return a
   pre-joined dependency closure plus report/visual evidence in one call,
   removing the client-side 50-report chunking in `fetchBatchedExplorer`.
3. Raise or remove `ExplorerRequest.reports`' 50-item cap, or add a
   `semantic_model_id`-scoped variant of `measure-source-lineage`/
   `visual-source-lookup`, so cross-report evidence is not capped at 300
   bound reports client-side.
