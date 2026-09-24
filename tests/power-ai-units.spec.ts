import { expect, test } from "@playwright/test";

import { highlightDax } from "../app/lib/dax-highlight";
import type { EvidenceItem } from "../app/lib/power-ai-api";
import { answerLineCount, isTitleLine, parseAnswer, sectionKind, sectionTabs } from "../app/lib/power-ai-answer";
import { buildEntityIndex, contextForEntity, entityQuestion, linkify, type LinkedSegment } from "../app/lib/power-ai-entities";
import { measureLineageLayers } from "../app/lib/power-ai-lineage";

/**
 * The pure modules behind Power AI's answer rendering, run straight in
 * Playwright's Node process — no page, and no second test runner.
 */

function evidence(overrides: Partial<EvidenceItem>): EvidenceItem {
  return {
    evidence_id: "E1",
    object_type: "measure",
    object_id: null,
    object_name: "Total Revenue",
    fact_type: "definition",
    source_type: "tmdl",
    value: null,
    plain_language: null,
    display_value: null,
    workspace_id: null,
    report_id: null,
    semantic_model_id: null,
    verification_status: "verified",
    retrieved_at: "2026-09-24T09:30:00Z",
    source_reference: null,
    ...overrides,
  };
}

const joined = (segments: LinkedSegment[]) => segments.map((segment) => (typeof segment === "string" ? segment : segment.text)).join("");
const chipTexts = (segments: LinkedSegment[]) => segments.filter((segment) => typeof segment !== "string").map((segment) => (segment as { text: string }).text);

test.describe("power-ai-answer", () => {
  const deterministic = [
    "Total Revenue is a measure in table Orders of semantic model 'Sales Model' (workspace 'Finance').",
    "",
    "In plain English",
    "Total Revenue adds up Revenue.",
    "",
    "Definition",
    "- Total Revenue (measure in table Orders; format #,0)",
    "    SUM(Orders[Revenue])",
    "    Defined in: definition/tables/Orders.tmdl",
    "",
    "Reads from (database lineage)",
    "- Snowflake view PBI_DB.MART.V_ORDERS -> semantic table Orders",
    "",
    "What was checked",
    "- Visual impact was checked in 1 report.",
  ].join("\n");

  test("splits a deterministic answer into lead, plain and titled sections", () => {
    const sections = parseAnswer(deterministic);
    expect(sections.map((section) => [section.kind, section.displayTitle])).toEqual([
      ["lead", null],
      ["plain", "In plain English"],
      ["dax", "Definition"],
      ["database", "Reads from (database lineage)"],
      ["coverage", "What was checked"],
    ]);
    expect(sections[0].blocks).toEqual([{ kind: "text", lines: [deterministic.split("\n")[0]] }]);
    // The code indent is removed, the DAX is otherwise untouched, and "Defined in" is a caption, not DAX.
    expect(sections[2].blocks).toEqual([
      { kind: "items", items: ["Total Revenue (measure in table Orders; format #,0)"] },
      { kind: "code", lines: ["SUM(Orders[Revenue])"] },
      { kind: "note", text: "Defined in: definition/tables/Orders.tmdl" },
    ]);
  });

  test("recognises model-written aliases, with or without a trailing colon, and keeps the colon in the title", () => {
    const text = ["Gross Margin divides profit by sales.", "", "Semantic model lineage:", "- Sales[Amount]", "", "DAX", "    DIVIDE([Gross Profit], [Net Sales])", "What builds on it:", "- Margin Trend"].join("\n");
    const sections = parseAnswer(text);
    expect(sections.map((section) => [section.title, section.displayTitle, section.kind, section.tab])).toEqual([
      [null, null, "lead", "Overview"],
      ["Semantic model lineage:", "Semantic model lineage", "semantic", "Semantic lineage"],
      ["DAX", "DAX", "dax", "DAX"],
      // A known title needs no blank line before it.
      ["What builds on it:", "What builds on it", "dependents", "Impact"],
    ]);
  });

  test("an unknown short line ending in ':' heads a section; sentences, list items and titles with nothing under them don't", () => {
    expect(isTitleLine(["", "Key facts:", "- one"], 1)).toBe(true);
    expect(sectionKind("Key facts:")).toEqual({ kind: "other", tab: "Key facts" });
    expect(isTitleLine(["", "This is a sentence.", "- one"], 1)).toBe(false);
    expect(isTitleLine(["", "- Definition", "- one"], 1)).toBe(false);
    // Still streaming in: nothing under it yet.
    expect(isTitleLine(["Lead.", "", "Definition"], 2)).toBe(false);
    expect(isTitleLine(["Lead.", "", "Definition", "", ""], 2)).toBe(false);
  });

  test("a wrapped continuation line stays inside its list item", () => {
    const [section] = parseAnswer(["- Sales -> Region (direction):", "  Definition (TMDL): single", "  Runtime (XMLA): both"].join("\n"));
    expect(section.blocks).toEqual([{ kind: "items", items: ["Sales -> Region (direction):\nDefinition (TMDL): single\nRuntime (XMLA): both"] }]);
  });

  test("tabs are one per label in order of first appearance, and line counts ignore blank lines", () => {
    const text = ["Lead.", "", "Definition", "- a", "", "Measures and columns built on it", "- b", "", "Tables affected", "- c", "", "Visual impact", "- d"].join("\n");
    expect(sectionTabs(parseAnswer(text)).map((tab) => tab.label)).toEqual(["Overview", "DAX", "Impact", "Visuals"]);
    expect(answerLineCount(text)).toBe(9);
  });
});

