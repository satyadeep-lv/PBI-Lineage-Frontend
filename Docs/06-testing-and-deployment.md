# Testing And Deployment

## Commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install the exact dependency graph from `package-lock.json`. |
| `npm run dev` | Start React Router/Vite at `http://localhost:5173`. |
| `npm run typecheck` | Generate route types and run strict TypeScript checks. |
| `npm run build` | Produce the static SPA under `build/client`. |
| `npm run start` | Optional Node-hosted build validation; not the IIS production path. |
| `npx playwright test` | Run all browser tests. |
| `npx playwright test tests/api-documentation.spec.ts` | API workbench coverage only. |
| `npx playwright test tests/report-lineage.spec.ts` | Report Lineage coverage only. |
| `npx playwright test tests/impact-analysis.spec.ts` | Table and Measure Impact coverage only. |
| `npx playwright test tests/scanner.spec.ts` | Scanner and Explorer scan-panel coverage only. |
| `npx playwright test tests/home.spec.ts` | Home content, shared navigation, product image, and responsive UX only. |
| `npx playwright test tests/setup-guide.spec.ts` | Setup Guide routing, content, navigation, references, screenshots, and responsive containment only. |

Run FastAPI first and verify `http://127.0.0.1:8000/docs`. Use
`localhost:5173` consistently for the frontend. Stop the development server
before running a production build so Vite is not watching the `build/`
directory while React Router replaces it.

## Browser Testing

The Playwright tests mock backend contracts, so they can validate frontend
behavior without consuming live Microsoft scanner quotas or requiring a tenant
session:

- `api-documentation.spec.ts`: GET/POST execution, JSON validation, response
  metadata, secret clearing, and responsive containment.
- `report-lineage.spec.ts`: report selection, evidence tabs, exports, directed
  report/column/calculation graphs, and mobile layout.
- `impact-analysis.spec.ts`: workspace scope, searchable table/measure pickers,
  upstream/downstream traversal, collapse behavior, grids, and degraded
  evidence notices.
- `scanner.spec.ts`: scan submission, Running-to-Succeeded polling, result
  browsing, and Explorer's explicit one-workspace enrichment.
- `home.spec.ts`: Home content, one primary action, database-neutral copy,
  product image loading, shared navigation, no health request, and containment.
- `setup-guide.spec.ts`: guide-route content, authoritative reference links,
  navigation to Home/workspace, page errors, and desktop/mobile containment.

Use an authenticated tenant for final provider acceptance. Mocked tests cannot
prove Power BI/Fabric permissions, XMLA capacity, real scan payload quality, or
production cookie behavior. Generated test output is ignored under
`test-results/` and `playwright-report/`.

Vitest and React Testing Library remain installed for future unit/component
suites; no such suite is currently committed.

## Production Build

```powershell
npm ci
npm run typecheck
npm run build
```

The deployable static artifact is `build/client`. It must contain at least
`index.html`, `web.config`, and generated assets. Do not deploy source,
`node_modules`, `.env`, tests, Playwright output, or `build/server` to IIS.

## Automated Azure Release

`.github/workflows/ci.yml` is the main-branch quality gate. It installs with
Node 22, typechecks, and builds. After a successful main CI run,
`.github/workflows/cd.yml` can deploy when `DEPLOYMENT_ENABLED == 'true'`.
Manual CD is also restricted to `main`.

The production sequence is:

1. Build and validate `build/client/index.html` and `web.config`.
2. ZIP only the static client output.
3. Authenticate GitHub Actions to Azure with OIDC.
4. Upload the ZIP to the configured private Blob container.
5. Use Azure VM Run Command to execute the download script on the Windows VM.
6. Download with the VM managed identity.
7. Stage under `C:\pbi-lineage\frontend\releases\<commit-sha>`.
8. Repoint the existing `PBI-Lineage` IIS site and recycle its app pool.
9. Validate locally and roll back to the previous physical path on failure.
10. Smoke-test the public frontend and `/api/v1/health/live`.

See the root [README](../README.md#automated-azure-deployment) for the exact
GitHub secrets/variables, identity permissions, VM layout, and diagnostic
workflows. `.github/workflows/azure-oidc-test.yml` validates federated Azure
access; `.github/workflows/storage-upload-test.yml` validates build and Blob
upload without changing IIS.

## IIS Runtime

IIS needs Static Content, URL Rewrite, and ARR proxy support. The application
pool should use `No Managed Code`, the public binding should use HTTPS, and
FastAPI port 8000 should remain on loopback or an internal interface.

`public/web.config` is copied into the static artifact. Its first rewrite sends
`/api/*` and `/openapi.json` to `http://127.0.0.1:8000`; the second sends
non-file/non-directory application paths to `/index.html`. Keep `/docs`
private: the application reads `/openapi.json` and does not require public
Swagger UI.

## Verification Checklist

1. `/` loads Home and `/setup-guide` loads directly without a Node process.
2. Report Lineage, Table Impact, Measure Impact, and Scanner survive hard
   refreshes.
3. `/api/v1/health/live` and `/openapi.json` return through IIS.
4. Power BI authentication sets and reuses the backend HTTP-only cookie.
5. API documentation executes a harmless health/status GET.
6. Clipboard, CSV, and Excel-compatible exports work.
7. The footer contains the required developer and copyright text.
8. `C:\pbi-lineage\frontend\current-release.txt` records the deployed SHA.

## Environment

Blank `VITE_API_ORIGIN` means same-origin requests, which is preferred for IIS.
During development, Vite proxies `/api`, `/openapi.json`, and `/docs` to
`http://127.0.0.1:8000`. A non-empty value must be an origin without
`/api/v1`; cross-origin use requires matching backend CORS and cookie policy.

Never place tenant secrets, client secrets, Snowflake passwords, access tokens,
session IDs, or API keys in frontend environment variables or Git.

## Security And Limitations

- Never expose FastAPI port 8000 publicly.
- The administrative key stays ephemeral and has no visible frontend input.
- Service-principal and Snowflake secrets are cleared after submission.
- API documentation performs real state-changing requests; review the method
  and body before execution.
- Scanner runs are explicit and consume real Microsoft tenant quotas.
- Live provider acceptance requires the appropriate Power BI/Fabric/XMLA
  permissions and cannot be replaced by mocked browser tests.
- Table/Measure Impact currently caps cross-report evidence at 300 report
  bindings per model and labels truncation in the UI.
- Orval, Vitest, and React Testing Library are installed, but no generated
  client or unit/component suite is committed.

Before CI or another-PC setup, run `git status --short` and commit every
required source/test/documentation file. A local build can hide missing source
control entries because untracked files are still visible to Vite and TypeScript.
