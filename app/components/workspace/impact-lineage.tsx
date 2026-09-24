import { LineageDiagram } from "~/components/workspace/lineage/lineage-diagram";
import { KIND_STYLES } from "~/components/workspace/lineage/lineage-node";
import type { LineageGraph, LineageGraphEdge, LineageGraphNode, LineageNodeKind } from "~/components/workspace/lineage/lineage-types";
import { objectTypeToKind, referenceKey, referenceLabel, type DaxDependency, type DaxReference } from "~/lib/dependency-graph";
import { displayType, evidenceKey, type EvidenceIndex } from "~/lib/impact-analysis";
import { cn } from "~/lib/utils";

/** Beyond these, the graph keeps the most-used reports and visuals; the grids beside it always list everything. */
const MAX_GRAPH_REPORTS = 40;
const MAX_GRAPH_VISUALS = 120;
/** Reports open collapsed (with a +N visuals badge) so a wide fan-out of visuals does not shrink the whole graph. */
const COLLAPSED_KINDS: LineageNodeKind[] = ["report"];

export type ImpactGraphModel = { key: string; name: string; workspaceName: string };

/** One semantic model's slice of the impact: what is selected, what the DAX closure reached, and how reports use it. */
export type ImpactGraphScope = {
  model: ImpactGraphModel;
  /** The selected objects (a whole table's columns and measures, or one measure). */
  focal: DaxReference[];
  /** Objects the closure reached from the focal ones, upstream and/or downstream. */
  members: DaxReference[];
  dependencies: DaxDependency[];
  evidence: EvidenceIndex | undefined;
  /** Physical sources per semantic table name in this model. */
  tableSources: Map<string, string[]>;
  /** Selected semantic tables drawn as focal nodes (Table impact). */
  focalTables?: string[];
};

export type ReportName = { name: string; workspaceName: string };

const KIND_ORDER: Array<{ kind: LineageNodeKind; label: string }> = [
  { kind: "database-source", label: "Database table" },
  { kind: "semantic-model", label: "Semantic model" },
  { kind: "table", label: "Semantic table" },
  { kind: "column", label: "Column" },
  { kind: "calculated-column", label: "Calculated column" },
  { kind: "calculated-table", label: "Calculated table" },
  { kind: "measure", label: "Measure" },
  { kind: "report", label: "Report" },
  { kind: "visual", label: "Visual" },
];

/**
 * The impact chain as one directed graph: database tables and semantic models
 * feed semantic tables, tables hold columns and measures, DAX edges link those,
 * the objects a report reads point at it, and each report points at the
 * visuals that read them. Object ids are namespaced per model because DAX
 * reference keys are only unique within one model.
 */
