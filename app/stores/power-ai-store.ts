import { create } from "zustand";
import type { AiChatResponseStatus, AiFocus, EvidenceItem, GroundedClaim, PowerAIContext, PowerAiAudience } from "~/lib/power-ai-api";

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
  /** What the backend says this answer is about. Absent from older backends. */
  focus?: AiFocus | null;
  /** The question an assistant message answers, so "Ask again" can repeat it. */
  question?: string;
  /** Streamed in, so its text is revealed progressively once rather than appearing at once. */
  streamed?: boolean;
  createdAt: number;
  /** When the final response arrived. */
  answeredAt?: number;
};

export type PowerAIState = {
  conversationId?: string;
  messages: ChatMessage[];
  loading: boolean;
  streaming: boolean;
  audience: PowerAiAudience;
  context: PowerAIContext;
  /**
   * When anything but `route` in `context` last changed. The context chip
   * shows the last answer's `focus` only if that answer came after this, so
   * moving to another report, or clearing the context, is never masked by an
   * older answer.
   */
  contextChangedAt: number;
  error?: string;
  /** A question seeded by "Ask Power AI" that the chat input should prefill next render. */
  pendingQuestion?: string;
  /** A question to send as soon as the chat is open, e.g. a follow-up chosen in the measure panel. */
  queuedQuestion?: string;
  /** The global floating widget's open/closed state — shared so "Ask Power AI" can open it from any page. Nothing in this store is persisted, so it always starts closed. */
  widgetOpen: boolean;
  /** The widget at its wide size, for long answers. Not persisted. */
  expanded: boolean;

  setContext: (context: PowerAIContext) => void;
  mergeContext: (patch: PowerAIContext) => void;
  /** Clears what the page selected for the next question, keeping `route`. */
  clearPageContext: () => void;
  setAudience: (audience: PowerAiAudience) => void;
  appendMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void;
  setLoading: (loading: boolean) => void;
  setStreaming: (streaming: boolean) => void;
  setError: (error: string | undefined) => void;
  setConversationId: (conversationId: string | undefined) => void;
  setPendingQuestion: (question: string | undefined) => void;
  queueQuestion: (question: string | undefined) => void;
  setWidgetOpen: (open: boolean) => void;
  setExpanded: (expanded: boolean) => void;
  resetConversation: () => void;
};

function sameContext(a: PowerAIContext, b: PowerAIContext, ignoreRoute: boolean) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)] as Array<keyof PowerAIContext>);
  return [...keys].every((key) => (ignoreRoute && key === "route") || a[key] === b[key]);
}

/**
 * Pages merge their selection in from effects, often with unchanged values.
 * Writing only real changes keeps `contextChangedAt` meaningful.
 */
function nextContext(state: PowerAIState, context: PowerAIContext): Partial<PowerAIState> {
  if (sameContext(state.context, context, false)) return {};
  return sameContext(state.context, context, true) ? { context } : { context, contextChangedAt: Date.now() };
}

export const usePowerAiStore = create<PowerAIState>()(
  ((set) => ({
      conversationId: undefined,
      messages: [],
      loading: false,
      streaming: false,
      audience: "developer",
      context: {},
      contextChangedAt: 0,
      error: undefined,
      pendingQuestion: undefined,
      queuedQuestion: undefined,
      widgetOpen: false,
      expanded: false,

      setContext: (context) => set((state) => nextContext(state, context)),
      mergeContext: (patch) => set((state) => nextContext(state, { ...state.context, ...patch })),
      clearPageContext: () => set((state) => ({ context: { route: state.context.route }, contextChangedAt: Date.now() })),
      setAudience: (audience) => set({ audience }),
      appendMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
      updateMessage: (id, patch) =>
        set((state) => ({ messages: state.messages.map((message) => (message.id === id ? { ...message, ...patch } : message)) })),
      setLoading: (loading) => set({ loading }),
      setStreaming: (streaming) => set({ streaming }),
      setError: (error) => set({ error }),
      setConversationId: (conversationId) => set({ conversationId }),
      setPendingQuestion: (pendingQuestion) => set({ pendingQuestion }),
      queueQuestion: (queuedQuestion) => set({ queuedQuestion }),
      setWidgetOpen: (widgetOpen) => set({ widgetOpen }),
      setExpanded: (expanded) => set({ expanded }),
      resetConversation: () => set({ conversationId: undefined, messages: [], error: undefined, loading: false, streaming: false }),
    })),
);
