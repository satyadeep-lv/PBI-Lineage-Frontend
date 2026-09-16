import { useQuery } from "@tanstack/react-query";
import type { ColDef } from "ag-grid-community";
import { ArrowDownToLine, ArrowUpToLine, Loader2, RefreshCw, TableProperties } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { AskPowerAiButton } from "~/components/power-ai/ask-power-ai-button";
import { PowerBiAuthRequired } from "~/components/workspace/auth-required";
import { ImpactGrid } from "~/components/workspace/impact-grid";
import { ObjectSearchSelect, WorkspaceScopeSelect, type SearchEntry } from "~/components/workspace/impact-picker";
import { LineageDiagram } from "~/components/workspace/lineage/lineage-diagram";
import {
  canonicalType,
  closureToLineageGraph,
  computeDependencyClosure,
  referenceKey,
  type ClosureHop,
  type DaxDependency,
  type DaxReference,
} from "~/lib/dependency-graph";
import type { GridRow } from "~/lib/grid-export";
import {
  boundReportsForModel,
  estateDiscoveryKey,
  fetchBatchedExplorer,
  fetchEstateInventory,
  modelKey,
  requestJson,
  type EstateDiscoveryResponse,
  type ParsedTable,
} from "~/lib/lineage-api";
import { cn } from "~/lib/utils";
import { useAppStore } from "~/stores/app-store";
import { usePowerAiStore } from "~/stores/power-ai-store";

type Workspace = { id: string; name: string };
type WorkspaceResponse = { workspaces: Workspace[] };
type DaxAnalysis = { dependencies: DaxDependency[]; dependency_count: number };
type MeasureSourceLineageRow = { report_id: string; semantic_table?: string | null; semantic_object_name: string };
type VisualSourceLookupRow = { report_id: string; page_id: string; visual_id: string; semantic_table?: string | null; semantic_object_name?: string | null; match_status: "matched" | "unmatched" };
type ImpactDirection = "downstream" | "upstream";

const WHOLE_TABLE = "__whole_table__";
const heavyQueryOptions = { staleTime: 5 * 60 * 1000, gcTime: 30 * 60 * 1000, retry: false };