export function buildImpactGraph(scopes: ImpactGraphScope[], reportNames: Map<string, ReportName>) {
  const nodes = new Map<string, LineageGraphNode>();
  const edges = new Map<string, LineageGraphEdge>();
  const addNode = (node: LineageGraphNode) => {
    const existing = nodes.get(node.id);
    nodes.set(node.id, existing ? { ...existing, isFocal: existing.isFocal || node.isFocal } : node);
    return node.id;
  };
  const addEdge = (source: string, target: string) => {
    if (source === target) return;
    const id = `${source}=>${target}`;
    if (!edges.has(id)) edges.set(id, { id, source, target });
  };

  type ReportUse = { objects: Set<string>; visuals: Set<string>; workspaceFallback?: string };
  const reportUses = new Map<string, ReportUse>();
  const visualInfo = new Map<string, { name: string; detail: string }>();

  scopes.forEach((scope) => {
    const { model } = scope;
    const modelNode = addNode({ id: `model|${model.key}`, kind: "semantic-model", label: model.name, detail: `Semantic model · ${model.workspaceName}` });
    const objectId = (reference: DaxReference) => `${model.key}|${referenceKey(reference)}`;
    const usage = (reference: DaxReference) => scope.evidence?.byObject.get(evidenceKey(reference.table_name, reference.object_name));

    // A focal object earns a node only if something depends on it or a report reads it.
    const memberKeys = new Set(scope.members.map(referenceKey));
    const focalKeys = new Set(scope.focal.map(referenceKey));
    const linked = new Set<string>();
    scope.dependencies.forEach((dependency) => {
      const source = referenceKey(dependency.source);
      const target = referenceKey(dependency.target);
      const sourceDrawn = memberKeys.has(source) || focalKeys.has(source);
      const targetDrawn = memberKeys.has(target) || focalKeys.has(target);
      if (sourceDrawn && targetDrawn) { linked.add(source); linked.add(target); }
    });
    const drawn = [
      ...scope.focal.filter((reference) => linked.has(referenceKey(reference)) || usage(reference)?.reportIds.size || scope.focal.length === 1),
      ...scope.members,
    ];
    const drawnKeys = new Set(drawn.map(referenceKey));

    const tableNode = (tableName: string) => {
      const id = addNode({
        id: `${model.key}|table|${tableName.toLocaleLowerCase()}`,
        kind: "table",
        label: tableName,
        detail: model.name,
        isFocal: scope.focalTables?.includes(tableName),
      });
      addEdge(modelNode, id);
      (scope.tableSources.get(tableName) ?? []).forEach((path) => {
        addEdge(addNode({ id: `db|${path.toLocaleUpperCase()}`, kind: "database-source", label: path, detail: "Database table" }), id);
      });
      return id;
    };
    scope.focalTables?.forEach(tableNode);

    drawn.forEach((reference) => {
      const id = addNode({
        id: objectId(reference),
        kind: objectTypeToKind(reference.object_type),
        label: referenceLabel(reference),
        detail: displayType(reference.object_type),
        isFocal: scope.focal.length === 1 && focalKeys.has(referenceKey(reference)),
      });
      if (reference.table_name) addEdge(tableNode(reference.table_name), id);
      usage(reference)?.reportIds.forEach((reportId) => {
        const use = reportUses.get(reportId) ?? { objects: new Set<string>(), visuals: new Set<string>(), workspaceFallback: model.workspaceName };
        use.objects.add(id);
        reportUses.set(reportId, use);
      });
      usage(reference)?.visualKeys.forEach((key) => {
        const visual = scope.evidence?.visuals.get(key);
        if (!visual) return;
        reportUses.get(visual.reportId)?.visuals.add(key);
        visualInfo.set(key, { name: visual.visualName, detail: `${visual.visualType} · ${visual.pageName}` });
      });
    });

    scope.dependencies.forEach((dependency) => {
      const source = referenceKey(dependency.source);
      const target = referenceKey(dependency.target);
      if (drawnKeys.has(source) && drawnKeys.has(target)) addEdge(objectId(dependency.source), objectId(dependency.target));
    });
  });

  const rankedReports = [...reportUses.entries()].sort((a, b) => b[1].visuals.size - a[1].visuals.size || b[1].objects.size - a[1].objects.size);
  const shownReports = rankedReports.slice(0, MAX_GRAPH_REPORTS);
  let visualBudget = MAX_GRAPH_VISUALS;
  let hiddenVisuals = 0;
  shownReports.forEach(([reportId, use]) => {
    const name = reportNames.get(reportId);
    const reportNode = addNode({
      id: `report|${reportId}`,
      kind: "report",
      label: name?.name ?? reportId,
      detail: `${name?.workspaceName ?? use.workspaceFallback ?? "Report"} · ${use.visuals.size} ${use.visuals.size === 1 ? "visual" : "visuals"}`,
    });
    use.objects.forEach((objectNode) => addEdge(objectNode, reportNode));
    [...use.visuals].forEach((key) => {
      if (visualBudget <= 0) { hiddenVisuals += 1; return; }
      visualBudget -= 1;
      const info = visualInfo.get(key);
      addEdge(reportNode, addNode({ id: `visual|${key}`, kind: "visual", label: info?.name ?? key, detail: info?.detail }));
    });
  });
  rankedReports.slice(MAX_GRAPH_REPORTS).forEach(([, use]) => { hiddenVisuals += use.visuals.size; });

  const graph: LineageGraph = { nodes: [...nodes.values()], edges: [...edges.values()] };
  return { graph, hiddenReports: Math.max(0, rankedReports.length - MAX_GRAPH_REPORTS), hiddenVisuals };
}

/**
 * The impact graph drawn exactly like the Snowflake table lineage: top-to-bottom,
 * animated flow edges in the app teal, a focal ring, per-node collapse along the
 * flow, draggable nodes, and automatic layout reset.
 */
export function ImpactLineageDiagram({ graph, focusNodeId, title, description, emptyText, hiddenReports = 0, hiddenVisuals = 0 }: {
  graph: LineageGraph;
  focusNodeId?: string;
  title: string;
  description: string;
  emptyText: string;
  hiddenReports?: number;
  hiddenVisuals?: number;
}) {
  const present = new Set(graph.nodes.map((node) => node.kind));
  const legend = KIND_ORDER.filter((entry) => present.has(entry.kind));
  const hidden = [
    hiddenReports ? `${hiddenReports} more ${hiddenReports === 1 ? "report" : "reports"}` : "",
    hiddenVisuals ? `${hiddenVisuals} more ${hiddenVisuals === 1 ? "visual" : "visuals"}` : "",
  ].filter(Boolean).join(", ");

  return <div className="space-y-2">
    <LineageDiagram
      graph={graph}
      direction="TB"
      verticalFlow="down"
      collapseDirection="downstream"
      focusNodeId={focusNodeId}
      title={title}
      description={description}
      emptyText={emptyText}
      canvasClassName="h-[760px] min-h-[520px]"
      nodeSeparation={20}
      rankSeparation={44}
      animatedEdges
      edgeColor="var(--fabric-primary)"
      defaultCollapsedKinds={COLLAPSED_KINDS}
    />
    {legend.length > 0 && <ul className="flex flex-wrap gap-1.5" aria-label="Graph legend">
      {legend.map((entry) => <li key={entry.kind} className={cn("rounded border px-2 py-0.5 text-[11px] font-medium", KIND_STYLES[entry.kind].container, KIND_STYLES[entry.kind].accent)}>{entry.label}</li>)}
    </ul>}
    {hidden && <p className="text-xs text-muted-foreground">
      The graph shows the most-used {MAX_GRAPH_REPORTS} reports and {MAX_GRAPH_VISUALS} visuals ({hidden} not drawn). The grids list every one.
    </p>}
  </div>;
}
