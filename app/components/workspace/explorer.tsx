import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type ICellRendererParams,
} from "ag-grid-community";
import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  AlertCircle,
  BookOpenCheck,
  Boxes,
  CheckCircle2,
  ClipboardCopy,
  CircleAlert,
  Copy,
  Database,
  Download,
  FileBarChart2,
  FileSpreadsheet,
  Files,
  Layers3,
  Loader2,
  Network,
  ShieldCheck,
  TableProperties,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { readJsonResponse } from "~/lib/api-catalog";
import { cn } from "~/lib/utils";
import { useAppStore } from "~/stores/app-store";

ModuleRegistry.registerModules([AllCommunityModule]);

const explorerTheme = themeQuartz.withParams({
  accentColor: "#0f766e",
  backgroundColor: "#ffffff",
  borderColor: "#e4e4e7",
  foregroundColor: "#18181b",
  headerBackgroundColor: "#fafafa",
  headerTextColor: "#52525b",
  rowHoverColor: "#f4f4f5",
  wrapperBorder: false,
});

const heavyQueryOptions = {
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  retry: false,
};

type ExplorerTab = "assets" | "report-detail" | "report-semantic" | "semantic-objects" | "column-mapping";
type ExportValue = string | number | boolean | null | undefined;
type ExplorerGridRow = { id: string; [key: string]: ExportValue };
type ExportContext = Record<string, string>;

type Workspace = {
  id: string;
  name: string;
  is_read_only?: boolean;
  is_on_dedicated_capacity?: boolean;
};

type Report = {
  id: string;
  name: string;
  dataset_id?: string | null;
  description?: string | null;
  report_type?: string | null;
  format?: string | null;
  is_owned_by_me?: boolean | null;
};

type SemanticModel = {
  id: string;
  name: string;
  description?: string | null;
  is_refreshable?: boolean | null;
  is_on_prem_gateway_required?: boolean | null;
  target_storage_mode?: string | null;
};

type ReportPage = { name: string; display_name: string; order: number };

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

type DaxReference = {
  object_type: string;
  table_name?: string | null;
  object_name: string;
  qualified_name: string;
};

type DaxAnalysis = {
  objects: DaxReference[];
  dependencies: Array<{ source: DaxReference; target: DaxReference; reference_text: string }>;
  warnings: Array<{ code: string; message: string; object_name?: string | null }>;
  object_count: number;
  dependency_count: number;
};

type PhysicalSourceResult = {
  sources: Array<{
    source_id: string;
    kind: string;
    provider: string;
    database?: string | null;
    schema_name?: string | null;
    object_name?: string | null;
    server?: string | null;
  }>;
  mappings: Array<{ semantic_table: string; partition_name: string; source_ids: string[] }>;
  warnings: Array<{ message: string }>;
};

type WorkspaceResponse = { workspaces: Workspace[] };
type ReportsResponse = { reports: Report[] };
type SemanticModelsResponse = { semantic_models: SemanticModel[] };
type ReportPagesResponse = { pages: ReportPage[] };

const tabs: Array<{ id: ExplorerTab; label: string; shortLabel: string }> = [
  { id: "assets", label: "1. Reports, dashboards, apps, and access", shortLabel: "Assets & access" },
  { id: "report-detail", label: "2. Report and source details", shortLabel: "Report detail" },
  { id: "report-semantic", label: "3. Report-specific semantic lineage", shortLabel: "Report semantic" },
  { id: "semantic-objects", label: "4. Semantic model objects", shortLabel: "Semantic objects" },
  { id: "column-mapping", label: "5. Database column to semantic mapping", shortLabel: "Column mapping" },
];

