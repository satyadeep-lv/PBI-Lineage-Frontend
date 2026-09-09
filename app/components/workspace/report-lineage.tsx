import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type ICellRendererParams } from "ag-grid-community";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  BookOpenCheck,
  CheckCircle2,
  ClipboardCopy,
  Copy,
  Database,
  Download,
  Eye,
  FileBarChart2,
  FileSpreadsheet,
  GitBranch,
  Layers3,
  Loader2,
  TableProperties,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { ReportLineageDiagrams } from "~/components/workspace/report-lineage-diagrams";
import { readJsonResponse } from "~/lib/api-catalog";
import { cn } from "~/lib/utils";
import { useAppStore } from "~/stores/app-store";

ModuleRegistry.registerModules([AllCommunityModule]);

const reportGridTheme = themeQuartz.withParams({
  accentColor: "#0f766e",
  backgroundColor: "#ffffff",
  borderColor: "#e4e4e7",
  foregroundColor: "#18181b",
  headerBackgroundColor: "#fafafa",
  headerTextColor: "#52525b",
  rowHoverColor: "#f4f4f5",
  wrapperBorder: false,
});

type ReportTab = "overview" | "database" | "semantic" | "visuals" | "semantic-mapping" | "visual-mapping" | "lineage";
type GridValue = string | number | boolean | null | undefined;
type GridRow = { id: string; [key: string]: GridValue };

type Workspace = { id: string; name: string };
type Report = { id: string; name: string; dataset_id?: string | null; description?: string | null; report_type?: string | null; format?: string | null; is_owned_by_me?: boolean | null };
type SemanticModel = { id: string; name: string };
type EstateInventory = {
  workspace: Workspace;
  reports: Report[];
  semantic_models: SemanticModel[];
  report_bindings: Array<{ report_id: string; semantic_model_id?: string | null; status: "matched" | "unresolved" }>;
};
type EstateNode = { node_id: string; node_type: string; name: string; workspace_id?: string | null; semantic_model_id?: string | null; report_id?: string | null };
type EstateResponse = {
  workspaces: EstateInventory[];
  graph: { nodes: EstateNode[]; edges: Array<{ source_id: string; target_id: string }> };
  warnings: Array<{ code: string; message: string }>;
  workspace_count: number;
  report_count: number;
  semantic_model_count: number;
};
type ReportChoice = {
  key: string;
  workspaceId: string;
  workspaceName: string;
  report: Report;
  semanticModelId: string | null;
  semanticModelWorkspaceId: string | null;
  semanticModelName: string | null;
};
type SnapshotWarning = { code: string; message: string; source_path?: string | null };
type SourceRow = { semantic_table: string; source_id: string; source_kind: string; source_provider: string; source_connector?: string | null; source_server?: string | null; source_database?: string | null; source_schema?: string | null; source_object_name?: string | null; source_object_type: string; source_fully_qualified_name: string };
type SemanticObjectRow = { semantic_table: string; semantic_object_type: string; semantic_object_name: string; semantic_data_type?: string | null; semantic_source_column?: string | null; semantic_dax_expression?: string | null; format_string?: string | null; is_hidden?: boolean | null; source_path?: string | null };
type MeasureSourceRow = { semantic_table?: string | null; semantic_object_type: string; semantic_object_name: string; semantic_dax_expression?: string | null; source_semantic_table?: string | null; source_semantic_object_type?: string | null; source_semantic_object_name?: string | null; source_column_name?: string | null; dependency_depth?: number | null; is_direct_dependency?: boolean | null; source_provider?: string | null; source_fully_qualified_name?: string | null };
type ReportLayoutRow = { page_id: string; page_name: string; page_order?: number | null; visual_id: string; visual_name: string; visual_type?: string | null; field_usage?: string | null; field_role?: string | null; field_type?: string | null; table_name?: string | null; column_measure_name?: string | null; aggregation?: number | string | null; query_reference?: string | null; visual_x?: number | null; visual_y?: number | null; visual_width?: number | null; visual_height?: number | null };
type VisualSourceRow = { page_id: string; page_name: string; visual_id: string; visual_name: string; visual_type?: string | null; field_usage: string; field_role?: string | null; field_type: string; visual_table_name?: string | null; visual_field_name?: string | null; semantic_table?: string | null; semantic_object_name?: string | null; semantic_object_type?: string | null; semantic_object_source_path?: string | null; match_status: string; match_confidence: number; match_reason?: string | null };
type ExplorerSnapshot = {
  generated_at: string;
  report_count: number;
  semantic_model_count: number;
  warnings: SnapshotWarning[];
  source_database_lineage: { rows: SourceRow[]; count: number };
  semantic_model_objects: { rows: SemanticObjectRow[]; count: number };
  measure_source_lineage: { rows: MeasureSourceRow[]; count: number };
  report_layout: { rows: ReportLayoutRow[]; count: number };
  visual_source_lookup: { rows: VisualSourceRow[]; count: number };
};
type ParsedColumn = { name: string; source_path?: string | null; source_column?: string | null; data_type?: string | null; expression?: string | null; is_hidden?: boolean | null };
type ParsedTable = { name: string; source_path?: string | null; expression?: string | null; columns: ParsedColumn[]; measures: Array<{ name: string; expression?: string | null; is_hidden?: boolean | null }>; hierarchies: Array<{ name: string; levels: Array<{ name: string; column?: string | null }> }> };
type ParsedSemanticModel = { workspace_id: string; semantic_model_id: string; format?: string | null; tables: ParsedTable[]; relationships: Array<{ name?: string | null; from_table?: string | null; from_column?: string | null; to_table?: string | null; to_column?: string | null; is_active?: boolean | null }>; warnings: Array<{ code: string; message: string }> };
type DaxReference = { object_type: string; table_name?: string | null; object_name: string; qualified_name: string };
type DaxAnalysis = { objects: DaxReference[]; dependencies: Array<{ source: DaxReference; target: DaxReference; reference_text: string }>; warnings: Array<{ code: string; message: string; object_name?: string | null }>; object_count: number; dependency_count: number };

