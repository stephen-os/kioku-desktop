import { Link } from "react-router-dom";
import type { Deck } from "@/types";
import type { ViewMode } from "@/hooks";
import { FavoriteButton } from "../ui/FavoriteButton";
import { DeleteConfirmButton } from "../ui/DeleteConfirmButton";

interface DeckCardProps {
  deck: Deck;
  onDelete: () => void;
  onToggleFavorite: () => void;
  isDeleting?: boolean;
  view?: ViewMode;
}

export function DeckCard({ deck, onDelete, onToggleFavorite, isDeleting, view = "grid" }: DeckCardProps) {
  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleFavorite();
  };

  if (view === "list") {
    return (
      <div className="flex items-center gap-3 bg-[#403e41] rounded-lg border border-[#5b595c] hover:border-[#939293] transition-colors px-4 py-2.5">
        <Link to={`/decks/${deck.id}`} className="flex-1 min-w-0 flex items-center gap-3">
          <span className="text-xs px-2 py-0.5 rounded bg-[#78dce8]/20 text-[#78dce8] shrink-0">
            {deck.cardCount ?? 0}
          </span>
          <span className="text-sm font-medium text-[#fcfcfa] truncate">{deck.name}</span>
          {deck.description && (
            <span className="text-xs text-[#939293] truncate hidden md:block">{deck.description}</span>
          )}
        </Link>
        <div className="flex items-center gap-1 shrink-0">
          <FavoriteButton isFavorite={deck.isFavorite ?? false} onClick={handleFavoriteClick} size="sm" />
          <Link to={`/decks/${deck.id}/study`} className="px-2 py-1 text-xs rounded bg-[#a9dc76]/20 text-[#a9dc76] hover:bg-[#a9dc76]/30 transition-colors font-medium">
            Study
          </Link>
          <Link to={`/decks/${deck.id}`} className="px-2 py-1 text-xs rounded bg-[#ffd866]/20 text-[#ffd866] hover:bg-[#ffd866]/30 transition-colors font-medium">
            Manage
          </Link>
          <DeleteConfirmButton onConfirm={onDelete} isDeleting={isDeleting} />
        </div>
      </div>
    );
  }

  return (
    <div className="block bg-[#403e41] overflow-hidden rounded-xl border border-[#5b595c] hover:border-[#939293] transition-colors">
      <Link to={`/decks/${deck.id}`} className="block px-5 py-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded bg-[#78dce8]/20 text-[#78dce8]">
              {deck.cardCount ?? 0} cards
            </span>
            {deck.shuffleCards && (
              <span className="text-xs px-2 py-0.5 rounded bg-[#ab9df2]/20 text-[#ab9df2]">
                Shuffle
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <FavoriteButton
              isFavorite={deck.isFavorite ?? false}
              onClick={handleFavoriteClick}
              size="sm"
            />
            <span className="text-xs text-[#939293] font-mono">
              {new Date(deck.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
        <h3 className="text-base font-medium text-[#fcfcfa] truncate">
          {deck.name}
        </h3>
        <p className="mt-1 text-sm text-[#939293] line-clamp-2">
          {deck.description || "No description"}
        </p>
      </Link>
      <div className="px-5 pb-4 flex gap-2">
        <Link
          to={`/decks/${deck.id}/study`}
          className="flex-1 text-center px-3 py-2 bg-[#a9dc76]/20 text-[#a9dc76] text-sm rounded-lg hover:bg-[#a9dc76]/30 transition-colors font-medium"
        >
          Study
        </Link>
        <Link
          to={`/decks/${deck.id}`}
          className="flex-1 text-center px-3 py-2 bg-[#ffd866]/20 text-[#ffd866] text-sm rounded-lg hover:bg-[#ffd866]/30 transition-colors font-medium"
        >
          Manage
        </Link>
        <DeleteConfirmButton onConfirm={onDelete} isDeleting={isDeleting} />
      </div>
    </div>
  );
}
