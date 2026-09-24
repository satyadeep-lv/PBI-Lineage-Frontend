import { ChevronsRight, Maximize2, Minimize2, RotateCcw, Sparkles } from "lucide-react";

import { usePowerAiStore } from "~/stores/power-ai-store";

const ICON_BUTTON = "flex size-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600";

export function PowerAiHeader({ onCollapse }: { onCollapse?: () => void }) {
  const hasMessages = usePowerAiStore((state) => state.messages.length > 0);
  const resetConversation = usePowerAiStore((state) => state.resetConversation);
  const expanded = usePowerAiStore((state) => state.expanded);
  const setExpanded = usePowerAiStore((state) => state.setExpanded);

  return (
    <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-teal-700 text-white">
          <Sparkles className="size-4" />
        </span>
        <h2 className="min-w-0 truncate text-sm font-semibold text-zinc-950">Power AI</h2>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {hasMessages && (
          <button type="button" onClick={resetConversation} aria-label="Start a new conversation" title="Start a new conversation" className={ICON_BUTTON}>
            <RotateCcw className="size-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-pressed={expanded}
          aria-label="Widen Power AI"
          title={expanded ? "Narrow Power AI" : "Widen Power AI for long answers"}
          className={ICON_BUTTON}
        >
          {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </button>
        {onCollapse && (
          <button type="button" onClick={onCollapse} aria-label="Collapse Power AI" title="Collapse Power AI" className={ICON_BUTTON}>
            <ChevronsRight className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
