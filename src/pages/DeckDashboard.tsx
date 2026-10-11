import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import type { Deck } from "@/types";
import { getAllDecks, importDeck, deleteDeck, toggleDeckFavorite } from "@/lib/db";
import {
  DropZone,
  SearchBar,
  SearchToggleButton,
  LoadingSpinner,
  EmptyState,
  SectionHeader,
  CardGrid,
  DeckCard,
  CourseItemsSection,
} from "@/components";
import { useSearchFilter } from "@/hooks";
import { useToast } from "@/context/ToastContext";

const DeckIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="h-12 w-12">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
    />
  </svg>
);

export function DeckDashboard() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const toast = useToast();

  const {
    filters,
    setNameFilter,
    setDescriptionFilter,
    clearFilters,
    hasActiveFilters,
    isVisible: isSearchVisible,
    toggleVisibility: toggleSearch,
    filteredItems: filteredDecks,
  } = useSearchFilter({
    items: decks,
    getSearchableFields: (deck) => ({
      name: deck.name,
      description: deck.description,
    }),
    storageKey: "decks",
  });

  const loadData = useCallback(async (): Promise<void> => {
    try {
      const decksData = await getAllDecks();
      setDecks(decksData);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleImport = async (): Promise<void> => {
    const filePaths = await open({
      multiple: true,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });

    if (!filePaths || filePaths.length === 0) {
      return;
    }

    setImporting(true);
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
    const results = await Promise.allSettled(
      paths.map((path) => importDeck(path))
    );

    results.forEach((result, index) => {
      const filename = paths[index].split(/[\\/]/).pop() ?? paths[index];
      if (result.status === "fulfilled") {
        toast.success(`Imported "${result.value.deck.name}" with ${result.value.cardsImported} cards`);
      } else {
        toast.error(`Failed to import ${filename}`);
      }
    });

    setImporting(false);
    loadData();
  };

  const handleFileDrop = useCallback(async (filePaths: string[]): Promise<void> => {
    setImporting(true);
    const results = await Promise.allSettled(
      filePaths.map((path) => importDeck(path))
    );

    results.forEach((result, index) => {
      const filename = filePaths[index].split(/[\\/]/).pop() ?? filePaths[index];
      if (result.status === "fulfilled") {
        toast.success(`Imported "${result.value.deck.name}" with ${result.value.cardsImported} cards`);
      } else {
        toast.error(`Failed to import ${filename}`);
      }
    });

    setImporting(false);
    loadData();
  }, [toast, loadData]);

  const handleDelete = async (deckId: string): Promise<void> => {
    setDeletingId(deckId);
    try {
      await deleteDeck(deckId);
      toast.success("Deck deleted");
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete deck");
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleFavorite = async (deckId: string): Promise<void> => {
    try {
      await toggleDeckFavorite(deckId);
      loadData();
    } catch (error) {
      toast.error("Failed to update favorite");
    }
  };

  const favoriteDecks = filteredDecks.filter((d) => d.isFavorite);
  const regularDecks = filteredDecks.filter((d) => !d.isFavorite);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <DropZone onFileDrop={handleFileDrop} disabled={importing} label="Drop deck files to import">
      <div className="min-h-full bg-[#2d2a2e]">
        <main className="max-w-7xl mx-auto py-6 px-6">
          <div className="fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
              <div className="flex items-center gap-3">
                <SearchToggleButton
                  isVisible={isSearchVisible}
                  hasActiveFilters={hasActiveFilters}
                  onClick={toggleSearch}
                />
                <h2 className="text-2xl font-bold text-[#fcfcfa] font-mono">Decks</h2>
              </div>
              <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:min-w-[300px]">
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium text-[#fcfcfa] bg-[#5b595c] hover:bg-[#5b595c]/80 transition-colors disabled:opacity-50"
                >
                  {importing ? "Importing..." : "Import Deck"}
                </button>
                <Link
                  to="/decks/new"
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium text-[#2d2a2e] bg-[#ffd866] hover:bg-[#ffd866]/90 transition-colors"
                >
                  + New Deck
                </Link>
              </div>
            </div>

            <SearchBar
              isVisible={isSearchVisible}
              nameValue={filters.name}
              descriptionValue={filters.description}
              onNameChange={setNameFilter}
              onDescriptionChange={setDescriptionFilter}
              onClear={clearFilters}
              hasActiveFilters={hasActiveFilters}
              namePlaceholder="Filter by deck name..."
              descriptionPlaceholder="Filter by description..."
            />

            <CourseItemsSection itemType="deck" onAdopted={loadData} />

            {filteredDecks.length === 0 ? (
              <EmptyState
                icon={<DeckIcon />}
                title={hasActiveFilters ? "No matching decks" : "No decks"}
                description={
                  hasActiveFilters
                    ? "Try adjusting your search filters."
                    : "Get started by creating a new deck or importing one."
                }
                action={
                  hasActiveFilters && (
                    <button onClick={clearFilters} className="text-sm text-[#ffd866] hover:underline">
                      Clear filters
                    </button>
                  )
                }
              />
            ) : (
              <>
                {favoriteDecks.length > 0 && (
                  <div className="mb-6">
                    <SectionHeader title="Favorites" showStar />
                    <CardGrid>
                      {favoriteDecks.map((deck) => (
                        <DeckCard
                          key={deck.id}
                          deck={deck}
                          onDelete={() => handleDelete(deck.id)}
                          onToggleFavorite={() => handleToggleFavorite(deck.id)}
                          isDeleting={deletingId === deck.id}
                        />
                      ))}
                    </CardGrid>
                  </div>
                )}

                {regularDecks.length > 0 && (
                  <div>
                    {favoriteDecks.length > 0 && <SectionHeader title="All Decks" />}
                    <CardGrid>
                      {regularDecks.map((deck) => (
                        <DeckCard
                          key={deck.id}
                          deck={deck}
                          onDelete={() => handleDelete(deck.id)}
                          onToggleFavorite={() => handleToggleFavorite(deck.id)}
                          isDeleting={deletingId === deck.id}
                        />
                      ))}
                    </CardGrid>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </DropZone>
  );
}