test.describe("dax-highlight", () => {
  const samples = [
    "SUM(Orders[Revenue])",
    "DIVIDE([Gross Profit], [Net Sales], 0)",
    "VAR x = CALCULATE(SUM('Order Lines'[Amount]), 'Date'[Year] = 2024)\nRETURN x * 1.5e3 // scaled",
    'IF(ISBLANK([Name]), "n/a ""quoted""", [Name]) /* note */ -- trailing',
    "  unclosed [bracket and 'quote and \"string",
  ];

  test("never changes a character: tokens always join back to the input", () => {
    samples.forEach((sample) => expect(highlightDax(sample).map((token) => token.text).join("")).toBe(sample));
  });

  test("classifies functions, references, strings, numbers and comments", () => {
    const tokens = highlightDax(samples[2]);
    const of = (type: string) => tokens.filter((token) => token.type === type).map((token) => token.text);
    expect(of("function")).toEqual(["CALCULATE", "SUM"]);
    expect(of("reference")).toEqual(["'Order Lines'[Amount]", "'Date'[Year]"]);
    expect(of("number")).toEqual(["2024", "1.5e3"]);
    expect(of("comment")).toEqual(["// scaled"]);
    expect(highlightDax(samples[3]).filter((token) => token.type === "string").map((token) => token.text)).toEqual(['"n/a ""quoted"""']);
    expect(highlightDax("Orders[Revenue]")).toEqual([{ type: "reference", text: "Orders[Revenue]" }]);
  });
});

