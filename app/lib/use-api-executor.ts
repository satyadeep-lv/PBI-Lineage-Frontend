import { useCallback, useState } from "react";

import {
  type ApiEndpoint,
  type ApiResult,
  buildEndpointUrl,
  readJsonResponse,
} from "~/lib/api-catalog";
import { useAppStore } from "~/stores/app-store";

export type ExecuteOptions = {
  parameters?: Record<string, string>;
  body?: unknown;
};

export type ExecuteEndpoint = (
  endpointId: string,
  options?: ExecuteOptions,
) => Promise<ApiResult | null>;

export function useApiExecutor(endpoints: ApiEndpoint[]) {
  const apiOrigin = useAppStore((state) => state.apiOrigin);
  const adminKey = useAppStore((state) => state.adminKey);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const execute = useCallback<ExecuteEndpoint>(
    async (endpointId, options = {}) => {
      const endpoint = endpoints.find((item) => item.id === endpointId);

      if (!endpoint) {
        setError("This API operation is not available in the loaded OpenAPI catalog.");
        return null;
      }

      setIsRunning(true);
      setError(null);
      const startedAt = performance.now();

      try {
        const parameterValues = options.parameters ?? {};
        const url = buildEndpointUrl(apiOrigin, endpoint, parameterValues);
        const headers = new Headers();

        endpoint.parameters
          .filter((parameter) => parameter.in === "header")
          .forEach((parameter) => {
            const value = parameterValues[parameter.name]?.trim();
            if (value) headers.set(parameter.name, value);
          });

        if (adminKey.trim()) {
          headers.set("X-Lineage-Admin-Key", adminKey.trim());
        }

        const shouldSendBody =
          endpoint.hasBody &&
          endpoint.method !== "get" &&
          endpoint.method !== "delete" &&
          options.body !== undefined;

        if (shouldSendBody) {
          headers.set("Content-Type", "application/json");
        }

        const response = await fetch(url, {
          method: endpoint.method.toUpperCase(),
          credentials: "include",
          headers,
          body: shouldSendBody
            ? typeof options.body === "string"
              ? options.body
              : JSON.stringify(options.body)
            : undefined,
        });
        const responseBody = await readJsonResponse(response);
        const nextResult: ApiResult = {
          endpoint: endpoint.id,
          status: response.status,
          ok: response.ok,
          durationMs: Math.round(performance.now() - startedAt),
          body: responseBody,
          headers: Object.fromEntries(response.headers.entries()),
        };

        if (!response.ok) {
          setError(readResponseError(responseBody, response.status));
        }
        setResult(nextResult);
        return nextResult;
      } catch (caughtError) {
        const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
        const failedResult: ApiResult = {
          endpoint: endpoint.id,
          status: null,
          ok: false,
          durationMs: Math.round(performance.now() - startedAt),
          body: {
            message,
            hint: "Confirm the backend is running and the frontend proxy or API origin is correct.",
          },
          headers: {},
        };

        setError(message);
        setResult(failedResult);
        return failedResult;
      } finally {
        setIsRunning(false);
      }
    },
    [adminKey, apiOrigin, endpoints],
  );

  return { execute, result, error, isRunning };
}

function readResponseError(body: unknown, status: number) {
  if (typeof body === "string" && body.trim()) return body;
  if (typeof body === "object" && body !== null && "detail" in body) {
    const detail = (body as Record<string, unknown>).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => typeof item === "object" && item !== null && "msg" in item ? (item as Record<string, unknown>).msg : null)
        .filter((item): item is string => typeof item === "string");
      if (messages.length) return messages.join(" ");
    }
  }
  return `Request failed with status ${status}.`;
}
