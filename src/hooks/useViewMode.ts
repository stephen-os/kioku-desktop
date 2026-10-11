import { useState, useEffect } from "react";

export type ViewMode = "grid" | "list";

// Per-page grid/list view preference, persisted in localStorage (default grid).
export function useViewMode(key: string): [ViewMode, (v: ViewMode) => void] {
  const storageKey = `kioku:view:${key}`;
  const [view, setView] = useState<ViewMode>(() => {
    try {
      return localStorage.getItem(storageKey) === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, view);
    } catch {
      /* ignore */
    }
  }, [storageKey, view]);

  return [view, setView];
}
