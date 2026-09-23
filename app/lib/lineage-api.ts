import { readJsonResponse } from "~/lib/api-catalog";
import { useAppStore } from "~/stores/app-store";

export type LineageWorkspace = { id: string; name: string };
export type LineageReportBinding = { report_id: string; semantic_model_id?: string | null; status: "matched" | "unresolved" };
export type LineageEstateWorkspaceInventory = {
  workspace: LineageWorkspace;
  report_bindings: LineageReportBinding[];
};
export type EstateDiscoveryResponse = {
  workspaces: LineageEstateWorkspaceInventory[];
  workspace_count: number;
  report_count: number;
  semantic_model_count: number;
};

export type ExplorerReportSelection = {
  workspace_id: string;
  report_id: string;
  semantic_model_id?: string | null;
  semantic_model_workspace_id?: string | null;
};

/**
 * Admin-key-aware fetch shared by every lineage-related call. Attaches
 * X-Lineage-Admin-Key only when the ephemeral, non-persisted Zustand store
 * happens to hold one (production relies on a trusted reverse proxy injecting
 * the real header) — there is deliberately no UI to set this key. Callers must
 * treat a failure here as an optional/degraded state, not a page-blocking error.
 */
export async function requestJson<T>(apiOrigin: string, path: string, init?: RequestInit): Promise<T> {
  const adminKey = useAppStore.getState().adminKey.trim();
  const response = await fetch(`${apiOrigin}${path}`, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...(adminKey ? { "X-Lineage-Admin-Key": adminKey } : {}), ...init?.headers },
  });
  const body = await readJsonResponse(response);
  if (!response.ok) throw toApiError(body, response.status, response.headers.get("x-request-id"));
  return body as T;
}

/**
 * A failed backend call, carrying the HTTP status plus the backend's uniform
 * error envelope (`{ error: { code, message, provider, request_id } }`) so the
 * UI can tell "your session is gone" from "you lack this permission", and so
 * `request_id` stays available for support instead of being thrown away.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly provider?: string;
  readonly requestId?: string;

  constructor(message: string, status: number, details: { code?: string; provider?: string; requestId?: string } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = details.code;
    this.provider = details.provider;
    this.requestId = details.requestId;
  }
}

/** Backend sessions live in one process's memory, so any backend restart turns every call into a 401. */
export function isSessionExpired(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/** 403 means the session is valid but the identity lacks the Power BI/Fabric scope or admin right this call needs. */
export function isPermissionDenied(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}

export function toApiError(body: unknown, status: number, headerRequestId?: string | null): ApiError {
  const fallbackRequestId = headerRequestId ?? undefined;
  const envelope = typeof body === "object" && body !== null ? (body as Record<string, unknown>).error : undefined;

  if (typeof envelope === "object" && envelope !== null) {
    const error = envelope as Record<string, unknown>;
    return new ApiError(
      typeof error.message === "string" && error.message ? error.message : `Request failed with status ${status}.`,
      status,
      {
        code: typeof error.code === "string" ? error.code : undefined,
        provider: typeof error.provider === "string" ? error.provider : undefined,
        requestId: typeof error.request_id === "string" ? error.request_id : fallbackRequestId,
      },
    );
  }

  if (typeof body === "object" && body !== null && typeof (body as Record<string, unknown>).detail === "string") {
    return new ApiError(String((body as Record<string, unknown>).detail), status, { requestId: fallbackRequestId });
  }

  return new ApiError(`Request failed with status ${status}.`, status, { requestId: fallbackRequestId });
}

/** Every report bound to a semantic model, estate-wide, from an already-fetched estate/discover response. */
export function boundReportsForModel(estate: EstateDiscoveryResponse | undefined, semanticModelId: string): ExplorerReportSelection[] {
  if (!estate || !semanticModelId) return [];
  const selections: ExplorerReportSelection[] = [];
  estate.workspaces.forEach((inventory) => {
    inventory.report_bindings.forEach((binding) => {
      if (binding.status === "matched" && binding.semantic_model_id === semanticModelId) {
        selections.push({ workspace_id: inventory.workspace.id, report_id: binding.report_id });
      }
    });
  });
  return selections;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

export async function mapWithConcurrency<T, R>(items: T[], concurrency: number, task: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { status: "fulfilled", value: await task(items[index]) };
      } catch (error) {
        results[index] = { status: "rejected", reason: error };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker));
  return results;
}

export const EXPLORER_REPORT_CHUNK_SIZE = 50;
/** V1 safety cap on cross-report evidence fan-out; see plan doc for the suggested backend endpoint that removes this. */
export const BOUND_REPORTS_SAFETY_CAP = 300;

/**
 * Batches an /api/v1/explorer/* dataset call across many bound reports (the endpoint itself
 * caps each request at 50 selections). Runs chunks with bounded concurrency so one slow/failed
 * chunk doesn't blank the page, and merges every successful chunk's rows.
 */
