import type { EvidenceItem, PowerAIContext } from "~/lib/power-ai-api";

/**
 * The objects an answer names, taken only from that answer's evidence, so a
 * name in the text can be shown as a chip with the verified fact behind it.
 * Nothing is inferred: a name that isn't in the evidence stays plain text.
 */

export type EntityKind =
  | "measure"
  | "calculated_column"
  | "column"
  | "table"
  | "hierarchy"
  | "report"
  | "visual"
  | "page"
  | "semantic_model"
  | "database";

export type AnswerEntity = {
  /** The exact text this entry matches in an answer. */
  text: string;
  kind: EntityKind;
  /** "Measure", "Database object", ... */
  typeLabel: string;
  /** The object's own name, as in the evidence. */
  name: string;
  /** `Table[Name]` when the evidence gives one. */
  qualifiedName: string | null;
  /** The item's readable fact, shown in the chip's tooltip. */
  detail: string | null;
  evidenceId: string;
  /** The report an object belongs to, when the evidence says. */
  reportId: string | null;
  workspaceId: string | null;
};

export type EntityIndex = {
  entries: AnswerEntity[];
  /** Entries by their first character, longest text first. */
  byFirstChar: Map<string, AnswerEntity[]>;
};

export type LinkedSegment = string | { entity: AnswerEntity; text: string };

const OBJECT_TYPE_LABEL: Record<string, string> = {
  report: "Report",
  report_page: "Page",
  visual: "Visual",
  semantic_model: "Semantic model",
  table: "Table",
  semantic_table: "Table",
  calculated_table: "Calculated table",
  column: "Column",
  calculated_column: "Calculated column",
  measure: "Measure",
  hierarchy: "Hierarchy",
  hierarchy_level: "Hierarchy level",
  relationship: "Relationship",
  source_object: "Source object",
  physical_source: "Database object",
  coverage: "Coverage",
  search_result: "Search result",
};

export function objectTypeLabel(objectType: string) {
  return OBJECT_TYPE_LABEL[objectType] ?? objectType.replace(/_/g, " ");
}

const KIND_BY_OBJECT_TYPE: Record<string, EntityKind> = {
  measure: "measure",
  calculated_column: "calculated_column",
  column: "column",
  table: "table",
  semantic_table: "table",
  calculated_table: "table",
  hierarchy: "hierarchy",
  hierarchy_level: "hierarchy",
  report: "report",
  visual: "visual",
  report_page: "page",
  semantic_model: "semantic_model",
  physical_source: "database",
};

/** When one text names several objects, the first of these kinds wins. */
const KIND_PRIORITY: EntityKind[] = ["measure", "calculated_column", "column", "table", "report", "visual", "hierarchy", "page", "semantic_model", "database"];

