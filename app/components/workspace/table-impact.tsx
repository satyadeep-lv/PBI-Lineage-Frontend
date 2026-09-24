import { useQueries, useQuery } from "@tanstack/react-query";
import type { ColDef } from "ag-grid-community";
import { FileBarChart2, Layers3, Loader2, MonitorPlay, RefreshCw, Sigma, TableProperties } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { AskPowerAiButton } from "~/components/power-ai/ask-power-ai-button";
import { PowerBiAuthRequired } from "~/components/workspace/auth-required";
import { ImpactGrid } from "~/components/workspace/impact-grid";
import { buildImpactGraph, ImpactLineageDiagram, type ImpactGraphScope, type ReportName } from "~/components/workspace/impact-lineage";
import { MultiObjectSearch, type SearchGroup } from "~/components/workspace/impact-picker";
import { EmptyState, EvidenceStatus, ImpactSection, LoadingState, StatusBand, SummaryTile } from "~/components/workspace/impact-ui";
import { canonicalType, computeDependencyClosure, referenceKey, referenceLabel, type DaxDependency, type DaxReference } from "~/lib/dependency-graph";
import type { GridRow } from "~/lib/grid-export";
import {
  buildEvidenceIndex,
  buildReportNames,
  evidenceKey,
  fetchImpactEvidence,
  impactEvidenceKey,
  tableSeeds,
  tableSources,
  type EstateWithReports,
  type EvidenceIndex,
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
  type ExplorerReportSelection,
  type InventoryEntry,
  type ParsedSemanticModel,
} from "~/lib/lineage-api";
import { useAppStore } from "~/stores/app-store";
import { usePowerAiStore } from "~/stores/power-ai-store";

type Workspace = { id: string; name: string };
type WorkspaceResponse = { workspaces: Workspace[] };
type DaxAnalysis = { dependencies: DaxDependency[]; dependency_count: number };
/** A physical table behind one or more semantic tables, found through their `source_path`. */
type DatabaseTable = { key: string; name: string; semanticKeys: string[] };
type ModelRef = { key: string; workspaceId: string; workspaceName: string; semanticModelId: string; semanticModelName: string };
/** One semantic table to analyze, with every search selection that led to it (itself, or a database table behind it). */
type ImpactTarget = { entry: InventoryEntry; table: SourcedTable; model: ModelRef; selectedAs: string[]; sources: string[] };

const DATABASE_KEY_PREFIX = "db:";

/**
 * Pick semantic tables, or the database tables behind them, and see every
 * report, visual, semantic model, and measure that uses them.
 *
 * Built from the same calls the page always made — the workspace inventory,
 * each touched model's exact DAX analysis, estate bindings, and bound-report
 * visual evidence — per model, so a selection may span several models.
 */
