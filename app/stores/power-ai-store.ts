import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type PowerAiAudience = "general" | "business" | "developer";

/** Identifiers only — never full lineage graphs or snapshot payloads sent through the browser for chat context. */
export type PowerAIContext = {
  workspaceId?: string;
  workspaceName?: string;
  reportId?: string;
  reportName?: string;
  semanticModelId?: string;
  semanticModelName?: string;
  pageId?: string;
  objectType?: "report" | "visual" | "semantic_model" | "table" | "column" | "calculated_column" | "measure" | "source_object";
  objectId?: string;
  objectName?: string;
  route?: string;
};

export type PowerAiEvidenceItem = {
  label: string;
  value: string;
  /** Only shown in "developer" audience mode. */
  technical?: boolean;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** True while an assistant message is still receiving streamed tokens. */
  pending?: boolean;
  evidence?: PowerAiEvidenceItem[];
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
  /** The global floating widget's open/closed state — shared so "Ask Power AI" can open it from any page. Deliberately excluded from `partialize` below, so it is never persisted. */
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
  persist(
    (set) => ({
      conversationId: undefined,
      messages: [],
      loading: false,
      streaming: false,
      audience: "general",
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
    }),
    {
      name: "pbi-power-ai",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ audience: state.audience }),
    },
  ),
);
