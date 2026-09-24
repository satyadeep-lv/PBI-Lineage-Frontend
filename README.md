# PBI Lineage Explorer Frontend

Browser application for exploring Power BI assets, semantic models, DAX
dependencies, physical database evidence, report visuals, and downstream
lineage. It runs as a separate source-control project from the FastAPI backend
and is built as a static SPA for IIS. The current automated production path
deploys both services on the same Windows Azure VM behind
`https://lvpowerbilineage.com`.

Developed by **Satyadeep Singh**.

## Latest Changes

- **Semantic objects is now report-scoped.** Its nested semantic-model picker
  is gone: the section follows the model the selected report is actually bound
  to, reading `POST /api/v1/explorer/snapshot` instead of the model-scoped
  `definition/parsed`. Rows carry a Semantic model column and are keyed by
  `semantic_model_id`, so a response covering several models renders them
  together in one grid with a banner naming the count. Two side effects worth
  knowing: Power BI's Auto Date/Time tables are now excluded (the backend
  filters them for this dataset, which `definition/parsed` does not), and the
  Relationships metric is gone because the dataset carries no relationships —
  it is replaced by a Semantic models count.
- **Power AI no longer shows a context panel or a persona picker.** The widget
  takes any question, and every answer is requested at full technical detail
  (`audience: "developer"`); the previously persisted audience choice was
  dropped so an old selection in localStorage cannot strand anyone.
- **Fixed the measure definition coming back as a bare dependency list.** The
  backend's `classify_intent` matches impact keywords before it looks at the
  declared object type, so the old prompt's "depends on" routed the question to
  the impact agent, which gathers no DAX definition — hence an answer with only
  "Depends on" and "Downstream impact" sections. The prompt now avoids those
  words and reaches the measure agent, which returns definition, upstream
  lineage and impact evidence together. The panel also renders the backend's
  verified evidence grouped by fact type beside the prose, so the DAX and its
  source tables are visible even when model composition falls back.
- **Backend reads are now cached for the whole session.** `QueryProvider` sets
  `staleTime: Infinity`, `gcTime: Infinity` and turns off refetch-on-mount,
  -focus and -reconnect, and every per-query `staleTime`/`gcTime` override was
  removed so that one config is the only place caching is decided. Walking the
  whole Explorer a second time issues zero requests; leaving for another page
  and coming back issues zero. Queries with their own `refetchInterval`
  (backend health, Power AI status, scanner status) keep polling, because an
  interval is independent of staleness. Since nothing expires on its own, the
  header gained a **Refresh data** control (`queryClient.resetQueries()`) that
  reloads what is on screen and re-fetches everything else when next opened.
  The cache is in memory only — a browser reload starts a new session.
- Added a **Snowflake column lineage** panel beneath the Power AI panel in
  Semantic - DB objects mappings: pick a fully qualified table and one of its
  database columns, both composed from the grid above, and trace that column
  upstream. It shares its trace call, result table and error handling with the
  table-level panel. Neither panel offers a direction control: both send
  `UPSTREAM`, and `object_domain` is fixed per panel (`TABLE` / `COLUMN`).
- Added a **Snowflake object lineage** panel beneath Explorer's Source DB
  lineage grid (`app/components/workspace/snowflake-object-lineage.tsx`): pick
  a `DATABASE.SCHEMA.OBJECT` name composed from the evidence in that grid and
  `POST /api/v1/lineage/snowflake/trace` returns the object/dependency counts
  and the dependency edges for what feeds it. The picker
  only offers rows that actually have a physical name to trace — unresolved
  rows and cross-workspace model sources are left out rather than offered and
  then failing. This route needs the **Snowflake** session, not the Power BI
  one, so a 401 here says exactly that and links to database setup.
- Added an Explorer **Semantic - DB objects mappings** section: one row per
  semantic object beside the `sourceColumn` and `sourceTable` it resolves to.
  A plain column resolves through its declared TMDL source column; measures and
  calculated columns have no source column of their own, so theirs come from
  the DAX dependencies the backend already traced (a measure over two columns
  lists both).
- Added a **Measure definition with Power AI** panel beneath that grid
  (`app/components/workspace/measure-ai-definition.tsx`): pick a measure and a
  reader — Business, General, or Developer, mapped to the backend's existing
  `audience` field — and `POST /api/v1/ai/chat` returns a full grounded
  definition, rendered in place and downloadable as `.md` (with the DAX and the
  evidence list) or `.txt`. It uses the same `GET /api/v1/ai/status` lock as
  the chat widget, so a backend with AI disabled or a dead session shows the
  locked panel rather than a broken button.
  It reads `POST /api/v1/explorer/snapshot` once rather than calling
  `semantic-model-objects`, `measure-source-lineage`, and
  `source-database-lineage` separately, which would repeat the expensive
  workspace/report/TMDL fetches three times.
- Removed the **Visibility** column from Semantic objects and the **Status**
  and **Confidence** columns from Report visuals, in the row data as well as
  the grid so exports match what is on screen.
- Audited every frontend API call and removed the unused one: Explorer issued
  `POST /api/v1/lineage/dax/analyze` on every model, posting the whole parsed
  definition as the request body, and never read the response — its DAX columns
  come from the parsed definition itself. Explorer's remaining heavy calls are
  now gated on the open section instead of firing on report selection, and
  duplicate cross-page requests (workspace list, estate discovery, estate
  inventory, parsed definitions) were consolidated onto shared query keys.
- Report Lineage now uses the shared `requestJson`; it carried a private copy
  that read only FastAPI's `detail`, discarding the backend's error envelope
  and every `request_id`. Explorer's Page details, Semantic objects, and Report
  visuals sections were likewise switched from a hardcoded sentence to
  `EvidenceError`, which distinguishes 401 from 403 and shows the `request_id`.
