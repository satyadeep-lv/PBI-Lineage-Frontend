import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Calculator, CheckCircle2, Columns3, Copy, Database, GitBranch, Loader2, Network } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

type ReportChoice = {
  workspaceId: string;
  workspaceName: string;
  report: { id: string; name: string };
  semanticModelId: string | null;
  semanticModelWorkspaceId: string | null;
  semanticModelName: string | null;
};
type SourceRow = { semantic_table: string; source_id: string; source_provider: string; source_object_type: string; source_fully_qualified_name: string };
type SemanticObjectRow = { semantic_table: string; semantic_object_type: string; semantic_object_name: string; semantic_data_type?: string | null; semantic_source_column?: string | null; semantic_dax_expression?: string | null; source_path?: string | null };
type MeasureSourceRow = { semantic_table?: string | null; semantic_object_type: string; semantic_object_name: string; semantic_dax_expression?: string | null; source_semantic_table?: string | null; source_semantic_object_type?: string | null; source_semantic_object_name?: string | null; source_column_name?: string | null; dependency_depth?: number | null; is_direct_dependency?: boolean | null };
type ReportLayoutRow = { page_id: string; page_name: string; page_order?: number | null; visual_id: string; visual_name: string; visual_type?: string | null; table_name?: string | null; column_measure_name?: string | null };
type VisualSourceRow = { page_id: string; page_name: string; visual_id: string; visual_name: string; visual_type?: string | null; semantic_table?: string | null };
type ExplorerSnapshot = {
  source_database_lineage: { rows: SourceRow[]; count: number };
  semantic_model_objects: { rows: SemanticObjectRow[]; count: number };
  measure_source_lineage: { rows: MeasureSourceRow[]; count: number };
  report_layout: { rows: ReportLayoutRow[]; count: number };
  visual_source_lookup: { rows: VisualSourceRow[]; count: number };
};
type ParsedColumn = { name: string; source_path?: string | null; source_column?: string | null; data_type?: string | null; expression?: string | null };
type ParsedTable = { name: string; source_path?: string | null; expression?: string | null; columns: ParsedColumn[]; measures: Array<{ name: string; expression?: string | null }> };
type ParsedSemanticModel = { tables: ParsedTable[] };
type DaxReference = { object_type: string; table_name?: string | null; object_name: string; qualified_name: string };
type DaxDependency = { source: DaxReference; target: DaxReference; reference_text: string };
type DaxAnalysis = { dependencies: DaxDependency[]; dependency_count: number };
type LineageMode = "report" | "column" | "calculation";
type LineageGraph = { nodes: Node[]; edges: Edge[] };
type LineageObject = { key: string; table: string; name: string; objectType: string; expression: string | null; sourceColumn: string | null; sourcePath: string | null; dataType: string | null };
type SelectOption = { value: string; label: string };

const SUMMARY_SCOPE = "__report_summary__";
const modeOptions: Array<{ id: LineageMode; label: string; icon: typeof GitBranch }> = [
  { id: "report", label: "Report & database", icon: Network },
  { id: "column", label: "Column lineage", icon: Columns3 },
  { id: "calculation", label: "Measure & calculated column", icon: Calculator },
];

export function ReportLineageDiagrams({ report, snapshot, parsed, dax, exactLineageLoading, exactLineageError }: {
  report: ReportChoice;
  snapshot: ExplorerSnapshot;
  parsed: ParsedSemanticModel | undefined;
  dax: DaxAnalysis | undefined;
  exactLineageLoading: boolean;
  exactLineageError: boolean;
}) {
  const [mode, setMode] = useState<LineageMode>("report");

  return <div className="space-y-5">
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-cyan-800"><GitBranch className="size-5" /></span>
      <div><h2 className="text-base font-semibold">Lineage diagrams</h2><p className="mt-1 text-sm leading-6 text-zinc-500">Trace the selected report from physical database evidence through its semantic model, calculations, pages, and visuals.</p></div>
    </div>

    <div className="overflow-x-auto border-y border-zinc-200 bg-zinc-50 p-1">
      <div className="flex min-w-max" role="tablist" aria-label="Lineage diagram type">
        {modeOptions.map((option) => {
          const Icon = option.icon;
          return <button key={option.id} type="button" role="tab" aria-selected={mode === option.id} onClick={() => setMode(option.id)} className={cn("inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm", mode === option.id ? "bg-white font-semibold text-cyan-900 shadow-sm ring-1 ring-zinc-200" : "text-zinc-600 hover:text-zinc-950")}><Icon className="size-4" />{option.label}</button>;
        })}
      </div>
    </div>

    {mode !== "report" && <ExactLineageStatus loading={exactLineageLoading} error={exactLineageError} dax={dax} hasModel={Boolean(report.semanticModelId && report.semanticModelWorkspaceId)} />}
    {mode === "report" && <ReportDatabaseLineage report={report} snapshot={snapshot} />}
    {mode === "column" && <ColumnLineage snapshot={snapshot} parsed={parsed} dax={dax} />}
    {mode === "calculation" && <CalculationLineage snapshot={snapshot} parsed={parsed} dax={dax} />}
  </div>;
}

