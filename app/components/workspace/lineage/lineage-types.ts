import type { Node } from "@xyflow/react";

export type LineageNodeKind =
  | "workspace"
  | "database-source"
  | "table"
  | "semantic-model"
  | "column"
  | "calculated-column"
  | "calculated-table"
  | "measure"
  | "hierarchy"
  | "report"
  | "page"
  | "visual";

export type LineageDirection = "LR" | "TB";
export type LineageVerticalFlow = "down" | "up";

export type LineageGraphNode = {
  id: string;
  kind: LineageNodeKind;
  label: string;
  detail?: string;
  tooltip?: string;
  isFocal?: boolean;
  metadata?: Record<string, unknown>;
};

export type LineageGraphEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
};

export type LineageGraph = {
  nodes: LineageGraphNode[];
  edges: LineageGraphEdge[];
};

export type LineageFlowNodeData = {
  kind: LineageNodeKind;
  label: string;
  detail?: string;
  tooltip?: string;
  isFocal: boolean;
  collapsed: boolean;
  hasChildren: boolean;
  descendantCount: number;
  height: number;
  direction: LineageDirection;
  verticalFlow: LineageVerticalFlow;
  onToggle: (id: string) => void;
  [key: string]: unknown;
};

export type LineageFlowNode = Node<LineageFlowNodeData, "lineage">;
