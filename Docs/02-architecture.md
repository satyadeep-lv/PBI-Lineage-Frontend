# Architecture

## Folder Layout

```text
PBI-Lineage-Frontend/
|-- .azure/scripts/                VM Blob download and atomic IIS release scripts
|-- .agents/skills/react-router/   Local coding-agent references, not runtime code
|-- .github/workflows/             CI, production CD, Azure OIDC and Blob diagnostics
|-- Docs/                          Focused contributor documentation
|-- app/
|   |-- components/
|   |   |-- setup-guide/           Static setup handbook
|   |   |-- ui/                    Reachable shadcn/Base UI primitives
|   |   |-- workspace/             Setup, Overview, Explorer, lineage, impact, scanner, API docs
|   |   |-- app-header.tsx         Product identity, Home/Workspace/Documents navigation, optional health
|   |   `-- app-footer.tsx         Navigation, attribution, and copyright
|   |-- lib/                       OpenAPI, requests, queries, route helpers, lineage, impact evidence, scanner, exports
|   |-- routes/                    Home, Setup Guide, and shared workspace shell
|   |-- stores/app-store.ts        API origin and ephemeral admin key
|   |-- app.css                    Tailwind (scans app/ only), font, theme tokens, global rules
|   |-- root.tsx                   HTML shell, query provider, error boundary
|   `-- routes.ts                  React Router Framework Mode route table
|-- logos/                         Original logo artwork; source for the public logo mark, never served
|-- public/                        Home walkthrough GIFs/posters, logo mark, favicon, and IIS config copied into build/client
|-- scripts/walkthrough/           Capture/compose tooling that regenerates the Home walkthrough
|-- tests/                         Playwright Home, navigation, Overview, setup, API, report, impact, and scanner specs
`-- root build/tool configuration
```

Generated `node_modules/`, `.react-router/`, `build/`, `test-results/`, and
`playwright-report/` directories are ignored and are not deployable source.
See [05-file-reference.md](05-file-reference.md) for each maintained file.

## Routing

`app/routes.ts` declares:

```ts
index("routes/home.tsx")
route("setup-guide", "routes/setup-guide.tsx")
route("workspace/:section?", "routes/workspace.tsx")
```

Home is a static, database-neutral product overview and intentionally does
not request backend health. The Setup Guide is a separate static handbook that
does not load OpenAPI or provider data.

All operational views share `app/routes/workspace.tsx`; `:section` is a view
switch, not a nested route tree. The shell owns:

- The live OpenAPI query and fallback setup endpoint merge.
- One shared `useApiExecutor` instance.
- Desktop sidebar and mobile Sheet navigation for the working sections.
- Lazy imports for the heavy data/graph views.
- API reference fallback for unknown section slugs, rendered full-width with
  no sidebar and no mobile "Workspace menu".

| Route | Section | View |
| --- | --- | --- |
| `/` | none | Product overview |
| `/setup-guide` | none | Static Setup Guide |
| `/workspace`, `/workspace/power-bi` | `power-bi` | Power BI setup |
| `/workspace/database` | `database` | Snowflake setup |
| `/workspace/overview` | `overview` | Totals and linked lists of workspaces, reports, and semantic models |
| `/workspace/explorer` | `explorer` | Workspace-scoped Explorer; optional `?workspace=`, `?report=`, `?model=` deep link |
| `/workspace/report-lineage` | `report-lineage` | Estate-wide report lineage |
| `/workspace/table-impact` | `table-impact` | Multi-table impact (semantic model or database tables) across every workspace |
| `/workspace/measure-impact` | `measure-impact` | One measure's tables, impacted measures, semantic model, reports, visuals, and inputs within a workspace scope |
| `/workspace/scanner` | `scanner` | Power BI Admin metadata scanner (direct URL; not in the sidebar) |
| `/workspace/api-docs` | `api-docs` | Full API reference/execution, full-width |
| `/workspace/<tag-slug>` | other | API reference prefiltered to one OpenAPI tag |

Unknown top-level routes reach `root.tsx`'s error boundary in development.
Because `react-router.config.ts` sets `ssr: false`, IIS must rewrite unknown
non-file/non-directory routes to `/index.html`.

## Navigation

`app/components/app-header.tsx` renders the primary navigation as **Home**,
**Workspace** (to `/workspace/power-bi`), and a **Documents** dropdown (Base UI
`DropdownMenu`) holding **Setup guide** (`/setup-guide`) and **API reference**
(`/workspace/api-docs`). On small screens the header's sheet ("Mobile
navigation") lists Home and Workspace, then a "Documents" group label with the
same two links indented beneath it. The footer keeps its own flat links.
Both show the transparent logo mark with no frame: `public/tab_logo.png` in
light theme and `public/tab_logo-dark.png`, whose navy strokes are light
slate, in dark theme. `root.tsx` links `public/favicon.ico` first and the
512 px `tab_logo.png` as the high-resolution tab icon.

`app/lib/workspace-routes.ts` holds the rules both the header and the shell
use:

- `WORKSPACE_SECTIONS` is the set of `:section` slugs that render a working
  screen (`power-bi`, `database`, `overview`, `explorer`, `report-lineage`,
  `table-impact`, `measure-impact`, `scanner`). Every other slug is the API
  reference.
- `isApiReferencePath(pathname)` is true for a `/workspace/<slug>` path whose
  slug is not in that set. Workspace is underlined for every other
  `/workspace` path; Documents is underlined on `/setup-guide` and on any API
  reference path, and the current item is marked inside the menu.
- `explorerHref({ workspaceId, reportId?, semanticModelId? })` builds
  `/workspace/explorer?workspace=...&report=...&model=...`, the deep links
  Overview uses.

`app/components/workspace/workspace-sidebar.tsx` is one nav implementation
reused as the desktop sidebar, the tablet icon rail, and the mobile sheet. It
lists a **Setup** group (Power BI "Step 1", Database "Step 2"), a separator,
then Overview, Explorer, Report lineage, Table impact, and Measure impact. It
has no Setup guide, Scanner, or API documentation entry: the Setup guide and
API reference live under the header's Documents menu, and `/workspace/scanner`
still renders the Scanner page for anyone who opens it directly.

## Lazy Feature Boundary

Overview, Explorer, Report Lineage, Table Impact, Measure Impact, and Scanner
are loaded with `React.lazy` and a common Suspense fallback. This keeps AG Grid and XYFlow
out of setup/API-documentation route chunks; ELK is additionally loaded only
when a graph needs layout and runs in a Web Worker. Because React Router's
virtual entry can discover lazy dependencies in later waves, `vite.config.ts`
prebundles the complete runtime bare-import set. This prevents a new optimizer
generation from invalidating modules already requested by the browser during
the first analysis navigation.

## Shared Lineage Boundary

Feature components build a renderer-independent `LineageGraph` from
`lineage-types.ts`. `dependency-graph.ts` computes upstream/downstream DAX
closures; `lineage-layout.ts` places visible nodes with ELK;
`lineage-node.tsx` renders collapsible object nodes; and
`lineage-diagram.tsx` owns visibility state plus React Flow rendering. This
keeps traversal and layout rules consistent across Explorer, Report Lineage,
Table Impact, and Measure Impact.

The two impact pages share one more layer on top of that engine:

- `app/lib/impact-analysis.ts` joins bound-report visual evidence
  (`POST /api/v1/explorer/visual-source-lookup` only) to a DAX closure and
  turns parsed semantic tables into closure seeds and physical sources.
- `app/components/workspace/impact-lineage.tsx` builds the impact chain with
  `buildImpactGraph` (database table and semantic model, semantic table,
  columns, measures, reports, visuals) and renders it with
  `ImpactLineageDiagram`: `LineageDiagram` configured like Explorer's
  Snowflake table lineage, flowing top to bottom.
- `app/components/workspace/impact-ui.tsx` holds their shared tiles, section
  headings, status bands, and loading/empty states.

`closureToLineageGraph` in `dependency-graph.ts` remains the graph builder for
the calculation diagrams in `report-lineage-diagrams.tsx`; the impact pages do
not use it.

## Request Flow

```text
Browser React app
  -> fetch(credentials: "include")
  -> Vite proxy in development OR same-origin IIS rewrite in production
  -> FastAPI /api/v1/* or /openapi.json
  -> Microsoft Graph / Power BI / Fabric and optional Snowflake
  <- JSON and backend-managed HTTP-only session cookie
```

The frontend never calls Microsoft, Fabric, or Snowflake directly. Shared
request helpers normalize the API origin, send cookies, and attach the optional
administrative key only from ephemeral Zustand memory.

## Build And Runtime

- `vite.config.ts`: React Router and Tailwind plugins, `~/*` resolution,
  explicit lazy-route dependency prebundling, and local proxy to
  `127.0.0.1:8000`.
- `app/app.css`: opens with `@import "tailwindcss" source(".")`, so Tailwind
  scans only `app/` (the stylesheet's own folder) for class names. Left to
  automatic detection, it scanned the whole repository, including
  `README.md`, `Docs/*.md`, and `scripts/*.py`. Those files are not modules
  the Vite plugin can hot-update, so saving any of them while `npm run dev`
  ran forced a full page reload. A class name written only outside `app/` is
  therefore not generated.
- `react-router.config.ts`: client-only SPA output.
- `public/web.config`: `/api/*` and `/openapi.json` reverse proxy followed by
  SPA fallback.
- `playwright.config.ts`: local Vite server and browser-test artifacts.
- `.github/workflows/ci.yml`: Node 22 install, typecheck, and build gate.
- `.github/workflows/cd.yml`: release ZIP, Azure OIDC, Blob upload, VM Run
  Command, IIS deployment, and public smoke tests.
- `.azure/scripts/`: VM-managed-identity download, versioned release staging,
  IIS promotion, validation, rollback, release recording, and pruning.

Production serves only `build/client`; `npm run dev` and the optional Node
server are not production hosting mechanisms.
