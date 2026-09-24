import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { BookOpenCheck, Database, FileBarChart2, TableProperties } from "lucide-react";
import { useMemo, useState } from "react";

import { MeasureAiDefinition, type MeasureDefinitionTarget } from "~/components/workspace/measure-ai-definition";
import { SnowflakeColumnLineage, SnowflakeObjectLineage, type SnowflakeColumnTarget, type SnowflakeTraceTarget } from "~/components/workspace/snowflake-object-lineage";
import {
  daxColumn,
  DetailItem,
  EvidenceError,
  EvidenceOptionToggle,
  ExplorerError,
  ExplorerGrid,
  ExplorerLoading,
  ExplorerWarnings,
  filePart,
  makeExportContext,
  objectKey,
  SectionHeading,
  SEMANTIC_OBJECT_KIND_LABELS,
  type ExplorerEvidenceWarning,
  type ExplorerGridRow,
  type ExportValue,
  type Report,
  type Workspace,
} from "~/components/workspace/evidence-ui";
import { parsedSemanticModelKey, requestJson } from "~/lib/lineage-api";
import { cn } from "~/lib/utils";
import { useAppStore } from "~/stores/app-store";

/** Every view here works against the one report the caller selected, so the picker lives above these rather than inside each of them. */
export type ReportSection = "report-detail" | "source-db-lineage" | "semantic-objects" | "semantic-db-mapping" | "report-semantic";

export const REPORT_SECTIONS: Array<{ id: ReportSection; label: string; shortLabel: string }> = [
  { id: "report-detail", label: "Report page details", shortLabel: "Page details" },
  { id: "source-db-lineage", label: "Source database lineage", shortLabel: "Source DB lineage" },
  { id: "semantic-objects", label: "Semantic model objects", shortLabel: "Semantic objects" },
  { id: "semantic-db-mapping", label: "Semantic to database object mappings", shortLabel: "Semantic - DB objects mappings" },
  { id: "report-semantic", label: "Report visual field lineage", shortLabel: "Report visuals" },
];

/**
 * One report and everything already known about where its model lives.
 *
 * Explorer resolves this from a workspace's own report and model lists;
 * Report lineage resolves it from estate discovery, where the bound model can
 * sit in a different workspace entirely. Either way the evidence below is
 * scoped to exactly one report, which is what keeps both screens at report
 * granularity.
 */
export type ReportBinding = {
  workspace: Workspace;
  report: Report;
  semanticModelId: string | null;
  semanticModelName: string | null;
  semanticModelWorkspaceId: string | null;
};

type ReportPage = { name: string; display_name: string; order: number };
type ReportPagesResponse = { pages: ReportPage[] };

type ParsedColumn = {
  name: string;
  source_path?: string | null;
  source_column?: string | null;
  data_type?: string | null;
  expression?: string | null;
  is_hidden?: boolean | null;
};

type ParsedTable = {
  name: string;
  source_path?: string | null;
  expression?: string | null;
  columns: ParsedColumn[];
  measures: Array<{ name: string; expression?: string | null; is_hidden?: boolean | null }>;
  hierarchies: Array<{ name: string; levels: Array<{ name: string; column?: string | null }> }>;
};

type ParsedSemanticModel = {
  workspace_id: string;
  semantic_model_id: string;
  format?: string | null;
  tables: ParsedTable[];
  relationships: Array<{
    name?: string | null;
    from_table?: string | null;
    from_column?: string | null;
    to_table?: string | null;
    to_column?: string | null;
    is_active?: boolean | null;
  }>;
  warnings: Array<{ code: string; message: string }>;
};

type NormalizedReport = {
  semantic_model?: { semantic_model_id?: string | null; path?: string | null } | null;
  page_count: number;
  visual_count: number;
  source_part_count: number;
  warnings: string[];
};

type ReportSemanticLineage = {
  total_field_reference_count: number;
  matched_field_reference_count: number;
  unmatched_field_reference_count: number;
  field_matches: Array<{
    page_display_name: string;
    visual_title?: string | null;
    visual_type?: string | null;
    status: "matched" | "unmatched";
    semantic_object?: { object_type: string; table_name: string; object_name: string } | null;
    reason?: string | null;
    match_confidence: number;
  }>;
  warnings: string[];
};

type ReportSourceTableRow = {
  workspace_name: string;
  report_name: string;
  report_id: string;
  semantic_model_id: string;
  source_account?: string | null;
  source_database?: string | null;
  source_schema?: string | null;
  table_name?: string | null;
  source_object_type: string;
  /** Non-null only when this table was reached through another workspace's semantic model. */
  via_workspace_name?: string | null;
  via_semantic_model_name?: string | null;
  via_semantic_table?: string | null;
};
type ReportSourceTablesResponse = { rows: ReportSourceTableRow[]; count: number; warnings: ExplorerEvidenceWarning[] };

