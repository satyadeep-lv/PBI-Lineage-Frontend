import { Workflow } from "lucide-react";

export function AppFooter() {
  return (
    <footer className="border-t border-zinc-800 bg-zinc-950 text-zinc-300">
      <div className="mx-auto flex min-h-16 max-w-screen-2xl flex-col justify-center gap-2 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 text-zinc-100">
          <Workflow className="size-4 text-cyan-400" />
          <span className="font-medium">PBI Lineage Explorer</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <span>
            Developed by <strong className="font-semibold text-white">Satyadeep Singh</strong>
          </span>
          <span>Copyright &copy; {new Date().getFullYear()} PBI Lineage Explorer. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}
