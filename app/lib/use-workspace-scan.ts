import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { DEFAULT_SCAN_FLAGS, getScanResult, getScanStatus, startScan, type ScanFlags, type ScannerResultResponse } from "~/lib/scanner-api";

const TERMINAL_STATUSES = new Set(["Succeeded", "Failed"]);

/**
 * Drives the Power BI Admin scanner's submit -> poll -> fetch workflow. Never runs on mount or on
 * a timer — every scan is one explicit `runScan()` call, since submissions, status checks, and
 * result reads all count against the tenant's real hourly Power BI Admin API quota.
 */
export function useWorkspaceScan(apiOrigin: string, workspaceIds: string[], flags: ScanFlags = DEFAULT_SCAN_FLAGS) {
  const [scanId, setScanId] = useState<string | null>(null);
  const scopeKey = [...workspaceIds].sort().join(",");

  useEffect(() => setScanId(null), [scopeKey]);

  const startMutation = useMutation({
    mutationFn: () => startScan(apiOrigin, workspaceIds, flags),
    onSuccess: (data) => setScanId(data.scan_id),
  });

  const statusQuery = useQuery({
    queryKey: ["scanner", "status", apiOrigin, scanId],
    queryFn: () => getScanStatus(apiOrigin, scanId!),
    enabled: Boolean(scanId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && TERMINAL_STATUSES.has(status) ? false : 4000;
    },
  });

  const status = statusQuery.data?.status;

  const resultQuery = useQuery<ScannerResultResponse>({
    queryKey: ["scanner", "result", apiOrigin, scanId],
    queryFn: () => getScanResult(apiOrigin, scanId!),
    enabled: Boolean(scanId) && status === "Succeeded",
  });

  return {
    scanId,
    runScan: () => { setScanId(null); startMutation.mutate(); },
    isSubmitting: startMutation.isPending,
    submitError: startMutation.isError,
    status,
    statusError: statusQuery.data?.error,
    isStatusUnavailable: statusQuery.isError,
    resultQuery,
  };
}