/** One parsed semantic object, already carrying its own workspace/report/model context. */
type SemanticModelObjectRow = {
  workspace_id: string;
  workspace_name: string;
  report_id: string;
  report_name: string;
  semantic_model_id: string;
  semantic_table: string;
  semantic_object_type: string;
  semantic_object_name: string;
  semantic_data_type?: string | null;
  semantic_source_column?: string | null;
  semantic_dax_expression?: string | null;
};
type SemanticModelObjectsResponse = { rows: SemanticModelObjectRow[]; count: number; warnings: ExplorerEvidenceWarning[] };

/** A DAX dependency traced all the way down to the physical column it reads. */
type MeasureSourceLineageRow = {
  semantic_table?: string | null;
  semantic_object_name: string;
  source_column_name?: string | null;
  source_fully_qualified_name?: string | null;
};

type SnapshotSourceRow = { semantic_table: string; source_fully_qualified_name?: string | null };

/**
 * `/explorer/snapshot` returns every explorer dataset from one request. The
 * mapping grid needs three of them, and fetching them separately would repeat
 * the expensive part — the workspace, report and TMDL definition fetches —
 * once per dataset.
 */
type ExplorerSnapshot = {
  warnings: ExplorerEvidenceWarning[];
  semantic_model_objects: { rows: SemanticModelObjectRow[]; count: number };
  measure_source_lineage: { rows: MeasureSourceLineageRow[]; count: number };
  source_database_lineage: { rows: SnapshotSourceRow[]; count: number };
};

type MetadataResponse = { reconciliation: { matched_count: number; definition_only_count: number; xmla_only_count: number } };

/**
 * One selection is always enough here because both screens work a single
 * report at a time; `semantic_model_id` is deliberately omitted so the backend
 * infers the binding itself (which is also what makes a model in another
 * workspace work). Both `include_*` flags cost real upstream API calls, so
 * they default to off.
 */
function explorerReportsBody(workspaceId: string, reportId: string, options?: { includeCrossModelMatching?: boolean; includeGatewaySources?: boolean }) {
  return {
    reports: [{ workspace_id: workspaceId, report_id: reportId }],
    include_gateway_sources: options?.includeGatewaySources ?? false,
    include_cross_model_matching: options?.includeCrossModelMatching ?? false,
    // Ordinary resolution, not an expensive scan: it only costs anything when a
    // composite model is actually present, and it is what makes a cross-workspace
    // table report its real database instead of stopping at the Power BI boundary.
    resolve_cross_workspace_sources: true,
    report_definition_format: "PBIR",
    semantic_model_definition_format: "TMDL",
  };
}

/**
 * The five report-scoped evidence views, with their section tabs and every
 * call behind them.
 *
 * Both Explorer and Report lineage render this, so the two screens show the
 * same tabs against the same endpoints; they differ only in how the report
 * reaches them — Explorer picks one inside a workspace, Report lineage picks
 * one from anywhere in the estate.
 */
