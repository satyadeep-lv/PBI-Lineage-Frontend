import { useQuery } from "@tanstack/react-query";
import { Loader2, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useLocation, useNavigate, useParams } from "react-router";

import type { Route } from "./+types/workspace";
import { AppFooter } from "~/components/app-footer";
import { AppHeader } from "~/components/app-header";
import { ApiDocumentation } from "~/components/workspace/api-documentation";
import { DatabaseSetup } from "~/components/workspace/database-setup";
import { PowerBiSetup } from "~/components/workspace/power-bi-setup";
import { WorkspaceSidebar } from "~/components/workspace/workspace-sidebar";
import { Button } from "~/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet";
import { fetchOpenApi, flattenEndpoints, SETUP_ENDPOINT_DEFINITIONS } from "~/lib/api-catalog";
import { useApiExecutor } from "~/lib/use-api-executor";
import { useAppStore } from "~/stores/app-store";
import { LEFT_SIDEBAR_COLLAPSED_WIDTH, LEFT_SIDEBAR_EXPANDED_WIDTH, useLayoutStore } from "~/stores/layout-store";
import { usePowerAiStore } from "~/stores/power-ai-store";

const Explorer = lazy(() =>
  import("~/components/workspace/explorer").then((module) => ({ default: module.Explorer })),
);
const ReportLineage = lazy(() =>
  import("~/components/workspace/report-lineage").then((module) => ({ default: module.ReportLineage })),
);
const TableImpact = lazy(() =>
  import("~/components/workspace/table-impact").then((module) => ({ default: module.TableImpact })),
);
const MeasureImpact = lazy(() =>
  import("~/components/workspace/measure-impact").then((module) => ({ default: module.MeasureImpact })),
);
const Scanner = lazy(() =>
  import("~/components/workspace/scanner").then((module) => ({ default: module.Scanner })),
);

export function meta({}: Route.MetaArgs) {
  return [{ title: "Workspace | PBI Lineage Explorer" }];
}

