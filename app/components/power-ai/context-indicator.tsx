import { usePowerAiStore } from "~/stores/power-ai-store";

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

/** Lightweight, name-only context — never surfaces raw IDs to general/business users. */
export function ContextIndicator() {
  const context = usePowerAiStore((state) => state.context);
  const rows: Array<{ label: string; value: string }> = [];

  if (context.reportName) rows.push({ label: "Report", value: context.reportName });
  if (context.semanticModelName) rows.push({ label: "Semantic model", value: context.semanticModelName });
  if (!context.reportName && !context.semanticModelName && context.workspaceName) {
    rows.push({ label: "Workspace", value: context.workspaceName });
  }
  if (context.objectName && context.objectType) {
    rows.push({ label: OBJECT_TYPE_LABEL[context.objectType] ?? "Selected object", value: context.objectName });
  }

  if (!rows.length) return null;

  return (
    <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
      <p className="mb-1.5 text-[11px] font-semibold uppercase text-zinc-400">Current context</p>
      <dl className="space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 text-xs">
            <dt className="shrink-0 text-zinc-500">{row.label}</dt>
            <dd className="min-w-0 truncate font-medium text-zinc-900" title={row.value}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
