import { ChevronsRight, RotateCcw, Sparkles } from "lucide-react";

import { usePowerAiStore } from "~/stores/power-ai-store";

export function PowerAiHeader({ onCollapse }: { onCollapse?: () => void }) {
  const hasMessages = usePowerAiStore((state) => state.messages.length > 0);
  const resetConversation = usePowerAiStore((state) => state.resetConversation);

  return (
    <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-gradient-to-br from-violet-600 to-cyan-600 text-white">
          <Sparkles className="size-4" />
        </span>
        <h2 className="min-w-0 truncate text-sm font-semibold text-zinc-950">Power AI</h2>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {hasMessages && (
          <button
            type="button"
            onClick={resetConversation}
            aria-label="Start a new conversation"
            title="Start a new conversation"
            className="flex size-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-950"
          >
            <RotateCcw className="size-3.5" />
          </button>
        )}
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Collapse Power AI"
            title="Collapse Power AI"
            className="flex size-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-950"
          >
            <ChevronsRight className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