export function TableImpact() {
  const apiOrigin = useAppStore((state) => state.apiOrigin);
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<string[] | null>(null);
  const [selectedTableKey, setSelectedTableKey] = useState("");
  const [selectedColumnKey, setSelectedColumnKey] = useState(WHOLE_TABLE);
  const [direction, setDirection] = useState<ImpactDirection>("downstream");

  const workspacesQuery = useQuery({
    queryKey: ["table-impact", "workspaces", apiOrigin],
    queryFn: () => requestJson<WorkspaceResponse>(apiOrigin, "/api/v1/workspaces?top=100&skip=0"),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const workspaces = workspacesQuery.data?.workspaces ?? [];
  useEffect(() => {
    if (workspaces.length && selectedWorkspaceIds === null) setSelectedWorkspaceIds(workspaces.map((workspace) => workspace.id));
  }, [workspaces, selectedWorkspaceIds]);
  const scopeIds = selectedWorkspaceIds ?? [];
  const scopedWorkspaces = useMemo(() => workspaces.filter((workspace) => scopeIds.includes(workspace.id)), [workspaces, scopeIds]);

  const inventoryQuery = useQuery({
    queryKey: ["table-impact", "inventory", apiOrigin, [...scopeIds].sort().join(",")],
    queryFn: () => fetchEstateInventory(apiOrigin, scopedWorkspaces),
    enabled: scopeIds.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
  });
  const tables = inventoryQuery.data?.tables ?? [];
  const tableEntries: SearchEntry[] = useMemo(() => tables.map((entry) => ({
    key: entry.key,
    searchValue: `${entry.tableName} ${entry.semanticModelName} ${entry.workspaceName}`,
    primary: entry.tableName,
    secondary: `${entry.semanticModelName} · ${entry.workspaceName}`,
  })), [tables]);
  useEffect(() => {
    if (tables.length && !tables.some((entry) => entry.key === selectedTableKey)) setSelectedTableKey(tables[0].key);
  }, [tables, selectedTableKey]);
  useEffect(() => setSelectedColumnKey(WHOLE_TABLE), [selectedTableKey]);
  const selectedEntry = tables.find((entry) => entry.key === selectedTableKey) ?? null;
  const parsedModelForEntry = selectedEntry ? inventoryQuery.data?.parsedByModel.get(modelKey(selectedEntry.workspaceId, selectedEntry.semanticModelId)) : undefined;
  const selectedTable = parsedModelForEntry?.tables.find((table) => table.name === selectedEntry?.tableName) ?? null;

  const daxQuery = useQuery({
    queryKey: ["table-impact", "dax-analysis", apiOrigin, selectedEntry?.workspaceId, selectedEntry?.semanticModelId],
    queryFn: () => requestJson<DaxAnalysis>(apiOrigin, "/api/v1/lineage/dax/analyze", { method: "POST", body: JSON.stringify(parsedModelForEntry) }),
    enabled: Boolean(parsedModelForEntry),
    ...heavyQueryOptions,
  });

  const estateQuery = useQuery({
    queryKey: estateDiscoveryKey(apiOrigin),
    queryFn: () => requestJson<EstateDiscoveryResponse>(apiOrigin, "/api/v1/lineage/estate/discover?top=5000&skip=0"),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
  });
  const boundReports = useMemo(() => boundReportsForModel(estateQuery.data, selectedEntry?.semanticModelId ?? ""), [estateQuery.data, selectedEntry]);

  const evidenceQuery = useQuery({
    queryKey: ["table-impact", "evidence", apiOrigin, selectedEntry?.semanticModelId, boundReports.map((report) => report.report_id).join(",")],
    queryFn: () => Promise.all([
      fetchBatchedExplorer<MeasureSourceLineageRow>(apiOrigin, "/api/v1/explorer/measure-source-lineage", boundReports),
      fetchBatchedExplorer<VisualSourceLookupRow>(apiOrigin, "/api/v1/explorer/visual-source-lookup", boundReports),
    ]),
    enabled: boundReports.length > 0,
    ...heavyQueryOptions,
  });

  const dependencies = daxQuery.data?.dependencies ?? [];
  const seeds = useMemo(() => (selectedTable ? tableSeeds(selectedTable, selectedColumnKey) : []), [selectedTable, selectedColumnKey]);
  const closure = useMemo(() => computeDependencyClosure(dependencies, seeds), [dependencies, seeds]);
  const hops = direction === "downstream" ? closure.downstream : closure.upstream;
  const graph = useMemo(
    () => closureToLineageGraph(direction === "downstream" ? { seeds, upstream: [], downstream: closure.downstream } : { seeds, upstream: closure.upstream, downstream: [] }, dependencies),
    [seeds, closure, direction, dependencies],
  );
  const focusNodeId = seeds.length === 1 ? referenceKey(seeds[0]) : undefined;

  const evidenceIndex = useMemo(() => buildEvidenceIndex(evidenceQuery.data), [evidenceQuery.data]);
  const rows = useMemo(() => buildImpactRows(hops, evidenceIndex, direction), [hops, evidenceIndex, direction]);
  const context = { parent_workspace_name: selectedEntry?.workspaceName ?? "", parent_workspace_id: selectedEntry?.workspaceId ?? "", parent_semantic_model_name: selectedEntry?.semanticModelName ?? "", parent_semantic_model_id: selectedEntry?.semanticModelId ?? "", parent_table_name: selectedEntry?.tableName ?? "" };
  const selectedColumnName = selectedColumnKey === WHOLE_TABLE ? undefined : selectedColumnKey;

  useEffect(() => {
    usePowerAiStore.getState().mergeContext({
      workspaceId: selectedEntry?.workspaceId,
      workspaceName: selectedEntry?.workspaceName,
      semanticModelId: selectedEntry?.semanticModelId,
      semanticModelName: selectedEntry?.semanticModelName,
      reportId: undefined,
      reportName: undefined,
      objectType: selectedEntry ? (selectedColumnName ? "column" : "table") : undefined,
      objectId: selectedEntry ? `${selectedEntry.key}${selectedColumnName ? `:${selectedColumnName}` : ""}` : undefined,
      objectName: selectedEntry ? (selectedColumnName ? `${selectedEntry.tableName}[${selectedColumnName}]` : selectedEntry.tableName) : undefined,
    });
  }, [selectedEntry, selectedColumnName]);

  if (workspacesQuery.isLoading) return <LoadingState label="Loading Power BI workspaces" />;
  if (workspacesQuery.isError) return <PowerBiAuthRequired returnTo="Table impact" />;
  if (!workspaces.length) return <EmptyState title="No Power BI workspaces found" text="The authenticated account did not return any workspaces to explore." />;

  return <section className="border border-zinc-200 bg-white">
    <div className="border-b border-zinc-200 px-5 py-5 sm:px-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[8px] bg-teal-700 text-white"><TableProperties className="size-5" /></span>
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase text-teal-700">Power BI</span><Badge className="rounded-[8px] border border-teal-200 bg-teal-50 text-teal-800">Table impact</Badge></div>
          <h1 className="text-lg font-semibold">Table impact</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500">Pick a semantic table (or one column) to see every calculation that depends on it, and every report and visual that uses those calculations.</p>
        </div>
      </div>
    </div>

    <InventoryStatus selectedWorkspaceCount={scopeIds.length} isLoading={inventoryQuery.isFetching} isError={inventoryQuery.isError} tableCount={tables.length} skippedCount={inventoryQuery.data?.skipped.length ?? 0} onRefresh={() => void inventoryQuery.refetch()} />

    <div className="grid gap-4 border-b border-zinc-200 bg-[#fafbfc] px-5 py-4 sm:px-6 md:grid-cols-4">
      <WorkspaceScopeSelect id="table-impact-scope" label="Workspace scope" workspaces={workspaces} selectedIds={scopeIds} onChange={setSelectedWorkspaceIds} />
      <ObjectSearchSelect id="table-impact-table" label="Table" placeholder="Search a table by name..." entries={tableEntries} selectedKey={selectedTableKey} onChange={setSelectedTableKey} emptyText="No tables indexed for the selected workspace scope yet." />
      <LabelSelect id="table-impact-column" label="Column" value={selectedColumnKey} options={[{ value: WHOLE_TABLE, label: "Whole table" }, ...(selectedTable?.columns.map((column) => ({ value: column.name, label: column.name })) ?? [])]} onChange={setSelectedColumnKey} />
      <DirectionToggle value={direction} onChange={setDirection} />
    </div>

    <div className="space-y-4 p-5 sm:p-6">
      {!selectedEntry && <EmptyState title="No table selected" text="Choose a workspace scope and search for a table above to run impact analysis." />}
      {selectedEntry && <>
        <ExactLineageStatus loading={daxQuery.isLoading} error={daxQuery.isError} dax={daxQuery.data} />
        <EvidenceStatus estateError={estateQuery.isError} boundCount={boundReports.length} loading={evidenceQuery.isLoading} truncated={Boolean(evidenceQuery.data?.[0]?.truncated || evidenceQuery.data?.[1]?.truncated)} totalBound={boundReports.length} />
        <div className="flex justify-end">
          <AskPowerAiButton
            context={{
              workspaceId: selectedEntry.workspaceId,
              workspaceName: selectedEntry.workspaceName,
              semanticModelId: selectedEntry.semanticModelId,
              semanticModelName: selectedEntry.semanticModelName,
              objectType: selectedColumnName ? "column" : "table",
              objectId: `${selectedEntry.key}${selectedColumnName ? `:${selectedColumnName}` : ""}`,
              objectName: selectedColumnName ? `${selectedEntry.tableName}[${selectedColumnName}]` : selectedEntry.tableName,
            }}
            question={selectedColumnName ? `Explain the ${selectedEntry.tableName}[${selectedColumnName}] column` : `Explain the ${selectedEntry.tableName} table`}
          />
        </div>
        <LineageDiagram
          direction="LR"
          graph={graph}
          focusNodeId={focusNodeId}
          title={selectedColumnKey === WHOLE_TABLE ? `${selectedEntry.tableName} impact` : `${selectedEntry.tableName}[${selectedColumnKey}] impact`}
          description={direction === "downstream" ? "Calculations that depend on the selected table or column, directly or transitively." : "Inputs that the selected table or column's calculated members depend on."}
          emptyText={direction === "downstream" ? "No downstream calculations depend on this selection." : "No upstream dependencies were found for this selection."}
        />
        <ImpactGrid
          rowData={rows}
          columnDefs={impactColumnDefs}
          emptyMessage="No impacted objects were found for the current selection."
          exportFileName={`${filePart(selectedEntry.semanticModelName)}-${filePart(selectedEntry.tableName)}-table-impact-${direction}`}
          exportContext={context}
        />
      </>}
    </div>
  </section>;
}

const impactColumnDefs: ColDef<GridRow>[] = [
  { field: "table", headerName: "Table", minWidth: 160 },
  { field: "object", headerName: "Object", minWidth: 200, flex: 1 },
  { field: "type", headerName: "Type", minWidth: 150 },
  { field: "depth", headerName: "Depth", minWidth: 90 },
  { field: "directness", headerName: "Direct / transitive", minWidth: 150 },
  { field: "sampleReference", headerName: "Sample reference", minWidth: 220, flex: 1 },
  { field: "reportCount", headerName: "Reports", minWidth: 110 },
  { field: "visualCount", headerName: "Visuals", minWidth: 110 },
];

function tableSeeds(table: ParsedTable, columnKey: string): DaxReference[] {
  if (columnKey !== WHOLE_TABLE) {
    const column = table.columns.find((candidate) => candidate.name === columnKey);
    if (!column) return [];
    return [{ object_type: column.expression ? "calculated_column" : "column", table_name: table.name, object_name: column.name, qualified_name: `${table.name}[${column.name}]` }];
  }
  const seeds: DaxReference[] = table.columns.map((column) => ({ object_type: column.expression ? "calculated_column" : "column", table_name: table.name, object_name: column.name, qualified_name: `${table.name}[${column.name}]` }));
  table.measures.forEach((measure) => seeds.push({ object_type: "measure", table_name: table.name, object_name: measure.name, qualified_name: `${table.name}[${measure.name}]` }));
  if (table.expression) seeds.push({ object_type: "calculated_table", table_name: table.name, object_name: table.name, qualified_name: table.name });
  return seeds;
}

type Evidence = { reportIds: Set<string>; visualKeys: Set<string> };
type EvidenceData = [{ rows: MeasureSourceLineageRow[]; truncated: boolean }, { rows: VisualSourceLookupRow[]; truncated: boolean }];

function evidenceKey(table: string | null | undefined, name: string) {
  return `${(table ?? "").trim().toLocaleLowerCase()}[${name.trim().toLocaleLowerCase()}]`;
}

function buildEvidenceIndex(data: EvidenceData | undefined) {
  const index = new Map<string, Evidence>();
  function ensure(key: string) {
    if (!index.has(key)) index.set(key, { reportIds: new Set(), visualKeys: new Set() });
    return index.get(key)!;
  }
  data?.[0].rows.forEach((row) => ensure(evidenceKey(row.semantic_table, row.semantic_object_name)).reportIds.add(row.report_id));
  data?.[1].rows.forEach((row) => {
    if (row.match_status !== "matched" || !row.semantic_object_name) return;
    const entry = ensure(evidenceKey(row.semantic_table, row.semantic_object_name));
    entry.reportIds.add(row.report_id);
    entry.visualKeys.add(`${row.report_id}:${row.page_id}:${row.visual_id}`);
  });
  return index;
}

function buildImpactRows(hops: ClosureHop[], evidenceIndex: Map<string, Evidence>, direction: ImpactDirection): GridRow[] {
  return hops.map((hop, index) => {
    const evidence = evidenceIndex.get(evidenceKey(hop.reference.table_name, hop.reference.object_name));
    return {
      id: `${direction}-${index}-${referenceKey(hop.reference)}`,
      table: hop.reference.table_name ?? "--",
      object: hop.reference.object_name,
      type: displayType(hop.reference.object_type),
      depth: hop.depth,
      directness: hop.depth === 1 ? "Direct" : "Transitive",
      sampleReference: hop.referenceText,
      reportCount: evidence?.reportIds.size ?? 0,
      visualCount: evidence?.visualKeys.size ?? 0,
    };
  });
}

function displayType(value: string) {
  return canonicalType(value).split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function InventoryStatus({ selectedWorkspaceCount, isLoading, isError, tableCount, skippedCount, onRefresh }: { selectedWorkspaceCount: number; isLoading: boolean; isError: boolean; tableCount: number; skippedCount: number; onRefresh: () => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-[#fafbfc] px-5 py-2.5 text-xs sm:px-6">
    <span className="text-zinc-500">
      {!selectedWorkspaceCount
        ? "Select at least one workspace to build the table inventory."
        : isLoading
          ? "Building table inventory across the selected workspaces..."
          : isError
            ? "Table inventory is unavailable for this identity."
            : `${tableCount} ${tableCount === 1 ? "table" : "tables"} indexed across ${selectedWorkspaceCount} ${selectedWorkspaceCount === 1 ? "workspace" : "workspaces"}.${skippedCount ? ` ${skippedCount} model(s) skipped (no access).` : ""}`}
    </span>
    <Button type="button" variant="outline" size="sm" disabled={!selectedWorkspaceCount || isLoading} onClick={onRefresh}>{isLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Refresh inventory</Button>
  </div>;
}

function ExactLineageStatus({ loading, error, dax }: { loading: boolean; error: boolean; dax: DaxAnalysis | undefined }) {
  if (loading) return <div className="flex items-center gap-2 border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900"><Loader2 className="size-3.5 animate-spin" />Preparing exact DAX dependencies in the background</div>;
  if (error) return <StatusBand tone="warning" text="Exact DAX analysis is unavailable for this identity. Table impact requires elevated backend access to compute dependencies." />;
  if (dax) return <StatusBand tone="success" text={`${dax.dependency_count} exact DAX ${dax.dependency_count === 1 ? "relationship" : "relationships"} ready`} />;
  return null;
}

function EvidenceStatus({ estateError, boundCount, loading, truncated, totalBound }: { estateError: boolean; boundCount: number; loading: boolean; truncated: boolean; totalBound: number }) {
  if (estateError) return <StatusBand tone="warning" text="Estate discovery is unavailable for this identity. Report and visual evidence cannot be computed, but the dependency diagram above remains accurate." />;
  if (!boundCount) return <StatusBand tone="warning" text="No reports in the accessible estate are currently bound to this semantic model." />;
  if (loading) return <div className="flex items-center gap-2 border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900"><Loader2 className="size-3.5 animate-spin" />Checking {boundCount} bound {boundCount === 1 ? "report" : "reports"} for evidence</div>;
  if (truncated) return <StatusBand tone="warning" text={`Evidence was computed from the first 300 of ${totalBound} bound reports.`} />;
  return <StatusBand tone="success" text={`Evidence checked across ${boundCount} bound ${boundCount === 1 ? "report" : "reports"}.`} />;
}

function StatusBand({ tone, text }: { tone: "success" | "warning"; text: string }) {
  return <div className={cn("border px-3 py-2 text-xs", tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900")}>{text}</div>;
}

function DirectionToggle({ value, onChange }: { value: ImpactDirection; onChange: (value: ImpactDirection) => void }) {
  return <div className="space-y-1.5">
    <span className="text-xs font-semibold text-zinc-600">Direction</span>
    <div className="flex h-10 rounded-md border border-zinc-200 bg-white p-1">
      <button type="button" onClick={() => onChange("downstream")} className={cn("flex flex-1 items-center justify-center gap-1.5 rounded text-xs font-medium", value === "downstream" ? "bg-teal-700 text-white" : "text-zinc-600 hover:text-zinc-950")}><ArrowDownToLine className="size-3.5" />Downstream</button>
      <button type="button" onClick={() => onChange("upstream")} className={cn("flex flex-1 items-center justify-center gap-1.5 rounded text-xs font-medium", value === "upstream" ? "bg-teal-700 text-white" : "text-zinc-600 hover:text-zinc-950")}><ArrowUpToLine className="size-3.5" />Upstream</button>
    </div>
  </div>;
}

function LabelSelect({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return <div className="space-y-1.5"><label className="text-xs font-semibold text-zinc-600" htmlFor={id}>{label}</label><select id={id} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
}

function LoadingState({ label, compact }: { label: string; compact?: boolean }) {
  return <div className={cn("flex items-center justify-center gap-2 text-sm text-zinc-500", compact ? "py-4" : "min-h-[320px]")}><Loader2 className="size-4 animate-spin" />{label}</div>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="border border-zinc-200 bg-white p-10 text-center"><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-sm text-zinc-500">{text}</p></div>;
}

function filePart(value: string | undefined) {
  return (value ?? "table-impact").trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "table-impact";
}
