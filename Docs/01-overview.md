# Overview

## Purpose

Browser application for exploring Power BI assets, semantic models, DAX
dependencies, physical database evidence, report visuals, and downstream
lineage. It is a standalone source-control project (this repo) that talks
over HTTP to a separate FastAPI backend (`PBI-Lineage-Backend`, sibling repo),
and is built for static hosting in IIS.

The frontend turns the backend's API surface into guided operational views:

- Present a static setup guide for Entra registration, Power BI/Fabric tenant
  access, Scanner metadata, source-system authentication, backend environment
  policy, and verification from global and workspace navigation.
- Authenticate Power BI and Fabric via Microsoft device code or service
  principal.
- Create and inspect an optional source-system session through the current
  Snowflake connector.
- Browse Power BI workspaces, reports, and semantic models by name.
- Inspect report pages, semantic objects, DAX, source paths, and XMLA
  evidence.
- Map physical database columns to semantic columns and calculations.
- Trace report, Snowflake table/column, measure, and calculated-column lineage
  by depth through shared ELK/React Flow diagrams.
- Analyze table/column impact and measure impact across a selected workspace
  scope, including downstream/upstream calculations and report/visual usage.
- Run the explicit Power BI Admin scanner for one to 100 workspaces and browse
  dashboards, semantic metadata, dependencies, M expressions, and datasource
  instances.
- Copy individual table values or full tables (AG Grid) for analysis.
- Download table data as CSV or Excel-compatible `.xls` with parent
  workspace/report/semantic-model context baked in.
- Browse and execute every FastAPI OpenAPI operation from an in-app API
  documentation/execution workbench.

## Ownership boundary

The frontend does not own Power BI, Fabric, or database-provider credentials.
It forwards them to FastAPI when required (setup forms only) and relies on
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
| Components | shadcn/ui on Base UI (`@base-ui/react`) | Accessible buttons, inputs, dialogs, sheets, search commands, and selects. |
| Icons | Lucide React | Interface icons. |
| Server state | TanStack Query v5 | API caching, loading/error states, invalidation. |
| UI state | Zustand | API origin + ephemeral admin-key state (`app/stores/app-store.ts`). |
| Graphs | XYFlow / React Flow plus `elkjs` | Worker-laid-out, directed, draggable, collapsible report and impact diagrams. |
| Tables | AG Grid Community | Sortable/filterable analysis tables, cell/table copy. |
| Forms | React Hook Form + Zod | Setup form state and validation. |
| API catalog | Runtime OpenAPI parser (`app/lib/api-catalog.ts`) | Discovers and groups live FastAPI operations — no generated client. |
| API generation | Orval (installed, unused) | Available for a future generated client; nothing generated is committed. |
| Unit tests | Vitest + React Testing Library (installed, unused) | Dependencies ready; no unit suites committed yet. |
| E2E | Playwright | Home, Setup Guide, API workbench, report-lineage, impact-analysis, and scanner coverage. |
| Production frontend | IIS static site on Windows Azure VM | Versioned releases, SPA fallback, and API reverse proxy. |
| Production backend | Windows Docker deployment on the same VM | FastAPI built and operated independently behind IIS. |

## Prerequisites

- Windows machine with the backend reachable at `http://127.0.0.1:8000` for
  local dev.
- Node.js + npm on `PATH` (last validated with Node `v24.19.0` / npm `11.17.0`).
- Power BI/Fabric app registration and permissions expected by the backend.
- Optional database connection details for the currently implemented
  Snowflake connector.
- Playwright browser binaries for browser tests (`npx playwright install chromium`).

See the root [README.md](../README.md) for full install/run instructions,
environment variables, and troubleshooting — this doc set focuses on
architecture and behavior rather than step-by-step operational commands.
