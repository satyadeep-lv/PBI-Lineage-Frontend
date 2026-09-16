import { Loader2 } from "lucide-react";

import { isUnlocked, lockedReason } from "~/lib/power-ai-api";
import { usePowerAiStatus } from "~/lib/use-power-ai-status";
import { ChatInput } from "~/components/power-ai/chat-input";
import { ContextIndicator } from "~/components/power-ai/context-indicator";
import { ConversationView } from "~/components/power-ai/conversation-view";
import { PersonaSelector } from "~/components/power-ai/persona-selector";
import { PowerAiHeader } from "~/components/power-ai/power-ai-header";
import { PowerAiLocked } from "~/components/power-ai/power-ai-locked";
import { SuggestedQuestions } from "~/components/power-ai/suggested-questions";

/** The one Power AI implementation, rendered inside the global docked panel on every page. */
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
          <ContextIndicator />
          <PersonaSelector />
          <ConversationView />
          <SuggestedQuestions />
          <ChatInput />
        </>
      )}
    </div>
  );
}
