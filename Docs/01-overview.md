# Overview

## Purpose

Browser application for exploring Power BI assets, semantic models, DAX
dependencies, physical database evidence, report visuals, and downstream
lineage. It is a standalone source-control project (this repo) that talks
over HTTP to a separate FastAPI backend (`PBI-Lineage-Backend`, sibling repo),
and is built for static hosting in IIS.

The frontend turns the backend's API surface into guided operational views:

- Authenticate Power BI and Fabric via Microsoft device code or service
  principal.
- Create and inspect an optional Snowflake session.
- Browse Power BI workspaces, reports, and semantic models by name.
- Inspect report pages, semantic objects, DAX, source paths, and XMLA
  evidence.
- Map physical database columns to semantic columns and calculations.
- Trace report, column, measure, and calculated-column lineage by depth
  (React Flow diagrams).
- Copy individual table values or full tables (AG Grid) for analysis.
- Download table data as CSV or Excel-compatible `.xls` with parent
  workspace/report/semantic-model context baked in.
- Browse and execute every FastAPI OpenAPI operation from an in-app API
  documentation/execution workbench.

## Ownership boundary

The frontend does not own Power BI, Fabric, or Snowflake credentials. It
forwards them to FastAPI when required (setup forms only) and relies on
backend-managed HTTP-only session cookies (`credentials: "include"`) for
every subsequent request. There is no client-side token storage.

## Repository boundary

Keep this repo and the backend as sibling directories / independent Git
repos — never nest one inside the other, and never copy backend runtime
files, Python environments, secrets, or Docker volumes into this project.
The two communicate only over HTTP.

## Technology stack

| Area | Implementation | Responsibility |
| --- | --- | --- |
| Language | TypeScript (strict) | Application and API integration types. |
| UI | React 19 | Component rendering and local interaction state. |
| Framework | React Router 8, Framework Mode, SPA (`ssr: false`) | Route definitions, build, metadata, error boundary. |
| Build | Vite 8 | Dev server, dependency prebundling, dev proxy, production bundling. |
| Styling | Tailwind CSS 4 | Utility styling and design tokens (`app/app.css`). |
| Components | shadcn/ui on Base UI (`@base-ui/react`) | Accessible buttons, inputs, dialogs, sheets, tabs, selects, etc. (`app/components/ui/`). |
| Icons | Lucide React | Interface icons. |
| Server state | TanStack Query v5 | API caching, loading/error states, invalidation. |
| UI state | Zustand | API origin + ephemeral admin-key state (`app/stores/app-store.ts`). |
| Graphs | XYFlow / React Flow (`@xyflow/react`) | Report/column/measure/calculated-object lineage diagrams. |
| Tables | AG Grid Community | Sortable/filterable analysis tables, cell/table copy. |
| Forms | React Hook Form + Zod | Setup form state and validation. |
| API catalog | Runtime OpenAPI parser (`app/lib/api-catalog.ts`) | Discovers and groups live FastAPI operations — no generated client. |
| API generation | Orval (installed, unused) | Available for a future generated client; nothing generated is committed. |
| Unit tests | Vitest + React Testing Library (installed, unused) | Dependencies ready; no unit suites committed yet. |
| E2E | Playwright | Desktop/mobile coverage for report-lineage and API-execution flows (`tests/`). |
| Production frontend | IIS static site | Serves `build/client`, SPA fallback + API reverse-proxy via URL Rewrite/ARR. |
| Production backend | Existing Windows Docker deployment | FastAPI built/operated independently. |

## Prerequisites

- Windows machine with the backend reachable at `http://127.0.0.1:8000` for
  local dev.
- Node.js + npm on `PATH` (last validated with Node `v24.19.0` / npm `11.17.0`).
- Power BI/Fabric app registration and permissions expected by the backend.
- Optional Snowflake connection details.
- Playwright browser binaries for browser tests (`npx playwright install chromium`).

See the root [README.md](../README.md) for full install/run instructions,
environment variables, and troubleshooting — this doc set focuses on
architecture and behavior rather than step-by-step operational commands.
