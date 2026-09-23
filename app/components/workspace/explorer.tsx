import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type ICellRendererParams,
} from "ag-grid-community";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
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
  Radar,
  TableProperties,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { PowerBiAuthRequired } from "~/components/workspace/auth-required";
import { ApiError, isPermissionDenied, isSessionExpired, requestJson } from "~/lib/lineage-api";
import { DEFAULT_SCAN_FLAGS, workspacePayload, type ScannerWorkspace } from "~/lib/scanner-api";
import { useWorkspaceScan } from "~/lib/use-workspace-scan";
import { cn } from "~/lib/utils";
import { useAppStore } from "~/stores/app-store";
import { usePowerAiStore } from "~/stores/power-ai-store";

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

type ExplorerTab = "assets" | "reports";
/** Every view inside the Reports tab works against the one report selected there, so the picker lives above these rather than inside each of them. */
type ReportSection = "report-detail" | "source-db-lineage" | "semantic-objects" | "report-semantic";
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
  /** Power BI often omits this, so it is never required — but when present it is the only reliable proof of where the bound model actually lives. */
  dataset_workspace_id?: string | null;
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

type WorkspaceResponse = { workspaces: Workspace[] };
type ReportsResponse = { reports: Report[] };
type SemanticModelsResponse = { semantic_models: SemanticModel[] };
type ReportPagesResponse = { pages: ReportPage[] };

type ExplorerEvidenceWarning = { code: string; message: string };

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
};
type ReportSourceTablesResponse = { rows: ReportSourceTableRow[]; count: number; warnings: ExplorerEvidenceWarning[] };

const tabs: Array<{ id: ExplorerTab; label: string; shortLabel: string }> = [
  { id: "assets", label: "1. Reports, dashboards, apps, and access", shortLabel: "Assets & access" },
  { id: "reports", label: "2. Report-scoped evidence", shortLabel: "Reports" },
];

const reportSections: Array<{ id: ReportSection; label: string; shortLabel: string }> = [
  { id: "report-detail", label: "Report page details", shortLabel: "Page details" },
  { id: "source-db-lineage", label: "Source database lineage", shortLabel: "Source DB lineage" },
  { id: "semantic-objects", label: "Semantic model objects", shortLabel: "Semantic objects" },
  { id: "report-semantic", label: "Report visual field lineage", shortLabel: "Report visuals" },
];