function ExactLineageStatus({ loading, error, dax, hasModel }: { loading: boolean; error: boolean; dax: DaxAnalysis | undefined; hasModel: boolean }) {
  if (!hasModel) return <StatusBand tone="warning" text="The report's semantic model binding could not be resolved. Snapshot source mappings remain available." />;
  if (loading) return <div className="flex items-center gap-2 border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900"><Loader2 className="size-3.5 animate-spin" />Preparing exact DAX dependencies in the background</div>;
  if (error) return <StatusBand tone="warning" text="Exact DAX analysis is unavailable for this identity. The diagram is using the report snapshot's source evidence." />;
  if (dax) return <StatusBand tone="success" text={`${dax.dependency_count} exact DAX ${dax.dependency_count === 1 ? "relationship" : "relationships"} ready`} />;
  return null;
}

function ReportDatabaseLineage({ report, snapshot }: { report: ReportChoice; snapshot: ExplorerSnapshot }) {
  const pages = useMemo(() => uniquePages(snapshot.report_layout.rows), [snapshot.report_layout.rows]);
  const [pageScope, setPageScope] = useState(SUMMARY_SCOPE);
  useEffect(() => {
    if (pageScope !== SUMMARY_SCOPE && !pages.some((page) => page.value === pageScope)) setPageScope(SUMMARY_SCOPE);
  }, [pageScope, pages]);
  const graph = useMemo(() => buildReportGraph(report, snapshot, pageScope), [pageScope, report, snapshot]);
  const selectedPage = pages.find((page) => page.value === pageScope)?.label;

  return <div className="space-y-4">
    <div className="grid gap-4 border-y border-zinc-200 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <LineageSelect id="report-lineage-page" label="Diagram scope" value={pageScope} options={[{ value: SUMMARY_SCOPE, label: "Whole report summary" }, ...pages]} onChange={setPageScope} />
      <div className="grid grid-cols-3 border border-zinc-200 bg-zinc-50"><Metric label="Database objects" value={snapshot.source_database_lineage.count} /><Metric label="Semantic objects" value={snapshot.semantic_model_objects.count} /><Metric label={pageScope === SUMMARY_SCOPE ? "Report pages" : "Page visuals"} value={pageScope === SUMMARY_SCOPE ? pages.length : uniqueVisuals(snapshot.report_layout.rows.filter((row) => row.page_id === pageScope)).length} /></div>
    </div>
    <LineageCanvas title={selectedPage ? `${selectedPage} lineage` : `${report.report.name} lineage`} description={selectedPage ? "Physical sources and semantic tables used by the selected report page, followed by its visual objects." : "Physical database objects flow into semantic tables, the linked model, the report, and its pages."} graph={graph} emptyText="No report lineage evidence was returned." />
  </div>;
}

function ColumnLineage({ snapshot, parsed, dax }: { snapshot: ExplorerSnapshot; parsed: ParsedSemanticModel | undefined; dax: DaxAnalysis | undefined }) {
  const objects = useMemo(() => collectSemanticObjects(snapshot, parsed), [parsed, snapshot]);
  const columns = useMemo(() => objects.filter((object) => isColumnType(object.objectType)), [objects]);
  const tableNames = useMemo(() => uniqueStrings(columns.map((column) => column.table)), [columns]);
  const [tableName, setTableName] = useState("");
  const [columnKey, setColumnKey] = useState("");
  const [depth, setDepth] = useState(3);

  useEffect(() => {
    if (!tableNames.includes(tableName)) setTableName(tableNames[0] ?? "");
  }, [tableName, tableNames]);
  const tableColumns = columns.filter((column) => column.table === tableName);
  useEffect(() => {
    if (!tableColumns.some((column) => column.key === columnKey)) setColumnKey(tableColumns[0]?.key ?? "");
  }, [columnKey, tableColumns]);
  const selected = tableColumns.find((column) => column.key === columnKey) ?? null;
  const graph = useMemo(() => selected ? buildColumnGraph(snapshot, parsed, dax, selected, depth) : emptyGraph(), [dax, depth, parsed, selected, snapshot]);

  if (!columns.length) return <EmptyDiagram text="No semantic columns were returned for this report." />;
  return <div className="space-y-4">
    <div className="grid gap-4 border-y border-zinc-200 py-4 md:grid-cols-3">
      <LineageSelect id="column-lineage-table" label="Semantic table" value={tableName} options={tableNames.map(asOption)} onChange={setTableName} />
      <LineageSelect id="column-lineage-column" label="Column" value={columnKey} options={tableColumns.map((column) => ({ value: column.key, label: `${column.name}${canonicalType(column.objectType) === "calculated_column" ? " (calculated)" : ""}` }))} onChange={setColumnKey} />
      <DepthSelect id="column-lineage-depth" value={depth} onChange={setDepth} />
    </div>
    {selected && <ObjectEvidence object={selected} />}
    <LineageCanvas title="Column-level lineage" description={selected ? `${selected.table}[${selected.name}] from database source evidence through calculations that use this column.` : "Column lineage"} graph={graph} emptyText="No lineage relationships were found for the selected column." />
  </div>;
}

