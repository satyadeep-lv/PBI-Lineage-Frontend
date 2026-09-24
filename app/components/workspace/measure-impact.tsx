import { useQuery } from "@tanstack/react-query";
import type { ColDef } from "ag-grid-community";
import { Loader2, RefreshCw, Sigma } from "lucide-react";
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
  daxAnalysisKey,
  estateDiscoveryKey,
  ESTATE_DISCOVER_PATH,
  estateInventoryKey,
  fetchBatchedExplorer,
  fetchEstateInventory,
  modelKey,
  requestJson,
  WORKSPACE_LIST_PATH,
  workspaceListKey,
  type EstateDiscoveryResponse,
} from "~/lib/lineage-api";
import { cn } from "~/lib/utils";
import { useAppStore } from "~/stores/app-store";
import { usePowerAiStore } from "~/stores/power-ai-store";

type Workspace = { id: string; name: string };
type WorkspaceResponse = { workspaces: Workspace[] };
type DaxAnalysis = { dependencies: DaxDependency[]; dependency_count: number };
type MeasureSourceLineageRow = { report_id: string; semantic_table?: string | null; semantic_object_name: string };
type VisualSourceLookupRow = { report_id: string; page_id: string; visual_id: string; semantic_table?: string | null; semantic_object_name?: string | null; match_status: "matched" | "unmatched" };
type ImpactDirection = "upstream" | "downstream";

