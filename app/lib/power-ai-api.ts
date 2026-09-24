import { readJsonResponse } from "~/lib/api-catalog";
import { useAppStore } from "~/stores/app-store";

/**
 * Client for the backend's versioned, evidence-grounded Power AI API. The
 * frontend never talks to an AI provider directly and never knows which
 * provider (if any) the backend uses; it only knows the three authenticated
 * `/api/v1/ai/*` routes. This file is the single canonical source
 * for every Power AI wire type — the store and components import from here
 * (re-exported by power-ai-store.ts for convenience) rather than redeclaring
 * shapes, so the contract can't drift.
 */

export type PowerAiAudience = "general" | "business" | "developer";

/** Identifiers only — never full lineage graphs or snapshot payloads sent through the browser for chat context. */
export type PowerAIContext = {
  workspaceId?: string;
  workspaceName?: string;
  reportId?: string;
  reportName?: string;
  semanticModelId?: string;
  semanticModelName?: string;
  /** The semantic model's own workspace, which is often not the report's. Saves the backend searching for it. */
  semanticModelWorkspaceId?: string;
  pageId?: string;
  objectType?: "report" | "visual" | "semantic_model" | "table" | "column" | "calculated_column" | "measure" | "source_object";
  objectId?: string;
  objectName?: string;
  route?: string;
};

export type AiUnavailableReason =
  | "disabled"
  | "not_configured"
  | "auth_required"
  | "insufficient_permissions"
  | "provider_unavailable"
  | "rate_limited"
  | "timeout"
  | "conversation_error"
  | "no_evidence"
  | "unknown";

/**
 * An HTTP 401/403 on the status endpoint IS the authentication signal — no
 * frontend-invented `authenticated` boolean. `enabled`/`configured` only mean
 * anything once the request actually succeeded.
 */
export type PowerAiStatus =
  | { state: "unauthenticated" }
  | { state: "forbidden" }
  | { state: "unavailable"; reason: AiUnavailableReason }
  | {
      state: "ready";
      enabled: boolean;
      configured: boolean;
      provider?: string;
      model?: string;
      streamingEnabled: boolean;
    };

export type PowerAiChatRequest = {
  conversation_id?: string;
  message: string;
  audience: PowerAiAudience;
  context: {
    workspace_id?: string;
    report_id?: string;
    semantic_model_id?: string;
    semantic_model_workspace_id?: string;
    page_id?: string;
    object_type?: string;
    object_id?: string;
    /** Resolves exactly in the `Table[Name]` form, which removes ambiguity when a name exists in several tables. */
    object_name?: string;
    /** Ignored by the backend; harmless. */
    route?: string;
  };
};

/** One text claim in the answer, grounded to specific evidence — never invented by the frontend. */
export type GroundedClaim = {
  text: string;
  evidence_ids: string[];
};

/**
 * A single backend-verified fact. `object_id`/`workspace_id`/`report_id`/
 * `semantic_model_id` are authoritative references; `object_name` and
 * `display_value` are display hints only. Every nullable field is sent as
 * `null`, never omitted. Which answer section an item belongs to follows from
 * `(fact_type, object_type)` — see `app/lib/power-ai-evidence.ts`.
 */
export type EvidenceItem = {
  /** "E1", "E2", ... unique within one response; claims cite these. */
  evidence_id: string;
  /** An open set: "measure", "column", "semantic_table", "physical_source", "visual", "context", "coverage", ... */
  object_type: string;
  object_id: string | null;
  object_name: string;
  fact_type: "definition" | "dependency" | "relationship" | "source" | "usage" | "impact";
  /** "other" marks derived facts such as coverage notes. */
  source_type: "pbir" | "tmdl" | "xmla" | "scanner" | "lineage_graph" | "snowflake" | "other";
  /** The DAX string for a measure or calculated column definition; structured data otherwise. */
  value: unknown;
  /** A plain-English reading of a definition. */
  plain_language: string | null;
  /** One readable sentence saying what this fact is — this is what to show. */
  display_value: string | null;
  workspace_id: string | null;
  report_id: string | null;
  semantic_model_id: string | null;
  verification_status: "verified" | "partial" | "unresolved";
  /** ISO timestamp. */
  retrieved_at: string;
  /** Where a reader could verify it, e.g. "definition/tables/Orders.tmdl". */
  source_reference: string | null;
  /** Not sent today. If it ever appears it names the answer section and wins over the local section table. */
  section?: string;
};

