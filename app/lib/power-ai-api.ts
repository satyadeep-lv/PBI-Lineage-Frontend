import { readJsonResponse } from "~/lib/api-catalog";
import type { PowerAIContext, PowerAiAudience, PowerAiEvidenceItem } from "~/stores/power-ai-store";
import { useAppStore } from "~/stores/app-store";

/**
 * Client for the backend's Power AI API. This endpoint family does not exist in
 * PBI-Lineage-Backend yet — field names below are this frontend's best-effort
 * mapping of the conceptual contract it was asked to build against. The frontend
 * never talks to an AI provider directly and never knows which provider (if any)
 * the backend uses; it only knows these three versioned, authenticated routes.
 */

export type AiUnavailableReason =
  | "disabled"
  | "auth_required"
  | "provider_unavailable"
  | "rate_limited"
  | "timeout"
  | "conversation_error"
  | "insufficient_permissions"
  | "no_evidence"
  | "unknown";

export type PowerAiStatusResponse = {
  enabled: boolean;
  authenticated: boolean;
  reason?: AiUnavailableReason;
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

export type PowerAiChatResponse = {
  conversation_id: string;
  message: string;
  evidence?: PowerAiEvidenceItem[];
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
  if (status === 401 || status === 403) return "auth_required";
  if (status === 404) return "disabled";
  if (status === 429) return "rate_limited";
  if (status === 408 || status === 504) return "timeout";
  if (status === 503) return "provider_unavailable";
  return "unknown";
}

/** A 404/network failure is today's reality (the backend route doesn't exist yet) — treated as "unavailable," never a page-breaking error. */
export async function getAiStatus(apiOrigin: string): Promise<PowerAiStatusResponse> {
  try {
    const response = await aiFetch(apiOrigin, "/api/v1/ai/status");
    if (!response.ok) return { enabled: false, authenticated: false, reason: reasonForStatus(response.status) };
    const body = (await readJsonResponse(response)) as Partial<PowerAiStatusResponse> | null;
    return { enabled: Boolean(body?.enabled), authenticated: Boolean(body?.authenticated), reason: body?.reason };
  } catch {
    return { enabled: false, authenticated: false, reason: "provider_unavailable" };
  }
}

/**
 * Which locked message to show. Deliberately trusts an explicit `reason` over
 * the `authenticated` flag alone — a reachable backend that simply doesn't
 * have the AI feature built/enabled yet (e.g. a 404 today) must say so, not
 * send the user off to redo Power BI setup as if that were the blocker.
 */
export function lockedReason(status: PowerAiStatusResponse | undefined): AiUnavailableReason {
  if (!status) return "provider_unavailable";
  if (status.reason) return status.reason;
  return status.authenticated ? "disabled" : "auth_required";
}

export function isUnlocked(status: PowerAiStatusResponse | undefined): boolean {
  return Boolean(status?.authenticated && status?.enabled);
}

export async function sendChatMessage(apiOrigin: string, request: PowerAiChatRequest): Promise<PowerAiChatResponse> {
  const response = await aiFetch(apiOrigin, "/api/v1/ai/chat", { method: "POST", body: JSON.stringify(request) });
  const body = await readJsonResponse(response);
  if (!response.ok) throw toApiError(body, response.status);
  return body as PowerAiChatResponse;
}

function toApiError(body: unknown, status: number): PowerAiApiError {
  const detail = typeof body === "object" && body !== null && "detail" in body && typeof (body as Record<string, unknown>).detail === "string"
    ? String((body as Record<string, unknown>).detail)
    : undefined;
  const reasonField = typeof body === "object" && body !== null && "reason" in body ? String((body as Record<string, unknown>).reason) : undefined;
  const reason = (reasonField as AiUnavailableReason) ?? reasonForStatus(status);
  return { reason, message: detail ?? "Power AI could not complete this request." };
}

/**
 * Streams POST /api/v1/ai/chat/stream as SSE (`data: {...}\n\n` frames) via the
 * Streams API — no client library needed. Each parsed frame is one of
 * {token} | {evidence} | {conversation_id} | {done:true} | {error}.
 */
export async function streamChatMessage(
  apiOrigin: string,
  request: PowerAiChatRequest,
  handlers: {
    onToken: (token: string) => void;
    onEvidence: (evidence: PowerAiEvidenceItem[]) => void;
    onConversationId: (conversationId: string) => void;
    onDone: () => void;
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
  } catch (error) {
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

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");

        const dataLine = frame.split("\n").find((line) => line.startsWith("data:"));
        if (!dataLine) continue;
        const payload = dataLine.slice("data:".length).trim();
        if (!payload) continue;

        try {
          const parsed = JSON.parse(payload) as Record<string, unknown>;
          if (typeof parsed.token === "string") handlers.onToken(parsed.token);
          if (Array.isArray(parsed.evidence)) handlers.onEvidence(parsed.evidence as PowerAiEvidenceItem[]);
          if (typeof parsed.conversation_id === "string") handlers.onConversationId(parsed.conversation_id);
          if (parsed.done) handlers.onDone();
          if (parsed.error) {
            handlers.onError({ reason: (parsed.reason as AiUnavailableReason) ?? "unknown", message: String(parsed.error) });
            return;
          }
        } catch {
          // Ignore malformed frames rather than surfacing a raw parse error.
        }
      }
    }
    handlers.onDone();
  } catch (error) {
    if (handlers.signal?.aborted) return;
    handlers.onError({ reason: "timeout", message: "The Power AI response was interrupted." });
  }
}