export function Explorer() {
  const apiOrigin = useAppStore((state) => state.apiOrigin);
  const [activeTab, setActiveTab] = useState<ExplorerTab>("assets");
  const [activeReportSection, setActiveReportSection] = useState<ReportSection>("report-detail");
  const [gatewaySourcesEnabled, setGatewaySourcesEnabled] = useState(false);
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
  const scan = useWorkspaceScan(apiOrigin, selectedWorkspace ? [selectedWorkspace.id] : [], DEFAULT_SCAN_FLAGS);

  useEffect(() => {
    usePowerAiStore.getState().mergeContext({
      workspaceId: selectedWorkspace?.id,
      workspaceName: selectedWorkspace?.name,
      reportId: undefined,
      reportName: undefined,
      semanticModelId: undefined,
      semanticModelName: undefined,
      objectType: undefined,
      objectId: undefined,
      objectName: undefined,
    });
  }, [selectedWorkspace]);

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
  // Drive semantic lineage from the report's own binding rather than from a model
  // that happens to be listed in this workspace: a report can be bound to a model
  // in another workspace, and `dataset_workspace_id` (when Power BI returns it) is
  // the only reliable proof of where that model lives.
  const boundModelId = selectedReport?.dataset_id ?? null;
  const boundModelWorkspaceId = selectedReport?.dataset_workspace_id ?? selectedWorkspaceId;
  const reportSemanticLineageQuery = useQuery({
    queryKey: ["explorer", "report-semantic-lineage", apiOrigin, selectedWorkspaceId, selectedReportId, boundModelId, boundModelWorkspaceId],
    queryFn: () => {
      const query = new URLSearchParams({ semantic_model_id: boundModelId!, semantic_model_workspace_id: boundModelWorkspaceId });
      return requestJson<ReportSemanticLineage>(apiOrigin, `/api/v1/workspaces/${selectedWorkspaceId}/reports/${selectedReportId}/semantic-lineage?${query.toString()}`, { method: "POST" });
    },
    enabled: Boolean(selectedWorkspaceId && selectedReportId && boundModelId),
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
    enabled: Boolean(selectedWorkspaceId && selectedSemanticModelId && activeTab === "reports" && activeReportSection === "semantic-objects"),
    ...heavyQueryOptions,
  });
  const reportSourceTablesQuery = useQuery({
    queryKey: ["explorer", "report-source-tables", apiOrigin, selectedWorkspaceId, selectedReportId, gatewaySourcesEnabled],
    queryFn: () => requestJson<ReportSourceTablesResponse>(apiOrigin, "/api/v1/explorer/report-source-tables", { method: "POST", body: JSON.stringify(explorerReportsBody(selectedWorkspace!, selectedReport!, { includeGatewaySources: gatewaySourcesEnabled })) }),
    enabled: Boolean(selectedWorkspaceId && selectedReportId && activeTab === "reports" && activeReportSection === "source-db-lineage"),
    ...heavyQueryOptions,
  });

  const backgroundPreparing = Boolean(
    selectedReport && (
      reportDetailQuery.isFetching || reportPagesQuery.isFetching || normalizedReportQuery.isFetching || reportSemanticLineageQuery.isFetching || parsedSemanticModelQuery.isFetching || daxQuery.isFetching
    ),
  );

  if (workspacesQuery.isLoading) return <ExplorerLoading label="Loading Power BI workspaces" />;
  if (workspacesQuery.isError) return <PowerBiAuthRequired returnTo="Explorer" />;
  if (!workspaces.length) return <ExplorerEmpty title="No Power BI workspaces found" text="The authenticated account did not return any workspaces to explore." />;

  return (
    <section className="border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-5 py-5 sm:px-6">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-[8px] bg-teal-700 text-white"><Network className="size-5" /></span>
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase text-teal-700">Power BI</span><Badge className="rounded-[8px] border border-teal-200 bg-teal-50 text-teal-800">Name-based explorer</Badge></div>
              <h1 className="text-lg font-semibold">Explorer</h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500">Choose a workspace, review its assets, then pick a report to see its pages, source database tables, semantic objects, and visual field lineage.</p>
            </div>
          </div>
          <NameSelector id="explorer-workspace" label="Workspace" items={workspaces} selectedId={selectedWorkspaceId} onChange={setSelectedWorkspaceId} />
        </div>
        {backgroundPreparing && <BackgroundPreparation reportName={selectedReport?.name ?? "selected report"} />}
        <div className="mt-5 grid grid-cols-2 divide-x divide-zinc-200 border-y border-zinc-200 sm:max-w-sm">
          <ExplorerMetric label="Reports" value={reports.length} icon={<FileBarChart2 className="size-4" />} />
          <ExplorerMetric label="Semantic models" value={semanticModels.length} icon={<Layers3 className="size-4" />} />
        </div>
      </div>

      <ExplorerGuidance />
      <div className="overflow-x-auto border-b border-zinc-200 bg-[#fafbfc]">
        <div className="flex min-w-max px-4 sm:px-6" role="tablist" aria-label="Explorer sections">
          {tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} className={cn("border-b-2 px-4 py-3 text-left text-sm transition", activeTab === tab.id ? "border-teal-700 font-semibold text-teal-800" : "border-transparent text-zinc-500 hover:text-zinc-950")} title={tab.label}>{tab.shortLabel}</button>)}
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {activeTab === "assets" && <AssetsAccessTab workspace={selectedWorkspace} reports={reports} semanticModels={semanticModels} isLoading={reportsQuery.isLoading || semanticModelsQuery.isLoading} error={reportsQuery.error ?? semanticModelsQuery.error} scan={scan} onReportSelect={(reportId) => { setSelectedReportId(reportId); setActiveReportSection("report-detail"); setActiveTab("reports"); }} onSemanticModelSelect={(modelId) => { setSelectedSemanticModelId(modelId); setActiveReportSection("semantic-objects"); setActiveTab("reports"); }} />}
        {activeTab === "reports" && <div className="space-y-6">
          <ReportSelector reports={reports} selectedReport={selectedReport} onChange={setSelectedReportId} />
          {!reports.length
            ? <ExplorerEmpty title="No reports in this workspace" text="Choose another workspace, or check that the authenticated account can see this workspace's reports." />
            : <>
                <div className="overflow-x-auto border-b border-zinc-200">
                  <div className="flex min-w-max gap-1" role="tablist" aria-label="Report evidence sections">
                    {reportSections.map((section) => <button key={section.id} type="button" role="tab" aria-selected={activeReportSection === section.id} onClick={() => setActiveReportSection(section.id)} className={cn("border-b-2 px-3 py-2 text-sm transition", activeReportSection === section.id ? "border-teal-700 font-semibold text-teal-800" : "border-transparent text-zinc-500 hover:text-zinc-950")} title={section.label}>{section.shortLabel}</button>)}
                  </div>
                </div>
                {activeReportSection === "report-detail" && <ReportDetailTab workspace={selectedWorkspace} selectedReport={selectedReport} reportSemanticModel={reportSemanticModel} detailQuery={reportDetailQuery} pagesQuery={reportPagesQuery} />}
                {activeReportSection === "source-db-lineage" && <SourceDbLineageTab workspace={selectedWorkspace} selectedReport={selectedReport} query={reportSourceTablesQuery} gatewaySourcesEnabled={gatewaySourcesEnabled} onGatewaySourcesChange={setGatewaySourcesEnabled} />}
                {activeReportSection === "semantic-objects" && <SemanticObjectsTab workspace={selectedWorkspace} selectedReport={selectedReport} semanticModels={semanticModels} selectedSemanticModel={selectedSemanticModel} onSemanticModelChange={setSelectedSemanticModelId} parsedQuery={parsedSemanticModelQuery} daxQuery={daxQuery} metadataQuery={semanticMetadataQuery} />}
                {activeReportSection === "report-semantic" && <ReportSemanticTab workspace={selectedWorkspace} selectedReport={selectedReport} reportSemanticModel={reportSemanticModel} normalizedQuery={normalizedReportQuery} lineageQuery={reportSemanticLineageQuery} parsed={parsedSemanticModelQuery.data} daxQuery={daxQuery} />}
              </>}
        </div>}
      </div>
    </section>
  );
}