export function TableImpact() {
  const apiOrigin = useAppStore((state) => state.apiOrigin);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  const workspacesQuery = useQuery({
    queryKey: workspaceListKey(apiOrigin),
    queryFn: () => requestJson<WorkspaceResponse>(apiOrigin, WORKSPACE_LIST_PATH),
  });
  const workspaces = useMemo(() => workspacesQuery.data?.workspaces ?? [], [workspacesQuery.data]);
  const scopeIds = useMemo(() => workspaces.map((workspace) => workspace.id), [workspaces]);

  const inventoryQuery = useQuery({
    queryKey: estateInventoryKey(apiOrigin, scopeIds),
    queryFn: () => fetchEstateInventory(apiOrigin, workspaces),
    enabled: scopeIds.length > 0,
  });
  const inventory = inventoryQuery.data;
  const tables = useMemo(() => inventory?.tables ?? [], [inventory]);
  const tablesByKey = useMemo(() => new Map(tables.map((entry) => [entry.key, entry])), [tables]);
  const databaseTables = useMemo(() => (inventory ? buildDatabaseTables(tables, inventory.parsedByModel) : []), [inventory, tables]);
  const databaseByKey = useMemo(() => new Map(databaseTables.map((table) => [table.key, table])), [databaseTables]);
  const searchGroups = useMemo(() => buildSearchGroups(tables, databaseTables, tablesByKey, inventory?.parsedByModel), [tables, databaseTables, tablesByKey, inventory]);

  // A refreshed inventory can drop tables; keep only selections that still exist.
  useEffect(() => {
    if (!inventory) return;
    setSelectedKeys((keys) => {
      const kept = keys.filter((key) => tablesByKey.has(key) || databaseByKey.has(key));
      return kept.length === keys.length ? keys : kept;
    });
  }, [inventory, tablesByKey, databaseByKey]);

  const targets = useMemo(
    () => (inventory ? resolveTargets(selectedKeys, tablesByKey, databaseByKey, inventory.parsedByModel) : []),
    [inventory, selectedKeys, tablesByKey, databaseByKey],
  );
  const models = useMemo(() => uniqueModels(targets), [targets]);

  const daxQueries = useQueries({
    queries: models.map((model) => ({
      queryKey: daxAnalysisKey(apiOrigin, model.workspaceId, model.semanticModelId),
      queryFn: () => requestJson<DaxAnalysis>(apiOrigin, "/api/v1/lineage/dax/analyze", { method: "POST", body: JSON.stringify(inventory?.parsedByModel.get(model.key)) }),
    })),
  });

  const estateQuery = useQuery({
    queryKey: estateDiscoveryKey(apiOrigin),
    queryFn: () => requestJson<EstateWithReports>(apiOrigin, ESTATE_DISCOVER_PATH),
    enabled: models.length > 0,
  });
  const boundByModel = useMemo(
    () => new Map(models.map((model) => [model.key, boundReportsForModel(estateQuery.data, model.semanticModelId)] as const)),
    [models, estateQuery.data],
  );
  const evidenceQueries = useQueries({
    queries: models.map((model) => {
      const bound = boundByModel.get(model.key) ?? [];
      return {
        queryKey: impactEvidenceKey("table-impact", apiOrigin, model.semanticModelId, bound),
        queryFn: () => fetchImpactEvidence(apiOrigin, bound),
        enabled: bound.length > 0,
      };
    }),
  });

  // useQueries returns a new array every render; its per-query data stamps say when anything actually changed.
  const daxStamp = daxQueries.map((query) => query.dataUpdatedAt).join(",");
  const evidenceStamp = evidenceQueries.map((query) => query.dataUpdatedAt).join(",");
  const daxByModel = useMemo(() => new Map(models.map((model, index) => [model.key, daxQueries[index]?.data?.dependencies] as const)), [models, daxStamp]);
  const evidenceByModel = useMemo(() => new Map(models.map((model, index) => [model.key, buildEvidenceIndex(evidenceQueries[index]?.data)] as const)), [models, evidenceStamp]);
  const reportNames = useMemo(() => buildReportNames(estateQuery.data, [...evidenceByModel.values()]), [estateQuery.data, evidenceByModel]);
  const analysis = useMemo(
    () => analyzeImpact(targets, models, daxByModel, evidenceByModel, boundByModel, reportNames),
    [targets, models, daxByModel, evidenceByModel, boundByModel, reportNames],
  );
  const impactGraph = useMemo(
    () => buildImpactGraph(graphScopes(targets, models, daxByModel, evidenceByModel, inventory?.parsedByModel), reportNames),
    [targets, models, daxByModel, evidenceByModel, inventory, reportNames],
  );

  const singleTarget = targets.length === 1 ? targets[0] : null;
  const selectedLabels = [...new Set(targets.flatMap((target) => target.selectedAs))];
  const exportContext = { selected_tables: selectedLabels.join("; ") };

  useEffect(() => {
    const entry = singleTarget?.entry;
    usePowerAiStore.getState().mergeContext({
      workspaceId: entry?.workspaceId,
      workspaceName: entry?.workspaceName,
      semanticModelId: entry?.semanticModelId,
      semanticModelName: entry?.semanticModelName,
      // An inventory entry is indexed under the workspace its model lives in.
      semanticModelWorkspaceId: entry?.workspaceId,
      reportId: undefined,
      reportName: undefined,
      objectType: entry ? "table" : undefined,
      objectId: entry?.key,
      objectName: entry?.tableName,
    });
  }, [singleTarget]);

  if (workspacesQuery.isLoading) return <LoadingState label="Loading Power BI workspaces" />;
  if (workspacesQuery.isError) return <PowerBiAuthRequired returnTo="Table impact" />;
  if (!workspaces.length) return <EmptyState title="No Power BI workspaces found" text="The authenticated account did not return any workspaces to explore." />;

  const daxLoading = daxQueries.some((query) => query.isLoading);
  const daxFailedModels = models.filter((_, index) => daxQueries[index]?.isError);
  const dependencyCount = daxQueries.reduce((count, query) => count + (query.data?.dependency_count ?? 0), 0);
  const boundTotal = [...boundByModel.values()].reduce((count, reports) => count + reports.length, 0);
  const evidenceLoading = evidenceQueries.some((query) => query.isLoading);
  const evidenceTruncated = evidenceQueries.some((query) => query.data?.truncated);
  const usagePending = evidenceLoading || estateQuery.isLoading;
  const usageEmpty = estateQuery.isError ? "Usage is unavailable because estate discovery failed." : usagePending || daxLoading ? "Checking reports..." : undefined;

  return <section className="overflow-hidden rounded-lg border border-border bg-surface">
    <div className="border-b border-border px-5 py-5 sm:px-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-fabric text-primary-foreground"><TableProperties className="size-5" /></span>
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase text-fabric">Power BI</span><Badge className="rounded-md border border-fabric/25 bg-accent text-accent-foreground">Table impact</Badge></div>
          <h1 className="text-lg font-semibold">Table impact</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Search semantic model tables or the database tables behind them, pick one or several, and see every report, visual, semantic model, and measure that uses them.</p>
        </div>
      </div>
    </div>

    <InventoryStatus workspaceCount={scopeIds.length} isLoading={inventoryQuery.isFetching} isError={inventoryQuery.isError} tableCount={tables.length} databaseCount={databaseTables.length} skippedCount={inventory?.skipped.length ?? 0} onRefresh={() => void inventoryQuery.refetch()} />

    <div className="border-b border-border bg-subtle px-5 py-4 sm:px-6">
      <div className="max-w-5xl">
        <MultiObjectSearch
          id="table-impact-tables"
          label="Tables"
          placeholder="Search semantic model or database tables..."
          groups={searchGroups}
          selectedKeys={selectedKeys}
          onChange={setSelectedKeys}
          emptyText={inventoryQuery.isFetching ? "Building the table inventory..." : "No tables are indexed yet."}
        />
      </div>
    </div>

    <div className="space-y-6 p-5 sm:p-6">
      {!targets.length && <EmptyState title="No tables selected" text="Search above and pick one or more semantic model tables or database tables to see the reports, visuals, semantic models, and measures that use them." />}
      {targets.length > 0 && <>
        <div className="space-y-2">
          <ExactLineageStatus loading={daxLoading} failedModels={daxFailedModels} dependencyCount={dependencyCount} modelCount={models.length} />
          <EvidenceStatus estateLoading={estateQuery.isLoading} estateError={estateQuery.isError} boundCount={boundTotal} loading={evidenceLoading} truncated={evidenceTruncated} noBoundText="No reports in the accessible estate are bound to the semantic models holding these tables." />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryTile icon={FileBarChart2} label="Reports" value={analysis.reportRows.length} caption="With a visual that uses the tables" pending={usagePending} />
          <SummaryTile icon={MonitorPlay} label="Visuals" value={analysis.visualRows.length} caption="Reading the tables or their measures" pending={usagePending} />
          <SummaryTile icon={Layers3} label="Semantic models" value={analysis.modelRows.length} caption={`${targets.length} semantic ${targets.length === 1 ? "table" : "tables"} selected`} pending={false} />
          <SummaryTile icon={Sigma} label="Measures" value={analysis.measureRows.length} caption="Depending on them, directly or transitively" pending={daxLoading} />
        </div>

        {singleTarget && <div className="flex justify-end">
          <AskPowerAiButton
            context={{
              workspaceId: singleTarget.entry.workspaceId,
              workspaceName: singleTarget.entry.workspaceName,
              semanticModelId: singleTarget.entry.semanticModelId,
              semanticModelName: singleTarget.entry.semanticModelName,
              semanticModelWorkspaceId: singleTarget.entry.workspaceId,
              objectType: "table",
              objectId: singleTarget.entry.key,
              objectName: singleTarget.entry.tableName,
            }}
            question={`Explain the ${singleTarget.entry.tableName} table`}
          />
        </div>}

        <ImpactLineageDiagram
          graph={impactGraph.graph}
          focusNodeId={singleTarget ? `${singleTarget.model.key}|table|${singleTarget.entry.tableName.toLocaleLowerCase()}` : undefined}
          title={singleTarget ? `${singleTarget.entry.tableName} impact` : `Impact of ${targets.length} tables`}
          description="Database tables and semantic models feed the selected tables; their columns and measures flow down through dependent measures to the reports and visuals that use them."
          emptyText="Nothing depends on the selected tables."
          hiddenReports={impactGraph.hiddenReports}
          hiddenVisuals={impactGraph.hiddenVisuals}
        />

        <ImpactSection icon={FileBarChart2} title="Reports using the selected tables" text="Reports with at least one visual that reads a selected table's fields directly, or reads a measure built on them.">
          <ImpactGrid rowData={analysis.reportRows} columnDefs={reportColumnDefs} emptyMessage={usageEmpty ?? "No report visual uses the selected tables."} exportFileName="table-impact-reports" exportContext={exportContext} fitRows />
        </ImpactSection>

        <ImpactSection icon={MonitorPlay} title="Visuals using the selected tables" text="Every visual that reads a selected table's fields or a measure depending on them, with the page it sits on.">
          <ImpactGrid rowData={analysis.visualRows} columnDefs={visualColumnDefs} emptyMessage={usageEmpty ?? "No visual uses the selected tables."} exportFileName="table-impact-visuals" exportContext={exportContext} fitRows />
        </ImpactSection>

        <ImpactSection icon={Layers3} title="Semantic models" text="Every semantic model holding a selected table, with the database tables behind it and how much depends on it.">
          <ImpactGrid rowData={analysis.modelRows} columnDefs={modelColumnDefs} emptyMessage="No semantic models hold the selected tables." exportFileName="table-impact-semantic-models" exportContext={exportContext} fitRows />
        </ImpactSection>

        <ImpactSection icon={Sigma} title="Measures using the selected tables" text="Measures that read a selected table, directly or through another calculation, with the reports and visuals that show them.">
          <ImpactGrid rowData={analysis.measureRows} columnDefs={measureColumnDefs} emptyMessage={daxLoading ? "Preparing exact DAX dependencies..." : "No measure depends on the selected tables."} exportFileName="table-impact-measures" exportContext={exportContext} fitRows />
        </ImpactSection>
      </>}
    </div>
  </section>;
}

