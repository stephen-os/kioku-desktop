import { useEffect, useRef } from "react";
import { useShortcuts } from "@/context/ShortcutsContext";
import { ShortcutHint } from "./ShortcutHint";

/**
 * Modal displaying all available keyboard shortcuts
 * Triggered by Ctrl+/ (or Cmd+/ on Mac)
 */
export function ShortcutsHelp() {
  const { showHelp, setShowHelp, getShortcutGroups } = useShortcuts();
  const groups = getShortcutGroups();
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Store focused element when opening and restore when closing
  useEffect(() => {
    if (showHelp) {
      previousFocusRef.current = document.activeElement as HTMLElement;
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [showHelp]);

  // Close on Escape
  useEffect(() => {
    if (!showHelp) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowHelp(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showHelp, setShowHelp]);

  if (!showHelp) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => setShowHelp(false)}
      />

      {/* Modal */}
      <div className="relative bg-[#403e41] border border-[#5b595c] rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#5b595c]">
          <h2 className="text-lg font-semibold text-[#fcfcfa]">Keyboard Shortcuts</h2>
          <button
            onClick={() => setShowHelp(false)}
            className="p-1 text-[#939293] hover:text-[#fcfcfa] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto max-h-[calc(80vh-8rem)]">
          {groups.length === 0 ? (
            <p className="text-[#939293] text-center py-8">
              No shortcuts registered
            </p>
          ) : (
            <div className="space-y-6">
              {groups.map((group) => (
                <div key={group.scope}>
                  <h3 className="text-sm font-medium text-[#ffd866] uppercase tracking-wider mb-3">
                    {group.label}
                  </h3>
                  <div className="space-y-2">
                    {group.shortcuts.map((shortcut) => (
                      <div
                        key={shortcut.id}
                        className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[#5b595c]/20"
                      >
                        <div>
                          <p className="text-[#fcfcfa] font-medium">{shortcut.label}</p>
                          {shortcut.description && (
                            <p className="text-xs text-[#939293] mt-0.5">
                              {shortcut.description}
                            </p>
                          )}
                        </div>
                        <ShortcutHint keys={shortcut.keys} size="md" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#5b595c] bg-[#2d2a2e]/50">
          <p className="text-xs text-[#939293] text-center">
            Press <ShortcutHint keys={{ key: "/", ctrl: true }} /> to toggle this help
          </p>
        </div>
      </div>
    </div>
  );
}