- Restructured Explorer from seven flat tabs to **two**: **Assets & access**
  and **Reports**. The report picker now sits once at the top of the Reports
  tab, above four report-scoped sections — Page details, Source DB lineage,
  Semantic objects, Report visuals — instead of being repeated inside each
  tab. The **Table lineage** and **Column mapping** tabs were removed, along
  with their `/api/v1/explorer/source-database-lineage`,
  `/api/v1/explorer/visual-source-lookup`, and
  `/api/v1/lineage/physical-sources/analyze` calls, the client-side graph
  depth-limiting helpers, and the `include_cross_model_matching` opt-in that
  only Table lineage used.
- Added the **Source DB lineage** section, calling
  `/api/v1/explorer/report-source-tables` for the selected report. Rows with no
  resolved physical source (`source_object_type: "unknown"`) are listed as
  unresolved rather than hidden, and account/database/schema blanks read
  "Not applicable", "Not resolved", or "Not reported" so an inapplicable value
  is distinguishable from a missing one.
- Added one global, lazy-loaded Power AI launcher and floating panel across
  Home, Setup Guide, workspace, and API routes.
- Added evidence/claim rendering, context-aware questions, general/business/
  developer audiences, SSE streaming with cancellation, non-streaming fallback,
  and distinct disabled/auth/permission/provider states.
- Added persistent desktop navigation collapse, a tablet icon rail, and
  independent mobile navigation and Power AI drawers.
- Added `app-shell.spec.ts` and `power-ai.spec.ts` coverage for the new shell,
  status gating, context, transport, evidence, errors, and responsive state.
- Moved frontend production artifacts to an ORAS/ACR release path while keeping
  atomic IIS promotion and rollback.
- Removed the unreachable `ui/sonner.tsx` primitive that referenced uninstalled
  `sonner` and `next-themes` packages and caused clean GitHub typecheck failures.
- Added backend GitHub `production` switches for `ENABLE_API_DOCS` and
  `AI_ENABLED`; the frontend deliberately has no duplicate AI feature flag.

## What This Project Does

The application turns the backend API surface into guided operational views:

- Read a setup guide covering Microsoft Entra registration, Power BI and
  Fabric tenant settings, Scanner metadata, database-provider access,
  backend environment policy, verification, and official references.
- Authenticate Power BI and Fabric with a device code or service principal.
- Create and inspect an optional source-system session through the currently
  implemented Snowflake connector.
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
- Use the global Power AI panel on every route for evidence-grounded answers,
  persona-specific explanations, streamed responses, citations, and contextual
  questions seeded from impact-analysis selections.
- Copy individual table values or full tables for analysis.
- Download table data as CSV or Excel-compatible `.xls` files with parent
  workspace, report, and semantic-model context.
- Browse and execute every operation published by FastAPI OpenAPI from the
  in-application API documentation view.

The frontend does not own Power BI, Fabric, or database-provider credentials.
It sends them to FastAPI when required and relies on backend-managed HTTP-only
session cookies for subsequent requests.

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

The shorter contributor documentation is indexed at
[`Docs/README.md`](Docs/README.md). This root README remains the authoritative
setup, behavior, deployment, and troubleshooting handbook.

### Source-Control Readiness

The impact-analysis, scanner, shared-lineage, documentation, and browser-test
files are required application source. Before cloning this project onto a new
computer or triggering CI/CD, run:

```powershell
git status --short
git ls-files app tests Docs
```

Review every `??` entry and add the intended source files to Git before
committing. A local build can succeed with untracked files while a fresh clone
and GitHub Actions fail because those files were never included in the commit.
Never add generated `node_modules/`, `.react-router/`, `build/`,
`test-results/`, or `playwright-report/` directories.

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
| UI state | Zustand | API origin/admin key, persisted desktop layout preference, and minimally persisted Power AI audience preference. |
| Graphs | XYFlow / React Flow with `elkjs` layout | Worker-laid-out, directed, draggable, collapsible report, Snowflake, column, measure, and impact diagrams. |
| Tables | AG Grid Community | Sortable/filterable analysis tables and selectable values. |
| Forms | React Hook Form and Zod | Setup form state and validation. |
| API catalog | Runtime OpenAPI parser | Discovers and groups current FastAPI operations. |
| API generation | Orval installed | Available for future generated clients; no generated Orval client is currently committed. |
| Unit/component tests | Vitest and React Testing Library installed | Test dependencies are ready; focused unit suites have not yet been added. |
| E2E | Playwright | Home/setup, app shell, Power AI, API execution, lineage, impact, and scanner browser coverage. |
| Production frontend | IIS static site on Azure VM | Serves versioned `build/client` releases and provides SPA fallback/reverse proxy rules. |
| Production backend | Windows Docker deployment on the same VM | FastAPI remains independently built and operated behind IIS. |

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

### Power AI configuration

The frontend has no `VITE_AI_ENABLED` setting and must never receive an AI
provider key. It calls the authenticated backend status endpoint and renders
the returned state:

```text
GET /api/v1/ai/status
```

The backend owns `AI_ENABLED`, provider configuration, credentials, evidence
grounding, and authorization. Locally, set `AI_ENABLED=true` in the backend
`.env` and restart FastAPI. In production, use the backend repository's GitHub
`production` environment variable `AI_ENABLED`; changing it requires a Backend
CD redeployment because it becomes a container environment variable.

The current automated deployment uses the deterministic `fake` provider. Real
provider credentials belong in Azure Key Vault and must never be added to this
frontend repository, a `VITE_*` variable, or browser storage. See the backend
README section **GitHub production feature switches** for the exact setup.

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