const tabs: Array<{ id: ReportTab; label: string }> = [
  { id: "overview", label: "Report information" },
  { id: "database", label: "Database objects" },
  { id: "semantic", label: "Semantic objects" },
  { id: "visuals", label: "Visual objects" },
  { id: "semantic-mapping", label: "Semantic source mapping" },
  { id: "visual-mapping", label: "Visual source mapping" },
  { id: "lineage", label: "Lineage" },
];

export function ReportLineage() {
  const apiOrigin = useAppStore((state) => state.apiOrigin);
  const [activeTab, setActiveTab] = useState<ReportTab>("overview");
  const [selectedKey, setSelectedKey] = useState("");
  const estateQuery = useQuery({
    queryKey: ["report-lineage", "estate", apiOrigin],
    queryFn: () => requestJson<EstateResponse>(apiOrigin, "/api/v1/lineage/estate/discover?top=5000&skip=0"),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
  });
  const reportChoices = useMemo(() => buildReportChoices(estateQuery.data), [estateQuery.data]);

  useEffect(() => {
    if (reportChoices.length && !reportChoices.some((choice) => choice.key === selectedKey)) setSelectedKey(reportChoices[0].key);
  }, [reportChoices, selectedKey]);

  const selectedReport = reportChoices.find((choice) => choice.key === selectedKey) ?? null;
  const snapshotQuery = useQuery({
    queryKey: ["report-lineage", "snapshot", apiOrigin, selectedReport?.workspaceId, selectedReport?.report.id, selectedReport?.semanticModelWorkspaceId, selectedReport?.semanticModelId],
    queryFn: () => requestJson<ExplorerSnapshot>(apiOrigin, "/api/v1/explorer/snapshot", {
      method: "POST",
      body: JSON.stringify({
        reports: [{
          workspace_id: selectedReport!.workspaceId,
          report_id: selectedReport!.report.id,
          ...(selectedReport!.semanticModelId ? { semantic_model_id: selectedReport!.semanticModelId } : {}),
          ...(selectedReport!.semanticModelWorkspaceId ? { semantic_model_workspace_id: selectedReport!.semanticModelWorkspaceId } : {}),
        }],
        include_gateway_sources: false,
        report_definition_format: "PBIR",
        semantic_model_definition_format: "TMDL",
      }),
    }),
    enabled: Boolean(selectedReport),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
  });
  const parsedSemanticModelQuery = useQuery({
    queryKey: ["report-lineage", "parsed-semantic-model", apiOrigin, selectedReport?.semanticModelWorkspaceId, selectedReport?.semanticModelId],
    queryFn: () => requestJson<ParsedSemanticModel>(apiOrigin, `/api/v1/workspaces/${selectedReport!.semanticModelWorkspaceId}/semantic-models/${selectedReport!.semanticModelId}/definition/parsed?format=TMDL`, { method: "POST" }),
    enabled: Boolean(selectedReport?.semanticModelWorkspaceId && selectedReport?.semanticModelId),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
  });
  const daxQuery = useQuery({
    queryKey: ["report-lineage", "dax-analysis", apiOrigin, selectedReport?.semanticModelWorkspaceId, selectedReport?.semanticModelId, parsedSemanticModelQuery.dataUpdatedAt],
    queryFn: () => requestJson<DaxAnalysis>(apiOrigin, "/api/v1/lineage/dax/analyze", { method: "POST", body: JSON.stringify(parsedSemanticModelQuery.data) }),
    enabled: Boolean(parsedSemanticModelQuery.data),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
  });

  if (estateQuery.isLoading) return <LoadingState label="Discovering reports across accessible workspaces" />;
  if (estateQuery.isError) return <AuthenticationState />;
  if (!reportChoices.length) return <EmptyState title="No reports found" text="No accessible reports were returned by estate discovery." />;

  return <section className="border border-zinc-200 bg-white">
    <div className="border-b border-zinc-200 px-5 py-5 sm:px-6">
      <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-start">
        <div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-[8px] bg-cyan-800 text-white"><GitBranch className="size-5" /></span><div><div className="mb-1 flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase text-cyan-800">Cross-workspace analysis</span><Badge className="rounded-[8px] border border-cyan-200 bg-cyan-50 text-cyan-900">Report focused</Badge></div><h1 className="text-lg font-semibold">Report lineage</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500">Select any accessible report by name to inspect its database, semantic, DAX, page, visual, and source-mapping evidence.</p></div></div>
        <ReportSelector reports={reportChoices} selectedKey={selectedKey} onChange={setSelectedKey} />
      </div>
      {selectedReport && <div className="mt-5 grid border-y border-zinc-200 sm:grid-cols-4"><Detail label="Workspace" value={selectedReport.workspaceName} /><Detail label="Report" value={selectedReport.report.name} /><Detail label="Semantic model" value={selectedReport.semanticModelName ?? "Unresolved"} /><Detail label="Report type" value={selectedReport.report.report_type ?? "Not reported"} /></div>}
    </div>

    <div className="overflow-x-auto border-b border-zinc-200 bg-zinc-50"><div className="flex min-w-max px-4 sm:px-6" role="tablist" aria-label="Report lineage views">{tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} className={cn("border-b-2 px-4 py-3 text-sm", activeTab === tab.id ? "border-cyan-800 font-semibold text-cyan-900" : "border-transparent text-zinc-500 hover:text-zinc-950")}>{tab.label}</button>)}</div></div>

    <div className="p-5 sm:p-6">
      {snapshotQuery.isLoading && <LoadingState label={`Preparing ${selectedReport?.report.name ?? "report"} lineage evidence`} compact />}
      {snapshotQuery.isError && <ErrorState text="The report snapshot could not be prepared. Confirm Power BI and Fabric access, then retry the selected report." />}
      {snapshotQuery.data && selectedReport && <ReportTabContent activeTab={activeTab} report={selectedReport} snapshot={snapshotQuery.data} parsed={parsedSemanticModelQuery.data} dax={daxQuery.data} exactLineageLoading={parsedSemanticModelQuery.isLoading || daxQuery.isLoading} exactLineageError={parsedSemanticModelQuery.isError || daxQuery.isError} />}
    </div>
  </section>;
}