/** Non-null only when a model wrote the answer; null when it was rendered straight from the evidence. */
export type AiUsage = { provider: string; model: string; tokens: number };

/** One read-only tool the model chose to run while answering. */
export type AiToolCall = {
  round: number;
  tool: string;
  arguments: Record<string, unknown>;
  evidence_count: number;
  duration_ms: number;
  /** "completed" | "no_evidence" | "repeated" | "unknown_tool" */
  status: string;
};

export type AiChatResponseStatus = "answered" | "insufficient_evidence" | "ambiguous" | "conflicting_evidence" | "out_of_scope";

/**
 * What an answer is about, as the backend resolved it: from the page's own
 * context, from a name in the question, or from what the conversation was
 * already about. Every ID came from the backend's resolver, never from here.
 * Not sent by older backends; `null` when nothing was resolved.
 */
export type AiFocus = {
  source: "page" | "question" | "conversation";
  workspace_id?: string | null;
  workspace_name?: string | null;
  report_id?: string | null;
  report_name?: string | null;
  semantic_model_id?: string | null;
  semantic_model_name?: string | null;
  object_type?: string | null;
  object_name?: string | null;
};

/**
 * The one chat response shape — used by `/chat`, `/explain` and the streamed
 * `complete` event. `answer` is plain text laid out as titled sections (see
 * `app/lib/power-ai-answer.ts`), never Markdown.
 */
export type AiChatResponse = {
  conversation_id: string;
  status: AiChatResponseStatus;
  answer: string;
  claims: GroundedClaim[];
  evidence: EvidenceItem[];
  /** "tool_loop", "measure_agent", "report_agent", ... */
  agent: string | null;
  suggested_questions: string[];
  /** Empty unless the model chose tools. */
  tool_trace: AiToolCall[];
  usage: AiUsage | null;
  /** Absent from older backends. */
  focus?: AiFocus | null;
};

export type PowerAiApiError = {
  reason: AiUnavailableReason;
  message: string;
};

function toRequestContext(context: PowerAIContext): PowerAiChatRequest["context"] {
  return {
    workspace_id: context.workspaceId,
    report_id: context.reportId,
    semantic_model_id: context.semanticModelId,
    semantic_model_workspace_id: context.semanticModelWorkspaceId,
    page_id: context.pageId,
    object_type: context.objectType,
    object_id: context.objectId,
    object_name: context.objectName,
    route: context.route,
  };
}

export function buildChatRequest(message: string, audience: PowerAiAudience, context: PowerAIContext, conversationId?: string): PowerAiChatRequest {
  return { conversation_id: conversationId, message, audience, context: toRequestContext(context) };
}

async function aiFetch(apiOrigin: string, path: string, init?: RequestInit): Promise<Response> {
  const adminKey = useAppStore.getState().adminKey.trim();
  return fetch(`${apiOrigin}${path}`, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...(adminKey ? { "X-Lineage-Admin-Key": adminKey } : {}), ...init?.headers },
  });
}

function reasonForStatus(status: number): AiUnavailableReason {
  if (status === 404) return "disabled";
  if (status === 429) return "rate_limited";
  if (status === 408 || status === 504) return "timeout";
  if (status === 503) return "provider_unavailable";
  return "unknown";
}

type RawStatusBody = {
  enabled?: boolean;
  configured?: boolean;
  provider?: string;
  model?: string;
  streaming_enabled?: boolean;
};

