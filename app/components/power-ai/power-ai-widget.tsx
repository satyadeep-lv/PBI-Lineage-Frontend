import { Loader2, Sparkles } from "lucide-react";
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
    if (!open) {
      delete document.documentElement.dataset.powerAi;
      return;
    }
    document.documentElement.dataset.powerAi = expanded ? "expanded" : "open";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      delete document.documentElement.dataset.powerAi;
    };
  }, [expanded, open, setOpen]);

  if (!open) {
    return (
      <PowerAiTrigger
        onClick={() => setOpen(true)}
        className="fixed right-5 bottom-5 z-50"
      />
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close Power AI"
        onClick={() => setOpen(false)}
        className="fixed inset-0 top-16 z-40 bg-black/25 backdrop-blur-[1px] xl:hidden"
      />
      <aside
        aria-label="Power AI"
        className={cn(
          "fixed top-16 right-0 z-50 flex h-[calc(100vh-4rem)] flex-col border-l border-border bg-surface shadow-xl motion-safe:transition-[width] motion-safe:duration-200",
          expanded ? "w-[min(720px,100vw)]" : "w-[min(400px,100vw)]",
        )}
      >
        <Suspense fallback={<WidgetLoading />}>
          <PowerAiContent onCollapse={() => setOpen(false)} />
        </Suspense>
      </aside>
    </>
  );
}

function WidgetLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-fabric text-primary-foreground">
          <Sparkles className="size-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Power AI</h2>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="size-2.5 animate-spin" /> Loading
          </p>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin text-fabric" />
      </div>
    </div>
  );
}