function ExplorerGuidance() {
  return <div className="grid border-b border-zinc-200 bg-zinc-50 md:grid-cols-3"><GuidanceStep number="1" title="Choose the business name" text="Start with the workspace and report people recognize." /><GuidanceStep number="2" title="Pick the report" text="Everything in the Reports tab is scoped to the report selected there." /><GuidanceStep number="3" title="Trace the evidence" text="Work through page details, source DB lineage, semantic objects, and report visuals." /></div>;
}

function GuidanceStep({ number, title, text }: { number: string; title: string; text: string }) {
  return <div className="flex gap-3 border-b border-zinc-200 px-5 py-4 last:border-b-0 md:border-b-0 md:border-r md:px-6 md:last:border-r-0"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-teal-700 text-xs font-semibold text-white">{number}</span><div><p className="text-sm font-semibold">{title}</p><p className="mt-0.5 text-xs leading-5 text-zinc-500">{text}</p></div></div>;
}

function BackgroundPreparation({ reportName }: { reportName: string }) {
  return <div className="mt-4 flex items-start gap-2 border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-950"><Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin" /><span>Preparing report, semantic, and DAX details for <strong>{reportName}</strong> in the background. You can keep exploring while this completes.</span></div>;
}

function AssetsAccessTab({ workspace, reports, semanticModels, isLoading, error, scan, onReportSelect, onSemanticModelSelect }: {
  workspace: Workspace | null;
  reports: Report[];
  semanticModels: SemanticModel[];
  isLoading: boolean;
  error: Error | null;
  scan: ReturnType<typeof useWorkspaceScan>;
  onReportSelect: (id: string) => void;
  onSemanticModelSelect: (id: string) => void;
}) {
  const modelNames = new Map(semanticModels.map((model) => [model.id, model.name]));
  const reportRows: ExplorerGridRow[] = reports.map((report) => ({ id: report.id, reportId: report.id, name: report.name, type: report.report_type ?? "Report", semanticModel: report.dataset_id ? modelNames.get(report.dataset_id) ?? (report.dataset_workspace_id ? "Model in another workspace" : "External or unresolved model") : "No model returned", format: report.format ?? "--", access: report.is_owned_by_me ? "You" : "Shared" }));
  const modelRows: ExplorerGridRow[] = semanticModels.map((model) => ({ id: model.id, semanticModelId: model.id, name: model.name, storage: model.target_storage_mode ?? "--", refresh: model.is_refreshable ? "Refreshable" : "Not reported", gateway: model.is_on_prem_gateway_required ? "Required" : "Not required" }));
  if (isLoading) return <ExplorerLoading label="Loading reports and semantic models" />;
  if (error) return <ExplorerError text="Report or semantic-model inventory is unavailable for this workspace." />;
  return <div className="space-y-8">
    <div><SectionHeading icon={<Files className="size-5" />} title="Reports" text="Select a report by name to inspect its pages, report structure, and semantic lineage." /><ExplorerGrid rowData={reportRows} columnDefs={[{ field: "name", headerName: "Report name", minWidth: 230, flex: 1.4 }, { field: "type", headerName: "Type", minWidth: 120 }, { field: "semanticModel", headerName: "Semantic model", minWidth: 220, flex: 1.2 }, { field: "format", headerName: "Format", minWidth: 120 }, { field: "access", headerName: "Access", minWidth: 110 }]} onRowClick={(row) => onReportSelect(row.id)} emptyMessage="No reports were returned for this workspace." exportFileName={`${filePart(workspace?.name)}-reports`} exportContext={makeExportContext(workspace)} /></div>
    <div><SectionHeading icon={<Layers3 className="size-5" />} title="Semantic models" text="These models resolve report field references and detailed object metadata." /><ExplorerGrid rowData={modelRows} columnDefs={[{ field: "name", headerName: "Model name", minWidth: 260, flex: 1.5 }, { field: "storage", headerName: "Storage mode", minWidth: 160 }, { field: "refresh", headerName: "Refresh", minWidth: 140 }, { field: "gateway", headerName: "Gateway", minWidth: 140 }]} onRowClick={(row) => onSemanticModelSelect(row.id)} emptyMessage="No semantic models were returned for this workspace." exportFileName={`${filePart(workspace?.name)}-semantic-models`} exportContext={makeExportContext(workspace)} /></div>
    <ScannerEvidencePanel workspace={workspace} scan={scan} />
  </div>;
}

