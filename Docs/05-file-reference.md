# File Reference

This page lists maintained source and operational files. Generated
`node_modules/`, `.react-router/`, `build/`, `test-results/`, and
`playwright-report/` content is intentionally excluded.

## Root Configuration And Documentation

| File | Purpose |
| --- | --- |
| `README.md` | Authoritative setup, feature, architecture, source-control, deployment, and troubleshooting handbook. |
| `Docs/README.md` | Index for this focused contributor documentation set. |
| `package.json` / `package-lock.json` | Runtime and development dependencies, scripts, and reproducible npm graph. |
| `vite.config.ts` | React Router/Tailwind plugins, path aliases, heavy dependency prebundling, and local FastAPI proxy. |
| `react-router.config.ts` | Selects the client-only SPA build with `ssr: false`. |
| `tsconfig.json` | Strict TypeScript, ES2022/browser libraries, bundler resolution, and `~/*` alias. |
| `components.json` | shadcn/Base UI aliases, style, CSS entry, and Lucide configuration. |
| `playwright.config.ts` | Browser-test directory, localhost web server, timeouts, traces, and screenshots. |
| `Dockerfile` / `.dockerignore` | Optional Node-hosted validation image; not the production IIS path. |
| `.gitignore` | Excludes dependencies, generated builds/tests, `.env`, and local context files. |
| `public/favicon.ico` | Browser icon copied into the production artifact. |
| `public/product-lineage-view.png` | Tested Report Lineage workspace capture shown on Home. |
| `public/web.config` | IIS API/OpenAPI reverse proxy and SPA route fallback, copied into `build/client`. |

## Bootstrap And Routes

| File | Purpose |
| --- | --- |
| `app/routes.ts` | Declares the Home index, `/setup-guide`, and `/workspace/:section?`. |
| `app/root.tsx` | HTML shell, global CSS, QueryProvider, route outlet, scripts, scroll restoration, and error boundary. |
| `app/app.css` | Tailwind/shadcn/font imports, design tokens, and global layout rules. |
| `app/routes/setup-guide.tsx` | Route metadata and shared shell for the static setup handbook. |
| `app/routes/home.tsx` | `/` database-neutral overview, product preview, evidence path, and single Start action. |
| `app/routes/workspace.tsx` | Shared shell, OpenAPI catalog/executor, sidebar/mobile navigation, and lazy feature routing. |

## Shared Application Components

| File | Purpose |
| --- | --- |
| `app/components/app-header.tsx` | Product identity, active desktop/mobile navigation, and optional backend health query/badge. |
| `app/components/app-footer.tsx` | Shared links, developer attribution, and current-year copyright on every page. |
| `app/components/setup-guide/setup-guide.tsx` | Static Microsoft/Fabric/Scanner/XMLA/Snowflake/backend handbook, workflow handoff, troubleshooting, and references. |

## Workspace Features

| File | Purpose |
| --- | --- |
| `app/components/workspace/workspace-sidebar.tsx` | Setup, Explorer, report lineage, impact, scanner, and API documentation navigation. |
| `app/components/workspace/power-bi-setup.tsx` | Device-code/service-principal setup, readiness display, secret clearing, and cache invalidation. |
| `app/components/workspace/database-setup.tsx` | Snowflake connect/status/logout with guided status instead of raw JSON. |
| `app/components/workspace/auth-required.tsx` | Shared Power BI authentication-required state and setup link. |
| `app/components/workspace/explorer.tsx` | Workspace report/model investigation, semantic/source evidence, scanner enrichment, grids, exports, and focused lineage. |
| `app/components/workspace/report-lineage.tsx` | Estate-wide report selection, snapshot queries, and report evidence tabs/grids. |
| `app/components/workspace/report-lineage-diagrams.tsx` | Report/database, column, measure, and calculated-column graph builders and controls. |
| `app/components/workspace/table-impact.tsx` | Scoped table/column impact traversal with report/visual evidence, graph, and grid. |
| `app/components/workspace/measure-impact.tsx` | Bidirectional measure dependency traversal with report/visual evidence, graph, and grid. |
| `app/components/workspace/scanner.tsx` | Explicit 1-100 workspace Power BI Admin scan and five-tab result browser. |
| `app/components/workspace/impact-picker.tsx` | Reusable workspace multi-select and searchable object picker. |
| `app/components/workspace/impact-grid.tsx` | Reusable copyable/exportable AG Grid for impact and scanner evidence. |
| `app/components/workspace/api-documentation.tsx` | OpenAPI grouping/search and operation selection. |
| `app/components/workspace/api-execution-panel.tsx` | Parameter/body validation, endpoint execution, secret clearing, and response output. |