const reportColumnDefs: ColDef<GridRow>[] = [
  { field: "Report", minWidth: 200, flex: 1.2 },
  { field: "Workspace", minWidth: 150 },
  { field: "Semantic model", minWidth: 170 },
  { field: "Selected tables", minWidth: 190 },
  { field: "Usage", minWidth: 170 },
  { field: "Pages", minWidth: 90 },
  { field: "Visuals", minWidth: 100 },
  { field: "Objects used", minWidth: 240, flex: 1 },
];

const visualColumnDefs: ColDef<GridRow>[] = [
  { field: "Visual", minWidth: 190, flex: 1 },
  { field: "Visual type", minWidth: 140 },
  { field: "Page", minWidth: 150 },
  { field: "Report", minWidth: 180 },
  { field: "Workspace", minWidth: 150 },
  { field: "Usage", minWidth: 170 },
  { field: "Fields used", minWidth: 220, flex: 1 },
];

const modelColumnDefs: ColDef<GridRow>[] = [
  { field: "Semantic model", minWidth: 190, flex: 1 },
  { field: "Workspace", minWidth: 150 },
  { field: "Selected tables", minWidth: 180 },
  { field: "Database tables", minWidth: 220, flex: 1 },
  { field: "Measures", minWidth: 110 },
  { field: "Reports using", minWidth: 130 },
  { field: "Reports bound", minWidth: 130 },
];