export function ReportEvidence({ binding, modelNames, activeSection, onSectionChange }: {
  binding: ReportBinding;
  /** Workspace model names, when the caller has them, so a multi-model grid can label each row. */
  modelNames?: Map<string, string>;
  activeSection: ReportSection;
  onSectionChange: (section: ReportSection) => void;
}) {
  const apiOrigin = useAppStore((state) => state.apiOrigin);
  const [gatewaySourcesEnabled, setGatewaySourcesEnabled] = useState(false);

  const { workspace, report } = binding;
  const workspaceId = workspace.id;
  const reportId = report.id;
  // Drive semantic evidence from the report's own binding rather than from a
  // model that happens to be listed in this workspace: a report can be bound to
  // a model in another workspace, and the caller's resolution (or Power BI's
  // `dataset_workspace_id`) is the only reliable proof of where that model lives.
  const boundModelId = binding.semanticModelId ?? report.dataset_id ?? null;
  const boundModelWorkspaceId = binding.semanticModelWorkspaceId ?? report.dataset_workspace_id ?? workspaceId;
  const boundModelName = binding.semanticModelName ?? (boundModelId ? modelNames?.get(boundModelId) ?? null : null);
  const boundModel = boundModelId && boundModelName ? { id: boundModelId, name: boundModelName } : null;

  // A section's evidence is only worth fetching once that section is on screen.
  // The session cache serves it from memory afterwards, so moving between
  // sections stays instant while never paying for one left unopened.
  const reportDetailQuery = useQuery({
    queryKey: ["explorer", "report", apiOrigin, workspaceId, reportId],
    queryFn: () => requestJson<Report>(apiOrigin, `/api/v1/workspaces/${workspaceId}/reports/${reportId}`),
    enabled: activeSection === "report-detail",
  });
  const reportPagesQuery = useQuery({
    queryKey: ["explorer", "report-pages", apiOrigin, workspaceId, reportId],
    queryFn: () => requestJson<ReportPagesResponse>(apiOrigin, `/api/v1/workspaces/${workspaceId}/reports/${reportId}/pages`),
    enabled: activeSection === "report-detail",
  });
  const normalizedReportQuery = useQuery({
    queryKey: ["explorer", "normalized-report", apiOrigin, workspaceId, reportId],
    queryFn: () => requestJson<NormalizedReport>(apiOrigin, `/api/v1/workspaces/${workspaceId}/reports/${reportId}/definition/normalized?format=PBIR`, { method: "POST" }),
    enabled: activeSection === "report-semantic",
  });
  const reportSemanticLineageQuery = useQuery({
    queryKey: ["explorer", "report-semantic-lineage", apiOrigin, workspaceId, reportId, boundModelId, boundModelWorkspaceId],
    queryFn: () => {
      const query = new URLSearchParams({ semantic_model_id: boundModelId!, semantic_model_workspace_id: boundModelWorkspaceId });
      return requestJson<ReportSemanticLineage>(apiOrigin, `/api/v1/workspaces/${workspaceId}/reports/${reportId}/semantic-lineage?${query.toString()}`, { method: "POST" });
    },
    enabled: Boolean(boundModelId) && activeSection === "report-semantic",
  });
  const parsedSemanticModelQuery = useQuery({
    queryKey: parsedSemanticModelKey(apiOrigin, boundModelWorkspaceId, boundModelId ?? ""),
    queryFn: () => requestJson<ParsedSemanticModel>(apiOrigin, `/api/v1/workspaces/${boundModelWorkspaceId}/semantic-models/${boundModelId}/definition/parsed?format=TMDL`, { method: "POST" }),
    enabled: Boolean(boundModelId) && activeSection === "report-semantic",
  });
  const semanticMetadataQuery = useQuery({
    queryKey: ["explorer", "semantic-metadata", apiOrigin, boundModelWorkspaceId, boundModelId],
    queryFn: () => requestJson<MetadataResponse>(apiOrigin, `/api/v1/workspaces/${boundModelWorkspaceId}/semantic-models/${boundModelId}/metadata?format=TMDL`),
    enabled: Boolean(boundModelId) && activeSection === "semantic-objects",
  });
  const reportSourceTablesQuery = useQuery({
    queryKey: ["explorer", "report-source-tables", apiOrigin, workspaceId, reportId, gatewaySourcesEnabled],
    queryFn: () => requestJson<ReportSourceTablesResponse>(apiOrigin, "/api/v1/explorer/report-source-tables", { method: "POST", body: JSON.stringify(explorerReportsBody(workspaceId, reportId, { includeGatewaySources: gatewaySourcesEnabled })) }),
    enabled: activeSection === "source-db-lineage",
  });
  const semanticModelObjectsQuery = useQuery({
    queryKey: ["explorer", "semantic-model-objects", apiOrigin, workspaceId, reportId],
    queryFn: () => requestJson<SemanticModelObjectsResponse>(apiOrigin, "/api/v1/explorer/semantic-model-objects", { method: "POST", body: JSON.stringify(explorerReportsBody(workspaceId, reportId)) }),
    enabled: activeSection === "semantic-objects",
  });
  const explorerSnapshotQuery = useQuery({
    queryKey: ["explorer", "snapshot", apiOrigin, workspaceId, reportId, gatewaySourcesEnabled],
    queryFn: () => requestJson<ExplorerSnapshot>(apiOrigin, "/api/v1/explorer/snapshot", { method: "POST", body: JSON.stringify(explorerReportsBody(workspaceId, reportId, { includeGatewaySources: gatewaySourcesEnabled })) }),
    enabled: activeSection === "semantic-db-mapping",
  });

  return <>
    <div className="overflow-x-auto border-b border-zinc-200">
      <div className="flex min-w-max gap-1" role="tablist" aria-label="Report evidence sections">
        {REPORT_SECTIONS.map((section) => <button key={section.id} type="button" role="tab" aria-selected={activeSection === section.id} onClick={() => onSectionChange(section.id)} className={cn("border-b-2 px-3 py-2 text-sm transition", activeSection === section.id ? "border-teal-700 font-semibold text-teal-800" : "border-transparent text-zinc-500 hover:text-zinc-950")} title={section.label}>{section.shortLabel}</button>)}
      </div>
    </div>
    {activeSection === "report-detail" && <ReportDetailTab workspace={workspace} selectedReport={report} reportSemanticModel={boundModel} detailQuery={reportDetailQuery} pagesQuery={reportPagesQuery} />}
    {activeSection === "source-db-lineage" && <SourceDbLineageTab workspace={workspace} selectedReport={report} query={reportSourceTablesQuery} gatewaySourcesEnabled={gatewaySourcesEnabled} onGatewaySourcesChange={setGatewaySourcesEnabled} />}
    {activeSection === "semantic-objects" && <SemanticObjectsTab workspace={workspace} selectedReport={report} reportSemanticModel={boundModel} modelNames={modelNames} query={semanticModelObjectsQuery} metadataQuery={semanticMetadataQuery} />}
    {activeSection === "semantic-db-mapping" && <SemanticDbMappingTab workspace={workspace} selectedReport={report} semanticModelId={boundModelId} semanticModelName={boundModelName} query={explorerSnapshotQuery} gatewaySourcesEnabled={gatewaySourcesEnabled} onGatewaySourcesChange={setGatewaySourcesEnabled} />}
    {activeSection === "report-semantic" && <ReportSemanticTab workspace={workspace} selectedReport={report} reportSemanticModel={boundModel} boundModelId={boundModelId} normalizedQuery={normalizedReportQuery} lineageQuery={reportSemanticLineageQuery} parsed={parsedSemanticModelQuery.data} />}
  </>;
}

