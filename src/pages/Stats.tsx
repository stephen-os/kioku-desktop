import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import type { Deck, DeckStudyStats, Quiz, QuizStats } from "@/types";
import { getAllDecks, getDeckStudyStats, getAllQuizzes, getQuizStats } from "@/lib/db";
import { formatDuration } from "@/lib/utils";

interface DeckWithStats extends Deck {
  stats: DeckStudyStats | null;
}

interface QuizWithStats extends Quiz {
  stats: QuizStats | null;
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

export function Stats() {
  const [decksWithStats, setDecksWithStats] = useState<DeckWithStats[]>([]);
  const [quizzesWithStats, setQuizzesWithStats] = useState<QuizWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        // Load decks and their stats
        const decks = await getAllDecks();
        const decksWithStatsData: DeckWithStats[] = await Promise.all(
          decks.map(async (deck) => {
            try {
              const stats = await getDeckStudyStats(deck.id);
              return { ...deck, stats };
            } catch {
              return { ...deck, stats: null };
            }
          })
        );
        setDecksWithStats(decksWithStatsData);

        // Load quizzes and their stats
        const quizzes = await getAllQuizzes();
        const quizzesWithStatsData: QuizWithStats[] = await Promise.all(
          quizzes.map(async (quiz) => {
            try {
              const stats = await getQuizStats(quiz.id);
              return { ...quiz, stats };
            } catch {
              return { ...quiz, stats: null };
            }
          })
        );
        setQuizzesWithStats(quizzesWithStatsData);
      } catch (error) {
        console.error("Failed to load stats:", error);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  // Calculate totals for decks
  const deckTotals = {
    totalSessions: decksWithStats.reduce((sum, d) => sum + (d.stats?.totalSessions || 0), 0),
    totalStudyTime: decksWithStats.reduce((sum, d) => sum + (d.stats?.totalStudyTimeSeconds || 0), 0),
    totalCardsStudied: decksWithStats.reduce((sum, d) => sum + (d.stats?.totalCardsStudied || 0), 0),
  };

  // Calculate totals for quizzes
  const quizTotals = {
    totalAttempts: quizzesWithStats.reduce((sum, q) => sum + (q.stats?.totalAttempts || 0), 0),
    averageScore:
      quizzesWithStats.filter((q) => q.stats && q.stats.totalAttempts > 0).length > 0
        ? quizzesWithStats
            .filter((q) => q.stats && q.stats.totalAttempts > 0)
            .reduce((sum, q) => sum + (q.stats?.averageScore || 0), 0) /
          quizzesWithStats.filter((q) => q.stats && q.stats.totalAttempts > 0).length
        : 0,
    bestScore: Math.max(0, ...quizzesWithStats.map((q) => q.stats?.bestScore || 0)),
  };

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center bg-[#2d2a2e]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#ffd866] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#939293]">Loading stats...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#2d2a2e]">
      <main className="max-w-5xl mx-auto py-6 px-6">
        <div className="fade-in">
          <h1 className="text-2xl font-bold text-[#fcfcfa] font-mono mb-6">Statistics</h1>

          {/* Overall Summary */}
          <section className="bg-[#403e41] rounded-xl border border-[#5b595c] p-6 mb-6">
            <h2 className="text-lg font-semibold text-[#fcfcfa] mb-4">Overall Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-[#2d2a2e] rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-[#a9dc76]">
                  {formatDuration(deckTotals.totalStudyTime)}
                </div>
                <div className="text-sm text-[#939293] mt-1">Total Study Time</div>
              </div>
              <div className="bg-[#2d2a2e] rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-[#78dce8]">
                  {deckTotals.totalCardsStudied}
                </div>
                <div className="text-sm text-[#939293] mt-1">Cards Studied</div>
              </div>
              <div className="bg-[#2d2a2e] rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-[#ffd866]">
                  {deckTotals.totalSessions}
                </div>
                <div className="text-sm text-[#939293] mt-1">Study Sessions</div>
              </div>
              <div className="bg-[#2d2a2e] rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-[#ab9df2]">
                  {quizTotals.totalAttempts}
                </div>
                <div className="text-sm text-[#939293] mt-1">Quiz Attempts</div>
              </div>
            </div>
          </section>

          {/* Deck Stats */}
          <section className="bg-[#403e41] rounded-xl border border-[#5b595c] p-6 mb-6">
            <h2 className="text-lg font-semibold text-[#fcfcfa] mb-4">Deck Statistics</h2>

            {decksWithStats.length === 0 ? (
              <p className="text-[#939293] text-center py-4">No decks yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#5b595c]">
                      <th className="text-left py-3 px-2 text-xs font-medium text-[#939293] uppercase tracking-wider">
                        Deck
                      </th>
                      <th className="text-center py-3 px-2 text-xs font-medium text-[#939293] uppercase tracking-wider">
                        Sessions
                      </th>
                      <th className="text-center py-3 px-2 text-xs font-medium text-[#939293] uppercase tracking-wider">
                        Study Time
                      </th>
                      <th className="text-center py-3 px-2 text-xs font-medium text-[#939293] uppercase tracking-wider">
                        Cards Studied
                      </th>
                      <th className="text-center py-3 px-2 text-xs font-medium text-[#939293] uppercase tracking-wider">
                        Last Studied
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {decksWithStats.map((deck) => (
                      <tr
                        key={deck.id}
                        className="border-b border-[#5b595c]/50 hover:bg-[#5b595c]/20 transition-colors"
                      >
                        <td className="py-3 px-2">
                          <Link
                            to={`/decks/${deck.id}`}
                            className="text-[#fcfcfa] hover:text-[#78dce8] transition-colors"
                          >
                            {deck.name}
                          </Link>
                          <div className="text-xs text-[#939293]">
                            {deck.cardCount ?? 0} cards
                          </div>
                        </td>
                        <td className="py-3 px-2 text-center text-[#ffd866]">
                          {deck.stats?.totalSessions || 0}
                        </td>
                        <td className="py-3 px-2 text-center text-[#a9dc76]">
                          {formatDuration(deck.stats?.totalStudyTimeSeconds || 0)}
                        </td>
                        <td className="py-3 px-2 text-center text-[#78dce8]">
                          {deck.stats?.totalCardsStudied || 0}
                        </td>
                        <td className="py-3 px-2 text-center text-[#939293]">
                          {formatDate(deck.stats?.lastStudiedAt || null)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Quiz Stats */}
          <section className="bg-[#403e41] rounded-xl border border-[#5b595c] p-6">
            <h2 className="text-lg font-semibold text-[#fcfcfa] mb-4">Quiz Statistics</h2>

            {quizzesWithStats.length === 0 ? (
              <p className="text-[#939293] text-center py-4">No quizzes yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#5b595c]">
                      <th className="text-left py-3 px-2 text-xs font-medium text-[#939293] uppercase tracking-wider">
                        Quiz
                      </th>
                      <th className="text-center py-3 px-2 text-xs font-medium text-[#939293] uppercase tracking-wider">
                        Attempts
                      </th>
                      <th className="text-center py-3 px-2 text-xs font-medium text-[#939293] uppercase tracking-wider">
                        Best Score
                      </th>
                      <th className="text-center py-3 px-2 text-xs font-medium text-[#939293] uppercase tracking-wider">
                        Avg Score
                      </th>
                      <th className="text-center py-3 px-2 text-xs font-medium text-[#939293] uppercase tracking-wider">
                        Avg Time
                      </th>
                      <th className="text-center py-3 px-2 text-xs font-medium text-[#939293] uppercase tracking-wider">
                        Last Attempt
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {quizzesWithStats.map((quiz) => (
                      <tr
                        key={quiz.id}
                        className="border-b border-[#5b595c]/50 hover:bg-[#5b595c]/20 transition-colors"
                      >
                        <td className="py-3 px-2">
                          <Link
                            to={`/quizzes/${quiz.id}`}
                            className="text-[#fcfcfa] hover:text-[#78dce8] transition-colors"
                          >
                            {quiz.name}
                          </Link>
                          <div className="text-xs text-[#939293]">
                            {quiz.questionCount ?? 0} questions
                          </div>
                        </td>
                        <td className="py-3 px-2 text-center text-[#ab9df2]">
                          {quiz.stats?.totalAttempts || 0}
                        </td>
                        <td className="py-3 px-2 text-center">
                          <span
                            className={
                              (quiz.stats?.bestScore || 0) >= 80
                                ? "text-[#a9dc76]"
                                : (quiz.stats?.bestScore || 0) >= 60
                                ? "text-[#ffd866]"
                                : "text-[#ff6188]"
                            }
                          >
                            {quiz.stats?.bestScore || 0}%
                          </span>
                        </td>
                        <td className="py-3 px-2 text-center text-[#939293]">
                          {quiz.stats?.totalAttempts
                            ? `${Math.round(quiz.stats.averageScore)}%`
                            : "-"}
                        </td>
                        <td className="py-3 px-2 text-center text-[#939293]">
                          {quiz.stats?.averageDurationSeconds
                            ? formatDuration(quiz.stats.averageDurationSeconds)
                            : "-"}
                        </td>
                        <td className="py-3 px-2 text-center text-[#939293]">
                          {formatDate(quiz.stats?.lastAttemptAt || null)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