function ScannerEvidencePanel({ workspace, scan }: { workspace: Workspace | null; scan: ReturnType<typeof useWorkspaceScan> }) {
  const status = scan.status;
  const isRunning = Boolean(scan.scanId) && status !== "Succeeded" && status !== "Failed";
  const payload = status === "Succeeded" && workspace ? workspacePayload(scan.resultQuery.data, workspace.id) : undefined;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3 border-y border-zinc-200 bg-zinc-50 px-4 py-3">
      <div>
        <p className="text-sm font-semibold">Dashboards, app linkage, and ownership</p>
        <p className="mt-0.5 text-xs leading-5 text-zinc-500">Runs the Power BI Admin scanner for this workspace only. Subject to the tenant's hourly scan limits — run it deliberately, not repeatedly.</p>
      </div>
      <Button type="button" variant="outline" size="sm" disabled={!workspace || isRunning} onClick={scan.runScan}>
        {isRunning ? <Loader2 className="size-3.5 animate-spin" /> : <Radar className="size-3.5" />} {scan.scanId && status === "Succeeded" ? "Run scan again" : "Run metadata scan"}
      </Button>
    </div>

    {isRunning && <div className="flex items-center gap-2 border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900"><Loader2 className="size-3.5 animate-spin" />Scanning ({status ?? "starting"})...</div>}
    {status === "Failed" && <div className="border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">{scan.statusError?.message ?? "The metadata scan failed."}</div>}
    {scan.isStatusUnavailable && <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Scan status could not be checked. Confirm the scanner API is reachable for this session.</div>}

    {!payload
      ? <div className="grid border-y border-zinc-200 md:grid-cols-3">
          <AvailabilityNotice icon={<FileBarChart2 className="size-5" />} title="Dashboards" text="Run a scan above to see this workspace's dashboards." />
          <AvailabilityNotice icon={<Boxes className="size-5" />} title="App linkage" text="Run a scan above to see which Power BI apps reference this workspace's content." />
          <AvailabilityNotice icon={<UsersRound className="size-5" />} title="Ownership" text="Run a scan above to see report and dataset creators and last editors." />
        </div>
      : <ScannerEvidenceResults workspace={payload} exportContext={makeExportContext(workspace)} />}
  </div>;
}

