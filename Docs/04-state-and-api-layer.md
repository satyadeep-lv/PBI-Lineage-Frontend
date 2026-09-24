# State Management And API Layer

## State Ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| Backend health | TanStack Query in `AppHeader` | Refetched every 15 seconds. |
| OpenAPI document | TanStack Query in `workspace.tsx` | Browser query cache keyed by API origin. |
| Overview/Explorer/Report/Impact data | TanStack Query | Selection or workspace-scope cache with feature-specific stale times. |
| Explorer selection | Explorer component state, seeded once from `?workspace`, `?report`, `?model` | Current Explorer mount; later selections do not rewrite the URL. |
| Table Impact selection | `TableImpact` component state (selected semantic and database table keys) | Current mount; picks missing from a refreshed inventory are dropped. Not in the URL. |
| Measure Impact scope and measure | `MeasureImpact` component state | Current mount; the scope defaults to every workspace and the measure to the first indexed one, which also replaces a pick missing from a refreshed inventory. Not in the URL. |
| Scanner ID/status/result | `useWorkspaceScan` plus TanStack Query | Current component/scope; polling ends at a terminal status. |
| API execution result | `useApiExecutor` local state | Current workspace route mount. |
| API origin | Zustand | In-memory page lifetime, initialized from `VITE_API_ORIGIN`. |
| Administrative key | Zustand | Ephemeral memory only; no persistence or visible field. |
| Diagram collapse state | `LineageDiagram` local state | Current graph; resets when graph identity changes, to the node kinds in `defaultCollapsedKinds` (report nodes in the impact graph) or to fully expanded. |
| Form input | React Hook Form or component state | Current component mount. |
| Power BI/Snowflake session | FastAPI cookie/session | Backend-controlled lifetime. |
| Power AI conversation and context | Zustand (`power-ai-store.ts`) | In-memory page lifetime; the backend keeps the conversation's last turns by `conversation_id`. Each message keeps its question, `focus` and answer time; `contextChangedAt`, `expanded` and `queuedQuestion` drive the context chip, the widen toggle and the measure panel's follow-ups. Nothing is persisted. |

## Zustand Store

`app/stores/app-store.ts` owns only `apiOrigin`, `adminKey`, and their setters.
`normalizeApiOrigin` trims whitespace/trailing slashes and removes an accidental
trailing `/api/v1`. Blank means same-origin and is preferred for IIS. Never add
browser persistence: the administrative key must not survive a refresh or be
written to disk.

## TanStack Query

`app/lib/query-provider.tsx` creates one `QueryClient` for the application.
Feature-local queries use descriptive array keys. Shared semantic and estate
evidence uses `workspaceListKey`, `parsedSemanticModelKey`, `daxAnalysisKey`,
and `estateDiscoveryKey` from `lineage-api.ts`, allowing compatible requests
from Overview, Explorer, Report Lineage, Table Impact, and Measure Impact to
reuse cache. Overview reads only the `workspaceListKey` and
`estateDiscoveryKey` entries (with `WORKSPACE_LIST_PATH` and
`ESTATE_DISCOVER_PATH`), so it never issues per-workspace requests and adds
nothing when another page has already loaded them.

Table Impact builds its inventory under `estateInventoryKey` for every listed
workspace, the same entry Measure Impact reads at its default all-workspaces
scope. It runs one `daxAnalysisKey` query for each semantic model the
selection touches (`useQueries`), so a model already analyzed by Measure
Impact or by an earlier selection is not posted again. Its bound-report
evidence uses a page-local key per model built by `impactEvidenceKey`
(`["table-impact", "visual-evidence", apiOrigin, semanticModelId, reportIds]`),
and estate discovery is enabled only once a table is selected.

Measure Impact reads the same `estateInventoryKey` for its chosen scope, one
`daxAnalysisKey` query for the selected measure's model, and its own evidence
key (`["measure-impact", "visual-evidence", ...]`); estate discovery is
enabled once a measure is selected. The `visual-evidence` segment keeps these
entries apart from the older two-call evidence shape. Each is one
`visual-source-lookup` query per model, batched by `fetchBatchedExplorer`.

Authentication success invalidates identity-dependent queries. Logout removes
them so one identity's tenant metadata is not displayed after another identity
connects.