export function Explorer() {
  const apiOrigin = useAppStore((state) => state.apiOrigin);
  const [activeTab, setActiveTab] = useState<ExplorerTab>("assets");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [selectedReportId, setSelectedReportId] = useState("");
  const [selectedSemanticModelId, setSelectedSemanticModelId] = useState("");

  const workspacesQuery = useQuery({
    queryKey: ["explorer", "workspaces", apiOrigin],
    queryFn: () => requestJson<WorkspaceResponse>(apiOrigin, "/api/v1/workspaces?top=100&skip=0"),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const workspaces = workspacesQuery.data?.workspaces ?? [];
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;

  useEffect(() => {
    if (workspaces.length && !workspaces.some((workspace) => workspace.id === selectedWorkspaceId)) {
      setSelectedWorkspaceId(workspaces[0].id);
    }
  }, [selectedWorkspaceId, workspaces]);

  const reportsQuery = useQuery({
    queryKey: ["explorer", "reports", apiOrigin, selectedWorkspaceId],
    queryFn: () => requestJson<ReportsResponse>(apiOrigin, `/api/v1/workspaces/${selectedWorkspaceId}/reports`),
    enabled: Boolean(selectedWorkspaceId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const semanticModelsQuery = useQuery({
    queryKey: ["explorer", "semantic-models", apiOrigin, selectedWorkspaceId],
    queryFn: () => requestJson<SemanticModelsResponse>(apiOrigin, `/api/v1/workspaces/${selectedWorkspaceId}/semantic-models`),
    enabled: Boolean(selectedWorkspaceId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const reports = reportsQuery.data?.reports ?? [];
  const semanticModels = semanticModelsQuery.data?.semantic_models ?? [];

  useEffect(() => {
    if (reports.length && !reports.some((report) => report.id === selectedReportId)) {
      setSelectedReportId(reports[0].id);
    }
  }, [reports, selectedReportId]);
  useEffect(() => {
    if (semanticModels.length && !semanticModels.some((model) => model.id === selectedSemanticModelId)) {
      setSelectedSemanticModelId(semanticModels[0].id);
    }
  }, [selectedSemanticModelId, semanticModels]);

  const selectedReport = reports.find((report) => report.id === selectedReportId) ?? null;
  const reportSemanticModel = selectedReport?.dataset_id
    ? semanticModels.find((model) => model.id === selectedReport.dataset_id) ?? null
    : null;
  const selectedSemanticModel = semanticModels.find((model) => model.id === selectedSemanticModelId) ?? null;

  useEffect(() => {
    if (selectedReportId && reportSemanticModel) {
      setSelectedSemanticModelId(reportSemanticModel.id);
    }
  }, [selectedReportId, reportSemanticModel]);

  const reportDetailQuery = useQuery({
    queryKey: ["explorer", "report", apiOrigin, selectedWorkspaceId, selectedReportId],
    queryFn: () => requestJson<Report>(apiOrigin, `/api/v1/workspaces/${selectedWorkspaceId}/reports/${selectedReportId}`),
    enabled: Boolean(selectedWorkspaceId && selectedReportId),
    ...heavyQueryOptions,
  });
  const reportPagesQuery = useQuery({
    queryKey: ["explorer", "report-pages", apiOrigin, selectedWorkspaceId, selectedReportId],
    queryFn: () => requestJson<ReportPagesResponse>(apiOrigin, `/api/v1/workspaces/${selectedWorkspaceId}/reports/${selectedReportId}/pages`),
    enabled: Boolean(selectedWorkspaceId && selectedReportId),
    ...heavyQueryOptions,
  });
  const normalizedReportQuery = useQuery({
    queryKey: ["explorer", "normalized-report", apiOrigin, selectedWorkspaceId, selectedReportId],
    queryFn: () => requestJson<NormalizedReport>(apiOrigin, `/api/v1/workspaces/${selectedWorkspaceId}/reports/${selectedReportId}/definition/normalized?format=PBIR`, { method: "POST" }),
    enabled: Boolean(selectedWorkspaceId && selectedReportId),
    ...heavyQueryOptions,
  });
  const reportSemanticLineageQuery = useQuery({
    queryKey: ["explorer", "report-semantic-lineage", apiOrigin, selectedWorkspaceId, selectedReportId, reportSemanticModel?.id],
    queryFn: () => {
      const query = new URLSearchParams({ semantic_model_id: reportSemanticModel!.id, semantic_model_workspace_id: selectedWorkspaceId });
      return requestJson<ReportSemanticLineage>(apiOrigin, `/api/v1/workspaces/${selectedWorkspaceId}/reports/${selectedReportId}/semantic-lineage?${query.toString()}`, { method: "POST" });
    },
    enabled: Boolean(selectedWorkspaceId && selectedReportId && reportSemanticModel?.id),
    ...heavyQueryOptions,
  });
  const parsedSemanticModelQuery = useQuery({
    queryKey: ["explorer", "parsed-semantic-model", apiOrigin, selectedWorkspaceId, selectedSemanticModelId],
    queryFn: () => requestJson<ParsedSemanticModel>(apiOrigin, `/api/v1/workspaces/${selectedWorkspaceId}/semantic-models/${selectedSemanticModelId}/definition/parsed?format=TMDL`, { method: "POST" }),
    enabled: Boolean(selectedWorkspaceId && selectedSemanticModelId),
    ...heavyQueryOptions,
  });
  const daxQuery = useQuery({
    queryKey: ["explorer", "dax-analysis", apiOrigin, selectedWorkspaceId, selectedSemanticModelId, parsedSemanticModelQuery.dataUpdatedAt],
    queryFn: () => requestJson<DaxAnalysis>(apiOrigin, "/api/v1/lineage/dax/analyze", { method: "POST", body: JSON.stringify(parsedSemanticModelQuery.data) }),
    enabled: Boolean(parsedSemanticModelQuery.data),
    ...heavyQueryOptions,
  });
  const semanticMetadataQuery = useQuery({
    queryKey: ["explorer", "semantic-metadata", apiOrigin, selectedWorkspaceId, selectedSemanticModelId],
    queryFn: () => requestJson<{ reconciliation: { matched_count: number; definition_only_count: number; xmla_only_count: number } }>(apiOrigin, `/api/v1/workspaces/${selectedWorkspaceId}/semantic-models/${selectedSemanticModelId}/metadata?format=TMDL`),
    enabled: Boolean(selectedWorkspaceId && selectedSemanticModelId && activeTab === "semantic-objects"),
    ...heavyQueryOptions,
  });
  const physicalSourceQuery = useQuery({
    queryKey: ["explorer", "physical-sources", apiOrigin, selectedWorkspaceId, selectedSemanticModelId],
    queryFn: () => requestJson<PhysicalSourceResult>(apiOrigin, "/api/v1/lineage/physical-sources/analyze", { method: "POST", body: JSON.stringify({ semantic_model: parsedSemanticModelQuery.data, gateway_datasources: [] }) }),
    enabled: Boolean(parsedSemanticModelQuery.data && activeTab === "column-mapping"),
    ...heavyQueryOptions,
  });

  const backgroundPreparing = Boolean(
    selectedReport && (
      reportDetailQuery.isFetching || reportPagesQuery.isFetching || normalizedReportQuery.isFetching || reportSemanticLineageQuery.isFetching || parsedSemanticModelQuery.isFetching || daxQuery.isFetching
    ),
  );

  if (workspacesQuery.isLoading) return <ExplorerLoading label="Loading Power BI workspaces" />;
  if (workspacesQuery.isError) return <ExplorerUnavailable error={workspacesQuery.error} />;
  if (!workspaces.length) return <ExplorerEmpty title="No Power BI workspaces found" text="The authenticated account did not return any workspaces to explore." />;

  return (
    <section className="border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-5 py-5 sm:px-6">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-[8px] bg-teal-700 text-white"><Network className="size-5" /></span>
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase text-teal-700">Power BI estate</span><Badge className="rounded-[8px] border border-teal-200 bg-teal-50 text-teal-800">Name-based explorer</Badge></div>
              <h1 className="text-lg font-semibold">Explorer</h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500">Choose a workspace and report by name, then follow the tabs to understand report pages, model objects, and source-column evidence.</p>
            </div>
          </div>
          <NameSelector id="explorer-workspace" label="Workspace" items={workspaces} selectedId={selectedWorkspaceId} onChange={setSelectedWorkspaceId} />
        </div>
        {backgroundPreparing && <BackgroundPreparation reportName={selectedReport?.name ?? "selected report"} />}
        <div className="mt-5 grid grid-cols-3 divide-x divide-zinc-200 border-y border-zinc-200 sm:max-w-xl">
          <ExplorerMetric label="Reports" value={reports.length} icon={<FileBarChart2 className="size-4" />} />
          <ExplorerMetric label="Semantic models" value={semanticModels.length} icon={<Layers3 className="size-4" />} />
          <ExplorerMetric label="Workspace" value={selectedWorkspace?.is_read_only ? "Read-only" : "Editable"} icon={<ShieldCheck className="size-4" />} />
        </div>
      </div>

      <ExplorerGuidance />
      <div className="overflow-x-auto border-b border-zinc-200 bg-[#fafbfc]">
        <div className="flex min-w-max px-4 sm:px-6" role="tablist" aria-label="Explorer detail levels">
          {tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} className={cn("border-b-2 px-4 py-3 text-left text-sm transition", activeTab === tab.id ? "border-teal-700 font-semibold text-teal-800" : "border-transparent text-zinc-500 hover:text-zinc-950")} title={tab.label}>{tab.shortLabel}</button>)}
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {activeTab === "assets" && <AssetsAccessTab workspace={selectedWorkspace} reports={reports} semanticModels={semanticModels} isLoading={reportsQuery.isLoading || semanticModelsQuery.isLoading} error={reportsQuery.error ?? semanticModelsQuery.error} onReportSelect={(reportId) => { setSelectedReportId(reportId); setActiveTab("report-detail"); }} onSemanticModelSelect={(modelId) => { setSelectedSemanticModelId(modelId); setActiveTab("semantic-objects"); }} />}
        {activeTab === "report-detail" && <ReportDetailTab workspace={selectedWorkspace} reports={reports} selectedReport={selectedReport} reportSemanticModel={reportSemanticModel} onReportChange={setSelectedReportId} detailQuery={reportDetailQuery} pagesQuery={reportPagesQuery} />}
        {activeTab === "report-semantic" && <ReportSemanticTab workspace={selectedWorkspace} reports={reports} selectedReport={selectedReport} reportSemanticModel={reportSemanticModel} onReportChange={setSelectedReportId} normalizedQuery={normalizedReportQuery} lineageQuery={reportSemanticLineageQuery} parsed={parsedSemanticModelQuery.data} daxQuery={daxQuery} />}
        {activeTab === "semantic-objects" && <SemanticObjectsTab workspace={selectedWorkspace} selectedReport={selectedReport} semanticModels={semanticModels} selectedSemanticModel={selectedSemanticModel} onSemanticModelChange={setSelectedSemanticModelId} parsedQuery={parsedSemanticModelQuery} daxQuery={daxQuery} metadataQuery={semanticMetadataQuery} />}
        {activeTab === "column-mapping" && <ColumnMappingTab workspace={selectedWorkspace} selectedReport={selectedReport} semanticModels={semanticModels} selectedSemanticModel={selectedSemanticModel} onSemanticModelChange={setSelectedSemanticModelId} parsedQuery={parsedSemanticModelQuery} daxQuery={daxQuery} physicalSourceQuery={physicalSourceQuery} />}
      </div>
    </section>
  );
}

function ExplorerGuidance() {
  return <div className="grid border-b border-zinc-200 bg-zinc-50 md:grid-cols-3"><GuidanceStep number="1" title="Choose the business name" text="Start with the workspace and report people recognize." /><GuidanceStep number="2" title="Follow the report" text="Check its pages, visuals, and linked model." /><GuidanceStep number="3" title="Trace the evidence" text="Use the model and mapping tabs to find source fields and DAX usage." /></div>;
}

function GuidanceStep({ number, title, text }: { number: string; title: string; text: string }) {
  return <div className="flex gap-3 border-b border-zinc-200 px-5 py-4 last:border-b-0 md:border-b-0 md:border-r md:px-6 md:last:border-r-0"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-teal-700 text-xs font-semibold text-white">{number}</span><div><p className="text-sm font-semibold">{title}</p><p className="mt-0.5 text-xs leading-5 text-zinc-500">{text}</p></div></div>;
}

function BackgroundPreparation({ reportName }: { reportName: string }) {
  return <div className="mt-4 flex items-start gap-2 border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-950"><Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin" /><span>Preparing report, semantic, and DAX details for <strong>{reportName}</strong> in the background. You can keep exploring while this completes.</span></div>;
}

function AssetsAccessTab({ workspace, reports, semanticModels, isLoading, error, onReportSelect, onSemanticModelSelect }: {
  workspace: Workspace | null;
  reports: Report[];
  semanticModels: SemanticModel[];
  isLoading: boolean;
  error: Error | null;
  onReportSelect: (id: string) => void;
  onSemanticModelSelect: (id: string) => void;
}) {
  const modelNames = new Map(semanticModels.map((model) => [model.id, model.name]));
  const reportRows: ExplorerGridRow[] = reports.map((report) => ({ id: report.id, reportId: report.id, name: report.name, type: report.report_type ?? "Report", semanticModel: report.dataset_id ? modelNames.get(report.dataset_id) ?? "External or unresolved model" : "No model returned", format: report.format ?? "--", access: report.is_owned_by_me ? "You" : "Shared" }));
  const modelRows: ExplorerGridRow[] = semanticModels.map((model) => ({ id: model.id, semanticModelId: model.id, name: model.name, storage: model.target_storage_mode ?? "--", refresh: model.is_refreshable ? "Refreshable" : "Not reported", gateway: model.is_on_prem_gateway_required ? "Required" : "Not required" }));
  if (isLoading) return <ExplorerLoading label="Loading reports and semantic models" />;
  if (error) return <ExplorerError text="Report or semantic-model inventory is unavailable for this workspace." />;
  return <div className="space-y-8">
    <div><SectionHeading icon={<Files className="size-5" />} title="Reports" text="Select a report by name to inspect its pages, report structure, and semantic lineage." /><ExplorerGrid rowData={reportRows} columnDefs={[{ field: "name", headerName: "Report name", minWidth: 230, flex: 1.4 }, { field: "type", headerName: "Type", minWidth: 120 }, { field: "semanticModel", headerName: "Semantic model", minWidth: 220, flex: 1.2 }, { field: "format", headerName: "Format", minWidth: 120 }, { field: "access", headerName: "Access", minWidth: 110 }]} onRowClick={(row) => onReportSelect(row.id)} emptyMessage="No reports were returned for this workspace." exportFileName={`${filePart(workspace?.name)}-reports`} exportContext={makeExportContext(workspace)} /></div>
    <div><SectionHeading icon={<Layers3 className="size-5" />} title="Semantic models" text="These models resolve report field references and detailed object metadata." /><ExplorerGrid rowData={modelRows} columnDefs={[{ field: "name", headerName: "Model name", minWidth: 260, flex: 1.5 }, { field: "storage", headerName: "Storage mode", minWidth: 160 }, { field: "refresh", headerName: "Refresh", minWidth: 140 }, { field: "gateway", headerName: "Gateway", minWidth: 140 }]} onRowClick={(row) => onSemanticModelSelect(row.id)} emptyMessage="No semantic models were returned for this workspace." exportFileName={`${filePart(workspace?.name)}-semantic-models`} exportContext={makeExportContext(workspace)} /></div>
    <div className="grid border-y border-zinc-200 md:grid-cols-3"><AvailabilityNotice icon={<FileBarChart2 className="size-5" />} title="Dashboards" text="Dashboard inventory is not exposed by the current backend API." /><AvailabilityNotice icon={<Boxes className="size-5" />} title="Apps" text="Power BI app inventory is not exposed by the current backend API." /><AvailabilityNotice icon={<UsersRound className="size-5" />} title="Object access" text="Per-user and per-object access details are not exposed by the current backend API." /></div>
  </div>;
}

function ReportDetailTab({ workspace, reports, selectedReport, reportSemanticModel, onReportChange, detailQuery, pagesQuery }: {
  workspace: Workspace | null;
  reports: Report[];
  selectedReport: Report | null;
  reportSemanticModel: SemanticModel | null;
  onReportChange: (id: string) => void;
  detailQuery: UseQueryResult<Report, Error>;
  pagesQuery: UseQueryResult<ReportPagesResponse, Error>;
}) {
  const pages = pagesQuery.data?.pages ?? [];
  const pageRows: ExplorerGridRow[] = pages.map((page) => ({ id: page.name, pageName: page.name, displayName: page.display_name, order: page.order + 1 }));
  const context = makeExportContext(workspace, selectedReport, reportSemanticModel);
  return <div className="space-y-6">
    <ReportSelector reports={reports} selectedReport={selectedReport} onChange={onReportChange} />
    <SectionHeading icon={<FileBarChart2 className="size-5" />} title="Report detail" text="Each report is read individually so page information is ready before semantic and source evidence is reviewed." />
    {detailQuery.isLoading || pagesQuery.isLoading ? <ExplorerLoading label="Loading selected report and pages" /> : null}
    {detailQuery.isError || pagesQuery.isError ? <ExplorerError text="Selected report details are unavailable for this workspace." /> : null}
    {detailQuery.data && <div className="grid border-y border-zinc-200 md:grid-cols-4"><DetailItem label="Report type" value={detailQuery.data.report_type ?? "Not reported"} /><DetailItem label="Format" value={detailQuery.data.format ?? "Not reported"} /><DetailItem label="Linked model" value={reportSemanticModel?.name ?? "Not reported"} /><DetailItem label="Pages" value={String(pages.length)} /></div>}
    {!pagesQuery.isLoading && !pagesQuery.isError && <ExplorerGrid rowData={pageRows} columnDefs={[{ field: "order", headerName: "Order", minWidth: 100 }, { field: "displayName", headerName: "Page name", minWidth: 280, flex: 1 }]} emptyMessage="No report pages were returned." exportFileName={`${filePart(selectedReport?.name)}-pages`} exportContext={context} />}
  </div>;
}

function ReportSemanticTab({ workspace, reports, selectedReport, reportSemanticModel, onReportChange, normalizedQuery, lineageQuery, parsed, daxQuery }: {
  workspace: Workspace | null;
  reports: Report[];
  selectedReport: Report | null;
  reportSemanticModel: SemanticModel | null;
  onReportChange: (id: string) => void;
  normalizedQuery: UseQueryResult<NormalizedReport, Error>;
  lineageQuery: UseQueryResult<ReportSemanticLineage, Error>;
  parsed: ParsedSemanticModel | undefined;
  daxQuery: UseQueryResult<DaxAnalysis, Error>;
}) {
  const expressionIndex = useMemo(() => buildExpressionIndex(parsed), [parsed]);
  const fieldRows: ExplorerGridRow[] = (lineageQuery.data?.field_matches ?? []).map((match, index) => {
    const object = match.semantic_object;
    return { id: `${match.page_display_name}-${match.visual_title ?? index}-${index}`, page: match.page_display_name, visual: match.visual_title ?? match.visual_type ?? "Untitled visual", semanticTable: object?.table_name ?? "Unresolved", semanticObject: object?.object_name ?? "Unresolved", type: object?.object_type ?? "--", daxExpression: object ? expressionIndex.get(objectKey(object.table_name, object.object_name)) ?? "No DAX expression declared" : "No semantic object resolved", status: match.status, confidence: `${Math.round(match.match_confidence * 100)}%` };
  });
  return <div className="space-y-6">
    <ReportSelector reports={reports} selectedReport={selectedReport} onChange={onReportChange} />
    <SectionHeading icon={<BookOpenCheck className="size-5" />} title="Report-specific semantic lineage" text="This matches fields used in a report's visuals to the linked semantic model, including the DAX expression when that object is calculated." />
    {!reportSemanticModel && <ExplorerError text="This report does not resolve to a semantic model in the selected workspace. Composite reports can use a model in another workspace, which needs to be selected separately." />}
    {reportSemanticModel && <div className="border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">Linked semantic model: <strong>{reportSemanticModel.name}</strong></div>}
    {normalizedQuery.isLoading || lineageQuery.isLoading ? <ExplorerLoading label="Reading report definition and semantic field matches" /> : null}
    {normalizedQuery.isError || lineageQuery.isError ? <ExplorerError text="Report semantic lineage needs both Power BI and Fabric permissions for the selected report and model." /> : null}
    {normalizedQuery.data && <div className="grid border-y border-zinc-200 sm:grid-cols-3"><DetailItem label="Pages" value={String(normalizedQuery.data.page_count)} /><DetailItem label="Visuals" value={String(normalizedQuery.data.visual_count)} /><DetailItem label="Definition parts" value={String(normalizedQuery.data.source_part_count)} /></div>}
    {daxQuery.isLoading && <ExplorerLoading label="Preparing DAX expressions for the linked semantic model" compact />}
    {daxQuery.isError && <DaxUnavailable />}
    {lineageQuery.data && <><div className="grid border-y border-zinc-200 sm:grid-cols-3"><DetailItem label="Field references" value={String(lineageQuery.data.total_field_reference_count)} /><DetailItem label="Matched" value={String(lineageQuery.data.matched_field_reference_count)} /><DetailItem label="Needs review" value={String(lineageQuery.data.unmatched_field_reference_count)} /></div><ExplorerGrid rowData={fieldRows} columnDefs={[{ field: "page", headerName: "Report page", minWidth: 180 }, { field: "visual", headerName: "Visual", minWidth: 190, flex: 1 }, { field: "semanticTable", headerName: "Semantic table", minWidth: 180 }, { field: "semanticObject", headerName: "Semantic object", minWidth: 180 }, { field: "type", headerName: "Type", minWidth: 120 }, daxColumn(), { field: "status", headerName: "Status", minWidth: 110 }, { field: "confidence", headerName: "Confidence", minWidth: 110 }]} emptyMessage="No visual field references were returned." exportFileName={`${filePart(selectedReport?.name)}-report-semantic`} exportContext={makeExportContext(workspace, selectedReport, reportSemanticModel)} /></>}
  </div>;
}

function SemanticObjectsTab({ workspace, selectedReport, semanticModels, selectedSemanticModel, onSemanticModelChange, parsedQuery, daxQuery, metadataQuery }: {
  workspace: Workspace | null;
  selectedReport: Report | null;
  semanticModels: SemanticModel[];
  selectedSemanticModel: SemanticModel | null;
  onSemanticModelChange: (id: string) => void;
  parsedQuery: UseQueryResult<ParsedSemanticModel, Error>;
  daxQuery: UseQueryResult<DaxAnalysis, Error>;
  metadataQuery: UseQueryResult<{ reconciliation: { matched_count: number; definition_only_count: number; xmla_only_count: number } }, Error>;
}) {
  const rows = semanticObjectRows(parsedQuery.data);
  return <div className="space-y-6">
    <SemanticModelSelector semanticModels={semanticModels} selectedSemanticModel={selectedSemanticModel} onChange={onSemanticModelChange} />
    <SectionHeading icon={<TableProperties className="size-5" />} title="Semantic model objects" text="Tables, columns, measures, hierarchies, and their DAX expressions are read from the parsed semantic model definition." />
    {parsedQuery.isLoading ? <ExplorerLoading label="Loading semantic model definition" /> : null}
    {parsedQuery.isError ? <ExplorerError text="Semantic definition retrieval requires Fabric access for the selected model." /> : null}
    {daxQuery.isLoading && parsedQuery.data ? <ExplorerLoading label="Preparing DAX dependency information" compact /> : null}
    {daxQuery.isError && parsedQuery.data ? <DaxUnavailable /> : null}
    {parsedQuery.data && <><div className="grid border-y border-zinc-200 sm:grid-cols-4"><DetailItem label="Tables" value={String(parsedQuery.data.tables.length)} /><DetailItem label="Columns" value={String(rows.filter((row) => row.kind === "Column").length)} /><DetailItem label="Measures" value={String(rows.filter((row) => row.kind === "Measure").length)} /><DetailItem label="Relationships" value={String(parsedQuery.data.relationships.length)} /></div><ExplorerGrid rowData={rows} columnDefs={[{ field: "table", headerName: "Table", minWidth: 190 }, { field: "name", headerName: "Object name", minWidth: 220, flex: 1 }, { field: "kind", headerName: "Object type", minWidth: 130 }, { field: "dataType", headerName: "Data type", minWidth: 130 }, { field: "sourceColumn", headerName: "Source column", minWidth: 170 }, daxColumn(), { field: "visibility", headerName: "Visibility", minWidth: 110 }]} emptyMessage="No semantic objects were returned." exportFileName={`${filePart(selectedSemanticModel?.name)}-semantic-objects`} exportContext={makeExportContext(workspace, selectedReport, selectedSemanticModel)} /><MetadataSummary query={metadataQuery} /></>}
  </div>;
}

function ColumnMappingTab({ workspace, selectedReport, semanticModels, selectedSemanticModel, onSemanticModelChange, parsedQuery, daxQuery, physicalSourceQuery }: {
  workspace: Workspace | null;
  selectedReport: Report | null;
  semanticModels: SemanticModel[];
  selectedSemanticModel: SemanticModel | null;
  onSemanticModelChange: (id: string) => void;
  parsedQuery: UseQueryResult<ParsedSemanticModel, Error>;
  daxQuery: UseQueryResult<DaxAnalysis, Error>;
  physicalSourceQuery: UseQueryResult<PhysicalSourceResult, Error>;
}) {
  const [selectedTableName, setSelectedTableName] = useState("");
  const [selectedColumnName, setSelectedColumnName] = useState("");
  const [selectedMeasureName, setSelectedMeasureName] = useState("");
  const [columnDepth, setColumnDepth] = useState(2);
  const [measureDepth, setMeasureDepth] = useState(2);
  const tables = parsedQuery.data?.tables ?? [];

  useEffect(() => {
    if (tables.length && !tables.some((table) => table.name === selectedTableName)) {
      setSelectedTableName(tables[0].name);
    }
  }, [selectedTableName, tables]);

  const selectedTable = tables.find((table) => table.name === selectedTableName) ?? null;

  useEffect(() => {
    if (selectedTable?.columns.length && !selectedTable.columns.some((column) => column.name === selectedColumnName)) {
      setSelectedColumnName(selectedTable.columns[0].name);
    }
  }, [selectedColumnName, selectedTable]);

  const selectedColumn = selectedTable?.columns.find((column) => column.name === selectedColumnName) ?? null;

  useEffect(() => {
    if (selectedTable?.measures.length && !selectedTable.measures.some((measure) => measure.name === selectedMeasureName)) {
      setSelectedMeasureName(selectedTable.measures[0].name);
    }
  }, [selectedMeasureName, selectedTable]);

  const selectedMeasure = selectedTable?.measures.find((measure) => measure.name === selectedMeasureName) ?? null;
  const mappingRows = databaseColumnRows(parsedQuery.data, daxQuery.data).filter((row) => !selectedTableName || row.semanticTable === selectedTableName);
  const sourceRows: ExplorerGridRow[] = (physicalSourceQuery.data?.sources ?? []).map((source) => ({ id: source.source_id, sourceId: source.source_id, provider: source.provider, location: [source.server, source.database, source.schema_name, source.object_name].filter(Boolean).join(".") || "Not reported", kind: source.kind }));
  const context = makeExportContext(workspace, selectedReport, selectedSemanticModel);
  return <div className="space-y-6">
    <SemanticModelSelector semanticModels={semanticModels} selectedSemanticModel={selectedSemanticModel} onChange={onSemanticModelChange} />
    <SectionHeading icon={<Database className="size-5" />} title="Database column to semantic object mapping" text="For each source column, this shows the semantic column and the DAX measures or calculations that directly use it." />
    {parsedQuery.isLoading ? <ExplorerLoading label="Loading semantic source evidence" /> : null}
    {parsedQuery.isError ? <ExplorerError text="Semantic definition retrieval is unavailable for the selected model." /> : null}
    {daxQuery.isLoading && parsedQuery.data ? <ExplorerLoading label="Finding DAX expressions that use each column" compact /> : null}
    {daxQuery.isError && parsedQuery.data ? <DaxUnavailable /> : null}
    {parsedQuery.data && <><div className="grid gap-4 border-y border-zinc-200 py-4 md:grid-cols-3"><LineageSelect id="lineage-table" label="Semantic table" value={selectedTableName} options={tables.map((table) => table.name)} onChange={setSelectedTableName} /><LineageSelect id="lineage-column" label="Column" value={selectedColumnName} options={selectedTable?.columns.map((column) => column.name) ?? []} onChange={setSelectedColumnName} /><DepthSelector id="column-lineage-depth" value={columnDepth} onChange={setColumnDepth} /></div>{selectedTable && selectedColumn && <ColumnLineageDiagram parsed={parsedQuery.data} table={selectedTable} column={selectedColumn} dax={daxQuery.data} depth={columnDepth} />}{selectedTable && <div className="space-y-4 border-t border-zinc-200 pt-6"><SectionHeading icon={<TableProperties className="size-5" />} title="Measure-level lineage" text="Select the target measure to see the columns and measures used to calculate it, followed by measures that depend on it." /><div className="grid gap-4 md:grid-cols-2"><LineageSelect id="lineage-measure" label="Target measure" value={selectedMeasureName} options={selectedTable.measures.map((measure) => measure.name)} onChange={setSelectedMeasureName} /><DepthSelector id="measure-lineage-depth" value={measureDepth} onChange={setMeasureDepth} /></div>{selectedMeasure ? <MeasureLineageDiagram parsed={parsedQuery.data} table={selectedTable} measure={selectedMeasure} dax={daxQuery.data} depth={measureDepth} /> : <div className="border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">No measures were returned for the selected semantic table.</div>}</div>}<ExplorerGrid rowData={mappingRows} columnDefs={[{ field: "sourceColumn", headerName: "Database column", minWidth: 230, flex: 1 }, { field: "semanticTable", headerName: "Semantic table", minWidth: 190 }, { field: "semanticColumn", headerName: "Semantic column", minWidth: 190 }, { field: "dataType", headerName: "Data type", minWidth: 130 }, { field: "daxUsedBy", headerName: "Used by DAX", minWidth: 220 }, daxColumn("daxExpressions", "DAX expression using column"), { field: "evidence", headerName: "Definition evidence", minWidth: 240, flex: 1 }]} emptyMessage="No source-column mappings were found in the semantic definition." exportFileName={`${filePart(selectedSemanticModel?.name)}-${filePart(selectedTableName)}-column-mapping`} exportContext={context} /></>}
    {physicalSourceQuery.isLoading ? <ExplorerLoading label="Analyzing physical source evidence" compact /> : null}
    {physicalSourceQuery.data && <div><SectionHeading icon={<Database className="size-5" />} title="Detected physical sources" text="Physical provider, database, and object details discovered from semantic partitions." /><ExplorerGrid rowData={sourceRows} columnDefs={[{ field: "provider", headerName: "Provider", minWidth: 180 }, { field: "location", headerName: "Database object", minWidth: 300, flex: 1 }, { field: "kind", headerName: "Kind", minWidth: 140 }]} emptyMessage="No physical sources were detected." exportFileName={`${filePart(selectedSemanticModel?.name)}-physical-sources`} exportContext={context} /></div>}
    {physicalSourceQuery.isError && parsedQuery.data && <div className="border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">Physical-source analysis is not enabled for this session. The source-column and DAX evidence above is still available.</div>}
  </div>;
}

function LineageSelect({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <div className="space-y-1.5"><label className="text-xs font-semibold text-zinc-600" htmlFor={id}>{label}</label><select id={id} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"><option value="" disabled>Select a {label.toLowerCase()}</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></div>;
}

function DepthSelector({ id, value, onChange }: { id: string; value: number; onChange: (value: number) => void }) {
  return <div className="space-y-1.5"><label className="text-xs font-semibold text-zinc-600" htmlFor={id}>Lineage depth</label><select id={id} value={value} onChange={(event) => onChange(Number(event.target.value))} className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100">{[1, 2, 3, 4, 5, 6].map((depth) => <option key={depth} value={depth}>{depth} {depth === 1 ? "level" : "levels"}</option>)}</select></div>;
}

function ColumnLineageDiagram({ parsed, table, column, dax, depth }: { parsed: ParsedSemanticModel; table: ParsedTable; column: ParsedColumn; dax: DaxAnalysis | undefined; depth: number }) {
  const graph = useMemo(() => buildColumnLineage(parsed, table, column, dax, depth), [column, dax, depth, parsed, table]);
  return <LineageCanvas title="Column-level lineage" description={`${table.name}[${column.name}] from source evidence through DAX calculations.`} graph={graph} emptyText="No column lineage could be prepared for the selected field." />;
}

function MeasureLineageDiagram({ parsed, table, measure, dax, depth }: { parsed: ParsedSemanticModel; table: ParsedTable; measure: ParsedTable["measures"][number]; dax: DaxAnalysis | undefined; depth: number }) {
  const graph = useMemo(() => buildMeasureLineage(parsed, table, measure, dax, depth), [dax, depth, measure, parsed, table]);
  return <LineageCanvas title="Measure-level lineage" description={`${table.name}[${measure.name}] is the target measure. Its calculation inputs and dependent measures are shown to the selected depth.`} graph={graph} emptyText="No measure lineage could be prepared for the selected measure." />;
}

type LineageGraph = { nodes: Node[]; edges: Edge[] };

function LineageCanvas({ title, description, graph, emptyText }: { title: string; description: string; graph: LineageGraph; emptyText: string }) {
  return <div className="border border-zinc-200 bg-white"><div className="border-b border-zinc-200 px-4 py-3"><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p></div><div className="h-[520px] min-h-[420px]">{graph.nodes.length ? <ReactFlow nodes={graph.nodes} edges={graph.edges} fitView fitViewOptions={{ padding: 0.2 }} nodesDraggable={false} nodesConnectable={false} elementsSelectable zoomOnDoubleClick={false} defaultEdgeOptions={{ type: "smoothstep" }}><Background gap={18} size={1} /><Controls showInteractive={false} /></ReactFlow> : <div className="flex h-full items-center justify-center p-6 text-sm text-zinc-500">{emptyText}</div>}</div></div>;
}

function buildColumnLineage(parsed: ParsedSemanticModel, table: ParsedTable, column: ParsedColumn, dax: DaxAnalysis | undefined, depth: number): LineageGraph {
  const dependencies = dax?.dependencies ?? [];
  const expressionIndex = buildExpressionIndex(parsed);
  const rootKey = objectKey(table.name, column.name);
  const rootId = `semantic-${lineageId(rootKey)}`;
  const sourceId = `source-${lineageId(rootKey)}`;
  const sourceLabel = [
    column.source_column ? `Column: ${column.source_column}` : null,
    column.source_path ? `Path: ${column.source_path}` : null,
  ].filter(Boolean).join(" | ") || "Source column not declared";
  const nodes: Node[] = [
    lineageNode(sourceId, "Source evidence", sourceLabel, { x: 410, y: 0 }, "source"),
    lineageNode(rootId, `${table.name}[${column.name}]`, column.expression ?? "Semantic column", { x: 410, y: 150 }, "semantic"),
  ];
  const edges: Edge[] = [lineageEdge(`${sourceId}-${rootId}`, sourceId, rootId, "maps to")];
  const nodeIds = new Map<string, string>([[rootKey, rootId]]);
  let currentKeys = [rootKey];
  let edgeIndex = 0;

  for (let level = 1; level <= depth && currentKeys.length; level += 1) {
    const next = new Map<string, DaxReference>();
    const pendingEdges: Array<{ sourceKey: string; target: DaxReference; reference: string }> = [];
    currentKeys.forEach((currentKey) => {
      dependencies.filter((edge) => objectKey(edge.source.table_name, edge.source.object_name) === currentKey).forEach((edge) => {
        const targetKey = objectKey(edge.target.table_name, edge.target.object_name);
        next.set(targetKey, edge.target);
        pendingEdges.push({ sourceKey: currentKey, target: edge.target, reference: edge.reference_text });
      });
    });

    const positions = lineageLayerPositions([...next.keys()], 150 + level * 170);
    next.forEach((reference, key) => {
      if (!nodeIds.has(key)) {
        const nodeId = `dax-${lineageId(key)}`;
        nodeIds.set(key, nodeId);
        nodes.push(lineageNode(nodeId, reference.qualified_name, expressionIndex.get(key) ?? `DAX ${reference.object_type}`, positions.get(key) ?? { x: 410, y: 150 + level * 170 }, "dax"));
      }
    });
    pendingEdges.forEach(({ sourceKey, target, reference }) => {
      const targetKey = objectKey(target.table_name, target.object_name);
      const sourceNodeId = nodeIds.get(sourceKey);
      const targetNodeId = nodeIds.get(targetKey);
      if (sourceNodeId && targetNodeId) edges.push(lineageEdge(`column-edge-${edgeIndex++}`, sourceNodeId, targetNodeId, reference));
    });
    currentKeys = [...next.keys()];
  }

  return { nodes, edges };
}

function buildMeasureLineage(parsed: ParsedSemanticModel, table: ParsedTable, measure: ParsedTable["measures"][number], dax: DaxAnalysis | undefined, depth: number): LineageGraph {
  const dependencies = dax?.dependencies ?? [];
  const expressionIndex = buildExpressionIndex(parsed);
  const rootKey = objectKey(table.name, measure.name);
  const rootId = `measure-${lineageId(rootKey)}`;
  const nodes: Node[] = [lineageNode(rootId, `${table.name}[${measure.name}]`, measure.expression ?? "Target measure", { x: 410, y: 0 }, "measure")];
  const edges: Edge[] = [];
  const nodeIds = new Map<string, string>([[rootKey, rootId]]);
  let edgeIndex = 0;

  let upstreamCurrent = [rootKey];
  let upstreamLevels = 0;
  for (let level = 1; level <= depth && upstreamCurrent.length; level += 1) {
    const next = new Map<string, DaxReference>();
    const pendingEdges: Array<{ source: DaxReference; targetKey: string; reference: string }> = [];
    upstreamCurrent.forEach((currentKey) => {
      dependencies.filter((edge) => objectKey(edge.target.table_name, edge.target.object_name) === currentKey).forEach((edge) => {
        const sourceKey = objectKey(edge.source.table_name, edge.source.object_name);
        next.set(sourceKey, edge.source);
        pendingEdges.push({ source: edge.source, targetKey: currentKey, reference: edge.reference_text });
      });
    });
    if (!next.size) break;
    upstreamLevels = level;
    const positions = lineageLayerPositions([...next.keys()], 150 + (level - 1) * 170);
    next.forEach((reference, key) => {
      if (!nodeIds.has(key)) {
        const nodeId = `${lineageTone(reference) === "measure" ? "measure" : "semantic"}-${lineageId(key)}`;
        nodeIds.set(key, nodeId);
        nodes.push(lineageNode(nodeId, reference.qualified_name, expressionIndex.get(key) ?? `${reference.object_type} source`, positions.get(key) ?? { x: 410, y: 150 + (level - 1) * 170 }, lineageTone(reference)));
      }
    });
    pendingEdges.forEach(({ source, targetKey, reference }) => {
      const sourceNodeId = nodeIds.get(objectKey(source.table_name, source.object_name));
      const targetNodeId = nodeIds.get(targetKey);
      if (sourceNodeId && targetNodeId) edges.push(lineageEdge(`measure-source-${edgeIndex++}`, sourceNodeId, targetNodeId, reference));
    });
    upstreamCurrent = [...next.keys()];
  }

  let downstreamCurrent = [rootKey];
  const downstreamStart = 150 + Math.max(upstreamLevels, 1) * 170;
  for (let level = 1; level <= depth && downstreamCurrent.length; level += 1) {
    const next = new Map<string, DaxReference>();
    const pendingEdges: Array<{ sourceKey: string; target: DaxReference; reference: string }> = [];
    downstreamCurrent.forEach((currentKey) => {
      dependencies.filter((edge) => objectKey(edge.source.table_name, edge.source.object_name) === currentKey).forEach((edge) => {
        const targetKey = objectKey(edge.target.table_name, edge.target.object_name);
        next.set(targetKey, edge.target);
        pendingEdges.push({ sourceKey: currentKey, target: edge.target, reference: edge.reference_text });
      });
    });
    if (!next.size) break;
    const positions = lineageLayerPositions([...next.keys()], downstreamStart + (level - 1) * 170);
    next.forEach((reference, key) => {
      if (!nodeIds.has(key)) {
        const nodeId = `${lineageTone(reference) === "measure" ? "measure" : "dax"}-${lineageId(key)}`;
        nodeIds.set(key, nodeId);
        nodes.push(lineageNode(nodeId, reference.qualified_name, expressionIndex.get(key) ?? `DAX ${reference.object_type}`, positions.get(key) ?? { x: 410, y: downstreamStart + (level - 1) * 170 }, lineageTone(reference)));
      }
    });
    pendingEdges.forEach(({ sourceKey, target, reference }) => {
      const sourceNodeId = nodeIds.get(sourceKey);
      const targetNodeId = nodeIds.get(objectKey(target.table_name, target.object_name));
      if (sourceNodeId && targetNodeId) edges.push(lineageEdge(`measure-dependent-${edgeIndex++}`, sourceNodeId, targetNodeId, reference));
    });
    downstreamCurrent = [...next.keys()];
  }

  return { nodes, edges };
}

function lineageTone(reference: DaxReference): "semantic" | "dax" | "measure" {
  if (reference.object_type === "measure") return "measure";
  if (reference.object_type === "calculated_column" || reference.object_type === "calculated_table") return "dax";
  return "semantic";
}

function lineageNode(id: string, title: string, detail: string, position: { x: number; y: number }, tone: "source" | "semantic" | "dax" | "measure") : Node {
  const tones = {
    source: { border: "#99f6e4", background: "#f0fdfa", accent: "#0f766e" },
    semantic: { border: "#bae6fd", background: "#f0f9ff", accent: "#0369a1" },
    dax: { border: "#fde68a", background: "#fffbeb", accent: "#b45309" },
    measure: { border: "#c4b5fd", background: "#faf5ff", accent: "#6d28d9" },
  }[tone];
  return { id, position, data: { label: <div className="max-w-[220px] text-left"><div className="text-xs font-semibold" style={{ color: tones.accent }}>{title}</div><div className="mt-1 break-words text-[11px] leading-4 text-zinc-600">{abbreviate(detail, 110)}</div></div> }, style: { width: 248, border: `1px solid ${tones.border}`, borderRadius: 6, background: tones.background, padding: 10, boxShadow: "none" } };
}

function lineageEdge(id: string, source: string, target: string, label: string): Edge {
  return { id, source, target, label: abbreviate(label, 34), type: "smoothstep", animated: false, style: { stroke: "#64748b" }, labelStyle: { fontSize: 10, fill: "#475569" }, labelBgStyle: { fill: "#ffffff", fillOpacity: 0.92 } };
}

function lineageLayerPositions(keys: string[], y: number) {
  const spacing = 276;
  const start = Math.max(20, 534 - ((keys.length - 1) * spacing) / 2);
  return new Map(keys.map((key, index) => [key, { x: start + index * spacing, y }]));
}

function lineageId(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

function NameSelector({ id, label, items, selectedId, onChange }: { id: string; label: string; items: Array<{ id: string; name: string }>; selectedId: string; onChange: (id: string) => void }) {
  const selectedItem = items.find((item) => item.id === selectedId) ?? null;
  return <div className="w-full space-y-1.5 xl:max-w-sm"><label className="text-xs font-semibold text-zinc-600" htmlFor={id}>{label}</label><select id={id} value={selectedId} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"><option value="" disabled>Select a {label.toLowerCase()}</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{selectedItem && <p className="break-all text-xs text-zinc-500">Selected {label.toLowerCase()} ID: <code className="text-zinc-700">{selectedItem.id}</code></p>}</div>;
}

function ReportSelector({ reports, selectedReport, onChange }: { reports: Report[]; selectedReport: Report | null; onChange: (id: string) => void }) {
  return <NameSelector id="explorer-report" label="Report" items={reports} selectedId={selectedReport?.id ?? ""} onChange={onChange} />;
}

function SemanticModelSelector({ semanticModels, selectedSemanticModel, onChange }: { semanticModels: SemanticModel[]; selectedSemanticModel: SemanticModel | null; onChange: (id: string) => void }) {
  return <NameSelector id="explorer-semantic-model" label="Semantic model" items={semanticModels} selectedId={selectedSemanticModel?.id ?? ""} onChange={onChange} />;
}

function ExplorerGrid({ rowData, columnDefs, onRowClick, emptyMessage, exportFileName, exportContext }: {
  rowData: ExplorerGridRow[];
  columnDefs: ColDef<ExplorerGridRow>[];
  onRowClick?: (row: ExplorerGridRow) => void;
  emptyMessage: string;
  exportFileName: string;
  exportContext: ExportContext;
}) {
  const [tableCopied, setTableCopied] = useState(false);

  async function copyTable() {
    await copyText(toTabSeparatedValues(withExportContext(rowData, exportContext)));
    setTableCopied(true);
    window.setTimeout(() => setTableCopied(false), 1800);
  }

  return <div className="mt-4 overflow-x-auto border border-zinc-200"><div className="flex min-w-[720px] items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-3 py-2"><span className="text-xs text-zinc-500">{rowData.length} {rowData.length === 1 ? "row" : "rows"}</span><div className="flex gap-2"><Button type="button" variant="outline" size="sm" title="Copy all table values" disabled={!rowData.length} onClick={() => void copyTable()}>{tableCopied ? <CheckCircle2 className="size-3.5 text-emerald-700" /> : <ClipboardCopy className="size-3.5" />} {tableCopied ? "Copied" : "Copy table"}</Button><Button type="button" variant="outline" size="sm" title="Download CSV" disabled={!rowData.length} onClick={() => downloadCsv(rowData, exportContext, exportFileName)}><Download className="size-3.5" /> CSV</Button><Button type="button" variant="outline" size="sm" title="Download Excel-compatible file" disabled={!rowData.length} onClick={() => downloadExcel(rowData, exportContext, exportFileName)}><FileSpreadsheet className="size-3.5" /> Excel</Button></div></div><div className="h-[350px] min-w-[720px]"><AgGridReact<ExplorerGridRow> theme={explorerTheme} rowData={rowData} columnDefs={columnDefs} defaultColDef={{ sortable: true, resizable: true, minWidth: 110, cellRenderer: CopyableCell }} rowHeight={42} headerHeight={40} suppressCellFocus={false} enableCellTextSelection ensureDomOrder overlayNoRowsTemplate={`<span class="ag-overlay-no-rows-center">${emptyMessage}</span>`} onRowClicked={(event) => event.data && onRowClick?.(event.data)} /></div></div>;
}

function CopyableCell({ value }: ICellRendererParams<ExplorerGridRow>) {
  const [copied, setCopied] = useState(false);
  const text = String(value ?? "--");

  async function copyValue(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    await copyText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return <span className="group flex h-full min-w-0 items-center gap-1"><span className="min-w-0 truncate" title={text}>{abbreviate(text, 120)}</span><button type="button" aria-label="Copy cell value" title="Copy value" className="ml-auto hidden shrink-0 text-zinc-400 hover:text-teal-700 group-hover:inline-flex focus:inline-flex" onClick={(event) => void copyValue(event)}>{copied ? <CheckCircle2 className="size-3.5 text-emerald-700" /> : <Copy className="size-3.5" />}</button></span>;
}

function daxColumn(field = "daxExpression", headerName = "DAX expression"): ColDef<ExplorerGridRow> {
  return { field, headerName, minWidth: 300, flex: 1.8, tooltipField: field, valueFormatter: (params) => abbreviate(String(params.value ?? "--"), 86) };
}

function MetadataSummary({ query }: { query: UseQueryResult<{ reconciliation: { matched_count: number; definition_only_count: number; xmla_only_count: number } }, Error> }) {
  if (query.isLoading) return <ExplorerLoading label="Reconciling runtime XMLA metadata" compact />;
  if (query.isError) return <div className="mt-6 border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">Runtime XMLA reconciliation is unavailable for this model or capacity. Parsed definition data remains available above.</div>;
  if (!query.data) return null;
  const reconciliation = query.data.reconciliation;
  return <div className="mt-6 grid border-y border-zinc-200 sm:grid-cols-3"><DetailItem label="Matched with XMLA" value={String(reconciliation.matched_count)} /><DetailItem label="Definition only" value={String(reconciliation.definition_only_count)} /><DetailItem label="XMLA only" value={String(reconciliation.xmla_only_count)} /></div>;
}

function semanticObjectRows(parsed: ParsedSemanticModel | undefined): ExplorerGridRow[] {
  if (!parsed) return [];
  return parsed.tables.flatMap((table) => [
    ...table.columns.map((column) => ({ id: `column-${table.name}-${column.name}`, table: table.name, name: column.name, kind: column.expression ? "Calculated column" : "Column", dataType: column.data_type ?? "--", sourceColumn: column.source_column ?? "Not declared", daxExpression: column.expression ?? "--", visibility: column.is_hidden ? "Hidden" : "Visible" })),
    ...table.measures.map((measure) => ({ id: `measure-${table.name}-${measure.name}`, table: table.name, name: measure.name, kind: "Measure", dataType: "--", sourceColumn: "--", daxExpression: measure.expression ?? "--", visibility: measure.is_hidden ? "Hidden" : "Visible" })),
    ...table.hierarchies.map((hierarchy) => ({ id: `hierarchy-${table.name}-${hierarchy.name}`, table: table.name, name: hierarchy.name, kind: "Hierarchy", dataType: "--", sourceColumn: hierarchy.levels.map((level) => level.column).filter(Boolean).join(", ") || "--", daxExpression: "--", visibility: "Visible" })),
  ]);
}

function databaseColumnRows(parsed: ParsedSemanticModel | undefined, dax: DaxAnalysis | undefined): ExplorerGridRow[] {
  if (!parsed) return [];
  const expressionIndex = buildExpressionIndex(parsed);
  return parsed.tables.flatMap((table) => table.columns.map((column) => {
    const dependencies = (dax?.dependencies ?? []).filter((edge) => objectKey(edge.source.table_name, edge.source.object_name) === objectKey(table.name, column.name));
    const useDetails = dependencies.map((edge) => `${edge.target.qualified_name}: ${expressionIndex.get(objectKey(edge.target.table_name, edge.target.object_name)) ?? "Expression not declared"}`);
    return { id: `${table.name}-${column.name}`, sourceColumn: column.source_column ?? "Not declared", semanticTable: table.name, semanticColumn: column.name, dataType: column.data_type ?? "--", daxUsedBy: dependencies.length ? dependencies.map((edge) => edge.target.qualified_name).join(", ") : "No DAX use detected", daxExpressions: useDetails.join("\n\n") || "--", evidence: column.source_path ?? table.source_path ?? "No source path reported" };
  }));
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

function objectKey(tableName: string | null | undefined, objectName: string) {
  return `${tableName ?? ""}[${objectName}]`.toLocaleLowerCase();
}

function makeExportContext(workspace: Workspace | null, report?: Report | null, semanticModel?: SemanticModel | null): ExportContext {
  const context: ExportContext = {};
  if (workspace) { context.parent_workspace_name = workspace.name; context.parent_workspace_id = workspace.id; }
  if (report) { context.parent_report_name = report.name; context.parent_report_id = report.id; }
  if (semanticModel) { context.parent_semantic_model_name = semanticModel.name; context.parent_semantic_model_id = semanticModel.id; }
  return context;
}

function downloadCsv(rows: ExplorerGridRow[], context: ExportContext, baseName: string) {
  const data = withExportContext(rows, context);
  const columns = collectColumns(data);
  const csv = [columns.join(","), ...data.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\r\n");
  downloadBlob(`\uFEFF${csv}`, "text/csv;charset=utf-8", `${filePart(baseName)}.csv`);
}

function downloadExcel(rows: ExplorerGridRow[], context: ExportContext, baseName: string) {
  const data = withExportContext(rows, context);
  const columns = collectColumns(data);
  const table = `<table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${data.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(String(row[column] ?? ""))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  downloadBlob(`<!doctype html><html><head><meta charset="utf-8"></head><body>${table}</body></html>`, "application/vnd.ms-excel;charset=utf-8", `${filePart(baseName)}.xls`);
}

function withExportContext(rows: ExplorerGridRow[], context: ExportContext) {
  return rows.map(({ id: _id, ...row }) => ({ ...context, ...row }));
}

function collectColumns(rows: Array<Record<string, ExportValue>>) {
  return Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
}

function toTabSeparatedValues(rows: Array<Record<string, ExportValue>>) {
  const columns = collectColumns(rows);
  return [
    columns.join("\t"),
    ...rows.map((row) => columns.map((column) => String(row[column] ?? "").replace(/[\t\r\n]+/g, " ")).join("\t")),
  ].join("\n");
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

function csvCell(value: ExportValue) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function downloadBlob(content: string, type: string, fileName: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function filePart(value: string | undefined) {
  return (value ?? "lineage-export").trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "lineage-export";
}

function abbreviate(value: string, length: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > length ? `${clean.slice(0, length - 1)}...` : clean;
}

function SectionHeading({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="flex items-start gap-3"><span className="mt-0.5 text-teal-700">{icon}</span><div><h2 className="text-base font-semibold">{title}</h2><p className="mt-1 text-sm leading-6 text-zinc-500">{text}</p></div></div>;
}

function ExplorerMetric({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return <div className="min-w-0 px-3 py-3 sm:px-4"><div className="flex items-center gap-1.5 text-xs text-zinc-500">{icon}<span className="truncate">{label}</span></div><p className="mt-1 truncate text-sm font-semibold text-zinc-950">{value}</p></div>;
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 border-b border-zinc-200 px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 truncate text-sm font-semibold text-zinc-950" title={value}>{value}</p></div>;
}

function AvailabilityNotice({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="border-b border-zinc-200 p-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"><div className="flex items-center gap-2 text-zinc-700">{icon}<h3 className="text-sm font-semibold">{title}</h3></div><p className="mt-2 text-xs leading-5 text-zinc-500">{text}</p></div>;
}

function DaxUnavailable() {
  return <div className="flex gap-2 border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><CircleAlert className="mt-0.5 size-4 shrink-0" />DAX dependency analysis is not available for this session. Direct DAX expressions returned by the semantic definition remain visible.</div>;
}

function ExplorerLoading({ label, compact = false }: { label: string; compact?: boolean }) {
  return <div className={cn("flex items-center justify-center gap-2 border border-zinc-200 bg-zinc-50 text-sm text-zinc-600", compact ? "mt-4 p-4" : "min-h-[340px] p-6")}><Loader2 className="size-4 animate-spin text-teal-700" />{label}</div>;
}

function ExplorerEmpty({ title, text }: { title: string; text: string }) {
  return <section className="flex min-h-[560px] items-center justify-center border border-zinc-200 bg-white p-6 text-center"><div className="max-w-md"><Boxes className="mx-auto size-8 text-zinc-300" /><h1 className="mt-4 text-lg font-semibold">{title}</h1><p className="mt-2 text-sm leading-6 text-zinc-500">{text}</p></div></section>;
}

function ExplorerUnavailable({ error }: { error: Error }) {
  return <section className="flex min-h-[560px] items-center justify-center border border-zinc-200 bg-white p-6 text-center"><div className="max-w-md"><AlertCircle className="mx-auto size-8 text-amber-500" /><h1 className="mt-4 text-lg font-semibold">Power BI authentication is required</h1><p className="mt-2 text-sm leading-6 text-zinc-500">Complete Power BI setup, approve the Microsoft device code, then return to Explorer to load the estate.</p><a className="mt-5 inline-flex h-8 items-center gap-1.5 rounded-lg bg-zinc-950 px-3 text-sm font-medium text-white hover:bg-zinc-800" href="/workspace/power-bi">Start Power BI setup</a><p className="mt-3 text-xs text-zinc-400">{friendlyError(error)}</p></div></section>;
}

function ExplorerError({ text }: { text: string }) {
  return <div className="border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">{text}</div>;
}

async function requestJson<T>(apiOrigin: string, path: string, init?: RequestInit) {
  const adminKey = useAppStore.getState().adminKey.trim();
  const response = await fetch(`${apiOrigin}${path}`, { credentials: "include", ...init, headers: { "Content-Type": "application/json", ...(adminKey ? { "X-Lineage-Admin-Key": adminKey } : {}), ...init?.headers } });
  const body = await readJsonResponse(response);
  if (!response.ok) throw new Error(readError(body, response.status));
  return body as T;
}

function readError(body: unknown, status: number) {
  if (typeof body === "object" && body !== null && "detail" in body) {
    const detail = (body as Record<string, unknown>).detail;
    if (typeof detail === "string") return detail;
  }
  return `Request failed with status ${status}.`;
}

function friendlyError(error: Error) {
  return error.message.includes("401") || error.message.toLowerCase().includes("session") ? "No active Power BI session was found." : "The workspace inventory could not be loaded.";
}