function ScannerEvidenceResults({ workspace, exportContext }: { workspace: ScannerWorkspace; exportContext: ExportContext }) {
  const dashboardRows: ExplorerGridRow[] = (workspace.dashboards ?? []).map((dashboard) => ({ id: dashboard.id, name: dashboard.displayName, tiles: dashboard.tiles?.length ?? 0, readOnly: dashboard.isReadOnly ? "Read-only" : "Editable", app: dashboard.appId ?? "--" }));
  const appIds = Array.from(new Set([...(workspace.reports ?? []).map((report) => report.appId), ...(workspace.dashboards ?? []).map((dashboard) => dashboard.appId)].filter((id): id is string => Boolean(id))));
  const ownershipRows: ExplorerGridRow[] = [
    ...(workspace.reports ?? []).map((report) => ({ id: `report-${report.id}`, kind: "Report", name: report.name, owner: report.modifiedBy ?? report.createdBy ?? "--" })),
    ...(workspace.datasets ?? []).map((dataset) => ({ id: `dataset-${dataset.id}`, kind: "Semantic model", name: dataset.name, owner: dataset.configuredBy ?? "--" })),
  ];

  return <div className="space-y-8">
    <div>
      <SectionHeading icon={<FileBarChart2 className="size-5" />} title="Dashboards" text="Every dashboard the scanner found in this workspace." />
      <ExplorerGrid rowData={dashboardRows} columnDefs={[{ field: "name", headerName: "Dashboard", minWidth: 230, flex: 1.4 }, { field: "tiles", headerName: "Tiles", minWidth: 100 }, { field: "readOnly", headerName: "Access", minWidth: 120 }, { field: "app", headerName: "Linked app ID", minWidth: 260, flex: 1 }]} emptyMessage="No dashboards were found in this workspace." exportFileName={`${filePart(workspace.name)}-dashboards`} exportContext={exportContext} />
    </div>
    <div>
      <SectionHeading icon={<Boxes className="size-5" />} title="App linkage" text="Apps that reference this workspace's content, by ID. The scanner does not return app display names." />
      {appIds.length
        ? <ul className="mt-3 flex flex-wrap gap-2">{appIds.map((id) => <li key={id} className="break-all border border-zinc-200 bg-zinc-50 px-2.5 py-1 font-mono text-xs text-zinc-700">{id}</li>)}</ul>
        : <p className="mt-3 text-sm text-zinc-500">No app-linked content was found in this workspace.</p>}
    </div>
    <div>
      <SectionHeading icon={<UsersRound className="size-5" />} title="Ownership" text="Reports and semantic models, with their creator, last editor, or configuring identity." />
      <ExplorerGrid rowData={ownershipRows} columnDefs={[{ field: "kind", headerName: "Type", minWidth: 150 }, { field: "name", headerName: "Name", minWidth: 220, flex: 1 }, { field: "owner", headerName: "Owner", minWidth: 260, flex: 1 }]} emptyMessage="No ownership evidence was found in this workspace." exportFileName={`${filePart(workspace.name)}-ownership`} exportContext={exportContext} />
    </div>
  </div>;
}

