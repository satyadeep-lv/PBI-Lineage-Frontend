import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";

import { cn } from "~/lib/utils";
import { usePowerAiStore } from "~/stores/power-ai-store";
import { AiErrorBanner } from "~/components/power-ai/ai-error-banner";
import { EvidenceView } from "~/components/power-ai/evidence-view";

export function ConversationView() {
  const messages = usePowerAiStore((state) => state.messages);
  const audience = usePowerAiStore((state) => state.audience);
  const error = usePowerAiStore((state) => state.error);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
      {messages.map((message) => (
        <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
          <div
            className={cn(
              "max-w-[88%] rounded-lg px-3 py-2 text-sm leading-6",
              message.role === "user" ? "bg-zinc-950 text-white" : "border border-zinc-200 bg-white text-zinc-900",
            )}
          >
            {message.pending && !message.text ? (
              <span className="flex items-center gap-2 text-zinc-500">
                <Loader2 className="size-3.5 animate-spin" /> Thinking
              </span>
            ) : (
              <p className="whitespace-pre-wrap">{message.text}</p>
            )}
            {message.evidence && message.evidence.length > 0 && <EvidenceView evidence={message.evidence} audience={audience} />}
          </div>
        </div>
      ))}

      {error && <AiErrorBanner message={error} />}

      {!messages.length && !error && (
        <div className="flex h-full flex-col items-center justify-center py-10 text-center text-zinc-400">
          <Sparkles className="size-6" />
          <p className="mt-2 max-w-[220px] text-xs leading-5">Ask Power AI about anything you're viewing here.</p>
        </div>
      )}
    </div>
  );
}
