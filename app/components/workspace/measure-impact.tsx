import { useQuery } from "@tanstack/react-query";
import type { ColDef } from "ag-grid-community";
import { ArrowUpToLine, FileBarChart2, Layers3, Loader2, MonitorPlay, RefreshCw, Sigma, TableProperties } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { AskPowerAiButton } from "~/components/power-ai/ask-power-ai-button";
import { PowerBiAuthRequired } from "~/components/workspace/auth-required";
import { ImpactGrid } from "~/components/workspace/impact-grid";
import { buildImpactGraph, ImpactLineageDiagram } from "~/components/workspace/impact-lineage";
import { ObjectSearchSelect, WorkspaceScopeSelect, type SearchEntry } from "~/components/workspace/impact-picker";
import { EmptyState, EvidenceStatus, ImpactSection, LoadingState, StatusBand, SummaryTile } from "~/components/workspace/impact-ui";
import { canonicalType, computeDependencyClosure, referenceKey, referenceLabel, type ClosureHop, type DaxDependency, type DaxReference } from "~/lib/dependency-graph";
import type { GridRow } from "~/lib/grid-export";
import {
  buildEvidenceIndex,
  buildReportNames,
  displayType,
  evidenceKey,
  fetchImpactEvidence,
  impactEvidenceKey,
  tableSources,
  type EstateWithReports,
  type EvidenceIndex,
  type ReportDisplayName,
  type SourcedTable,
} from "~/lib/impact-analysis";
import {
  boundReportsForModel,
  daxAnalysisKey,
  estateDiscoveryKey,
  ESTATE_DISCOVER_PATH,
  estateInventoryKey,
  fetchEstateInventory,
  modelKey,
  requestJson,
  WORKSPACE_LIST_PATH,
  workspaceListKey,
  type InventoryEntry,
  type ParsedSemanticModel,
} from "~/lib/lineage-api";
import { useAppStore } from "~/stores/app-store";
import { usePowerAiStore } from "~/stores/power-ai-store";

type Workspace = { id: string; name: string };
type WorkspaceResponse = { workspaces: Workspace[] };
type DaxAnalysis = { dependencies: DaxDependency[]; dependency_count: number };

/**
 * Pick a measure and see everything it touches: the tables it reads and the
 * tables holding calculations built on it, the other measures it impacts, its
 * semantic model, and every report and visual that shows it or an impacted
 * measure.
 */
