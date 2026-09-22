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
    page_id?: string;
    object_type?: string;
    object_id?: string;
    object_name?: string;
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
 * `display_value` are display hints only.
 */
export type EvidenceItem = {
  evidence_id: string;
  object_type: string;
  object_id?: string;
  object_name: string;
  fact_type: "definition" | "dependency" | "relationship" | "source" | "usage" | "impact";
  source_type: "pbir" | "tmdl" | "xmla" | "scanner" | "lineage_graph" | "snowflake";
  verification_status: "verified" | "partial" | "unresolved";
  display_value?: string;
  workspace_id?: string;
  report_id?: string;
  semantic_model_id?: string;
};

export type AiUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type AiChatResponseStatus = "answered" | "insufficient_evidence" | "ambiguous" | "conflicting_evidence" | "out_of_scope";

/** The one chat response shape — used by both the non-streaming call and the streamed `complete` event. */
export type AiChatResponse = {
  conversation_id: string;
  status: AiChatResponseStatus;
  answer: string;
  claims: GroundedClaim[];
  evidence: EvidenceItem[];
  agent?: string;
  suggested_questions: string[];
  usage?: AiUsage;
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
 * via the Streams API — no client library needed:
 *   metadata  -> { conversation_id, agent? }              (fires first)
 *   delta     -> { text }                                  (progressive rendering)
 *   evidence  -> { evidence: EvidenceItem[] }               (incremental, merged)
 *   complete  -> AiChatResponse                             (authoritative final
 *                answer — REPLACES the accumulated delta text, so the final
 *                message never duplicates what streamed in)
 *   error     -> { error: string; reason?: AiUnavailableReason }
 */
export async function streamChatMessage(
  apiOrigin: string,
  request: PowerAiChatRequest,
  handlers: {
    onMetadata: (conversationId: string, agent?: string) => void;
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
        if (typeof parsed.conversation_id === "string") handlers.onMetadata(parsed.conversation_id, typeof parsed.agent === "string" ? parsed.agent : undefined);
        break;
      case "delta":
        if (typeof parsed.text === "string") handlers.onDelta(parsed.text);
        break;
      case "evidence":
        if (Array.isArray(parsed.evidence)) handlers.onEvidence(parsed.evidence as EvidenceItem[]);
        break;
      case "complete":
        handlers.onComplete(parsed as unknown as AiChatResponse);
        break;
      case "error":
        handlers.onError({ reason: (parsed.reason as AiUnavailableReason) ?? "unknown", message: typeof parsed.error === "string" ? parsed.error : "Power AI could not complete this request." });
        break;
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
  } catch {
    if (handlers.signal?.aborted) return;
    handlers.onError({ reason: "timeout", message: "The Power AI response was interrupted." });
  }
}
