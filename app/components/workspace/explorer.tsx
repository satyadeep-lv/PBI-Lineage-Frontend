import { useQuery } from "@tanstack/react-query";
import {
  Boxes,
  FileBarChart2,
  Files,
  Layers3,
  Loader2,
  Network,
  Radar,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { PowerBiAuthRequired } from "~/components/workspace/auth-required";
import {
  AvailabilityNotice,
  ExplorerEmpty,
  ExplorerError,
  ExplorerGrid,
  ExplorerLoading,
  ExplorerMetric,
  filePart,
  makeExportContext,
  SectionHeading,
  type ExplorerGridRow,
  type ExportContext,
  type Report,
  type SemanticModel,
  type Workspace,
} from "~/components/workspace/evidence-ui";
import { ReportEvidence, type ReportBinding, type ReportSection } from "~/components/workspace/report-evidence";
import { requestJson, WORKSPACE_LIST_PATH, workspaceListKey } from "~/lib/lineage-api";
import { DEFAULT_SCAN_FLAGS, workspacePayload, type ScannerWorkspace } from "~/lib/scanner-api";
import { useWorkspaceScan } from "~/lib/use-workspace-scan";
import { cn } from "~/lib/utils";
import { useAppStore } from "~/stores/app-store";
import { usePowerAiStore } from "~/stores/power-ai-store";

type ExplorerTab = "assets" | "reports";

type WorkspaceResponse = { workspaces: Workspace[] };
type ReportsResponse = { reports: Report[] };
type SemanticModelsResponse = { semantic_models: SemanticModel[] };

const tabs: Array<{ id: ExplorerTab; label: string; shortLabel: string }> = [
  { id: "assets", label: "1. Reports, dashboards, apps, and access", shortLabel: "Assets & access" },
  { id: "reports", label: "2. Report-scoped evidence", shortLabel: "Reports" },
];

export function Explorer() {
  const apiOrigin = useAppStore((state) => state.apiOrigin);
  // Deep links from Overview (see explorerHref) seed only the first selection; the selectors own it after that.
  const [searchParams] = useSearchParams();
  const [requestedModelId, setRequestedModelId] = useState(() => searchParams.get("model") ?? "");
  const [activeTab, setActiveTab] = useState<ExplorerTab>(() => (searchParams.get("report") || searchParams.get("model") ? "reports" : "assets"));
  const [activeReportSection, setActiveReportSection] = useState<ReportSection>(() => (searchParams.get("model") ? "semantic-objects" : "report-detail"));
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(() => searchParams.get("workspace") ?? "");
  const [selectedReportId, setSelectedReportId] = useState(() => searchParams.get("report") ?? "");

  const workspacesQuery = useQuery({
    queryKey: workspaceListKey(apiOrigin),
    queryFn: () => requestJson<WorkspaceResponse>(apiOrigin, WORKSPACE_LIST_PATH),
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
      semanticModelWorkspaceId: undefined,
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
  });
  const semanticModelsQuery = useQuery({
    queryKey: ["explorer", "semantic-models", apiOrigin, selectedWorkspaceId],
    queryFn: () => requestJson<SemanticModelsResponse>(apiOrigin, `/api/v1/workspaces/${selectedWorkspaceId}/semantic-models`),
    enabled: Boolean(selectedWorkspaceId),
  });
  const reports = reportsQuery.data?.reports ?? [];
  const semanticModels = semanticModelsQuery.data?.semantic_models ?? [];
  const semanticModelNames = useMemo(() => new Map(semanticModels.map((model) => [model.id, model.name])), [semanticModels]);

  useEffect(() => {
    if (reports.length && !reports.some((report) => report.id === selectedReportId)) {
      setSelectedReportId(reports[0].id);
    }
  }, [reports, selectedReportId]);

  // A semantic-model deep link opens a report bound to that model, exactly like
  // picking the model in Assets & access; with no bound report it stays there.
  useEffect(() => {
    if (!requestedModelId || !reportsQuery.isSuccess) return;
    const boundReport = reports.find((report) => report.dataset_id === requestedModelId);
    if (boundReport) {
      setSelectedReportId(boundReport.id);
    } else {
      setActiveTab("assets");
      setActiveReportSection("report-detail");
    }
    setRequestedModelId("");
  }, [reports, reportsQuery.isSuccess, requestedModelId]);

  const selectedReport = reports.find((report) => report.id === selectedReportId) ?? null;
  const reportSemanticModel = selectedReport?.dataset_id
    ? semanticModels.find((model) => model.id === selectedReport.dataset_id) ?? null
    : null;
  // Explorer resolves the report's model from the workspace it was picked in;
  // `dataset_workspace_id` is the only reliable proof when that model actually
  // lives somewhere else.
  const binding: ReportBinding | null = selectedWorkspace && selectedReport
    ? {
        workspace: selectedWorkspace,
        report: selectedReport,
        semanticModelId: selectedReport.dataset_id ?? null,
        semanticModelName: reportSemanticModel?.name ?? null,
        semanticModelWorkspaceId: selectedReport.dataset_workspace_id ?? selectedWorkspace.id,
      }
    : null;

  if (workspacesQuery.isLoading) return <ExplorerLoading label="Loading Power BI workspaces" />;
  if (workspacesQuery.isError) return <PowerBiAuthRequired returnTo="Explorer" />;
  if (!workspaces.length) return <ExplorerEmpty title="No Power BI workspaces found" text="The authenticated account did not return any workspaces to explore." />;

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-5 py-5 sm:px-6">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-fabric text-primary-foreground"><Network className="size-5" /></span>
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase text-fabric">Power BI</span><Badge className="rounded-md border border-fabric/25 bg-accent text-accent-foreground">Name-based explorer</Badge></div>
              <h1 className="text-lg font-semibold">Explorer</h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500">Choose a workspace, review its assets, then pick a report to see its pages, source database tables, semantic objects, and visual field lineage.</p>
            </div>
          </div>
          <NameSelector id="explorer-workspace" label="Workspace" items={workspaces} selectedId={selectedWorkspaceId} onChange={setSelectedWorkspaceId} />
        </div>
        <div className="mt-5 grid grid-cols-2 divide-x divide-zinc-200 border-y border-zinc-200 sm:max-w-sm">
          <ExplorerMetric label="Reports" value={reports.length} icon={<FileBarChart2 className="size-4" />} />
          <ExplorerMetric label="Semantic models" value={semanticModels.length} icon={<Layers3 className="size-4" />} />
        </div>
      </div>

      <ExplorerGuidance />
      <div className="overflow-x-auto border-b border-border bg-subtle">
        <div className="flex min-w-max px-4 sm:px-6" role="tablist" aria-label="Explorer sections">
          {tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} className={cn("border-b-2 px-4 py-3 text-left text-sm transition-colors", activeTab === tab.id ? "border-fabric font-semibold text-fabric" : "border-transparent text-muted-foreground hover:text-foreground")} title={tab.label}>{tab.shortLabel}</button>)}
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {activeTab === "assets" && <AssetsAccessTab workspace={selectedWorkspace} reports={reports} semanticModels={semanticModels} isLoading={reportsQuery.isLoading || semanticModelsQuery.isLoading} error={reportsQuery.error ?? semanticModelsQuery.error} scan={scan} onReportSelect={(reportId) => { setSelectedReportId(reportId); setActiveReportSection("report-detail"); setActiveTab("reports"); }} onSemanticModelSelect={(modelId) => {
          const boundReport = reports.find((report) => report.dataset_id === modelId);
          if (!boundReport) return;
          setSelectedReportId(boundReport.id);
          setActiveReportSection("semantic-objects");
          setActiveTab("reports");
        }} />}
        {activeTab === "reports" && <div className="space-y-6">
          <ReportSelector reports={reports} selectedReport={selectedReport} onChange={setSelectedReportId} />
          {!binding
            ? <ExplorerEmpty title="No reports in this workspace" text="Choose another workspace, or check that the authenticated account can see this workspace's reports." />
            : <ReportEvidence binding={binding} modelNames={semanticModelNames} activeSection={activeReportSection} onSectionChange={setActiveReportSection} />}
        </div>}
      </div>
    </section>
  );
}