function ReportDetailTab({ workspace, selectedReport, reportSemanticModel, detailQuery, pagesQuery }: {
  workspace: Workspace | null;
  selectedReport: Report | null;
  reportSemanticModel: { id: string; name: string } | null;
  detailQuery: UseQueryResult<Report, Error>;
  pagesQuery: UseQueryResult<ReportPagesResponse, Error>;
}) {
  const pages = pagesQuery.data?.pages ?? [];
  const pageRows: ExplorerGridRow[] = pages.map((page) => ({ id: page.name, pageName: page.name, displayName: page.display_name, order: page.order + 1 }));
  const context = makeExportContext(workspace, selectedReport, reportSemanticModel);
  return <div className="space-y-6">
    <SectionHeading icon={<FileBarChart2 className="size-5" />} title="Report page details" text="Each report is read individually so page information is ready before semantic and source evidence is reviewed." />
    {detailQuery.isLoading || pagesQuery.isLoading ? <ExplorerLoading label="Loading selected report and pages" /> : null}
    {detailQuery.isError || pagesQuery.isError ? <EvidenceError error={detailQuery.error ?? pagesQuery.error} fallback="Selected report details are unavailable for this workspace." /> : null}
    {detailQuery.data && <div className="grid border-y border-zinc-200 md:grid-cols-4"><DetailItem label="Report type" value={detailQuery.data.report_type ?? "Not reported"} /><DetailItem label="Format" value={detailQuery.data.format ?? "Not reported"} /><DetailItem label="Linked model" value={reportSemanticModel?.name ?? "Not reported"} /><DetailItem label="Pages" value={String(pages.length)} /></div>}
    {!pagesQuery.isLoading && !pagesQuery.isError && <ExplorerGrid rowData={pageRows} columnDefs={[{ field: "order", headerName: "Order", minWidth: 100 }, { field: "displayName", headerName: "Page name", minWidth: 280, flex: 1 }]} emptyMessage="No report pages were returned." exportFileName={`${filePart(selectedReport?.name)}-pages`} exportContext={context} />}
  </div>;
}

function SourceDbLineageTab({ workspace, selectedReport, query, gatewaySourcesEnabled, onGatewaySourcesChange }: {
  workspace: Workspace | null;
  selectedReport: Report | null;
  query: UseQueryResult<ReportSourceTablesResponse, Error>;
  gatewaySourcesEnabled: boolean;
  onGatewaySourcesChange: (value: boolean) => void;
}) {
  const rows: ExplorerGridRow[] = (query.data?.rows ?? []).map((row, index) => {
    const absent = absentSourceValue(row.source_object_type);
    return {
      id: `${row.semantic_model_id}-${row.table_name ?? "unknown"}-${index}`,
      workspaceName: row.workspace_name,
      reportName: row.report_name,
      reportId: row.report_id,
      datasetId: row.semantic_model_id,
      origin: sourceOrigin(row.source_object_type),
      sourceAccount: row.source_account ?? absent,
      sourceDatabase: row.source_database ?? absent,
      sourceSchema: row.source_schema ?? absent,
      tableName: row.table_name ?? absent,
      sourceObjectType: row.source_object_type,
      // The hop is detail about how the row was reached, not what it is.
      via: row.via_workspace_name ? `${row.via_workspace_name} / ${row.via_semantic_model_name ?? "Unknown model"}${row.via_semantic_table ? ` / ${row.via_semantic_table}` : ""}` : "Direct",
    };
  });

  const traceTargets: SnowflakeTraceTarget[] = useMemo(() => {
    const seen = new Map<string, SnowflakeTraceTarget>();
    (query.data?.rows ?? []).forEach((row) => {
      const traceable = row.source_object_type === "table" || row.source_object_type === "view";
      if (!traceable || !row.source_database || !row.source_schema || !row.table_name) return;
      const qualifiedName = `${row.source_database}.${row.source_schema}.${row.table_name}`;
      if (!seen.has(qualifiedName)) seen.set(qualifiedName, { qualifiedName, label: qualifiedName });
    });
    return Array.from(seen.values()).sort((a, b) => a.qualifiedName.localeCompare(b.qualifiedName));
  }, [query.data]);

  return <div className="space-y-6">
    <SectionHeading icon={<Database className="size-5" />} title="Source database lineage" text="Every physical table, view, file or URL backing this report's semantic model, read from its partition query evidence. A table reached through another workspace's model reports that real database too, with the hop shown under Via. Tables whose origin could not be traced are listed as unresolved rather than hidden." />
    <EvidenceOptionToggle
      title="Gateway datasources"
      text="Adds on-premises gateway lookups so gateway-backed partitions resolve to their datasource. Needs gateway-admin rights; without them the call still succeeds and returns a warning instead of data."
      label="Include gateway sources"
      checked={gatewaySourcesEnabled}
      onChange={onGatewaySourcesChange}
    />
    {query.isLoading ? <ExplorerLoading label="Reading source database evidence" /> : null}
    {query.isError ? <EvidenceError error={query.error} fallback="Source database lineage requires Fabric access for the selected report's semantic model." /> : null}
    {query.data && <>
      <ExplorerWarnings warnings={query.data.warnings} />
      <ExplorerGrid
        rowData={rows}
        columnDefs={[
          { field: "workspaceName", headerName: "Workspace name", minWidth: 190, flex: 1 },
          { field: "reportName", headerName: "Report name", minWidth: 190, flex: 1 },
          { field: "reportId", headerName: "Report ID", minWidth: 220 },
          { field: "datasetId", headerName: "Dataset ID", minWidth: 220 },
          { field: "origin", headerName: "Origin", minWidth: 170 },
          { field: "sourceAccount", headerName: "Source account", minWidth: 190 },
          { field: "sourceDatabase", headerName: "Source DB", minWidth: 150 },
          { field: "sourceSchema", headerName: "Schema", minWidth: 130 },
          { field: "tableName", headerName: "Table name", minWidth: 190, flex: 1 },
          { field: "sourceObjectType", headerName: "Source object type", minWidth: 160 },
          { field: "via", headerName: "Via (composite model)", minWidth: 230 },
        ]}
        emptyMessage="No source database tables were found for this report's semantic model."
        exportFileName={`${filePart(selectedReport?.name)}-source-db-lineage`}
        exportContext={makeExportContext(workspace, selectedReport)}
      />
      <SnowflakeObjectLineage targets={traceTargets} />
    </>}
  </div>;
}

