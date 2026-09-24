import type { EvidenceItem } from "~/lib/power-ai-api";
import { entityFromItem, type AnswerEntity } from "~/lib/power-ai-entities";

/**
 * The measure panel's lineage strip: the measure's evidence sorted into five
 * layers, database to visuals. It only says which layer an item is in. The
 * evidence doesn't state which input feeds which dependent, so no
 * item-to-item edge is drawn or implied.
 */

export type LineageCard = {
  key: string;
  label: string;
  /** Where the item sits, e.g. "Sales Overview › Overview" for a visual, straight from its evidence value. */
  caption: string | null;
  entity: AnswerEntity | null;
  item: EvidenceItem | null;
};

export type LineageLayer = {
  id: "database" | "inputs" | "measure" | "dependents" | "visuals";
  title: string;
  cards: LineageCard[];
};

const DOTTED = /[A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*){2,3}/;
const MEASURE_TYPES = new Set(["measure"]);
/** Impact on these belongs to the visuals layer or to "Tables affected", not to objects built on the measure. */
const NOT_DEPENDENTS = new Set(["visual", "semantic_table", "report", "report_page"]);
const VISUAL_LAYER_TYPES = new Set(["visual", "report", "report_page"]);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function card(item: EvidenceItem, label: string, caption: string | null = null): LineageCard {
  return { key: item.evidence_id || `${item.object_type}:${item.object_id ?? item.object_name}`, label, caption, entity: entityFromItem(item, label), item };
}

function databaseCard(item: EvidenceItem) {
  const value = record(item.value);
  const dotted = item.display_value?.match(DOTTED)?.[0];
  const unresolved = value !== null && "source" in value && value.source === null;
  return card(item, unresolved ? item.object_name : dotted ?? item.object_name, unresolved ? "No database source identified" : null);
}

function visualCaption(item: EvidenceItem) {
  const value = record(item.value);
  const parts = [value?.report, value?.page].filter((part): part is string => typeof part === "string" && Boolean(part.trim()));
  return parts.length ? parts.join(" › ") : null;
}

export function measureLineageLayers(evidence: EvidenceItem[], measure: { table: string; name: string }): LineageLayer[] {
  const qualified = `${measure.table}[${measure.name}]`;
  const database = evidence.filter((item) => item.fact_type === "source").map(databaseCard);

  const dependencies = evidence.filter((item) => item.fact_type === "dependency");
  // Columns first, then measures.
  const inputs = [
    ...dependencies.filter((item) => !MEASURE_TYPES.has(item.object_type)),
    ...dependencies.filter((item) => MEASURE_TYPES.has(item.object_type)),
  ].map((item) => card(item, item.object_id && item.object_id.includes("[") ? item.object_id : item.object_name));

  const definition = evidence.find((item) => item.fact_type === "definition" && item.object_type === "measure");
  const self: LineageCard = definition
    ? card(definition, qualified)
    : { key: `measure:${qualified}`, label: qualified, caption: null, entity: null, item: null };

  const impact = evidence.filter((item) => item.fact_type === "impact");
  const dependents = impact
    .filter((item) => !NOT_DEPENDENTS.has(item.object_type))
    .map((item) => card(item, item.object_id && item.object_id.includes("[") ? item.object_id : item.object_name));
  const visuals = impact.filter((item) => VISUAL_LAYER_TYPES.has(item.object_type)).map((item) => card(item, item.object_name, visualCaption(item)));

  return [
    { id: "database", title: "Database", cards: uniqueByLabel(database) },
    { id: "inputs", title: "Semantic inputs", cards: uniqueByLabel(inputs) },
    { id: "measure", title: "This measure", cards: [self] },
    { id: "dependents", title: "Built on it", cards: uniqueByLabel(dependents) },
    { id: "visuals", title: "Visuals", cards: visuals },
  ];
}

/** One view backing several semantic tables is one database card; the first item's fact stands for it. */
function uniqueByLabel(cards: LineageCard[]) {
  const seen = new Set<string>();
  return cards.filter((entry) => !seen.has(entry.label) && Boolean(seen.add(entry.label)));
}
