import { useState, useEffect, useCallback } from "react";
import type { Notebook, CreateNotebookRequest } from "@/types";
import { getAllNotebooks, createNotebook, deleteNotebook, toggleNotebookFavorite } from "@/lib/db";
import {
  SearchBar,
  SearchToggleButton,
  LoadingSpinner,
  EmptyState,
  SectionHeader,
  CardGrid,
  CourseItemsSection,
} from "@/components";
import { NotebookCard } from "@/components/cards/NotebookCard";
import { useSearchFilter } from "@/hooks";
import { useToast } from "@/context/ToastContext";

const NotebookIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="h-12 w-12">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
    />
  </svg>
);

export function NotesDashboard() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
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
    filteredItems: filteredNotebooks,
  } = useSearchFilter({
    items: notebooks,
    getSearchableFields: (notebook) => ({
      name: notebook.name,
      description: notebook.description,
    }),
    storageKey: "notebooks",
  });

  const loadData = useCallback(async (): Promise<void> => {
    try {
      const notebooksData = await getAllNotebooks();
      setNotebooks(notebooksData);
    } catch (error) {
      console.error("Failed to load notebooks:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateNotebook = async (): Promise<void> => {
    setCreating(true);
    try {
      const request: CreateNotebookRequest = {
        name: "Untitled Notebook",
      };
      const notebook = await createNotebook(request);
      toast.success("Notebook created");
      // Navigate to the new notebook
      window.location.href = `/notes/${notebook.id}`;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create notebook");
      setCreating(false);
    }
  };

  const handleDelete = async (notebookId: string): Promise<void> => {
    setDeletingId(notebookId);
    try {
      await deleteNotebook(notebookId);
      toast.success("Notebook deleted");
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete notebook");
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleFavorite = async (notebookId: string): Promise<void> => {
    try {
      await toggleNotebookFavorite(notebookId);
      loadData();
    } catch (error) {
      toast.error("Failed to update favorite");
    }
  };

  const favoriteNotebooks = filteredNotebooks.filter((n) => n.isFavorite);
  const regularNotebooks = filteredNotebooks.filter((n) => !n.isFavorite);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
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
              <h2 className="text-2xl font-bold text-[#fcfcfa] font-mono">Notes</h2>
            </div>
            <div className="w-full sm:w-auto sm:min-w-[150px]">
              <button
                onClick={handleCreateNotebook}
                disabled={creating}
                className="w-full inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium text-[#2d2a2e] bg-[#ffd866] hover:bg-[#ffd866]/90 transition-colors disabled:opacity-50"
              >
                {creating ? "Creating..." : "+ New Notebook"}
              </button>
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
            namePlaceholder="Filter by notebook name..."
            descriptionPlaceholder="Filter by description..."
          />

          <CourseItemsSection itemType="note" onAdopted={loadData} />

          {filteredNotebooks.length === 0 ? (
            <EmptyState
              icon={<NotebookIcon />}
              title={hasActiveFilters ? "No matching notebooks" : "No notebooks"}
              description={
                hasActiveFilters
                  ? "Try adjusting your search filters."
                  : "Get started by creating a new notebook."
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
              {favoriteNotebooks.length > 0 && (
                <div className="mb-6">
                  <SectionHeader title="Favorites" showStar />
                  <CardGrid>
                    {favoriteNotebooks.map((notebook) => (
                      <NotebookCard
                        key={notebook.id}
                        notebook={notebook}
                        onDelete={() => handleDelete(notebook.id)}
                        onToggleFavorite={() => handleToggleFavorite(notebook.id)}
                        isDeleting={deletingId === notebook.id}
                      />
                    ))}
                  </CardGrid>
                </div>
              )}

              {regularNotebooks.length > 0 && (
                <div>
                  {favoriteNotebooks.length > 0 && <SectionHeader title="All Notebooks" />}
                  <CardGrid>
                    {regularNotebooks.map((notebook) => (
                      <NotebookCard
                        key={notebook.id}
                        notebook={notebook}
                        onDelete={() => handleDelete(notebook.id)}
                        onToggleFavorite={() => handleToggleFavorite(notebook.id)}
                        isDeleting={deletingId === notebook.id}
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
  );
}