/** A network failure or 404 (today's reality — the route doesn't exist yet) is "unavailable," never a page-breaking error. */
export async function getAiStatus(apiOrigin: string): Promise<PowerAiStatus> {
  try {
    const response = await aiFetch(apiOrigin, "/api/v1/ai/status");
    if (response.status === 401) return { state: "unauthenticated" };
    if (response.status === 403) return { state: "forbidden" };
    if (!response.ok) return { state: "unavailable", reason: reasonForStatus(response.status) };
    const body = (await readJsonResponse(response)) as RawStatusBody | null;
    return {
      state: "ready",
      enabled: Boolean(body?.enabled),
      configured: Boolean(body?.configured),
      provider: body?.provider,
      model: body?.model,
      streamingEnabled: Boolean(body?.streaming_enabled),
    };
  } catch {
    return { state: "unavailable", reason: "provider_unavailable" };
  }
}

/**
 * Which locked message to show. Trusts the discriminated `PowerAiStatus`
 * directly — a reachable backend that simply doesn't have the AI feature
 * built/enabled/configured yet must say so, not send the user off to redo
 * Power BI setup as if that were the blocker.
 */
export function lockedReason(status: PowerAiStatus | undefined): AiUnavailableReason {
  if (!status) return "provider_unavailable";
  if (status.state === "unauthenticated") return "auth_required";
  if (status.state === "forbidden") return "insufficient_permissions";
  if (status.state === "unavailable") return status.reason;
  if (!status.configured) return "not_configured";
  return "disabled";
}

export function isUnlocked(status: PowerAiStatus | undefined): boolean {
  return Boolean(status?.state === "ready" && status.enabled && status.configured);
}

export function isStreamingEnabled(status: PowerAiStatus | undefined): boolean {
  return Boolean(status?.state === "ready" && status.streamingEnabled);
}

export async function sendChatMessage(apiOrigin: string, request: PowerAiChatRequest): Promise<AiChatResponse> {
  const response = await aiFetch(apiOrigin, "/api/v1/ai/chat", { method: "POST", body: JSON.stringify(request) });
  const body = await readJsonResponse(response);
  if (!response.ok) throw toApiError(body, response.status);
  return body as AiChatResponse;
}

/**
 * Same request and response shape as `/ai/chat`, always grounded in gathered
 * lineage evidence. When AI is enabled and configured, a model writes the
 * answer up from that evidence and `usage` names the model; otherwise the
 * answer is rendered straight from the evidence and `usage` is null. Both are
 * valid, grounded answers, so this works either way — which is why the
 * measure detail panel uses it instead of `/chat`.
 */
export async function explainObject(apiOrigin: string, request: PowerAiChatRequest): Promise<AiChatResponse> {
  const response = await aiFetch(apiOrigin, "/api/v1/ai/explain", { method: "POST", body: JSON.stringify(request) });
  const body = await readJsonResponse(response);
  if (!response.ok) throw toApiError(body, response.status);
  return body as AiChatResponse;
}

/** A focus is only trusted when it names where it came from; anything else is treated as absent. */
export function isFocus(value: unknown): value is AiFocus {
  if (typeof value !== "object" || value === null) return false;
  const source = (value as Record<string, unknown>).source;
  return source === "page" || source === "question" || source === "conversation";
}

function toApiError(body: unknown, status: number): PowerAiApiError {
  const detail = typeof body === "object" && body !== null && "detail" in body && typeof (body as Record<string, unknown>).detail === "string"
    ? String((body as Record<string, unknown>).detail)
    : undefined;
  const reasonField = typeof body === "object" && body !== null && "reason" in body ? String((body as Record<string, unknown>).reason) : undefined;
  if (status === 401) return { reason: "auth_required", message: detail ?? "Sign in to Power BI to use Power AI." };
  if (status === 403) return { reason: "insufficient_permissions", message: detail ?? "You don't have permission to ask about this." };
  const reason = (reasonField as AiUnavailableReason) ?? reasonForStatus(status);
  return { reason, message: detail ?? "Power AI could not complete this request." };
}

