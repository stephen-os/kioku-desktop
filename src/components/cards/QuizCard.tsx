import { Link } from "react-router-dom";
import type { Quiz, QuizStats } from "@/types";
import type { ViewMode } from "@/hooks";
import { FavoriteButton } from "../ui/FavoriteButton";
import { DeleteConfirmButton } from "../ui/DeleteConfirmButton";

interface QuizCardProps {
  quiz: Quiz;
  stats?: QuizStats;
  onDelete: () => void;
  onToggleFavorite: () => void;
  isDeleting?: boolean;
  view?: ViewMode;
}

export function QuizCard({ quiz, stats, onDelete, onToggleFavorite, isDeleting, view = "grid" }: QuizCardProps) {
  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleFavorite();
  };

  if (view === "list") {
    return (
      <div className="flex items-center gap-3 bg-[#403e41] rounded-lg border border-[#5b595c] hover:border-[#939293] transition-colors px-4 py-2.5">
        <Link to={`/quizzes/${quiz.id}`} className="flex-1 min-w-0 flex items-center gap-3">
          <span className="text-xs px-2 py-0.5 rounded bg-[#78dce8]/20 text-[#78dce8] shrink-0">
            {quiz.questionCount ?? quiz.questions?.length ?? 0}
          </span>
          <span className="text-sm font-medium text-[#fcfcfa] truncate">{quiz.name}</span>
          {stats && stats.totalAttempts > 0 && (
            <span className="text-xs text-[#a9dc76] shrink-0 hidden sm:block">Best {stats.bestScore}%</span>
          )}
          {quiz.description && (
            <span className="text-xs text-[#939293] truncate hidden md:block">{quiz.description}</span>
          )}
        </Link>
        <div className="flex items-center gap-1 shrink-0">
          <FavoriteButton isFavorite={quiz.isFavorite ?? false} onClick={handleFavoriteClick} size="sm" />
          <Link to={`/quizzes/${quiz.id}/take`} className="px-2 py-1 text-xs rounded bg-[#a9dc76]/20 text-[#a9dc76] hover:bg-[#a9dc76]/30 transition-colors font-medium">
            Take
          </Link>
          <Link to={`/quizzes/${quiz.id}/edit`} className="px-2 py-1 text-xs rounded bg-[#ffd866]/20 text-[#ffd866] hover:bg-[#ffd866]/30 transition-colors font-medium">
            Edit
          </Link>
          <DeleteConfirmButton onConfirm={onDelete} isDeleting={isDeleting} />
        </div>
      </div>
    );
  }

  return (
    <div className="block bg-[#403e41] overflow-hidden rounded-xl border border-[#5b595c] hover:border-[#939293] transition-colors">
      <Link to={`/quizzes/${quiz.id}`} className="block px-5 py-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded bg-[#78dce8]/20 text-[#78dce8]">
              {quiz.questionCount ?? quiz.questions?.length ?? 0} questions
            </span>
            {quiz.shuffleQuestions && (
              <span className="text-xs px-2 py-0.5 rounded bg-[#ab9df2]/20 text-[#ab9df2]">
                Shuffle
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <FavoriteButton
              isFavorite={quiz.isFavorite ?? false}
              onClick={handleFavoriteClick}
              size="sm"
            />
            <span className="text-xs text-[#939293] font-mono">
              {new Date(quiz.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
        <h3 className="text-base font-medium text-[#fcfcfa] truncate">
          {quiz.name}
        </h3>
        <p className="mt-1 text-sm text-[#939293] line-clamp-2">
          {quiz.description || "No description"}
        </p>

        {stats && stats.totalAttempts > 0 && (
          <div className="mt-3 pt-3 border-t border-[#5b595c] grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-lg font-bold text-[#a9dc76]">
                {stats.bestScore}%
              </div>
              <div className="text-xs text-[#939293]">Best</div>
            </div>
            <div>
              <div className="text-lg font-bold text-[#ffd866]">
                {Math.round(stats.averageScore)}%
              </div>
              <div className="text-xs text-[#939293]">Avg</div>
            </div>
            <div>
              <div className="text-lg font-bold text-[#78dce8]">
                {stats.totalAttempts}
              </div>
              <div className="text-xs text-[#939293]">Attempts</div>
            </div>
          </div>
        )}
      </Link>

      <div className="px-5 pb-4 flex gap-2">
        <Link
          to={`/quizzes/${quiz.id}/take`}
          className="flex-1 text-center px-3 py-2 bg-[#a9dc76]/20 text-[#a9dc76] text-sm rounded-lg hover:bg-[#a9dc76]/30 transition-colors font-medium"
        >
          Take Quiz
        </Link>
        <Link
          to={`/quizzes/${quiz.id}/edit`}
          className="flex-1 text-center px-3 py-2 bg-[#ffd866]/20 text-[#ffd866] text-sm rounded-lg hover:bg-[#ffd866]/30 transition-colors font-medium"
        >
          Edit
        </Link>
        <DeleteConfirmButton onConfirm={onDelete} isDeleting={isDeleting} />
      </div>
    </div>
  );
}
