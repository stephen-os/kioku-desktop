import type { ReactNode } from "react";
import type { ViewMode } from "@/hooks";

interface CardGridProps {
  children: ReactNode;
  view?: ViewMode;
}

export function CardGrid({ children, view = "grid" }: CardGridProps) {
  return (
    <div
      className={
        view === "list"
          ? "flex flex-col gap-2"
          : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      }
    >
      {children}
    </div>
  );
}