Vite explicitly prebundles the runtime packages imported by the route graph,
including Base UI, forms, TanStack Query, XYFlow, AG Grid, the ELK API, cmdk,
Lucide, and Zustand. React Router's virtual route entry otherwise lets some
lazy-route dependencies be discovered in later waves; each new wave can
invalidate modules already requested by the browser. A clean install can spend
time building this dependency cache once, but the application should not blank
or restart optimization on first analysis navigation.

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
| `npx playwright test tests/app-shell.spec.ts` | Run desktop/tablet/mobile shell, collapsible navigation, and floating Power AI layout coverage. |
| `npx playwright test tests/power-ai.spec.ts` | Run Power AI status, context, chat transport, evidence, error, and responsive-state coverage. |
| `npx playwright test tests/home.spec.ts` | Run only Home content, navigation, product-image, and desktop/mobile UX coverage. |
| `npx playwright test tests/setup-guide.spec.ts` | Run only Setup Guide route, navigation, references, and responsive-containment coverage. |

## Route Map

| Route | View | Data responsibility |
| --- | --- | --- |
| `/` | Home | High-level product purpose, investigation questions, evidence path, real workspace preview, and one Start action. |
| `/setup-guide` | Setup Guide | Static prerequisites for Microsoft, Fabric, Scanner, XMLA, the current Snowflake connector, backend hosting, and application verification. |
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
  -> Setup Guide from the header, footer, or workspace menu
       -> roles, permissions, current connector, backend, and hosting checks
  -> Start
  -> Power BI setup
       -> device-code session OR service-principal session
       -> Power BI and Fabric readiness
  -> Global Power AI launcher on every route
       -> backend status decides locked, disabled, unavailable, or ready
       -> selected object context sends identifiers, never full graphs
       -> streamed or non-streamed grounded answer with evidence
  -> Database setup
       -> optional source-system session (currently Snowflake)
  -> Explorer
       -> workspace
       -> report
       -> page details / source DB lineage / semantic objects /
          semantic-DB mappings / report visuals
  -> Report Lineage
       -> report selected across the whole estate
       -> the same five report sections Explorer shows
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

1. **Assets & access** — the workspace's reports, semantic models, and (after
   an explicit scan) dashboards, app linkage, and ownership.
2. **Reports** — one report selected once, then four sections against it:
   1. Page details.
   2. Source DB lineage: every physical table/view backing the selected
      report's semantic model, one row per table, with tables whose source
      could not be traced (`source_object_type: "unknown"`) listed as
      unresolved rather than omitted — plus an inline Snowflake trace panel
      for any row with a fully qualified physical name.
   3. Semantic objects: tables, columns, measures, and hierarchies for the
      model the report is bound to, with their DAX expressions. No model
      picker — several models, if returned, share one grid.
   4. Semantic - DB objects mappings: every semantic object joined to its
      `sourceColumn` and fully qualified `sourceTable`, plus an inline Power AI
      panel that writes a downloadable definition of any measure.
   5. Report visuals: visual field references matched to the bound semantic
      model.

Every heavy request is gated on the section that reads it actually being open,
and is then cached by TanStack Query for five minutes — so moving between
sections stays instant, but evidence for a section nobody opened is never
fetched. Nothing is prefetched in the background.

Requests that are identical no matter which page issues them share one query
key from `app/lib/lineage-api.ts` (`workspaceListKey`, `estateDiscoveryKey`,
`estateInventoryKey`, `parsedSemanticModelKey`, `daxAnalysisKey`) rather than
being namespaced per page. Explorer, Scanner, Table Impact and Measure Impact
therefore share one workspace list; Table Impact and Measure Impact share one
estate inventory, which is the single most expensive thing the frontend does
(it lists and parses every semantic model in scope).

A report can use a semantic model from another workspace. Never substitute the
report workspace ID for the model workspace ID unless estate evidence confirms
the model is local.

Source DB lineage calls the same `/api/v1/explorer/*` bulk endpoint Table
Impact and Measure Impact already use elsewhere, but scoped to the single
selected report rather than batched across a workspace. It defaults to
`include_gateway_sources: false`; checking "Include gateway sources"
re-fetches with the flag set to `true` — that costs real gateway-admin
lookups, so it is never default-on.

The Assets & access tab's dashboards, app linkage, and ownership sections are
empty until the operator explicitly runs a metadata scan for the selected
workspace (see Scanner Data Flow) — this is never triggered automatically.

## Report Lineage Data Flow

Report Lineage and Explorer show the same report-scoped evidence. They differ
only in how you reach a report: Explorer makes you pick a workspace first,
while Report Lineage lists every accessible report across every accessible
workspace, including reports whose semantic model lives elsewhere. Past that
selection both render `ReportEvidence`, so the tabs, the endpoints behind them,
and the exports are identical, and the granularity stays exactly one report.

1. `GET /api/v1/lineage/estate/discover?top=5000&skip=0` returns reports from
   all accessible workspaces plus graph bindings.
2. The selector displays `report name - workspace name` and shows the report ID
   after selection. The estate graph's own report-to-model edge resolves which
   workspace the bound semantic model actually lives in.
3. The selected report is handed to `ReportEvidence` as a `ReportBinding`, which
   fetches each section's evidence only once that section is opened.

Sections, and the endpoint behind each:

| Section | Endpoint |
| --- | --- |
| Page details | `GET .../reports/{id}` and `GET .../reports/{id}/pages` |
| Source DB lineage | `POST /explorer/report-source-tables`, plus `POST /lineage/snowflake/trace` for a selected table |
| Semantic objects | `POST /explorer/semantic-model-objects` and `GET .../semantic-models/{id}/metadata` |
| Semantic - DB objects mappings | `POST /explorer/snapshot`, plus `POST /ai/explain` and a column-level `POST /lineage/snowflake/trace` |
| Report visuals | `POST .../definition/normalized`, `POST .../semantic-lineage`, `POST .../definition/parsed` |

