/**
 * The structure of a Power AI answer. The backend sends plain text laid out as
 * titled sections: a title alone on its line, `- ` list items, and DAX indented
 * four spaces. This turns that text into sections so it can be shown as cards,
 * tabs and chips.
 *
 * Presentation only. Nothing here adds, drops or rewrites a fact, and the
 * stored answer is never changed: copying and downloading still use the exact
 * text the backend sent.
 */

export type AnswerSectionKind =
  | "lead"
  | "plain"
  | "dax"
  | "semantic"
  | "database"
  | "dependents"
  | "tables"
  | "visuals"
  | "report"
  | "coverage"
  | "other";

export type AnswerBlock =
  /** Consecutive prose lines, kept as they were written. */
  | { kind: "text"; lines: string[] }
  /** List items without their "- " marker; a wrapped continuation line stays inside its item, joined by "\n". */
  | { kind: "items"; items: string[] }
  /** DAX with the answer's four-space code indent removed; every other character is as sent. */
  | { kind: "code"; lines: string[] }
  /** A caption the renderer indents under DAX, such as "Defined in: definition/tables/Orders.tmdl". */
  | { kind: "note"; text: string };

export type AnswerSection = {
  id: string;
  /** Exactly as written, trailing colon included; null for the lead section. */
  title: string | null;
  /** The title without a trailing colon. */
  displayTitle: string | null;
  kind: AnswerSectionKind;
  /** The short label the measure panel's tabs use. Several sections can share one. */
  tab: string;
  blocks: AnswerBlock[];
  /** Non-blank lines in the section, title included. */
  lineCount: number;
};

const CODE_INDENT = "    ";
const TITLE_MAX_LENGTH = 60;
const ITEM_MARKER = /^[-*•] /;
const DEFINED_IN = /^Defined in: /;

/**
 * Every title the backend's deterministic renderer writes
 * (`app/ai/composition/evidence_sections.py`, plus "In plain English"), then
 * the ones model-written answers used before the titles were made canonical.
 * Matched without case, extra spaces or a trailing colon.
 */
const KNOWN_TITLES: Record<string, { kind: AnswerSectionKind; tab: string }> = {
  "in plain english": { kind: "plain", tab: "Overview" },
  definition: { kind: "dax", tab: "DAX" },
  "about this report": { kind: "report", tab: "Overview" },
  "about this semantic model": { kind: "report", tab: "Overview" },
  "pages and visuals": { kind: "visuals", tab: "Visuals" },
  "measures and columns its visuals use": { kind: "visuals", tab: "Visuals" },
  "tables in the model": { kind: "tables", tab: "Tables" },
  relationships: { kind: "tables", tab: "Tables" },
  "depends on (semantic model lineage)": { kind: "semantic", tab: "Semantic lineage" },
  "reads from (database lineage)": { kind: "database", tab: "Database" },
  "measures and columns built on it": { kind: "dependents", tab: "Impact" },
  "tables affected": { kind: "tables", tab: "Impact" },
  "visual impact": { kind: "visuals", tab: "Visuals" },
  "visuals and the fields they use": { kind: "visuals", tab: "Visuals" },
  "reports using this semantic model": { kind: "report", tab: "Reports" },
  "related objects": { kind: "other", tab: "Related" },
  "what was checked": { kind: "coverage", tab: "Checked" },
  // Aliases from model-written answers.
  "what it is": { kind: "plain", tab: "Overview" },
  dax: { kind: "dax", tab: "DAX" },
  "dax expression": { kind: "dax", tab: "DAX" },
  "semantic model lineage": { kind: "semantic", tab: "Semantic lineage" },
  "database lineage": { kind: "database", tab: "Database" },
  "what builds on it": { kind: "dependents", tab: "Impact" },
};

