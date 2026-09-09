import {
  BookOpen,
  Database,
  GitBranch,
  Home,
  KeyRound,
  SearchCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Separator } from "~/components/ui/separator";
import { cn } from "~/lib/utils";

export type ApiGroupSummary = {
  tag: string;
  slug: string;
  count: number;
};

export function WorkspaceSidebar({
  activeSection,
  apiOperationCount,
  onNavigate,
}: {
  activeSection: string;
  apiOperationCount: number;
  onNavigate: (section: string) => void;
}) {
  const documentationActive =
    activeSection === "api-docs" ||
    !["power-bi", "database", "explorer", "report-lineage"].includes(activeSection);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#fafbfc]">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <button
          type="button"
          onClick={() => onNavigate("home")}
          className="mb-5 flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-left text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950"
        >
          <Home className="size-4" />
          Overview
        </button>

        <SidebarLabel>Setup</SidebarLabel>
        <div className="space-y-1">
          <NavigationItem
            active={activeSection === "power-bi"}
            icon={KeyRound}
            label="Power BI"
            meta="Step 1"
            onClick={() => onNavigate("power-bi")}
          />
          <NavigationItem
            active={activeSection === "database"}
            icon={Database}
            label="Database"
            meta="Step 2"
            onClick={() => onNavigate("database")}
          />
        </div>

        <Separator className="my-5" />

        <SidebarLabel>Explore</SidebarLabel>
        <div className="space-y-1">
          <NavigationItem
            active={activeSection === "explorer"}
            icon={SearchCheck}
            label="Explorer"
            meta="Inventory"
            onClick={() => onNavigate("explorer")}
          />
          <NavigationItem
            active={activeSection === "report-lineage"}
            icon={GitBranch}
            label="Report lineage"
            meta="Reports"
            onClick={() => onNavigate("report-lineage")}
          />
        </div>

        <Separator className="my-5" />

        <SidebarLabel>Reference</SidebarLabel>
        <div className="space-y-1">
          <NavigationItem
            active={documentationActive}
            icon={BookOpen}
            label="API documentation"
            meta={apiOperationCount ? String(apiOperationCount) : ""}
            onClick={() => onNavigate("api-docs")}
          />
        </div>
      </div>
    </div>
  );
}

function SidebarLabel({ children }: { children: string }) {
  return (
    <div className="mb-2 px-3 text-[11px] font-semibold uppercase text-zinc-400">
      {children}
    </div>
  );
}

function NavigationItem({
  active,
  icon: Icon,
  label,
  meta,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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