function ReportDetailTab({ workspace, selectedReport, reportSemanticModel, detailQuery, pagesQuery }: {
  workspace: Workspace | null;
  selectedReport: Report | null;
  reportSemanticModel: SemanticModel | null;
  detailQuery: UseQueryResult<Report, Error>;
  pagesQuery: UseQueryResult<ReportPagesResponse, Error>;
}) {
  const pages = pagesQuery.data?.pages ?? [];
  const pageRows: ExplorerGridRow[] = pages.map((page) => ({ id: page.name, pageName: page.name, displayName: page.display_name, order: page.order + 1 }));
  const context = makeExportContext(workspace, selectedReport, reportSemanticModel);
  return <div className="space-y-6">
    <SectionHeading icon={<FileBarChart2 className="size-5" />} title="Report page details" text="Each report is read individually so page information is ready before semantic and source evidence is reviewed." />
    {detailQuery.isLoading || pagesQuery.isLoading ? <ExplorerLoading label="Loading selected report and pages" /> : null}
    {detailQuery.isError || pagesQuery.isError ? <ExplorerError text="Selected report details are unavailable for this workspace." /> : null}
    {detailQuery.data && <div className="grid border-y border-zinc-200 md:grid-cols-4"><DetailItem label="Report type" value={detailQuery.data.report_type ?? "Not reported"} /><DetailItem label="Format" value={detailQuery.data.format ?? "Not reported"} /><DetailItem label="Linked model" value={reportSemanticModel?.name ?? "Not reported"} /><DetailItem label="Pages" value={String(pages.length)} /></div>}
    {!pagesQuery.isLoading && !pagesQuery.isError && <ExplorerGrid rowData={pageRows} columnDefs={[{ field: "order", headerName: "Order", minWidth: 100 }, { field: "displayName", headerName: "Page name", minWidth: 280, flex: 1 }]} emptyMessage="No report pages were returned." exportFileName={`${filePart(selectedReport?.name)}-pages`} exportContext={context} />}
  </div>;
}

function ReportSemanticTab({ workspace, selectedReport, reportSemanticModel, normalizedQuery, lineageQuery, parsed, daxQuery }: {
  workspace: Workspace | null;
  selectedReport: Report | null;
  reportSemanticModel: SemanticModel | null;
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
    <SectionHeading icon={<BookOpenCheck className="size-5" />} title="Report visual lineage" text="This matches fields used in a report's visuals to the linked semantic model, including the DAX expression when that object is calculated." />
    {!reportSemanticModel && selectedReport?.dataset_id && <div className="border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">This report's semantic model is not listed in the selected workspace{selectedReport.dataset_workspace_id ? `; Power BI reports it lives in workspace ${selectedReport.dataset_workspace_id}` : ""}. Field lineage is still requested against the report's bound model.</div>}
    {!selectedReport?.dataset_id && <ExplorerError text="This report did not return a bound semantic model, so no field lineage can be requested for it." />}
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

/**
 * One selection is always enough here because Explorer works a single report at
 * a time; `semantic_model_id` is deliberately omitted so the backend infers the
 * binding itself (which is also what makes a model in another workspace work).
 * Both `include_*` flags cost real upstream API calls, so they default to off.
 */
function explorerReportsBody(workspace: Workspace, report: Report, options?: { includeCrossModelMatching?: boolean; includeGatewaySources?: boolean }) {
  return {
    reports: [{ workspace_id: workspace.id, report_id: report.id }],
    include_gateway_sources: options?.includeGatewaySources ?? false,
    include_cross_model_matching: options?.includeCrossModelMatching ?? false,
    report_definition_format: "PBIR",
    semantic_model_definition_format: "TMDL",
  };
}

/**
 * Explicit opt-in for evidence that costs real upstream API calls (a tenant
 * lineage scan, or gateway admin lookups). Always rendered off by default and
 * never enabled implicitly by navigation.
 */
function EvidenceOptionToggle({ title, text, label, checked, onChange }: {
  title: string;
  text: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return <div className="flex flex-wrap items-center justify-between gap-3 border-y border-zinc-200 bg-zinc-50 px-4 py-3">
    <div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-0.5 max-w-2xl text-xs leading-5 text-zinc-500">{text}</p>
    </div>
    <label className="flex shrink-0 items-center gap-2 text-sm font-medium text-zinc-700">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-teal-700" />
      {label}
    </label>
  </div>;
}

function ExplorerWarnings({ warnings }: { warnings: ExplorerEvidenceWarning[] }) {
  if (!warnings.length) return null;
  return <div className="space-y-1 border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{warnings.map((warning, index) => <p key={`${warning.code}-${index}`}>{warning.message}</p>)}</div>;
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
    const upstreamWorkspace = powerBiWorkspaceName(row.source_account);
    return {
      id: `${row.semantic_model_id}-${row.table_name ?? "unknown"}-${index}`,
      workspaceName: row.workspace_name,
      reportName: row.report_name,
      reportId: row.report_id,
      datasetId: row.semantic_model_id,
      origin: sourceOrigin(row.source_object_type, null, row.source_account),
      sourceAccount: upstreamWorkspace ? `Power BI workspace: ${upstreamWorkspace}` : row.source_account ?? absent,
      sourceDatabase: row.source_database ?? absent,
      sourceSchema: row.source_schema ?? absent,
      tableName: row.table_name ?? absent,
      sourceObjectType: row.source_object_type,
    };
  });
  return <div className="space-y-6">
    <SectionHeading icon={<Database className="size-5" />} title="Source database lineage" text="Every physical table, view, file, URL, or upstream model backing this report's semantic model, read directly from its partition query evidence. Tables whose origin could not be traced are listed as unresolved rather than hidden." />
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
        ]}
        emptyMessage="No source database tables were found for this report's semantic model."
        exportFileName={`${filePart(selectedReport?.name)}-source-db-lineage`}
        exportContext={makeExportContext(workspace, selectedReport)}
      />
    </>}
  </div>;
}

