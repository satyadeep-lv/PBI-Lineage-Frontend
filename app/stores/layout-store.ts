import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Persisted desktop chrome preferences only — pure UI state, nothing sensitive.
 * Deliberately kept out of app-store.ts, which is never persisted (it can hold
 * an ephemeral admin key; see the comment on requestJson in lib/lineage-api.ts).
 */
type LayoutState = {
  leftCollapsed: boolean;
  toggleLeftCollapsed: () => void;
  setLeftCollapsed: (collapsed: boolean) => void;
};

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      leftCollapsed: false,
      toggleLeftCollapsed: () => set((state) => ({ leftCollapsed: !state.leftCollapsed })),
      setLeftCollapsed: (leftCollapsed) => set({ leftCollapsed }),
    }),
    {
      name: "pbi-layout",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ leftCollapsed: state.leftCollapsed }),
    },
  ),
);

export const LEFT_SIDEBAR_EXPANDED_WIDTH = "240px";
export const LEFT_SIDEBAR_COLLAPSED_WIDTH = "64px";
