import { AlertTriangle, CircleHelp, FileSearch, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";

import { cn } from "~/lib/utils";
import type { AiChatResponseStatus, EvidenceItem, GroundedClaim } from "~/lib/power-ai-api";
import type { PowerAiAudience } from "~/stores/power-ai-store";

const STATUS_BANNER: Partial<Record<AiChatResponseStatus, { icon: typeof AlertTriangle; label: string; tone: string }>> = {
  insufficient_evidence: { icon: CircleHelp, label: "Insufficient evidence to fully answer this", tone: "border-amber-200 bg-amber-50 text-amber-900" },
  ambiguous: { icon: ShieldQuestion, label: "This question is ambiguous — Power AI did not guess", tone: "border-amber-200 bg-amber-50 text-amber-900" },
  conflicting_evidence: { icon: ShieldAlert, label: "Conflicting evidence found — shown separately below", tone: "border-rose-200 bg-rose-50 text-rose-900" },
  out_of_scope: { icon: CircleHelp, label: "This is outside what Power AI can verify from lineage metadata", tone: "border-zinc-200 bg-zinc-50 text-zinc-700" },
};

const VERIFICATION_ICON: Record<EvidenceItem["verification_status"], { icon: typeof ShieldCheck; label: string; className: string }> = {
  verified: { icon: ShieldCheck, label: "Verified", className: "text-emerald-700" },
  partial: { icon: ShieldAlert, label: "Partial evidence", className: "text-amber-700" },
  unresolved: { icon: ShieldQuestion, label: "Unresolved", className: "text-zinc-400" },
};

const OBJECT_TYPE_LABEL: Record<string, string> = {
  report: "Report",
  visual: "Visual",
  semantic_model: "Semantic model",
  table: "Table",
  column: "Column",
  calculated_column: "Calculated column",
  measure: "Measure",
  source_object: "Source object",
};

const SOURCE_TYPE_LABEL: Record<EvidenceItem["source_type"], string> = {
  pbir: "Report definition (PBIR)",
  tmdl: "Semantic model definition (TMDL)",
  xmla: "Live model (XMLA)",
  scanner: "Admin scanner",
  lineage_graph: "Lineage graph",
  snowflake: "Snowflake",
};

/**
 * Renders exactly what the backend verified — never computes evidence
 * associations locally, never shows an LLM-generated confidence score. All
 * grouping below (claims -> [E#] markers, conflicting-evidence sides) is a
 * pure presentation transform over backend-supplied fields.
 */
export function EvidenceView({
  evidence,
  claims,
  status,
  audience,
}: {
  evidence: EvidenceItem[];
  claims?: GroundedClaim[];
  status?: AiChatResponseStatus;
  audience: PowerAiAudience;
}) {
  if (!evidence.length && !claims?.length && (!status || status === "answered")) return null;

  const banner = status ? STATUS_BANNER[status] : undefined;
  const labelByEvidenceId = new Map(evidence.map((item, index) => [item.evidence_id, `E${index + 1}`]));
  const conflicting = status === "conflicting_evidence";
  const groups = conflicting ? groupBySourceType(evidence) : [{ title: undefined, items: evidence }];

  return (
    <div className="mt-2 space-y-2">
      {banner && (
        <div className={cn("flex items-center gap-1.5 border px-2.5 py-1.5 text-xs font-medium", banner.tone)}>
          <banner.icon className="size-3.5 shrink-0" />
          {banner.label}
        </div>
      )}

      {Boolean(claims?.length) && (
        <div className="border border-zinc-200 bg-white p-2.5">
          <ul className="space-y-1 text-xs leading-5 text-zinc-700">
            {claims!.map((claim, index) => (
              <li key={index}>
                {claim.text}{" "}
                {claim.evidence_ids.map((id) => labelByEvidenceId.get(id)).filter(Boolean).map((label) => (
                  <span key={label} className="ml-0.5 font-mono text-[10px] text-violet-700">[{label}]</span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}

      {evidence.length > 0 && (
        <div className="border border-zinc-200 bg-zinc-50 p-2.5">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-zinc-400">
            <FileSearch className="size-3" /> Evidence
          </p>
          <div className={cn(conflicting && "grid gap-3 sm:grid-cols-2")}>
            {groups.map((group, groupIndex) => (
              <div key={groupIndex} className={cn(conflicting && groupIndex === 0 && "sm:border-r sm:border-zinc-200 sm:pr-3")}>
                {group.title && <p className="mb-1.5 text-[11px] font-semibold text-zinc-600">{group.title}</p>}
                <ul className="space-y-2">
                  {group.items.map((item) => (
                    <EvidenceRow key={item.evidence_id} item={item} label={labelByEvidenceId.get(item.evidence_id)} audience={audience} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EvidenceRow({ item, label, audience }: { item: EvidenceItem; label?: string; audience: PowerAiAudience }) {
  const verification = VERIFICATION_ICON[item.verification_status];
  return (
    <li className="text-xs leading-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {label && <span className="shrink-0 font-mono text-[10px] text-zinc-400">[{label}]</span>}
          <span className="min-w-0 truncate font-medium text-zinc-900" title={item.object_name}>{item.object_name}</span>
          <span className="shrink-0 text-zinc-400">· {OBJECT_TYPE_LABEL[item.object_type] ?? item.object_type}</span>
        </div>
        <span className={cn("flex shrink-0 items-center gap-1", verification.className)} title={verification.label}>
          <verification.icon className="size-3.5" />
        </span>
      </div>
      <p className="mt-0.5 text-zinc-500">
        {capitalize(item.fact_type)} · {SOURCE_TYPE_LABEL[item.source_type]}
      </p>
      {item.display_value && (
        <code className="mt-1 block overflow-x-auto whitespace-pre rounded bg-zinc-900 px-2 py-1 text-[11px] text-zinc-100">{item.display_value}</code>
      )}
      {audience === "developer" && (
        <dl className="mt-1 space-y-0.5 text-[10px] text-zinc-400">
          {item.object_id && <div>object_id: <span className="font-mono">{item.object_id}</span></div>}
          {item.workspace_id && <div>workspace_id: <span className="font-mono">{item.workspace_id}</span></div>}
          {item.report_id && <div>report_id: <span className="font-mono">{item.report_id}</span></div>}
          {item.semantic_model_id && <div>semantic_model_id: <span className="font-mono">{item.semantic_model_id}</span></div>}
        </dl>
      )}
    </li>
  );
}

function groupBySourceType(evidence: EvidenceItem[]) {
  const bySource = new Map<string, EvidenceItem[]>();
  evidence.forEach((item) => {
    const list = bySource.get(item.source_type) ?? [];
    list.push(item);
    bySource.set(item.source_type, list);
  });
  return Array.from(bySource.entries()).map(([sourceType, items]) => ({ title: SOURCE_TYPE_LABEL[sourceType as EvidenceItem["source_type"]], items }));
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}
