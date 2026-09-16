import { useQuery } from "@tanstack/react-query";

import { getAiStatus } from "~/lib/power-ai-api";
import { useAppStore } from "~/stores/app-store";

/**
 * Single source of truth for locked vs active Power AI. This is UX-only —
 * gating the panel's content here never substitutes for real backend
 * authorization, which every /api/v1/ai/* call is still subject to.
 */
export function usePowerAiStatus() {
  const apiOrigin = useAppStore((state) => state.apiOrigin);
  return useQuery({
    queryKey: ["power-ai", "status", apiOrigin],
    queryFn: () => getAiStatus(apiOrigin),
    refetchInterval: 30_000,
    retry: 1,
  });
}