## Lineage Diagram Engine

Report Lineage, Snowflake tracing, Table Impact, and Measure Impact render
their diagrams through one shared engine in
`app/components/workspace/lineage/`, so every dependency diagram in the
application looks and behaves the same way:

- `lineage-types.ts` defines the diagram-agnostic `LineageGraph` shape
  (`LineageGraphNode`/`LineageGraphEdge`) that every feature builds toward.
- `lineage-layout.ts` lazy-loads `elkjs` and runs its layered algorithm in a
  Web Worker to compute left-to-right or top-to-bottom positions without
  blocking the interface; no feature hand-computes `x`/`y` coordinates.
- `lineage-node.tsx` renders a tone-colored card per object kind with a
  collapse/expand chevron. Collapsing a node hides every node strictly
  farther from the diagram's root through it (an undirected "display tree"
  computed with breadth-first search, rooted at the focal node or at
  in-degree-zero nodes), so collapse behaves correctly even in bidirectional
  upstream+downstream diagrams such as Measure Impact.
- `lineage-diagram.tsx` exports `<LineageDiagram>`, which owns collapse state,
  derives the currently visible node/edge subset, lays it out with ELK, and
  renders draggable nodes with React Flow. It keeps the flow mounted across
  layouts, offers an automatic-layout reset, culls offscreen elements for
  large traces, focuses the nearest target context first, and limits costly
  edge animation. Edges always carry an arrowhead (`MarkerType.ArrowClosed`),
  so dependency direction is visible without reading labels.

`app/lib/dependency-graph.ts` complements the diagram engine with
`computeDependencyClosure`, a single multi-source breadth-first search over
`dax/analyze`'s flat dependency-edge list that Table Impact and Measure Impact
use to answer "what feeds this object, and what does it feed" from one or more
seed objects, plus
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
| Backend health | TanStack Query in `AppHeader` | Refetched every 15 seconds on setup/workspace routes; disabled on Home. |
| OpenAPI document | TanStack Query in workspace route | Current browser query cache. |
| Explorer/report data | TanStack Query | Selection-keyed cache with feature-specific stale times. |
| API execution result | `useApiExecutor` | Current workspace route mount. |
| API origin | Zustand | In-memory page lifetime, initialized from `VITE_API_ORIGIN`. |
| Administrative key | Zustand | Ephemeral memory only; no visible input or persistence. |
| Diagram collapse/expand state | `LineageDiagram` component state | Current graph; resets whenever the underlying graph changes. |
| Scan progress (`scan_id`, status, result) | `useWorkspaceScan` + TanStack Query | Component/query memory only; resets when the workspace scope changes or the component unmounts. |
| Form inputs | React Hook Form or component state | Current component mount. |
| Power BI/Snowflake session | FastAPI cookie/session | Backend policy controls lifetime. |

## Folder Hierarchy

Generated `node_modules/`, `.react-router/`, `build/`, `test-results/`, and
`playwright-report/` directories are intentionally omitted.

