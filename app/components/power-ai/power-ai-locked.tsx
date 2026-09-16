import { Lock, PowerOff } from "lucide-react";

import type { AiUnavailableReason } from "~/lib/power-ai-api";

/**
 * Shown in place of the chat UI whenever Power AI isn't usable yet. This is a
 * UX affordance only — the backend enforces the real authorization on every
 * /api/v1/ai/* call regardless of what this component shows.
 */
export function PowerAiLocked({ reason }: { reason: AiUnavailableReason }) {
  if (reason === "auth_required") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <Lock className="size-6 text-zinc-400" />
        <div>
          <p className="text-sm font-semibold text-zinc-900">Power AI</p>
          <p className="mt-1.5 max-w-[240px] text-xs leading-5 text-zinc-500">
            Complete Power BI setup with a device code or a service principal to unlock the AI assistant.
          </p>
        </div>
        <a href="/workspace/power-bi" className="mt-1 inline-flex h-8 items-center rounded-lg bg-zinc-950 px-3 text-xs font-medium text-white hover:bg-zinc-800">
          Open Power BI setup
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <PowerOff className="size-6 text-zinc-400" />
      <div>
        <p className="text-sm font-semibold text-zinc-900">Power AI is unavailable</p>
        <p className="mt-1.5 max-w-[240px] text-xs leading-5 text-zinc-500">
          {reason === "disabled" ? "Power AI is not enabled for this environment." : "The AI backend is temporarily unavailable. Try again shortly."}
        </p>
      </div>
    </div>
  );
}
