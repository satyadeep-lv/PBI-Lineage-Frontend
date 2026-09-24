import { Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";

import { usePowerAiChat } from "~/lib/use-power-ai-chat";
import { usePowerAiStore } from "~/stores/power-ai-store";
import { AiErrorBanner } from "~/components/power-ai/ai-error-banner";
import { AssistantMessage } from "~/components/power-ai/assistant-message";

export function ConversationView() {
  const messages = usePowerAiStore((state) => state.messages);
  const audience = usePowerAiStore((state) => state.audience);
  const loading = usePowerAiStore((state) => state.loading);
  const error = usePowerAiStore((state) => state.error);
  const queuedQuestion = usePowerAiStore((state) => state.queuedQuestion);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { send } = usePowerAiChat();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // A question chosen elsewhere (the measure panel's follow-ups) is sent once the chat is ready for it.
  useEffect(() => {
    if (!queuedQuestion || loading) return;
    usePowerAiStore.getState().queueQuestion(undefined);
    void send(queuedQuestion);
    // `send` is recreated every render; the queue itself is what should trigger this.
  }, [queuedQuestion, loading]);

  const lastAssistantId = [...messages].reverse().find((message) => message.role === "assistant")?.id;
  // An assistant turn that ended with neither text nor a response status failed; the error banner says so instead of an empty bubble.
  const shown = messages.filter((message) => message.role === "user" || message.pending || message.text || message.status);

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
      {shown.map((message) =>
        message.role === "user" ? (
          <div key={message.id} className="flex justify-end">
            <div className="max-w-[88%] rounded-lg bg-zinc-950 px-3 py-2 text-sm leading-6 text-white">
              <p className="whitespace-pre-wrap">{message.text}</p>
            </div>
          </div>
        ) : (
          <AssistantMessage
            key={message.id}
            message={message}
            latest={message.id === lastAssistantId}
            busy={loading}
            audience={audience}
            onSend={(question) => void send(question)}
          />
        ),
      )}

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