/**
 * Semantic objects for whichever model(s) the selected report actually uses.
 * There is deliberately no model picker: the report's own binding is the
 * answer, and a picker could only list models in the current workspace, so a
 * report bound across workspaces would show an unrelated model's objects.
 * Rows are tagged with `semantic_model_id`, so however many models the
 * response covers, they render together in one grid.
 */
function SemanticObjectsTab({ workspace, selectedReport, reportSemanticModel, modelNames, query, metadataQuery }: {
  workspace: Workspace | null;
  selectedReport: Report | null;
  reportSemanticModel: { id: string; name: string } | null;
  modelNames?: Map<string, string>;
  query: UseQueryResult<SemanticModelObjectsResponse, Error>;
  metadataQuery: UseQueryResult<MetadataResponse, Error>;
}) {
  const rows = useMemo(() => semanticObjectRows(query.data, modelNames, reportSemanticModel), [query.data, modelNames, reportSemanticModel]);
  const sourceRows = query.data?.rows ?? [];
  const modelCount = useMemo(() => new Set(sourceRows.map((row) => row.semantic_model_id)).size, [sourceRows]);
  const tableCount = useMemo(() => new Set(sourceRows.map((row) => `${row.semantic_model_id}:${row.semantic_table}`)).size, [sourceRows]);

  return <div className="space-y-6">
    <SectionHeading icon={<TableProperties className="size-5" />} title="Semantic model objects" text="Tables, columns, measures, and hierarchies for the semantic model this report is bound to, with their DAX expressions. Power BI's generated Auto Date/Time tables are excluded by the backend." />
    {query.isLoading ? <ExplorerLoading label="Loading semantic model objects" /> : null}
    {query.isError ? <EvidenceError error={query.error} fallback="Semantic object retrieval requires Fabric access for this report's semantic model." /> : null}
    {query.data && <>
      <ExplorerWarnings warnings={query.data.warnings} />
      {modelCount > 1 && <div className="border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">This report draws on <strong>{modelCount}</strong> semantic models. Their objects are listed together below — sort by the Semantic model column to separate them.</div>}
      <div className="grid border-y border-zinc-200 sm:grid-cols-4">
        <DetailItem label="Semantic models" value={String(modelCount)} />
        <DetailItem label="Tables" value={String(tableCount)} />
        <DetailItem label="Columns" value={String(rows.filter((row) => row.kind === "Column" || row.kind === "Calculated column").length)} />
        <DetailItem label="Measures" value={String(rows.filter((row) => row.kind === "Measure").length)} />
      </div>
      <ExplorerGrid
        rowData={rows}
        columnDefs={[
          { field: "semanticModel", headerName: "Semantic model", minWidth: 200 },
          { field: "table", headerName: "Table", minWidth: 190 },
          { field: "name", headerName: "Object name", minWidth: 220, flex: 1 },
          { field: "kind", headerName: "Object type", minWidth: 150 },
          { field: "dataType", headerName: "Data type", minWidth: 130 },
          { field: "sourceColumn", headerName: "Source column", minWidth: 170 },
          daxColumn(),
        ]}
        emptyMessage="No semantic objects were returned for this report's semantic model."
        exportFileName={`${filePart(selectedReport?.name)}-semantic-objects`}
        exportContext={makeExportContext(workspace, selectedReport, reportSemanticModel)}
      />
      <MetadataSummary query={metadataQuery} modelName={reportSemanticModel?.name ?? null} />
    </>}
  </div>;
}

