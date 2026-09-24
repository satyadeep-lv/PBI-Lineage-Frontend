import { create } from "zustand";
import type { AiChatResponseStatus, EvidenceItem, GroundedClaim, PowerAIContext, PowerAiAudience } from "~/lib/power-ai-api";

// Re-exported so existing `from "~/stores/power-ai-store"` imports keep working —
// app/lib/power-ai-api.ts is the canonical source for these two types.
export type { PowerAIContext, PowerAiAudience };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** True while an assistant message is still receiving streamed tokens. */
  pending?: boolean;
  /** Backend-verified facts grounding this answer. Never fabricated or completed by the frontend. */
  evidence?: EvidenceItem[];
  /** Backend-supplied claim -> evidence mappings. Only rendered, never computed locally. */
  claims?: GroundedClaim[];
  /** How well-grounded this answer is; "answered" is the only fully-resolved state. */
  status?: AiChatResponseStatus;
  /** Backend-supplied contextual follow-ups for this specific answer. */
  suggestedQuestions?: string[];
  /** Which backend agent produced this answer, if the backend reports one. */
  agent?: string;
  createdAt: number;
};

export type PowerAIState = {
  conversationId?: string;
  messages: ChatMessage[];
  loading: boolean;
  streaming: boolean;
  audience: PowerAiAudience;
  context: PowerAIContext;
  error?: string;
  /** A question seeded by "Ask Power AI" that the chat input should prefill next render. */
  pendingQuestion?: string;
  /** The global floating widget's open/closed state — shared so "Ask Power AI" can open it from any page. Nothing in this store is persisted, so it always starts closed. */
  widgetOpen: boolean;

  setContext: (context: PowerAIContext) => void;
  mergeContext: (patch: PowerAIContext) => void;
  setAudience: (audience: PowerAiAudience) => void;
  appendMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void;
  setLoading: (loading: boolean) => void;
  setStreaming: (streaming: boolean) => void;
  setError: (error: string | undefined) => void;
  setConversationId: (conversationId: string | undefined) => void;
  setPendingQuestion: (question: string | undefined) => void;
  setWidgetOpen: (open: boolean) => void;
  resetConversation: () => void;
};

export const usePowerAiStore = create<PowerAIState>()(
  ((set) => ({
      conversationId: undefined,
      messages: [],
      loading: false,
      streaming: false,
      audience: "developer",
      context: {},
      error: undefined,
      pendingQuestion: undefined,
      widgetOpen: false,

      setContext: (context) => set({ context }),
      mergeContext: (patch) => set((state) => ({ context: { ...state.context, ...patch } })),
      setAudience: (audience) => set({ audience }),
      appendMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
      updateMessage: (id, patch) =>
        set((state) => ({ messages: state.messages.map((message) => (message.id === id ? { ...message, ...patch } : message)) })),
      setLoading: (loading) => set({ loading }),
      setStreaming: (streaming) => set({ streaming }),
      setError: (error) => set({ error }),
      setConversationId: (conversationId) => set({ conversationId }),
      setPendingQuestion: (pendingQuestion) => set({ pendingQuestion }),
      setWidgetOpen: (widgetOpen) => set({ widgetOpen }),
      resetConversation: () => set({ conversationId: undefined, messages: [], error: undefined, loading: false, streaming: false }),
    })),
);