```text
PBI-Lineage-Frontend/
|-- .azure/
|   `-- scripts/
|       |-- deploy-frontend.ps1
|       |-- deploy-frontend-from-acr.ps1
|       `-- download-frontend-artifact.ps1
|-- .agents/
|   `-- skills/react-router/
|       |-- SKILL.md
|       `-- references/
|           |-- declarative-mode.md
|           |-- data-mode.md
|           |-- framework-mode.md
|           `-- rsc.md
|-- .github/
|   `-- workflows/
|       |-- azure-oidc-test.yml
|       |-- cd.yml
|       |-- ci.yml
|       `-- storage-upload-test.yml
|-- Docs/
|   |-- 01-overview.md
|   |-- 02-architecture.md
|   |-- 03-features-and-data-flows.md
|   |-- 04-state-and-api-layer.md
|   |-- 05-file-reference.md
|   |-- 06-testing-and-deployment.md
|   `-- README.md
|-- app/
|   |-- components/
|   |   |-- power-ai/
|   |   |   |-- ai-error-banner.tsx
|   |   |   |-- ask-power-ai-button.tsx
|   |   |   |-- chat-input.tsx
|   |   |   |-- context-indicator.tsx
|   |   |   |-- conversation-view.tsx
|   |   |   |-- evidence-view.tsx
|   |   |   |-- persona-selector.tsx
|   |   |   |-- power-ai-content.tsx
|   |   |   |-- power-ai-header.tsx
|   |   |   |-- power-ai-locked.tsx
|   |   |   |-- power-ai-trigger.tsx
|   |   |   |-- power-ai-widget.tsx
|   |   |   `-- suggested-questions.tsx
|   |   |-- setup-guide/
|   |   |   `-- setup-guide.tsx
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
|   |   |   |-- switch.tsx
|   |   |   |-- table.tsx
|   |   |   |-- tabs.tsx
|   |   |   |-- textarea.tsx
|   |   |   |-- toast.tsx
|   |   |   `-- tooltip.tsx
|   |   |-- workspace/
|   |   |   |-- api-documentation.tsx
|   |   |   |-- api-execution-panel.tsx
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
|   |   |-- power-ai-api.ts
|   |   |-- power-ai-suggestions.ts
|   |   |-- query-provider.tsx
|   |   |-- scanner-api.ts
|   |   |-- use-api-executor.ts
|   |   |-- use-power-ai-chat.ts
|   |   |-- use-power-ai-status.ts
|   |   |-- use-workspace-scan.ts
|   |   `-- utils.ts
|   |-- routes/
|   |   |-- home.tsx
|   |   |-- setup-guide.tsx
|   |   `-- workspace.tsx
|   |-- stores/
|   |   |-- app-store.ts
|   |   |-- layout-store.ts
|   |   `-- power-ai-store.ts
|   |-- app.css
|   |-- root.tsx
|   `-- routes.ts
|-- public/
|   |-- favicon.ico
|   |-- product-lineage-view.png
|   |-- tab_logo.png
|   `-- web.config
|-- tests/
|   |-- api-documentation.spec.ts
|   |-- app-shell.spec.ts
|   |-- home.spec.ts
|   |-- impact-analysis.spec.ts
|   |-- power-ai.spec.ts
|   |-- report-lineage.spec.ts
|   |-- scanner.spec.ts
|   `-- setup-guide.spec.ts
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
| `Docs/README.md` | Index for focused contributor documentation covering architecture, features, state/API behavior, files, tests, and deployment. |
| `package.json` | Declares runtime/dev dependencies and the `dev`, `build`, `start`, and `typecheck` commands. |
| `package-lock.json` | Locks the exact dependency graph for reproducible `npm ci` installs. |
| `vite.config.ts` | Registers React Router and Tailwind plugins, resolves `~/*`, prebundles the complete runtime import set to prevent cold lazy-route optimizer invalidation, and proxies local backend paths. |
| `react-router.config.ts` | Selects SPA mode with `ssr: false` for IIS static hosting. |
| `tsconfig.json` | Enforces strict TypeScript, browser/ES2022 libraries, bundler resolution, and `~/*` aliases. |
| `components.json` | Configures shadcn style, aliases, Tailwind CSS entry, Base UI behavior, and Lucide icons. |
| `playwright.config.ts` | Defines browser-test directory, localhost dev server reuse, timeouts, traces, and failure screenshots. |
| `Dockerfile` | Optional Node 24 multi-stage build/server image retained for non-IIS validation; IIS static hosting remains the production target. |
| `.dockerignore` | Excludes dependencies, generated builds, local context, and README from Docker build context. |
| `.gitignore` | Excludes dependencies, generated React Router/build/test artifacts, environment files, and local context documents. |
| `public/favicon.ico` | Browser/site icon copied unchanged into the production client output. |
| `public/product-lineage-view.png` | Tested Report Lineage workspace capture used as the Home product preview. |
| `public/tab_logo.png` | Current browser-tab icon referenced by the React Router root links. |
| `public/web.config` | IIS rewrite configuration copied into every production artifact; proxies API/OpenAPI requests to FastAPI and falls back application routes to `index.html`. |
| `.github/workflows/ci.yml` | Main-branch/pull-request quality gate using Node 22, `npm ci`, strict typecheck, and production build. |
| `.github/workflows/cd.yml` | Production deployment gate: builds the successful main commit, publishes the static ZIP to Azure Container Registry with ORAS, invokes the VM ACR deployment script, and smoke-tests IIS. |
| `.github/workflows/azure-oidc-test.yml` | Manual Azure federated-identity and resource-group access diagnostic. |
| `.github/workflows/storage-upload-test.yml` | Manual production-environment build and Azure Blob upload validation without changing the IIS site. |
| `.azure/scripts/download-frontend-artifact.ps1` | Uses the Azure VM managed identity to download a named release ZIP from Blob Storage and emits a machine-readable success marker. |
| `.azure/scripts/deploy-frontend.ps1` | Validates and stages a versioned release, atomically repoints IIS, performs local HTTP validation, rolls back on failure, records the release, and prunes old releases. |
| `.azure/scripts/deploy-frontend-from-acr.ps1` | Pulls the ORAS frontend artifact from ACR with VM identity and delegates validated IIS promotion to the deployment script. |

### Application Bootstrap And Routes

| File | Purpose and fulfilled responsibility |
| --- | --- |
| `app/routes.ts` | Declares the Home index, `/setup-guide`, and optional workspace section route in React Router Framework Mode. |
| `app/root.tsx` | Creates the HTML shell, installs QueryProvider and the single global Power AI widget, renders route outlets/scripts, restores scroll, and handles route errors. |
| `app/app.css` | Imports Tailwind, shadcn, animation, and Geist font styles; defines light/dark design tokens, radii, and global minimum width. |
| `app/routes/setup-guide.tsx` | Wraps the static setup guide with route metadata plus the shared header and footer. |
| `app/routes/home.tsx` | Renders `/`: database-neutral product overview, real workspace preview, evidence path, and the single primary Start action. |
| `app/routes/workspace.tsx` | Owns the shared workspace shell, OpenAPI query, endpoint catalog, API executor, sidebar routing, mobile navigation, and lazy loading for Explorer, Report Lineage, Table Impact, Measure Impact, and Scanner. |

### Shared Application Components

| File | Purpose and fulfilled responsibility |
| --- | --- |
| `app/components/app-header.tsx` | Renders product identity, active Home/Setup Guide/Workspace/API links, mobile navigation, and an optional TanStack Query backend-health badge. Home disables the health request and badge. |
| `app/components/app-footer.tsx` | Renders shared navigation, mandatory developer attribution, and current-year copyright on all pages. |
| `app/components/setup-guide/setup-guide.tsx` | Renders the static, role-oriented Microsoft/Fabric/Scanner/XMLA/Snowflake/backend setup handbook, ordered application handoff, troubleshooting matrix, and authoritative external references. It performs no provider API calls. |

### Power AI Components