function ExplorerGuidance() {
  return <div className="grid border-b border-border bg-subtle md:grid-cols-3"><GuidanceStep number="1" title="Choose business context" text="Start with the workspace and report people recognize." /><GuidanceStep number="2" title="Pick a report" text="Everything in the Reports tab is scoped to the report selected there." /><GuidanceStep number="3" title="Trace evidence" text="Work through page details, source DB lineage, semantic objects, and report visuals." /></div>;
}

function GuidanceStep({ number, title, text }: { number: string; title: string; text: string }) {
  return <div className="flex gap-3 border-b border-border px-5 py-4 last:border-b-0 md:border-b-0 md:border-r md:px-6 md:last:border-r-0"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-fabric text-xs font-semibold text-primary-foreground">{number}</span><div><p className="text-sm font-semibold">{title}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{text}</p></div></div>;
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

function NameSelector({ id, label, items, selectedId, onChange }: { id: string; label: string; items: Array<{ id: string; name: string }>; selectedId: string; onChange: (id: string) => void }) {
  const selectedItem = items.find((item) => item.id === selectedId) ?? null;
  return <div className="w-full space-y-1.5 xl:max-w-sm"><label className="text-xs font-semibold text-zinc-600" htmlFor={id}>{label}</label><select id={id} value={selectedId} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"><option value="" disabled>Select a {label.toLowerCase()}</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{selectedItem && <p className="break-all text-xs text-zinc-500">Selected {label.toLowerCase()} ID: <code className="text-zinc-700">{selectedItem.id}</code></p>}</div>;
}

function ReportSelector({ reports, selectedReport, onChange }: { reports: Report[]; selectedReport: Report | null; onChange: (id: string) => void }) {
  return <NameSelector id="explorer-report" label="Report" items={reports} selectedId={selectedReport?.id ?? ""} onChange={onChange} />;
}
