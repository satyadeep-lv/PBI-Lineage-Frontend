import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";

/**
 * One session-lifetime cache for every backend read in the app.
 *
 * Power BI and Fabric metadata barely changes while someone is working, and
 * the calls behind it are expensive — a semantic model definition, an estate
 * scan, an explorer snapshot. So a response is treated as good for the whole
 * session: once fetched it is never automatically refetched, and it is never
 * evicted just because the component that asked for it unmounted. Moving
 * between pages, tabs and sections therefore re-renders from cache instead of
 * re-requesting.
 *
 * Two things deliberately still hit the network:
 * - Queries that set their own `refetchInterval` (backend health, Power AI
 *   status, scanner status). An interval is independent of staleness, so
 *   liveness probes keep polling.
 * - Anything invalidated explicitly, which is what the header's Refresh data
 *   control does. Because nothing expires on its own, that control is the only
 *   way to pick up changes made in Power BI mid-session, short of a reload.
 *
 * This cache lives in memory only. A browser reload starts a new session and
 * refetches; nothing is written to browser storage, so no tenant metadata is
 * left at rest on the machine.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: Infinity,
            gcTime: Infinity,
            refetchOnMount: false,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            // Sessions live in one backend process, so a 401 means "gone", not
            // "try again" — retrying only multiplies the failed calls.
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