## Navigation Helpers

`app/lib/workspace-routes.ts` is the one place that decides which
`/workspace/:section` slugs are working screens. `WORKSPACE_SECTIONS` lists
them; `isApiReferencePath` treats every other `/workspace/<slug>` as the API
reference, which drives the header's Workspace/Documents active state and the
shell's full-width API reference layout. `explorerHref` builds Explorer deep
links (`/workspace/explorer?workspace=...&report=...&model=...`) from IDs.
Explorer reads those params once on mount; there is no other URL state.

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
- `fetchEstateInventory`, which lists and parses models across a workspace
  scope (every listed workspace for Table Impact, the picked scope for Measure
  Impact) while recording inaccessible models instead of rejecting the entire
  inventory. Its `parsedByModel` map is reused as the `dax/analyze` request
  body. Both impact pages also read each table's and column's `source_path`
  from it, through `SourcedTable` in `app/lib/impact-analysis.ts`, because
  the shared `ParsedTable` type omits that field.

## Impact Evidence

`app/lib/impact-analysis.ts` is the evidence layer Table Impact and Measure
Impact share:

- `fetchImpactEvidence(apiOrigin, bound)` posts a model's bound reports to
  `POST /api/v1/explorer/visual-source-lookup` through `fetchBatchedExplorer`.
  `VisualSourceLookupRow` types only the fields the pages read (report,
  workspace, page, and visual names and IDs, `visual_type`, `semantic_table`,
  `semantic_object_name`, `match_status`). `measure-source-lineage` is
  deliberately not called: it lists every model measure for every bound
  report whether or not a visual shows it, which over-counted report usage.
- `impactEvidenceKey(page, apiOrigin, semanticModelId, bound)` returns
  `[page, "visual-evidence", apiOrigin, semanticModelId, reportIds]`.
- `buildEvidenceIndex(data)` indexes matched rows by `evidenceKey(table,
  name)` into `byObject` (report IDs and visual keys per semantic object),
  `reports` (name and workspace), and `visuals` (page name, visual name, and
  type, keyed by `visualKey(reportId, pageId, visualId)`).
- `buildReportNames(estate, indexes)` names reports from `EstateWithReports`
  first and fills ID-only names from the evidence.
- `tableSources`, `tableSeeds`, and `displayType` turn a `SourcedTable` into
  its physical sources, its whole-table closure seeds, and readable type
  labels.