function CalculationLineage({ snapshot, parsed, dax }: { snapshot: ExplorerSnapshot; parsed: ParsedSemanticModel | undefined; dax: DaxAnalysis | undefined }) {
  const objects = useMemo(() => collectSemanticObjects(snapshot, parsed), [parsed, snapshot]);
  const calculations = useMemo(() => objects.filter((object) => isCalculationType(object.objectType)), [objects]);
  const tableNames = useMemo(() => uniqueStrings(calculations.map((object) => object.table)), [calculations]);
  const [tableName, setTableName] = useState("");
  const [targetKey, setTargetKey] = useState("");
  const [depth, setDepth] = useState(3);

  useEffect(() => {
    if (!tableNames.includes(tableName)) setTableName(tableNames[0] ?? "");
  }, [tableName, tableNames]);
  const tableCalculations = calculations.filter((object) => object.table === tableName);
  useEffect(() => {
    if (!tableCalculations.some((object) => object.key === targetKey)) setTargetKey(tableCalculations[0]?.key ?? "");
  }, [tableCalculations, targetKey]);
  const selected = tableCalculations.find((object) => object.key === targetKey) ?? null;
  const graph = useMemo(() => selected ? buildCalculationGraph(snapshot, parsed, dax, selected, depth) : emptyGraph(), [dax, depth, parsed, selected, snapshot]);

  if (!calculations.length) return <EmptyDiagram text="No measures or calculated columns were returned for this report." />;
  return <div className="space-y-4">
    <div className="grid gap-4 border-y border-zinc-200 py-4 md:grid-cols-3">
      <LineageSelect id="calculation-lineage-table" label="Semantic table" value={tableName} options={tableNames.map(asOption)} onChange={setTableName} />
      <LineageSelect id="calculation-lineage-target" label="Target calculation" value={targetKey} options={tableCalculations.map((object) => ({ value: object.key, label: `${object.name} (${displayType(object.objectType)})` }))} onChange={setTargetKey} />
      <DepthSelect id="calculation-lineage-depth" value={depth} onChange={setDepth} />
    </div>
    {selected && <ObjectEvidence object={selected} />}
    <LineageCanvas title={`${selected ? displayType(selected.objectType) : "Calculation"} lineage`} description={selected ? `${selected.table}[${selected.name}] is the focal calculation. Inputs flow in from the left; dependent calculations flow out to the right.` : "Calculation lineage"} graph={graph} emptyText="No DAX dependencies were found for the selected calculation." />
  </div>;
}

function ObjectEvidence({ object }: { object: LineageObject }) {
  const [copied, setCopied] = useState(false);
  const hasExpression = Boolean(object.expression?.trim());
  const evidence = object.expression?.trim() || object.sourcePath || object.sourceColumn || "No source expression is declared for this object.";
  async function copyExpression() {
    await copyText(evidence);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }
  return <div className="border border-zinc-200 bg-zinc-50">
    <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-semibold" title={`${object.table}[${object.name}]`}>{object.table}[{object.name}]</p><p className="mt-0.5 text-xs text-zinc-500">{displayType(object.objectType)}{object.sourceColumn ? ` · source column ${object.sourceColumn}` : ""}</p></div><Button type="button" variant="outline" size="sm" onClick={() => void copyExpression()}>{copied ? <CheckCircle2 className="size-3.5 text-emerald-700" /> : <Copy className="size-3.5" />}{copied ? "Copied" : hasExpression ? "Copy DAX" : "Copy source"}</Button></div>
    <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-5 text-zinc-700">{evidence}</pre>
  </div>;
}

