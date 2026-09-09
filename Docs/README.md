# Documentation Index

Context documentation for the **PBI Lineage Explorer Frontend** — generated from
the current source tree so it stays accurate for future contributors and
coding agents. This folder summarizes and organizes what the project actually
does; the root [README.md](../README.md) remains the authoritative,
exhaustive setup/deployment/troubleshooting handbook and should be checked for
anything not covered here.

| File | Contents |
| --- | --- |
| [01-overview.md](01-overview.md) | What the app is, who it talks to, technology stack. |
| [02-architecture.md](02-architecture.md) | Folder layout, route structure, request flow, build/tooling config. |
| [03-features-and-data-flows.md](03-features-and-data-flows.md) | Power BI/Snowflake setup, Explorer, Report Lineage, API Documentation — what each screen does and which backend endpoints it drives. |
| [04-state-and-api-layer.md](04-state-and-api-layer.md) | Zustand store, TanStack Query usage, the OpenAPI-driven API catalog/executor. |
| [05-file-reference.md](05-file-reference.md) | Per-file responsibility table for `app/`, `tests/`, and root config. |
| [06-testing-and-deployment.md](06-testing-and-deployment.md) | Commands, Playwright coverage, build/IIS deployment notes. |

## Quick facts

- **Stack**: React 19 + React Router 8 (Framework Mode, SPA/`ssr: false`) + Vite 8 + TypeScript (strict) + Tailwind CSS 4 + shadcn/ui (Base UI primitives).
- **Server state**: TanStack Query v5. **UI state**: Zustand (`app/stores/app-store.ts`).
- **Data viz**: AG Grid Community (tables), XYFlow/React Flow (lineage diagrams).
- **Backend**: A separate FastAPI service (sibling repo `PBI-Lineage-Backend`), reached via `/api/v1/*`, `/openapi.json`, `/docs`. The frontend proxies these in dev (`vite.config.ts`) and expects same-origin IIS proxying in production.
- **No generated API client**: the app reads `/openapi.json` at runtime (`app/lib/api-catalog.ts`) and builds its own typed endpoint catalog — there is no committed Orval-generated client even though Orval is installed.
- **Entry points**: `app/routes.ts` → `routes/home.tsx` (`/`) and `routes/workspace.tsx` (`/workspace/:section?`).

## What this project does (one paragraph)

The app is an operational UI for exploring Power BI/Fabric lineage: it drives
Microsoft device-code or service-principal authentication, optional Snowflake
enrichment, browses workspaces/reports/semantic models, inspects DAX and XMLA
evidence, maps physical database columns to semantic objects, renders
report/column/measure lineage diagrams, supports table copy/CSV/Excel export,
and exposes a full interactive OpenAPI browser/executor for the backend. It
owns no provider credentials itself — everything is sent to FastAPI, which
manages sessions via HTTP-only cookies.