export function MeasureImpact() {
  const apiOrigin = useAppStore((state) => state.apiOrigin);
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<string[] | null>(null);
  const [selectedMeasureKey, setSelectedMeasureKey] = useState("");

  const workspacesQuery = useQuery({
    queryKey: workspaceListKey(apiOrigin),
    queryFn: () => requestJson<WorkspaceResponse>(apiOrigin, WORKSPACE_LIST_PATH),
  });
  const workspaces = useMemo(() => workspacesQuery.data?.workspaces ?? [], [workspacesQuery.data]);
  useEffect(() => {
    if (workspaces.length && selectedWorkspaceIds === null) setSelectedWorkspaceIds(workspaces.map((workspace) => workspace.id));
  }, [workspaces, selectedWorkspaceIds]);
  const scopeIds = useMemo(() => selectedWorkspaceIds ?? [], [selectedWorkspaceIds]);
  const scopedWorkspaces = useMemo(() => workspaces.filter((workspace) => scopeIds.includes(workspace.id)), [workspaces, scopeIds]);

  const inventoryQuery = useQuery({
    queryKey: estateInventoryKey(apiOrigin, scopeIds),
    queryFn: () => fetchEstateInventory(apiOrigin, scopedWorkspaces),
    enabled: scopeIds.length > 0,
  });
  const measures = useMemo(() => inventoryQuery.data?.measures ?? [], [inventoryQuery.data]);
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
  const selectedModelKey = selectedEntry ? modelKey(selectedEntry.workspaceId, selectedEntry.semanticModelId) : "";
  const parsedModel = selectedEntry ? inventoryQuery.data?.parsedByModel.get(selectedModelKey) : undefined;

  const daxQuery = useQuery({
    queryKey: daxAnalysisKey(apiOrigin, selectedEntry?.workspaceId ?? "", selectedEntry?.semanticModelId ?? ""),
    queryFn: () => requestJson<DaxAnalysis>(apiOrigin, "/api/v1/lineage/dax/analyze", { method: "POST", body: JSON.stringify(parsedModel) }),
    enabled: Boolean(parsedModel),
  });

  const estateQuery = useQuery({
    queryKey: estateDiscoveryKey(apiOrigin),
    queryFn: () => requestJson<EstateWithReports>(apiOrigin, ESTATE_DISCOVER_PATH),
    enabled: Boolean(selectedEntry),
  });
  const boundReports = useMemo(() => boundReportsForModel(estateQuery.data, selectedEntry?.semanticModelId ?? ""), [estateQuery.data, selectedEntry]);
  const evidenceQuery = useQuery({
    queryKey: impactEvidenceKey("measure-impact", apiOrigin, selectedEntry?.semanticModelId ?? "", boundReports),
    queryFn: () => fetchImpactEvidence(apiOrigin, boundReports),
    enabled: boundReports.length > 0,
  });

  const seed = useMemo<DaxReference | null>(
    () => (selectedEntry?.measureName ? { object_type: "measure", table_name: selectedEntry.tableName, object_name: selectedEntry.measureName, qualified_name: `${selectedEntry.tableName}[${selectedEntry.measureName}]` } : null),
    [selectedEntry],
  );
  const dependencies = useMemo(() => daxQuery.data?.dependencies ?? [], [daxQuery.data]);
  const closure = useMemo(() => computeDependencyClosure(dependencies, seed ? [seed] : []), [dependencies, seed]);
  const evidence = useMemo(() => buildEvidenceIndex(evidenceQuery.data), [evidenceQuery.data]);
  const reportNames = useMemo(() => buildReportNames(estateQuery.data, [evidence]), [estateQuery.data, evidence]);
  const sourcesByTable = useMemo(() => new Map((parsedModel?.tables ?? []).map((table) => [table.name, tableSources(table as SourcedTable)] as const)), [parsedModel]);
  const analysis = useMemo(
    () => (selectedEntry && seed ? analyzeMeasure(selectedEntry, seed, closure.upstream, closure.downstream, evidence, reportNames, sourcesByTable, parsedModel, boundReports.length) : null),
    [selectedEntry, seed, closure, evidence, reportNames, sourcesByTable, parsedModel, boundReports.length],
  );
  const impactGraph = useMemo(() => (selectedEntry && seed
    ? buildImpactGraph([{
      model: { key: selectedModelKey, name: selectedEntry.semanticModelName, workspaceName: selectedEntry.workspaceName },
      focal: [seed],
      members: [...closure.upstream, ...closure.downstream].map((hop) => hop.reference),
      dependencies,
      evidence,
      tableSources: sourcesByTable,
    }], reportNames)
    : null), [selectedEntry, seed, selectedModelKey, closure, dependencies, evidence, sourcesByTable, reportNames]);

  const measureLabel = selectedEntry ? `${selectedEntry.tableName}[${selectedEntry.measureName}]` : "";
  const exportContext = { parent_workspace_name: selectedEntry?.workspaceName ?? "", parent_workspace_id: selectedEntry?.workspaceId ?? "", parent_semantic_model_name: selectedEntry?.semanticModelName ?? "", parent_semantic_model_id: selectedEntry?.semanticModelId ?? "", parent_measure: measureLabel };
  const filePrefix = `${filePart(selectedEntry?.semanticModelName)}-${filePart(selectedEntry?.measureName)}`;

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

  const usagePending = evidenceQuery.isLoading || estateQuery.isLoading;
  const usageEmpty = estateQuery.isError ? "Usage is unavailable because estate discovery failed." : usagePending || daxQuery.isLoading ? "Checking reports..." : undefined;
  const daxEmpty = daxQuery.isLoading ? "Preparing exact DAX dependencies..." : daxQuery.isError ? "Exact DAX analysis is unavailable for this identity." : undefined;

  return <section className="overflow-hidden rounded-lg border border-border bg-surface">
    <div className="border-b border-border px-5 py-5 sm:px-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-fabric text-primary-foreground"><Sigma className="size-5" /></span>
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase text-fabric">Power BI</span><Badge className="rounded-md border border-fabric/25 bg-accent text-accent-foreground">Measure impact</Badge></div>
          <h1 className="text-lg font-semibold">Measure impact</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Pick a measure to see the tables it reads and affects, the other measures it impacts, its semantic model, and every report and visual that shows it.</p>
        </div>
      </div>
    </div>

    <InventoryStatus selectedWorkspaceCount={scopeIds.length} isLoading={inventoryQuery.isFetching} isError={inventoryQuery.isError} entryCount={measures.length} skippedCount={inventoryQuery.data?.skipped.length ?? 0} onRefresh={() => void inventoryQuery.refetch()} />

    <div className="grid gap-4 border-b border-border bg-subtle px-5 py-4 sm:px-6 md:grid-cols-2">
      <WorkspaceScopeSelect id="measure-impact-scope" label="Workspace scope" workspaces={workspaces} selectedIds={scopeIds} onChange={setSelectedWorkspaceIds} />
      <ObjectSearchSelect id="measure-impact-measure" label="Measure" placeholder="Search a measure by name..." entries={measureEntries} selectedKey={selectedMeasureKey} onChange={setSelectedMeasureKey} emptyText="No measures indexed for the selected workspace scope yet." />
    </div>

    <div className="space-y-6 p-5 sm:p-6">
      {!selectedEntry && <EmptyState title="No measure selected" text="Choose a workspace scope and search for a measure above to run impact analysis." />}
      {selectedEntry && analysis && impactGraph && <>
        <div className="space-y-2">
          <ExactLineageStatus loading={daxQuery.isLoading} error={daxQuery.isError} dax={daxQuery.data} />
          <EvidenceStatus estateLoading={estateQuery.isLoading} estateError={estateQuery.isError} boundCount={boundReports.length} loading={evidenceQuery.isLoading} truncated={Boolean(evidenceQuery.data?.truncated)} noBoundText="No reports in the accessible estate are bound to this semantic model." />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryTile icon={TableProperties} label="Tables" value={analysis.tableRows.length} caption="Read by it or holding calculations on it" pending={daxQuery.isLoading} />
          <SummaryTile icon={Sigma} label="Measures impacted" value={analysis.impactedMeasureRows.length} caption="Depending on it, directly or transitively" pending={daxQuery.isLoading} />
          <SummaryTile icon={Layers3} label="Semantic models" value={analysis.modelRows.length} caption={selectedEntry.semanticModelName} pending={false} />
          <SummaryTile icon={FileBarChart2} label="Reports" value={analysis.reportRows.length} caption="With a visual showing it or an impacted measure" pending={usagePending} />
          <SummaryTile icon={MonitorPlay} label="Visuals" value={analysis.visualRows.length} caption="Showing it or an impacted measure" pending={usagePending} />
        </div>

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
              objectName: measureLabel,
            }}
            question="Explain this measure"
          />
        </div>

        <ImpactLineageDiagram
          graph={impactGraph.graph}
          focusNodeId={`${selectedModelKey}|${referenceKey(seed!)}`}
          title={`${measureLabel} impact`}
          description="Database tables and the semantic model feed the tables and columns the measure reads; the measure flows down through the measures that depend on it to the reports and visuals that show them."
          emptyText="No DAX dependencies or report usage were found for the selected measure."
          hiddenReports={impactGraph.hiddenReports}
          hiddenVisuals={impactGraph.hiddenVisuals}
        />

        <ImpactSection icon={TableProperties} title="Tables" text="The measure's home table, the tables whose columns and measures it reads, and the tables holding measures or calculated columns that depend on it.">
          <ImpactGrid rowData={analysis.tableRows} columnDefs={tableColumnDefs} emptyMessage={daxEmpty ?? "No tables are connected to this measure."} exportFileName={`${filePrefix}-tables`} exportContext={exportContext} fitRows />
        </ImpactSection>

        <ImpactSection icon={Sigma} title={`Measures impacted by ${measureLabel}`} text="Every measure that reads this measure, directly or through another calculation — each one changes when this measure changes.">
          <ImpactGrid rowData={analysis.impactedMeasureRows} columnDefs={impactedMeasureColumnDefs} emptyMessage={daxEmpty ?? "No other measure depends on this measure."} exportFileName={`${filePrefix}-impacted-measures`} exportContext={exportContext} fitRows />
        </ImpactSection>

        <ImpactSection icon={Layers3} title="Semantic model" text="The semantic model holding the measure, with how much of it the measure impacts and how many bound reports show it.">
          <ImpactGrid rowData={analysis.modelRows} columnDefs={modelColumnDefs} emptyMessage="The semantic model could not be resolved." exportFileName={`${filePrefix}-semantic-model`} exportContext={exportContext} fitRows />
        </ImpactSection>

        <ImpactSection icon={FileBarChart2} title="Reports" text="Reports with at least one visual that shows this measure directly, or shows a measure or calculation that depends on it.">
          <ImpactGrid rowData={analysis.reportRows} columnDefs={reportColumnDefs} emptyMessage={usageEmpty ?? "No report visual shows this measure or anything depending on it."} exportFileName={`${filePrefix}-reports`} exportContext={exportContext} fitRows />
        </ImpactSection>

        <ImpactSection icon={MonitorPlay} title="Visuals" text="Every visual showing this measure or an impacted measure, with its page and report.">
          <ImpactGrid rowData={analysis.visualRows} columnDefs={visualColumnDefs} emptyMessage={usageEmpty ?? "No visual shows this measure or anything depending on it."} exportFileName={`${filePrefix}-visuals`} exportContext={exportContext} fitRows />
        </ImpactSection>

        <ImpactSection icon={ArrowUpToLine} title={`Inputs ${measureLabel} reads`} text="Columns and measures this measure depends on, directly or transitively, with the database table behind each column.">
          <ImpactGrid rowData={analysis.inputRows} columnDefs={inputColumnDefs} emptyMessage={daxEmpty ?? "This measure reads no other semantic objects."} exportFileName={`${filePrefix}-inputs`} exportContext={exportContext} fitRows />
        </ImpactSection>
      </>}
    </div>
  </section>;
}

