# Architecture

## Folder layout

```text
PBI-Lineage-Frontend/
|-- .agents/skills/react-router/      Local coding-agent reference docs for React Router (not runtime code)
|-- app/
|   |-- components/
|   |   |-- ui/                       shadcn/Base UI primitives (button, dialog, sheet, table, tabs, ...)
|   |   |-- workspace/                Feature components (setup, explorer, report-lineage, api-docs)
|   |   |-- app-header.tsx            Product header + backend health badge
|   |   `-- app-footer.tsx            Attribution/copyright footer
|   |-- lib/
|   |   |-- api-catalog.ts            OpenAPI types, parsing, endpoint flattening, request templates
|   |   |-- use-api-executor.ts       Hook that executes a catalog endpoint against the backend
|   |   |-- query-provider.tsx        Single app-lifetime QueryClient
|   |   `-- utils.ts                  cn() class-name helper (clsx + tailwind-merge)
|   |-- routes/
|   |   |-- home.tsx                  "/" overview route
|   |   `-- workspace.tsx             "/workspace/:section?" shell route
|   |-- stores/app-store.ts           Zustand: apiOrigin + adminKey
|   |-- welcome/                      Unused React Router scaffold leftovers (no route imports them)
|   |-- app.css                       Tailwind + shadcn + font imports, design tokens
|   |-- root.tsx                      HTML shell, QueryProvider, ErrorBoundary
|   `-- routes.ts                     Route table (React Router Framework Mode)
|-- public/favicon.ico
|-- tests/                            Playwright specs
|-- vite.config.ts, react-router.config.ts, tsconfig.json, components.json
|-- playwright.config.ts, Dockerfile, package.json
```

Generated `node_modules/`, `.react-router/`, `build/`, `test-results/`, and
`playwright-report/` are gitignored and omitted above.

## Routing

`app/routes.ts`:

```ts
index("routes/home.tsx")
route("workspace/:section?", "routes/workspace.tsx")
```

There are only two route files. Everything under `/workspace` is one shell
(`app/routes/workspace.tsx`) that switches on the `:section` param — it is
**not** a nested React Router route tree. `workspace.tsx` owns:

- The OpenAPI document query (`useQuery(["openapi", apiOrigin], fetchOpenApi)`).
- Building the endpoint catalog (`flattenEndpoints` + `SETUP_ENDPOINT_DEFINITIONS`
  fallback for setup operations not yet reflected in the live OpenAPI doc).
- One shared `useApiExecutor(endpoints)` instance passed down to whichever
  section is active.
- Section switching: `database` | `power-bi` (default) | `explorer` |
  `report-lineage` | anything else → `ApiDocumentation` (with the section
  used as an OpenAPI tag slug, or `undefined` for `api-docs`).
- Lazy-loading `Explorer` and `ReportLineage` via `React.lazy` (they pull in
  AG Grid + XYFlow, which are otherwise unused on lighter routes).
- Desktop sidebar (`WorkspaceSidebar`) + a mobile `Sheet` drawer, both driven
  by the same `navigateTo(section)` function.

| Route | Section value | View |
| --- | --- | --- |
| `/` | — | Overview / landing (`home.tsx`) |
| `/workspace` or `/workspace/power-bi` | `power-bi` (default) | Power BI setup |
| `/workspace/database` | `database` | Snowflake setup |
| `/workspace/explorer` | `explorer` | Workspace-scoped explorer |
| `/workspace/report-lineage` | `report-lineage` | Cross-workspace report lineage |
| `/workspace/api-docs` | `api-docs` | Full API documentation |
| `/workspace/<tag-slug>` | anything else | API documentation prefiltered to one OpenAPI tag |

Unknown top-level routes hit React Router's `ErrorBoundary` in `root.tsx` in
dev; production IIS needs a SPA-fallback rewrite rule (see
[06-testing-and-deployment.md](06-testing-and-deployment.md)) since there is
no server-side routing (`ssr: false` in `react-router.config.ts`).

## Build & tooling configuration

- **`vite.config.ts`** — registers the `reactRouter()` and `tailwindcss()`
  plugins, resolves `~/*` via `tsconfigPaths`, force-prebundles
  `@tanstack/react-query`, `@xyflow/react`, `ag-grid-community`, and
  `ag-grid-react` (they're behind lazy routes and would otherwise cause a
  slow first dynamic import), and proxies `/api`, `/openapi.json`, `/docs`
  to `http://127.0.0.1:8000` in dev.
- **`react-router.config.ts`** — `ssr: false`; this is a client-only SPA
  build intended for static IIS hosting, not a Node SSR server (the `start`
  script / Dockerfile exist only for optional non-IIS validation).
- **`tsconfig.json`** — strict TypeScript, browser/ES2022 libs, bundler
  module resolution, `~/*` path alias into `app/`.
- **`components.json`** — shadcn config: style, aliases, Tailwind entry
  (`app/app.css`), Base UI, Lucide icons.
- **`playwright.config.ts`** — test dir `tests/`, reuses/starts the dev
  server on `localhost:5173`.

## Request flow (high level)

```
Browser (React app)
  -> fetch(..., { credentials: "include" })
  -> same-origin in prod (IIS proxy) / Vite proxy in dev
  -> FastAPI backend (/api/v1/*, /openapi.json)
       -> Microsoft Graph / Power BI / Fabric APIs
       -> optional Snowflake
  <- JSON response + Set-Cookie (session)
```

The frontend never talks to Microsoft/Fabric/Snowflake directly — FastAPI is
the only upstream dependency, and all session state lives in backend
HTTP-only cookies.
