import { useQuery } from "@tanstack/react-query";
import { FileBarChart2, GitBranch, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { AskPowerAiButton } from "~/components/power-ai/ask-power-ai-button";
import { PowerBiAuthRequired } from "~/components/workspace/auth-required";
import { DetailItem, type Report, type Workspace } from "~/components/workspace/evidence-ui";
import { ReportEvidence, type ReportBinding, type ReportSection } from "~/components/workspace/report-evidence";
import { estateDiscoveryKey, ESTATE_DISCOVER_PATH, requestJson } from "~/lib/lineage-api";
import { cn } from "~/lib/utils";
import { useAppStore } from "~/stores/app-store";
import { usePowerAiStore } from "~/stores/power-ai-store";

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

/** One report anywhere in the estate, already resolved to the workspace its semantic model actually lives in. */
type ReportChoice = {
  key: string;
  workspace: Workspace;
  report: Report;
  semanticModelId: string | null;
  semanticModelWorkspaceId: string | null;
  semanticModelName: string | null;
};

/**
 * The same report-level evidence Explorer shows, reached by report name alone.
 *
 * Explorer makes you pick a workspace first; this screen lists every accessible
 * report across every accessible workspace, including ones whose semantic model
 * lives somewhere else. Past that selection the two screens are the same five
 * views over the same endpoints — the granularity here is still exactly one
 * report.
 */
export function ReportLineage() {
  const apiOrigin = useAppStore((state) => state.apiOrigin);
  const [activeSection, setActiveSection] = useState<ReportSection>("report-detail");
  const [selectedKey, setSelectedKey] = useState("");

  const estateQuery = useQuery({
    queryKey: estateDiscoveryKey(apiOrigin),
    queryFn: () => requestJson<EstateResponse>(apiOrigin, ESTATE_DISCOVER_PATH),
  });
  const reportChoices = useMemo(() => buildReportChoices(estateQuery.data), [estateQuery.data]);
  const modelNames = useMemo(() => new Map(reportChoices.flatMap((choice) => (choice.semanticModelId && choice.semanticModelName ? [[choice.semanticModelId, choice.semanticModelName] as const] : []))), [reportChoices]);

  useEffect(() => {
    if (reportChoices.length && !reportChoices.some((choice) => choice.key === selectedKey)) setSelectedKey(reportChoices[0].key);
  }, [reportChoices, selectedKey]);

  const selectedReport = reportChoices.find((choice) => choice.key === selectedKey) ?? null;

  useEffect(() => {
    usePowerAiStore.getState().mergeContext({
      workspaceId: selectedReport?.workspace.id,
      workspaceName: selectedReport?.workspace.name,
      reportId: selectedReport?.report.id,
      reportName: selectedReport?.report.name,
      semanticModelId: selectedReport?.semanticModelId ?? undefined,
      semanticModelName: selectedReport?.semanticModelName ?? undefined,
      semanticModelWorkspaceId: selectedReport?.semanticModelWorkspaceId ?? undefined,
      objectType: selectedReport ? "report" : undefined,
      objectId: selectedReport?.report.id,
      objectName: selectedReport?.report.name,
    });
  }, [selectedReport]);

  if (estateQuery.isLoading) return <LoadingState label="Discovering reports across accessible workspaces" />;
  if (estateQuery.isError) return <PowerBiAuthRequired returnTo="Report lineage" />;
  if (!reportChoices.length) return <EmptyState title="No reports found" text="No accessible reports were returned by estate discovery." />;

  const binding: ReportBinding | null = selectedReport
    ? {
        workspace: selectedReport.workspace,
        report: selectedReport.report,
        semanticModelId: selectedReport.semanticModelId,
        semanticModelName: selectedReport.semanticModelName,
        semanticModelWorkspaceId: selectedReport.semanticModelWorkspaceId,
      }
    : null;

  return <section className="border border-zinc-200 bg-white">
    <div className="border-b border-zinc-200 px-5 py-5 sm:px-6">
      <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-start">
        <div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-[8px] bg-cyan-800 text-white"><GitBranch className="size-5" /></span><div><div className="mb-1 flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase text-cyan-800">Cross-workspace analysis</span><Badge className="rounded-[8px] border border-cyan-200 bg-cyan-50 text-cyan-900">Report focused</Badge></div><h1 className="text-lg font-semibold">Report lineage</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500">Select any accessible report by name — from any workspace — then work through its pages, source database tables, semantic objects, object mappings, and visual field lineage.</p></div></div>
        <div className="flex shrink-0 flex-col items-start gap-2 xl:items-end">
          <ReportSelector reports={reportChoices} selectedKey={selectedKey} onChange={setSelectedKey} />
          {selectedReport && (
            <AskPowerAiButton
              context={{
                workspaceId: selectedReport.workspace.id,
                workspaceName: selectedReport.workspace.name,
                reportId: selectedReport.report.id,
                reportName: selectedReport.report.name,
                semanticModelId: selectedReport.semanticModelId ?? undefined,
                semanticModelName: selectedReport.semanticModelName ?? undefined,
                semanticModelWorkspaceId: selectedReport.semanticModelWorkspaceId ?? undefined,
                objectType: "report",
                objectId: selectedReport.report.id,
                objectName: selectedReport.report.name,
              }}
              question="Explain this report"
            />
          )}
        </div>
      </div>
      {selectedReport && <div className="mt-5 grid border-y border-zinc-200 sm:grid-cols-4"><DetailItem label="Workspace" value={selectedReport.workspace.name} /><DetailItem label="Report" value={selectedReport.report.name} /><DetailItem label="Semantic model" value={selectedReport.semanticModelName ?? "Unresolved"} /><DetailItem label="Report type" value={selectedReport.report.report_type ?? "Not reported"} /></div>}
    </div>

    <div className="space-y-6 p-5 sm:p-6">
      {binding && <ReportEvidence binding={binding} modelNames={modelNames} activeSection={activeSection} onSectionChange={setActiveSection} />}
    </div>
  </section>;
}

function ReportSelector({ reports, selectedKey, onChange }: { reports: ReportChoice[]; selectedKey: string; onChange: (value: string) => void }) {
  const selected = reports.find((report) => report.key === selectedKey) ?? null;
  return <div className="w-full space-y-1.5 xl:max-w-md"><label htmlFor="report-lineage-report" className="text-xs font-semibold text-zinc-600">Report</label><select id="report-lineage-report" value={selectedKey} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-cyan-800 focus:ring-2 focus:ring-cyan-100"><option value="" disabled>Select a report</option>{reports.map((report) => <option key={report.key} value={report.key}>{report.report.name} - {report.workspace.name}</option>)}</select>{selected && <p className="break-all text-xs text-zinc-500">Selected report ID: <code className="text-zinc-700">{selected.report.id}</code></p>}</div>;
}

function LoadingState({ label }: { label: string }) { return <div className={cn("flex min-h-[560px] items-center justify-center gap-2 border border-zinc-200 bg-zinc-50 text-sm text-zinc-600")}><Loader2 className="size-4 animate-spin text-cyan-800" />{label}</div>; }
function EmptyState({ title, text }: { title: string; text: string }) { return <div className="flex min-h-[560px] items-center justify-center border border-zinc-200 bg-white p-6 text-center"><div><FileBarChart2 className="mx-auto size-8 text-zinc-300" /><h1 className="mt-4 text-lg font-semibold">{title}</h1><p className="mt-2 text-sm text-zinc-500">{text}</p></div></div>; }

/**
 * Resolves every discovered report to its bound model, preferring the estate
 * graph's own edge over the workspace-local model list — that edge is what
 * reports a model living in a different workspace than the report does.
 */
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
    return { key: `${inventory.workspace.id}:${report.id}`, workspace: inventory.workspace, report, semanticModelId, semanticModelWorkspaceId, semanticModelName: connectedModel?.name ?? localModel?.name ?? null };
  })).sort((first, second) => first.report.name.localeCompare(second.report.name) || first.workspace.name.localeCompare(second.workspace.name));
}