function ReportTabContent({ activeTab, report, snapshot, parsed, dax, exactLineageLoading, exactLineageError }: { activeTab: ReportTab; report: ReportChoice; snapshot: ExplorerSnapshot; parsed: ParsedSemanticModel | undefined; dax: DaxAnalysis | undefined; exactLineageLoading: boolean; exactLineageError: boolean }) {
  const context = exportContext(report);
  const databaseRows: GridRow[] = snapshot.source_database_lineage.rows.map((row, index) => ({ id: `${row.source_id}-${row.semantic_table}-${index}`, semanticTable: row.semantic_table, databaseObject: row.source_fully_qualified_name, provider: row.source_provider, connector: row.source_connector ?? "--", objectType: row.source_object_type, server: row.source_server ?? "--", database: row.source_database ?? "--", schema: row.source_schema ?? "--", objectName: row.source_object_name ?? "--" }));
  const semanticRows: GridRow[] = snapshot.semantic_model_objects.rows.map((row, index) => ({ id: `${row.semantic_table}-${row.semantic_object_type}-${row.semantic_object_name}-${index}`, table: row.semantic_table, objectType: row.semantic_object_type, objectName: row.semantic_object_name, dataType: row.semantic_data_type ?? "--", sourceColumn: row.semantic_source_column ?? "--", daxExpression: row.semantic_dax_expression ?? "--", formatString: row.format_string ?? "--", visibility: row.is_hidden ? "Hidden" : "Visible", sourcePath: row.source_path ?? "--" }));
  const visualRows: GridRow[] = snapshot.report_layout.rows.map((row, index) => ({ id: `${row.page_id}-${row.visual_id}-${index}`, pageOrder: row.page_order == null ? "--" : row.page_order + 1, page: row.page_name, visual: row.visual_name, visualType: row.visual_type ?? "--", fieldUsage: row.field_usage ?? "--", fieldRole: row.field_role ?? "--", fieldType: row.field_type ?? "--", semanticTable: row.table_name ?? "--", field: row.column_measure_name ?? "--", queryReference: row.query_reference ?? "--" }));
  const semanticMappingRows: GridRow[] = snapshot.measure_source_lineage.rows.map((row, index) => ({ id: `${row.semantic_table}-${row.semantic_object_name}-${index}`, targetTable: row.semantic_table ?? "--", targetType: row.semantic_object_type, targetObject: row.semantic_object_name, daxExpression: row.semantic_dax_expression ?? "--", sourceTable: row.source_semantic_table ?? "--", sourceType: row.source_semantic_object_type ?? "--", sourceObject: row.source_semantic_object_name ?? "--", sourceColumn: row.source_column_name ?? "--", depth: row.dependency_depth ?? "--", directDependency: row.is_direct_dependency == null ? "--" : row.is_direct_dependency ? "Yes" : "No", databaseObject: row.source_fully_qualified_name ?? "--", provider: row.source_provider ?? "--" }));
  const visualMappingRows: GridRow[] = snapshot.visual_source_lookup.rows.map((row, index) => ({ id: `${row.page_id}-${row.visual_id}-${index}`, page: row.page_name, visual: row.visual_name, visualType: row.visual_type ?? "--", visualTable: row.visual_table_name ?? "--", visualField: row.visual_field_name ?? "--", fieldUsage: row.field_usage, semanticTable: row.semantic_table ?? "Unresolved", semanticObject: row.semantic_object_name ?? "Unresolved", semanticType: row.semantic_object_type ?? "--", sourcePath: row.semantic_object_source_path ?? "--", status: row.match_status, confidence: `${Math.round(row.match_confidence * 100)}%`, reason: row.match_reason ?? "--" }));

  if (activeTab === "overview") return <Overview report={report} snapshot={snapshot} />;
  if (activeTab === "database") return <TabSection icon={<Database className="size-5" />} title="Database objects used" text="Physical source objects connected to semantic tables used by this report."><LineageGrid rows={databaseRows} columns={[{ field: "semanticTable", headerName: "Semantic table", minWidth: 190 }, { field: "databaseObject", headerName: "Database object", minWidth: 280, flex: 1.4 }, { field: "provider", headerName: "Provider", minWidth: 150 }, { field: "connector", headerName: "Connector", minWidth: 160 }, { field: "objectType", headerName: "Object type", minWidth: 130 }, { field: "server", headerName: "Server", minWidth: 180 }, { field: "database", headerName: "Database", minWidth: 160 }, { field: "schema", headerName: "Schema", minWidth: 140 }, { field: "objectName", headerName: "Object", minWidth: 180 }]} context={context} fileName={`${filePart(report.report.name)}-database-objects`} /></TabSection>;
  if (activeTab === "semantic") return <TabSection icon={<TableProperties className="size-5" />} title="Semantic objects" text="Tables, columns, calculated columns, measures, hierarchies, and DAX returned for this report's model."><LineageGrid rows={semanticRows} columns={[{ field: "table", headerName: "Table", minWidth: 190 }, { field: "objectType", headerName: "Object type", minWidth: 150 }, { field: "objectName", headerName: "Object name", minWidth: 210 }, { field: "dataType", headerName: "Data type", minWidth: 130 }, { field: "sourceColumn", headerName: "Source column", minWidth: 170 }, { field: "daxExpression", headerName: "DAX expression", minWidth: 300, flex: 1.5, tooltipField: "daxExpression" }, { field: "visibility", headerName: "Visibility", minWidth: 110 }, { field: "sourcePath", headerName: "Source path", minWidth: 250 }]} context={context} fileName={`${filePart(report.report.name)}-semantic-objects`} /></TabSection>;
  if (activeTab === "visuals") return <TabSection icon={<Eye className="size-5" />} title="Visual objects" text="Report pages, visuals, field roles, and semantic references from the normalized PBIR definition."><LineageGrid rows={visualRows} columns={[{ field: "pageOrder", headerName: "Page order", minWidth: 110 }, { field: "page", headerName: "Page", minWidth: 180 }, { field: "visual", headerName: "Visual", minWidth: 210 }, { field: "visualType", headerName: "Visual type", minWidth: 150 }, { field: "fieldUsage", headerName: "Usage", minWidth: 120 }, { field: "fieldRole", headerName: "Role", minWidth: 150 }, { field: "fieldType", headerName: "Field type", minWidth: 130 }, { field: "semanticTable", headerName: "Table", minWidth: 170 }, { field: "field", headerName: "Column / measure", minWidth: 210 }, { field: "queryReference", headerName: "Query reference", minWidth: 220 }]} context={context} fileName={`${filePart(report.report.name)}-visual-objects`} /></TabSection>;
  if (activeTab === "semantic-mapping") return <TabSection icon={<Layers3 className="size-5" />} title="Semantic source mapping" text="Measures and calculated objects mapped through their semantic dependencies to physical source evidence."><LineageGrid rows={semanticMappingRows} columns={[{ field: "targetTable", headerName: "Target table", minWidth: 170 }, { field: "targetType", headerName: "Target type", minWidth: 140 }, { field: "targetObject", headerName: "Target object", minWidth: 200 }, { field: "daxExpression", headerName: "DAX expression", minWidth: 300, flex: 1.5, tooltipField: "daxExpression" }, { field: "sourceTable", headerName: "Source table", minWidth: 170 }, { field: "sourceType", headerName: "Source type", minWidth: 140 }, { field: "sourceObject", headerName: "Source object", minWidth: 190 }, { field: "sourceColumn", headerName: "Source column", minWidth: 180 }, { field: "depth", headerName: "Depth", minWidth: 90 }, { field: "directDependency", headerName: "Direct", minWidth: 90 }, { field: "databaseObject", headerName: "Database object", minWidth: 250 }, { field: "provider", headerName: "Provider", minWidth: 140 }]} context={context} fileName={`${filePart(report.report.name)}-semantic-source-mapping`} /></TabSection>;
  if (activeTab === "visual-mapping") return <TabSection icon={<BookOpenCheck className="size-5" />} title="Visual semantic source mapping" text="Each visual field mapped to its resolved semantic object and source-path evidence."><LineageGrid rows={visualMappingRows} columns={[{ field: "page", headerName: "Page", minWidth: 170 }, { field: "visual", headerName: "Visual", minWidth: 200 }, { field: "visualType", headerName: "Visual type", minWidth: 140 }, { field: "visualTable", headerName: "Visual table", minWidth: 170 }, { field: "visualField", headerName: "Visual field", minWidth: 190 }, { field: "fieldUsage", headerName: "Usage", minWidth: 120 }, { field: "semanticTable", headerName: "Semantic table", minWidth: 170 }, { field: "semanticObject", headerName: "Semantic object", minWidth: 190 }, { field: "semanticType", headerName: "Object type", minWidth: 140 }, { field: "sourcePath", headerName: "Source path", minWidth: 250 }, { field: "status", headerName: "Status", minWidth: 110 }, { field: "confidence", headerName: "Confidence", minWidth: 110 }, { field: "reason", headerName: "Match reason", minWidth: 220 }]} context={context} fileName={`${filePart(report.report.name)}-visual-source-mapping`} /></TabSection>;
  return <ReportLineageDiagrams report={report} snapshot={snapshot} parsed={parsed} dax={dax} exactLineageLoading={exactLineageLoading} exactLineageError={exactLineageError} />;
}

