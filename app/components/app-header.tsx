import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  CircleAlert,
  Loader2,
  Workflow,
} from "lucide-react";
import { Link } from "react-router";

import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import { useAppStore } from "~/stores/app-store";

async function checkHealth(apiOrigin: string) {
  const response = await fetch(`${apiOrigin}/api/v1/health`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Health check failed with HTTP ${response.status}`);
  }

  return response.json() as Promise<unknown>;
}

export function AppHeader() {
  const apiOrigin = useAppStore((state) => state.apiOrigin);
  const healthQuery = useQuery({
    queryKey: ["backend-health", apiOrigin],
    queryFn: () => checkHealth(apiOrigin),
    refetchInterval: 15_000,
    retry: 1,
  });

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex min-h-16 max-w-screen-2xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[8px] bg-zinc-950 text-white">
            <Workflow className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-zinc-950 sm:text-base">
              PBI Lineage Explorer
            </span>
            <span className="hidden truncate text-xs text-zinc-500 sm:block">
              Power BI and Snowflake impact intelligence
            </span>
          </span>
        </Link>

        <div className="flex shrink-0 items-center">
          <Badge
            className={cn(
              "rounded-[8px] border px-2.5 py-1",
              healthQuery.isSuccess
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : healthQuery.isLoading
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-rose-200 bg-rose-50 text-rose-800",
            )}
          >
            {healthQuery.isSuccess ? (
              <CheckCircle2 className="mr-1 size-3" />
            ) : healthQuery.isLoading ? (
              <Loader2 className="mr-1 size-3 animate-spin" />
            ) : (
              <CircleAlert className="mr-1 size-3" />
            )}
            <span className="hidden sm:inline">Backend </span>
            {healthQuery.isSuccess ? "online" : healthQuery.isLoading ? "checking" : "offline"}
          </Badge>
        </div>
      </div>
    </header>
  );
}
