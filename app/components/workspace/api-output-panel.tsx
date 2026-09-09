import { Braces, Clock3, Copy, Server } from "lucide-react";

import { Button } from "~/components/ui/button";
import { type ApiResult, formatBody } from "~/lib/api-catalog";
import { cn } from "~/lib/utils";

export function ApiOutputPanel({
  result,
  error,
}: {
  result: ApiResult | null;
  error: string | null;
}) {
  async function copyOutput() {
    if (result) await navigator.clipboard.writeText(formatBody(result));
  }

  return (
    <div className="min-w-0 bg-zinc-950 text-zinc-100">
      <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">Response output</h2>
          <p className="mt-1 text-xs text-zinc-400">Status, duration, headers, and returned JSON</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-zinc-300 hover:bg-zinc-800 hover:text-white"
          onClick={() => void copyOutput()}
          disabled={!result}
          aria-label="Copy response output"
        >
          <Copy className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-3 border-b border-zinc-800">
        <OutputMetric icon={<Server className="size-3.5" />} label="Status" value={result?.status == null ? "--" : String(result.status)} tone={result?.ok ? "text-emerald-400" : "text-zinc-200"} />
        <OutputMetric icon={<Clock3 className="size-3.5" />} label="Duration" value={result ? `${result.durationMs} ms` : "--"} tone="text-cyan-400" />
        <OutputMetric icon={<Braces className="size-3.5" />} label="Method" value={result?.endpoint.split(" ")[0] ?? "--"} tone="text-amber-400" />
      </div>

      {error && (
        <div className="border-b border-rose-900 bg-rose-950/60 px-5 py-3 text-xs leading-5 text-rose-200">
          {error}
        </div>
      )}

      <pre className="min-h-[470px] max-h-[720px] overflow-auto p-5 font-mono text-xs leading-5 text-zinc-200">
        <code>{result ? formatBody(result) : "Run an operation to see its response here."}</code>
      </pre>
    </div>
  );
}

function OutputMetric({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="min-w-0 border-r border-zinc-800 px-3 py-3 last:border-r-0 sm:px-4">
      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">{icon}{label}</div>
      <div className={cn("mt-1 truncate text-xs font-semibold sm:text-sm", tone)}>{value}</div>
    </div>
  );
}
