import { useEffect, useRef } from "react";

import { buildChatRequest, streamChatMessage, type AiUnavailableReason } from "~/lib/power-ai-api";
import { useAppStore } from "~/stores/app-store";
import { usePowerAiStore, type ChatMessage } from "~/stores/power-ai-store";

function messageId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `msg-${Math.random().toString(36).slice(2)}`;
}

export const AI_ERROR_COPY: Record<AiUnavailableReason, string> = {
  disabled: "Power AI is not enabled for this environment.",
  auth_required: "Sign in to Power BI to use Power AI.",
  provider_unavailable: "The AI backend is temporarily unavailable. Try again shortly.",
  rate_limited: "Power AI is receiving too many requests right now. Try again in a moment.",
  timeout: "That request took too long and was stopped. Try again.",
  conversation_error: "This conversation hit an error. Try starting a new one.",
  insufficient_permissions: "You don't have permission to ask about this.",
  no_evidence: "No lineage evidence was found to answer this.",
  unknown: "Something went wrong. Try again.",
};

/**
 * The single chat implementation shared by the desktop docked panel and the
 * tablet/mobile drawer — only the container differs, not this hook.
 */
export function usePowerAiChat() {
  const apiOrigin = useAppStore((state) => state.apiOrigin);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  function cancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    usePowerAiStore.getState().setStreaming(false);
    usePowerAiStore.getState().setLoading(false);
  }

  async function send(question: string) {
    const store = usePowerAiStore.getState();
    const text = question.trim();
    if (!text || store.loading || store.streaming) return;

    store.setError(undefined);
    store.setPendingQuestion(undefined);
    store.appendMessage({ id: messageId(), role: "user", text, createdAt: Date.now() });

    const assistantId = messageId();
    store.appendMessage({ id: assistantId, role: "assistant", text: "", pending: true, createdAt: Date.now() });
    store.setLoading(true);
    store.setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const request = buildChatRequest(text, store.audience, store.context, store.conversationId);

    let accumulated = "";
    await streamChatMessage(apiOrigin, request, {
      signal: controller.signal,
      onToken: (token) => {
        accumulated += token;
        usePowerAiStore.getState().updateMessage(assistantId, { text: accumulated, pending: true });
      },
      onEvidence: (evidence) => {
        usePowerAiStore.getState().updateMessage(assistantId, { evidence });
      },
      onConversationId: (conversationId) => {
        usePowerAiStore.getState().setConversationId(conversationId);
      },
      onDone: () => {
        usePowerAiStore.getState().updateMessage(assistantId, { pending: false });
        usePowerAiStore.getState().setLoading(false);
        usePowerAiStore.getState().setStreaming(false);
        abortRef.current = null;
      },
      onError: (error) => {
        usePowerAiStore.getState().updateMessage(assistantId, { pending: false, text: accumulated });
        // Always the vetted copy for the reason, never the raw backend/provider message — see section 24.
        usePowerAiStore.getState().setError(AI_ERROR_COPY[error.reason] ?? AI_ERROR_COPY.unknown);
        usePowerAiStore.getState().setLoading(false);
        usePowerAiStore.getState().setStreaming(false);
        abortRef.current = null;
      },
    });
  }

  return { send, cancel };
}

export function isEmptyConversation(messages: ChatMessage[]) {
  return messages.length === 0;
}
