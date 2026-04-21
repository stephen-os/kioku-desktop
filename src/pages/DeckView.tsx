import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { Deck, Card, Tag } from "@/types";
import { CODE_LANGUAGE_LABELS } from "@/types";
import { getDeck, getCardsForDeck, getTagsForDeck, deleteDeck, exportDeck, getDeckStudyStats } from "@/lib/db";
import { isTauri } from "@/lib/auth";
import { CodeBlock } from "@/components/CodeEditor";
import { BackButton } from "@/components";
import { useToast } from "@/context/ToastContext";
import { getDeckFilename } from "@/lib/slug";
import { formatDuration } from "@/lib/utils";

type FilterLogic = "any" | "all";

// Search debounce delay to reduce re-renders during typing
const SEARCH_DEBOUNCE_MS = 150;

// Session storage key prefix for filter persistence
const FILTER_STORAGE_KEY = "deck-filters-";

interface DeckStudyStats {
  totalSessions: number;
  totalStudyTimeSeconds: number;
  totalCardsStudied: number;
  lastStudiedAt: string | null;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "Never";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return "Today";
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString();
  }
}

export function DeckView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [stats, setStats] = useState<DeckStudyStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Search and filter state - initialized from sessionStorage if available
  const [searchFront, setSearchFront] = useState(() => {
    if (!id) return "";
    try {
      const saved = sessionStorage.getItem(FILTER_STORAGE_KEY + id);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.searchFront || "";
      }
    } catch {}
    return "";
  });
  const [searchBack, setSearchBack] = useState(() => {
    if (!id) return "";
    try {
      const saved = sessionStorage.getItem(FILTER_STORAGE_KEY + id);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.searchBack || "";
      }
    } catch {}
    return "";
  });
  const [searchTag, setSearchTag] = useState("");
  const [selectedTagFilters, setSelectedTagFilters] = useState<string[]>(() => {
    if (!id) return [];
    try {
      const saved = sessionStorage.getItem(FILTER_STORAGE_KEY + id);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.selectedTagFilters || [];
      }
    } catch {}
    return [];
  });
  const [tagFilterMode, setTagFilterMode] = useState<FilterLogic>(() => {
    if (!id) return "any";
    try {
      const saved = sessionStorage.getItem(FILTER_STORAGE_KEY + id);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.tagFilterMode || "any";
      }
    } catch {}
    return "any";
  });

  // Debounced search values for filtering (reduces re-renders on large decks)
  const [debouncedSearchFront, setDebouncedSearchFront] = useState(searchFront);
  const [debouncedSearchBack, setDebouncedSearchBack] = useState(searchBack);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchFront(searchFront), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchFront]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchBack(searchBack), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchBack]);

  // Persist filters to sessionStorage when they change
  useEffect(() => {
    if (!id) return;
    const filterState = {
      searchFront,
      searchBack,
      selectedTagFilters,
      tagFilterMode,
    };
    sessionStorage.setItem(FILTER_STORAGE_KEY + id, JSON.stringify(filterState));
  }, [id, searchFront, searchBack, selectedTagFilters, tagFilterMode]);

  // Resizable tag container - using direct DOM manipulation for smooth performance
  const tagContainerRef = useRef<HTMLDivElement>(null);
  const resizeState = useRef({ isResizing: false, startY: 0, startHeight: 0 });

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const container = tagContainerRef.current;
    if (!container) return;

    resizeState.current = {
      isResizing: true,
      startY: e.clientY,
      startHeight: container.offsetHeight,
    };

    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (!resizeState.current.isResizing || !tagContainerRef.current) return;
    const delta = e.clientY - resizeState.current.startY;
    const newHeight = Math.max(64, Math.min(400, resizeState.current.startHeight + delta));
    tagContainerRef.current.style.height = `${newHeight}px`;
  };

  const handleResizeEnd = () => {
    resizeState.current.isResizing = false;
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
  };

  // Action states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingDeck, setDeletingDeck] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadDeckData();
  }, [id]);

  const loadDeckData = async () => {
    if (!id) return;
    try {
      if (isTauri()) {
        const [deckData, cardsData, tagsData] = await Promise.all([
          getDeck(id),
          getCardsForDeck(id),
          getTagsForDeck(id),
        ]);
        setDeck(deckData);
        setCards(cardsData);
        setTags(tagsData);

        // Load stats
        try {
          const statsData = await getDeckStudyStats(id);
          setStats(statsData);
        } catch {
          // Stats might not exist yet
        }
      }
    } catch (error) {
      console.error("Failed to load deck:", error);
      toast.error("Failed to load deck");
    } finally {
      setLoading(false);
    }
  };

  // Filter tags based on tag search (for display only)
  const filteredTags = useMemo(() => {
    if (!searchTag.trim()) return tags;
    const term = searchTag.toLowerCase();
    return tags.filter((tag) => tag.name.toLowerCase().includes(term));
  }, [tags, searchTag]);

  // Filter cards based on search and tags (uses debounced search for performance)
  const filteredCards = useMemo(() => {
    let result = cards;

    // Front search (debounced)
    if (debouncedSearchFront.trim()) {
      const term = debouncedSearchFront.toLowerCase();
      result = result.filter((card) => card.front.toLowerCase().includes(term));
    }

    // Back search (debounced)
    if (debouncedSearchBack.trim()) {
      const term = debouncedSearchBack.toLowerCase();
      result = result.filter((card) => card.back.toLowerCase().includes(term));
    }

    // Tag filter
    if (selectedTagFilters.length > 0) {
      result = result.filter((card) => {
        const cardTagIds = card.tags.map((t) => t.id);
        if (tagFilterMode === "all") {
          return selectedTagFilters.every((tagId) => cardTagIds.includes(tagId));
        } else {
          return selectedTagFilters.some((tagId) => cardTagIds.includes(tagId));
        }
      });
    }

    return result;
  }, [cards, debouncedSearchFront, debouncedSearchBack, selectedTagFilters, tagFilterMode]);

  const hasActiveFilters = searchFront.trim() !== "" || searchBack.trim() !== "" || selectedTagFilters.length > 0;

  const handleDeleteDeck = async () => {
    if (!id) return;
    setDeletingDeck(true);
    try {
      await deleteDeck(id);
      toast.success("Deck deleted");
      navigate("/");
    } catch (error) {
      console.error("Failed to delete deck:", error);
      toast.error("Failed to delete deck");
    } finally {
      setDeletingDeck(false);
    }
  };

  const handleExportDeck = async () => {
    if (!id || !deck) return;
    setExporting(true);
    try {
      const exportData = await exportDeck(id);
      const filePath = await save({
        defaultPath: getDeckFilename(deck.name),
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (filePath) {
        await writeTextFile(filePath, exportData);
        toast.success("Deck exported");
      }
    } catch (error) {
      console.error("Failed to export deck:", error);
      toast.error("Failed to export deck");
    } finally {
      setExporting(false);
    }
  };

  const handleToggleTagFilter = (tagId: string) => {
    setSelectedTagFilters((prev) =>
      prev.includes(tagId)
        ? prev.filter((t) => t !== tagId)
        : [...prev, tagId]
    );
  };

  const clearFilters = () => {
    setSearchFront("");
    setSearchBack("");
    setSearchTag("");
    setSelectedTagFilters([]);
    setTagFilterMode("any");
  };

  // Build URL params for filtered study/listen
  const buildFilterParams = () => {
    const params = new URLSearchParams();
    if (searchFront) params.set("front", searchFront);
    if (searchBack) params.set("back", searchBack);
    if (selectedTagFilters.length > 0) params.set("tags", selectedTagFilters.join(","));
    if (selectedTagFilters.length > 1) params.set("tagMode", tagFilterMode);
    return params.toString();
  };

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center bg-[#2d2a2e]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#ffd866] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#939293]">Loading...</p>
        </div>
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-6 bg-[#2d2a2e]">
        <div className="text-6xl mb-4">📚</div>
        <h1 className="text-xl font-semibold text-[#fcfcfa] mb-2">Deck not found</h1>
        <p className="text-[#939293] mb-6">
          This deck doesn't exist or has been deleted.
        </p>
        <BackButton fallbackPath="/" label="Back to Decks" />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#2d2a2e]">
      <main className="max-w-4xl mx-auto py-6 px-6">
        <div className="fade-in">
          {/* Back Link */}
          <BackButton fallbackPath="/" label="Back" />

          {/* Deck Header */}
          <div className="bg-[#403e41] rounded-xl border border-[#5b595c] p-6 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs px-2 py-0.5 rounded bg-[#78dce8]/20 text-[#78dce8]">
                    {cards.length} card{cards.length !== 1 ? "s" : ""}
                  </span>
                  {deck.shuffleCards && (
                    <span className="text-xs px-2 py-0.5 rounded bg-[#ab9df2]/20 text-[#ab9df2]">
                      Shuffle
                    </span>
                  )}
                </div>
                <h1 className="text-2xl font-bold text-[#fcfcfa] font-mono mb-2">
                  {deck.name}
                </h1>
                <p className="text-[#939293]">
                  {deck.description || "No description"}
                </p>
              </div>

              <div className="flex gap-2">
                <Link
                  to={`/decks/${id}/edit`}
                  className="px-4 py-2 bg-[#ffd866]/20 text-[#ffd866] rounded-lg hover:bg-[#ffd866]/30 font-medium transition-colors"
                >
                  Edit
                </Link>
                <button
                  onClick={handleExportDeck}
                  disabled={exporting}
                  className="px-4 py-2 bg-[#ab9df2]/20 text-[#ab9df2] rounded-lg hover:bg-[#ab9df2]/30 font-medium transition-colors disabled:opacity-50"
                >
                  {exporting ? "..." : "Export"}
                </button>
                {showDeleteConfirm ? (
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeleteDeck}
                      disabled={deletingDeck}
                      className="px-4 py-2 bg-[#ff6188] text-[#2d2a2e] rounded-lg hover:bg-[#ff6188]/90 transition-colors disabled:opacity-50"
                    >
                      {deletingDeck ? "..." : "Confirm"}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-4 py-2 bg-[#5b595c] text-[#fcfcfa] rounded-lg hover:bg-[#5b595c]/80 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-4 py-2 text-[#ff6188] hover:bg-[#ff6188]/10 rounded-lg transition-colors"
                    title="Delete deck"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Stats */}
          {stats && stats.totalSessions > 0 && (
            <div className="bg-[#403e41] rounded-xl border border-[#5b595c] p-6 mb-6">
              <h3 className="text-lg font-semibold text-[#fcfcfa] mb-4">Your Stats</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-[#78dce8] font-mono">
                    {stats.totalSessions}
                  </div>
                  <div className="text-sm text-[#939293]">Sessions</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-[#a9dc76] font-mono">
                    {stats.totalCardsStudied}
                  </div>
                  <div className="text-sm text-[#939293]">Cards Studied</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-[#ffd866] font-mono">
                    {formatDuration(stats.totalStudyTimeSeconds)}
                  </div>
                  <div className="text-sm text-[#939293]">Total Time</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-[#ab9df2] font-mono">
                    {formatDate(stats.lastStudiedAt)}
                  </div>
                  <div className="text-sm text-[#939293]">Last Studied</div>
                </div>
              </div>
            </div>
          )}

          {/* Start Studying Card */}
          {cards.length > 0 ? (
            <div className="bg-[#403e41] rounded-xl border border-[#5b595c] p-8 text-center mb-6">
              <h2 className="text-xl font-semibold text-[#fcfcfa] mb-4">
                Ready to study?
              </h2>
              <p className="text-[#939293] mb-6">
                This deck has {cards.length} card{cards.length !== 1 ? "s" : ""}.
                {deck.shuffleCards && " Cards will be shuffled."}
              </p>
              <div className="flex justify-center gap-4">
                <Link
                  to={`/decks/${id}/study`}
                  className="inline-flex items-center justify-center px-8 py-3 bg-[#a9dc76] text-[#2d2a2e] rounded-lg hover:bg-[#a9dc76]/90 font-medium text-lg transition-colors"
                >
                  Study
                  <svg className="w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </Link>
                <Link
                  to={`/decks/${id}/autoplay`}
                  className="inline-flex items-center justify-center px-8 py-3 bg-[#78dce8] text-[#2d2a2e] rounded-lg hover:bg-[#78dce8]/90 font-medium text-lg transition-colors"
                >
                  Autoplay
                  <svg className="w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </Link>
              </div>
            </div>
          ) : (
            <div className="bg-[#403e41] rounded-xl border border-[#5b595c] p-8 text-center mb-6">
              <div className="text-4xl mb-4">📝</div>
              <h2 className="text-xl font-semibold text-[#fcfcfa] mb-2">
                No cards yet
              </h2>
              <p className="text-[#939293] mb-6">
                Add some cards to this deck before studying.
              </p>
              <Link
                to={`/decks/${id}/edit`}
                className="inline-flex items-center justify-center px-6 py-3 bg-[#ffd866] text-[#2d2a2e] rounded-lg hover:bg-[#ffd866]/90 font-medium transition-colors"
              >
                Add Cards
              </Link>
            </div>
          )}

          {/* Cards Preview */}
          {cards.length > 0 && (
            <div className="bg-[#403e41] rounded-xl border border-[#5b595c] p-6">
              <h3 className="text-lg font-semibold text-[#fcfcfa] mb-4">
                Cards ({hasActiveFilters ? `${filteredCards.length} of ` : ""}{cards.length})
              </h3>

              {/* Search and Filter */}
              <div className="mb-4 space-y-4">
                {/* Search Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[#939293] mb-1">Search Front</label>
                    <input
                      type="text"
                      placeholder="Search front of cards..."
                      value={searchFront}
                      onChange={(e) => setSearchFront(e.target.value)}
                      className="w-full px-3 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#939293] focus:outline-none focus:border-[#ffd866] focus:ring-1 focus:ring-[#ffd866]/50 transition-colors text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#939293] mb-1">Search Back</label>
                    <input
                      type="text"
                      placeholder="Search back of cards..."
                      value={searchBack}
                      onChange={(e) => setSearchBack(e.target.value)}
                      className="w-full px-3 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#939293] focus:outline-none focus:border-[#ffd866] focus:ring-1 focus:ring-[#ffd866]/50 transition-colors text-sm"
                    />
                  </div>
                </div>

                {/* Tag Filters */}
                {tags.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <label className="text-xs text-[#939293]">Filter by Tags</label>
                      {/* Tag Mode Toggle */}
                      {selectedTagFilters.length > 1 && (
                        <div className="flex items-center bg-[#2d2a2e] rounded-lg p-0.5">
                          <button
                            onClick={() => setTagFilterMode("any")}
                            className={`px-2 py-1 text-xs rounded-md transition-colors ${
                              tagFilterMode === "any"
                                ? "bg-[#ab9df2] text-[#2d2a2e] font-medium"
                                : "text-[#939293] hover:text-[#fcfcfa]"
                            }`}
                          >
                            Match Any
                          </button>
                          <button
                            onClick={() => setTagFilterMode("all")}
                            className={`px-2 py-1 text-xs rounded-md transition-colors ${
                              tagFilterMode === "all"
                                ? "bg-[#ab9df2] text-[#2d2a2e] font-medium"
                                : "text-[#939293] hover:text-[#fcfcfa]"
                            }`}
                          >
                            Match All
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Tag Search */}
                    <input
                      type="text"
                      placeholder="Search tags..."
                      value={searchTag}
                      onChange={(e) => setSearchTag(e.target.value)}
                      className="w-full px-3 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#939293] focus:outline-none focus:border-[#ab9df2] focus:ring-1 focus:ring-[#ab9df2]/50 transition-colors text-sm"
                    />

                    {/* Selected Tags (always visible) */}
                    {selectedTagFilters.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        <span className="text-xs text-[#939293]">Selected:</span>
                        {selectedTagFilters.map((tagId) => {
                          const tag = tags.find((t) => t.id === tagId);
                          return tag ? (
                            <button
                              key={tag.id}
                              onClick={() => handleToggleTagFilter(tag.id)}
                              className="px-3 py-1 rounded-full text-xs font-medium bg-[#ab9df2] text-[#2d2a2e] hover:bg-[#ab9df2]/80 transition-colors flex items-center gap-1"
                            >
                              {tag.name}
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          ) : null;
                        })}
                      </div>
                    )}

                    {/* Available Tags (filtered by search) - Resizable */}
                    <div className="relative">
                      <div
                        ref={tagContainerRef}
                        className="flex flex-wrap content-start gap-2 overflow-y-auto p-2 bg-[#2d2a2e] rounded-lg border border-[#5b595c]"
                        style={{ height: "128px" }}
                      >
                        {filteredTags.length === 0 ? (
                          <span className="text-xs text-[#939293]">No tags match your search</span>
                        ) : (
                          filteredTags
                            .filter((tag) => !selectedTagFilters.includes(tag.id))
                            .map((tag) => (
                              <button
                                key={tag.id}
                                onClick={() => handleToggleTagFilter(tag.id)}
                                className="px-3 py-1 rounded-full text-xs font-medium bg-[#ab9df2]/20 text-[#ab9df2] hover:bg-[#ab9df2]/30 transition-colors h-fit"
                              >
                                {tag.name}
                              </button>
                            ))
                        )}
                        {filteredTags.filter((tag) => !selectedTagFilters.includes(tag.id)).length === 0 &&
                         filteredTags.length > 0 && (
                          <span className="text-xs text-[#939293]">All matching tags selected</span>
                        )}
                      </div>
                      {/* Resize Handle */}
                      <div
                        onMouseDown={handleResizeStart}
                        className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize flex items-center justify-center hover:bg-[#5b595c]/30 rounded-b-lg group"
                      >
                        <div className="w-8 h-1 bg-[#5b595c] rounded-full group-hover:bg-[#939293] transition-colors" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Filter Actions */}
                {hasActiveFilters && (
                  <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#5b595c]">
                    <span className="text-sm text-[#939293]">
                      {filteredCards.length} card{filteredCards.length !== 1 ? "s" : ""} match
                    </span>
                    <button
                      onClick={clearFilters}
                      className="text-sm text-[#ff6188] hover:text-[#ff6188]/80 transition-colors"
                    >
                      Clear all filters
                    </button>
                    <div className="flex-1" />
                    <Link
                      to={`/decks/${id}/study?${buildFilterParams()}`}
                      className="px-4 py-1.5 bg-[#a9dc76] text-[#2d2a2e] rounded-lg hover:bg-[#a9dc76]/90 text-sm font-medium transition-colors"
                    >
                      Study Filtered
                    </Link>
                    <Link
                      to={`/decks/${id}/autoplay?${buildFilterParams()}`}
                      className="px-4 py-1.5 bg-[#78dce8] text-[#2d2a2e] rounded-lg hover:bg-[#78dce8]/90 text-sm font-medium transition-colors"
                    >
                      Autoplay Filtered
                    </Link>
                  </div>
                )}
              </div>

              {/* Cards List */}
              {filteredCards.length === 0 ? (
                <p className="text-[#939293] text-center py-4">
                  No cards match your search
                </p>
              ) : (
                <div className="space-y-3">
                  {filteredCards.map((card, index) => (
                    <CardRow key={card.id} card={card} index={index} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function CardRow({ card, index }: { card: Card; index: number }) {
  const isCodeFront = card.frontType === "CODE";
  const isCodeBack = card.backType === "CODE";

  // Truncate for preview
  const truncateText = (text: string, maxLength: number = 100) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
  };

  const truncateCode = (code: string, maxLines: number = 2) => {
    const lines = code.split("\n");
    if (lines.length <= maxLines) return code;
    return lines.slice(0, maxLines).join("\n") + "\n...";
  };

  return (
    <div className="flex items-start gap-3 p-3 bg-[#2d2a2e] rounded-lg">
      <span className="text-[#939293] font-mono text-sm">
        {index + 1}.
      </span>
      <div className="flex-1 min-w-0">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Front */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-[#939293] uppercase tracking-wider">Front</span>
              {isCodeFront && (
                <span className="text-xs bg-[#78dce8]/20 text-[#78dce8] px-1.5 py-0.5 rounded">
                  {CODE_LANGUAGE_LABELS[card.frontLanguage || "PLAINTEXT"]}
                </span>
              )}
            </div>
            {isCodeFront ? (
              <div className="max-h-16 overflow-hidden rounded text-sm">
                <CodeBlock code={truncateCode(card.front)} language={card.frontLanguage} />
              </div>
            ) : (
              <p className="text-[#fcfcfa] text-sm line-clamp-2">
                {truncateText(card.front)}
              </p>
            )}
          </div>

          {/* Back */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-[#939293] uppercase tracking-wider">Back</span>
              {isCodeBack && (
                <span className="text-xs bg-[#78dce8]/20 text-[#78dce8] px-1.5 py-0.5 rounded">
                  {CODE_LANGUAGE_LABELS[card.backLanguage || "PLAINTEXT"]}
                </span>
              )}
            </div>
            {isCodeBack ? (
              <div className="max-h-16 overflow-hidden rounded text-sm">
                <CodeBlock code={truncateCode(card.back)} language={card.backLanguage} />
              </div>
            ) : (
              <p className="text-[#fcfcfa] text-sm line-clamp-2">
                {truncateText(card.back)}
              </p>
            )}
          </div>
        </div>

        {/* Tags */}
        {card.tags?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {card.tags.map((tag) => (
              <span
                key={tag.id}
                className="text-xs px-2 py-0.5 rounded-full bg-[#ab9df2]/20 text-[#ab9df2]"
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