function Overview({ report, snapshot }: { report: ReportChoice; snapshot: ExplorerSnapshot }) {
  return <div className="space-y-6"><TabHeading icon={<FileBarChart2 className="size-5" />} title="Report information" text="A report-wide summary assembled from Power BI, Fabric definitions, semantic metadata, DAX, and source evidence." /><div className="grid border-y border-zinc-200 sm:grid-cols-3 lg:grid-cols-5"><Detail label="Database mappings" value={String(snapshot.source_database_lineage.count)} /><Detail label="Semantic objects" value={String(snapshot.semantic_model_objects.count)} /><Detail label="DAX source rows" value={String(snapshot.measure_source_lineage.count)} /><Detail label="Visual field rows" value={String(snapshot.report_layout.count)} /><Detail label="Visual mappings" value={String(snapshot.visual_source_lookup.count)} /></div><dl className="grid gap-px border border-zinc-200 bg-zinc-200 sm:grid-cols-2"><OverviewField label="Report name" value={report.report.name} /><OverviewField label="Report ID" value={report.report.id} /><OverviewField label="Workspace" value={report.workspaceName} /><OverviewField label="Workspace ID" value={report.workspaceId} /><OverviewField label="Semantic model" value={report.semanticModelName ?? "Unresolved"} /><OverviewField label="Semantic model ID" value={report.semanticModelId ?? "Unresolved"} /><OverviewField label="Format" value={report.report.format ?? "Not reported"} /><OverviewField label="Access" value={report.report.is_owned_by_me ? "Owned by connected identity" : "Shared with connected identity"} /></dl>{snapshot.warnings.length > 0 && <div className="border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-semibold text-amber-950">Partial evidence</p><ul className="mt-2 space-y-1 text-xs leading-5 text-amber-900">{snapshot.warnings.slice(0, 8).map((warning, index) => <li key={`${warning.code}-${index}`}>{warning.message}</li>)}</ul></div>}</div>;
}

