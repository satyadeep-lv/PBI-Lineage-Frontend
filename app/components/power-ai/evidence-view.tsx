import { FileSearch, Info, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";

import { cn } from "~/lib/utils";
import type { AiChatResponseStatus, EvidenceItem, GroundedClaim } from "~/lib/power-ai-api";
import { objectTypeLabel } from "~/lib/power-ai-entities";
import { COVERAGE_SECTION, definitionExpression, evidenceLine, groupBySection, isContextItem, isCoverageItem } from "~/lib/power-ai-evidence";
import type { PowerAiAudience } from "~/stores/power-ai-store";

const VERIFICATION_ICON: Record<EvidenceItem["verification_status"], { icon: typeof ShieldCheck; label: string; className: string }> = {
  verified: { icon: ShieldCheck, label: "Verified", className: "text-emerald-700" },
  partial: { icon: ShieldAlert, label: "Partial evidence", className: "text-amber-700" },
  unresolved: { icon: ShieldQuestion, label: "Unresolved", className: "text-zinc-400" },
};

const SOURCE_TYPE_LABEL: Record<EvidenceItem["source_type"], string> = {
  pbir: "Report definition (PBIR)",
  tmdl: "Semantic model definition (TMDL)",
  xmla: "Live model (XMLA)",
  scanner: "Admin scanner",
  lineage_graph: "Lineage graph",
  snowflake: "Snowflake",
  other: "Derived",
};

/** The evidence a Sources list shows: everything but the context line the answer already opens with. */
export function listedEvidence(evidence: EvidenceItem[]) {
  return evidence.filter((item) => !isContextItem(item));
}

/**
 * Renders exactly what the backend verified — never computes evidence
 * associations locally, never shows an LLM-generated confidence score. All
 * grouping below (answer sections, conflicting-evidence sides) is a pure
 * presentation transform over backend-supplied fields. Whoever shows it owns
 * the toggle, so it starts collapsed wherever it is used.
 */
export function EvidenceView({
  id,
  evidence,
  claims,
  status,
  audience,
}: {
  id?: string;
  evidence: EvidenceItem[];
  claims?: GroundedClaim[];
  status?: AiChatResponseStatus;
  audience: PowerAiAudience;
}) {
  const listed = listedEvidence(evidence);
  const citable = new Set(evidence.map((item) => item.evidence_id));
  if (!listed.length && !claims?.length) return null;

  return (
    <div id={id} className="space-y-2" data-testid="power-ai-sources">
      {Boolean(claims?.length) && (
        <div className="border border-zinc-200 bg-white p-2.5">
          <ul className="space-y-1 text-xs leading-5 text-zinc-700">
            {claims!.map((claim, index) => (
              <li key={index}>
                {claim.text}{" "}
                {claim.evidence_ids.filter((evidenceId) => citable.has(evidenceId)).map((evidenceId) => (
                  <span key={evidenceId} className="ml-0.5 font-mono text-[10px] text-violet-700">[{evidenceId}]</span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}

      {listed.length > 0 && (
        <div className="border border-zinc-200 bg-zinc-50 p-2.5">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-zinc-400">
            <FileSearch className="size-3" /> Evidence
          </p>
          {status === "conflicting_evidence" ? (
            <ConflictingEvidence items={listed} audience={audience} />
          ) : (
            <div className="space-y-3">
              {groupBySection(listed).map(({ section, items }) => (
                <EvidenceSectionList key={section.title} title={section.title} items={items} audience={audience} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Both sides of a conflict next to each other, one column per source, so Power AI never picks one. */
function ConflictingEvidence({ items, audience }: { items: EvidenceItem[]; audience: PowerAiAudience }) {
  const coverage = items.filter(isCoverageItem);
  const groups = groupBySourceType(items.filter((item) => !isCoverageItem(item)));
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map((group, groupIndex) => (
          <div key={group.title} className={cn(groupIndex === 0 && "sm:border-r sm:border-zinc-200 sm:pr-3")}>
            <p className="mb-1.5 text-[11px] font-semibold text-zinc-600">{group.title}</p>
            <ul className="space-y-2">
              {group.items.map((item) => <EvidenceRow key={item.evidence_id} item={item} audience={audience} />)}
            </ul>
          </div>
        ))}
      </div>
      {coverage.length > 0 && <EvidenceSectionList title={COVERAGE_SECTION.title} items={coverage} audience={audience} />}
    </div>
  );
}

function EvidenceSectionList({ title, items, audience }: { title: string; items: EvidenceItem[]; audience: PowerAiAudience }) {
  const coverage = title === COVERAGE_SECTION.title;
  return (
    <section>
      <h4 className="mb-1.5 text-[11px] font-semibold text-zinc-600">{title}</h4>
      <ul className="space-y-2">
        {items.map((item) => (coverage
          ? <CoverageRow key={item.evidence_id} item={item} />
          : <EvidenceRow key={item.evidence_id} item={item} audience={audience} />))}
      </ul>
    </section>
  );
}

/** Scope and gaps ("Visual impact was checked in 2 reports") — informational, not a verified fact about the object. */
function CoverageRow({ item }: { item: EvidenceItem }) {
  return (
    <li className="flex items-start gap-1.5 text-xs leading-5 text-zinc-600">
      <Info className="mt-1 size-3 shrink-0 text-zinc-400" />
      <span className="min-w-0">{evidenceLine(item)}</span>
    </li>
  );
}

function EvidenceRow({ item, audience }: { item: EvidenceItem; audience: PowerAiAudience }) {
  const verification = VERIFICATION_ICON[item.verification_status] ?? VERIFICATION_ICON.unresolved;
  const expression = definitionExpression(item);
  return (
    <li className="text-xs leading-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 font-mono text-[10px] text-zinc-400">[{item.evidence_id}]</span>
          <span className="min-w-0 truncate font-medium text-zinc-900" title={item.object_name}>{item.object_name}</span>
          <span className="shrink-0 text-zinc-400">· {objectTypeLabel(item.object_type)}</span>
        </div>
        <span className={cn("flex shrink-0 items-center gap-1", verification.className)} title={verification.label}>
          <verification.icon className="size-3.5" />
        </span>
      </div>
      <p className="mt-0.5 text-zinc-500">
        {capitalize(item.fact_type)} · {SOURCE_TYPE_LABEL[item.source_type] ?? item.source_type}
      </p>
      {item.display_value && <p className="mt-0.5 break-words text-zinc-700">{item.display_value}</p>}
      {expression && (
        <pre className="mt-1 overflow-x-auto rounded bg-zinc-900 px-2 py-1 font-mono text-[11px] text-zinc-100">{expression}</pre>
      )}
      {expression && item.plain_language && <p className="mt-1 text-zinc-600">{item.plain_language}</p>}
      {audience === "developer" && (
        <dl className="mt-1 space-y-0.5 text-[10px] text-zinc-400">
          {item.object_id && <div>object_id: <span className="font-mono">{item.object_id}</span></div>}
          {item.workspace_id && <div>workspace_id: <span className="font-mono">{item.workspace_id}</span></div>}
          {item.report_id && <div>report_id: <span className="font-mono">{item.report_id}</span></div>}
          {item.semantic_model_id && <div>semantic_model_id: <span className="font-mono">{item.semantic_model_id}</span></div>}
          {item.source_reference && <div>source_reference: <span className="font-mono">{item.source_reference}</span></div>}
        </dl>
      )}
    </li>
  );
}

function groupBySourceType(evidence: EvidenceItem[]) {
  const bySource = new Map<EvidenceItem["source_type"], EvidenceItem[]>();
  evidence.forEach((item) => {
    const list = bySource.get(item.source_type) ?? [];
    list.push(item);
    bySource.set(item.source_type, list);
  });
  return Array.from(bySource.entries()).map(([sourceType, items]) => ({ title: SOURCE_TYPE_LABEL[sourceType] ?? sourceType, items }));
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}
