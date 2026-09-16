import {
  BookOpen,
  BookOpenCheck,
  Database,
  GitBranch,
  Home,
  KeyRound,
  Radar,
  SearchCheck,
  Sigma,
  TableProperties,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Separator } from "~/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

export type ApiGroupSummary = {
  tag: string;
  slug: string;
  count: number;
};

/**
 * The one nav-content implementation reused as the desktop `<aside>` (full or
 * collapsed to an icon rail), the tablet icon rail, and inside the mobile Sheet
 * — only `collapsed` changes, never the nav logic or item list.
 */
export function WorkspaceSidebar({
  activeSection,
  apiOperationCount,
  onNavigate,
  collapsed = false,
}: {
  activeSection: string;
  apiOperationCount: number;
  onNavigate: (section: string) => void;
  collapsed?: boolean;
}) {
  const documentationActive =
    activeSection === "api-docs" ||
    !["power-bi", "database", "explorer", "report-lineage", "table-impact", "measure-impact", "scanner"].includes(activeSection);

  return (
    <TooltipProvider delay={200}>
      <nav aria-label="Workspace navigation" className="flex h-full min-h-0 flex-col bg-[#fafbfc]">
        <div className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-hidden", collapsed ? "p-2" : "p-4")}>
          <div className="mb-5 space-y-1">
            <NavigationItem collapsed={collapsed} active={false} icon={BookOpenCheck} label="Setup guide" meta="Start" onClick={() => onNavigate("setup-guide")} />
            <NavigationItem collapsed={collapsed} active={false} icon={Home} label="Overview" meta="" onClick={() => onNavigate("home")} />
          </div>

          <SidebarLabel collapsed={collapsed}>Setup</SidebarLabel>
          <div className="space-y-1">
            <NavigationItem collapsed={collapsed} active={activeSection === "power-bi"} icon={KeyRound} label="Power BI" meta="Step 1" onClick={() => onNavigate("power-bi")} />
            <NavigationItem collapsed={collapsed} active={activeSection === "database"} icon={Database} label="Database" meta="Step 2" onClick={() => onNavigate("database")} />
          </div>

          <Separator className="my-5" />

          <SidebarLabel collapsed={collapsed}>Explore</SidebarLabel>
          <div className="space-y-1">
            <NavigationItem collapsed={collapsed} active={activeSection === "explorer"} icon={SearchCheck} label="Explorer" meta="Inventory" onClick={() => onNavigate("explorer")} />
            <NavigationItem collapsed={collapsed} active={activeSection === "report-lineage"} icon={GitBranch} label="Report lineage" meta="Reports" onClick={() => onNavigate("report-lineage")} />
            <NavigationItem collapsed={collapsed} active={activeSection === "table-impact"} icon={TableProperties} label="Table impact" meta="Impact" onClick={() => onNavigate("table-impact")} />
            <NavigationItem collapsed={collapsed} active={activeSection === "measure-impact"} icon={Sigma} label="Measure impact" meta="Impact" onClick={() => onNavigate("measure-impact")} />
            <NavigationItem collapsed={collapsed} active={activeSection === "scanner"} icon={Radar} label="Scanner" meta="Admin" onClick={() => onNavigate("scanner")} />
          </div>

          <Separator className="my-5" />

          <SidebarLabel collapsed={collapsed}>Reference</SidebarLabel>
          <div className="space-y-1">
            <NavigationItem
              collapsed={collapsed}
              active={documentationActive}
              icon={BookOpen}
              label="API documentation"
              meta={apiOperationCount ? String(apiOperationCount) : ""}
              onClick={() => onNavigate("api-docs")}
            />
          </div>
        </div>
      </nav>
    </TooltipProvider>
  );
}

function SidebarLabel({ children, collapsed }: { children: string; collapsed: boolean }) {
  if (collapsed) return null;
  return <div className="mb-2 px-3 text-[11px] font-semibold uppercase text-zinc-400">{children}</div>;
}

function NavigationItem({
  active,
  icon: Icon,
  label,
  meta,
  onClick,
  collapsed,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  meta: string;
  onClick: () => void;
  collapsed: boolean;
}) {
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={onClick}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex w-full items-center justify-center rounded-[8px] py-2.5 transition",
                active ? "bg-zinc-950 text-white" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950",
              )}
            />
          }
        >
          <Icon className="size-4.5 shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-2 rounded-[8px] px-3 py-2.5 text-left text-sm transition",
        active
          ? "bg-zinc-950 font-medium text-white"
          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {meta && <span className={cn("shrink-0 text-[11px]", active ? "text-zinc-300" : "text-zinc-400")}>{meta}</span>}
    </button>
  );
}