/**
 * Streams POST /api/v1/ai/chat/stream as named SSE events (`event: X\ndata: {...}\n\n`)
 * via the Streams API — no client library needed. The backend grounds the
 * whole answer first, then emits, in order:
 *   metadata  -> { conversation_id, status, agent, focus? }
 *   evidence  -> { evidence: EvidenceItem[] }
 *   delta     -> { text, delta }   (`delta` duplicates `text`; the pieces join
 *                back to exactly `complete.answer`, whitespace included)
 *   complete  -> AiChatResponse    (authoritative — its `answer` REPLACES the
 *                accumulated delta text, so nothing is duplicated or lost)
 * On failure the only event is:
 *   error     -> { code, message, error, reason: AiUnavailableReason }
 * A stream that closes with neither `complete` nor `error` is reported as an
 * error, so the message can never wait forever.
 */
export async function streamChatMessage(
  apiOrigin: string,
  request: PowerAiChatRequest,
  handlers: {
    onMetadata: (conversationId: string, agent?: string, focus?: AiFocus | null) => void;
    onDelta: (text: string) => void;
    onEvidence: (evidence: EvidenceItem[]) => void;
    onComplete: (response: AiChatResponse) => void;
    onError: (error: PowerAiApiError) => void;
    signal?: AbortSignal;
  },
): Promise<void> {
  let response: Response;
  try {
    response = await aiFetch(apiOrigin, "/api/v1/ai/chat/stream", {
      method: "POST",
      body: JSON.stringify(request),
      headers: { Accept: "text/event-stream" },
      signal: handlers.signal,
    });
  } catch {
    if (handlers.signal?.aborted) return;
    handlers.onError({ reason: "provider_unavailable", message: "Power AI could not be reached." });
    return;
  }

  if (!response.ok || !response.body) {
    const body = await readJsonResponse(response).catch(() => null);
    handlers.onError(toApiError(body, response.status));
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;

  function handleFrame(frame: string) {
    const lines = frame.split("\n");
    const eventLine = lines.find((line) => line.startsWith("event:"));
    const dataLine = lines.find((line) => line.startsWith("data:"));
    if (!dataLine) return;
    const eventName = eventLine ? eventLine.slice("event:".length).trim() : "delta";
    const payload = dataLine.slice("data:".length).trim();
    if (!payload) return;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return; // Ignore malformed frames rather than surfacing a raw parse error.
    }

    switch (eventName) {
      case "metadata":
        if (typeof parsed.conversation_id === "string") {
          handlers.onMetadata(
            parsed.conversation_id,
            typeof parsed.agent === "string" ? parsed.agent : undefined,
            isFocus(parsed.focus) ? parsed.focus : undefined,
          );
        }
        break;
      case "delta": {
        const text = parsed.text ?? parsed.delta;
        if (typeof text === "string") handlers.onDelta(text);
        break;
      }
      case "evidence":
        if (Array.isArray(parsed.evidence)) handlers.onEvidence(parsed.evidence as EvidenceItem[]);
        break;
      case "complete":
        finished = true;
        handlers.onComplete(parsed as unknown as AiChatResponse);
        break;
      case "error": {
        finished = true;
        const message = parsed.error ?? parsed.message;
        handlers.onError({
          reason: typeof parsed.reason === "string" ? (parsed.reason as AiUnavailableReason) : "unknown",
          message: typeof message === "string" ? message : "Power AI could not complete this request.",
        });
        break;
      }
      default:
        break;
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        handleFrame(frame);
        boundary = buffer.indexOf("\n\n");
      }
    }
    if (buffer.trim()) handleFrame(buffer);
  } catch {
    if (handlers.signal?.aborted) return;
    handlers.onError({ reason: "timeout", message: "The Power AI response was interrupted." });
    return;
  }
  if (!finished && !handlers.signal?.aborted) handlers.onError({ reason: "unknown", message: "The Power AI response ended before it was complete." });
}