function SemanticDbMappingTab({ workspace, selectedReport, semanticModelId, semanticModelName, query, gatewaySourcesEnabled, onGatewaySourcesChange }: {
  workspace: Workspace | null;
  selectedReport: Report | null;
  semanticModelId: string | null;
  semanticModelName: string | null;
  query: UseQueryResult<ExplorerSnapshot, Error>;
  gatewaySourcesEnabled: boolean;
  onGatewaySourcesChange: (value: boolean) => void;
}) {
  const rows = useMemo(() => (query.data ? semanticDbMappingRows(query.data, semanticModelName) : []), [query.data, semanticModelName]);
  const columnTargets: SnowflakeColumnTarget[] = useMemo(() => {
    const byTable = new Map<string, Set<string>>();
    rows.forEach((row) => {
      const tables = splitResolved(row.sourceTable);
      const columns = splitResolved(row.sourceColumn);
      if (!tables.length || !columns.length) return;
      tables.forEach((table) => {
        const set = byTable.get(table) ?? new Set<string>();
        columns.forEach((column) => set.add(column));
        byTable.set(table, set);
      });
    });
    return Array.from(byTable.entries())
      .map(([qualifiedName, columns]) => ({ qualifiedName, columns: Array.from(columns).sort((a, b) => a.localeCompare(b)) }))
      .sort((a, b) => a.qualifiedName.localeCompare(b.qualifiedName));
  }, [rows]);

  const measures: MeasureDefinitionTarget[] = useMemo(
    () => rows
      .filter((row) => row.kind === "Measure")
      .map((row) => ({
        key: String(row.id),
        table: String(row.table ?? ""),
        name: String(row.name ?? ""),
        daxExpression: String(row.daxExpression ?? "--"),
        sourceColumn: String(row.sourceColumn ?? "Not resolved"),
        sourceTable: String(row.sourceTable ?? "Not resolved"),
      })),
    [rows],
  );
  return <div className="space-y-6">
    <SectionHeading icon={<Database className="size-5" />} title="Semantic to database object mappings" text="Every semantic object beside the database column and physical table it resolves to. Columns map through their declared source column; measures and calculated columns map through the DAX dependencies they read." />
    <EvidenceOptionToggle
      title="Gateway datasources"
      text="Adds on-premises gateway lookups so gateway-backed partitions resolve to their datasource. Needs gateway-admin rights; without them the call still succeeds and returns a warning instead of data."
      label="Include gateway sources"
      checked={gatewaySourcesEnabled}
      onChange={onGatewaySourcesChange}
    />
    {query.isLoading ? <ExplorerLoading label="Reading semantic and database evidence" /> : null}
    {query.isError ? <EvidenceError error={query.error} fallback="Semantic to database mapping requires Fabric access for the selected report's semantic model." /> : null}
    {query.data && <>
      <ExplorerWarnings warnings={query.data.warnings} />
      <ExplorerGrid
        rowData={rows}
        columnDefs={[
          { field: "parent_workspace_name", headerName: "parent_workspace_name", minWidth: 180 },
          { field: "parent_workspace_id", headerName: "parent_workspace_id", minWidth: 220 },
          { field: "parent_report_name", headerName: "parent_report_name", minWidth: 200 },
          { field: "parent_report_id", headerName: "parent_report_id", minWidth: 220 },
          { field: "parent_semantic_model_name", headerName: "parent_semantic_model_name", minWidth: 220 },
          { field: "parent_semantic_model_id", headerName: "parent_semantic_model_id", minWidth: 220 },
          { field: "table", headerName: "table", minWidth: 170 },
          { field: "name", headerName: "name", minWidth: 200, flex: 1 },
          { field: "kind", headerName: "kind", minWidth: 150 },
          { field: "dataType", headerName: "dataType", minWidth: 130 },
          daxColumn("daxExpression", "daxExpression"),
          { field: "sourceColumn", headerName: "sourceColumn", minWidth: 200 },
          { field: "sourceTable", headerName: "sourceTable", minWidth: 280, flex: 1 },
        ]}
        emptyMessage="No semantic objects were returned for this report's semantic model."
        exportFileName={`${filePart(rows[0]?.parent_report_name as string | undefined)}-semantic-db-mappings`}
        exportContext={{}}
      />
      <MeasureAiDefinition
        measures={measures}
        context={{
          workspaceId: workspace?.id,
          workspaceName: workspace?.name,
          reportId: selectedReport?.id,
          reportName: selectedReport?.name,
          semanticModelId: semanticModelId ?? undefined,
          semanticModelName: semanticModelName ?? undefined,
          route: "/workspace/explorer",
        }}
      />
      <SnowflakeColumnLineage targets={columnTargets} />
    </>}
  </div>;
}

