# State Management and API Layer

## State ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| Backend health | TanStack Query in `AppHeader` | Refetched every 15 seconds. |
| OpenAPI document | TanStack Query in `workspace.tsx` | Current browser query cache, keyed `["openapi", apiOrigin]`. |
| Explorer / Report Lineage data | TanStack Query | Selection-keyed cache, feature-specific stale times (`heavyQueryOptions`: 5 min stale / 30 min gc for Explorer; 10 min for Report Lineage snapshots). |
| API execution result | `useApiExecutor` (local `useState`) | Current workspace route mount. |
| API origin | Zustand (`useAppStore`) | In-memory page lifetime, initialized from `VITE_API_ORIGIN`. |
| Administrative key | Zustand (`useAppStore`) | Ephemeral memory only — no persistence, no visible input. |
| Form inputs | React Hook Form / component state | Current component mount. |
| Power BI / Snowflake session | FastAPI cookie/session | Backend policy controls lifetime, not the frontend. |

## Zustand store (`app/stores/app-store.ts`)

```ts
type AppState = {
  apiOrigin: string;   // normalized backend origin, "" means same-origin
  adminKey: string;    // ephemeral, memory-only
  setApiOrigin: (v: string) => void;
  setAdminKey: (v: string) => void;
};
```

`normalizeApiOrigin` trims trailing slashes and strips a trailing `/api/v1`
suffix if present, so callers can't accidentally double up the API prefix.
Initialized from `import.meta.env.VITE_API_ORIGIN` at store creation. A blank
value means "same origin" (e.g. requests hit `/api/v1/health` directly) —
this is the preferred production deployment model (IIS reverse-proxies
backend routes). Never add `localStorage`/`sessionStorage` persistence to
this store — the admin key must not survive a refresh or leak to disk.

## TanStack Query (`app/lib/query-provider.tsx`)

One `QueryClient` is created for the whole app lifetime and provided from
`root.tsx`. Query keys used elsewhere are ad hoc arrays (e.g.
`["openapi", apiOrigin]`) — there's no centralized query-key factory, so when
adding a new query, follow the existing local convention in the feature file
rather than introducing a new pattern.

## API catalog (`app/lib/api-catalog.ts`, ~460 lines)

This file is the runtime replacement for a generated OpenAPI client. Key
exports:

- **Types**: `OpenApiDocument`, `OpenApiOperation`, `OpenApiSchema`,
  `ApiEndpoint`, `ApiResult`, `HttpMethod` (`get | post | put | patch | delete`).
- **`fetchOpenApi(apiOrigin)`** — fetches `/openapi.json` (proxied or
  same-origin depending on `apiOrigin`).
- **`flattenEndpoints(doc)`** — walks `paths` × methods, producing one
  `ApiEndpoint` per operation, tagged by the operation's first OpenAPI tag,
  including a generated request-body JSON template.
- **Schema template generation** — resolves local
  `#/components/schemas/...` refs, objects, arrays, enums, defaults,
  examples, `allOf`/`oneOf`/`anyOf` into a starter JSON body. Templates are
  starting points only; the operator must still supply tenant-valid IDs.
- **`SETUP_ENDPOINTS` / `SETUP_ENDPOINT_DEFINITIONS`** — hand-written
  fallback definitions for the auth/Snowflake setup operations, merged in by
  `workspace.tsx` for any ID not already present in the live OpenAPI
  document (keeps the setup screens usable even if those operations are
  momentarily missing from `/openapi.json`).
- **`buildEndpointUrl`, `readJsonResponse`** — used by `use-api-executor.ts`
  and directly by `explorer.tsx`/`report-lineage.tsx` for their own fetches.

## API executor (`app/lib/use-api-executor.ts`)

`useApiExecutor(endpoints: ApiEndpoint[])` returns `{ execute, result, error,
isRunning }`. `execute(endpointId, { parameters, body })`:

1. Looks up the endpoint by ID; errors out with a friendly message if the
   catalog doesn't have it (e.g. OpenAPI doc still loading).
2. Builds the URL via `buildEndpointUrl(apiOrigin, endpoint, parameterValues)`.
3. Attaches declared header parameters, plus `X-Lineage-Admin-Key` from the
   Zustand store when non-empty.
4. Sends the body as JSON for non-GET/DELETE operations that declare
   `hasBody` and received an explicit `body`.
5. Always calls with `credentials: "include"`.
6. Normalizes both success and network-failure paths into the same
   `ApiResult` shape (`status`, `ok`, `durationMs`, `body`, `headers`), so UI
   components never need a separate error-rendering path for network errors
   vs. HTTP error statuses.
7. `readResponseError` extracts a human message from FastAPI's typical
   `{ detail: string | ValidationError[] }` shape, joining `msg` fields when
   `detail` is a validation array.

This hook is instantiated **once** in `workspace.tsx` and passed down to
whichever section is active, so all sections share one in-flight
result/error/isRunning state — switching sections while a request is running
will show that request's result on the new section too. Keep this in mind
before adding a new section: if concurrent independent executions are ever
needed, this hook would need to be instantiated per-section instead of
shared.
