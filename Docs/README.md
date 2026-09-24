# Documentation Index

Focused contributor context for the **PBI Lineage Explorer Frontend**, based
on the current source tree. The root [README.md](../README.md) remains the
authoritative setup, deployment, security, troubleshooting, and complete file
handbook.

| File | Contents |
| --- | --- |
| [01-overview.md](01-overview.md) | Purpose, ownership boundary, stack, and prerequisites. |
| [02-architecture.md](02-architecture.md) | Folder layout, routing, lazy boundaries, request flow, build, and Azure runtime. |
| [03-features-and-data-flows.md](03-features-and-data-flows.md) | Setup, Explorer, Report Lineage, Table/Measure Impact, Scanner, API Documentation, and exports. |
| [04-state-and-api-layer.md](04-state-and-api-layer.md) | Zustand/TanStack Query ownership plus OpenAPI, lineage, scanner, dependency, and export utilities. |
| [05-file-reference.md](05-file-reference.md) | Per-file responsibility map for source, tests, CI/CD, and Azure scripts. |
| [06-testing-and-deployment.md](06-testing-and-deployment.md) | Commands, Playwright coverage, production build, Azure release, IIS, and verification. |

## Quick Facts

- Stack: React 19, React Router Framework Mode SPA, Vite 8, strict TypeScript,
  Tailwind CSS 4, and shadcn/Base UI.
- State: TanStack Query for server state; in-memory Zustand for API origin and
  the optional ephemeral administrative key.
- Evidence UI: AG Grid for copyable/exportable tables; React Flow plus ELK
  for directed, draggable, collapsible lineage diagrams.
- Backend: separate sibling FastAPI repository, reached through `/api/v1/*`
  and `/openapi.json` using backend-managed HTTP-only sessions.
- API model: live runtime OpenAPI parsing; Orval is installed but no generated
  client is committed.
- Production: static `build/client` on IIS, deployed to a Windows Azure VM via
  GitHub OIDC, private Blob Storage, VM Run Command, and versioned releases.
- Entry points: `app/routes.ts` maps Home at `/`, the Setup Guide at
  `/setup-guide`, and the operational shell at `/workspace/:section?`.

## Product Summary

The app begins with a high-level Home view, keeps a static administrator/operator
Setup Guide in global and workspace navigation, authenticates Power BI/Fabric,
optionally connects a source system through the current Snowflake connector, explores
workspace/report/model evidence, maps semantic objects to physical sources,
renders report/column/calculation lineage, analyzes table and measure impact,
runs explicit Power BI Admin metadata scans, provides copy/CSV/Excel output,
and executes the backend's OpenAPI operations. Provider credentials and tokens
are never stored by the frontend.

Before relying on this documentation from a fresh clone, confirm all required
source and Docs files are committed with `git status --short`; local builds can
see untracked files that CI and another computer cannot.