const tableColumnDefs: ColDef<GridRow>[] = [
  { field: "Table", minWidth: 170 },
  { field: "Relationship", minWidth: 220, flex: 1 },
  { field: "Objects", minWidth: 240, flex: 1 },
  { field: "Database tables", minWidth: 220, flex: 1 },
  { field: "Semantic model", minWidth: 160 },
];

const impactedMeasureColumnDefs: ColDef<GridRow>[] = [
  { field: "Measure", minWidth: 200, flex: 1 },
  { field: "Relationship", minWidth: 130 },
  { field: "Depth", minWidth: 90 },
  { field: "DAX reference", minWidth: 220, flex: 1 },
  { field: "Reports", minWidth: 100 },
  { field: "Visuals", minWidth: 100 },
];

const modelColumnDefs: ColDef<GridRow>[] = [
  { field: "Semantic model", minWidth: 190, flex: 1 },
  { field: "Workspace", minWidth: 150 },
  { field: "Home table", minWidth: 150 },
  { field: "Measures impacted", minWidth: 150 },
  { field: "Calculated columns impacted", minWidth: 200 },
  { field: "Reports using", minWidth: 130 },
  { field: "Visuals using", minWidth: 130 },
  { field: "Reports bound", minWidth: 130 },
];

const reportColumnDefs: ColDef<GridRow>[] = [
  { field: "Report", minWidth: 200, flex: 1.2 },
  { field: "Workspace", minWidth: 150 },
  { field: "Usage", minWidth: 200 },
  { field: "Pages", minWidth: 90 },
  { field: "Visuals", minWidth: 100 },
  { field: "Measures shown", minWidth: 240, flex: 1 },
];

