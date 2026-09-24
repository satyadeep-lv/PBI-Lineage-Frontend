import { useEffect, useRef } from "react";

import {
  buildChatRequest,
  isStreamingEnabled,
  sendChatMessage,
  streamChatMessage,
  type AiChatResponse,
  type AiFocus,
  type AiUnavailableReason,
  type PowerAiApiError,
} from "~/lib/power-ai-api";
import { usePowerAiStatus } from "~/lib/use-power-ai-status";
import { useAppStore } from "~/stores/app-store";
import { usePowerAiStore, type ChatMessage } from "~/stores/power-ai-store";

function messageId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `msg-${Math.random().toString(36).slice(2)}`;
}

export const AI_ERROR_COPY: Record<AiUnavailableReason, string> = {
  disabled: "Power AI is not enabled for this environment.",
  not_configured: "Power AI hasn't been configured yet.",
  auth_required: "Sign in to Power BI to use Power AI.",
  insufficient_permissions: "You don't have permission to ask about this.",
  provider_unavailable: "The AI backend is temporarily unavailable. Try again shortly.",
  rate_limited: "Power AI is receiving too many requests right now. Try again in a moment.",
  timeout: "That request took too long and was stopped. Try again.",
  conversation_error: "This conversation hit an error. Try starting a new one.",
  no_evidence: "No lineage evidence was found to answer this.",
  unknown: "Something went wrong. Try again.",
};

/**
 * Applies a finished AiChatResponse (from either transport) to the assistant
 * message — one code path so both stay identical. `answer` is authoritative;
 * `streamedText` is only a fallback so a response that ever arrives without
 * one still shows what streamed in rather than an empty bubble. The same goes
 * for `focus`: the response's wins over the stream's `metadata` one.
 */
function applyResponse(assistantId: string, response: AiChatResponse, streamedText = "", streamedFocus?: AiFocus | null) {
  usePowerAiStore.getState().updateMessage(assistantId, {
    text: response.answer || streamedText,
    pending: false,
    status: response.status,
    evidence: response.evidence,
    claims: response.claims,
    suggestedQuestions: response.suggested_questions,
    agent: response.agent ?? undefined,
    focus: response.focus !== undefined ? response.focus : streamedFocus,
    answeredAt: Date.now(),
  });
  usePowerAiStore.getState().setConversationId(response.conversation_id);
}

/**
 * The one request in flight, whichever component started it: the input's
 * Stop button must be able to cancel a stream a follow-up chip began.
 */
let active: { controller: AbortController; owner: object } | null = null;

/**
 * The single chat implementation shared by every Power AI container (desktop
 * docked panel, tablet/mobile drawer, global floating panel) — only the
 * container differs, not this hook. Routes to streaming or the non-streaming
 * fallback based on the backend's own reported `streaming_enabled` flag —
 * never calls a streaming endpoint the backend hasn't advertised.
 */
export function usePowerAiChat() {
  const apiOrigin = useAppStore((state) => state.apiOrigin);
  const statusQuery = usePowerAiStatus();
  const ownerRef = useRef<object>({});

  // Unmounting the component that started a stream (closing the widget) stops it.
  useEffect(() => () => {
    if (active?.owner === ownerRef.current) {
      active.controller.abort();
      active = null;
    }
  }, []);

  function cancel() {
    active?.controller.abort();
    active = null;
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
    const streaming = isStreamingEnabled(statusQuery.data);
    store.appendMessage({ id: assistantId, role: "assistant", text: "", pending: true, question: text, streamed: streaming, createdAt: Date.now() });
    store.setLoading(true);

    const request = buildChatRequest(text, store.audience, store.context, store.conversationId);

    if (streaming) {
      store.setStreaming(true);
      const controller = new AbortController();
      active = { controller, owner: ownerRef.current };
      let accumulated = "";
      let streamedFocus: AiFocus | null | undefined;
      const finish = () => {
        usePowerAiStore.getState().setLoading(false);
        usePowerAiStore.getState().setStreaming(false);
        if (active?.controller === controller) active = null;
      };

      await streamChatMessage(apiOrigin, request, {
        signal: controller.signal,
        onMetadata: (conversationId, _agent, focus) => {
          usePowerAiStore.getState().setConversationId(conversationId);
          if (focus !== undefined) {
            streamedFocus = focus;
            usePowerAiStore.getState().updateMessage(assistantId, { focus });
          }
        },
        onDelta: (text) => {
          accumulated += text;
          usePowerAiStore.getState().updateMessage(assistantId, { text: accumulated, pending: true });
        },
        onEvidence: (evidence) => usePowerAiStore.getState().updateMessage(assistantId, { evidence }),
        onComplete: (response) => {
          applyResponse(assistantId, response, accumulated, streamedFocus);
          finish();
        },
        onError: (error) => {
          // Always the vetted copy for the reason, never the raw backend/provider message — see section 22.
          usePowerAiStore.getState().updateMessage(assistantId, { pending: false });
          usePowerAiStore.getState().setError(AI_ERROR_COPY[error.reason] ?? AI_ERROR_COPY.unknown);
          finish();
        },
      });
      // Stopped by the user: no answer and no error, so the half-open message closes instead of spinning on.
      if (controller.signal.aborted) usePowerAiStore.getState().updateMessage(assistantId, { pending: false });
      return;
    }

    try {
      const response = await sendChatMessage(apiOrigin, request);
      applyResponse(assistantId, response);
    } catch (error) {
      const reason = (error as Partial<PowerAiApiError>).reason ?? "unknown";
      usePowerAiStore.getState().updateMessage(assistantId, { pending: false });
      usePowerAiStore.getState().setError(AI_ERROR_COPY[reason] ?? AI_ERROR_COPY.unknown);
    } finally {
      usePowerAiStore.getState().setLoading(false);
    }
  }

  return { send, cancel };
}

export function isEmptyConversation(messages: ChatMessage[]) {
  return messages.length === 0;
}
