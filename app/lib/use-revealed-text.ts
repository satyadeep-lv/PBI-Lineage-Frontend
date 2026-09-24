import { useEffect, useState } from "react";

/** At least this many characters per animation frame... */
const MIN_CHARS_PER_FRAME = 48;
/** ...and never more than about 1.2 s at 60 fps for the whole answer. */
const MAX_FRAMES = 72;

/** Messages already shown in full, so reopening the widget doesn't replay them. */
const revealed = new Set<string>();

export function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The backend grounds a whole answer before it streams, so its deltas arrive
 * in one burst. This reveals the text progressively instead, once per
 * message. It changes only how much is shown: the stored text, and what
 * "Copy answer" copies, are always complete.
 */
export function useRevealedText(id: string, text: string, { enabled, pending }: { enabled: boolean; pending: boolean }) {
  const [skip] = useState(() => !enabled || revealed.has(id) || prefersReducedMotion());
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (skip) return;
    if (shown >= text.length) {
      if (!pending && text.length) revealed.add(id);
      return;
    }
    const frame = requestAnimationFrame(() => {
      const step = Math.max(MIN_CHARS_PER_FRAME, Math.ceil(text.length / MAX_FRAMES));
      setShown((previous) => Math.min(text.length, previous + step));
    });
    return () => cancelAnimationFrame(frame);
  }, [id, pending, shown, skip, text.length]);

  return skip || shown >= text.length ? text : text.slice(0, shown);
}
