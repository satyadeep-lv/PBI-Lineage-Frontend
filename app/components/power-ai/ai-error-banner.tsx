import { AlertTriangle } from "lucide-react";

/** Maps known error reasons to plain-language copy — never surfaces a raw provider error or stack trace. */
export function AiErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
