# Testing and Deployment

## Commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install exact locked dependencies. |
| `npm run dev` | Start React Router/Vite dev server (`localhost:5173`). |
| `npm run typecheck` | `react-router typegen && tsc` — generate route types, run strict TS checks. |
| `npm run build` | Produce SPA client + React Router server artifacts (`build/`). |
| `npm run start` | Serve `build/server/index.js` — optional Node-hosted validation only, **not** the target IIS deployment. |
| `npx playwright test` | Run all Playwright browser tests. |
| `npx playwright test tests/report-lineage.spec.ts` | Report-lineage desktop/mobile coverage only. |

Local dev requires the FastAPI backend running first and reachable at
`http://127.0.0.1:8000` (verify `http://127.0.0.1:8000/docs`). Use
`localhost:5173`, not `127.0.0.1:5173` — React Router's dev-time dynamic
imports are generated for `localhost` and mismatched hosts can break
optimizer reloads. Don't run `npm run build` while the same dev server is
active; it writes into `build/`, which can trigger unwanted file-watcher
reloads — stop dev, build, then restart dev.

## Testing

`tests/` holds two Playwright specs that mock backend contracts (no live
tenant needed for contract-driven UI coverage):

- `report-lineage.spec.ts` — evidence tabs, exports, report/column/
  calculation graphs, desktop layout, mobile containment.
- `api-documentation.spec.ts` — GET/POST execution, JSON validation,
  response metadata, output copying.

Use a real tenant-authenticated session for final provider acceptance —
mocked tests can't prove actual Microsoft/Fabric permissions or tenant data
quality. Generated artifacts land in gitignored `test-results/` and
`playwright-report/`.

Vitest and React Testing Library are installed but **no unit/component
suites are committed yet** — if adding them, this is greenfield, not an
existing convention to match.

Static checks before shipping:

```powershell
npm run typecheck
npm run build
```

## Production build and IIS deployment

```powershell
npm ci
npm run typecheck
npm run build
```

Deploy `build/client` to the IIS site root. Do **not** deploy source,
`node_modules`, `.env`, tests, Playwright output, or the React Router server
bundle — IIS serves the static SPA only.

Recommended IIS setup: Static Content, URL Rewrite module, Application
Request Routing (ARR) with proxy enabled. Application pool: *No Managed
Code*. HTTPS binding in production. Backend container published only to
loopback/internal interface — never expose FastAPI's port 8000 publicly.

Example `web.config` (place in the deployed `build/client` directory) — see
the root [README.md](../README.md#iis-setup) for the full example, which
rewrites `^(api/.*|openapi\.json)$` to the backend and falls back
non-file/non-directory requests to `/index.html` for the SPA.

Keep `/docs` (Swagger UI) private unless there's an explicit operational
need — the in-app documentation view reads `/openapi.json` directly and
doesn't require the Swagger page.

## Deployment verification checklist

1. `/` loads without a Node process.
2. `/workspace/report-lineage` loads directly after a hard refresh (SPA
   fallback working).
3. `/api/v1/health` returns through IIS.
4. `/openapi.json` returns through IIS.
5. Power BI login sets and reuses the backend session cookie.
6. API documentation can execute a harmless GET (health/status).
7. CSV/Excel downloads work in the browser.
8. Footer shows "Developed by Satyadeep Singh" and the current copyright
   year.

## Environment configuration

Preferred deployment is same-origin: IIS serves the frontend and proxies
backend routes, so no frontend environment variable is required. Optional
`.env`:

```dotenv
VITE_API_ORIGIN=
```

- Blank → same-origin requests (e.g. `/api/v1/health`).
- Dev proxies `/api`, `/openapi.json`, `/docs` to `http://127.0.0.1:8000`.
- A non-empty value must be the backend origin *without* `/api/v1`; the
  Zustand store normalizes trailing slashes and a trailing `/api/v1` suffix.
- Cross-origin production requires matching backend CORS and cookie
  `SameSite`/`Secure` config — same-origin proxying is strongly preferred.

**Never** put tenant secrets, client secrets, Snowflake passwords, access
tokens, session IDs, or API keys in `.env`, source files, route state, or
Git.

## Common troubleshooting pointers

Full detail is in the root [README.md](../README.md#troubleshooting):
`npm`/`node` not recognized, PowerShell blocking `npm.ps1` (use `npm.cmd`),
Vite stuck "bundling dependencies", Explorer stuck on "Loading Explorer"
(check AG Grid/XYFlow in `optimizeDeps.include`, run `npm run typecheck`),
backend badge offline (check Vite proxy / Docker port / firewall), 401/403 on
API execution (complete Power BI/Snowflake setup first), partial report
definition/semantic tabs (listing permission ≠ PBIR/TMDL/XMLA access), direct
IIS route 404 (URL Rewrite / SPA fallback missing), auth working in dev but
not IIS (cookie domain/path/`Secure`/`SameSite`, ARR header/cookie
preservation).

## Security rules

- Never commit credentials, tokens, cookies, API keys, `.env`, or provider
  response captures.
- Do not expose FastAPI port 8000 to the public internet.
- Do not add a visible admin-key input field without an explicit security
  decision — it's intentionally hidden today.
- Keep service-principal and Snowflake secrets transient (cleared after
  submission, never persisted).
- Treat downloaded lineage data as tenant metadata and protect it
  accordingly.
- Review DELETE/logout/scan-start operations before running them from API
  documentation — the workbench executes the selected backend operation
  exactly as configured, with no extra confirmation step.

## Current limitations

- Live provider acceptance requires a real Power BI/Fabric session and
  tenant permissions — mocked Playwright tests can't substitute for this.
- XMLA and definition access depend on capacity and provider policy.
- Physical source analysis can require optional backend administrative
  policy.
- Dashboard/app/access data must not be invented when the backend doesn't
  expose it.
- Orval, Vitest, and React Testing Library are installed but no generated
  client or unit/component suites are committed.
- `ApiDomainCanvas`, `ApiOutputPanel`, and `app/welcome/` are retained but
  unused by current routes — remove only as a deliberate cleanup change.