`app/components/workspace/impact-lineage.tsx` turns that evidence and a DAX
closure into the shared impact graph (`buildImpactGraph`, one
`ImpactGraphScope` per model) and renders it (`ImpactLineageDiagram`); see
[03-features-and-data-flows.md](03-features-and-data-flows.md#impact-graph).
`app/components/workspace/impact-ui.tsx` supplies the presentational pieces
both pages use: `SummaryTile` (with a "Still checking" spinner),
`ImpactSection`, `StatusBand`, `EvidenceStatus`, `LoadingState`, and
`EmptyState`. `EvidenceStatus` checks, in order, estate failure, estate
loading ("Finding the reports bound to these semantic models..."), no bound
reports, evidence loading, the 300-report cap, and success, so the page never
claims "no reports bound" before estate discovery has answered.

## Dependency Traversal

`app/lib/dependency-graph.ts` performs multi-source breadth-first traversal over
the flat DAX dependency response. `computeDependencyClosure` supports upstream,
downstream, and bidirectional analysis with depth/directness/reference evidence.
In each `DaxDependency`, `source` is the referenced object and `target` the one
whose expression reads it. `closureToLineageGraph` converts a closure to the
renderer-independent graph for Report Lineage's calculation diagrams; the
impact pages build theirs with `buildImpactGraph` instead.

## Scanner API

`app/lib/scanner-api.ts` contains safe scanner defaults, request functions, and
defensive optional types for Microsoft's raw scan result. The frontend always
forces `get_artifact_users: false`.

`app/lib/use-workspace-scan.ts` submits 1-100 workspace IDs, polls status every
four seconds, stops at `Succeeded` or `Failed`, and enables one immutable result
fetch only after success. Scanner activity is never automatic.

## Impact Pickers

`app/components/workspace/impact-picker.tsx` holds three controlled pickers.
Each keeps only its open state and filter text locally, and the page owns the
selection:

- `WorkspaceScopeSelect`: a workspace multi-select with Select all/Clear, used
  by Measure Impact and Scanner.
- `ObjectSearchSelect`: a single-select `Command` combobox over
  `SearchEntry` items, used by Measure Impact.
- `MultiObjectSearch`: one search box over several `SearchGroup`s (heading,
  chip label, entries), used by Table Impact. It turns off cmdk filtering and
  matches every typed word against each entry's `searchValue` itself, so a
  match beyond the visible rows is still found. Matches are then ranked by
  `matchRank`, which compares the entry's `primary` name with the whole
  query: 0 exact name, 1 name prefix, 2 a name segment (split on spaces,
  `.`, `_`, brackets, parentheses, and `-`) starts with it, 3 the name
  contains it, 4 only other text matched. Ties keep the group's own order.
  Ranking happens before the cap, and each group shows its first 100
  matches, with the groups as side-by-side columns. It returns the selected
  keys through `onChange`. Picks render as removable chips; the list is
  labeled `Selected <label>` (label lowercased, for example "Selected
  tables") and each button `Remove <name>`.

`SearchEntry` has an optional `chipText`, the chip and remove-button text to
use when `primary` alone is ambiguous. Table Impact sets it to
`Table (Model)` for semantic tables, so a chip reads `Sales (Sales Model)` and
its button `Remove Sales (Sales Model)`. The chip's tooltip shows
`primary — secondary`.

## Copy And Export

`app/lib/grid-export.ts` enriches rows with parent context, preserves complete
cell values such as DAX, creates tab-separated clipboard text, and generates
CSV/Excel-compatible downloads. Every row field except `id` is exported, so a
field the grid does not show as a column still reaches copies and files.
Both impact pages rely on this for report, visual, semantic-model, and
workspace IDs. `ImpactGrid` applies those helpers to impact and scanner views.
By default it is a fixed 420 px tall; its optional `fitRows` prop shrinks it
to the rows present, between three rows and 420 px, as the stacked grids on
Table Impact (four) and Measure Impact (six) do. AG Grid reads
`overlayNoRowsTemplate` only once, so `ImpactGrid` keys `AgGridReact` by
`emptyMessage`. When the message changes, for example from "Checking
reports..." to "No report visual uses the selected tables.", the grid is
rebuilt and shows the new text. Explorer and Report Lineage provide
equivalent copy/export behavior in their local grids.

## Power AI

`app/lib/power-ai-api.ts` is the single source of Power AI wire types; the
store and components import from it. `app/lib/use-power-ai-chat.ts` is the one
chat implementation. It streams when `/api/v1/ai/status` reports
`streaming_enabled`, and otherwise calls `/chat`. The frontend never computes,
invents or completes evidence: it groups, labels and formats what the backend
sent. Errors always show the vetted `AI_ERROR_COPY` text for their `reason`,
never the backend's or a provider's message.

### Requests

`POST /api/v1/ai/chat`, `/api/v1/ai/chat/stream` and `/api/v1/ai/explain` take
the same body, built by `buildChatRequest` from the store's `PowerAIContext`:

```ts
{
  conversation_id?: string;   // the id from the previous response
  message: string;            // 1..4000 chars
  audience: "general" | "business" | "developer";
  context?: {
    workspace_id?: string;
    report_id?: string;
    semantic_model_id?: string;
    semantic_model_workspace_id?: string;
    page_id?: string;
    object_type?: string;     // "measure" | "calculated_column" | "column" | "table" | "report" | ...
    object_id?: string;
    object_name?: string;     // preferably "Table[Name]"
  };
}
```

- `semantic_model_workspace_id` is the model's own workspace, which is often
  not the report's. Without it the backend has to search workspaces for the
  model. Report lineage, the measure panel, Measure impact and Table impact
  send it.
- `object_name` resolves exactly in the `Table[Name]` form. For
  `object_type: "report"` the backend does not search the model for the
  report's name.
- `conversation_id` matters. The backend keeps the last turns of each
  conversation, scoped to the signed-in user, so follow-ups such as "which
  visuals use it?" work. `resetConversation` clears the id, so the next
  message starts a fresh conversation on the backend too.
- `route` is also sent and ignored by the backend.
- Pages merge their context into the store with `mergeContext`. A page that
  clears `semanticModelId` must clear `semanticModelWorkspaceId` too, or a
  stale workspace leaks into the next page's questions.

### Response

`/chat`, `/explain` and the stream's `complete` event return one shape:

```ts
type AiChatResponse = {
  conversation_id: string;
  status: "answered" | "insufficient_evidence" | "ambiguous" | "conflicting_evidence" | "out_of_scope";
  answer: string;
  claims: { text: string; evidence_ids: string[] }[];
  evidence: EvidenceItem[];
  agent: string | null;          // "tool_loop", "measure_agent", "report_agent", ...
  suggested_questions: string[];
  tool_trace: AiToolCall[];      // empty unless the model chose tools
  usage: { provider: string; model: string; tokens: number } | null;
  focus?: AiFocus | null;        // newer backends only
};

type AiFocus = {
  source: "page" | "question" | "conversation";
  workspace_id?, workspace_name?, report_id?, report_name?,
  semantic_model_id?, semantic_model_name?, object_type?, object_name?: string | null;
};
```

`usage` is non-null only when a model wrote the answer. On `/explain` it is
non-null when AI is enabled and configured, and null when the answer was
rendered straight from the evidence. Both are valid, grounded answers. The
measure panel shows "Written by Power AI" or "From lineage evidence"
accordingly.

`focus` says what the answer is about, as the backend resolved it: the page's
context, a report or model named in the question, or what the conversation was
already about. Every ID in it came from the backend's resolver. Older backends
leave it out and `null` means nothing was resolved; the frontend handles both.
It is stored per message and shown by the context chip (see below). `isFocus`
accepts one only when it names a valid `source`.

### Evidence

```ts
type EvidenceItem = {
  evidence_id: string;              // "E1", "E2", ... unique within a response
  object_type: string;              // open set
  object_id: string | null;
  object_name: string;
  fact_type: "definition" | "dependency" | "relationship" | "source" | "usage" | "impact";
  source_type: "pbir" | "tmdl" | "xmla" | "scanner" | "lineage_graph" | "snowflake" | "other";
  value: unknown;                   // DAX string for a measure/calculated column definition
  plain_language: string | null;    // plain-English reading of a definition
  display_value: string | null;     // one readable sentence; this is what to show
  workspace_id: string | null;
  report_id: string | null;
  semantic_model_id: string | null;
  verification_status: "verified" | "partial" | "unresolved";
  retrieved_at: string;             // ISO timestamp
  source_reference: string | null;  // e.g. "definition/tables/Orders.tmdl"
  section?: string;                 // not sent today; wins over the table below if present
};
```

Every nullable field is sent as `null`. `source_type: "other"` marks derived
facts such as coverage notes.

Evidence belongs to answer sections by `(fact_type, object_type)`.
`app/lib/power-ai-evidence.ts` mirrors the backend's table
(`app/ai/composition/evidence_sections.py`) in `sectionFor` and
`groupBySection`. The exact pair is looked up first, then the `fact_type`
default. The chat's evidence list, the measure panel and its downloads all use
it, so they group evidence the same way the answer text does.

| Order | Section | Matches |
| --- | --- | --- |
| 0 | Context | `relationship` / `context` (left out of evidence lists; the answer opens with it) |
| 5 | About this report | `definition` / `report` |
| 6 | About this semantic model | `definition` / `semantic_model` |
| 10 | Definition | `definition` / anything else |
| 20 | Pages and visuals | `relationship` / `report_page` |
| 22 | Measures and columns its visuals use | `usage` / `measure`, `column`, `calculated_column`, `hierarchy`, `hierarchy_level` |
| 25 | Tables in the model | `relationship` / `semantic_table` |
| 28 | Relationships | `relationship` / `relationship` |
| 30 | Depends on (semantic model lineage) | `dependency` / anything |
| 40 | Reads from (database lineage) | `source` / anything |
| 50 | Measures and columns built on it | `impact` / anything else |
| 55 | Tables affected | `impact` / `semantic_table` |
| 60 | Visual impact | `impact` / `visual`, `report`, `report_page` |
| 62 | Visuals and the fields they use | `usage` / `visual`, and the `usage` default |
| 65 | Reports using this semantic model | `usage` / `report` |
| 70 | Related objects | `relationship` default |
| 90 | What was checked | `relationship` / `coverage` |

A visual that an object affects is `impact`/`visual`. A report's own list of
visuals is `usage`/`visual`.

In the chat, each reply's evidence starts collapsed behind a "Sources (N)"
toggle in its action row, beside "Copy answer" and "Ask again". `EvidenceView`
renders only the list; the message owns the toggle. `conflicting_evidence`
shows the evidence side by side, grouped by source, so Power AI never picks
one.

A reply that isn't a full answer opens with a short note instead of a warning
box: "I need a bit more to go on" (`insufficient_evidence`), "More than one
thing matches" (`ambiguous`), "That's outside what I can check"
(`out_of_scope`), or "Conflicting evidence found" (`conflicting_evidence`,
kept rose). The backend's `status` is unchanged; only its presentation is. Its
`suggested_questions` follow as prominent chips ("Try one of these:"), and
every latest reply shows its suggestions as follow-up chips.

### Streaming

`/chat/stream` returns `text/event-stream`. The backend grounds the whole
answer first, then sends these events in this order:

| Event | Data |
| --- | --- |
| `metadata` | `{ conversation_id, status, agent, focus? }` |
| `evidence` | `{ evidence: EvidenceItem[] }` |
| `delta` | `{ text, delta }`, one per chunk (`delta` duplicates `text`) |
| `complete` | the full `AiChatResponse` |

The `delta` texts join back to exactly `complete.answer`, including spaces,
newlines and indentation. `complete` is authoritative: its `answer` replaces
the accumulated delta text. If it ever arrives without an answer, the streamed
text is kept, so the bubble is never left empty. The same goes for `focus`:
`complete`'s wins, and `metadata`'s is kept when `complete` has none.

Because the backend grounds the whole answer before streaming, the deltas
arrive in one burst. `useRevealedText` (`app/lib/use-revealed-text.ts`) reveals
a streamed reply progressively instead: at least 48 characters per animation
frame, and never more than about 72 frames (~1.2 s) for the whole answer. It
runs once per message and not at all under `prefers-reduced-motion`. It only
changes how much is on screen; the store and "Copy answer" always hold the full
text. The Stop button cancels whichever stream is in flight, including one a
follow-up chip started, because the active request is held at module level.

On failure the only event is
`error` with `{ code, message, error, reason }`. `reason` is always an
`AiUnavailableReason`: `disabled`, `provider_unavailable`, `not_configured`,
`timeout`, `rate_limited`, `insufficient_permissions`, `auth_required` or
`unknown`. A stream that closes with neither `complete` nor `error` is treated
as an `unknown` error.

The Playwright mocks in `tests/power-ai.spec.ts` emit these exact frames.
Keep them in step with the backend's `app/ai/services/streaming.py`. Mocks
written to what the frontend expected, not what the backend sends, once let an
empty-bubble bug pass every test.

### Answer text

Answers are plain text in titled sections, never Markdown:

```text
Total Revenue is a measure in table Orders of semantic model 'Sales Model' (workspace 'Finance').

Definition
- Total Revenue (measure in table Orders; format #,0)
    SUM(Orders[Revenue])
```

Nothing is parsed as Markdown and no HTML is injected. The stored text is never
changed: copying and downloading always give the exact answer.

**The answer model.** `parseAnswer` (`app/lib/power-ai-answer.ts`) turns the
text into sections, `{ id, title, displayTitle, kind, tab, blocks, lineCount }`.
Text before the first title is the `lead` section. Blocks are `text` (prose
lines), `items` (`- ` lines, marker removed; a line indented less than four
spaces wraps into the item above), `code` (lines indented four spaces, that
indent removed and nothing else changed) and `note` (a `Defined in: ...` line
under DAX).

A known title is any of the backend's canonical ones (the section table above,
plus "In plain English") or an alias older model-written answers used ("What
it is", "DAX", "Semantic model lineage", "Database lineage", "What builds on
it"). It is matched without case or a trailing colon, and only needs to stand
alone with content somewhere below it. Any other line is a title when it opens
the text or follows a blank line, fits in 60 characters, doesn't start with
`- ` or whitespace, doesn't end in `.` or `,`, and has a line straight under
it. It may end in `:`. `displayTitle` drops the colon; `title` keeps it. The
title decides `kind` (`lead`, `plain`, `dax`, `semantic`, `database`,
`dependents`, `tables`, `visuals`, `report`, `coverage`, `other`) and `tab`
(Overview, DAX, Semantic lineage, Database, Impact, Visuals, ...).

**Entity chips.** `buildEntityIndex` (`app/lib/power-ai-entities.ts`) collects
the names an answer's evidence backs: each `object_name`, the `Table[Name]`
form of an `object_id` (and `'Table'[Name]`), and for database objects the
`database.schema.object` in `display_value` or built from
`value.database`/`schema_name`/`object_name`. Context, coverage and
relationship items are left out, and so is a "no database source" line, which
names a semantic table. `linkify` then scans text once, left to right:
longest name first, whole words only, no overlaps, never inside DAX. The chip
keeps the exact text. Hovering or focusing it shows the item's type and
`display_value`; the same fact is linked with `aria-describedby`. Clicking asks
`entityQuestion`: "Explain `Table[Name]`" for a measure or column, "Explain
table X", "Which fields does X use?" for a visual, "Tell me about report X".
Database objects, pages and models only have the tooltip. `contextForEntity`
makes a model object the selected object for that question; for anything else
it clears the selected object and keeps the report and model.

**`AnswerView`** (`app/components/power-ai/answer-view.tsx`) is the one
renderer for the chat and the measure panel. The lead and "In plain English"
come first as paragraphs; every other section is a card with an icon, a
collapse toggle (its heading is the button) and chips. DAX is coloured by
`highlightDax` (`app/lib/dax-highlight.ts`), a small tokenizer whose tokens
always join back to the input. Its "Copy DAX" button copies the original
lines. In the chat, an answer of more than 12 non-blank lines starts with every
card after the second collapsed, with a "Show full answer" control.

**The measure panel** (`measure-ai-definition.tsx`) shows only the definition.
It has a header row (name, table, model, author badge, Copy, `.txt`, `.md`),
sticky section tabs for whichever of Overview, DAX, Semantic lineage, Database,
Impact and Visuals exist, the lineage strip, the cards and follow-up chips.
The evidence list and the "DAX expression / Reads from" row are not on screen;
both downloads still include every evidence item. The lineage strip
(`app/lib/power-ai-lineage.ts`, `lineage-strip.tsx`) sorts the evidence into
five layers: Database (`source`), Semantic inputs (`dependency`, columns first),
This measure, Built on it (`impact` other than visuals, tables, reports and
pages) and Visuals. There is one arrow between neighbouring layers and none
between cards, because the evidence doesn't say which input feeds which
dependent. A chip for a measure the panel lists selects and regenerates it.
Any other chip opens the chat with its question seeded. A follow-up chip opens
the chat with the measure as context and sends it, through the store's
`queuedQuestion`.

**The context chip** (`context-chip.tsx`) sits under the chat header and says
what the next question will be about. It shows the last reply's `focus`
(icon: page, question or history), unless the page's context changed after
that reply. The store's `contextChangedAt` records that, and `mergeContext`
only bumps it for a real change other than `route`. Otherwise it shows the
page's context, and with nothing selected it says so. Its "x" calls
`clearPageContext`, which empties everything but `route` for the next
question. The header's widen toggle (`expanded`, not persisted) switches the
panel from `min(380px,92vw)` to `min(720px,96vw)`.

Unit-level coverage for the answer model, the chips, the highlighter and the
lineage layers is in `tests/power-ai-units.spec.ts`, which Playwright runs in
Node with no page.

## Request Invariants

- The frontend talks only to FastAPI, never directly to provider APIs.
- Every authenticated request uses backend HTTP-only cookies.
- IDs are API context; selectors lead with human-readable names.
- A report's model can belong to another workspace.
- Provider/permission failure produces an honest degraded state; the UI does
  not invent dashboard, app, XMLA, scanner, or physical-source evidence.
- Administrative credentials and provider secrets are never persisted.
