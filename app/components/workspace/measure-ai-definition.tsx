import { Download, FileText, Loader2, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "~/components/ui/button";
import {
  buildChatRequest,
  explainObject,
  type AiChatResponse,
  type PowerAiApiError,
  type PowerAiAudience,
  type PowerAIContext,
} from "~/lib/power-ai-api";
import { useAppStore } from "~/stores/app-store";

/** One selectable measure, carrying the mapping evidence already on screen for it. */
export type MeasureDefinitionTarget = {
  key: string;
  table: string;
  name: string;
  daxExpression: string;
  sourceColumn: string;
  sourceTable: string;
};

/**
 * Always the most detailed reader. This panel exists to show the DAX, its
 * sources and its dependencies in full, so there is nothing to choose.
 */
const AUDIENCE: PowerAiAudience = "developer";

const FACT_TYPE_LABELS: Record<string, string> = {
  definition: "Definition",
  dependency: "Depends on",
  source: "Physical sources",
  usage: "Used by",
  impact: "Downstream impact",
  relationship: "Related objects",
};

const STATUS_NOTE: Partial<Record<AiChatResponse["status"], string>> = {
  insufficient_evidence: "Power AI did not have enough verified evidence to define this measure fully. What it could ground is below.",
  ambiguous: "Power AI found more than one possible reading of this measure. Narrow the selection and try again.",
  conflicting_evidence: "Power AI found conflicting evidence for this measure. Treat the definition below as unconfirmed.",
  out_of_scope: "Power AI treated this as outside what it can answer from this model's evidence.",
};

/**
 * Spells out the four things a measure definition has to cover — and, just as
 * importantly, avoids the words that route the question away from the measure
 * agent. The backend classifies intent by keyword before it looks at the
 * object type, and "depend", "impact", "upstream", "downstream", "change",
 * "affect" and "remove" all send the question to the impact agent, which
 * gathers no DAX definition at all. That is what turned this panel's answer
 * into a bare "Depends on / Downstream impact" list. The measure agent already
 * returns definition, upstream lineage and impact evidence together, so asking
 * it plainly gets all four topics back.
 */
function questionFor(target: MeasureDefinitionTarget): string {
  return [
    `Explain the measure '${target.name}' in table '${target.table}'.`,
    "Cover four things, in this order:",
    "1. A plain-language definition of what this measure calculates.",
    "2. The DAX expression it uses, and what each part of that expression does.",
    "3. The sources that DAX reads - name the semantic tables, and the database tables and columns behind them.",
    "4. Which objects it reads, and which other measures or visuals build on it, including references that cross into another table or model.",
  ].join(" ");
}

const INTENT_DIVERTING_WORDS = ["impact", "depend", "upstream", "downstream", "removed", "remove", "changes", "change", "affect", "what happens if"];

/** Guards the wording above: any of these words silently reroutes the question to the impact agent. */
export function divertsIntent(question: string): string[] {
  const normalized = question.toLowerCase();
  return INTENT_DIVERTING_WORDS.filter((word) => normalized.includes(word));
}

/** Backend evidence grouped by what kind of fact it is, in a fixed reading order. */
function groupEvidence(response: AiChatResponse): Array<[string, AiChatResponse["evidence"]]> {
  const order = Object.keys(FACT_TYPE_LABELS);
  const grouped = new Map<string, AiChatResponse["evidence"]>();
  response.evidence.forEach((item) => {
    grouped.set(item.fact_type, [...(grouped.get(item.fact_type) ?? []), item]);
  });
  const rank = (key: string) => (order.indexOf(key) === -1 ? order.length : order.indexOf(key));
  return [...grouped.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
}

/** A self-contained document, so a downloaded answer still says what it was about and what backed it. */
function toMarkdown(target: MeasureDefinitionTarget, response: AiChatResponse, context: PowerAIContext): string {
  const lines = [
    `# ${target.name}`,
    "",
    `**Semantic table:** ${target.table}`,
    `**Workspace:** ${context.workspaceName ?? "Not reported"}`,
    `**Report:** ${context.reportName ?? "Not reported"}`,
    `**Semantic model:** ${context.semanticModelName ?? "Not reported"}`,
    `**Source column:** ${target.sourceColumn}`,
    `**Source table:** ${target.sourceTable}`,
    `**Answer status:** ${response.status}`,
    "",
    "## Definition",
    "",
    response.answer || "_Power AI returned no answer text._",
    "",
    "## DAX expression",
    "",
    "```dax",
    target.daxExpression,
    "```",
  ];
  groupEvidence(response).forEach(([factType, items]) => {
    lines.push("", `## ${FACT_TYPE_LABELS[factType] ?? factType}`, "");
    items.forEach((item) => {
      lines.push(`- **${item.object_name}** (${item.object_type}, ${item.source_type}, ${item.verification_status})${item.display_value ? ` — ${item.display_value}` : ""}`);
    });
  });
  return `${lines.join("\n")}\n`;
}

/** The same document without Markdown syntax, for the plain-text download. */
function toPlainText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^```.*$/gm, "")
    .replace(/\*\*/g, "")
    .replace(/^- /gm, "  - ");
}

function download(content: string, type: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** One labelled fact the page already holds, shown beside the answer so the DAX and its source are never missing. */
function EvidenceFacts({ title, value, mono = false }: { title: string; value: string; mono?: boolean }) {
  return <div>
    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
    <p className={`mt-1 whitespace-pre-wrap break-words text-sm text-zinc-800${mono ? " font-mono text-xs" : ""}`}>{value}</p>
  </div>;
}

function fileStem(target: MeasureDefinitionTarget) {
  return `${target.table}-${target.name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "measure-definition";
}

/**
 * Generates a full, reader-appropriate definition of one measure through the
 * backend's evidence-grounded Power AI route, inline beneath the mapping grid.
 * Unlike `AskPowerAiButton`, which hands its question to the shared chat
 * widget, this keeps the answer on the page so it can be downloaded.
 */
export function MeasureAiDefinition({ measures, context }: { measures: MeasureDefinitionTarget[]; context: PowerAIContext }) {
  const apiOrigin = useAppStore((state) => state.apiOrigin);
  const [selectedKey, setSelectedKey] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [response, setResponse] = useState<AiChatResponse | null>(null);
  const [error, setError] = useState<PowerAiApiError | null>(null);

  const selected = useMemo(
    () => measures.find((measure) => measure.key === selectedKey) ?? measures[0] ?? null,
    [measures, selectedKey],
  );

  async function generate() {
    if (!selected) return;
    setIsGenerating(true);
    setError(null);
    setResponse(null);
    try {
      const answer = await explainObject(
        apiOrigin,
        buildChatRequest(questionFor(selected), AUDIENCE, { ...context, objectType: "measure", objectName: selected.name }),
      );
      setResponse(answer);
    } catch (caught) {
      setError(caught as PowerAiApiError);
    } finally {
      setIsGenerating(false);
    }
  }

  const markdown = response && selected ? toMarkdown(selected, response, context) : "";

  return <section className="border border-zinc-200">
    <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
      <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-teal-700" /> Measure definition with Power AI</p>
      <p className="mt-0.5 max-w-3xl text-xs leading-5 text-zinc-500">Select a measure for its full definition, read straight from gathered lineage evidence: what it calculates, its DAX, the tables and columns that DAX reads, and what it depends on. This is deterministic evidence, not a model answer, so it works even when the AI assistant is disabled. It stays on this page and can be downloaded.</p>
    </div>

    {!measures.length
      ? <p className="px-4 py-6 text-sm text-zinc-500">This semantic model returned no measures to define.</p>
      : <div className="space-y-5 p-4">
            <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_auto] md:items-end">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-600" htmlFor="measure-ai-measure">Measure</label>
                <select id="measure-ai-measure" value={selected?.key ?? ""} onChange={(event) => setSelectedKey(event.target.value)} className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100">
                  {measures.map((measure) => <option key={measure.key} value={measure.key}>{measure.table} · {measure.name}</option>)}
                </select>
              </div>
              <Button type="button" disabled={!selected || isGenerating} onClick={() => void generate()} className="h-10">
                {isGenerating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {isGenerating ? "Generating" : "Power AI definition"}
              </Button>
            </div>

            {error && <div className="border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-900">{error.message}</div>}

            {response && selected && <div className="space-y-3">
              {STATUS_NOTE[response.status] && <div className="border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{STATUS_NOTE[response.status]}</div>}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-2">
                <p className="text-sm font-semibold">{selected.table} · {selected.name}</p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" title="Download as plain text" onClick={() => download(toPlainText(markdown), "text/plain;charset=utf-8", `${fileStem(selected)}-definition.txt`)}><FileText className="size-3.5" /> .txt</Button>
                  <Button type="button" variant="outline" size="sm" title="Download as Markdown" onClick={() => download(markdown, "text/markdown;charset=utf-8", `${fileStem(selected)}-definition.md`)}><Download className="size-3.5" /> .md</Button>
                </div>
              </div>
              <div className="whitespace-pre-wrap border border-zinc-200 bg-white p-4 text-sm leading-6 text-zinc-800">{response.answer || "Power AI returned no answer text."}</div>
              <div className="grid gap-4 border-t border-zinc-200 pt-4 md:grid-cols-2">
                <EvidenceFacts title="DAX expression" mono value={selected.daxExpression} />
                <EvidenceFacts title="Reads from" value={`${selected.sourceColumn} in ${selected.sourceTable}`} />
              </div>
              {groupEvidence(response).map(([factType, items]) => <div key={factType}>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{FACT_TYPE_LABELS[factType] ?? factType}</p>
                <ul className="mt-1.5 space-y-1">
                  {items.map((item) => <li key={item.evidence_id} className="flex flex-wrap items-baseline gap-x-2 text-sm text-zinc-800">
                    <span className="font-medium">{item.object_name}</span>
                    {item.display_value && <span className="font-mono text-xs text-zinc-600">{item.display_value}</span>}
                    <span className="text-[11px] uppercase text-zinc-400">{item.object_type} · {item.source_type} · {item.verification_status}</span>
                  </li>)}
                </ul>
              </div>)}
              {response.evidence.length > 0 && <p className="text-xs text-zinc-500">Grounded in {response.evidence.length} verified {response.evidence.length === 1 ? "fact" : "facts"}{response.claims.length ? ` across ${response.claims.length} ${response.claims.length === 1 ? "claim" : "claims"}` : ""}. All of it is included in the downloads.</p>}
            </div>}
          </div>}
  </section>;
}
