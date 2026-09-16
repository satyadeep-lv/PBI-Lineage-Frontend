import { Loader2, Lock, Sparkles } from "lucide-react";
import { lazy, Suspense, useEffect } from "react";

import { isUnlocked } from "~/lib/power-ai-api";
import { usePowerAiStatus } from "~/lib/use-power-ai-status";
import { usePowerAiStore } from "~/stores/power-ai-store";

/**
 * PowerAiContent pulls in the entire chat UI (conversation view, persona
 * selector, chat input, evidence view, etc.) — lazy-loaded so every page
 * only pays for the small ribbon tab below, not the full chat bundle, until
 * someone actually opens it.
 */
const PowerAiContent = lazy(() =>
  import("~/components/power-ai/power-ai-content").then((module) => ({ default: module.PowerAiContent })),
);

/**
 * The single Power AI entry point for the whole app: a right-docked panel
 * (mounted once in root.tsx, present on every page), clearly separated from
 * the page behind it — same idea as Snowflake's Copilot pane. Collapsing it
 * doesn't hide it entirely; it tucks into a slim ribbon tab on the right edge
 * that re-expands the same panel on click. Locked/unlocked is UX-only — every
 * /api/v1/ai/* call is still subject to real backend authorization regardless
 * of what this shows.
 */
export function PowerAiWidget() {
  const open = usePowerAiStore((state) => state.widgetOpen);
  const setOpen = usePowerAiStore((state) => state.setWidgetOpen);
  const statusQuery = usePowerAiStatus();
  const unlocked = isUnlocked(statusQuery.data);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={unlocked ? "Open Power AI" : "Power AI is locked"}
        title="Power AI"
        className="fixed top-1/2 right-0 z-50 flex h-16 w-8 -translate-y-1/2 items-center justify-center rounded-l-xl bg-gradient-to-br from-violet-600 to-cyan-600 text-white shadow-lg transition hover:w-9"
      >
        {unlocked ? <Sparkles className="size-4" /> : <Lock className="size-4" />}
      </button>
    );
  }

  return (
    <aside
      aria-label="Power AI"
      className="fixed top-16 right-0 z-50 flex h-[calc(100vh-4rem)] w-[min(380px,92vw)] flex-col border-l border-zinc-200 bg-white shadow-2xl"
    >
      <Suspense fallback={<WidgetLoading />}>
        <PowerAiContent onCollapse={() => setOpen(false)} />
      </Suspense>
    </aside>
  );
}

function WidgetLoading() {
  return (
    <div className="flex h-full items-center justify-center text-zinc-400">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}
