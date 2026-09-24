import { Loader2 } from "lucide-react";
import { lazy, Suspense, useEffect } from "react";

import { PowerAiTrigger } from "~/components/power-ai/power-ai-trigger";
import { cn } from "~/lib/utils";
import { usePowerAiStore } from "~/stores/power-ai-store";

/**
 * PowerAiContent pulls in the entire chat UI (conversation view, persona
 * selector, chat input, evidence view, etc.) — lazy-loaded so every page
 * only pays for the small trigger button below, not the full chat bundle,
 * until someone actually opens it.
 */
const PowerAiContent = lazy(() =>
  import("~/components/power-ai/power-ai-content").then((module) => ({ default: module.PowerAiContent })),
);

/**
 * The single global Power AI entry point, mounted once in root.tsx —
 * present on every page (Home, Setup guide, Workspace, API reference) as
 * the same floating bottom-right launcher and right-docked panel, so Power
 * AI looks and behaves identically everywhere instead of switching to a
 * bespoke docked layout on workspace routes. Locked/unlocked is UX-only —
 * every /api/v1/ai/* call is still subject to real backend authorization
 * regardless of what this shows.
 */
export function PowerAiWidget() {
  const open = usePowerAiStore((state) => state.widgetOpen);
  const setOpen = usePowerAiStore((state) => state.setWidgetOpen);
  const expanded = usePowerAiStore((state) => state.expanded);

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
      <PowerAiTrigger
        onClick={() => setOpen(true)}
        className="fixed right-5 bottom-5 z-50"
      />
    );
  }

  return (
    <aside
      aria-label="Power AI"
      className={cn(
        "fixed top-16 right-0 z-50 flex h-[calc(100vh-4rem)] flex-col border-l border-zinc-200 bg-white shadow-2xl motion-safe:transition-[width] motion-safe:duration-200",
        expanded ? "w-[min(720px,96vw)]" : "w-[min(380px,92vw)]",
      )}
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