export async function fetchBatchedExplorer<TRow>(
  apiOrigin: string,
  path: string,
  selections: ExplorerReportSelection[],
): Promise<{ rows: TRow[]; truncated: boolean }> {
  const capped = selections.slice(0, BOUND_REPORTS_SAFETY_CAP);
  const chunks = chunk(capped, EXPLORER_REPORT_CHUNK_SIZE);
  const settled = await mapWithConcurrency(chunks, 3, (reports) =>
    requestJson<{ rows: TRow[] }>(apiOrigin, path, { method: "POST", body: JSON.stringify({ reports }) }),
  );
  const rows = settled.flatMap((result) => (result.status === "fulfilled" ? result.value.rows : []));
  return { rows, truncated: selections.length > capped.length };
}

export function parsedSemanticModelKey(apiOrigin: string, workspaceId: string, modelId: string) {
  return ["semantic-model", "parsed", apiOrigin, workspaceId, modelId] as const;
}
export function daxAnalysisKey(apiOrigin: string, workspaceId: string, modelId: string) {
  return ["semantic-model", "dax-analysis", apiOrigin, workspaceId, modelId] as const;
}
export function estateDiscoveryKey(apiOrigin: string) {
  return ["lineage", "estate-discover", apiOrigin] as const;
}

export type ParsedColumn = { name: string; expression?: string | null };
export type ParsedMeasure = { name: string; expression?: string | null };
export type ParsedTable = { name: string; expression?: string | null; columns: ParsedColumn[]; measures: ParsedMeasure[] };
export type ParsedSemanticModel = { tables: ParsedTable[] };

/** One selectable table or measure in a workspace-scoped inventory, tagged with the workspace/model it came from. */
export type InventoryEntry = {
  key: string;
  workspaceId: string;
  workspaceName: string;
  semanticModelId: string;
  semanticModelName: string;
  tableName: string;
  measureName?: string;
  hasExpression: boolean;
};

export type SkippedModel = { workspaceId: string; workspaceName: string; semanticModelId: string; semanticModelName: string };

export type EstateInventory = {
  tables: InventoryEntry[];
  measures: InventoryEntry[];
  /** Full parsed definition per model, keyed by modelKey(workspaceId, semanticModelId) — reused directly as the dax/analyze request body once a table/measure is picked, no re-fetch needed. */
  parsedByModel: Map<string, ParsedSemanticModel>;
  skipped: SkippedModel[];
};

export function modelKey(workspaceId: string, semanticModelId: string) {
  return `${workspaceId}:${semanticModelId}`;
}

type SemanticModelsListResponse = { semantic_models: Array<{ id: string; name: string }> };
type ModelRef = { workspaceId: string; workspaceName: string; semanticModelId: string; semanticModelName: string };

/**
 * Builds a searchable table/measure inventory across a workspace scope: lists every semantic
 * model in each workspace, then parses each model's definition (concurrency-limited, one
 * inaccessible model is skipped rather than failing the whole inventory). Used by Table Impact
 * and Measure Impact so the object picker is populated up front instead of cascading
 * workspace -> model -> table selects.
 */
export async function fetchEstateInventory(apiOrigin: string, workspaces: Array<{ id: string; name: string }>): Promise<EstateInventory> {
  const modelListResults = await mapWithConcurrency(workspaces, 4, (workspace) =>
    requestJson<SemanticModelsListResponse>(apiOrigin, `/api/v1/workspaces/${workspace.id}/semantic-models`).then(
      (response): ModelRef[] => response.semantic_models.map((model) => ({ workspaceId: workspace.id, workspaceName: workspace.name, semanticModelId: model.id, semanticModelName: model.name })),
    ),
  );
  const modelRefs = modelListResults.flatMap((result) => (result.status === "fulfilled" ? result.value : []));

  const tables: InventoryEntry[] = [];
  const measures: InventoryEntry[] = [];
  const parsedByModel = new Map<string, ParsedSemanticModel>();
  const skipped: SkippedModel[] = [];

  const parsedResults = await mapWithConcurrency(modelRefs, 3, (ref) =>
    requestJson<ParsedSemanticModel>(apiOrigin, `/api/v1/workspaces/${ref.workspaceId}/semantic-models/${ref.semanticModelId}/definition/parsed?format=TMDL`, { method: "POST" }),
  );

  parsedResults.forEach((result, index) => {
    const ref = modelRefs[index];
    if (result.status !== "fulfilled") {
      skipped.push(ref);
      return;
    }
    parsedByModel.set(modelKey(ref.workspaceId, ref.semanticModelId), result.value);
    result.value.tables.forEach((table) => {
      tables.push({ key: `${ref.workspaceId}:${ref.semanticModelId}:${table.name}`, workspaceId: ref.workspaceId, workspaceName: ref.workspaceName, semanticModelId: ref.semanticModelId, semanticModelName: ref.semanticModelName, tableName: table.name, hasExpression: Boolean(table.expression) });
      table.measures.forEach((measure) => {
        measures.push({ key: `${ref.workspaceId}:${ref.semanticModelId}:${table.name}:${measure.name}`, workspaceId: ref.workspaceId, workspaceName: ref.workspaceName, semanticModelId: ref.semanticModelId, semanticModelName: ref.semanticModelName, tableName: table.name, measureName: measure.name, hasExpression: true });
      });
    });
  });

  return { tables, measures, parsedByModel, skipped };
}