export function MeasureImpact() {
  const apiOrigin = useAppStore((state) => state.apiOrigin);
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<string[] | null>(null);
  const [selectedMeasureKey, setSelectedMeasureKey] = useState("");

  const workspacesQuery = useQuery({
    queryKey: workspaceListKey(apiOrigin),
    queryFn: () => requestJson<WorkspaceResponse>(apiOrigin, WORKSPACE_LIST_PATH),
  });
  const workspaces = workspacesQuery.data?.workspaces ?? [];
  useEffect(() => {
    if (workspaces.length && selectedWorkspaceIds === null) setSelectedWorkspaceIds(workspaces.map((workspace) => workspace.id));
  }, [workspaces, selectedWorkspaceIds]);
  const scopeIds = selectedWorkspaceIds ?? [];
  const scopedWorkspaces = useMemo(() => workspaces.filter((workspace) => scopeIds.includes(workspace.id)), [workspaces, scopeIds]);

  const inventoryQuery = useQuery({
    queryKey: estateInventoryKey(apiOrigin, scopeIds),
    queryFn: () => fetchEstateInventory(apiOrigin, scopedWorkspaces),
    enabled: scopeIds.length > 0,
  });
  const measures = inventoryQuery.data?.measures ?? [];
  const measureEntries: SearchEntry[] = useMemo(() => measures.map((entry) => ({
    key: entry.key,
    searchValue: `${entry.measureName} ${entry.tableName} ${entry.semanticModelName} ${entry.workspaceName}`,
    primary: `${entry.tableName}[${entry.measureName}]`,
    secondary: `${entry.semanticModelName} · ${entry.workspaceName}`,
  })), [measures]);
  useEffect(() => {
    if (measures.length && !measures.some((entry) => entry.key === selectedMeasureKey)) setSelectedMeasureKey(measures[0].key);
  }, [measures, selectedMeasureKey]);
  const selectedEntry = measures.find((entry) => entry.key === selectedMeasureKey) ?? null;
  const parsedModelForEntry = selectedEntry ? inventoryQuery.data?.parsedByModel.get(modelKey(selectedEntry.workspaceId, selectedEntry.semanticModelId)) : undefined;

  const daxQuery = useQuery({
    queryKey: daxAnalysisKey(apiOrigin, selectedEntry?.workspaceId ?? "", selectedEntry?.semanticModelId ?? ""),
    queryFn: () => requestJson<DaxAnalysis>(apiOrigin, "/api/v1/lineage/dax/analyze", { method: "POST", body: JSON.stringify(parsedModelForEntry) }),
    enabled: Boolean(parsedModelForEntry),
  });

  const estateQuery = useQuery({
    queryKey: estateDiscoveryKey(apiOrigin),
    queryFn: () => requestJson<EstateDiscoveryResponse>(apiOrigin, ESTATE_DISCOVER_PATH),
  });
  const boundReports = useMemo(() => boundReportsForModel(estateQuery.data, selectedEntry?.semanticModelId ?? ""), [estateQuery.data, selectedEntry]);

  const evidenceQuery = useQuery({
    queryKey: ["measure-impact", "evidence", apiOrigin, selectedEntry?.semanticModelId, boundReports.map((report) => report.report_id).join(",")],
    queryFn: () => Promise.all([
      fetchBatchedExplorer<MeasureSourceLineageRow>(apiOrigin, "/api/v1/explorer/measure-source-lineage", boundReports),
      fetchBatchedExplorer<VisualSourceLookupRow>(apiOrigin, "/api/v1/explorer/visual-source-lookup", boundReports),
    ]),
    enabled: boundReports.length > 0,
  });

  const seed: DaxReference | null = selectedEntry && selectedEntry.measureName
    ? { object_type: "measure", table_name: selectedEntry.tableName, object_name: selectedEntry.measureName, qualified_name: `${selectedEntry.tableName}[${selectedEntry.measureName}]` }
    : null;
  const dependencies = daxQuery.data?.dependencies ?? [];
  const closure = useMemo(() => computeDependencyClosure(dependencies, seed ? [seed] : []), [dependencies, seed]);
  const graph = useMemo(() => closureToLineageGraph(closure, dependencies), [closure, dependencies]);
  const focusNodeId = seed ? referenceKey(seed) : undefined;

  const evidenceIndex = useMemo(() => buildEvidenceIndex(evidenceQuery.data), [evidenceQuery.data]);
  const rows = useMemo(() => buildImpactRows(closure.upstream, closure.downstream, evidenceIndex), [closure, evidenceIndex]);
  const context = { parent_workspace_name: selectedEntry?.workspaceName ?? "", parent_workspace_id: selectedEntry?.workspaceId ?? "", parent_semantic_model_name: selectedEntry?.semanticModelName ?? "", parent_semantic_model_id: selectedEntry?.semanticModelId ?? "", parent_measure_name: selectedEntry?.measureName ?? "" };

  useEffect(() => {
    usePowerAiStore.getState().mergeContext({
      workspaceId: selectedEntry?.workspaceId,
      workspaceName: selectedEntry?.workspaceName,
      semanticModelId: selectedEntry?.semanticModelId,
      semanticModelName: selectedEntry?.semanticModelName,
      // An inventory entry is indexed under the workspace its model lives in.
      semanticModelWorkspaceId: selectedEntry?.workspaceId,
      reportId: undefined,
      reportName: undefined,
      objectType: selectedEntry ? "measure" : undefined,
      objectId: selectedEntry?.key,
      objectName: selectedEntry ? `${selectedEntry.tableName}[${selectedEntry.measureName}]` : undefined,
    });
  }, [selectedEntry]);

  if (workspacesQuery.isLoading) return <LoadingState label="Loading Power BI workspaces" />;
  if (workspacesQuery.isError) return <PowerBiAuthRequired returnTo="Measure impact" />;
  if (!workspaces.length) return <EmptyState title="No Power BI workspaces found" text="The authenticated account did not return any workspaces to explore." />;

  return <section className="border border-zinc-200 bg-white">
    <div className="border-b border-zinc-200 px-5 py-5 sm:px-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[8px] bg-teal-700 text-white"><Sigma className="size-5" /></span>
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase text-teal-700">Power BI</span><Badge className="rounded-[8px] border border-teal-200 bg-teal-50 text-teal-800">Measure impact</Badge></div>
          <h1 className="text-lg font-semibold">Measure impact</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500">Pick a measure to see the columns and measures it depends on, the measures that depend on it, and every report and visual that uses them.</p>
        </div>
      </div>
    </div>

    <InventoryStatus selectedWorkspaceCount={scopeIds.length} isLoading={inventoryQuery.isFetching} isError={inventoryQuery.isError} entryCount={measures.length} skippedCount={inventoryQuery.data?.skipped.length ?? 0} onRefresh={() => void inventoryQuery.refetch()} />

    <div className="grid gap-4 border-b border-zinc-200 bg-[#fafbfc] px-5 py-4 sm:px-6 md:grid-cols-2">
      <WorkspaceScopeSelect id="measure-impact-scope" label="Workspace scope" workspaces={workspaces} selectedIds={scopeIds} onChange={setSelectedWorkspaceIds} />
      <ObjectSearchSelect id="measure-impact-measure" label="Measure" placeholder="Search a measure by name..." entries={measureEntries} selectedKey={selectedMeasureKey} onChange={setSelectedMeasureKey} emptyText="No measures indexed for the selected workspace scope yet." />
    </div>

    <div className="space-y-4 p-5 sm:p-6">
      {!selectedEntry && <EmptyState title="No measure selected" text="Choose a workspace scope and search for a measure above to run impact analysis." />}
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
              semanticModelWorkspaceId: selectedEntry.workspaceId,
              objectType: "measure",
              objectId: selectedEntry.key,
              objectName: `${selectedEntry.tableName}[${selectedEntry.measureName}]`,
            }}
            question="Explain this measure"
          />
        </div>
        <LineageDiagram
          direction="LR"
          graph={graph}
          focusNodeId={focusNodeId}
          title={`${selectedEntry.tableName}[${selectedEntry.measureName}] impact`}
          description="Upstream inputs flow in from the left; dependent measures, reports, and visuals flow out to the right."
          emptyText="No DAX dependencies were found for the selected measure."
        />
        <ImpactGrid
          rowData={rows}
          columnDefs={impactColumnDefs}
          emptyMessage="No impacted objects were found for the current selection."
          exportFileName={`${filePart(selectedEntry.semanticModelName)}-${filePart(selectedEntry.measureName)}-measure-impact`}
          exportContext={context}
        />
      </>}
    </div>
  </section>;
}

