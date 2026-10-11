import type { ViewMode } from "@/hooks";

interface ViewToggleProps {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}

// Grid / list segmented control for the library pages.
export function ViewToggle({ value, onChange }: ViewToggleProps) {
  const btn = (mode: ViewMode) =>
    `p-2 transition-colors ${
      value === mode
        ? "bg-[#ffd866] text-[#2d2a2e]"
        : "bg-[#403e41] text-[#939293] hover:text-[#fcfcfa]"
    }`;

  return (
    <div className="inline-flex rounded-lg border border-[#5b595c] overflow-hidden">
      <button type="button" onClick={() => onChange("grid")} className={btn("grid")} title="Grid view" aria-label="Grid view">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      </button>
      <button type="button" onClick={() => onChange("list")} className={btn("list")} title="List view" aria-label="List view">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
    </div>
  );
}