function normalizeTitle(line: string) {
  return line.trim().replace(/:$/, "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function displayTitle(title: string) {
  return title.trim().replace(/:$/, "").trimEnd();
}

/** The kind and tab label for a title; an unknown title is `other` under its own name. */
export function sectionKind(title: string | null): { kind: AnswerSectionKind; tab: string } {
  if (title === null) return { kind: "lead", tab: "Overview" };
  return KNOWN_TITLES[normalizeTitle(title)] ?? { kind: "other", tab: displayTitle(title) };
}

export function isKnownTitle(line: string) {
  return normalizeTitle(line) in KNOWN_TITLES;
}

function isBlank(line: string | undefined) {
  return line !== undefined && !line.trim();
}

function hasContentAfter(lines: string[], index: number) {
  for (let next = index + 1; next < lines.length; next += 1) if (!isBlank(lines[next])) return true;
  return false;
}

/**
 * A title stands alone on its line and heads something, so a title still
 * streaming in, with nothing under it yet, stays a plain line for now.
 *
 * A known title only needs that. Any other line must also start the text or
 * follow a blank line, fit in 60 characters, and not read as a sentence: it
 * may end in ":" (the colon is kept in the text) but not in "." or ",".
 */
export function isTitleLine(lines: string[], index: number) {
  const line = lines[index];
  if (isBlank(line) || /^\s/.test(line) || ITEM_MARKER.test(line)) return false;
  if (isKnownTitle(line)) return hasContentAfter(lines, index);
  return (
    (index === 0 || isBlank(lines[index - 1])) &&
    lines[index + 1] !== undefined &&
    !isBlank(lines[index + 1]) &&
    line.trimEnd().length <= TITLE_MAX_LENGTH &&
    !/[.,]$/.test(line.trimEnd())
  );
}

function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
}

function toBlocks(lines: string[]): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  lines.forEach((line) => {
    const last = blocks[blocks.length - 1];
    if (!line.trim()) {
      // A blank line ends prose and lists; DAX keeps going only through its own indented lines.
      blocks.push({ kind: "text", lines: [] });
      return;
    }
    if (line.startsWith(CODE_INDENT)) {
      const code = line.slice(CODE_INDENT.length);
      if (DEFINED_IN.test(code)) blocks.push({ kind: "note", text: code });
      else if (last?.kind === "code") last.lines.push(code);
      else blocks.push({ kind: "code", lines: [code] });
      return;
    }
    if (ITEM_MARKER.test(line)) {
      const item = line.replace(ITEM_MARKER, "");
      if (last?.kind === "items") last.items.push(item);
      else blocks.push({ kind: "items", items: [item] });
      return;
    }
    // A line indented less than code, straight after an item, wraps that item.
    if (/^\s/.test(line) && last?.kind === "items") {
      last.items[last.items.length - 1] += `\n${line.trim()}`;
      return;
    }
    if (last?.kind === "text" && last.lines.length) last.lines.push(line);
    else blocks.push({ kind: "text", lines: [line] });
  });
  return blocks.filter((block) => block.kind !== "text" || block.lines.length > 0);
}

/** An answer as sections, in the order written. Text before the first title is the lead section. */
export function parseAnswer(text: string): AnswerSection[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const groups: Array<{ title: string | null; lines: string[] }> = [{ title: null, lines: [] }];
  lines.forEach((line, index) => {
    if (isTitleLine(lines, index)) groups.push({ title: line, lines: [] });
    else groups[groups.length - 1].lines.push(line);
  });

  return groups
    .filter((group) => group.title !== null || group.lines.some((line) => line.trim()))
    .map((group, index) => {
      const { kind, tab } = sectionKind(group.title);
      const title = group.title?.trim() ?? null;
      return {
        id: `s${index}-${slug(title ?? "lead")}`,
        title,
        displayTitle: title === null ? null : displayTitle(title),
        kind,
        tab,
        blocks: toBlocks(group.lines),
        lineCount: group.lines.filter((line) => line.trim()).length + (title === null ? 0 : 1),
      };
    });
}

/** Non-blank lines in the whole answer — what decides whether a chat answer starts partly collapsed. */
export function answerLineCount(text: string) {
  return text.split("\n").filter((line) => line.trim()).length;
}

/**
 * The measure panel's tabs: one per tab label, in the order its first section
 * appears, pointing at that section.
 */
export function sectionTabs(sections: AnswerSection[]): Array<{ label: string; sectionId: string }> {
  const tabs: Array<{ label: string; sectionId: string }> = [];
  sections.forEach((section) => {
    if (!tabs.some((tab) => tab.label === section.tab)) tabs.push({ label: section.tab, sectionId: section.id });
  });
  return tabs;
}
