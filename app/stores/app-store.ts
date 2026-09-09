import { create } from "zustand";

export function normalizeApiOrigin(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");

  if (trimmed.endsWith("/api/v1")) {
    return trimmed.slice(0, -"/api/v1".length);
  }

  return trimmed;
}

type AppState = {
  apiOrigin: string;
  adminKey: string;
  setApiOrigin: (apiOrigin: string) => void;
  setAdminKey: (adminKey: string) => void;
};

export const useAppStore = create<AppState>((set) => ({
  apiOrigin: normalizeApiOrigin(import.meta.env.VITE_API_ORIGIN ?? ""),
  adminKey: "",
  setApiOrigin: (apiOrigin) => set({ apiOrigin: normalizeApiOrigin(apiOrigin) }),
  setAdminKey: (adminKey) => set({ adminKey }),
}));