| File | Purpose and fulfilled responsibility |
| --- | --- |
| `app/components/power-ai/power-ai-widget.tsx` | Mounts one lazy-loaded floating launcher/panel across Home, Setup Guide, workspace, and API routes without reducing the main canvas width. |
| `app/components/power-ai/power-ai-trigger.tsx` | Shows the ready or locked global launcher based on backend status. |
| `app/components/power-ai/power-ai-content.tsx` | Composes status-aware locked/chat states and the active conversation controls. |
| `app/components/power-ai/power-ai-header.tsx` | Displays the panel title, context summary entry point, and collapse command. |
| `app/components/power-ai/power-ai-locked.tsx` | Presents distinct disabled, unconfigured, unauthenticated, forbidden, and unavailable guidance. |
| `app/components/power-ai/chat-input.tsx` | Handles message entry plus send/stop behavior during streamed responses. |
| `app/components/power-ai/conversation-view.tsx` | Renders user/assistant messages, answer status, claims, and generated follow-up questions. |
| `app/components/power-ai/evidence-view.tsx` | Renders backend-verified evidence and claim citation markers without deriving facts in the browser. |
| `app/components/power-ai/context-indicator.tsx` | Shows the selected workspace/report/model/object identifiers and names supplied as chat context. |
| `app/components/power-ai/persona-selector.tsx` | Selects general, business, or developer explanation style. |
| `app/components/power-ai/suggested-questions.tsx` | Displays backend or context-derived question shortcuts. |
| `app/components/power-ai/ask-power-ai-button.tsx` | Opens the global panel from analysis views and seeds object context plus a starting question. |
| `app/components/power-ai/ai-error-banner.tsx` | Converts normalized AI failures into concise user-facing error states. |

### Workspace Components

| File | Purpose and fulfilled responsibility |
| --- | --- |
| `app/components/workspace/workspace-sidebar.tsx` | Defines Setup Guide, Overview, operational setup, exploration, table/measure-impact, report-lineage, and API-documentation navigation for desktop/mobile shells. |
| `app/components/workspace/power-bi-setup.tsx` | Validates and executes device-code/service-principal setup, presents provider readiness, clears secrets, and invalidates identity-dependent caches. |
| `app/components/workspace/database-setup.tsx` | Validates Snowflake connection input and presents connect/status/logout information without raw setup JSON. |
| `app/components/workspace/explorer.tsx` | Implements workspace-scoped exploration across two tabs — Assets & access, and Reports (one report picker above the shared `ReportEvidence` sections) — plus an opt-in metadata scan panel for the current workspace's dashboards, app linkage, and ownership. |
| `app/components/workspace/report-lineage.tsx` | Discovers reports across every accessible workspace, resolves each one's bound semantic model (including a model owned by another workspace) from the estate graph, and renders the shared `ReportEvidence` sections for the selected report. |
| `app/components/workspace/report-evidence.tsx` | The five report-scoped views — Page details, Source DB lineage, Semantic objects, Semantic - DB objects mappings, Report visuals — with their section tabs and every call behind them. Shared by Explorer and Report Lineage so both screens stay identical below the report picker. |
| `app/components/workspace/evidence-ui.tsx` | Shared evidence primitives: the AG Grid wrapper with its copy/CSV/Excel toolbar, the export context helpers, the DAX column, and the loading/empty/warning/error states (including the 401-means-session-gone message). |
| `app/components/workspace/table-impact.tsx` | Resolves a semantic table's or column's downstream/upstream DAX impact and cross-report/visual evidence into a directed diagram and an exportable AG Grid table. |
| `app/components/workspace/measure-impact.tsx` | Resolves a single measure's upstream inputs and downstream dependents and cross-report/visual evidence into one bidirectional diagram and an exportable AG Grid table. |
| `app/components/workspace/auth-required.tsx` | `PowerBiAuthRequired`: the shared "Power BI authentication is required" empty state shown whenever a page's first Power BI-backed query fails, with a link back to Power BI setup. Used by Explorer, Report Lineage, Table Impact, Measure Impact, and Scanner. |
| `app/components/workspace/impact-grid.tsx` | Shared AG Grid wrapper for Table Impact and Measure Impact: teal theme, copyable cells, and a copy/CSV/Excel export toolbar. |
| `app/components/workspace/scanner.tsx` | Runs the Power BI Admin metadata scanner across a chosen workspace scope (1-100) and browses the result across five tabs (Workspaces, Reports & dashboards, Semantic models, Dependencies, Datasource instances), each an exportable AG Grid table modeled field-for-field against Microsoft's GetScanResult schema. |
| `app/components/workspace/impact-picker.tsx` | Shared pickers for Table Impact and Measure Impact: `WorkspaceScopeSelect` (multi-select workspace scope with select-all/clear) and `ObjectSearchSelect` (a `Command`-based searchable combobox over a preloaded table/measure inventory). |
| `app/components/workspace/api-documentation.tsx` | Groups/searches OpenAPI operations and expands the selected operation into the active execution workbench. |
| `app/components/workspace/api-execution-panel.tsx` | Renders parameter/body inputs, validates JSON, executes through the shared hook, clears sensitive values, and presents copyable body/header output. |

### Lineage Diagram Engine

Shared by Table Impact and Measure Impact so every dependency diagram in the
application is directed, auto-laid-out, and collapsible in the same way.

| File | Purpose and fulfilled responsibility |
| --- | --- |
| `app/components/workspace/lineage/lineage-types.ts` | Declares the diagram-agnostic `LineageGraph`/`LineageGraphNode`/`LineageGraphEdge` shapes every feature builds toward, plus the React Flow node-data type. |
| `app/components/workspace/lineage/lineage-layout.ts` | Lazy-loads a worker-backed `elkjs` layered layout for a given direction (`LR`/`TB`), provides fallback positions, and estimates node height from detail-text length. |
| `app/components/workspace/lineage/lineage-node.tsx` | Custom React Flow node: tone-colored card per object kind, with a collapse/expand chevron and a hidden-descendant count when the node has children. |
| `app/components/workspace/lineage/lineage-diagram.tsx` | Exports `<LineageDiagram>`: builds an undirected "display tree", owns collapse state, derives the visible subgraph, runs ELK without remounting React Flow, and renders draggable nodes, reset/viewport controls, culling, and directed arrowheads. |

### API, Query, Utility, And State Files

