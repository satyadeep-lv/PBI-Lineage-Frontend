# State Management And API Layer

## State Ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| Backend health | TanStack Query in `AppHeader` | Refetched every 15 seconds. |
| OpenAPI document | TanStack Query in `workspace.tsx` | Browser query cache keyed by API origin. |
| Explorer/Report/Impact data | TanStack Query | Selection or workspace-scope cache with feature-specific stale times. |
| Scanner ID/status/result | `useWorkspaceScan` plus TanStack Query | Current component/scope; polling ends at a terminal status. |
| API execution result | `useApiExecutor` local state | Current workspace route mount. |
| API origin | Zustand | In-memory page lifetime, initialized from `VITE_API_ORIGIN`. |
| Administrative key | Zustand | Ephemeral memory only; no persistence or visible field. |
| Diagram collapse state | `LineageDiagram` local state | Current graph; resets when graph identity changes. |
| Form input | React Hook Form or component state | Current component mount. |
| Power BI/Snowflake session | FastAPI cookie/session | Backend-controlled lifetime. |

## Zustand Store

`app/stores/app-store.ts` owns only `apiOrigin`, `adminKey`, and their setters.
`normalizeApiOrigin` trims whitespace/trailing slashes and removes an accidental
trailing `/api/v1`. Blank means same-origin and is preferred for IIS. Never add
browser persistence: the administrative key must not survive a refresh or be
written to disk.

## TanStack Query

`app/lib/query-provider.tsx` creates one `QueryClient` for the application.
Feature-local queries use descriptive array keys. Shared semantic and estate
evidence uses `parsedSemanticModelKey`, `daxAnalysisKey`, and
`estateDiscoveryKey` from `lineage-api.ts`, allowing compatible requests from
Explorer, Report Lineage, Table Impact, and Measure Impact to reuse cache.

Authentication success invalidates identity-dependent queries. Logout removes
them so one identity's tenant metadata is not displayed after another identity
connects.

## Runtime API Catalog

`app/lib/api-catalog.ts` is the runtime OpenAPI adapter. It defines API types,
loads `/openapi.json`, flattens each operation, groups by the first tag, builds
parameter definitions, and generates editable JSON templates from examples,
defaults, enums, arrays, objects, local `$ref`, `allOf`, `oneOf`, and `anyOf`.

`SETUP_ENDPOINTS` and `SETUP_ENDPOINT_DEFINITIONS` are deliberate local
fallbacks for Power BI and Snowflake setup. A temporary OpenAPI failure must
not make those guided setup controls disappear.

## API Executor

`app/lib/use-api-executor.ts` returns `execute`, `result`, `error`, and
`isRunning`. It resolves path/query/header values, sends JSON where declared,
uses `credentials: "include"`, attaches an administrative key only from
ephemeral memory, captures status/duration/headers/body, and normalizes FastAPI
validation/network errors. The workspace route owns one executor used by setup
and API-documentation views.

The API documentation panel hides cookie parameters and
`X-Lineage-Admin-Key`, validates required input and JSON, and clears JSON fields
whose names indicate secrets immediately after execution.

## Shared Lineage Requests

`app/lib/lineage-api.ts` provides `requestJson` for lineage, Explorer evidence,
impact, and scanner calls. It also implements:

- Stable shared query-key factories.
- `boundReportsForModel` for estate-wide report bindings.
- Generic chunking and concurrency-limited mapping.
- `fetchBatchedExplorer`, respecting 50 reports per request and the frontend's
  current 300-report evidence cap.
- `fetchEstateInventory`, which lists and parses models across a selected
  workspace scope while recording inaccessible models instead of rejecting the
  entire inventory.

## Dependency Traversal

`app/lib/dependency-graph.ts` performs multi-source breadth-first traversal over
the flat DAX dependency response. `computeDependencyClosure` supports upstream,
downstream, and bidirectional analysis with depth/directness/reference evidence;
`closureToLineageGraph` converts the closure to the renderer-independent graph
used by Dagre and React Flow.

## Scanner API

`app/lib/scanner-api.ts` contains safe scanner defaults, request functions, and
defensive optional types for Microsoft's raw scan result. The frontend always
forces `get_artifact_users: false`.

`app/lib/use-workspace-scan.ts` submits 1-100 workspace IDs, polls status every
four seconds, stops at `Succeeded` or `Failed`, and enables one immutable result
fetch only after success. Scanner activity is never automatic.

## Copy And Export

`app/lib/grid-export.ts` enriches rows with parent context, preserves complete
cell values such as DAX, creates tab-separated clipboard text, and generates
CSV/Excel-compatible downloads. `ImpactGrid` applies those helpers to impact
and scanner views; Explorer and Report Lineage provide equivalent copy/export
behavior in their local grids.

## Request Invariants

- The frontend talks only to FastAPI, never directly to provider APIs.
- Every authenticated request uses backend HTTP-only cookies.
- IDs are API context; selectors lead with human-readable names.
- A report's model can belong to another workspace.
- Provider/permission failure produces an honest degraded state; the UI does
  not invent dashboard, app, XMLA, scanner, or physical-source evidence.
- Administrative credentials and provider secrets are never persisted.
