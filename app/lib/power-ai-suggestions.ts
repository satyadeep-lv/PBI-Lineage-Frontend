import type { PowerAIContext } from "~/stores/power-ai-store";

/** Deterministic, per-object-type suggestions — no LLM call needed just to populate these. */
export function suggestedQuestionsFor(context: PowerAIContext): string[] {
  const name = context.objectName ? ` ${context.objectName}` : "";

  switch (context.objectType) {
    case "measure":
      return [`Explain this measure`, `What feeds${name}?`, `What depends on${name}?`, `What happens if it changes?`];
    case "calculated_column":
      return [`Explain this calculated column`, `What feeds${name}?`, `What depends on${name}?`, `What happens if it changes?`];
    case "column":
      return [`Explain this column`, `Where does this column's data come from?`, `What depends on${name}?`, `What happens if it changes?`];
    case "table":
      return [`Explain this table`, `Where does this table's data come from?`, `Which measures use this table?`, `What happens if it changes?`];
    case "semantic_model":
      return [`Explain this semantic model`, `Which reports use this model?`, `What tables and measures are important here?`, `What happens if it changes?`];
    // Only what the backend answers from a report's own evidence, which has no impact analysis of its own.
    case "report":
      return [
        `Explain this report`,
        `Which semantic model powers it?`,
        `Where does the data come from?`,
        `Which measures are used?`,
        `Which database tables feed this report?`,
      ];
    case "visual":
      return [`Explain this visual`, `Which fields does this visual use?`, `Where does this visual's data come from?`];
    case "source_object":
      return [`Explain this source object`, `What semantic objects use this source?`, `What reports are ultimately affected by this source?`];
    default:
      return [`What can Power AI help me with here?`, `Explain what I'm looking at`, `What should I check before making a change?`];
  }
}
