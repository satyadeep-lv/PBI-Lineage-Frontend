# File Reference

## Root configuration

| File | Purpose |
| --- | --- |
| `package.json` | Runtime/dev dependencies; `dev`, `build`, `start`, `typecheck` scripts. |
| `package-lock.json` | Locked dependency graph for reproducible `npm ci`. |
| `vite.config.ts` | React Router + Tailwind plugins, `~/*` alias, heavy-dep prebundling, dev proxy to `127.0.0.1:8000`. |
| `react-router.config.ts` | `ssr: false` — SPA build for IIS static hosting. |
| `tsconfig.json` | Strict TS, browser/ES2022 libs, bundler resolution, `~/*` alias. |
| `components.json` | shadcn style/aliases/Tailwind entry/Base UI/Lucide config. |
| `playwright.config.ts` | Test dir, localhost dev-server reuse, timeouts, traces, failure screenshots. |
| `Dockerfile` | Optional Node 24 multi-stage build/server image for non-IIS validation; not the production target. |
| `.dockerignore` / `.gitignore` | Exclude deps, generated build artifacts, `.env`, `REF_DOC/`, `PROJECT_CONTEXT.md`. |
| `public/favicon.ico` | Copied unchanged into `build/client`. |

## Application bootstrap and routes

| File | Purpose |
| --- | --- |
| `app/routes.ts` | Declares the index route and `workspace/:section?` route. |
| `app/root.tsx` | HTML shell, global CSS import, `QueryProvider`, route outlet, scroll restoration, `ErrorBoundary`. |
| `app/app.css` | Tailwind + shadcn + animation + Geist font imports; light/dark tokens, radii, global min-width. |
| `app/routes/home.tsx` | Product overview, value summary, workflow, setup entry point. |
| `app/routes/workspace.tsx` | Shared workspace shell: OpenAPI query, endpoint catalog, shared API executor, sidebar/mobile nav, lazy Explorer/Report Lineage. See [02-architecture.md](02-architecture.md). |

## Shared application components

| File | Purpose |
| --- | --- |
| `app/components/app-header.tsx` | Product identity + TanStack Query backend-health badge (refetches every 15s). |
| `app/components/app-footer.tsx` | Mandatory "Developed by Satyadeep Singh" attribution + copyright year on every page. |

## Workspace feature components

| File | Purpose |
| --- | --- |
| `app/components/workspace/workspace-sidebar.tsx` | Setup / exploration / report-lineage / API-doc navigation for desktop and mobile shells. |
| `app/components/workspace/power-bi-setup.tsx` | Device-code / service-principal setup, provider readiness, secret clearing, cache invalidation on success. |
| `app/components/workspace/database-setup.tsx` | Snowflake connect/status/logout without exposing raw setup JSON. |
| `app/components/workspace/explorer.tsx` | Workspace-scoped exploration: assets, report detail, semantic objects, mappings, diagrams. ~920 lines — the largest component. |
| `app/components/workspace/report-lineage.tsx` | Cross-workspace report discovery, composite-model resolution, snapshot preparation, evidence tabs/tables. |
| `app/components/workspace/report-lineage-diagrams.tsx` | Report/database, column, measure, and calculated-column React Flow graphs with depth controls and evidence copy. |
| `app/components/workspace/api-documentation.tsx` | Groups/searches OpenAPI operations, expands the selected operation into the execution workbench. |
| `app/components/workspace/api-execution-panel.tsx` | Parameter/body inputs, JSON validation, execution via `useApiExecutor`, sensitive-value clearing, copyable output. |
| `app/components/workspace/api-domain-canvas.tsx` | **Retained, unused.** Alternate full-domain operation selector/executor — not routed. |
| `app/components/workspace/api-output-panel.tsx` | **Retained, unused.** Response renderer for `api-domain-canvas.tsx` only. |

## Lib, state, and API layer

See [04-state-and-api-layer.md](04-state-and-api-layer.md) for behavior.

| File | Purpose |
| --- | --- |
| `app/lib/api-catalog.ts` | OpenAPI/endpoint types, request templates, schema example generation, endpoint flattening, URL construction, response parsing, formatting helpers. |
| `app/lib/use-api-executor.ts` | Executes a catalog endpoint with cookies, optional admin key, JSON body, timing, normalized results. |
| `app/lib/query-provider.tsx` | Single app-lifetime `QueryClient` with default retry/stale-time/focus-refetch behavior. |
| `app/lib/utils.ts` | `cn()` class-name composition (clsx + tailwind-merge) shared by shadcn and custom components. |
| `app/stores/app-store.ts` | Zustand store: normalized `apiOrigin`, ephemeral `adminKey`. |

## UI primitives (`app/components/ui/`)

Local shadcn/Base UI building blocks — keep feature/application behavior out
of these files; they should stay pure presentation + accessibility wiring.

`badge.tsx`, `button.tsx`, `card.tsx`, `checkbox.tsx`, `command.tsx`
(cmdk-based), `dialog.tsx`, `dropdown-menu.tsx`, `input-group.tsx`,
`input.tsx`, `label.tsx`, `select.tsx` (Base UI), `separator.tsx`,
`sheet.tsx` (mobile nav drawer), `skeleton.tsx`, `sonner.tsx` (toast host),
`switch.tsx`, `table.tsx`, `tabs.tsx`, `textarea.tsx` (JSON editors),
`toast.tsx`, `tooltip.tsx`.

## Tests, local context, and retained scaffold files

| File | Purpose |
| --- | --- |
| `tests/report-lineage.spec.ts` | Mocks backend contracts; verifies evidence tabs, exports, report/column/calculation graphs, desktop layout, mobile containment. |
| `tests/api-documentation.spec.ts` | Mocks OpenAPI/backend operations; verifies GET/POST execution, JSON validation, response metadata, output copying. |
| `REF_DOC/PROJECT_CONTEXT.md` | Local continuity doc (frontend contracts/constraints); gitignored, not in this repo's history. |
| `app/welcome/welcome.tsx`, `logo-light.svg`, `logo-dark.svg` | Unused React Router starter scaffold; no current route imports them. |

## Local agent reference files

| File | Purpose |
| --- | --- |
| `.agents/skills/react-router/SKILL.md` | Local coding-agent instructions for React Router work (tooling guidance, not runtime code). |
| `.agents/skills/react-router/references/{framework-mode,data-mode,declarative-mode,rsc}.md` | Per-mode React Router conventions for agents. |

## Known dead/retained code

Don't delete without a deliberate cleanup decision, but don't build new
features on top of these either without checking they're still intended to
stay:

- `app/components/workspace/api-domain-canvas.tsx`
- `app/components/workspace/api-output-panel.tsx`
- `app/welcome/*`