const visualColumnDefs: ColDef<GridRow>[] = [
  { field: "Visual", minWidth: 190, flex: 1 },
  { field: "Visual type", minWidth: 140 },
  { field: "Page", minWidth: 150 },
  { field: "Report", minWidth: 180 },
  { field: "Workspace", minWidth: 150 },
  { field: "Usage", minWidth: 200 },
  { field: "Fields used", minWidth: 220, flex: 1 },
];

const inputColumnDefs: ColDef<GridRow>[] = [
  { field: "Object", minWidth: 200, flex: 1 },
  { field: "Type", minWidth: 140 },
  { field: "Relationship", minWidth: 130 },
  { field: "Depth", minWidth: 90 },
  { field: "DAX reference", minWidth: 220, flex: 1 },
  { field: "Database table", minWidth: 220 },
];

type TableAccumulator = { roles: Set<string>; objects: Set<string> };

/** Joins the measure's closure to its model's tables and to bound-report visual evidence. */
function analyzeMeasure(
  entry: InventoryEntry,
  seed: DaxReference,
  upstream: ClosureHop[],
  downstream: ClosureHop[],
  evidence: EvidenceIndex,
  reportNames: Map<string, ReportDisplayName>,
  sourcesByTable: Map<string, string[]>,
  parsedModel: ParsedSemanticModel | undefined,
  boundCount: number,
) {
  const usageOf = (reference: DaxReference) => evidence.byObject.get(evidenceKey(reference.table_name, reference.object_name));
  const measureName = referenceLabel(seed);

  const tables = new Map<string, TableAccumulator>();
  const noteTable = (name: string | null | undefined, role: string, object?: string) => {
    if (!name) return;
    const table = tables.get(name) ?? { roles: new Set<string>(), objects: new Set<string>() };
    table.roles.add(role);
    if (object) table.objects.add(object);
    tables.set(name, table);
  };
  noteTable(entry.tableName, "Home table", measureName);
  upstream.forEach((hop) => noteTable(hop.reference.table_name, "Read by the measure", referenceLabel(hop.reference)));
  downstream.forEach((hop) => {
    const type = canonicalType(hop.reference.object_type);
    noteTable(hop.reference.table_name, type === "measure" ? "Holds impacted measures" : "Holds impacted calculations", referenceLabel(hop.reference));
  });
  const tableRows: GridRow[] = [...tables.entries()].map(([name, table]) => ({
    id: `table-${name}`,
    Table: name,
    Relationship: [...table.roles].join(", "),
    Objects: [...table.objects].join(", "),
    "Database tables": (sourcesByTable.get(name) ?? []).join(", ") || (parsedModel?.tables.some((candidate) => candidate.name === name) ? "Not reported" : "--"),
    "Semantic model": entry.semanticModelName,
    Workspace: entry.workspaceName,
  }));

  const impactedMeasureRows: GridRow[] = downstream
    .filter((hop) => canonicalType(hop.reference.object_type) === "measure")
    .map((hop) => {
      const usage = usageOf(hop.reference);
      return {
        id: `impacted-${referenceKey(hop.reference)}`,
        Measure: referenceLabel(hop.reference),
        Relationship: hop.depth === 1 ? "Direct" : "Transitive",
        Depth: hop.depth,
        "DAX reference": hop.referenceText,
        Reports: usage?.reportIds.size ?? 0,
        Visuals: usage?.visualKeys.size ?? 0,
      };
    })
    .sort((a, b) => Number(a.Depth) - Number(b.Depth) || String(a.Measure).localeCompare(String(b.Measure)));

  const inputRows: GridRow[] = upstream
    .map((hop) => ({
      id: `input-${referenceKey(hop.reference)}`,
      Object: referenceLabel(hop.reference),
      Type: displayType(hop.reference.object_type),
      Relationship: hop.depth === 1 ? "Direct" : "Transitive",
      Depth: hop.depth,
      "DAX reference": hop.referenceText,
      "Database table": canonicalType(hop.reference.object_type) === "column" ? (sourcesByTable.get(hop.reference.table_name ?? "") ?? []).join(", ") || "Not reported" : "--",
    }))
    .sort((a, b) => Number(a.Depth) - Number(b.Depth) || String(a.Object).localeCompare(String(b.Object)));

  type Usage = { direct: boolean; objects: Set<string>; visuals: Set<string>; pages: Set<string> };
  const reports = new Map<string, Usage>();
  const visuals = new Map<string, { direct: boolean; objects: Set<string> }>();
  const collect = (reference: DaxReference, direct: boolean) => {
    usageOf(reference)?.visualKeys.forEach((key) => {
      const visual = evidence.visuals.get(key);
      if (!visual) return;
      const visualUse = visuals.get(key) ?? { direct: false, objects: new Set<string>() };
      visualUse.direct ||= direct;
      visualUse.objects.add(referenceLabel(reference));
      visuals.set(key, visualUse);
      const report = reports.get(visual.reportId) ?? { direct: false, objects: new Set<string>(), visuals: new Set<string>(), pages: new Set<string>() };
      report.direct ||= direct;
      report.objects.add(referenceLabel(reference));
      report.visuals.add(key);
      report.pages.add(visual.pageName);
      reports.set(visual.reportId, report);
    });
  };
  collect(seed, true);
  downstream.forEach((hop) => collect(hop.reference, false));

  const usageLabel = (direct: boolean) => (direct ? "Shows the measure" : "Through impacted measures");
  const reportRows: GridRow[] = [...reports.entries()]
    .map(([reportId, report]) => ({
      id: reportId,
      Report: reportNames.get(reportId)?.name ?? reportId,
      Workspace: reportNames.get(reportId)?.workspaceName ?? "--",
      Usage: usageLabel(report.direct),
      Pages: report.pages.size,
      Visuals: report.visuals.size,
      "Measures shown": [...report.objects].join(", "),
      "Report ID": reportId,
    }))
    .sort((a, b) => String(a.Report).localeCompare(String(b.Report)));

  const visualRows: GridRow[] = [...visuals.entries()]
    .map(([key, use]) => {
      const info = evidence.visuals.get(key);
      const reportId = info?.reportId ?? key.split(":")[0];
      return {
        id: key,
        Visual: info?.visualName ?? key,
        "Visual type": info?.visualType ?? "--",
        Page: info?.pageName ?? "--",
        Report: reportNames.get(reportId)?.name ?? reportId,
        Workspace: reportNames.get(reportId)?.workspaceName ?? "--",
        Usage: usageLabel(use.direct),
        "Fields used": [...use.objects].join(", "),
        "Report ID": reportId,
        "Visual key": key,
      };
    })
    .sort((a, b) => String(a.Report).localeCompare(String(b.Report)) || String(a.Page).localeCompare(String(b.Page)) || String(a.Visual).localeCompare(String(b.Visual)));

  const modelRows: GridRow[] = [{
    id: modelKey(entry.workspaceId, entry.semanticModelId),
    "Semantic model": entry.semanticModelName,
    Workspace: entry.workspaceName,
    "Home table": entry.tableName,
    "Measures impacted": impactedMeasureRows.length,
    "Calculated columns impacted": downstream.filter((hop) => canonicalType(hop.reference.object_type) === "calculated_column").length,
    "Reports using": reportRows.length,
    "Visuals using": visualRows.length,
    "Reports bound": boundCount,
    "Semantic model ID": entry.semanticModelId,
    "Workspace ID": entry.workspaceId,
  }];

  return { tableRows, impactedMeasureRows, inputRows, modelRows, reportRows, visualRows };
}

function InventoryStatus({ selectedWorkspaceCount, isLoading, isError, entryCount, skippedCount, onRefresh }: { selectedWorkspaceCount: number; isLoading: boolean; isError: boolean; entryCount: number; skippedCount: number; onRefresh: () => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-subtle px-5 py-2.5 text-xs sm:px-6">
    <span className="text-muted-foreground">
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
  if (loading) return <StatusBand tone="info" loading text="Preparing exact DAX dependencies in the background" />;
  if (error) return <StatusBand tone="warning" text="Exact DAX analysis is unavailable for this identity. Measure impact requires elevated backend access to compute dependencies." />;
  if (dax) return <StatusBand tone="success" text={`${dax.dependency_count} exact DAX ${dax.dependency_count === 1 ? "relationship" : "relationships"} ready`} />;
  return null;
}

function filePart(value: string | undefined) {
  return (value ?? "measure-impact").trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "measure-impact";
}
