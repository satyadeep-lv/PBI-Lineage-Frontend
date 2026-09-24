import type { Edge } from "@xyflow/react";
import type { ELK, ElkNode } from "elkjs/lib/elk-api.js";

import type { LineageDirection, LineageFlowNode } from "./lineage-types";

export const LINEAGE_NODE_WIDTH = 256;
let elkPromise: Promise<ELK> | undefined;

function loadElk() {
  if (!elkPromise) {
    elkPromise = Promise.all([
      import("elkjs/lib/elk-api.js"),
      import("elkjs/lib/elk-worker.min.js?worker"),
    ]).then(([{ default: ElkConstructor }, { default: ElkWorker }]) => new ElkConstructor({
      workerFactory: () => new ElkWorker(),
    })).catch((error: unknown) => {
      elkPromise = undefined;
      throw error;
    });
  }
  return elkPromise;
}

export function estimateLineageNodeHeight(label: string, detail?: string) {
  const labelLines = Math.min(4, Math.max(1, Math.ceil(label.length / 34)));
  const detailLines = detail ? Math.min(3, Math.max(1, Math.ceil(detail.length / 34))) : 0;
  return Math.min(132, Math.max(60, 28 + labelLines * 16 + (detailLines ? 8 + detailLines * 16 : 0)));
}

function fallbackLayeredLayout(
  nodes: LineageFlowNode[],
  edges: Edge[],
  direction: LineageDirection,
  spacing?: { node?: number; rank?: number },
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  const inDegree = new Map(nodes.map((node) => [node.id, 0]));
  const rank = new Map(nodes.map((node) => [node.id, 0]));

  edges.forEach((edge) => {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) return;
    outgoing.get(edge.source)!.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  });

  const queue = nodes.filter((node) => inDegree.get(node.id) === 0).map((node) => node.id);
  const visited = new Set<string>();
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    visited.add(current);
    (outgoing.get(current) ?? []).forEach((target) => {
      rank.set(target, Math.max(rank.get(target) ?? 0, (rank.get(current) ?? 0) + 1));
      const remaining = (inDegree.get(target) ?? 1) - 1;
      inDegree.set(target, remaining);
      if (remaining === 0) queue.push(target);
    });
  }

  const cycleRank = Math.max(0, ...rank.values()) + 1;
  nodes.forEach((node) => {
    if (!visited.has(node.id)) rank.set(node.id, cycleRank);
  });

  const layers = new Map<number, LineageFlowNode[]>();
  nodes.forEach((node) => {
    const nodeRank = rank.get(node.id) ?? 0;
    const layer = layers.get(nodeRank) ?? [];
    layer.push(node);
    layers.set(nodeRank, layer);
  });

  const orderedLayers = [...layers.entries()].sort(([left], [right]) => left - right).map(([, layer]) => layer);
  const nodeGap = spacing?.node ?? 28;
  const rankGap = spacing?.rank ?? 96;
  const positions = new Map<string, { x: number; y: number }>();

  if (direction === "TB") {
    const layerWidths = orderedLayers.map((layer) => layer.length * LINEAGE_NODE_WIDTH + Math.max(0, layer.length - 1) * nodeGap);
    const maxWidth = Math.max(...layerWidths);
    let y = 0;
    orderedLayers.forEach((layer, layerIndex) => {
      let x = (maxWidth - layerWidths[layerIndex]) / 2;
      layer.forEach((node) => {
        positions.set(node.id, { x, y });
        x += LINEAGE_NODE_WIDTH + nodeGap;
      });
      y += Math.max(...layer.map((node) => node.data.height)) + rankGap;
    });
  } else {
    const layerHeights = orderedLayers.map((layer) => layer.reduce((total, node) => total + node.data.height, 0) + Math.max(0, layer.length - 1) * nodeGap);
    const maxHeight = Math.max(...layerHeights);
    let x = 0;
    orderedLayers.forEach((layer, layerIndex) => {
      let y = (maxHeight - layerHeights[layerIndex]) / 2;
      layer.forEach((node) => {
        positions.set(node.id, { x, y });
        y += node.data.height + nodeGap;
      });
      x += LINEAGE_NODE_WIDTH + rankGap;
    });
  }

  return nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position }));
}

export async function layoutWithElk(
  nodes: LineageFlowNode[],
  edges: Edge[],
  direction: LineageDirection,
  spacing?: { node?: number; rank?: number },
): Promise<LineageFlowNode[]> {
  if (!nodes.length) return nodes;

  const nodeIds = new Set(nodes.map((node) => node.id));
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction === "LR" ? "RIGHT" : "DOWN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": String(spacing?.node ?? 28),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(spacing?.rank ?? 96),
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.padding": "[top=16,left=16,bottom=16,right=16]",
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: LINEAGE_NODE_WIDTH,
      height: node.data.height,
    })),
    edges: edges
      .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
      .map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
  };

  try {
    const elk = await loadElk();
    const layouted = await elk.layout(graph);
    const positions = new Map((layouted.children ?? []).map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]));
    return nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position }));
  } catch {
    return fallbackLayeredLayout(nodes, edges, direction, spacing);
  }
}