## Shared Lineage Engine

| File | Purpose |
| --- | --- |
| `app/components/workspace/lineage/lineage-types.ts` | Shared graph, node, edge, and React Flow node-data contracts. |
| `app/components/workspace/lineage/lineage-layout.ts` | Lazy, worker-backed ELK layered layout, fallback positioning, and dynamic node-height estimation. |
| `app/components/workspace/lineage/lineage-node.tsx` | Tone-coded custom node with collapse/expand control and hidden count. |
| `app/components/workspace/lineage/lineage-diagram.tsx` | Visible subgraph derivation, collapse state, draggable React Flow rendering, viewport/reset controls, large-graph culling, and arrowheads. |

## API, Query, State, And Export Utilities

| File | Purpose |
| --- | --- |
| `app/lib/api-catalog.ts` | Runtime OpenAPI types/parsing, setup fallbacks, schema body templates, URL construction, and response helpers. |
| `app/lib/use-api-executor.ts` | Shared cookie-aware endpoint execution, optional ephemeral admin header, timing, and normalized errors. |
| `app/lib/query-provider.tsx` | Application-lifetime TanStack Query client. |
| `app/lib/dependency-graph.ts` | Multi-source upstream/downstream DAX closure and conversion to the shared lineage graph. |
| `app/lib/lineage-api.ts` | Shared authenticated request helper, query keys, report batching, and scoped semantic inventory loading. |
| `app/lib/scanner-api.ts` | Scanner endpoint functions, safe defaults, and defensive Microsoft scan-result types. |
| `app/lib/use-workspace-scan.ts` | Submit, four-second status polling, terminal-state handling, and one-time result query. |
| `app/lib/grid-export.ts` | Parent-context enrichment, clipboard TSV, CSV, and Excel-compatible exports. |
| `app/lib/utils.ts` | `cn()` class composition helper. |
| `app/stores/app-store.ts` | Normalized API origin and non-persisted administrative key. |

## UI Primitives

Only primitives imported by a current route dependency are retained:

`badge.tsx`, `button.tsx`, `checkbox.tsx`, `command.tsx`, `dialog.tsx`,
`input-group.tsx`, `input.tsx`, `label.tsx`, `select.tsx`, `separator.tsx`,
`sheet.tsx`, and `textarea.tsx`.

## Browser Tests

| File | Purpose |
| --- | --- |
| `tests/api-documentation.spec.ts` | API GET/POST execution, JSON validation, result metadata, secret clearing, and mobile containment. |
| `tests/home.spec.ts` | Home content, one-action contract, database-neutral copy, product image, navigation, and desktop/mobile containment. |
| `tests/report-lineage.spec.ts` | Report evidence tabs/exports and report, column, and calculation graphs on desktop/mobile. |
| `tests/impact-analysis.spec.ts` | Workspace scope, searchable table/measure selection, directed/collapsible impact graphs, grids, and degraded evidence. |
| `tests/scanner.spec.ts` | Scanner submit/poll/result behavior plus dedicated scanner tabs and Explorer enrichment. |
| `tests/setup-guide.spec.ts` | `/setup-guide` routing, content/references, Home/workspace navigation, page errors, screenshots, and mobile containment. |
| `REF_DOC/PROJECT_CONTEXT.md` | Local continuity and implementation constraints; ignored by Git unless repository policy changes. |

## CI/CD And Azure Scripts

| File | Purpose |
| --- | --- |
| `.github/workflows/ci.yml` | Main/pull-request dependency install, typecheck, and production build. |
| `.github/workflows/cd.yml` | Main production artifact build, Azure OIDC upload, VM Run Command deployment, and public smoke tests. |
| `.github/workflows/azure-oidc-test.yml` | Manual federated-identity/resource-group diagnostic. |
| `.github/workflows/storage-upload-test.yml` | Manual build and Blob Storage upload diagnostic. |
| `.azure/scripts/download-frontend-artifact.ps1` | VM-managed-identity Blob download and validation. |
| `.azure/scripts/deploy-frontend.ps1` | Versioned IIS staging, atomic promotion, validation, rollback, release record, and retention cleanup. |

## Local Agent References

`.agents/skills/react-router/` contains coding-agent guidance for React Router
Framework, Data, Declarative, and RSC modes. It is development context, not
runtime application code.
