import { Background, Controls, MarkerType, ReactFlow, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { GitBranch } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { estimateLineageNodeHeight, layoutWithDagre } from "./lineage-layout";
import { LINEAGE_NODE_TYPES } from "./lineage-node";
import type { LineageDirection, LineageFlowNode, LineageGraph } from "./lineage-types";

type DisplayTree = {
  roots: string[];
  childrenOf: Map<string, string[]>;
  descendantCount: Map<string, number>;
};

function buildDisplayTree(graph: LineageGraph, focusNodeId?: string): DisplayTree {
  const adjacency = new Map<string, Set<string>>();
  const ensure = (id: string) => {
    if (!adjacency.has(id)) adjacency.set(id, new Set());
    return adjacency.get(id)!;
  };
  graph.nodes.forEach((node) => ensure(node.id));
  graph.edges.forEach((edge) => {
    if (!adjacency.has(edge.source) || !adjacency.has(edge.target)) return;
    ensure(edge.source).add(edge.target);
    ensure(edge.target).add(edge.source);
  });

  const inDegree = new Map<string, number>();
  graph.nodes.forEach((node) => inDegree.set(node.id, 0));
  graph.edges.forEach((edge) => inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1));

  const parent = new Map<string, string | null>();
  const childrenOf = new Map<string, string[]>();
  const order: string[] = [];
  const queue: string[] = [];

  function seed(id: string) {
    if (parent.has(id)) return;
    parent.set(id, null);
    queue.push(id);
  }

  function drainQueue() {
    while (queue.length) {
      const current = queue.shift()!;
      order.push(current);
      const kids: string[] = [];
      (adjacency.get(current) ?? new Set()).forEach((neighbor) => {
        if (!parent.has(neighbor)) {
          parent.set(neighbor, current);
          kids.push(neighbor);
          queue.push(neighbor);
        }
      });
      childrenOf.set(current, kids);
    }
  }

  if (focusNodeId && adjacency.has(focusNodeId)) seed(focusNodeId);
  else graph.nodes.forEach((node) => { if ((inDegree.get(node.id) ?? 0) === 0) seed(node.id); });
  drainQueue();

  // Disconnected components still need to render; seed any unreached node as its own root.
  graph.nodes.forEach((node) => seed(node.id));
  drainQueue();

  const descendantCount = new Map<string, number>();
  for (let index = order.length - 1; index >= 0; index -= 1) {
    const id = order[index];
    const kids = childrenOf.get(id) ?? [];
    const total = kids.reduce((sum, kid) => sum + 1 + (descendantCount.get(kid) ?? 0), 0);
    descendantCount.set(id, total);
  }

  const roots = [...parent.entries()].filter(([, value]) => value === null).map(([id]) => id);
  return { roots, childrenOf, descendantCount };
}

function visibleNodeIds(tree: DisplayTree, collapsed: Set<string>) {
  const visible = new Set<string>();
  const queue = [...tree.roots];
  while (queue.length) {
    const current = queue.shift()!;
    if (visible.has(current)) continue;
    visible.add(current);
    if (collapsed.has(current)) continue;
    (tree.childrenOf.get(current) ?? []).forEach((kid) => queue.push(kid));
  }
  return visible;
}

export type LineageDiagramProps = {
  graph: LineageGraph;
  direction: LineageDirection;
  focusNodeId?: string;
  title?: string;
  description?: string;
  emptyText: string;
};

export function LineageDiagram({ graph, direction, focusNodeId, title, description, emptyText }: LineageDiagramProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  useEffect(() => setCollapsed(new Set()), [graph]);
  const toggle = (id: string) => setCollapsed((previous) => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const tree = useMemo(() => buildDisplayTree(graph, focusNodeId), [graph, focusNodeId]);
  const visible = useMemo(() => visibleNodeIds(tree, collapsed), [tree, collapsed]);

  const { nodes, edges } = useMemo(() => {
    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
    const flowNodes: LineageFlowNode[] = [...visible].flatMap((id) => {
      const source = nodeById.get(id);
      if (!source) return [];
      const height = estimateLineageNodeHeight(source.detail);
      const hasChildren = (tree.childrenOf.get(id) ?? []).length > 0;
      const isCollapsed = collapsed.has(id);
      const flowNode: LineageFlowNode = {
        id,
        type: "lineage",
        position: { x: 0, y: 0 },
        data: {
          kind: source.kind,
          label: source.label,
          detail: source.detail,
          isFocal: Boolean(source.isFocal || id === focusNodeId),
          collapsed: isCollapsed,
          hasChildren,
          descendantCount: tree.descendantCount.get(id) ?? 0,
          height,
          direction,
          onToggle: toggle,
        },
      };
      return [flowNode];
    });

    const flowEdges: Edge[] = graph.edges
      .filter((edge) => visible.has(edge.source) && visible.has(edge.target))
      .map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        type: "smoothstep",
        style: { stroke: "#64748b", strokeWidth: 1.3 },
        labelStyle: { fontSize: 10, fill: "#475569" },
        labelBgStyle: { fill: "#ffffff", fillOpacity: 0.94 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#64748b", width: 16, height: 16 },
      }));

    return { nodes: layoutWithDagre(flowNodes, flowEdges, direction), edges: flowEdges };
  }, [graph, visible, tree, collapsed, direction, focusNodeId]);

  const graphKey = nodes.map((node) => node.id).join("|");

  return (
    <div className="border border-zinc-200 bg-white">
      {(title || description) && (
        <div className="flex flex-col justify-between gap-2 border-b border-zinc-200 px-4 py-3 sm:flex-row sm:items-start">
          <div>
            {title && <h3 className="text-sm font-semibold">{title}</h3>}
            {description && <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500">{description}</p>}
          </div>
          <p className="shrink-0 text-xs text-zinc-500">{nodes.length} nodes · {edges.length} links</p>
        </div>
      )}
      <div className="h-[620px] min-h-[440px] bg-zinc-50/40">
        {nodes.length ? (
          <ReactFlow
            key={graphKey}
            nodes={nodes}
            edges={edges}
            nodeTypes={LINEAGE_NODE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.22, maxZoom: 1 }}
            minZoom={0.08}
            maxZoom={1.8}
            nodesDraggable={false}
            nodesConnectable={false}
            zoomOnDoubleClick={false}
          >
            <Background gap={18} size={1} color="#d4d4d8" />
            <Controls showInteractive={false} />
          </ReactFlow>
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-zinc-500">
            <div>
              <GitBranch className="mx-auto size-7 text-zinc-300" />
              <p className="mt-3">{emptyText}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