const measureColumnDefs: ColDef<GridRow>[] = [
  { field: "Measure", minWidth: 200, flex: 1 },
  { field: "Semantic model", minWidth: 170 },
  { field: "Workspace", minWidth: 150 },
  { field: "Selected tables", minWidth: 190 },
  { field: "Relationship", minWidth: 130 },
  { field: "Depth", minWidth: 90 },
  { field: "DAX reference", minWidth: 220, flex: 1 },
  { field: "Reports", minWidth: 100 },
  { field: "Visuals", minWidth: 100 },
];

function findParsedTable(parsedByModel: Map<string, ParsedSemanticModel>, entry: InventoryEntry) {
  return (parsedByModel.get(modelKey(entry.workspaceId, entry.semanticModelId))?.tables.find((table) => table.name === entry.tableName) ?? null) as SourcedTable | null;
}

function semanticLabel(entry: InventoryEntry) {
  return `${entry.tableName} (${entry.semanticModelName})`;
}

function buildDatabaseTables(tables: InventoryEntry[], parsedByModel: Map<string, ParsedSemanticModel>): DatabaseTable[] {
  const byKey = new Map<string, DatabaseTable>();
  tables.forEach((entry) => {
    tableSources(findParsedTable(parsedByModel, entry)).forEach((path) => {
      const key = `${DATABASE_KEY_PREFIX}${path.toLocaleUpperCase()}`;
      const table = byKey.get(key) ?? { key, name: path, semanticKeys: [] };
      if (!table.semanticKeys.includes(entry.key)) table.semanticKeys.push(entry.key);
      byKey.set(key, table);
    });
  });
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function buildSearchGroups(tables: InventoryEntry[], databaseTables: DatabaseTable[], tablesByKey: Map<string, InventoryEntry>, parsedByModel: Map<string, ParsedSemanticModel> | undefined): SearchGroup[] {
  return [
    {
      id: "semantic",
      heading: "Semantic model tables",
      chipLabel: "Model",
      entries: [...tables].sort((a, b) => a.tableName.localeCompare(b.tableName)).map((entry) => {
        const sources = parsedByModel ? tableSources(findParsedTable(parsedByModel, entry)) : [];
        return {
          key: entry.key,
          searchValue: `${entry.tableName} ${entry.semanticModelName} ${entry.workspaceName} ${sources.join(" ")}`,
          primary: entry.tableName,
          secondary: `${entry.semanticModelName} · ${entry.workspaceName}${sources.length ? ` · from ${sources.join(", ")}` : ""}`,
          chipText: semanticLabel(entry),
        };
      }),
    },
    {
      id: "database",
      heading: "Database tables",
      chipLabel: "Database",
      entries: databaseTables.map((table) => {
        const users = table.semanticKeys.flatMap((key) => {
          const entry = tablesByKey.get(key);
          return entry ? [semanticLabel(entry)] : [];
        });
        return {
          key: table.key,
          searchValue: `${table.name} ${users.join(" ")}`,
          primary: table.name,
          secondary: `Behind ${users.length} semantic ${users.length === 1 ? "table" : "tables"}: ${users.join(", ")}`,
        };
      }),
    },
  ];
}

function resolveTargets(selectedKeys: string[], tablesByKey: Map<string, InventoryEntry>, databaseByKey: Map<string, DatabaseTable>, parsedByModel: Map<string, ParsedSemanticModel>): ImpactTarget[] {
  const targets = new Map<string, ImpactTarget>();
  function add(entry: InventoryEntry | undefined, selectedAs: string) {
    if (!entry) return;
    const table = findParsedTable(parsedByModel, entry);
    if (!table) return;
    const target = targets.get(entry.key) ?? {
      entry,
      table,
      model: { key: modelKey(entry.workspaceId, entry.semanticModelId), workspaceId: entry.workspaceId, workspaceName: entry.workspaceName, semanticModelId: entry.semanticModelId, semanticModelName: entry.semanticModelName },
      selectedAs: [],
      sources: tableSources(table),
    };
    if (!target.selectedAs.includes(selectedAs)) target.selectedAs.push(selectedAs);
    targets.set(entry.key, target);
  }
  selectedKeys.forEach((key) => {
    const databaseTable = databaseByKey.get(key);
    if (databaseTable) databaseTable.semanticKeys.forEach((semanticKey) => add(tablesByKey.get(semanticKey), databaseTable.name));
    else {
      const entry = tablesByKey.get(key);
      if (entry) add(entry, semanticLabel(entry));
    }
  });
  return [...targets.values()];
}

function uniqueModels(targets: ImpactTarget[]): ModelRef[] {
  return [...new Map(targets.map((target) => [target.model.key, target.model])).values()];
}

function graphScopes(
  targets: ImpactTarget[],
  models: ModelRef[],
  daxByModel: Map<string, DaxDependency[] | undefined>,
  evidenceByModel: Map<string, EvidenceIndex>,
  parsedByModel: Map<string, ParsedSemanticModel> | undefined,
): ImpactGraphScope[] {
  return models.map((model) => {
    const dependencies = daxByModel.get(model.key) ?? [];
    const modelTargets = targets.filter((target) => target.model.key === model.key);
    const focal = modelTargets.flatMap((target) => tableSeeds(target.table));
    const members = computeDependencyClosure(dependencies, focal).downstream.map((hop) => hop.reference);
    const sources = new Map((parsedByModel?.get(model.key)?.tables ?? []).map((table) => [table.name, tableSources(table as SourcedTable)] as const));
    return {
      model: { key: model.key, name: model.semanticModelName, workspaceName: model.workspaceName },
      focal,
      members,
      dependencies,
      evidence: evidenceByModel.get(model.key),
      tableSources: sources,
      focalTables: modelTargets.map((target) => target.entry.tableName),
    };
  });
}

type MeasureAccumulator = { model: ModelRef; reference: DaxReference; depth: number; referenceText: string; selectedAs: Set<string>; reportIds: Set<string>; visualKeys: Set<string> };
type ReportAccumulator = { reportId: string; model: ModelRef; direct: boolean; objects: Set<string>; visuals: Set<string>; pages: Set<string>; selectedAs: Set<string> };
type VisualAccumulator = { key: string; reportId: string; model: ModelRef; direct: boolean; objects: Set<string>; selectedAs: Set<string> };

/**
 * Walks each target's downstream DAX closure inside its own model (reference
 * keys are only unique within one model), then joins the closure to that
 * model's visual evidence: a report or visual uses a table when a visual reads
 * one of its columns or measures, or a measure depending on them.
 */
function analyzeImpact(
  targets: ImpactTarget[],
  models: ModelRef[],
  daxByModel: Map<string, DaxDependency[] | undefined>,
  evidenceByModel: Map<string, EvidenceIndex>,
  boundByModel: Map<string, ExplorerReportSelection[]>,
  reportNames: Map<string, ReportName>,
) {
  const measures = new Map<string, MeasureAccumulator>();
  const reports = new Map<string, ReportAccumulator>();
  const visuals = new Map<string, VisualAccumulator>();

  targets.forEach((target) => {
    const dependencies = daxByModel.get(target.model.key) ?? [];
    const evidence = evidenceByModel.get(target.model.key);
    const seeds = tableSeeds(target.table);
    const downstream = computeDependencyClosure(dependencies, seeds).downstream;
    const usageOf = (reference: DaxReference) => evidence?.byObject.get(evidenceKey(reference.table_name, reference.object_name));

    downstream.forEach((hop) => {
      if (canonicalType(hop.reference.object_type) !== "measure") return;
      const key = `${target.model.key}|${referenceKey(hop.reference)}`;
      const usage = usageOf(hop.reference);
      const measure = measures.get(key) ?? { model: target.model, reference: hop.reference, depth: hop.depth, referenceText: hop.referenceText, selectedAs: new Set<string>(), reportIds: new Set(usage?.reportIds), visualKeys: new Set(usage?.visualKeys) };
      if (hop.depth < measure.depth) Object.assign(measure, { depth: hop.depth, referenceText: hop.referenceText });
      target.selectedAs.forEach((label) => measure.selectedAs.add(label));
      measures.set(key, measure);
    });

    function collect(reference: DaxReference, direct: boolean) {
      const usage = usageOf(reference);
      if (!usage) return;
      usage.visualKeys.forEach((key) => {
        const visual = evidence?.visuals.get(key);
        if (!visual) return;
        const entry = visuals.get(key) ?? { key, reportId: visual.reportId, model: target.model, direct: false, objects: new Set<string>(), selectedAs: new Set<string>() };
        entry.direct ||= direct;
        entry.objects.add(referenceLabel(reference));
        target.selectedAs.forEach((label) => entry.selectedAs.add(label));
        visuals.set(key, entry);

        const report = reports.get(visual.reportId) ?? { reportId: visual.reportId, model: target.model, direct: false, objects: new Set<string>(), visuals: new Set<string>(), pages: new Set<string>(), selectedAs: new Set<string>() };
        report.direct ||= direct;
        report.objects.add(referenceLabel(reference));
        report.visuals.add(key);
        report.pages.add(visual.pageName);
        target.selectedAs.forEach((label) => report.selectedAs.add(label));
        reports.set(visual.reportId, report);
      });
    }
    seeds.forEach((seed) => collect(seed, true));
    downstream.forEach((hop) => collect(hop.reference, false));
  });

  const reportRows: GridRow[] = [...reports.values()]
    .map((report) => ({
      id: report.reportId,
      Report: reportNames.get(report.reportId)?.name ?? report.reportId,
      Workspace: reportNames.get(report.reportId)?.workspaceName ?? "--",
      "Semantic model": report.model.semanticModelName,
      "Selected tables": [...report.selectedAs].join(", "),
      Usage: report.direct ? "Reads table fields" : "Through measures",
      Pages: report.pages.size,
      Visuals: report.visuals.size,
      "Objects used": [...report.objects].join(", "),
      "Report ID": report.reportId,
      "Semantic model ID": report.model.semanticModelId,
    }))
    .sort((a, b) => String(a.Report).localeCompare(String(b.Report)));

  const visualRows: GridRow[] = [...visuals.values()]
    .map((visual) => {
      const info = evidenceByModel.get(visual.model.key)?.visuals.get(visual.key);
      return {
        id: visual.key,
        Visual: info?.visualName ?? visual.key,
        "Visual type": info?.visualType ?? "--",
        Page: info?.pageName ?? "--",
        Report: reportNames.get(visual.reportId)?.name ?? visual.reportId,
        Workspace: reportNames.get(visual.reportId)?.workspaceName ?? "--",
        Usage: visual.direct ? "Reads table fields" : "Through measures",
        "Fields used": [...visual.objects].join(", "),
        "Selected tables": [...visual.selectedAs].join(", "),
        "Report ID": visual.reportId,
        "Visual key": visual.key,
      };
    })
    .sort((a, b) => String(a.Report).localeCompare(String(b.Report)) || String(a.Page).localeCompare(String(b.Page)) || String(a.Visual).localeCompare(String(b.Visual)));

  const measureRows: GridRow[] = [...measures.entries()]
    .map(([key, measure]) => ({
      id: key,
      Measure: referenceLabel(measure.reference),
      "Semantic model": measure.model.semanticModelName,
      Workspace: measure.model.workspaceName,
      "Selected tables": [...measure.selectedAs].join(", "),
      Relationship: measure.depth === 1 ? "Direct" : "Transitive",
      Depth: measure.depth,
      "DAX reference": measure.referenceText,
      Reports: measure.reportIds.size,
      Visuals: measure.visualKeys.size,
      "Semantic model ID": measure.model.semanticModelId,
    }))
    .sort((a, b) => Number(a.Depth) - Number(b.Depth) || String(a.Measure).localeCompare(String(b.Measure)));

  const modelRows: GridRow[] = models.map((model) => {
    const modelTargets = targets.filter((target) => target.model.key === model.key);
    return {
      id: model.key,
      "Semantic model": model.semanticModelName,
      Workspace: model.workspaceName,
      "Selected tables": modelTargets.map((target) => target.entry.tableName).join(", "),
      "Database tables": [...new Set(modelTargets.flatMap((target) => target.sources))].join(", ") || "Not reported",
      Measures: measureRows.filter((row) => row["Semantic model ID"] === model.semanticModelId).length,
      "Reports using": reportRows.filter((row) => row["Semantic model ID"] === model.semanticModelId).length,
      "Reports bound": boundByModel.get(model.key)?.length ?? 0,
      "Semantic model ID": model.semanticModelId,
      "Workspace ID": model.workspaceId,
    };
  });

  return { reportRows, visualRows, measureRows, modelRows };
}

function InventoryStatus({ workspaceCount, isLoading, isError, tableCount, databaseCount, skippedCount, onRefresh }: { workspaceCount: number; isLoading: boolean; isError: boolean; tableCount: number; databaseCount: number; skippedCount: number; onRefresh: () => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-subtle px-5 py-2.5 text-xs sm:px-6">
    <span className="text-muted-foreground">
      {isLoading
        ? `Building the table inventory across ${workspaceCount} ${workspaceCount === 1 ? "workspace" : "workspaces"}...`
        : isError
          ? "Table inventory is unavailable for this identity."
          : `${tableCount} semantic ${tableCount === 1 ? "table" : "tables"} and ${databaseCount} database ${databaseCount === 1 ? "table" : "tables"} indexed across ${workspaceCount} ${workspaceCount === 1 ? "workspace" : "workspaces"}.${skippedCount ? ` ${skippedCount} model(s) skipped (no access).` : ""}`}
    </span>
    <Button type="button" variant="outline" size="sm" disabled={!workspaceCount || isLoading} onClick={onRefresh}>{isLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Refresh inventory</Button>
  </div>;
}

function ExactLineageStatus({ loading, failedModels, dependencyCount, modelCount }: { loading: boolean; failedModels: ModelRef[]; dependencyCount: number; modelCount: number }) {
  if (loading) return <StatusBand tone="info" loading text="Preparing exact DAX dependencies in the background" />;
  if (failedModels.length) return <StatusBand tone="warning" text={`Exact DAX analysis is unavailable for ${failedModels.map((model) => model.semanticModelName).join(", ")}. Table impact requires elevated backend access to compute dependencies.`} />;
  return <StatusBand tone="success" text={`${dependencyCount} exact DAX ${dependencyCount === 1 ? "relationship" : "relationships"} ready across ${modelCount} semantic ${modelCount === 1 ? "model" : "models"}`} />;
}
