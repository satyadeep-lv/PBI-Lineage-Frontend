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
- Trace report, column, measure, and calculated-column lineage by depth.
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
| Graphs | XYFlow / React Flow | Report, column, measure, and calculated-object diagrams. |
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

## Route Map

| Route | View | Data responsibility |
| --- | --- | --- |
| `/` | Overview | Product purpose, value, workflow, and start action. |
| `/workspace` | Power BI setup | Default workspace route. |
| `/workspace/power-bi` | Power BI setup | Device-code and service-principal authentication. |
| `/workspace/database` | Database setup | Snowflake connection, status, and logout. |
| `/workspace/explorer` | Explorer | Workspace-scoped report/model investigation. |
| `/workspace/report-lineage` | Report Lineage | Report-focused evidence across all accessible workspaces. |
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

## Explorer Data Flow

Explorer begins with `GET /api/v1/workspaces` and keeps names as the primary UI
identity. IDs appear below selected names only as supporting technical context.

Major levels:

1. Workspace assets and access.
2. Report detail and pages.
3. Report-specific semantic lineage.
4. Semantic tables, columns, measures, hierarchies, relationships, and DAX.
5. Database-column to semantic-object mapping.
6. Column and measure dependency diagrams.

Heavy report and semantic-model requests begin after selection and are cached by
TanStack Query. Tabs reuse prepared data instead of repeating provider calls.

A report can use a semantic model from another workspace. Never substitute the
report workspace ID for the model workspace ID unless estate evidence confirms
the model is local.

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

React Flow is remounted when graph identity changes so a new selection is fitted
inside the viewport rather than inheriting the previous pan or zoom.

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

## State Ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| Backend health | TanStack Query in `AppHeader` | Refetched every 15 seconds. |
| OpenAPI document | TanStack Query in workspace route | Current browser query cache. |
| Explorer/report data | TanStack Query | Selection-keyed cache with feature-specific stale times. |
| API execution result | `useApiExecutor` | Current workspace route mount. |
| API origin | Zustand | In-memory page lifetime, initialized from `VITE_API_ORIGIN`. |
| Administrative key | Zustand | Ephemeral memory only; no visible input or persistence. |
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
|   |   |   |-- database-setup.tsx
|   |   |   |-- explorer.tsx
|   |   |   |-- power-bi-setup.tsx
|   |   |   |-- report-lineage-diagrams.tsx
|   |   |   |-- report-lineage.tsx
|   |   |   `-- workspace-sidebar.tsx
|   |   |-- app-footer.tsx
|   |   `-- app-header.tsx
|   |-- lib/
|   |   |-- api-catalog.ts
|   |   |-- query-provider.tsx
|   |   |-- use-api-executor.ts
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
|   `-- report-lineage.spec.ts
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
| `app/components/workspace/workspace-sidebar.tsx` | Defines setup, exploration, report-lineage, and API-documentation navigation for desktop/mobile shells. |
| `app/components/workspace/power-bi-setup.tsx` | Validates and executes device-code/service-principal setup, presents provider readiness, clears secrets, and invalidates identity-dependent caches. |
| `app/components/workspace/database-setup.tsx` | Validates Snowflake connection input and presents connect/status/logout information without raw setup JSON. |
| `app/components/workspace/explorer.tsx` | Implements workspace-scoped report/model exploration, background heavy queries, AG Grid tables, copy/export, semantic mapping, and column/measure diagrams. |
| `app/components/workspace/report-lineage.tsx` | Discovers reports across workspaces, resolves composite model ownership, prepares report snapshots, and renders report evidence tabs/tables. |
| `app/components/workspace/report-lineage-diagrams.tsx` | Builds selectable report/database, column, measure, and calculated-column React Flow graphs with depth controls and evidence copy. |
| `app/components/workspace/api-documentation.tsx` | Groups/searches OpenAPI operations and expands the selected operation into the active execution workbench. |
| `app/components/workspace/api-execution-panel.tsx` | Renders parameter/body inputs, validates JSON, executes through the shared hook, clears sensitive values, and presents copyable body/header output. |
| `app/components/workspace/api-domain-canvas.tsx` | Retained alternate full-domain operation selector/executor. It is not routed by the current workspace; current documentation uses `ApiExecutionPanel`. |
| `app/components/workspace/api-output-panel.tsx` | Response renderer used by the retained alternate `ApiDomainCanvas`; not used by the current documentation execution panel. |

### API, Query, Utility, And State Files

| File | Purpose and fulfilled responsibility |
| --- | --- |
| `app/lib/api-catalog.ts` | Defines OpenAPI/frontend endpoint types, fallback setup operations, request templates, schema example generation, endpoint flattening, URL construction, response parsing, method styles, and formatting helpers. |
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
- Dashboard/app/access data must not be invented when the backend does not
  expose it.
- Orval, Vitest, and React Testing Library are installed but generated clients
  and focused unit/component suites are not yet committed.
- `ApiDomainCanvas`, `ApiOutputPanel`, and `app/welcome/` are retained but not
  used by current routes; remove them only as a deliberate cleanup change.
