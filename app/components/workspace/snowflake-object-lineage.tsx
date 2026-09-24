import { Columns3, GitBranch, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "~/components/ui/button";
import { ApiError, isSessionExpired, requestJson } from "~/lib/lineage-api";
import { useAppStore } from "~/stores/app-store";

type SnowflakeObjectReference = {
  object_id: string;
  database: string;
  schema_name: string;
  object_name: string;
  object_domain: string;
  qualified_name: string;
  column_name?: string | null;
  status?: string | null;
};

type SnowflakeDependency = {
  source: SnowflakeObjectReference;
  target: SnowflakeObjectReference;
  dependency_type: string;
  distance?: number | null;
  process?: unknown;
};

type SnowflakeLineageWarning = { code: string; message: string; root_object_name?: string | null };

type SnowflakeTraceResponse = {
  account_identifier: string;
  starting_object_name: string;
  starting_column_name?: string | null;
  object_domain: "TABLE" | "COLUMN";
  direction: "UPSTREAM" | "DOWNSTREAM";
  max_depth: number;
  query_count: number;
  truncated: boolean;
  snapshot: {
    account_identifier: string;
    objects: SnowflakeObjectReference[];
    dependencies: SnowflakeDependency[];
    warnings: SnowflakeLineageWarning[];
    object_count: number;
    dependency_count: number;
  };
  warnings: SnowflakeLineageWarning[];
};

/**
 * The backend's own defaults for a deep trace, sent explicitly so the request
 * this page makes is the request you can read here — `include_process` is
 * singular, which is easy to get wrong because the API catalog's body template
 * spells it `include_processes` (Pydantic silently ignores the misspelling and
 * falls back to its default).
 */
const TRACE_LIMITS = {
  max_depth: 50,
  max_concurrency: 8,
  max_nodes: 5000,
  max_edges: 10000,
  max_queries: 2000,
  include_process: true,
};

export type SnowflakeTraceTarget = { qualifiedName: string; label: string };
export type SnowflakeColumnTarget = { qualifiedName: string; columns: string[] };

function processSummary(process: unknown): string {
  if (process == null) return "--";
  if (typeof process === "string") return process;
  if (Array.isArray(process)) return process.length ? `${process.length} steps` : "--";
  if (typeof process === "object") {
    const record = process as Record<string, unknown>;
    const name = record.name ?? record.query_id ?? record.id;
    return typeof name === "string" && name ? name : "Reported";
  }
  return String(process);
}

/** Shared trace call. Both panels hit the same route with the same limits; only the object identity differs. */
function useSnowflakeTrace() {
  const apiOrigin = useAppStore((state) => state.apiOrigin);
  const [isTracing, setIsTracing] = useState(false);
  const [result, setResult] = useState<SnowflakeTraceResponse | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function trace(body: Record<string, unknown>) {
    setIsTracing(true);
    setError(null);
    setResult(null);
    try {
      setResult(await requestJson<SnowflakeTraceResponse>(apiOrigin, "/api/v1/lineage/snowflake/trace", {
        method: "POST",
        body: JSON.stringify({ ...body, ...TRACE_LIMITS }),
      }));
    } catch (caught) {
      setError(caught);
    } finally {
      setIsTracing(false);
    }
  }

  return { isTracing, result, error, trace };
}

/**
 * Traces one physical table's lineage inside Snowflake, starting from a fully
 * qualified name taken straight from the source-database evidence above. This
 * needs the Snowflake session, not the Power BI one — the two are separate
 * cookies, so a signed-in Power BI user can still be unauthenticated here.
 */
export function SnowflakeObjectLineage({ targets }: { targets: SnowflakeTraceTarget[] }) {
  const [selectedName, setSelectedName] = useState("");
  const { isTracing, result, error, trace } = useSnowflakeTrace();

  const selected = useMemo(
    () => targets.find((target) => target.qualifiedName === selectedName) ?? targets[0] ?? null,
    [selectedName, targets],
  );

  return <section className="border border-zinc-200">
    <SnowflakeTraceHeading
      icon={<GitBranch className="size-4 text-teal-700" />}
      title="Snowflake object lineage"
      text="Pick a fully qualified table from the evidence above and trace it upstream inside Snowflake, to see what feeds it. This uses the Snowflake connection, which is separate from Power BI sign-in."
    />

    {!targets.length
      ? <p className="px-4 py-6 text-sm text-zinc-500">No fully qualified database tables were found for this report, so there is nothing to trace. Rows whose source could not be resolved, and non-database sources such as files or URLs, are not traceable.</p>
      : <div className="space-y-5 p-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_auto] md:items-end">
            <SelectField id="snowflake-trace-object" label="Fully qualified table" value={selected?.qualifiedName ?? ""} onChange={setSelectedName} mono>
              {targets.map((target) => <option key={target.qualifiedName} value={target.qualifiedName}>{target.label}</option>)}
            </SelectField>
            <Button type="button" disabled={!selected || isTracing} onClick={() => selected && void trace({ object_name: selected.qualifiedName, object_domain: "TABLE", direction: "UPSTREAM" })} className="h-10">
              {isTracing ? <Loader2 className="size-4 animate-spin" /> : <GitBranch className="size-4" />}
              {isTracing ? "Tracing" : "Trace lineage"}
            </Button>
          </div>
          <SnowflakeTraceOutcome result={result} error={error} />
        </div>}
  </section>;
}

/**
 * The same trace narrowed to a single database column. Direction and domain are
 * fixed here by design — a column trace only makes sense upstream, so they are
 * sent as constants rather than offered as choices.
 */
export function SnowflakeColumnLineage({ targets }: { targets: SnowflakeColumnTarget[] }) {
  const [selectedName, setSelectedName] = useState("");
  const [selectedColumn, setSelectedColumn] = useState("");
  const { isTracing, result, error, trace } = useSnowflakeTrace();

  const selectedTable = useMemo(
    () => targets.find((target) => target.qualifiedName === selectedName) ?? targets[0] ?? null,
    [selectedName, targets],
  );
  const column = selectedTable?.columns.includes(selectedColumn) ? selectedColumn : selectedTable?.columns[0] ?? "";

  return <section className="border border-zinc-200">
    <SnowflakeTraceHeading
      icon={<Columns3 className="size-4 text-teal-700" />}
      title="Snowflake column lineage"
      text="Trace one database column upstream inside Snowflake, to see which columns and tables it is derived from. Uses the Snowflake connection, which is separate from Power BI sign-in."
    />

    {!targets.length
      ? <p className="px-4 py-6 text-sm text-zinc-500">No database columns resolved for this report's semantic objects, so there is nothing to trace.</p>
      : <div className="space-y-5 p-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] md:items-end">
            <SelectField id="snowflake-column-object" label="Fully qualified table" value={selectedTable?.qualifiedName ?? ""} onChange={(value) => { setSelectedName(value); setSelectedColumn(""); }} mono>
              {targets.map((target) => <option key={target.qualifiedName} value={target.qualifiedName}>{target.qualifiedName}</option>)}
            </SelectField>
            <SelectField id="snowflake-column-name" label="Database column" value={column} onChange={setSelectedColumn} mono>
              {(selectedTable?.columns ?? []).map((name) => <option key={name} value={name}>{name}</option>)}
            </SelectField>
            <Button type="button" disabled={!selectedTable || !column || isTracing} onClick={() => selectedTable && column && void trace({ object_name: selectedTable.qualifiedName, column_name: column, object_domain: "COLUMN", direction: "UPSTREAM" })} className="h-10">
              {isTracing ? <Loader2 className="size-4 animate-spin" /> : <Columns3 className="size-4" />}
              {isTracing ? "Tracing" : "Trace column"}
            </Button>
          </div>
          <SnowflakeTraceOutcome result={result} error={error} />
        </div>}
  </section>;
}

function SnowflakeTraceHeading({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
    <p className="flex items-center gap-2 text-sm font-semibold">{icon} {title}</p>
    <p className="mt-0.5 max-w-3xl text-xs leading-5 text-zinc-500">{text}</p>
  </div>;
}

function SelectField({ id, label, value, onChange, mono = false, children }: { id: string; label: string; value: string; onChange: (value: string) => void; mono?: boolean; children: React.ReactNode }) {
  return <div className="space-y-1.5">
    <label className="text-xs font-semibold text-zinc-600" htmlFor={id}>{label}</label>
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={`h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100${mono ? " font-mono" : ""}`}>
      {children}
    </select>
  </div>;
}

function SnowflakeTraceOutcome({ result, error }: { result: SnowflakeTraceResponse | null; error: unknown }) {
  if (error != null) return <SnowflakeTraceError error={error} />;
  if (!result) return null;

  const dependencies = result.snapshot.dependencies;
  const allWarnings = [...result.warnings, ...result.snapshot.warnings];
  const startedFrom = result.starting_column_name
    ? `${result.starting_object_name}.${result.starting_column_name}`
    : result.starting_object_name;

  return <div className="space-y-4">
    <div className="grid border-y border-zinc-200 sm:grid-cols-4">
      <TraceMetric label="Objects" value={String(result.snapshot.object_count)} />
      <TraceMetric label="Dependencies" value={String(result.snapshot.dependency_count)} />
      <TraceMetric label="Queries read" value={String(result.query_count)} />
      <TraceMetric label="Account" value={result.account_identifier} />
    </div>

    {result.truncated && <div className="border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">This trace hit a limit before the graph was complete, so what is shown is partial. Depth was capped at {result.max_depth}.</div>}
    {allWarnings.length > 0 && <div className="space-y-1 border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{allWarnings.map((warning, index) => <p key={`${warning.code}-${index}`}>{warning.message}</p>)}</div>}

    <p className="text-xs text-zinc-500">{result.direction === "UPSTREAM" ? "Upstream of" : "Downstream of"} <span className="font-mono text-zinc-700">{startedFrom}</span></p>

    {dependencies.length === 0
      ? <p className="border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">Snowflake reported no {result.direction.toLowerCase()} dependencies for this {result.object_domain.toLowerCase()}. That is an answer, not a failure — a column loaded straight from an ingested table genuinely has none.</p>
      : <div className="overflow-x-auto border border-zinc-200">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-semibold text-zinc-600">
              <tr>
                <th className="border-b border-zinc-200 px-3 py-2">Source</th>
                <th className="border-b border-zinc-200 px-3 py-2">Target</th>
                <th className="border-b border-zinc-200 px-3 py-2">Domain</th>
                <th className="border-b border-zinc-200 px-3 py-2">Dependency</th>
                <th className="border-b border-zinc-200 px-3 py-2">Distance</th>
                <th className="border-b border-zinc-200 px-3 py-2">Process</th>
              </tr>
            </thead>
            <tbody>
              {dependencies.map((dependency, index) => <tr key={`${dependency.source.object_id}-${dependency.target.object_id}-${index}`} className="align-top hover:bg-zinc-50">
                <td className="border-b border-zinc-100 px-3 py-2 font-mono text-xs">{qualify(dependency.source)}</td>
                <td className="border-b border-zinc-100 px-3 py-2 font-mono text-xs">{qualify(dependency.target)}</td>
                <td className="border-b border-zinc-100 px-3 py-2 text-xs">{dependency.target.object_domain}</td>
                <td className="border-b border-zinc-100 px-3 py-2 text-xs">{dependency.dependency_type}</td>
                <td className="border-b border-zinc-100 px-3 py-2 text-xs">{dependency.distance ?? "--"}</td>
                <td className="border-b border-zinc-100 px-3 py-2 text-xs">{processSummary(dependency.process)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}
  </div>;
}

/** A column trace returns column-level references, so the column is part of the name. */
function qualify(reference: SnowflakeObjectReference): string {
  return reference.column_name ? `${reference.qualified_name}.${reference.column_name}` : reference.qualified_name;
}

function TraceMetric({ label, value }: { label: string; value: string }) {
  return <div className="border-r border-zinc-200 px-4 py-3 last:border-r-0">
    <p className="text-xs text-zinc-500">{label}</p>
    <p className="mt-0.5 break-all text-sm font-semibold">{value}</p>
  </div>;
}

/** A 401 here means the Snowflake session specifically, not Power BI — say which, and link to the right setup. */
function SnowflakeTraceError({ error }: { error: unknown }) {
  if (isSessionExpired(error)) {
    return <div className="border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
      <p>No active Snowflake connection. This trace runs against Snowflake directly, so connecting Power BI is not enough.</p>
      <a href="/workspace/database" className="mt-3 inline-flex h-8 items-center rounded-lg bg-zinc-950 px-3 text-xs font-medium text-white hover:bg-zinc-800">Open database setup</a>
    </div>;
  }
  const apiError = error instanceof ApiError ? error : null;
  return <div className="border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-900">
    <p>{apiError?.message ?? "The Snowflake lineage trace could not be completed."}</p>
    {apiError?.requestId && <p className="mt-1 text-xs text-rose-800">Request ID: <span className="font-mono">{apiError.requestId}</span></p>}
  </div>;
}
