import type { EvidenceItem } from "~/lib/power-ai-api";

/**
 * Which answer section each evidence item belongs to — a mirror of the
 * backend's own table (`app/ai/composition/evidence_sections.py`), so the chat,
 * the measure panel and the downloads group evidence exactly the way the answer
 * text does. Pure labelling: nothing here adds, drops or infers a fact.
 */
export type EvidenceSection = { order: number; title: string };

export const CONTEXT_SECTION: EvidenceSection = { order: 0, title: "Context" };
const ABOUT_REPORT: EvidenceSection = { order: 5, title: "About this report" };
const ABOUT_MODEL: EvidenceSection = { order: 6, title: "About this semantic model" };
const DEFINITION: EvidenceSection = { order: 10, title: "Definition" };
const REPORT_PAGES: EvidenceSection = { order: 20, title: "Pages and visuals" };
const REPORT_FIELDS: EvidenceSection = { order: 22, title: "Measures and columns its visuals use" };
const MODEL_TABLES: EvidenceSection = { order: 25, title: "Tables in the model" };
const RELATIONSHIPS: EvidenceSection = { order: 28, title: "Relationships" };
const DEPENDENCY: EvidenceSection = { order: 30, title: "Depends on (semantic model lineage)" };
const SOURCE: EvidenceSection = { order: 40, title: "Reads from (database lineage)" };
const DEPENDENTS: EvidenceSection = { order: 50, title: "Measures and columns built on it" };
const TABLE_IMPACT: EvidenceSection = { order: 55, title: "Tables affected" };
const VISUAL_IMPACT: EvidenceSection = { order: 60, title: "Visual impact" };
const VISUAL_FIELDS: EvidenceSection = { order: 62, title: "Visuals and the fields they use" };
const REPORTS: EvidenceSection = { order: 65, title: "Reports using this semantic model" };
const RELATED: EvidenceSection = { order: 70, title: "Related objects" };
export const COVERAGE_SECTION: EvidenceSection = { order: 90, title: "What was checked" };

/** Exact `fact_type/object_type` pairs, looked up first. */
const BY_FACT_AND_OBJECT: Record<string, EvidenceSection> = {
  "relationship/context": CONTEXT_SECTION,
  "definition/report": ABOUT_REPORT,
  "definition/semantic_model": ABOUT_MODEL,
  "usage/measure": REPORT_FIELDS,
  "usage/column": REPORT_FIELDS,
  "usage/calculated_column": REPORT_FIELDS,
  "usage/hierarchy": REPORT_FIELDS,
  "usage/hierarchy_level": REPORT_FIELDS,
  "relationship/coverage": COVERAGE_SECTION,
  "relationship/report_page": REPORT_PAGES,
  "relationship/semantic_table": MODEL_TABLES,
  "relationship/relationship": RELATIONSHIPS,
  "impact/semantic_table": TABLE_IMPACT,
  // A visual an object reaches is impact ("what changes if it changes");
  // a report's own list of visuals is usage.
  "impact/visual": VISUAL_IMPACT,
  "impact/report": VISUAL_IMPACT,
  "impact/report_page": VISUAL_IMPACT,
  "usage/report": REPORTS,
  "usage/visual": VISUAL_FIELDS,
};

/** The `fact_type` default when the exact pair isn't listed. */
const BY_FACT: Record<EvidenceItem["fact_type"], EvidenceSection> = {
  definition: DEFINITION,
  dependency: DEPENDENCY,
  source: SOURCE,
  impact: DEPENDENTS,
  usage: VISUAL_FIELDS,
  relationship: RELATED,
};

const KNOWN_BY_TITLE = new Map(
  [...Object.values(BY_FACT_AND_OBJECT), ...Object.values(BY_FACT)].map((section) => [section.title, section]),
);

/** Order for a section the backend names that this table doesn't know: after the known ones, before "What was checked". */
const UNKNOWN_SECTION_ORDER = 80;

export function sectionFor(item: EvidenceItem): EvidenceSection {
  if (item.section) return KNOWN_BY_TITLE.get(item.section) ?? { order: UNKNOWN_SECTION_ORDER, title: item.section };
  return BY_FACT_AND_OBJECT[`${item.fact_type}/${item.object_type}`] ?? BY_FACT[item.fact_type] ?? RELATED;
}

/** Evidence in reading order, one group per section, the backend's order kept within each. */
export function groupBySection(evidence: EvidenceItem[]): Array<{ section: EvidenceSection; items: EvidenceItem[] }> {
  const groups = new Map<string, { section: EvidenceSection; items: EvidenceItem[] }>();
  evidence.forEach((item) => {
    const section = sectionFor(item);
    const group = groups.get(section.title) ?? { section, items: [] };
    group.items.push(item);
    groups.set(section.title, group);
  });
  return [...groups.values()].sort((a, b) => a.section.order - b.section.order);
}

/** The one-sentence "what this object is" line. The answer already opens with it, so evidence lists leave it out. */
export function isContextItem(item: EvidenceItem): boolean {
  return sectionFor(item).title === CONTEXT_SECTION.title;
}

export function isCoverageItem(item: EvidenceItem): boolean {
  return sectionFor(item).title === COVERAGE_SECTION.title;
}

/** The DAX of a measure or calculated column definition, when the backend sent it as text. */
export function definitionExpression(item: EvidenceItem): string | null {
  return item.fact_type === "definition" && typeof item.value === "string" && item.value.trim() ? item.value : null;
}

/**
 * The readable line for one item: its `display_value`, falling back to
 * `object_name`. A definition's `display_value` describes the object without
 * naming it ("measure in table Orders; format #,0"), so the name leads it, the
 * way the answer text writes it.
 */
export function evidenceLine(item: EvidenceItem): string {
  if (!item.display_value) return item.object_name;
  if (item.fact_type === "definition" && !item.display_value.includes(item.object_name)) return `${item.object_name} (${item.display_value})`;
  return item.display_value;
}
