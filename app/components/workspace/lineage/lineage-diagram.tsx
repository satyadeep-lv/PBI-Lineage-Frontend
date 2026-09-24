import {
  Background,
  ControlButton,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { GitBranch, Loader2, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { cn } from "~/lib/utils";

import { estimateLineageNodeHeight, layoutWithElk, LINEAGE_NODE_WIDTH } from "./lineage-layout";
import { LINEAGE_NODE_TYPES } from "./lineage-node";
import type { LineageDirection, LineageFlowNode, LineageGraph, LineageNodeKind, LineageVerticalFlow } from "./lineage-types";

type CollapseDirection = "connected" | "upstream" | "downstream";

const FIT_VIEW_OPTIONS = { padding: 0.22, maxZoom: 1 } as const;
const VISIBLE_ELEMENT_NODE_THRESHOLD = 80;
const VISIBLE_ELEMENT_EDGE_THRESHOLD = 120;
const MAX_ANIMATED_EDGES = 300;
const LARGE_GRAPH_FIT_NODE_LIMIT = 24;

type DisplayTree = {
  roots: string[];
  childrenOf: Map<string, string[]>;
  descendantCount: Map<string, number>;
};

function buildDisplayTree(graph: LineageGraph, focusNodeId?: string, collapseDirection: CollapseDirection = "connected"): DisplayTree {
  const adjacency = new Map<string, Set<string>>();
  const ensure = (id: string) => {
    if (!adjacency.has(id)) adjacency.set(id, new Set());
    return adjacency.get(id)!;
  };
  graph.nodes.forEach((node) => ensure(node.id));
  graph.edges.forEach((edge) => {
    if (!adjacency.has(edge.source) || !adjacency.has(edge.target)) return;
    if (collapseDirection !== "upstream") ensure(edge.source).add(edge.target);
    if (collapseDirection !== "downstream") ensure(edge.target).add(edge.source);
  });

  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  graph.nodes.forEach((node) => inDegree.set(node.id, 0));
  graph.nodes.forEach((node) => outDegree.set(node.id, 0));
  graph.edges.forEach((edge) => {
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    outDegree.set(edge.source, (outDegree.get(edge.source) ?? 0) + 1);
  });

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
  else graph.nodes.forEach((node) => {
    const degree = collapseDirection === "upstream" ? outDegree.get(node.id) : inDegree.get(node.id);
    if ((degree ?? 0) === 0) seed(node.id);
  });
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
  verticalFlow?: LineageVerticalFlow;
  collapseDirection?: CollapseDirection;
  canvasClassName?: string;
  nodeSeparation?: number;
  rankSeparation?: number;
  animatedEdges?: boolean;
  edgeColor?: string;
  /** Node kinds that start collapsed (each shows a +N badge) whenever the graph changes; the user can expand them. */
  defaultCollapsedKinds?: LineageNodeKind[];
};

export function LineageDiagram({
  graph,
  direction,
  focusNodeId,
  title,
  description,
  emptyText,
  verticalFlow = "down",
  collapseDirection = "connected",
  canvasClassName,
  nodeSeparation,
  rankSeparation,
  animatedEdges = false,
  edgeColor = "var(--text-muted)",
  defaultCollapsedKinds,
}: LineageDiagramProps) {
  // Keyed by content, not array identity, so an inline array prop does not reset the user's expansions every render.
  const collapsedKindsKey = defaultCollapsedKinds?.join(",") ?? "";
  const initialCollapsed = useCallback(() => {
    const kinds = new Set(collapsedKindsKey.split(",").filter(Boolean));
    return new Set(graph.nodes.filter((node) => kinds.has(node.kind)).map((node) => node.id));
  }, [graph, collapsedKindsKey]);
  const [collapsed, setCollapsed] = useState<Set<string>>(initialCollapsed);
  useEffect(() => setCollapsed(initialCollapsed()), [initialCollapsed]);
  const toggle = useCallback((id: string) => setCollapsed((previous) => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);

  const tree = useMemo(
    () => buildDisplayTree(graph, focusNodeId, collapseDirection),
    [graph, focusNodeId, collapseDirection],
  );
  const visible = useMemo(() => visibleNodeIds(tree, collapsed), [tree, collapsed]);

  const { flowNodes, edges, layoutEdges } = useMemo(() => {
    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
    const nextNodes: LineageFlowNode[] = [...visible].flatMap((id) => {
      const source = nodeById.get(id);
      if (!source) return [];
      const height = estimateLineageNodeHeight(source.label, source.detail);
      const hasChildren = (tree.childrenOf.get(id) ?? []).length > 0;
      const isCollapsed = collapsed.has(id);
      const flowNode: LineageFlowNode = {
        id,
        type: "lineage",
        position: { x: 0, y: 0 },
        initialWidth: LINEAGE_NODE_WIDTH,
        initialHeight: height,
        ariaLabel: source.detail ? `${source.label}, ${source.detail}` : source.label,
        deletable: false,
        selectable: false,
        data: {
          kind: source.kind,
          label: source.label,
          detail: source.detail,
          tooltip: source.tooltip,
          isFocal: Boolean(source.isFocal || id === focusNodeId),
          collapsed: isCollapsed,
          hasChildren,
          descendantCount: tree.descendantCount.get(id) ?? 0,
          height,
          direction,
          verticalFlow,
          onToggle: toggle,
        },
      };
      return [flowNode];
    });

    const visibleEdges = graph.edges.filter((edge) => visible.has(edge.source) && visible.has(edge.target));
    const shouldAnimateEdges = animatedEdges && visibleEdges.length <= MAX_ANIMATED_EDGES;
    const nextEdges: Edge[] = visibleEdges
      .map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        type: "smoothstep",
        animated: shouldAnimateEdges,
        deletable: false,
        focusable: false,
        selectable: false,
        style: { stroke: edgeColor, strokeWidth: shouldAnimateEdges ? 1.6 : 1.3 },
        labelStyle: { fontSize: 10, fill: "var(--text-secondary)" },
        labelBgStyle: { fill: "var(--bg-surface)", fillOpacity: 0.94 },
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor, width: 16, height: 16 },
      }));

    const nextLayoutEdges = direction === "TB" && verticalFlow === "up"
      ? nextEdges.map((edge) => ({ ...edge, source: edge.target, target: edge.source }))
      : nextEdges;

    return { flowNodes: nextNodes, edges: nextEdges, layoutEdges: nextLayoutEdges };
  }, [graph, visible, tree, collapsed, direction, verticalFlow, focusNodeId, animatedEdges, edgeColor, toggle]);

  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      {(title || description) && (
        <div className="flex flex-col justify-between gap-2 border-b border-zinc-200 px-4 py-3 sm:flex-row sm:items-start">
          <div>
            {title && <h3 className="text-sm font-semibold">{title}</h3>}
            {description && <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500">{description}</p>}
          </div>
          <p className="shrink-0 text-xs text-zinc-500">{flowNodes.length} nodes · {edges.length} links</p>
        </div>
      )}
      <div className={cn("h-[620px] min-h-[440px] bg-zinc-50/40", canvasClassName)}>
        {flowNodes.length ? (
          <ReactFlowProvider>
            <LineageFlowCanvas
              ariaLabel={title ?? "Lineage graph"}
              direction={direction}
              edges={edges}
              flowNodes={flowNodes}
              layoutEdges={layoutEdges}
              nodeSeparation={nodeSeparation}
              rankSeparation={rankSeparation}
            />
          </ReactFlowProvider>
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

type LineageFlowCanvasProps = {
  ariaLabel: string;
  direction: LineageDirection;
  edges: Edge[];
  flowNodes: LineageFlowNode[];
  layoutEdges: Edge[];
  nodeSeparation?: number;
  rankSeparation?: number;
};

function LineageFlowCanvas({
  ariaLabel,
  direction,
  edges,
  flowNodes,
  layoutEdges,
  nodeSeparation,
  rankSeparation,
}: LineageFlowCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<LineageFlowNode>([]);
  const [renderedEdges, setRenderedEdges] = useState<Edge[]>([]);
  const [layoutRequest, setLayoutRequest] = useState(0);
  const [isLayouting, setIsLayouting] = useState(true);
  const { fitView } = useReactFlow<LineageFlowNode, Edge>();

  const resetLayout = useCallback(() => setLayoutRequest((request) => request + 1), []);

  useEffect(() => {
    let active = true;
    let animationFrame: number | undefined;
    setIsLayouting(true);

    void layoutWithElk(flowNodes, layoutEdges, direction, { node: nodeSeparation, rank: rankSeparation })
      .then((layoutedNodes) => {
        if (!active) return;
        setNodes(layoutedNodes);
        setRenderedEdges(edges);
        animationFrame = window.requestAnimationFrame(() => {
          if (!active) return;
          const nodesToFit = layoutedNodes.length > VISIBLE_ELEMENT_NODE_THRESHOLD
            ? layoutedNodes.slice(0, LARGE_GRAPH_FIT_NODE_LIMIT)
            : layoutedNodes;
          void fitView({
            ...FIT_VIEW_OPTIONS,
            duration: 180,
            nodes: nodesToFit.map((node) => ({ id: node.id })),
          }).finally(() => {
            if (active) setIsLayouting(false);
          });
        });
      });

    return () => {
      active = false;
      if (animationFrame !== undefined) window.cancelAnimationFrame(animationFrame);
    };
  }, [direction, edges, fitView, flowNodes, layoutEdges, layoutRequest, nodeSeparation, rankSeparation, setNodes]);

  const optimizeVisibleElements = flowNodes.length > VISIBLE_ELEMENT_NODE_THRESHOLD
    || edges.length > VISIBLE_ELEMENT_EDGE_THRESHOLD;

  return (
    <div className="relative h-full" aria-busy={isLayouting}>
      <ReactFlow
        aria-label={ariaLabel}
        nodes={nodes}
        edges={renderedEdges}
        onNodesChange={onNodesChange}
        nodeTypes={LINEAGE_NODE_TYPES}
        minZoom={0.08}
        maxZoom={1.8}
        nodesDraggable
        nodesConnectable={false}
        edgesReconnectable={false}
        elementsSelectable={false}
        deleteKeyCode={null}
        onlyRenderVisibleElements={optimizeVisibleElements}
        panOnDrag
        zoomOnScroll
        zoomOnDoubleClick={false}
      >
        <Background gap={18} size={1} color="var(--border-default)" />
        <Controls showInteractive={false}>
          <ControlButton
            aria-label="Reset automatic layout"
            disabled={isLayouting}
            onClick={resetLayout}
            title="Reset automatic layout"
          >
            <RotateCcw className="size-3.5" />
          </ControlButton>
        </Controls>
      </ReactFlow>
      {isLayouting && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/55" role="status" aria-label="Arranging lineage graph">
          <Loader2 className="size-5 animate-spin text-teal-700" />
        </div>
      )}
    </div>
  );
}
