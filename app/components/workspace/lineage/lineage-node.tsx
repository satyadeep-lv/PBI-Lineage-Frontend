import { Handle, Position, type NodeProps, type NodeTypes } from "@xyflow/react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { LINEAGE_NODE_WIDTH } from "./lineage-layout";
import type { LineageFlowNode, LineageNodeKind } from "./lineage-types";

export const KIND_STYLES: Record<LineageNodeKind, { border: string; background: string; accent: string }> = {
  workspace: { border: "#fda4af", background: "#fff1f2", accent: "#9f1239" },
  "database-source": { border: "#86efac", background: "#f0fdf4", accent: "#166534" },
  table: { border: "#7dd3fc", background: "#f0f9ff", accent: "#075985" },
  "semantic-model": { border: "#5eead4", background: "#f0fdfa", accent: "#115e59" },
  column: { border: "#bae6fd", background: "#f0f9ff", accent: "#0369a1" },
  "calculated-column": { border: "#fdba74", background: "#fff7ed", accent: "#9a3412" },
  "calculated-table": { border: "#fdba74", background: "#fff7ed", accent: "#9a3412" },
  measure: { border: "#c4b5fd", background: "#faf5ff", accent: "#6d28d9" },
  hierarchy: { border: "#d4d4d8", background: "#fafafa", accent: "#3f3f46" },
  report: { border: "#fda4af", background: "#fff1f2", accent: "#9f1239" },
  page: { border: "#fcd34d", background: "#fffbeb", accent: "#92400e" },
  visual: { border: "#d4d4d8", background: "#ffffff", accent: "#3f3f46" },
};

function abbreviate(value: string, length: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > length ? `${clean.slice(0, length - 3)}...` : clean;
}

function LineageNode({ id, data }: NodeProps<LineageFlowNode>) {
  const style = KIND_STYLES[data.kind];
  const [targetPosition, sourcePosition] = data.direction === "TB" ? [Position.Top, Position.Bottom] : [Position.Left, Position.Right];

  return (
    <div
      style={{ width: LINEAGE_NODE_WIDTH, border: `1px solid ${style.border}`, background: style.background, boxShadow: data.isFocal ? `0 0 0 2px ${style.accent}` : "none" }}
      className="relative rounded-md p-2.5"
    >
      <Handle type="target" position={targetPosition} />
      <div className="max-w-full text-left" title={`${data.label}\n${data.detail ?? ""}`}>
        <div className="break-words text-xs font-semibold" style={{ color: style.accent }}>{data.label}</div>
        {data.detail && <div className="mt-1 break-words text-[11px] leading-4 text-zinc-600">{abbreviate(data.detail, 130)}</div>}
      </div>
      {data.hasChildren && (
        <button
          type="button"
          className="nodrag nopan absolute -right-2 -top-2 flex h-5 items-center gap-0.5 rounded-full border border-zinc-300 bg-white px-1 text-[10px] text-zinc-700 shadow-sm hover:bg-zinc-50"
          onClick={(event) => { event.stopPropagation(); data.onToggle(id); }}
          aria-label={data.collapsed ? "Expand descendants" : "Collapse descendants"}
        >
          {data.collapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
          {data.collapsed && data.descendantCount > 0 && <span>{data.descendantCount}</span>}
        </button>
      )}
      <Handle type="source" position={sourcePosition} />
    </div>
  );
}

export const LINEAGE_NODE_TYPES: NodeTypes = { lineage: LineageNode };
