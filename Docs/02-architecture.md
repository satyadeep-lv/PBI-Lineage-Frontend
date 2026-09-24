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
|   |   |-- workspace/             Setup, Explorer, lineage, impact, scanner, API docs
|   |   |-- app-header.tsx         Product identity, navigation, optional health
|   |   `-- app-footer.tsx         Navigation, attribution, and copyright
|   |-- lib/                       OpenAPI, requests, queries, lineage, scanner, exports
|   |-- routes/                    Home, Setup Guide, and shared workspace shell
|   |-- stores/app-store.ts        API origin and ephemeral admin key
|   |-- app.css                    Tailwind, font, theme tokens, global rules
|   |-- root.tsx                   HTML shell, query provider, error boundary
|   `-- routes.ts                  React Router Framework Mode route table
|-- public/                        Product image, favicon, and IIS config copied into build/client
|-- tests/                         Playwright Home, setup, API, report, impact, and scanner specs
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
- Desktop sidebar and mobile Sheet navigation.
- Lazy imports for the heavy data/graph views.
- API documentation fallback for unknown section slugs.

| Route | Section | View |
| --- | --- | --- |
| `/` | none | Product overview |
| `/setup-guide` | none | Static Setup Guide |
| `/workspace`, `/workspace/power-bi` | `power-bi` | Power BI setup |
| `/workspace/database` | `database` | Snowflake setup |
| `/workspace/explorer` | `explorer` | Workspace-scoped Explorer |
| `/workspace/report-lineage` | `report-lineage` | Estate-wide report lineage |
| `/workspace/table-impact` | `table-impact` | Scoped table or column impact |
| `/workspace/measure-impact` | `measure-impact` | Bidirectional measure impact |
| `/workspace/scanner` | `scanner` | Power BI Admin metadata scanner |
| `/workspace/api-docs` | `api-docs` | Full API documentation/execution |
| `/workspace/<tag-slug>` | other | API docs prefiltered to one OpenAPI tag |

Unknown top-level routes reach `root.tsx`'s error boundary in development.
Because `react-router.config.ts` sets `ssr: false`, IIS must rewrite unknown
non-file/non-directory routes to `/index.html`.

## Lazy Feature Boundary

Explorer, Report Lineage, Table Impact, Measure Impact, and Scanner are loaded
with `React.lazy` and a common Suspense fallback. This keeps AG Grid and XYFlow
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
