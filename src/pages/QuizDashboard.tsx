import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import type { Quiz, QuizStats } from "@/types";
import { getAllQuizzes, getQuizStats, deleteQuiz, importQuiz, toggleQuizFavorite } from "@/lib/db";
import {
  DropZone,
  SearchBar,
  SearchToggleButton,
  LoadingSpinner,
  EmptyState,
  SectionHeader,
  CardGrid,
  QuizCard,
  CourseItemsSection,
  ViewToggle,
} from "@/components";
import { useSearchFilter, useViewMode } from "@/hooks";
import { useToast } from "@/context/ToastContext";

const QuizIcon = () => (
  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="h-12 w-12">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
    />
  </svg>
);

export function QuizDashboard() {
  const toast = useToast();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [quizStats, setQuizStats] = useState<Record<string, QuizStats>>({});
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [view, setView] = useViewMode("quizzes");

  const {
    filters,
    setNameFilter,
    setDescriptionFilter,
    clearFilters,
    hasActiveFilters,
    isVisible: isSearchVisible,
    toggleVisibility: toggleSearch,
    filteredItems: filteredQuizzes,
  } = useSearchFilter({
    items: quizzes,
    getSearchableFields: (quiz) => ({
      name: quiz.name,
      description: quiz.description,
    }),
    storageKey: "quizzes",
  });

  const loadData = useCallback(async () => {
    try {
      const quizzesData = await getAllQuizzes();
      setQuizzes(quizzesData);

      // Load stats for each quiz
      const stats: Record<string, QuizStats> = {};
      for (const quiz of quizzesData) {
        try {
          stats[quiz.id] = await getQuizStats(quiz.id);
        } catch (error) {
          // Stats are non-critical - quiz card can still render without them
          console.error(`Failed to load stats for quiz ${quiz.id}:`, error);
        }
      }
      setQuizStats(stats);
    } catch (error) {
      console.error("Failed to load data:", error);
      toast.error("Failed to load quizzes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDelete = async (quizId: string) => {
    setDeletingId(quizId);
    try {
      await deleteQuiz(quizId);
      toast.success("Quiz deleted");
      loadData();
    } catch (error) {
      console.error("Failed to delete quiz:", error);
      toast.error("Failed to delete quiz");
    } finally {
      setDeletingId(null);
    }
  };

  const handleImport = async () => {
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
      paths.map((path) => importQuiz(path))
    );

    results.forEach((result, index) => {
      const filename = paths[index].split(/[\\/]/).pop() ?? paths[index];
      if (result.status === "fulfilled") {
        toast.success(`Imported "${result.value.quiz.name}" with ${result.value.questionsImported} questions`);
      } else {
        toast.error(`Failed to import ${filename}`);
      }
    });

    setImporting(false);
    loadData();
  };

  const handleFileDrop = useCallback(async (filePaths: string[]) => {
    setImporting(true);
    const results = await Promise.allSettled(
      filePaths.map((path) => importQuiz(path))
    );

    results.forEach((result, index) => {
      const filename = filePaths[index].split(/[\\/]/).pop() ?? filePaths[index];
      if (result.status === "fulfilled") {
        toast.success(`Imported "${result.value.quiz.name}" with ${result.value.questionsImported} questions`);
      } else {
        toast.error(`Failed to import ${filename}`);
      }
    });

    setImporting(false);
    loadData();
  }, [toast, loadData]);

  const handleToggleFavorite = async (quizId: string): Promise<void> => {
    try {
      await toggleQuizFavorite(quizId);
      loadData();
    } catch (error) {
      toast.error("Failed to update favorite");
    }
  };

  const favoriteQuizzes = filteredQuizzes.filter((q) => q.isFavorite);
  const regularQuizzes = filteredQuizzes.filter((q) => !q.isFavorite);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <DropZone onFileDrop={handleFileDrop} disabled={importing} label="Drop quiz files to import">
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
                <h2 className="text-2xl font-bold text-[#fcfcfa] font-mono">Quizzes</h2>
                <ViewToggle value={view} onChange={setView} />
              </div>
              <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:min-w-[300px]">
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium text-[#fcfcfa] bg-[#5b595c] hover:bg-[#5b595c]/80 transition-colors disabled:opacity-50"
                >
                  {importing ? "Importing..." : "Import Quiz"}
                </button>
                <Link
                  to="/quizzes/new"
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium text-[#2d2a2e] bg-[#ffd866] hover:bg-[#ffd866]/90 transition-colors"
                >
                  + New Quiz
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
              namePlaceholder="Filter by quiz name..."
              descriptionPlaceholder="Filter by description..."
            />

            <CourseItemsSection itemType="quiz" onAdopted={loadData} view={view} />

            {filteredQuizzes.length === 0 ? (
              <EmptyState
                icon={<QuizIcon />}
                title={hasActiveFilters ? "No matching quizzes" : "No quizzes"}
                description={
                  hasActiveFilters
                    ? "Try adjusting your search filters."
                    : "Create your first quiz to test your knowledge."
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
                {favoriteQuizzes.length > 0 && (
                  <div className="mb-6">
                    <SectionHeader title="Favorites" showStar />
                    <CardGrid view={view}>
                      {favoriteQuizzes.map((quiz) => (
                        <QuizCard
                          key={quiz.id}
                          quiz={quiz}
                          stats={quizStats[quiz.id]}
                          onDelete={() => handleDelete(quiz.id)}
                          onToggleFavorite={() => handleToggleFavorite(quiz.id)}
                          isDeleting={deletingId === quiz.id}
                          view={view}
                        />
                      ))}
                    </CardGrid>
                  </div>
                )}

                {regularQuizzes.length > 0 && (
                  <div>
                    {favoriteQuizzes.length > 0 && <SectionHeader title="All Quizzes" />}
                    <CardGrid view={view}>
                      {regularQuizzes.map((quiz) => (
                        <QuizCard
                          key={quiz.id}
                          quiz={quiz}
                          stats={quizStats[quiz.id]}
                          onDelete={() => handleDelete(quiz.id)}
                          onToggleFavorite={() => handleToggleFavorite(quiz.id)}
                          isDeleting={deletingId === quiz.id}
                          view={view}
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
