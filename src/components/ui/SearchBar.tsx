import { useRef, useEffect } from "react";

interface SearchBarProps {
  isVisible: boolean;
  nameValue: string;
  descriptionValue: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onClear: () => void;
  hasActiveFilters: boolean;
  namePlaceholder?: string;
  descriptionPlaceholder?: string;
}

export function SearchBar({
  isVisible,
  nameValue,
  descriptionValue,
  onNameChange,
  onDescriptionChange,
  onClear,
  hasActiveFilters,
  namePlaceholder = "Filter by name...",
  descriptionPlaceholder = "Filter by description...",
}: SearchBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isVisible && containerRef.current) {
      const input = containerRef.current.querySelector("input");
      // Use requestAnimationFrame to ensure the DOM is ready after visibility change
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          input?.focus();
        });
      });
    }
  }, [isVisible]);

  return (
    <div
      ref={containerRef}
      className={`overflow-hidden transition-all duration-200 ease-out ${
        isVisible ? "max-h-24 opacity-100 mb-4" : "max-h-0 opacity-0 mb-0"
      }`}
    >
      <div className="flex flex-col sm:flex-row gap-3 p-4 bg-[#403e41] rounded-lg border border-[#5b595c]">
        <div className="flex-1">
          <input
            type="text"
            value={nameValue}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={namePlaceholder}
            className="w-full px-3 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#939293] focus:outline-none focus:border-[#ffd866] transition-colors"
          />
        </div>
        <div className="flex-1">
          <input
            type="text"
            value={descriptionValue}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder={descriptionPlaceholder}
            className="w-full px-3 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#939293] focus:outline-none focus:border-[#ffd866] transition-colors"
          />
        </div>
        {hasActiveFilters && (
          <button
            onClick={onClear}
            className="px-3 py-2 text-[#939293] hover:text-[#fcfcfa] hover:bg-[#5b595c]/30 rounded-lg transition-colors"
            title="Clear filters"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

interface SearchToggleButtonProps {
  isVisible: boolean;
  hasActiveFilters: boolean;
  onClick: () => void;
}

export function SearchToggleButton({
  isVisible,
  hasActiveFilters,
  onClick,
}: SearchToggleButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`p-1.5 rounded-lg transition-colors ${
        isVisible || hasActiveFilters
          ? "text-[#ffd866] bg-[#ffd866]/10"
          : "text-[#939293] hover:text-[#fcfcfa] hover:bg-[#5b595c]/30"
      }`}
      title={isVisible ? "Hide search" : "Search"}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
    </button>
  );
}