const impactColumnDefs: ColDef<GridRow>[] = [
  { field: "direction", headerName: "Direction", minWidth: 130 },
  { field: "table", headerName: "Table", minWidth: 160 },
  { field: "object", headerName: "Object", minWidth: 200, flex: 1 },
  { field: "type", headerName: "Type", minWidth: 150 },
  { field: "depth", headerName: "Depth", minWidth: 90 },
  { field: "directness", headerName: "Direct / transitive", minWidth: 150 },
  { field: "sampleReference", headerName: "Sample reference", minWidth: 220, flex: 1 },
  { field: "reportCount", headerName: "Reports", minWidth: 110 },
  { field: "visualCount", headerName: "Visuals", minWidth: 110 },
];

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

function buildImpactRows(upstream: ClosureHop[], downstream: ClosureHop[], evidenceIndex: Map<string, Evidence>): GridRow[] {
  function toRows(hops: ClosureHop[], direction: ImpactDirection) {
    return hops.map((hop, index) => {
      const evidence = evidenceIndex.get(evidenceKey(hop.reference.table_name, hop.reference.object_name));
      return {
        id: `${direction}-${index}-${referenceKey(hop.reference)}`,
        direction: direction === "upstream" ? "Upstream" : "Downstream",
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
  return [...toRows(upstream, "upstream"), ...toRows(downstream, "downstream")];
}

function displayType(value: string) {
  return canonicalType(value).split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function InventoryStatus({ selectedWorkspaceCount, isLoading, isError, entryCount, skippedCount, onRefresh }: { selectedWorkspaceCount: number; isLoading: boolean; isError: boolean; entryCount: number; skippedCount: number; onRefresh: () => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-[#fafbfc] px-5 py-2.5 text-xs sm:px-6">
    <span className="text-zinc-500">
      {!selectedWorkspaceCount
        ? "Select at least one workspace to build the measure inventory."
        : isLoading
          ? "Building measure inventory across the selected workspaces..."
          : isError
            ? "Measure inventory is unavailable for this identity."
            : `${entryCount} ${entryCount === 1 ? "measure" : "measures"} indexed across ${selectedWorkspaceCount} ${selectedWorkspaceCount === 1 ? "workspace" : "workspaces"}.${skippedCount ? ` ${skippedCount} model(s) skipped (no access).` : ""}`}
    </span>
    <Button type="button" variant="outline" size="sm" disabled={!selectedWorkspaceCount || isLoading} onClick={onRefresh}>{isLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Refresh inventory</Button>
  </div>;
}

function ExactLineageStatus({ loading, error, dax }: { loading: boolean; error: boolean; dax: DaxAnalysis | undefined }) {
  if (loading) return <div className="flex items-center gap-2 border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900"><Loader2 className="size-3.5 animate-spin" />Preparing exact DAX dependencies in the background</div>;
  if (error) return <StatusBand tone="warning" text="Exact DAX analysis is unavailable for this identity. Measure impact requires elevated backend access to compute dependencies." />;
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

function LoadingState({ label, compact }: { label: string; compact?: boolean }) {
  return <div className={cn("flex items-center justify-center gap-2 text-sm text-zinc-500", compact ? "py-4" : "min-h-[320px]")}><Loader2 className="size-4 animate-spin" />{label}</div>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="border border-zinc-200 bg-white p-10 text-center"><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-sm text-zinc-500">{text}</p></div>;
}

function filePart(value: string | undefined) {
  return (value ?? "measure-impact").trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "measure-impact";
}
