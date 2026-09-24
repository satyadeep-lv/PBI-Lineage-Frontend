import { Loader2 } from "lucide-react";

import { isUnlocked, lockedReason } from "~/lib/power-ai-api";
import { usePowerAiStatus } from "~/lib/use-power-ai-status";
import { ChatInput } from "~/components/power-ai/chat-input";
import { ContextChip } from "~/components/power-ai/context-chip";
import { ConversationView } from "~/components/power-ai/conversation-view";
import { PowerAiHeader } from "~/components/power-ai/power-ai-header";
import { PowerAiLocked } from "~/components/power-ai/power-ai-locked";
import { SuggestedQuestions } from "~/components/power-ai/suggested-questions";

/**
 * The one Power AI implementation, rendered inside the global docked panel on
 * every page. It shows no persona picker: the assistant takes any question,
 * and every answer is written at full technical detail rather than being
 * tailored to a chosen reader. The context chip only says what the next
 * question will be about; nothing about the context is chosen here.
 */
export function PowerAiContent({ onCollapse }: { onCollapse?: () => void }) {
  const statusQuery = usePowerAiStatus();

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <PowerAiHeader onCollapse={onCollapse} />

      {statusQuery.isLoading ? (
        <div className="flex flex-1 items-center justify-center text-zinc-400">
          <Loader2 className="size-4 animate-spin" />
        </div>
      ) : !isUnlocked(statusQuery.data) ? (
        <PowerAiLocked reason={lockedReason(statusQuery.data)} />
      ) : (
        <>
          <ContextChip />
          <ConversationView />
          <SuggestedQuestions />
          <ChatInput />
        </>
      )}
    </div>
  );
}