const QUALIFIED = /^'?[^'[\]]+'?\[[^[\]]+\]$/;
/** `database.schema.object`, optionally with a fourth part. */
const DOTTED = /[A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*){2,3}/g;
const MIN_TEXT_LENGTH = 2;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringField(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * The names a database object goes by in answer text: its own name, the
 * `database.schema.object` inside its readable line, and the same built from
 * its structured value.
 */
function databaseNames(item: EvidenceItem): string[] {
  const value = asRecord(item.value);
  // "Semantic table Orders: its database source could not be identified" names a semantic table, not a database object.
  if (value && "source" in value && value.source === null) return [];
  const names = new Set<string>([item.object_name]);
  item.display_value?.match(DOTTED)?.forEach((match) => names.add(match));
  const parts = ["database", "schema_name", "object_name"].map((key) => stringField(value, key));
  if (parts.every(Boolean)) names.add(parts.join("."));
  return [...names];
}

function qualifiedNameOf(item: EvidenceItem, kind: EntityKind) {
  if (kind === "table" || kind === "database") return null;
  const id = item.object_id?.trim();
  if (id && QUALIFIED.test(id)) return id;
  const qualified = stringField(asRecord(item.value), "qualified_name");
  return qualified && QUALIFIED.test(qualified) ? qualified : null;
}

/** The entity one evidence item stands for, or null when it isn't an object a reader would click (context, coverage, relationships). */
export function entityFromItem(item: EvidenceItem, text = item.object_name): AnswerEntity | null {
  const kind = KIND_BY_OBJECT_TYPE[item.object_type];
  if (!kind || !item.object_name?.trim()) return null;
  if (kind === "semantic_model" && item.object_name === "This semantic model") return null;
  return {
    text,
    kind,
    typeLabel: objectTypeLabel(item.object_type),
    name: item.object_name,
    qualifiedName: qualifiedNameOf(item, kind),
    detail: item.display_value ?? item.plain_language ?? null,
    evidenceId: item.evidence_id,
    reportId: item.report_id ?? (kind === "report" ? item.object_id : null),
    workspaceId: item.workspace_id,
  };
}

function textsFor(item: EvidenceItem, entity: AnswerEntity): string[] {
  if (entity.kind === "database") return databaseNames(item);
  const texts = new Set<string>([item.object_name]);
  if (entity.qualifiedName) {
    texts.add(entity.qualifiedName);
    // Orders[Revenue] is also written 'Orders'[Revenue].
    const bracket = entity.qualifiedName.indexOf("[");
    const table = entity.qualifiedName.slice(0, bracket);
    if (!table.startsWith("'")) texts.add(`'${table}'${entity.qualifiedName.slice(bracket)}`);
  }
  return [...texts];
}

export function buildEntityIndex(evidence: EvidenceItem[]): EntityIndex {
  const byText = new Map<string, AnswerEntity>();
  evidence.forEach((item) => {
    const base = entityFromItem(item);
    if (!base) return;
    textsFor(item, base).forEach((text) => {
      if (text.trim().length < MIN_TEXT_LENGTH) return;
      const existing = byText.get(text);
      if (existing && KIND_PRIORITY.indexOf(existing.kind) <= KIND_PRIORITY.indexOf(base.kind)) return;
      byText.set(text, { ...base, text });
    });
  });

  const entries = [...byText.values()].sort((a, b) => b.text.length - a.text.length);
  const byFirstChar = new Map<string, AnswerEntity[]>();
  entries.forEach((entry) => {
    const list = byFirstChar.get(entry.text[0]) ?? [];
    list.push(entry);
    byFirstChar.set(entry.text[0], list);
  });
  return { entries, byFirstChar };
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;

/** Whole-word: a match may not run into letters or digits on either side, unless its own edge isn't one. */
function atBoundary(text: string, start: number, match: string) {
  const before = text[start - 1];
  const after = text[start + match.length];
  const leftOk = !before || !WORD_CHAR.test(before) || !WORD_CHAR.test(match[0]);
  const rightOk = !after || !WORD_CHAR.test(after) || !WORD_CHAR.test(match[match.length - 1]);
  return leftOk && rightOk;
}

/**
 * Splits text into plain runs and entity matches in one left-to-right scan:
 * the longest name wins at each position, matches are whole words, and none
 * overlap. Joining the segments' text gives back exactly the input.
 */
export function linkify(text: string, index: EntityIndex): LinkedSegment[] {
  if (!index.entries.length || !text) return text ? [text] : [];
  const segments: LinkedSegment[] = [];
  let plain = "";
  let position = 0;
  while (position < text.length) {
    const candidates = index.byFirstChar.get(text[position]);
    const match = candidates?.find((entry) => text.startsWith(entry.text, position) && atBoundary(text, position, entry.text));
    if (match) {
      if (plain) segments.push(plain);
      plain = "";
      segments.push({ entity: match, text: match.text });
      position += match.text.length;
    } else {
      plain += text[position];
      position += 1;
    }
  }
  if (plain) segments.push(plain);
  return segments;
}

/** What clicking an entity asks Power AI, or null when it only has a tooltip. */
export function entityQuestion(entity: AnswerEntity): string | null {
  switch (entity.kind) {
    case "measure":
    case "calculated_column":
    case "column":
      return `Explain ${entity.qualifiedName ?? entity.name}`;
    case "table":
      return `Explain table ${entity.name}`;
    case "visual":
      return `Which fields does ${entity.name} use?`;
    case "report":
      return `Tell me about report ${entity.name}`;
    default:
      return null;
  }
}

/**
 * Context for a question about an entity. A semantic-model object becomes the
 * selected object, so the backend resolves exactly it. For anything else the
 * question names what it is about, so the report and model stay and no
 * previously selected object is carried into it.
 */
export function contextForEntity(base: PowerAIContext, entity: AnswerEntity): PowerAIContext {
  if (entity.kind === "measure" || entity.kind === "calculated_column" || entity.kind === "column" || entity.kind === "table") {
    return { ...base, objectType: entity.kind, objectId: undefined, objectName: entity.qualifiedName ?? entity.name };
  }
  return { ...base, objectType: undefined, objectId: undefined, objectName: undefined };
}