export default function Workspace() {
  const { section } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const apiOrigin = useAppStore((state) => state.apiOrigin);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const leftCollapsed = useLayoutStore((state) => state.leftCollapsed);
  const toggleLeftCollapsed = useLayoutStore((state) => state.toggleLeftCollapsed);
  const activeSection = section ?? "power-bi";

  useEffect(() => {
    usePowerAiStore.getState().mergeContext({ route: location.pathname });
  }, [location.pathname]);

  const openApiQuery = useQuery({
    queryKey: ["openapi", apiOrigin],
    queryFn: () => fetchOpenApi(apiOrigin),
  });
  const endpoints = useMemo(
    () => {
      const discoveredEndpoints = flattenEndpoints(openApiQuery.data);
      const discoveredIds = new Set(discoveredEndpoints.map((endpoint) => endpoint.id));
      return [
        ...discoveredEndpoints,
        ...SETUP_ENDPOINT_DEFINITIONS.filter((endpoint) => !discoveredIds.has(endpoint.id)),
      ];
    },
    [openApiQuery.data],
  );
  const apiExecutor = useApiExecutor(endpoints);

  function navigateTo(nextSection: string) {
    setMobileNavigationOpen(false);
    if (nextSection === "setup-guide") {
      navigate("/setup-guide");
      return;
    }
    navigate(nextSection === "home" ? "/" : `/workspace/${nextSection}`);
  }

  const sidebar = (
    <WorkspaceSidebar
      activeSection={activeSection}
      apiOperationCount={endpoints.length}
      onNavigate={navigateTo}
    />
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#e7f2f3] text-zinc-950">
      <AppHeader />

      {/* Mobile-only nav drawer trigger. */}
      <div className="border-b border-zinc-200 bg-white px-4 py-2 md:hidden">
        <Sheet open={mobileNavigationOpen} onOpenChange={setMobileNavigationOpen}>
          <SheetTrigger render={<Button variant="outline" size="sm" />}>
            <Menu className="size-4" />
            Workspace menu
          </SheetTrigger>
          <SheetContent side="left" className="w-[300px] gap-0 p-0">
            <SheetHeader className="border-b border-zinc-200">
              <SheetTitle>Workspace</SheetTitle>
            </SheetHeader>
            <div className="min-h-0 flex-1">{sidebar}</div>
          </SheetContent>
        </Sheet>
      </div>

      <div
        className="mx-auto grid w-full max-w-screen-2xl flex-1 md:grid-cols-[64px_minmax(0,1fr)] xl:grid-cols-[var(--left-w)_minmax(0,1fr)]"
        style={{ "--left-w": leftCollapsed ? LEFT_SIDEBAR_COLLAPSED_WIDTH : LEFT_SIDEBAR_EXPANDED_WIDTH } as CSSProperties}
      >
        {/* Left nav: hidden below md (mobile uses the Sheet above); a fixed icon rail at tablet; full/collapsible at xl+. */}
        <aside className="hidden border-r border-zinc-200 md:block">
          <div className="xl:hidden">
            <div className="sticky top-0 h-[calc(100vh-4rem)]">
              <WorkspaceSidebar activeSection={activeSection} apiOperationCount={endpoints.length} onNavigate={navigateTo} collapsed />
            </div>
          </div>
          <div className="hidden h-full xl:flex xl:flex-col">
            <div className="sticky top-0 flex h-[calc(100vh-4rem)] flex-col">
              <div className="min-h-0 flex-1">
                <WorkspaceSidebar activeSection={activeSection} apiOperationCount={endpoints.length} onNavigate={navigateTo} collapsed={leftCollapsed} />
              </div>
              <button
                type="button"
                onClick={toggleLeftCollapsed}
                aria-label={leftCollapsed ? "Expand navigation" : "Collapse navigation"}
                title={leftCollapsed ? "Expand navigation" : "Collapse navigation"}
                className="flex shrink-0 items-center justify-center gap-2 border-t border-zinc-200 bg-[#fafbfc] py-2.5 text-zinc-400 hover:text-zinc-950"
              >
                {leftCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
              </button>
            </div>
          </div>
        </aside>

        <main className="min-w-0 p-4 sm:p-6 lg:p-8">
          {openApiQuery.isLoading && (
            <div className="mb-4 flex items-center gap-2 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <Loader2 className="size-4 animate-spin" />
              Loading backend API catalog
            </div>
          )}
          {openApiQuery.isError && (
            <div className="mb-4 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              The API catalog could not be loaded. Check that the application service is available.
            </div>
          )}

          {activeSection === "database" ? (
            <DatabaseSetup
              execute={apiExecutor.execute}
              result={apiExecutor.result}
              error={apiExecutor.error}
              isRunning={apiExecutor.isRunning}
              catalogReady={endpoints.length > 0}
              onNext={() => navigateTo("explorer")}
            />
          ) : activeSection === "power-bi" ? (
            <PowerBiSetup
              execute={apiExecutor.execute}
              result={apiExecutor.result}
              error={apiExecutor.error}
              isRunning={apiExecutor.isRunning}
              catalogReady={endpoints.length > 0}
              onExplore={() => navigateTo("database")}
            />
          ) : activeSection === "explorer" ? (
            <Suspense fallback={<ExplorerLoading />}>
              <Explorer />
            </Suspense>
          ) : activeSection === "report-lineage" ? (
            <Suspense fallback={<ExplorerLoading />}>
              <ReportLineage />
            </Suspense>
          ) : activeSection === "table-impact" ? (
            <Suspense fallback={<ExplorerLoading />}>
              <TableImpact />
            </Suspense>
          ) : activeSection === "measure-impact" ? (
            <Suspense fallback={<ExplorerLoading />}>
              <MeasureImpact />
            </Suspense>
          ) : activeSection === "scanner" ? (
            <Suspense fallback={<ExplorerLoading />}>
              <Scanner />
            </Suspense>
          ) : (
            <ApiDocumentation
              endpoints={endpoints}
              selectedGroupSlug={activeSection === "api-docs" ? undefined : activeSection}
              execute={apiExecutor.execute}
              result={apiExecutor.result}
              error={apiExecutor.error}
              isRunning={apiExecutor.isRunning}
            />
          )}
        </main>
      </div>

      <AppFooter />
    </div>
  );
}

function ExplorerLoading() {
  return (
    <div className="flex min-h-[560px] items-center justify-center border border-zinc-200 bg-white text-sm text-zinc-600">
      <Loader2 className="mr-2 size-4 animate-spin" />
      Loading Explorer
    </div>
  );
}