test.describe("power-ai-entities", () => {
  const items = [
    evidence({ evidence_id: "E1", object_type: "context", object_id: "Orders[Total Revenue]", fact_type: "relationship", display_value: "Total Revenue is a measure." }),
    evidence({ evidence_id: "E2", object_type: "measure", object_id: "Orders[Total Revenue]", display_value: "measure in table Orders; format #,0" }),
    evidence({ evidence_id: "E3", object_type: "column", object_id: "Orders[Revenue]", object_name: "Revenue", fact_type: "dependency", display_value: "Orders[Revenue] (column, referenced directly)" }),
    evidence({ evidence_id: "E4", object_type: "physical_source", object_name: "V_ORDERS", fact_type: "source", value: { database: "PBI_DB", schema_name: "MART", object_name: "V_ORDERS" }, display_value: "Snowflake view PBI_DB.MART.V_ORDERS -> semantic table Orders" }),
    evidence({ evidence_id: "E5", object_type: "physical_source", object_name: "Budget", fact_type: "source", value: { semantic_table: "Budget", source: null }, display_value: "Semantic table Budget: calculated in DAX, so it has no database source." }),
    evidence({ evidence_id: "E6", object_type: "visual", object_name: "Margin Card", fact_type: "impact", source_type: "pbir" }),
    evidence({ evidence_id: "E7", object_type: "coverage", object_name: "Coverage", fact_type: "relationship", source_type: "other" }),
    evidence({ evidence_id: "E8", object_type: "semantic_table", object_id: "Orders", object_name: "Orders", fact_type: "impact" }),
  ];
  const index = buildEntityIndex(items);

  test("indexes names, Table[Name] forms and database names from the evidence only", () => {
    const texts = index.entries.map((entry) => entry.text).sort();
    expect(texts).toEqual(["'Orders'[Revenue]", "'Orders'[Total Revenue]", "Margin Card", "Orders", "Orders[Revenue]", "Orders[Total Revenue]", "PBI_DB.MART.V_ORDERS", "Revenue", "Total Revenue", "V_ORDERS"].sort());
    // Context and coverage lines are not objects; a "no database source" line names a semantic table, not a database object.
    expect(texts).not.toContain("Coverage");
    expect(texts).not.toContain("Budget");
    expect(index.entries.find((entry) => entry.text === "Total Revenue")).toMatchObject({ kind: "measure", qualifiedName: "Orders[Total Revenue]", detail: "measure in table Orders; format #,0" });
  });

  test("linkifies longest-first, whole words only, without overlaps, and never changes the text", () => {
    const text = "Total Revenue reads Orders[Revenue] from PBI_DB.MART.V_ORDERS; Revenues and TotalRevenue are not names. Margin Card shows it.";
    const segments = linkify(text, index);
    expect(joined(segments)).toBe(text);
    expect(chipTexts(segments)).toEqual(["Total Revenue", "Orders[Revenue]", "PBI_DB.MART.V_ORDERS", "Margin Card"]);
  });

  test("a click asks the question that fits the object", () => {
    const find = (text: string) => index.entries.find((entry) => entry.text === text)!;
    expect(entityQuestion(find("Total Revenue"))).toBe("Explain Orders[Total Revenue]");
    expect(entityQuestion(find("Revenue"))).toBe("Explain Orders[Revenue]");
    expect(entityQuestion(find("Orders"))).toBe("Explain table Orders");
    expect(entityQuestion(find("Margin Card"))).toBe("Which fields does Margin Card use?");
    expect(entityQuestion(find("PBI_DB.MART.V_ORDERS"))).toBeNull();
  });

  test("a model object becomes the selected object; anything else clears it and keeps the report", () => {
    const base = { reportId: "r1", reportName: "Sales Overview", objectType: "report" as const, objectId: "r1", objectName: "Sales Overview" };
    const find = (text: string) => index.entries.find((entry) => entry.text === text)!;
    expect(contextForEntity(base, find("Total Revenue"))).toEqual({ ...base, objectType: "measure", objectId: undefined, objectName: "Orders[Total Revenue]" });
    expect(contextForEntity(base, find("Margin Card"))).toEqual({ reportId: "r1", reportName: "Sales Overview", objectType: undefined, objectId: undefined, objectName: undefined });
  });
});

test.describe("power-ai-lineage", () => {
  test("sorts a measure's evidence into truthful layers, database to visuals", () => {
    const layers = measureLineageLayers([
      evidence({ evidence_id: "E1", object_type: "measure", object_id: "Orders[Total Revenue]" }),
      evidence({ evidence_id: "E2", object_type: "measure", object_id: "Orders[Net]", object_name: "Net", fact_type: "dependency" }),
      evidence({ evidence_id: "E3", object_type: "column", object_id: "Orders[Revenue]", object_name: "Revenue", fact_type: "dependency" }),
      evidence({ evidence_id: "E4", object_type: "physical_source", object_name: "V_ORDERS", fact_type: "source", display_value: "Snowflake view PBI_DB.MART.V_ORDERS -> semantic tables Orders, Returns" }),
      evidence({ evidence_id: "E5", object_type: "physical_source", object_name: "V_ORDERS", fact_type: "source", display_value: "Snowflake view PBI_DB.MART.V_ORDERS -> semantic table Orders" }),
      evidence({ evidence_id: "E6", object_type: "measure", object_id: "Orders[Profit Margin %]", object_name: "Profit Margin %", fact_type: "impact" }),
      evidence({ evidence_id: "E7", object_type: "semantic_table", object_id: "Orders", object_name: "Orders", fact_type: "impact" }),
      evidence({ evidence_id: "E8", object_type: "visual", object_name: "Margin Card", fact_type: "impact", value: { report: "Sales Overview", page: "Overview" } }),
    ], { table: "Orders", name: "Total Revenue" });

    expect(layers.map((layer) => [layer.id, layer.cards.map((card) => card.label)])).toEqual([
      ["database", ["PBI_DB.MART.V_ORDERS"]],
      // Columns first, then measures.
      ["inputs", ["Orders[Revenue]", "Orders[Net]"]],
      ["measure", ["Orders[Total Revenue]"]],
      // A table the measure affects is not something built on it.
      ["dependents", ["Orders[Profit Margin %]"]],
      ["visuals", ["Margin Card"]],
    ]);
    expect(layers[4].cards[0].caption).toBe("Sales Overview › Overview");
  });
});
