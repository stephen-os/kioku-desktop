import { Link } from "react-router-dom";
import type { Notebook } from "@/types";
import type { ViewMode } from "@/hooks";
import { FavoriteButton } from "../ui/FavoriteButton";
import { DeleteConfirmButton } from "../ui/DeleteConfirmButton";

interface NotebookCardProps {
  notebook: Notebook;
  onDelete: () => void;
  onToggleFavorite: () => void;
  isDeleting?: boolean;
  view?: ViewMode;
}

export function NotebookCard({ notebook, onDelete, onToggleFavorite, isDeleting, view = "grid" }: NotebookCardProps) {
  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleFavorite();
  };

  if (view === "list") {
    return (
      <div className="flex items-center gap-3 bg-[#403e41] rounded-lg border border-[#5b595c] hover:border-[#939293] transition-colors px-4 py-2.5">
        <Link to={`/notes/${notebook.id}`} className="flex-1 min-w-0 flex items-center gap-3">
          <span className="text-xs px-2 py-0.5 rounded bg-[#a9dc76]/20 text-[#a9dc76] shrink-0">
            {notebook.pageCount ?? 0}
          </span>
          <span className="text-sm font-medium text-[#fcfcfa] truncate">{notebook.name}</span>
          {notebook.description && (
            <span className="text-xs text-[#939293] truncate hidden md:block">{notebook.description}</span>
          )}
        </Link>
        <div className="flex items-center gap-1 shrink-0">
          <FavoriteButton isFavorite={notebook.isFavorite ?? false} onClick={handleFavoriteClick} size="sm" />
          <Link to={`/notes/${notebook.id}`} className="px-2 py-1 text-xs rounded bg-[#a9dc76]/20 text-[#a9dc76] hover:bg-[#a9dc76]/30 transition-colors font-medium">
            Open
          </Link>
          <DeleteConfirmButton onConfirm={onDelete} isDeleting={isDeleting} />
        </div>
      </div>
    );
  }

  return (
    <div className="block bg-[#403e41] overflow-hidden rounded-xl border border-[#5b595c] hover:border-[#939293] transition-colors">
      <Link to={`/notes/${notebook.id}`} className="block px-5 py-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded bg-[#a9dc76]/20 text-[#a9dc76]">
              {notebook.pageCount ?? 0} pages
            </span>
          </div>
          <div className="flex items-center gap-1">
            <FavoriteButton
              isFavorite={notebook.isFavorite ?? false}
              onClick={handleFavoriteClick}
              size="sm"
            />
            <span className="text-xs text-[#939293] font-mono">
              {new Date(notebook.updatedAt).toLocaleDateString()}
            </span>
          </div>
        </div>
        <h3 className="text-base font-medium text-[#fcfcfa] truncate">
          {notebook.name}
        </h3>
        <p className="mt-1 text-sm text-[#939293] line-clamp-2">
          {notebook.description || "No description"}
        </p>
      </Link>
      <div className="px-5 pb-4 flex gap-2">
        <Link
          to={`/notes/${notebook.id}`}
          className="flex-1 text-center px-3 py-2 bg-[#a9dc76]/20 text-[#a9dc76] text-sm rounded-lg hover:bg-[#a9dc76]/30 transition-colors font-medium"
        >
          Open
        </Link>
        <DeleteConfirmButton onConfirm={onDelete} isDeleting={isDeleting} />
      </div>
    </div>
  );
}
