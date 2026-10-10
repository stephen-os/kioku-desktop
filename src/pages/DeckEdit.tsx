import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type {
  Card,
  Tag,
  CreateDeckRequest,
  UpdateDeckRequest,
  CreateCardRequest,
  UpdateCardRequest,
  ContentType,
  CodeLanguage,
  TtsLang,
} from "@/types";
import { CODE_LANGUAGES, CODE_LANGUAGE_LABELS, TTS_LANGUAGES } from "@/types";
import { BackButton } from "@/components";
import {
  getDeck,
  createDeck,
  updateDeck,
  getCardsForDeck,
  createCard,
  updateCard,
  deleteCard,
  getTagsForDeck,
  createTag,
  addTagToCard,
  removeTagFromCard,
} from "@/lib/db";
import { CodeEditor, CodeBlock } from "@/components/CodeEditor";
import { useToast } from "@/context/ToastContext";

export function DeckEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const isNew = id === "new";

  const [cards, setCards] = useState<Card[]>([]);
  const [deckTags, setDeckTags] = useState<Tag[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [shuffleCards, setShuffleCards] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [showCardModal, setShowCardModal] = useState(false);

  // Track original values to detect unsaved changes
  const originalValuesRef = useRef({ name: "", description: "", shuffleCards: false });

  const hasUnsavedChanges = useCallback(() => {
    if (isNew) {
      // For new decks, any content means unsaved changes
      return name.trim() !== "" || description.trim() !== "";
    }
    const orig = originalValuesRef.current;
    return name !== orig.name ||
           description !== orig.description ||
           shuffleCards !== orig.shuffleCards;
  }, [isNew, name, description, shuffleCards]);

  // Warn user before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!isNew && id) {
      loadDeck(id);
    }
  }, [id, isNew]);

  const loadDeck = async (deckId: string) => {
    try {
      const [deckData, cardsData, tagsData] = await Promise.all([
        getDeck(deckId),
        getCardsForDeck(deckId),
        getTagsForDeck(deckId),
      ]);
      if (deckData) {
        setCards(cardsData);
        setDeckTags(tagsData);
        setName(deckData.name);
        setDescription(deckData.description || "");
        setShuffleCards(deckData.shuffleCards);

        // Store original values to detect unsaved changes
        originalValuesRef.current = {
          name: deckData.name,
          description: deckData.description || "",
          shuffleCards: deckData.shuffleCards,
        };
      } else {
        navigate("/");
      }
    } catch (error) {
      console.error("Failed to load deck:", error);
      toast.error("Failed to load deck");
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDeck = async () => {
    if (!name.trim()) return;

    setSaving(true);
    try {
      if (isNew) {
        const request: CreateDeckRequest = {
          name: name.trim(),
          description: description.trim() || undefined,
          shuffleCards,
        };
        const newDeck = await createDeck(request);
        navigate(`/decks/${newDeck.id}/edit`, { replace: true });
      } else if (id) {
        const request: UpdateDeckRequest = {
          name: name.trim(),
          description: description.trim() || undefined,
          shuffleCards,
        };
        await updateDeck(id, request);
        await loadDeck(id);
        toast.success("Deck saved");
      }
    } catch (error) {
      console.error("Failed to save deck:", error);
      toast.error("Failed to save deck");
    } finally {
      setSaving(false);
    }
  };

  const handleAddCard = () => {
    setEditingCard(null);
    setShowCardModal(true);
  };

  const handleEditCard = (card: Card) => {
    setEditingCard(card);
    setShowCardModal(true);
  };

  const handleDeleteCard = async (cardId: string) => {
    if (!id) return;
    try {
      await deleteCard(cardId, id);
      await loadDeck(id);
      toast.success("Card deleted");
    } catch (error) {
      console.error("Failed to delete card:", error);
      toast.error("Failed to delete card");
    }
  };

  const handleSaveCard = async (request: CreateCardRequest | UpdateCardRequest) => {
    if (!id) return;

    try {
      if (editingCard) {
        await updateCard(editingCard.id, id, request as UpdateCardRequest);
        toast.success("Card updated");
      } else {
        await createCard(id, request as CreateCardRequest);
        toast.success("Card added");
      }
      await loadDeck(id);
      setShowCardModal(false);
    } catch (error) {
      console.error("Failed to save card:", error);
      toast.error("Failed to save card");
    }
  };

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center bg-[#2d2a2e]">
        <div className="w-8 h-8 border-2 border-[#ffd866] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#2d2a2e]">
      <main className="max-w-4xl mx-auto py-6 px-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <BackButton
            fallbackPath={isNew ? "/" : `/decks/${id}`}
            label={isNew ? "Back to Decks" : "Back to Deck"}
          />
          <button
            onClick={handleSaveDeck}
            disabled={saving || !name.trim()}
            className="px-4 py-2 bg-[#ffd866] text-[#2d2a2e] rounded-lg font-medium hover:bg-[#ffd866]/90 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : isNew ? "Create Deck" : "Save Changes"}
          </button>
        </div>

        {/* Deck Details */}
        <div className="bg-[#403e41] rounded-xl border border-[#5b595c] p-6 mb-6">
          <h2 className="text-lg font-semibold text-[#fcfcfa] mb-4">Deck Details</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#939293] mb-1">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Deck name"
                className="w-full px-3 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#939293] focus:outline-none focus:border-[#ffd866] focus:ring-1 focus:ring-[#ffd866]/50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#939293] mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                rows={2}
                className="w-full px-3 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#939293] focus:outline-none focus:border-[#ffd866] focus:ring-1 focus:ring-[#ffd866]/50 resize-none"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={shuffleCards}
                onChange={(e) => setShuffleCards(e.target.checked)}
                className="w-4 h-4 rounded border-[#5b595c] bg-[#2d2a2e] text-[#ffd866] focus:ring-[#ffd866]/50"
              />
              <span className="text-sm text-[#fcfcfa]">Shuffle cards when studying</span>
            </label>
          </div>
        </div>

        {/* Cards Section */}
        {!isNew && (
          <div className="bg-[#403e41] rounded-xl border border-[#5b595c] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#fcfcfa]">
                Cards ({cards.length})
              </h2>
              <button
                onClick={handleAddCard}
                className="px-3 py-1.5 bg-[#a9dc76] text-[#2d2a2e] rounded-lg text-sm font-medium hover:bg-[#a9dc76]/90 transition-colors"
              >
                + Add Card
              </button>
            </div>

            {cards.length === 0 ? (
              <p className="text-[#939293] text-center py-8">
                No cards yet. Add your first card to get started.
              </p>
            ) : (
              <div className="space-y-3">
                {cards.map((card, index) => (
                  <CardRow
                    key={card.id}
                    card={card}
                    index={index}
                    onEdit={() => handleEditCard(card)}
                    onDelete={() => handleDeleteCard(card.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {isNew && (
          <p className="text-[#939293] text-center py-8">
            Save the deck first, then you can add cards.
          </p>
        )}
      </main>

      {/* Card Modal */}
      {showCardModal && id && (
        <CardModal
          card={editingCard}
          deckId={id}
          deckTags={deckTags}
          onSave={handleSaveCard}
          onClose={() => setShowCardModal(false)}
          onTagsChange={() => loadDeck(id)}
        />
      )}
    </div>
  );
}

interface CardRowProps {
  card: Card;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}

function CardRow({ card, index, onEdit, onDelete }: CardRowProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isCodeFront = card.frontType === "CODE";
  const isCodeBack = card.backType === "CODE";

  const truncateText = (text: string, maxLength: number = 80) => {
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
      {/* Card content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-[#939293]">#{index + 1}</span>
          {isCodeFront && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-[#78dce8]/20 text-[#78dce8]">
              {CODE_LANGUAGE_LABELS[card.frontLanguage || "PLAINTEXT"]}
            </span>
          )}
          {card.notes && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-[#fc9867]/20 text-[#fc9867]">
              Has notes
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {/* Front preview */}
          <div>
            <span className="text-xs text-[#939293] uppercase tracking-wider">Front</span>
            {isCodeFront ? (
              <div className="max-h-12 overflow-hidden rounded text-sm mt-1">
                <CodeBlock code={truncateCode(card.front)} language={card.frontLanguage} />
              </div>
            ) : (
              <p className="text-[#fcfcfa] text-sm line-clamp-2 mt-1">
                {truncateText(card.front)}
              </p>
            )}
          </div>

          {/* Back preview */}
          <div>
            <span className="text-xs text-[#939293] uppercase tracking-wider">Back</span>
            {isCodeBack ? (
              <div className="max-h-12 overflow-hidden rounded text-sm mt-1">
                <CodeBlock code={truncateCode(card.back)} language={card.backLanguage} />
              </div>
            ) : (
              <p className="text-[#fcfcfa] text-sm line-clamp-2 mt-1">
                {truncateText(card.back)}
              </p>
            )}
          </div>
        </div>

        {/* Tags */}
        {card.tags && card.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {card.tags.map((tag) => (
              <span
                key={tag.id}
                className="text-xs bg-[#ab9df2]/20 text-[#ab9df2] px-2 py-0.5 rounded-full"
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={onEdit}
          className="p-2 text-[#78dce8] hover:bg-[#78dce8]/10 rounded transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>
        {showDeleteConfirm ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                onDelete();
                setShowDeleteConfirm(false);
              }}
              className="px-2 py-1 text-xs bg-[#ff6188] text-[#2d2a2e] rounded"
            >
              Yes
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-2 py-1 text-xs bg-[#5b595c] text-[#fcfcfa] rounded"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-2 text-[#ff6188] hover:bg-[#ff6188]/10 rounded transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
  );
}

interface CardModalProps {
  card: Card | null;
  deckId: string;
  deckTags: Tag[];
  onSave: (request: CreateCardRequest | UpdateCardRequest) => void;
  onClose: () => void;
  onTagsChange?: () => void;
}

function CardModal({ card, deckId, deckTags, onSave, onClose, onTagsChange }: CardModalProps) {
  const toast = useToast();
  const [front, setFront] = useState(card?.front || "");
  const [frontType, setFrontType] = useState<ContentType>(card?.frontType || "TEXT");
  const [frontLanguage, setFrontLanguage] = useState<CodeLanguage | null>(
    card?.frontLanguage || null
  );
  const [back, setBack] = useState(card?.back || "");
  const [backType, setBackType] = useState<ContentType>(card?.backType || "TEXT");
  const [backLanguage, setBackLanguage] = useState<CodeLanguage | null>(
    card?.backLanguage || null
  );
  const [notes, setNotes] = useState(card?.notes || "");
  const [ttsLang, setTtsLang] = useState<TtsLang>((card?.ttsLang as TtsLang) || "en");
  const [saving, setSaving] = useState(false);

  // Tag editing state
  const [selectedTags, setSelectedTags] = useState<Tag[]>(card?.tags || []);
  const [tagInput, setTagInput] = useState("");
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        tagDropdownRef.current &&
        !tagDropdownRef.current.contains(e.target as Node) &&
        tagInputRef.current &&
        !tagInputRef.current.contains(e.target as Node)
      ) {
        setShowTagDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset tags when card changes
  useEffect(() => {
    setSelectedTags(card?.tags || []);
    setTagInput("");
    setShowTagDropdown(false);
  }, [card]);

  // Filter available tags based on input and already selected
  const filteredTags = deckTags.filter(
    (tag) =>
      !selectedTags.some((t) => t.id === tag.id) &&
      tag.name.toLowerCase().includes(tagInput.toLowerCase())
  );

  const canCreateNewTag =
    tagInput.trim() &&
    !deckTags.some((t) => t.name.toLowerCase() === tagInput.toLowerCase()) &&
    !selectedTags.some((t) => t.name.toLowerCase() === tagInput.toLowerCase());

  const handleAddTag = async (tag: Tag) => {
    if (card) {
      // Existing card - add tag immediately
      try {
        await addTagToCard(deckId, card.id, tag.id);
        setSelectedTags((prev) => [...prev, tag]);
        onTagsChange?.();
      } catch (error) {
        console.error("Failed to add tag:", error);
        toast.error("Failed to add tag");
      }
    } else {
      // New card - just track locally (will be added when card is created)
      setSelectedTags((prev) => [...prev, tag]);
    }
    setTagInput("");
    setShowTagDropdown(false);
  };

  const handleCreateAndAddTag = async () => {
    if (!tagInput.trim()) return;
    try {
      const newTag = await createTag(deckId, tagInput.trim());
      if (card) {
        await addTagToCard(deckId, card.id, newTag.id);
        onTagsChange?.();
      }
      setSelectedTags((prev) => [...prev, newTag]);
      setTagInput("");
      setShowTagDropdown(false);
    } catch (error) {
      console.error("Failed to create tag:", error);
      toast.error("Failed to create tag");
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    if (card) {
      try {
        await removeTagFromCard(deckId, card.id, tagId);
        setSelectedTags((prev) => prev.filter((t) => t.id !== tagId));
        onTagsChange?.();
      } catch (error) {
        console.error("Failed to remove tag:", error);
        toast.error("Failed to remove tag");
      }
    } else {
      setSelectedTags((prev) => prev.filter((t) => t.id !== tagId));
    }
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (filteredTags.length > 0) {
        handleAddTag(filteredTags[0]);
      } else if (canCreateNewTag) {
        handleCreateAndAddTag();
      }
    } else if (e.key === "Escape") {
      setShowTagDropdown(false);
    }
  };

  const handleSave = async () => {
    if (!front.trim() || !back.trim()) return;

    setSaving(true);
    try {
      const request: CreateCardRequest = {
        front: front.trim(),
        frontType,
        frontLanguage: frontType === "CODE" ? frontLanguage || undefined : undefined,
        back: back.trim(),
        backType,
        backLanguage: backType === "CODE" ? backLanguage || undefined : undefined,
        notes: notes.trim() || undefined,
        ttsLang,
      };

      onSave(request);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-[#403e41] border border-[#5b595c] rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col m-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#5b595c]">
          <h2 className="text-lg font-semibold text-[#fcfcfa]">
            {card ? "Edit Card" : "Add Card"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#5b595c]/30 rounded-lg text-[#939293] hover:text-[#fcfcfa]"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 space-y-4">
          {/* Front */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-[#939293]">Front</label>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg overflow-hidden border border-[#5b595c]">
                  <button
                    onClick={() => setFrontType("TEXT")}
                    className={`px-3 py-1 text-xs font-medium transition-colors ${
                      frontType === "TEXT"
                        ? "bg-[#ab9df2] text-[#2d2a2e]"
                        : "bg-[#403e41] text-[#939293] hover:bg-[#5b595c]"
                    }`}
                  >
                    Text
                  </button>
                  <button
                    onClick={() => {
                      setFrontType("CODE");
                      if (!frontLanguage) setFrontLanguage("PLAINTEXT");
                    }}
                    className={`px-3 py-1 text-xs font-medium transition-colors ${
                      frontType === "CODE"
                        ? "bg-[#ab9df2] text-[#2d2a2e]"
                        : "bg-[#403e41] text-[#939293] hover:bg-[#5b595c]"
                    }`}
                  >
                    Code
                  </button>
                </div>
                {frontType === "CODE" && (
                  <select
                    value={frontLanguage || "PLAINTEXT"}
                    onChange={(e) => setFrontLanguage(e.target.value as CodeLanguage)}
                    className="px-2 py-1 text-xs bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa]"
                  >
                    {CODE_LANGUAGES.map((lang) => (
                      <option key={lang} value={lang}>
                        {CODE_LANGUAGE_LABELS[lang]}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            {frontType === "CODE" ? (
              <CodeEditor
                value={front}
                onChange={setFront}
                language={frontLanguage}
                minHeight="120px"
              />
            ) : (
              <textarea
                value={front}
                onChange={(e) => setFront(e.target.value)}
                placeholder="Enter front content..."
                rows={3}
                className="w-full px-3 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#939293] focus:outline-none focus:border-[#ffd866] resize-none"
              />
            )}
          </div>

          {/* Back */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-[#939293]">Back</label>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg overflow-hidden border border-[#5b595c]">
                  <button
                    onClick={() => setBackType("TEXT")}
                    className={`px-3 py-1 text-xs font-medium transition-colors ${
                      backType === "TEXT"
                        ? "bg-[#ab9df2] text-[#2d2a2e]"
                        : "bg-[#403e41] text-[#939293] hover:bg-[#5b595c]"
                    }`}
                  >
                    Text
                  </button>
                  <button
                    onClick={() => {
                      setBackType("CODE");
                      if (!backLanguage) setBackLanguage("PLAINTEXT");
                    }}
                    className={`px-3 py-1 text-xs font-medium transition-colors ${
                      backType === "CODE"
                        ? "bg-[#ab9df2] text-[#2d2a2e]"
                        : "bg-[#403e41] text-[#939293] hover:bg-[#5b595c]"
                    }`}
                  >
                    Code
                  </button>
                </div>
                {backType === "CODE" && (
                  <select
                    value={backLanguage || "PLAINTEXT"}
                    onChange={(e) => setBackLanguage(e.target.value as CodeLanguage)}
                    className="px-2 py-1 text-xs bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa]"
                  >
                    {CODE_LANGUAGES.map((lang) => (
                      <option key={lang} value={lang}>
                        {CODE_LANGUAGE_LABELS[lang]}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            {backType === "CODE" ? (
              <CodeEditor
                value={back}
                onChange={setBack}
                language={backLanguage}
                minHeight="120px"
              />
            ) : (
              <textarea
                value={back}
                onChange={(e) => setBack(e.target.value)}
                placeholder="Enter back content..."
                rows={3}
                className="w-full px-3 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#939293] focus:outline-none focus:border-[#ffd866] resize-none"
              />
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-[#939293] mb-2">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes..."
              rows={2}
              className="w-full px-3 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#939293] focus:outline-none focus:border-[#ffd866] resize-none"
            />
          </div>

          {/* Spoken language (read-aloud) — applies to text sides; code is not read */}
          {(frontType === "TEXT" || backType === "TEXT") && (
            <div>
              <label className="block text-sm font-medium text-[#939293] mb-2">
                Spoken language
              </label>
              <select
                value={ttsLang}
                onChange={(e) => setTtsLang(e.target.value as TtsLang)}
                className="px-3 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] text-sm focus:outline-none focus:border-[#ffd866]"
              >
                {TTS_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-[#6b696b]">Voice used when reading this card aloud.</p>
            </div>
          )}

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-[#939293] mb-2">Tags</label>
            <div className="space-y-3">
              {/* Selected tags */}
              {selectedTags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedTags.map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center gap-1.5 text-sm bg-[#ab9df2] text-[#2d2a2e] px-3 py-1 rounded-full"
                    >
                      {tag.name}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag.id)}
                        className="hover:bg-[#2d2a2e]/20 rounded-full p-0.5 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Tag input with autocomplete */}
              <div className="relative">
                <input
                  ref={tagInputRef}
                  type="text"
                  value={tagInput}
                  onChange={(e) => {
                    setTagInput(e.target.value);
                    setShowTagDropdown(true);
                  }}
                  onFocus={() => setShowTagDropdown(true)}
                  onKeyDown={handleTagKeyDown}
                  placeholder="Add tags..."
                  className="w-full px-3 py-2 bg-[#2d2a2e] border border-[#5b595c] rounded-lg text-[#fcfcfa] placeholder-[#939293] focus:outline-none focus:border-[#ab9df2] focus:ring-1 focus:ring-[#ab9df2]/50 transition-colors"
                />

                {/* Dropdown */}
                {showTagDropdown && (filteredTags.length > 0 || canCreateNewTag) && (
                  <div
                    ref={tagDropdownRef}
                    className="absolute z-10 mt-1 w-full bg-[#403e41] border border-[#5b595c] rounded-lg shadow-lg max-h-48 overflow-auto"
                  >
                    {filteredTags.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => handleAddTag(tag)}
                        className="w-full text-left px-3 py-2 text-sm text-[#fcfcfa] hover:bg-[#5b595c]/50 transition-colors"
                      >
                        {tag.name}
                      </button>
                    ))}
                    {canCreateNewTag && (
                      <button
                        type="button"
                        onClick={handleCreateAndAddTag}
                        className="w-full text-left px-3 py-2 text-sm text-[#a9dc76] hover:bg-[#5b595c]/50 transition-colors flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Create "{tagInput}"
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#5b595c] bg-[#2d2a2e]">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-[#5b595c] text-[#fcfcfa] rounded-lg hover:bg-[#5b595c]/30"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !front.trim() || !back.trim()}
            className="px-4 py-2 bg-[#ffd866] text-[#2d2a2e] rounded-lg font-medium hover:bg-[#ffd866]/90 disabled:opacity-50"
          >
            {saving ? "Saving..." : card ? "Update" : "Add Card"}
          </button>
        </div>
      </div>
    </div>
  );
}