function ReportSemanticTab({ workspace, selectedReport, reportSemanticModel, boundModelId, normalizedQuery, lineageQuery, parsed }: {
  workspace: Workspace | null;
  selectedReport: Report | null;
  reportSemanticModel: { id: string; name: string } | null;
  boundModelId: string | null;
  normalizedQuery: UseQueryResult<NormalizedReport, Error>;
  lineageQuery: UseQueryResult<ReportSemanticLineage, Error>;
  parsed: ParsedSemanticModel | undefined;
}) {
  const expressionIndex = useMemo(() => buildExpressionIndex(parsed), [parsed]);
  const fieldRows: ExplorerGridRow[] = (lineageQuery.data?.field_matches ?? []).map((match, index) => {
    const object = match.semantic_object;
    return { id: `${match.page_display_name}-${match.visual_title ?? index}-${index}`, page: match.page_display_name, visual: match.visual_title ?? match.visual_type ?? "Untitled visual", semanticTable: object?.table_name ?? "Unresolved", semanticObject: object?.object_name ?? "Unresolved", type: object?.object_type ?? "--", daxExpression: object ? expressionIndex.get(objectKey(object.table_name, object.object_name)) ?? "No DAX expression declared" : "No semantic object resolved" };
  });
  return <div className="space-y-6">
    <SectionHeading icon={<BookOpenCheck className="size-5" />} title="Report visual lineage" text="This matches fields used in a report's visuals to the linked semantic model, including the DAX expression when that object is calculated." />
    {!reportSemanticModel && boundModelId && <div className="border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">This report's semantic model could not be named from the workspace it was selected in{selectedReport?.dataset_workspace_id ? `; Power BI reports it lives in workspace ${selectedReport.dataset_workspace_id}` : ""}. Field lineage is still requested against the report's bound model.</div>}
    {!boundModelId && <ExplorerError text="This report did not return a bound semantic model, so no field lineage can be requested for it." />}
    {reportSemanticModel && <div className="border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">Linked semantic model: <strong>{reportSemanticModel.name}</strong></div>}
    {normalizedQuery.isLoading || lineageQuery.isLoading ? <ExplorerLoading label="Reading report definition and semantic field matches" /> : null}
    {normalizedQuery.isError || lineageQuery.isError ? <EvidenceError error={normalizedQuery.error ?? lineageQuery.error} fallback="Report semantic lineage needs both Power BI and Fabric permissions for the selected report and model." /> : null}
    {normalizedQuery.data && <div className="grid border-y border-zinc-200 sm:grid-cols-3"><DetailItem label="Pages" value={String(normalizedQuery.data.page_count)} /><DetailItem label="Visuals" value={String(normalizedQuery.data.visual_count)} /><DetailItem label="Definition parts" value={String(normalizedQuery.data.source_part_count)} /></div>}
    {lineageQuery.data && <><div className="grid border-y border-zinc-200 sm:grid-cols-3"><DetailItem label="Field references" value={String(lineageQuery.data.total_field_reference_count)} /><DetailItem label="Matched" value={String(lineageQuery.data.matched_field_reference_count)} /><DetailItem label="Needs review" value={String(lineageQuery.data.unmatched_field_reference_count)} /></div><ExplorerGrid rowData={fieldRows} columnDefs={[{ field: "page", headerName: "Report page", minWidth: 180 }, { field: "visual", headerName: "Visual", minWidth: 190, flex: 1 }, { field: "semanticTable", headerName: "Semantic table", minWidth: 180 }, { field: "semanticObject", headerName: "Semantic object", minWidth: 180 }, { field: "type", headerName: "Type", minWidth: 120 }, daxColumn()]} emptyMessage="No visual field references were returned." exportFileName={`${filePart(selectedReport?.name)}-report-semantic`} exportContext={makeExportContext(workspace, selectedReport, reportSemanticModel)} /></>}
  </div>;
}

function MetadataSummary({ query, modelName }: { query: UseQueryResult<MetadataResponse, Error>; modelName: string | null }) {
  if (query.isLoading) return <ExplorerLoading label="Reconciling runtime XMLA metadata" compact />;
  // The reconciled metadata route needs a live XMLA/MSOLAP connection, which
  // only exists on a Windows deployment. `/health/ready` reports no platform
  // capability, so there is nothing to feature-gate on up front — the call is
  // made and a failure degrades to this note instead of a hard error.
  if (query.isError) return <div className="mt-6 border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">Runtime XMLA reconciliation is unavailable here. It needs a live XMLA connection, which is only available on a Windows deployment and for a capacity that allows it. Every object above is still read from the model definition.</div>;
  if (!query.data) return null;
  const reconciliation = query.data.reconciliation;
  return <div className="mt-6">
    <p className="mb-2 text-xs text-zinc-500">Runtime XMLA reconciliation for {modelName ?? "this report's bound model"}.</p>
    <div className="grid border-y border-zinc-200 sm:grid-cols-3"><DetailItem label="Matched with XMLA" value={String(reconciliation.matched_count)} /><DetailItem label="Definition only" value={String(reconciliation.definition_only_count)} /><DetailItem label="XMLA only" value={String(reconciliation.xmla_only_count)} /></div>
  </div>;
}

/** One row per semantic object, tagged with the model it belongs to so several models can share one grid. */
function semanticObjectRows(response: SemanticModelObjectsResponse | undefined, modelNames: Map<string, string> | undefined, boundModel: { id: string; name: string } | null): ExplorerGridRow[] {
  if (!response) return [];
  return response.rows.map((row, index) => ({
    id: `${row.semantic_model_id}-${row.semantic_table}-${row.semantic_object_type}-${row.semantic_object_name}-${index}`,
    semanticModel: modelNames?.get(row.semantic_model_id) ?? (boundModel?.id === row.semantic_model_id ? boundModel.name : row.semantic_model_id),
    table: row.semantic_table,
    name: row.semantic_object_name,
    kind: SEMANTIC_OBJECT_KIND_LABELS[row.semantic_object_type] ?? row.semantic_object_type,
    dataType: row.semantic_data_type ?? "--",
    sourceColumn: row.semantic_source_column ?? "--",
    daxExpression: row.semantic_dax_expression ?? "--",
  }));
}