function ReportSelector({ reports, selectedKey, onChange }: { reports: ReportChoice[]; selectedKey: string; onChange: (value: string) => void }) {
  const selected = reports.find((report) => report.key === selectedKey) ?? null;
  return <div className="w-full space-y-1.5 xl:max-w-md"><label htmlFor="report-lineage-report" className="text-xs font-semibold text-zinc-600">Report</label><select id="report-lineage-report" value={selectedKey} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-cyan-800 focus:ring-2 focus:ring-cyan-100"><option value="" disabled>Select a report</option>{reports.map((report) => <option key={report.key} value={report.key}>{report.report.name} - {report.workspaceName}</option>)}</select>{selected && <p className="break-all text-xs text-zinc-500">Selected report ID: <code className="text-zinc-700">{selected.report.id}</code></p>}</div>;
}

function TabSection({ icon, title, text, children }: { icon: React.ReactNode; title: string; text: string; children: React.ReactNode }) {
  return <div><TabHeading icon={icon} title={title} text={text} />{children}</div>;
}

function TabHeading({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="flex items-start gap-3"><span className="mt-0.5 text-cyan-800">{icon}</span><div><h2 className="text-base font-semibold">{title}</h2><p className="mt-1 text-sm leading-6 text-zinc-500">{text}</p></div></div>;
}

function LineageGrid({ rows, columns, context, fileName }: { rows: GridRow[]; columns: ColDef<GridRow>[]; context: Record<string, string>; fileName: string }) {
  const [copied, setCopied] = useState(false);
  async function copyTable() { await copyText(toTsv(withContext(rows, context))); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }
  return <div className="mt-4 overflow-x-auto border border-zinc-200"><div className="flex min-w-[760px] items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-3 py-2"><span className="text-xs text-zinc-500">{rows.length} {rows.length === 1 ? "row" : "rows"}</span><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={!rows.length} onClick={() => void copyTable()}>{copied ? <CheckCircle2 className="size-3.5 text-emerald-700" /> : <ClipboardCopy className="size-3.5" />}{copied ? "Copied" : "Copy table"}</Button><Button type="button" variant="outline" size="sm" disabled={!rows.length} onClick={() => downloadCsv(rows, context, fileName)}><Download className="size-3.5" />CSV</Button><Button type="button" variant="outline" size="sm" disabled={!rows.length} onClick={() => downloadExcel(rows, context, fileName)}><FileSpreadsheet className="size-3.5" />Excel</Button></div></div><div className="h-[430px] min-w-[760px]"><AgGridReact<GridRow> theme={reportGridTheme} rowData={rows} columnDefs={columns} defaultColDef={{ sortable: true, filter: true, resizable: true, minWidth: 110, cellRenderer: CopyCell }} rowHeight={42} headerHeight={40} enableCellTextSelection ensureDomOrder overlayNoRowsTemplate="No rows were returned for this report." /></div></div>;
}

function CopyCell({ value }: ICellRendererParams<GridRow>) {
  const [copied, setCopied] = useState(false);
  const text = String(value ?? "--");
  async function copy(event: React.MouseEvent<HTMLButtonElement>) { event.stopPropagation(); await copyText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1200); }
  return <span className="group flex h-full min-w-0 items-center gap-1"><span className="min-w-0 truncate" title={text}>{text}</span><button type="button" className="ml-auto hidden shrink-0 text-zinc-400 hover:text-cyan-800 group-hover:inline-flex focus:inline-flex" title="Copy value" aria-label="Copy cell value" onClick={(event) => void copy(event)}>{copied ? <CheckCircle2 className="size-3.5 text-emerald-700" /> : <Copy className="size-3.5" />}</button></span>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div className="min-w-0 border-b border-zinc-200 px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 truncate text-sm font-semibold" title={value}>{value}</p></div>; }
