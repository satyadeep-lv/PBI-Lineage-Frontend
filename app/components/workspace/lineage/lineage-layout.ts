import dagre from "@dagrejs/dagre";
import type { Edge } from "@xyflow/react";

import type { LineageDirection, LineageFlowNode } from "./lineage-types";

export const LINEAGE_NODE_WIDTH = 256;

export function estimateLineageNodeHeight(detail?: string) {
  if (!detail) return 60;
  const lines = Math.ceil(detail.length / 34);
  return Math.min(108, Math.max(64, 52 + lines * 18));
}

export function layoutWithDagre(
  nodes: LineageFlowNode[],
  edges: Edge[],
  direction: LineageDirection,
): LineageFlowNode[] {
  if (!nodes.length) return nodes;

  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: direction, nodesep: 28, ranksep: 96, marginx: 16, marginy: 16 });

  nodes.forEach((node) => {
    graph.setNode(node.id, { width: LINEAGE_NODE_WIDTH, height: node.data.height });
  });
  edges.forEach((edge) => {
    if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) graph.setEdge(edge.source, edge.target);
  });

  dagre.layout(graph);

  return nodes.map((node) => {
    const computed = graph.node(node.id);
    if (!computed) return node;
    return { ...node, position: { x: computed.x - LINEAGE_NODE_WIDTH / 2, y: computed.y - node.data.height / 2 } };
  });
}