| File | Purpose and fulfilled responsibility |
| --- | --- |
| `app/lib/api-catalog.ts` | Defines OpenAPI/frontend endpoint types, fallback setup operations, request templates, schema example generation, endpoint flattening, URL construction, response parsing, method styles, and formatting helpers. |
| `app/lib/dependency-graph.ts` | Pure multi-source DAX dependency traversal (`computeDependencyClosure`) shared by Table Impact and Measure Impact, plus `closureToLineageGraph`, which turns a closure into a `LineageGraph` for `<LineageDiagram>`. |
| `app/lib/lineage-api.ts` | Shared admin-key-aware `requestJson` fetch helper for every `/lineage/*` and `/explorer/*` call, plus `boundReportsForModel`, chunked/concurrency-limited `fetchBatchedExplorer`, `fetchEstateInventory` (workspace-scoped table/measure inventory for Table/Measure Impact), and lineage query-key factories. |
| `app/lib/scanner-api.ts` | Typed `startScan`/`getScanStatus`/`getScanResult` calls onto `/api/v1/scanner/*` (built on `requestJson`), `DEFAULT_SCAN_FLAGS`, and a full, defensive TypeScript model of Microsoft's real (backend-untyped) GetScanResult payload — every type and field from the official reference page. |
| `app/lib/use-workspace-scan.ts` | `useWorkspaceScan` hook: drives the scanner's submit-then-poll-then-fetch workflow via TanStack Query's `refetchInterval`, never runs automatically, and resets when the workspace scope changes. Shared by Explorer's scan panel and the Scanner page. |
| `app/lib/grid-export.ts` | Shared CSV/Excel/copy-table export helpers (`downloadCsv`, `downloadExcel`, `toTabSeparatedValues`, `withExportContext`) used by `ImpactGrid` and available for reuse by other tables. |
| `app/lib/use-api-executor.ts` | Executes a catalog endpoint with path/query/header values, cookies, optional ephemeral key, JSON body handling, timing, headers, and normalized failure results. |
| `app/lib/power-ai-api.ts` | Canonical Power AI wire types plus status, non-streaming chat, SSE streaming, cancellation, and normalized error handling for `/api/v1/ai/*`. |
| `app/lib/power-ai-suggestions.ts` | Produces safe route/object-aware starter questions without generating factual answers. |
| `app/lib/use-power-ai-status.ts` | Caches the authenticated backend AI status and refreshes it every 30 seconds. |
| `app/lib/use-power-ai-chat.ts` | Coordinates message state, streamed/non-streamed transport selection, cancellation, final response replacement, and friendly errors. |
| `app/lib/query-provider.tsx` | Creates one QueryClient with default retry, stale-time, and focus-refetch behavior for the application lifetime. |
| `app/lib/utils.ts` | Exposes shared class-name composition used by shadcn and custom components. |
| `app/stores/app-store.ts` | Owns normalized API origin and ephemeral admin-key memory using Zustand. |
| `app/stores/layout-store.ts` | Persists only the desktop navigation collapsed preference; drawer state remains local and sensitive state is excluded. |
| `app/stores/power-ai-store.ts` | Owns conversation/UI state and persists only the selected audience; messages, context, errors, and panel-open state are not persisted. |

### UI Primitives

These files are local shadcn/Base UI building blocks. Keep application behavior
in feature components and primitive behavior/styling here.

| File | Purpose and fulfilled responsibility |
| --- | --- |
| `app/components/ui/badge.tsx` | Compact status/category labels. |
| `app/components/ui/button.tsx` | Button variants, sizes, and rendered-link/button behavior. |
| `app/components/ui/card.tsx` | Small framed content surfaces used where information is genuinely grouped. |
| `app/components/ui/checkbox.tsx` | Accessible binary checkbox control. |
| `app/components/ui/command.tsx` | Command/search list composition based on cmdk. |
| `app/components/ui/dialog.tsx` | Accessible modal dialog primitives. |
| `app/components/ui/dropdown-menu.tsx` | Accessible menu trigger, content, item, and submenu primitives. |
| `app/components/ui/input-group.tsx` | Inputs with leading/trailing controls or content. |
| `app/components/ui/input.tsx` | Standard text/password/number input styling. |
| `app/components/ui/label.tsx` | Accessible form labels. |
| `app/components/ui/select.tsx` | Base UI select trigger, content, and option primitives. |
| `app/components/ui/separator.tsx` | Horizontal/vertical semantic separators. |
| `app/components/ui/sheet.tsx` | Responsive side sheet used by mobile workspace navigation. |
| `app/components/ui/textarea.tsx` | Multi-line input used by JSON request editors. |
| `app/components/ui/skeleton.tsx` | Stable loading placeholders. |
| `app/components/ui/switch.tsx` | Accessible binary feature control. |
| `app/components/ui/table.tsx` | Semantic table structure for compact non-grid content. |
| `app/components/ui/tabs.tsx` | Accessible tab list, trigger, and panel primitives. |
| `app/components/ui/toast.tsx` | Local toast state and renderer with no external toast/theme dependency. |
| `app/components/ui/tooltip.tsx` | Accessible hover/focus descriptions for compact icon controls. |

`app/components/ui/sonner.tsx` is intentionally not part of the project. It
was unreachable and referenced the uninstalled `sonner` and `next-themes`
packages, so retaining it caused clean-clone and GitHub TypeScript failures.

### Tests And Context

