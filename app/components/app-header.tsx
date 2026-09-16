import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  CircleAlert,
  Loader2,
  Menu,
} from "lucide-react";
import { Link, useLocation } from "react-router";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet";
import { cn } from "~/lib/utils";
import { useAppStore } from "~/stores/app-store";

const navigationItems = [
  { label: "Home", to: "/", match: (pathname: string) => pathname === "/" },
  {
    label: "Setup guide",
    to: "/setup-guide",
    match: (pathname: string) => pathname.startsWith("/setup-guide"),
  },
  {
    label: "Workspace",
    to: "/workspace/power-bi",
    match: (pathname: string) =>
      pathname.startsWith("/workspace") && !pathname.startsWith("/workspace/api-docs"),
  },
  {
    label: "API reference",
    to: "/workspace/api-docs",
    match: (pathname: string) => pathname.startsWith("/workspace/api-docs"),
  },
];

async function checkHealth(apiOrigin: string) {
  const response = await fetch(`${apiOrigin}/api/v1/health`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Health check failed with HTTP ${response.status}`);
  }

  return response.json() as Promise<unknown>;
}

export function AppHeader({ showHealth = true }: { showHealth?: boolean }) {
  const apiOrigin = useAppStore((state) => state.apiOrigin);
  const { pathname } = useLocation();
  const healthQuery = useQuery({
    queryKey: ["backend-health", apiOrigin],
    queryFn: () => checkHealth(apiOrigin),
    enabled: showHealth,
    refetchInterval: 15_000,
    retry: 1,
  });

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex min-h-16 max-w-screen-2xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex min-w-0 items-center gap-3" aria-label="PBI Lineage Explorer home">
          <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-zinc-950">
            <img src="/tab_logo.png" alt="" className="size-full object-cover" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-zinc-950 sm:text-base">
              PBI Lineage Explorer
            </span>
            <span className="hidden truncate text-xs text-zinc-500 sm:block">
              Analytics lineage and impact intelligence
            </span>
          </span>
        </Link>

        <div className="hidden min-w-0 items-stretch self-stretch lg:flex">
          <HeaderNavigation pathname={pathname} />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {showHealth ? <HealthBadge query={healthQuery} compact /> : null}

          <Sheet>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Open navigation menu"
                />
              }
            >
              <Menu className="size-5" />
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(22rem,88vw)] border-zinc-200 p-0">
              <SheetHeader className="border-b border-zinc-200 px-5 py-5">
                <SheetTitle>Navigation</SheetTitle>
                <SheetDescription>Move between guidance, setup, analysis, and APIs.</SheetDescription>
              </SheetHeader>
              <nav aria-label="Mobile navigation" className="flex flex-col px-3 py-3">
                {navigationItems.map((item) => {
                  const active = item.match(pathname);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "border-l-2 px-4 py-3 text-sm font-medium transition-colors",
                        active
                          ? "border-zinc-950 bg-zinc-100 text-zinc-950"
                          : "border-transparent text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950",
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
              {showHealth ? (
                <div className="mt-auto border-t border-zinc-200 p-5">
                  <p className="mb-2 text-xs font-medium text-zinc-500">Backend connection</p>
                  <HealthBadge query={healthQuery} />
                </div>
              ) : null}
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

function HeaderNavigation({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Primary navigation" className="flex items-stretch">
      {navigationItems.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center px-3 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-950 lg:px-4",
              active && "text-zinc-950 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-zinc-950 lg:after:inset-x-4",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

type HealthQuery = {
  isSuccess: boolean;
  isLoading: boolean;
};

function HealthBadge({ query, compact = false }: { query: HealthQuery; compact?: boolean }) {
  const label = query.isSuccess ? "online" : query.isLoading ? "checking" : "offline";

  return (
    <Badge
      className={cn(
        "rounded-[8px] border px-2.5 py-1",
        query.isSuccess
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : query.isLoading
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : "border-rose-200 bg-rose-50 text-rose-800",
      )}
    >
      {query.isSuccess ? (
        <CheckCircle2 className="mr-1 size-3" />
      ) : query.isLoading ? (
        <Loader2 className="mr-1 size-3 animate-spin" />
      ) : (
        <CircleAlert className="mr-1 size-3" />
      )}
      <span className={compact ? "hidden lg:inline" : undefined}>Backend </span>
      {label}
    </Badge>
  );
}