function OverviewField({ label, value }: { label: string; value: string }) { return <div className="bg-white p-3"><dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-1 break-all text-sm font-medium">{value}</dd></div>; }
function LoadingState({ label, compact = false }: { label: string; compact?: boolean }) { return <div className={cn("flex items-center justify-center gap-2 border border-zinc-200 bg-zinc-50 text-sm text-zinc-600", compact ? "min-h-[280px]" : "min-h-[560px]")}><Loader2 className="size-4 animate-spin text-cyan-800" />{label}</div>; }
function ErrorState({ text }: { text: string }) { return <div className="border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">{text}</div>; }
function EmptyState({ title, text }: { title: string; text: string }) { return <div className="flex min-h-[560px] items-center justify-center border border-zinc-200 bg-white p-6 text-center"><div><FileBarChart2 className="mx-auto size-8 text-zinc-300" /><h1 className="mt-4 text-lg font-semibold">{title}</h1><p className="mt-2 text-sm text-zinc-500">{text}</p></div></div>; }
function AuthenticationState() { return <div className="flex min-h-[560px] items-center justify-center border border-zinc-200 bg-white p-6 text-center"><div className="max-w-md"><AlertCircle className="mx-auto size-8 text-amber-500" /><h1 className="mt-4 text-lg font-semibold">Power BI authentication is required</h1><p className="mt-2 text-sm leading-6 text-zinc-500">Complete Power BI setup with device code or a service principal, then return to Report lineage.</p><a href="/workspace/power-bi" className="mt-5 inline-flex h-8 items-center rounded-lg bg-zinc-950 px-3 text-sm font-medium text-white">Open Power BI setup</a></div></div>; }

function buildReportChoices(estate: EstateResponse | undefined): ReportChoice[] {
  if (!estate) return [];
  const nodes = new Map(estate.graph.nodes.map((node) => [node.node_id, node]));
  return estate.workspaces.flatMap((inventory) => inventory.reports.map((report) => {
    const binding = inventory.report_bindings.find((item) => item.report_id === report.id);
    const semanticModelId = binding?.semantic_model_id ?? report.dataset_id ?? null;
    const localModel = inventory.semantic_models.find((model) => model.id === semanticModelId);
    const reportNodeIds = estate.graph.nodes.filter((node) => node.node_type === "report" && node.report_id === report.id && node.workspace_id === inventory.workspace.id).map((node) => node.node_id);
    const connectedModel = estate.graph.edges.flatMap((edge) => reportNodeIds.includes(edge.source_id) ? [nodes.get(edge.target_id)] : reportNodeIds.includes(edge.target_id) ? [nodes.get(edge.source_id)] : []).find((node) => node?.node_type === "semantic_model" && (!semanticModelId || node.semantic_model_id === semanticModelId));
    const semanticModelWorkspaceId = connectedModel?.workspace_id ?? (localModel ? inventory.workspace.id : null);
    return { key: `${inventory.workspace.id}:${report.id}`, workspaceId: inventory.workspace.id, workspaceName: inventory.workspace.name, report, semanticModelId, semanticModelWorkspaceId, semanticModelName: connectedModel?.name ?? localModel?.name ?? null };
  })).sort((first, second) => first.report.name.localeCompare(second.report.name) || first.workspaceName.localeCompare(second.workspaceName));
}

function exportContext(report: ReportChoice) { return { parent_workspace_name: report.workspaceName, parent_workspace_id: report.workspaceId, parent_report_name: report.report.name, parent_report_id: report.report.id, parent_semantic_model_name: report.semanticModelName ?? "", parent_semantic_model_id: report.semanticModelId ?? "" }; }
function withContext(rows: GridRow[], context: Record<string, string>) { return rows.map(({ id: _id, ...row }) => ({ ...context, ...row })); }
function columnsFor(rows: Array<Record<string, GridValue>>) { return Array.from(new Set(rows.flatMap((row) => Object.keys(row)))); }
function toTsv(rows: Array<Record<string, GridValue>>) { const columns = columnsFor(rows); return [columns.join("\t"), ...rows.map((row) => columns.map((column) => String(row[column] ?? "").replace(/[\t\r\n]+/g, " ")).join("\t"))].join("\n"); }
function downloadCsv(rows: GridRow[], context: Record<string, string>, fileName: string) { const data = withContext(rows, context); const columns = columnsFor(data); const csv = [columns.join(","), ...data.map((row) => columns.map((column) => `"${String(row[column] ?? "").replace(/"/g, '""')}"`).join(","))].join("\r\n"); downloadBlob(`\uFEFF${csv}`, "text/csv;charset=utf-8", `${filePart(fileName)}.csv`); }
function downloadExcel(rows: GridRow[], context: Record<string, string>, fileName: string) { const data = withContext(rows, context); const columns = columnsFor(data); const table = `<table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${data.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(String(row[column] ?? ""))}</td>`).join("")}</tr>`).join("")}</tbody></table>`; downloadBlob(`<!doctype html><html><head><meta charset="utf-8"></head><body>${table}</body></html>`, "application/vnd.ms-excel;charset=utf-8", `${filePart(fileName)}.xls`); }
function downloadBlob(content: string, type: string, name: string) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }
async function copyText(text: string) { try { await navigator.clipboard.writeText(text); } catch { const textarea = document.createElement("textarea"); textarea.value = text; textarea.style.position = "fixed"; textarea.style.opacity = "0"; document.body.appendChild(textarea); textarea.select(); document.execCommand("copy"); textarea.remove(); } }
function escapeHtml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function filePart(value: string) { return value.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "report-lineage"; }

async function requestJson<T>(apiOrigin: string, path: string, init?: RequestInit) {
  const adminKey = useAppStore.getState().adminKey.trim();
  const response = await fetch(`${apiOrigin}${path}`, { credentials: "include", ...init, headers: { "Content-Type": "application/json", ...(adminKey ? { "X-Lineage-Admin-Key": adminKey } : {}), ...init?.headers } });
  const body = await readJsonResponse(response);
  if (!response.ok) throw new Error(readError(body, response.status));
  return body as T;
}
function readError(body: unknown, status: number) { if (typeof body === "object" && body !== null && "detail" in body && typeof (body as Record<string, unknown>).detail === "string") return String((body as Record<string, unknown>).detail); return `Request failed with status ${status}.`; }