| File | Purpose and fulfilled responsibility |
| --- | --- |
| `tests/report-lineage.spec.ts` | Mocks backend contracts and verifies evidence tabs, exports, report/column/calculation graphs, desktop layout, and mobile containment. |
| `tests/impact-analysis.spec.ts` | Mocks a two-workspace, two-model backend fixture and verifies Table Impact's and Measure Impact's workspace-scope multi-select, searchable table/measure picker (including cross-workspace merging and scope narrowing), directed/collapsible diagrams, impact grids, and evidence status. |
| `tests/scanner.spec.ts` | Mocks the four `/api/v1/scanner/*` endpoints (including a status route that reports "Running" before "Succeeded", proving the poll loop works) against a fixture covering every entity type, and verifies both the dedicated Scanner page's multi-workspace scan-and-browse flow across all five tabs and Explorer's single-workspace scan panel replacing its dashboards/app-linkage/ownership placeholders. |
| `tests/api-documentation.spec.ts` | Mocks OpenAPI/backend operations and verifies GET/POST execution, JSON validation, response metadata, and output copying behavior. |
| `tests/app-shell.spec.ts` | Verifies desktop navigation persistence, tablet icon rail behavior, mobile drawers, and the non-resizing floating Power AI overlay. |
| `tests/power-ai.spec.ts` | Verifies availability states, Power BI auth/permission locks, persona persistence, object context, SSE/non-SSE chat, cancellation, evidence, friendly errors, and responsive conversation continuity. |
| `tests/home.spec.ts` | Verifies the Home route, single main-content action, database-neutral copy, no Home health request, working product image, shared navigation, and desktop/mobile containment. |
| `tests/setup-guide.spec.ts` | Verifies `/setup-guide`, required setup sections and official links, navigation to Home/workspace, and desktop/mobile layouts. |
| `REF_DOC/PROJECT_CONTEXT.md` | Local continuity document containing current frontend contracts and implementation constraints; ignored by Git. |

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

## Automated Azure Deployment

The production workflow in `.github/workflows/cd.yml` deploys the static IIS
artifact to the Windows Azure VM. It runs only when `DEPLOYMENT_ENABLED` is
`true` and either:

1. `Frontend CI` completed successfully for `main`.
2. A maintainer manually dispatched the workflow from `main`.

The workflow deliberately uses `cancel-in-progress: false` so one production
release cannot interrupt another. Its deployment sequence is:

1. Resolve and check out the exact release commit.
2. Use Node 22 and `npm ci` to reproduce the locked dependency graph.
3. Build the SPA and require both `build/client/index.html` and
   `build/client/web.config`.
4. ZIP only the contents of `build/client`.
5. Authenticate GitHub Actions to Azure through OIDC, without a stored Azure
   client secret.
6. Resolve the ACR login server, install ORAS on the runner, and push the ZIP
   plus `deploy-frontend.ps1` as a versioned OCI artifact.
7. Invoke Azure VM Run Command with
   `.azure/scripts/deploy-frontend-from-acr.ps1`.
8. Let the VM managed identity obtain a short-lived ACR token, pull the exact
   release with ORAS, and invoke `deploy-frontend.ps1`.
9. Stage and validate a versioned release, repoint the `PBI-Lineage` IIS site,
   recycle its application pool, and roll back automatically on failure.
10. Smoke-test the deployed site through IIS on the VM.

Required GitHub `production` environment secrets:

| Secret | Purpose |
| --- | --- |
| `AZURE_CLIENT_ID` | Client ID of the Azure federated identity used by GitHub OIDC. |
| `AZURE_TENANT_ID` | Microsoft Entra tenant containing the deployment identity. |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription containing the production resources. |

Required GitHub repository/environment variables:

| Variable | Purpose |
| --- | --- |
| `DEPLOYMENT_ENABLED` | Must equal `true` before the production job is allowed to run. |
| `AZURE_RESOURCE_GROUP` | Resource group containing the target VM. |
| `AZURE_VM_NAME` | Windows VM reached through Azure VM Run Command. |
| `ACR_NAME` | Azure Container Registry that stores the frontend OCI artifact. |
| `ACR_REPOSITORY` | ACR repository name used for versioned frontend releases. |
| `PRODUCTION_URL` | Public application URL shown in the GitHub deployment environment. |

Production VM layout:

```text
C:\pbi-lineage\
|-- deploy\                         Temporary ORAS pull workspace
`-- frontend\
    |-- current-release.txt
    `-- releases\
        `-- <commit-sha>\
            |-- index.html
            |-- web.config
            `-- assets\
```

The GitHub OIDC identity needs ACR push access and permission to run commands on
the VM. The VM managed identity needs ACR pull access. Azure CLI and ORAS must
be available on the VM. IIS and the `PBI-Lineage` site must already exist;
deployment moves versioned static files and changes the site physical path but
does not install IIS or create the site.

Use `.github/workflows/azure-oidc-test.yml` to verify federated Azure access.
`storage-upload-test.yml` remains a manual legacy Blob diagnostic and is not
part of the current ACR production release path.

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

1. `/` loads Home without a Node process and `/setup-guide` loads directly.
2. `/workspace/report-lineage` loads directly after a hard refresh.
3. `/workspace/table-impact`, `/workspace/measure-impact`, and
   `/workspace/scanner` load directly after hard refreshes.
4. `/api/v1/health/live` returns through IIS.
5. `/openapi.json` returns through IIS.
6. Power BI login sets and reuses the backend session cookie.
7. API documentation can execute a harmless GET such as health/status.
8. CSV/Excel downloads work in the browser.
9. The footer shows `Developed by Satyadeep Singh` and copyright.
10. `C:\pbi-lineage\frontend\current-release.txt` contains the deployed
    commit SHA after an automated release.

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
- Confirm the complete runtime import list remains in `optimizeDeps.include`;
  lazy imports that are omitted can trigger another optimizer generation.
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
- Explorer has no dedicated Playwright spec (`tests/explorer.spec.ts` does not
  exist). Its two-tab layout and Source DB lineage section were verified
  manually against both a mocked and a live backend during development but
  have no committed browser coverage.
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