function LineageCanvas({ title, description, graph, emptyText }: { title: string; description: string; graph: LineageGraph; emptyText: string }) {
  const graphKey = graph.nodes.map((node) => node.id).join("|");
  return <div className="border border-zinc-200 bg-white"><div className="flex flex-col justify-between gap-2 border-b border-zinc-200 px-4 py-3 sm:flex-row sm:items-start"><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500">{description}</p></div><p className="shrink-0 text-xs text-zinc-500">{graph.nodes.length} nodes · {graph.edges.length} links</p></div><div className="h-[620px] min-h-[440px] bg-zinc-50/40">{graph.nodes.length ? <ReactFlow key={graphKey} nodes={graph.nodes} edges={graph.edges} fitView fitViewOptions={{ padding: 0.22, maxZoom: 1 }} minZoom={0.08} maxZoom={1.8} nodesDraggable={false} nodesConnectable={false} zoomOnDoubleClick={false} defaultEdgeOptions={{ type: "smoothstep" }}><Background gap={18} size={1} color="#d4d4d8" /><Controls showInteractive={false} /></ReactFlow> : <div className="flex h-full items-center justify-center p-6 text-center text-sm text-zinc-500">{emptyText}</div>}</div></div>;
}

function LineageSelect({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: SelectOption[]; onChange: (value: string) => void }) {
  return <div className="min-w-0 space-y-1.5"><label className="text-xs font-semibold text-zinc-600" htmlFor={id}>{label}</label><select id={id} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-cyan-800 focus:ring-2 focus:ring-cyan-100">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
}