/**
 * Joins the three snapshot datasets into one row per semantic object.
 *
 * A plain column declares its database column directly in TMDL. A measure or
 * calculated column does not — its physical columns are only knowable by
 * following its DAX dependencies, which is what `measure_source_lineage`
 * already did, so those are read from there and listed together. The fully
 * qualified table falls back to the semantic table's own physical source when
 * an object has no traced dependency of its own.
 */
function semanticDbMappingRows(snapshot: ExplorerSnapshot, semanticModelName: string | null): ExplorerGridRow[] {
  const traced = new Map<string, { columns: Set<string>; qualified: Set<string> }>();
  snapshot.measure_source_lineage.rows.forEach((row) => {
    const key = objectKey(row.semantic_table, row.semantic_object_name);
    const entry = traced.get(key) ?? { columns: new Set<string>(), qualified: new Set<string>() };
    if (row.source_column_name) entry.columns.add(row.source_column_name);
    if (row.source_fully_qualified_name) entry.qualified.add(row.source_fully_qualified_name);
    traced.set(key, entry);
  });

  const qualifiedByTable = new Map<string, string>();
  snapshot.source_database_lineage.rows.forEach((row) => {
    if (row.source_fully_qualified_name) qualifiedByTable.set(row.semantic_table, row.source_fully_qualified_name);
  });

  return snapshot.semantic_model_objects.rows.map((row, index) => {
    const trace = traced.get(objectKey(row.semantic_table, row.semantic_object_name));
    const dbColumns = row.semantic_source_column ? [row.semantic_source_column] : Array.from(trace?.columns ?? []);
    const tableFallback = qualifiedByTable.get(row.semantic_table);
    const qualified = trace?.qualified.size ? Array.from(trace.qualified) : tableFallback ? [tableFallback] : [];
    return {
      id: `${row.semantic_model_id}-${row.semantic_table}-${row.semantic_object_type}-${row.semantic_object_name}-${index}`,
      parent_workspace_name: row.workspace_name,
      parent_workspace_id: row.workspace_id,
      parent_report_name: row.report_name,
      parent_report_id: row.report_id,
      parent_semantic_model_name: semanticModelName ?? "Not reported",
      parent_semantic_model_id: row.semantic_model_id,
      table: row.semantic_table,
      name: row.semantic_object_name,
      kind: SEMANTIC_OBJECT_KIND_LABELS[row.semantic_object_type] ?? row.semantic_object_type,
      dataType: row.semantic_data_type ?? "--",
      daxExpression: row.semantic_dax_expression ?? "--",
      sourceColumn: dbColumns.length ? dbColumns.join(", ") : "Not resolved",
      sourceTable: qualified.length ? qualified.join(", ") : "Not resolved",
    };
  });
}

/** Splits a joined cell back into values, dropping the "Not resolved" placeholder rather than offering it as a name. */
function splitResolved(value: ExportValue): string[] {
  const text = typeof value === "string" ? value : "";
  if (!text || text === "Not resolved" || text === "--") return [];
  return text.split(",").map((part) => part.trim()).filter((part) => part && part !== "Not resolved");
}

/**
 * Short, readable classification of where a table's data actually comes from.
 *
 * A composite-model table is no longer a category here. The backend now
 * follows the link into the other workspace and reports the real database, so
 * such a row is an ordinary database row; that it arrived via another model is
 * shown separately, from `via_workspace_name`.
 */
function sourceOrigin(objectType: string): string {
  switch (objectType) {
    case "table": return "Database table";
    case "view": return "Database view";
    case "query": return "Native query";
    case "file": return "File";
    case "url": return "Web URL";
    case "endpoint": return "Endpoint";
    case "unknown": return "Unresolved";
    default: return objectType || "Unresolved";
  }
}

/**
 * Account/database/schema are genuinely inapplicable for file, URL and
 * endpoint rows, and genuinely untraceable for unresolved ones — say which,
 * rather than rendering a row of identical blanks.
 */
function absentSourceValue(objectType: string): string {
  if (objectType === "unknown") return "Not resolved";
  if (objectType === "file" || objectType === "url" || objectType === "endpoint") return "Not applicable";
  return "Not reported";
}

function buildExpressionIndex(parsed: ParsedSemanticModel | undefined) {
  const index = new Map<string, string>();
  parsed?.tables.forEach((table) => {
    if (table.expression) index.set(objectKey(table.name, table.name), table.expression);
    table.columns.forEach((column) => { if (column.expression) index.set(objectKey(table.name, column.name), column.expression); });
    table.measures.forEach((measure) => { if (measure.expression) index.set(objectKey(table.name, measure.name), measure.expression); });
  });
  return index;
}
