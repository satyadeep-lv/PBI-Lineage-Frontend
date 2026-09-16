import { FileSearch } from "lucide-react";

import type { PowerAiAudience, PowerAiEvidenceItem } from "~/stores/power-ai-store";

/** General/business users see readable labels only; developer mode also shows fields marked `technical`. */
export function EvidenceView({ evidence, audience }: { evidence: PowerAiEvidenceItem[]; audience: PowerAiAudience }) {
  const visible = evidence.filter((item) => audience === "developer" || !item.technical);
  if (!visible.length) return null;

  return (
    <div className="mt-2 border border-zinc-200 bg-zinc-50 p-2.5">
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-zinc-400">
        <FileSearch className="size-3" /> Evidence
      </p>
      <dl className="space-y-1">
        {visible.map((item, index) => (
          <div key={`${item.label}-${index}`} className="flex items-baseline justify-between gap-3 text-xs">
            <dt className="shrink-0 text-zinc-500">{item.label}</dt>
            <dd className="min-w-0 truncate text-right font-medium text-zinc-800" title={item.value}>{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