const CROSS_WORKSPACE_PROVIDER = "analysis_services";

/**
 * A DirectQuery dependency on another workspace's semantic model arrives as
 * `powerbi://api.powerbi.com/v1.0/myorg/<WORKSPACE NAME>`. That is not a
 * hostname — only the workspace segment means anything to a reader.
 */
function powerBiWorkspaceName(value: string | null | undefined): string | null {
  if (!value) return null;
  const marker = "/myorg/";
  const index = value.toLowerCase().indexOf(marker);
  if (index === -1 || !value.toLowerCase().startsWith("powerbi://")) return null;
  const segment = value.slice(index + marker.length).split("/")[0];
  return segment ? decodeURIComponent(segment) : null;
}

function isCrossWorkspaceSource(provider: string | null | undefined, serverOrAccount: string | null | undefined): boolean {
  return (provider ?? "").toLowerCase() === CROSS_WORKSPACE_PROVIDER || powerBiWorkspaceName(serverOrAccount) !== null;
}

/** Short, readable classification of where a table's data actually comes from. */
function sourceOrigin(objectType: string, provider?: string | null, serverOrAccount?: string | null): string {
  if (isCrossWorkspaceSource(provider, serverOrAccount)) return "Cross-workspace model";
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

function ExplorerError({ text }: { text: string }) {
  return <div className="border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">{text}</div>;
}

/**
 * Turns a failed query into the most accurate thing we can say about it: a 401
 * means the backend's in-memory session is gone (any backend restart does
 * this), a 403 means the identity is missing a scope or admin right, and
 * anything else keeps the backend's own message plus its request_id.
 */
function EvidenceError({ error, fallback }: { error: unknown; fallback: string }) {
  if (isSessionExpired(error)) {
    return <div className="border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
      Your Power BI session has expired or the backend restarted. <a href="/workspace/power-bi" className="font-semibold underline">Sign in again</a> to continue.
    </div>;
  }

  const apiError = error instanceof ApiError ? error : null;
  const message = isPermissionDenied(error)
    ? `${apiError?.message ?? "This request was denied."} The signed-in identity is missing a Power BI/Fabric scope or admin right for this operation.`
    : apiError?.message ?? fallback;

  return <div className="border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
    <p>{message}</p>
    {apiError?.requestId && <p className="mt-1 text-xs text-amber-800">Request ID: <code>{apiError.requestId}</code></p>}
  </div>;
}