function DepthSelect({ id, value, onChange }: { id: string; value: number; onChange: (value: number) => void }) {
  return <div className="space-y-1.5"><label className="text-xs font-semibold text-zinc-600" htmlFor={id}>Lineage depth</label><select id={id} value={value} onChange={(event) => onChange(Number(event.target.value))} className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-cyan-800 focus:ring-2 focus:ring-cyan-100">{[1, 2, 3, 4, 5, 6].map((item) => <option key={item} value={item}>{item} {item === 1 ? "level" : "levels"}</option>)}</select></div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="min-w-0 border-r border-zinc-200 px-3 py-2 last:border-r-0"><p className="truncate text-[11px] text-zinc-500">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>; }
function EmptyDiagram({ text }: { text: string }) { return <div className="flex min-h-[440px] items-center justify-center border border-zinc-200 bg-zinc-50 p-6 text-center"><div><GitBranch className="mx-auto size-7 text-zinc-300" /><p className="mt-3 text-sm text-zinc-500">{text}</p></div></div>; }
function StatusBand({ tone, text }: { tone: "success" | "warning"; text: string }) { return <div className={cn("border px-3 py-2 text-xs", tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900")}>{text}</div>; }

function buildReportGraph(report: ReportChoice, snapshot: ExplorerSnapshot, pageScope: string): LineageGraph {
  const selectedPage = pageScope === SUMMARY_SCOPE ? null : pageScope;
  const pageLayout = selectedPage ? snapshot.report_layout.rows.filter((row) => row.page_id === selectedPage) : snapshot.report_layout.rows;
  const pageMappings = selectedPage ? snapshot.visual_source_lookup.rows.filter((row) => row.page_id === selectedPage) : snapshot.visual_source_lookup.rows;
  const usedTables = new Set(pageMappings.map((row) => row.semantic_table).filter((value): value is string => Boolean(value)));
  pageLayout.forEach((row) => { if (row.table_name) usedTables.add(row.table_name); });
  const tableNames = uniqueStrings((usedTables.size ? [...usedTables] : snapshot.source_database_lineage.rows.map((row) => row.semantic_table)).filter(Boolean));
  const sourceRows = snapshot.source_database_lineage.rows.filter((row) => !tableNames.length || tableNames.includes(row.semantic_table));
  const sources = uniqueBy(sourceRows, (row) => row.source_id);
  const pages = selectedPage ? uniquePages(pageLayout) : uniquePages(snapshot.report_layout.rows);
  const visuals = selectedPage ? uniqueVisuals(pageLayout) : [];
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const sourceIds = new Map<string, string>();
  const tableIds = new Map<string, string>();

  const sourcePositions = verticalPositions(sources.map((row) => row.source_id), 0);
  sources.forEach((source) => {
    const id = `database-${lineageId(source.source_id)}`;
    sourceIds.set(source.source_id, id);
    nodes.push(lineageNode(id, source.source_fully_qualified_name, `${source.source_provider} · ${source.source_object_type}`, sourcePositions.get(source.source_id)!, "database"));
  });
  const tablePositions = verticalPositions(tableNames, 330);
  tableNames.forEach((table) => {
    const id = `table-${lineageId(table)}`;
    tableIds.set(table, id);
    const objectCount = snapshot.semantic_model_objects.rows.filter((row) => row.semantic_table === table).length;
    nodes.push(lineageNode(id, table, `${objectCount} semantic ${objectCount === 1 ? "object" : "objects"}`, tablePositions.get(table)!, "semantic"));
  });
  sourceRows.forEach((row, index) => {
    const source = sourceIds.get(row.source_id);
    const target = tableIds.get(row.semantic_table);
    if (source && target) edges.push(lineageEdge(`source-table-${index}`, source, target, "feeds"));
  });

  const modelId = "selected-semantic-model";
  const reportId = "selected-report";
  nodes.push(lineageNode(modelId, report.semanticModelName ?? "Linked semantic model", report.semanticModelId ?? "Model ID unresolved", { x: 660, y: 220 }, "model"));
  nodes.push(lineageNode(reportId, report.report.name, report.workspaceName, { x: 990, y: 220 }, "report"));
  tableIds.forEach((id, table) => edges.push(lineageEdge(`table-model-${lineageId(table)}`, id, modelId, "belongs to")));
  edges.push(lineageEdge("model-report", modelId, reportId, "powers"));

  const pagePositions = verticalPositions(pages.map((page) => page.value), 1320);
  pages.forEach((page) => {
    const id = `page-${lineageId(page.value)}`;
    const visualCount = uniqueVisuals(snapshot.report_layout.rows.filter((row) => row.page_id === page.value)).length;
    nodes.push(lineageNode(id, page.label, `${visualCount} ${visualCount === 1 ? "visual" : "visuals"}`, pagePositions.get(page.value)!, "page"));
    edges.push(lineageEdge(`report-page-${lineageId(page.value)}`, reportId, id, "contains"));
  });
  if (selectedPage) {
    const visualPositions = verticalPositions(visuals.map((visual) => visual.value), 1650);
    visuals.forEach((visual) => {
      const id = `visual-${lineageId(visual.value)}`;
      const rows = pageLayout.filter((row) => `${row.page_id}:${row.visual_id}` === visual.value);
      const type = rows.find((row) => row.visual_type)?.visual_type ?? "Visual";
      const fields = uniqueStrings(rows.map((row) => row.column_measure_name).filter((value): value is string => Boolean(value)));
      nodes.push(lineageNode(id, visual.label, `${type} · ${fields.length} referenced ${fields.length === 1 ? "field" : "fields"}`, visualPositions.get(visual.value)!, "visual"));
      edges.push(lineageEdge(`page-visual-${lineageId(visual.value)}`, `page-${lineageId(selectedPage)}`, id, "renders"));
    });
  }
  return dedupeGraph({ nodes, edges });
}

function buildColumnGraph(snapshot: ExplorerSnapshot, parsed: ParsedSemanticModel | undefined, dax: DaxAnalysis | undefined, selected: LineageObject, depth: number): LineageGraph {
  const dependencies = collectDependencies(snapshot, dax);
  const expressionIndex = buildExpressionIndex(snapshot, parsed);
  const rootId = `column-${lineageId(selected.key)}`;
  const sourceRows = snapshot.source_database_lineage.rows.filter((row) => row.semantic_table === selected.table);
  const sources = uniqueBy(sourceRows, (row) => row.source_id);
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const sourceItems = sources.length ? sources : [{ source_id: `declared-${selected.key}`, source_provider: "Definition", source_object_type: "column", source_fully_qualified_name: selected.sourcePath ?? "Physical source not declared", semantic_table: selected.table }];
  const sourcePositions = horizontalPositions(sourceItems.map((row) => row.source_id), 0);
  sourceItems.forEach((source) => {
    const id = `source-${lineageId(source.source_id)}`;
    const columnDetail = selected.sourceColumn ? `Column ${selected.sourceColumn}` : "Source column not declared";
    nodes.push(lineageNode(id, source.source_fully_qualified_name, `${source.source_provider} · ${columnDetail}`, sourcePositions.get(source.source_id)!, "database"));
    edges.push(lineageEdge(`source-root-${lineageId(source.source_id)}`, id, rootId, "maps to"));
  });
  nodes.push(lineageNode(rootId, `${selected.table}[${selected.name}]`, selected.expression ?? selected.sourcePath ?? "Semantic column", { x: 520, y: 180 }, canonicalType(selected.objectType) === "calculated_column" ? "calculation" : "semantic"));

  const rootKey = dependencyObjectKey(selected.objectType, selected.table, selected.name);
  const nodeIds = new Map<string, string>([[rootKey, rootId]]);
  const visited = new Set<string>([rootKey]);
  let current = [rootKey];
  let edgeIndex = 0;
  for (let level = 1; level <= depth && current.length; level += 1) {
    const matches = dependencies.filter((dependency) => current.includes(referenceKey(dependency.source)));
    const nextReferences = uniqueReferences(matches.map((dependency) => dependency.target).filter((reference) => !visited.has(referenceKey(reference))));
    const positions = horizontalPositions(nextReferences.map(referenceKey), 180 + level * 180);
    nextReferences.forEach((reference) => {
      const key = referenceKey(reference);
      const id = `dependent-${lineageId(key)}`;
      nodeIds.set(key, id);
      visited.add(key);
      nodes.push(lineageNode(id, referenceTitle(reference), expressionIndex.get(key) ?? `${displayType(reference.object_type)} using this column`, positions.get(key)!, referenceTone(reference)));
    });
    matches.forEach((dependency) => {
      const source = nodeIds.get(referenceKey(dependency.source));
      const target = nodeIds.get(referenceKey(dependency.target));
      if (source && target) edges.push(lineageEdge(`column-dependency-${edgeIndex++}`, source, target, dependency.reference_text));
    });
    current = nextReferences.map(referenceKey);
  }
  return dedupeGraph({ nodes, edges });
}

function buildCalculationGraph(snapshot: ExplorerSnapshot, parsed: ParsedSemanticModel | undefined, dax: DaxAnalysis | undefined, selected: LineageObject, depth: number): LineageGraph {
  const dependencies = collectDependencies(snapshot, dax);
  const expressionIndex = buildExpressionIndex(snapshot, parsed);
  const rootKey = dependencyObjectKey(selected.objectType, selected.table, selected.name);
  const rootId = `target-${lineageId(rootKey)}`;
  const nodes: Node[] = [lineageNode(rootId, `${selected.table}[${selected.name}]`, selected.expression ?? "Target calculation", { x: 660, y: 260 }, "target")];
  const edges: Edge[] = [];
  const nodeIds = new Map<string, string>([[rootKey, rootId]]);
  const upstreamVisited = new Set<string>([rootKey]);
  const downstreamVisited = new Set<string>([rootKey]);
  let edgeIndex = 0;

  let upstream = [rootKey];
  for (let level = 1; level <= depth && upstream.length; level += 1) {
    const matches = dependencies.filter((dependency) => upstream.includes(referenceKey(dependency.target)));
    const references = uniqueReferences(matches.map((dependency) => dependency.source).filter((reference) => !upstreamVisited.has(referenceKey(reference))));
    const positions = verticalPositions(references.map(referenceKey), 660 - level * 320);
    references.forEach((reference) => {
      const key = referenceKey(reference);
      const id = `input-${lineageId(key)}`;
      nodeIds.set(key, id);
      upstreamVisited.add(key);
      nodes.push(lineageNode(id, referenceTitle(reference), expressionIndex.get(key) ?? sourceDetail(snapshot, reference), positions.get(key)!, referenceTone(reference)));
    });
    matches.forEach((dependency) => {
      const source = nodeIds.get(referenceKey(dependency.source));
      const target = nodeIds.get(referenceKey(dependency.target));
      if (source && target) edges.push(lineageEdge(`calculation-input-${edgeIndex++}`, source, target, dependency.reference_text));
    });
    upstream = references.map(referenceKey);
  }

  let downstream = [rootKey];
  for (let level = 1; level <= depth && downstream.length; level += 1) {
    const matches = dependencies.filter((dependency) => downstream.includes(referenceKey(dependency.source)));
    const references = uniqueReferences(matches.map((dependency) => dependency.target).filter((reference) => !downstreamVisited.has(referenceKey(reference))));
    const positions = verticalPositions(references.map(referenceKey), 660 + level * 320);
    references.forEach((reference) => {
      const key = referenceKey(reference);
      const id = `output-${lineageId(key)}`;
      if (!nodeIds.has(key)) nodeIds.set(key, id);
      downstreamVisited.add(key);
      if (!nodes.some((node) => node.id === nodeIds.get(key))) nodes.push(lineageNode(nodeIds.get(key)!, referenceTitle(reference), expressionIndex.get(key) ?? `${displayType(reference.object_type)} dependent`, positions.get(key)!, referenceTone(reference)));
    });
    matches.forEach((dependency) => {
      const source = nodeIds.get(referenceKey(dependency.source));
      const target = nodeIds.get(referenceKey(dependency.target));
      if (source && target) edges.push(lineageEdge(`calculation-output-${edgeIndex++}`, source, target, dependency.reference_text));
    });
    downstream = references.map(referenceKey);
  }
  return dedupeGraph({ nodes, edges });
}

function collectSemanticObjects(snapshot: ExplorerSnapshot, parsed: ParsedSemanticModel | undefined) {
  const objects = new Map<string, LineageObject>();
  snapshot.semantic_model_objects.rows.forEach((row) => {
    const type = canonicalType(row.semantic_object_type);
    const key = selectionKey(type, row.semantic_table, row.semantic_object_name);
    objects.set(key, { key, table: row.semantic_table, name: row.semantic_object_name, objectType: type, expression: row.semantic_dax_expression ?? null, sourceColumn: row.semantic_source_column ?? null, sourcePath: row.source_path ?? null, dataType: row.semantic_data_type ?? null });
  });
  parsed?.tables.forEach((table) => {
    if (table.expression) addObject(objects, { table: table.name, name: table.name, objectType: "calculated_table", expression: table.expression, sourceColumn: null, sourcePath: table.source_path ?? null, dataType: null });
    table.columns.forEach((column) => addObject(objects, { table: table.name, name: column.name, objectType: column.expression ? "calculated_column" : "column", expression: column.expression ?? null, sourceColumn: column.source_column ?? null, sourcePath: column.source_path ?? table.source_path ?? null, dataType: column.data_type ?? null }));
    table.measures.forEach((measure) => addObject(objects, { table: table.name, name: measure.name, objectType: "measure", expression: measure.expression ?? null, sourceColumn: null, sourcePath: table.source_path ?? null, dataType: null }));
  });
  return [...objects.values()].sort((first, second) => first.table.localeCompare(second.table) || first.name.localeCompare(second.name));
}

function addObject(objects: Map<string, LineageObject>, object: Omit<LineageObject, "key">) {
  const key = selectionKey(object.objectType, object.table, object.name);
  const existing = objects.get(key);
  objects.set(key, { key, ...object, expression: existing?.expression ?? object.expression, sourceColumn: existing?.sourceColumn ?? object.sourceColumn, sourcePath: existing?.sourcePath ?? object.sourcePath, dataType: existing?.dataType ?? object.dataType });
}

function collectDependencies(snapshot: ExplorerSnapshot, dax: DaxAnalysis | undefined): DaxDependency[] {
  if (dax) return uniqueBy(dax.dependencies, (dependency) => `${referenceKey(dependency.source)}>${referenceKey(dependency.target)}:${dependency.reference_text}`);
  const dependencies = snapshot.measure_source_lineage.rows.flatMap((row): DaxDependency[] => {
    const sourceName = row.source_semantic_object_name ?? row.source_column_name;
    if (!sourceName || !row.source_semantic_table) return [];
    const sourceType = canonicalType(row.source_semantic_object_type ?? "column");
    const targetType = canonicalType(row.semantic_object_type);
    return [{
      source: makeReference(sourceType, row.source_semantic_table, sourceName),
      target: makeReference(targetType, row.semantic_table ?? "", row.semantic_object_name),
      reference_text: row.is_direct_dependency ? "direct dependency" : `source evidence${row.dependency_depth ? ` · depth ${row.dependency_depth}` : ""}`,
    }];
  });
  return uniqueBy(dependencies, (dependency) => `${referenceKey(dependency.source)}>${referenceKey(dependency.target)}`);
}

function buildExpressionIndex(snapshot: ExplorerSnapshot, parsed: ParsedSemanticModel | undefined) {
  const index = new Map<string, string>();
  collectSemanticObjects(snapshot, parsed).forEach((object) => { if (object.expression) index.set(dependencyObjectKey(object.objectType, object.table, object.name), object.expression); });
  return index;
}

function sourceDetail(snapshot: ExplorerSnapshot, reference: DaxReference) {
  const object = snapshot.semantic_model_objects.rows.find((row) => dependencyObjectKey(row.semantic_object_type, row.semantic_table, row.semantic_object_name) === referenceKey(reference));
  return object?.source_path ?? object?.semantic_source_column ?? `${displayType(reference.object_type)} input`;
}

function lineageNode(id: string, title: string, detail: string, position: { x: number; y: number }, tone: "database" | "semantic" | "model" | "report" | "page" | "visual" | "calculation" | "target"): Node {
  const colors = {
    database: { border: "#86efac", background: "#f0fdf4", accent: "#166534" },
    semantic: { border: "#7dd3fc", background: "#f0f9ff", accent: "#075985" },
    model: { border: "#5eead4", background: "#f0fdfa", accent: "#115e59" },
    report: { border: "#fda4af", background: "#fff1f2", accent: "#9f1239" },
    page: { border: "#fcd34d", background: "#fffbeb", accent: "#92400e" },
    visual: { border: "#d4d4d8", background: "#ffffff", accent: "#3f3f46" },
    calculation: { border: "#fdba74", background: "#fff7ed", accent: "#9a3412" },
    target: { border: "#22d3ee", background: "#ecfeff", accent: "#155e75" },
  }[tone];
  return { id, position, data: { label: <div className="max-w-[224px] text-left" title={`${title}\n${detail}`}><div className="break-words text-xs font-semibold" style={{ color: colors.accent }}>{title}</div><div className="mt-1 break-words text-[11px] leading-4 text-zinc-600">{abbreviate(detail, 130)}</div></div> }, style: { width: 252, minHeight: 72, border: `1px solid ${colors.border}`, borderRadius: 6, background: colors.background, padding: 10, boxShadow: "none" } };
}

function lineageEdge(id: string, source: string, target: string, label: string): Edge {
  return { id, source, target, label: abbreviate(label, 36), type: "smoothstep", style: { stroke: "#64748b", strokeWidth: 1.3 }, labelStyle: { fontSize: 10, fill: "#475569" }, labelBgStyle: { fill: "#ffffff", fillOpacity: 0.94 } };
}

function referenceTone(reference: DaxReference): "semantic" | "calculation" {
  const type = canonicalType(reference.object_type);
  return type === "measure" || type === "calculated_column" || type === "calculated_table" ? "calculation" : "semantic";
}
function makeReference(objectType: string, tableName: string, objectName: string): DaxReference { return { object_type: objectType, table_name: tableName, object_name: objectName, qualified_name: tableName ? `${tableName}[${objectName}]` : objectName }; }
function referenceTitle(reference: DaxReference) { return reference.qualified_name || (reference.table_name ? `${reference.table_name}[${reference.object_name}]` : reference.object_name); }
function referenceKey(reference: DaxReference) { return dependencyObjectKey(reference.object_type, reference.table_name ?? "", reference.object_name); }
function dependencyObjectKey(objectType: string, table: string, name: string) { return `${canonicalType(objectType)}|${table.toLocaleLowerCase()}|${name.toLocaleLowerCase()}`; }
function selectionKey(objectType: string, table: string, name: string) { return `${canonicalType(objectType)}\u001f${table}\u001f${name}`; }
function canonicalType(value: string) { const type = value.trim().toLocaleLowerCase().replace(/[\s-]+/g, "_"); if (type.includes("calculated_column")) return "calculated_column"; if (type.includes("calculated_table")) return "calculated_table"; if (type.includes("measure")) return "measure"; if (type.includes("column")) return "column"; if (type.includes("table")) return "table"; return type; }
function isColumnType(value: string) { const type = canonicalType(value); return type === "column" || type === "calculated_column"; }
function isCalculationType(value: string) { const type = canonicalType(value); return type === "measure" || type === "calculated_column" || type === "calculated_table"; }
function displayType(value: string) { return canonicalType(value).split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "); }

function horizontalPositions(keys: string[], y: number) { const spacing = 292; const start = Math.max(20, 650 - ((keys.length - 1) * spacing) / 2); return new Map(keys.map((key, index) => [key, { x: start + index * spacing, y }])); }
function verticalPositions(keys: string[], x: number) { const spacing = 118; const start = Math.max(20, 280 - ((keys.length - 1) * spacing) / 2); return new Map(keys.map((key, index) => [key, { x, y: start + index * spacing }])); }
function uniquePages(rows: ReportLayoutRow[]): SelectOption[] { return uniqueBy(rows, (row) => row.page_id).sort((first, second) => (first.page_order ?? Number.MAX_SAFE_INTEGER) - (second.page_order ?? Number.MAX_SAFE_INTEGER) || first.page_name.localeCompare(second.page_name)).map((row) => ({ value: row.page_id, label: row.page_name })); }
function uniqueVisuals(rows: ReportLayoutRow[]): SelectOption[] { return uniqueBy(rows, (row) => `${row.page_id}:${row.visual_id}`).map((row) => ({ value: `${row.page_id}:${row.visual_id}`, label: row.visual_name })); }
function uniqueReferences(references: DaxReference[]) { return uniqueBy(references, referenceKey); }
function uniqueStrings(values: string[]) { return [...new Set(values)].sort((first, second) => first.localeCompare(second)); }
function uniqueBy<T>(items: T[], key: (item: T) => string) { const seen = new Set<string>(); return items.filter((item) => { const value = key(item); if (seen.has(value)) return false; seen.add(value); return true; }); }
function dedupeGraph(graph: LineageGraph): LineageGraph { return { nodes: uniqueBy(graph.nodes, (node) => node.id), edges: uniqueBy(graph.edges, (edge) => `${edge.source}>${edge.target}:${String(edge.label ?? "")}`) }; }
function emptyGraph(): LineageGraph { return { nodes: [], edges: [] }; }
function asOption(value: string): SelectOption { return { value, label: value }; }
function lineageId(value: string) { return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLocaleLowerCase(); }
function abbreviate(value: string, length: number) { const clean = value.replace(/\s+/g, " ").trim(); return clean.length > length ? `${clean.slice(0, length - 3)}...` : clean; }
async function copyText(text: string) { try { await navigator.clipboard.writeText(text); } catch { const textarea = document.createElement("textarea"); textarea.value = text; textarea.style.position = "fixed"; textarea.style.opacity = "0"; document.body.appendChild(textarea); textarea.select(); document.execCommand("copy"); textarea.remove(); } }
