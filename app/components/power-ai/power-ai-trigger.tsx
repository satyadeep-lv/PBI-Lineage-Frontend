import { Lock, Sparkles } from "lucide-react";

import { isUnlocked } from "~/lib/power-ai-api";
import { usePowerAiStatus } from "~/lib/use-power-ai-status";
import { cn } from "~/lib/utils";

/**
 * The one lock/unlock-aware trigger button for opening Power AI — a white
 * pill with the app's teal accent (matching every icon badge elsewhere) and
 * a soft, shape-preserving glow (only while unlocked). The glow is an evenly
 * offset twin of the pill itself (not a scaled copy of it) so it reads as a
 * halo, not a distorted blob, on this button's elongated rounded-full shape.
 * `className` is for the caller's positioning only (e.g. fixed placement) —
 * this component owns all of its own visual styling.
 */
export function PowerAiTrigger({ onClick, className }: { onClick: () => void; className?: string }) {
  const statusQuery = usePowerAiStatus();
  const unlocked = isUnlocked(statusQuery.data);

  return (
    <span className={cn("relative inline-flex", className)}>
      {unlocked && (
        <span className="absolute -inset-1 rounded-full bg-teal-400/50 blur-sm motion-safe:animate-pulse" aria-hidden="true" />
      )}
      <button
        type="button"
        onClick={onClick}
        aria-label={unlocked ? "Open Power AI" : "Power AI is locked"}
        title="Power AI"
        className="relative flex items-center justify-center gap-2 rounded-full border border-teal-700 bg-white px-5 py-3 text-sm font-semibold text-teal-800 shadow-lg transition hover:bg-teal-50"
      >
        {unlocked ? <Sparkles className="size-4 shrink-0" /> : <Lock className="size-4 shrink-0" />}
        <span>Power AI</span>
      </button>
    </span>
  );
}
