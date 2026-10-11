import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import type { Card, Deck, Tag } from "@/types";
import { CODE_LANGUAGE_LABELS } from "@/types";
import { getCardsForDeck, getDeck, getTagsForDeck, startStudySession, endStudySession, recordLessonProgress, getCourseDeck, getCourseCards } from "@/lib/db";
import { shuffle } from "@/lib/utils";
import { isTauri } from "@/lib/auth";
import { CodeBlock } from "@/components/CodeEditor";
import { BackButton } from "@/components";
import { useToast } from "@/context/ToastContext";
import { speak, stopSpeaking, textForSpeech } from "@/lib/tts";

// Persisted toggle: auto-read each card side aloud as you study.
const AUTO_READ_KEY = "kioku-study-autoread";

type FilterLogic = "any" | "all";

// Animation timing constants
const CARD_SWIPE_DURATION_MS = 280;

export function StudyMode() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [studyComplete, setStudyComplete] = useState(false);

  // TTS: per-session auto-read toggle (persisted). A manual speaker button plays
  // the current side on demand regardless of this setting.
  const [autoRead, setAutoRead] = useState(() => {
    try {
      return localStorage.getItem(AUTO_READ_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggleAutoRead = useCallback(() => {
    setAutoRead((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(AUTO_READ_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // URL filter params - use raw strings for stable dependencies
  const urlFrontSearch = searchParams.get("front") || "";
  const urlBackSearch = searchParams.get("back") || "";
  const urlTagsRaw = searchParams.get("tags") || "";
  const rawTagMode = searchParams.get("tagMode");
  const urlTagMode: FilterLogic = rawTagMode === "any" || rawTagMode === "all" ? rawTagMode : "any";
  const hasUrlFilters = urlFrontSearch || urlBackSearch || urlTagsRaw.length > 0;

  // Course context (present only when launched from a course). When set, opening
  // the deck records lesson progress (R2-1) and "Back" returns to the course.
  const courseId = searchParams.get("courseId") || "";
  const courseLessonId = searchParams.get("lessonId") || "";
  const courseLessonItemId = searchParams.get("lessonItemId") || "";
  // When launched from a course, `id` is a course_deck id loaded from the course
  // store (not the personal library), and we don't record a library study session.
  const isCourse = (searchParams.get("source") || "") === "course";
  const backPath = courseId ? `/courses/${courseId}` : `/decks/${id}`;
  const backLabel = courseId ? "Back to Course" : "Back";

  // Parse tag IDs only when needed (memoized)
  const urlTagIds = useMemo(() =>
    urlTagsRaw ? urlTagsRaw.split(",").filter(Boolean) : [],
    [urlTagsRaw]
  );

  // Tag filter state
  const [showTagFilter, setShowTagFilter] = useState(false);
  const [selectedTagFilters, setSelectedTagFilters] = useState<string[]>(urlTagIds);
  const [tagFilterMode, setTagFilterMode] = useState<FilterLogic>(urlTagMode);
  const [studyStarted, setStudyStarted] = useState(false);

  // Animation states
  const [isAnimating, setIsAnimating] = useState(false);
  const [exitTransform, setExitTransform] = useState<string | null>(null);
  const [showCard, setShowCard] = useState(true);
  const [swipeOffset, setSwipeOffset] = useState(0);

  // Touch handling for swipe gestures
  const touchStartX = useRef<number | null>(null);
  const touchCurrentX = useRef<number | null>(null);
  const minSwipeDistance = 50;

  // Study session tracking
  const sessionIdRef = useRef<string | null>(null);
  const cardsViewedRef = useRef<Set<number>>(new Set());
  const mountedRef = useRef(true);
  const sessionStartingRef = useRef(false);

  // Refs for keyboard handlers to avoid event listener churn
  const handleFlipRef = useRef<() => void>(() => {});
  const handleNextRef = useRef<() => void>(() => {});
  const handlePrevRef = useRef<() => void>(() => {});
  const studyCompleteRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function loadDeckAndCards() {
      if (!id) return;
      try {
        if (isTauri()) {
          // Course-owned deck: load from the course store, no tags, no filters.
          if (isCourse) {
            const [deckData, cardsData] = await Promise.all([
              getCourseDeck(id),
              getCourseCards(id),
            ]);
            if (cancelled) return;
            setDeck(deckData);
            setAllCards(cardsData);
            setTags([]);
            setCards(shuffle(cardsData));
            setStudyStarted(true);
            return;
          }

          const [deckData, cardsData, tagsData] = await Promise.all([
            getDeck(id),
            getCardsForDeck(id),
            getTagsForDeck(id),
          ]);
          if (cancelled) return;
          setDeck(deckData);
          setAllCards(cardsData);
          setTags(tagsData);

          // If URL has filters, apply them
          if (hasUrlFilters) {
            let filteredCards = cardsData;

            // Apply front search from URL
            if (urlFrontSearch) {
              const term = urlFrontSearch.toLowerCase();
              filteredCards = filteredCards.filter((card) =>
                card.front.toLowerCase().includes(term)
              );
            }

            // Apply back search from URL
            if (urlBackSearch) {
              const term = urlBackSearch.toLowerCase();
              filteredCards = filteredCards.filter((card) =>
                card.back.toLowerCase().includes(term)
              );
            }

            // Apply tag filters from URL
            if (urlTagIds.length > 0) {
              filteredCards = filteredCards.filter((card) => {
                const cardTagIds = card.tags.map((t) => t.id);
                if (urlTagMode === "all") {
                  return urlTagIds.every((tagId) => cardTagIds.includes(tagId));
                } else {
                  return urlTagIds.some((tagId) => cardTagIds.includes(tagId));
                }
              });
            }

            const shuffled = shuffle(filteredCards);
            setCards(shuffled);
            setStudyStarted(true);
          } else {
            // No URL filters - study all cards immediately
            const shuffled = shuffle(cardsData);
            setCards(shuffled);
            setStudyStarted(true);
          }
        }
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load cards:", error);
        toast.error("Failed to load cards");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    loadDeckAndCards();

    return () => {
      cancelled = true;
    };
  }, [id, isCourse, hasUrlFilters, urlFrontSearch, urlBackSearch, urlTagsRaw, urlTagMode]);

  // Start study session when studying begins (library decks only — a course_deck
  // id isn't in the decks table, and course completion is tracked via lesson_progress).
  useEffect(() => {
    if (!isCourse && studyStarted && id && cards.length > 0 && !sessionIdRef.current && !sessionStartingRef.current) {
      sessionStartingRef.current = true;
      startStudySession(id)
        .then((session) => {
          if (mountedRef.current) {
            sessionIdRef.current = session.id;
            cardsViewedRef.current = new Set([0]); // First card is viewed
          } else {
            // Component unmounted during session start - end it immediately
            endStudySession(session.id, 0).catch((err) => {
              console.error("Failed to end orphaned study session:", err);
            });
          }
        })
        .catch((err) => {
          console.error("Failed to start study session:", err);
          if (mountedRef.current) {
            toast.error("Failed to start study session");
          }
        })
        .finally(() => {
          sessionStartingRef.current = false;
        });
    }
  }, [studyStarted, id, cards.length, toast]);

  // Track mounted state and end study session on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (sessionIdRef.current && id) {
        const cardsStudied = cardsViewedRef.current.size;
        endStudySession(sessionIdRef.current, cardsStudied).catch((err) => {
          console.error("Failed to end study session:", err);
        });
        sessionIdRef.current = null;
      }
    };
  }, [id]);

  // Track cards viewed
  useEffect(() => {
    if (studyStarted && cards.length > 0) {
      cardsViewedRef.current.add(currentIndex);
    }
  }, [currentIndex, studyStarted, cards.length]);

  // Opening a deck from a course marks its lesson item complete (R2-1: opening
  // counts; the user need not go through every card). Fires once per launch.
  const courseProgressRecordedRef = useRef(false);
  useEffect(() => {
    if (!courseId || !courseLessonId || !courseLessonItemId) return;
    if (courseProgressRecordedRef.current) return;
    courseProgressRecordedRef.current = true;
    recordLessonProgress(courseId, courseLessonId, courseLessonItemId).catch((err) => {
      console.error("Failed to record course progress:", err);
    });
  }, [courseId, courseLessonId, courseLessonItemId]);

  // Filter cards based on selected tags AND URL search filters
  const filteredCards = useMemo(() => {
    let result = allCards;

    // Apply URL front search (persists across filter changes)
    if (urlFrontSearch) {
      const term = urlFrontSearch.toLowerCase();
      result = result.filter((card) => card.front.toLowerCase().includes(term));
    }

    // Apply URL back search (persists across filter changes)
    if (urlBackSearch) {
      const term = urlBackSearch.toLowerCase();
      result = result.filter((card) => card.back.toLowerCase().includes(term));
    }

    // Apply tag filters
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
  }, [allCards, selectedTagFilters, tagFilterMode, urlFrontSearch, urlBackSearch]);

  const handleToggleTagFilter = (tagId: string) => {
    setSelectedTagFilters((prev) =>
      prev.includes(tagId)
        ? prev.filter((t) => t !== tagId)
        : [...prev, tagId]
    );
  };

  const handleStartStudy = () => {
    // Always use filteredCards - it includes both URL search and tag filters
    const shuffled = shuffle(filteredCards);
    setCards(shuffled);
    setShowTagFilter(false);
    setStudyStarted(true);
  };

  const handleClearFilters = () => {
    setSelectedTagFilters([]);
    setTagFilterMode("any");
  };

  const currentCard = cards[currentIndex];
  const progress = cards.length > 0 ? ((currentIndex + 1) / cards.length) * 100 : 0;

  // Read the currently-visible side aloud (manual speaker button), in the card's
  // spoken language (defaulting to English).
  const handleSpeak = () => {
    if (!currentCard) return;
    const content = isFlipped ? currentCard.back : currentCard.front;
    const type = isFlipped ? currentCard.backType : currentCard.frontType;
    const lang = isFlipped ? currentCard.backTtsLang : currentCard.frontTtsLang;
    speak(textForSpeech(content, type), lang ?? "en", { voice: "", volume: 1 });
  };

  // True only when a flashcard is actually on screen (not the tag-filter or
  // completion screens). Audio must never play unless this holds.
  const viewingCard = studyStarted && !showTagFilter && !studyComplete && !!currentCard;

  // Stop any audio when the shown side changes (flip or advance); if auto-read is
  // on and a card is on screen, read the newly-shown side. The unconditional stop
  // also prevents the previous clip from bleeding into the next card or screen.
  useEffect(() => {
    stopSpeaking();
    if (!viewingCard || !autoRead) return;
    const content = isFlipped ? currentCard!.back : currentCard!.front;
    const type = isFlipped ? currentCard!.backType : currentCard!.frontType;
    const lang = isFlipped ? currentCard!.backTtsLang : currentCard!.frontTtsLang;
    speak(textForSpeech(content, type), lang ?? "en", { voice: "", volume: 1 });
  }, [currentIndex, isFlipped, autoRead, viewingCard, currentCard]);

  // Stop audio when leaving study mode.
  useEffect(() => () => stopSpeaking(), []);

  // Audio is pre-baked by the background crawler (see docs/TTS-ARCHITECTURE.md),
  // so there's no per-card prefetch/synth here — study just plays cached files.

  const handleFlip = useCallback(() => {
    if (!isAnimating) {
      setIsFlipped((f) => !f);
    }
  }, [isAnimating]);

  const animateToNext = useCallback(() => {
    if (isAnimating) return;

    if (currentIndex < cards.length - 1) {
      setIsAnimating(true);
      setIsFlipped(false);
      setExitTransform("translateX(-120%) rotate(-10deg)");

      setTimeout(() => {
        setShowCard(false);
        setCurrentIndex((prev) => prev + 1);
        setSwipeOffset(0);
        setExitTransform(null);

        requestAnimationFrame(() => {
          setShowCard(true);
          setIsAnimating(false);
        });
      }, CARD_SWIPE_DURATION_MS);
    } else {
      setStudyComplete(true);
    }
  }, [currentIndex, cards.length, isAnimating]);

  const animateToPrevious = useCallback(() => {
    if (isAnimating) return;

    if (currentIndex > 0) {
      setIsAnimating(true);
      setIsFlipped(false);
      setExitTransform("translateX(120%) rotate(10deg)");

      setTimeout(() => {
        setShowCard(false);
        setCurrentIndex((prev) => prev - 1);
        setSwipeOffset(0);
        setExitTransform(null);

        requestAnimationFrame(() => {
          setShowCard(true);
          setIsAnimating(false);
        });
      }, CARD_SWIPE_DURATION_MS);
    }
  }, [currentIndex, isAnimating]);

  const handleNext = useCallback(() => {
    animateToNext();
  }, [animateToNext]);

  const handlePrev = useCallback(() => {
    animateToPrevious();
  }, [animateToPrevious]);

  // Keep handler refs updated (avoids event listener churn)
  useEffect(() => {
    handleFlipRef.current = handleFlip;
    handleNextRef.current = handleNext;
    handlePrevRef.current = handlePrev;
  }, [handleFlip, handleNext, handlePrev]);

  useEffect(() => {
    studyCompleteRef.current = studyComplete;
  }, [studyComplete]);

  const handleRestart = useCallback(() => {
    setCurrentIndex(0);
    setIsFlipped(false);
    setStudyComplete(false);
    setExitTransform(null);
    setSwipeOffset(0);
    setShowCard(true);
    // Reshuffle
    const shuffled = shuffle(cards);
    setCards(shuffled);
  }, [cards]);

  const handleChangeFilters = useCallback(() => {
    setStudyComplete(false);
    setStudyStarted(false);
    setShowTagFilter(true);
    setCurrentIndex(0);
    setIsFlipped(false);
  }, []);

  // Keyboard navigation (uses refs to avoid listener churn)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (studyCompleteRef.current) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case " ":
        case "Enter":
          e.preventDefault();
          handleFlipRef.current();
          break;
        case "ArrowRight":
          e.preventDefault();
          handleNextRef.current();
          break;
        case "ArrowLeft":
          e.preventDefault();
          handlePrevRef.current();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Touch gesture handling
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (isAnimating) return;
      touchCurrentX.current = null;
      touchStartX.current = e.targetTouches[0].clientX;
    },
    [isAnimating]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (isAnimating || !touchStartX.current) return;
      touchCurrentX.current = e.targetTouches[0].clientX;
      const diff = touchCurrentX.current - touchStartX.current;
      setSwipeOffset(diff);
    },
    [isAnimating]
  );

  const onTouchEnd = useCallback(() => {
    if (!touchStartX.current || isAnimating) {
      setSwipeOffset(0);
      return;
    }

    const distance = swipeOffset;
    const isLeftSwipe = distance < -minSwipeDistance;
    const isRightSwipe = distance > minSwipeDistance;

    touchStartX.current = null;
    touchCurrentX.current = null;

    if (studyComplete) {
      setSwipeOffset(0);
      return;
    }

    if (isLeftSwipe && currentIndex < cards.length - 1) {
      animateToNext();
    } else if (isRightSwipe && currentIndex > 0) {
      animateToPrevious();
    } else {
      setSwipeOffset(0);
    }
  }, [studyComplete, currentIndex, cards.length, swipeOffset, isAnimating, animateToNext, animateToPrevious]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#2d2a2e]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#ffd866] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#939293]">Loading...</p>
        </div>
      </div>
    );
  }

  // Tag filter screen
  if (showTagFilter && !studyStarted) {
    return (
      <div className="h-full bg-[#2d2a2e] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-[#403e41] border-b border-[#5b595c] flex-shrink-0">
          <div className="max-w-4xl mx-auto px-6 py-4">
            <div className="flex justify-between items-center">
              <BackButton fallbackPath={backPath} label={backLabel} />
              <h1 className="text-xl font-bold text-[#fcfcfa] font-mono truncate max-w-[300px]">
                {deck?.name}
              </h1>
              <div className="w-24" />
            </div>
          </div>
        </div>

        {/* Tag Filter Content */}
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-[#403e41] rounded-2xl border border-[#5b595c] p-8 max-w-lg w-full">
            <h2 className="text-2xl font-bold text-[#fcfcfa] text-center mb-2">
              Study Session
            </h2>
            <p className="text-[#939293] text-center mb-6">
              Select tags to filter cards, or study all {allCards.length} cards
            </p>

            {/* Tag Filter Mode */}
            {selectedTagFilters.length > 1 && (
              <div className="flex justify-center mb-4">
                <div className="flex items-center bg-[#2d2a2e] rounded-lg p-0.5">
                  <button
                    onClick={() => setTagFilterMode("any")}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                      tagFilterMode === "any"
                        ? "bg-[#ab9df2] text-[#2d2a2e] font-medium"
                        : "text-[#939293] hover:text-[#fcfcfa]"
                    }`}
                  >
                    Match Any
                  </button>
                  <button
                    onClick={() => setTagFilterMode("all")}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                      tagFilterMode === "all"
                        ? "bg-[#ab9df2] text-[#2d2a2e] font-medium"
                        : "text-[#939293] hover:text-[#fcfcfa]"
                    }`}
                  >
                    Match All
                  </button>
                </div>
              </div>
            )}

            {/* Tag Chips */}
            <div className="flex flex-wrap justify-center gap-2 mb-6">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => handleToggleTagFilter(tag.id)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    selectedTagFilters.includes(tag.id)
                      ? "bg-[#ab9df2] text-[#2d2a2e]"
                      : "bg-[#ab9df2]/20 text-[#ab9df2] hover:bg-[#ab9df2]/30"
                  }`}
                >
                  {tag.name}
                </button>
              ))}
            </div>

            {/* Card count */}
            <p className="text-center text-[#939293] mb-6">
              {selectedTagFilters.length > 0 ? (
                <>
                  <span className="text-[#ffd866] font-semibold">{filteredCards.length}</span> cards match your filters
                </>
              ) : (
                <>
                  <span className="text-[#ffd866] font-semibold">{allCards.length}</span> cards total
                </>
              )}
            </p>

            {/* Action buttons */}
            <div className="flex flex-col gap-3">
              <button
                onClick={handleStartStudy}
                disabled={selectedTagFilters.length > 0 && filteredCards.length === 0}
                className="w-full px-6 py-3 bg-[#a9dc76] text-[#2d2a2e] rounded-lg hover:bg-[#a9dc76]/90 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {selectedTagFilters.length > 0
                  ? `Study ${filteredCards.length} Cards`
                  : `Study All ${allCards.length} Cards`}
              </button>
              {selectedTagFilters.length > 0 && (
                <button
                  onClick={handleClearFilters}
                  className="w-full px-6 py-3 border border-[#5b595c] text-[#fcfcfa] rounded-lg hover:bg-[#5b595c]/30 font-medium transition-colors"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (cards.length === 0 && studyStarted) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 bg-[#2d2a2e]">
        <div className="text-6xl mb-4">📭</div>
        <h1 className="text-xl font-semibold text-[#fcfcfa] mb-2">No cards to study</h1>
        <p className="text-[#939293] mb-6">
          {selectedTagFilters.length > 0
            ? "No cards match your selected tags"
            : "Add some cards to this deck first"}
        </p>
        <div className="flex gap-4">
          {selectedTagFilters.length > 0 && (
            <button
              onClick={handleChangeFilters}
              className="px-4 py-2 bg-[#ffd866] text-[#2d2a2e] rounded-lg hover:bg-[#ffd866]/90 font-medium transition-colors"
            >
              Change Filters
            </button>
          )}
          <Link
            to={`/decks/${id}`}
            className="px-4 py-2 bg-[#5b595c] text-[#fcfcfa] rounded-lg hover:bg-[#5b595c]/80 font-medium transition-colors"
          >
            Manage Deck
          </Link>
        </div>
      </div>
    );
  }

  if (allCards.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 bg-[#2d2a2e]">
        <div className="text-6xl mb-4">📭</div>
        <h1 className="text-xl font-semibold text-[#fcfcfa] mb-2">No cards to study</h1>
        <p className="text-[#939293] mb-6">
          Add some cards to this deck first
        </p>
        <Link
          to={`/decks/${id}`}
          className="px-4 py-2 bg-[#ffd866] text-[#2d2a2e] rounded-lg hover:bg-[#ffd866]/90 font-medium transition-colors"
        >
          Manage Deck
        </Link>
      </div>
    );
  }

  const isCodeFront = currentCard?.frontType === "CODE";
  const isCodeBack = currentCard?.backType === "CODE";

  return (
    <div
      className="h-full bg-[#2d2a2e] flex flex-col overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Header */}
      <div className="bg-[#403e41] border-b border-[#5b595c] flex-shrink-0">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <BackButton fallbackPath={`/decks/${id}`} label="Back" />
            <div className="text-center">
              <h1 className="text-xl font-bold text-[#fcfcfa] font-mono truncate max-w-[300px]">
                {deck?.name}
              </h1>
              <p className="text-sm text-[#939293]">
                {studyComplete ? "Complete!" : `Card ${currentIndex + 1} of ${cards.length}`}
              </p>
            </div>
            <div className="w-24" /> {/* Spacer for centering */}
          </div>
        </div>
      </div>

      {/* Main Study Area */}
      <div className="flex-1 flex flex-col max-w-4xl mx-auto px-6 py-8 w-full overflow-hidden">
        {studyComplete ? (
          /* Completion Screen */
          <div className="flex-1 flex items-center justify-center">
            <div className="bg-[#403e41] rounded-2xl border border-[#5b595c] p-12 text-center">
              <div className="mb-6">
                <svg
                  className="mx-auto h-20 w-20 text-[#a9dc76]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-[#fcfcfa] font-mono mb-2">
                Great Job!
              </h2>
              <p className="text-[#939293] mb-8">
                You've completed all {cards.length} cards{selectedTagFilters.length > 0 ? " matching your filters" : ""}.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-3">
                <button
                  onClick={handleRestart}
                  className="px-6 py-3 bg-[#ffd866] text-[#2d2a2e] rounded-lg hover:bg-[#ffd866]/90 font-medium transition-colors"
                >
                  Study Again
                </button>
                {tags.length > 0 && (
                  <button
                    onClick={handleChangeFilters}
                    className="px-6 py-3 bg-[#ab9df2] text-[#2d2a2e] rounded-lg hover:bg-[#ab9df2]/90 font-medium transition-colors"
                  >
                    Change Filters
                  </button>
                )}
                <BackButton
                  fallbackPath={backPath}
                  label={courseId ? "Back to Course" : "Back to Deck"}
                  className="px-6 py-3 border border-[#5b595c] rounded-lg text-[#fcfcfa] hover:bg-[#5b595c]/30 font-medium transition-colors"
                />
              </div>
            </div>
          </div>
        ) : (
          /* Flashcard */
          <div className="flex-1 flex flex-col min-h-0">
            {/* Progress Bar */}
            <div className="mb-6 flex-shrink-0">
              <div className="bg-[#5b595c] rounded-full h-2">
                <div
                  className="bg-[#ffd866] h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Card Container with Swipe Animation */}
            <div
              className="flex-1 min-h-0 overflow-hidden"
              style={{ perspective: "1000px" }}
            >
              <div
                onClick={handleFlip}
                className={`w-full h-full cursor-pointer ${
                  showCard && !exitTransform && !swipeOffset ? "animate-slide-in" : ""
                }`}
                style={{
                  transform:
                    exitTransform ||
                    (swipeOffset
                      ? `translateX(${swipeOffset}px) rotate(${swipeOffset * 0.02}deg)`
                      : undefined),
                  transition:
                    swipeOffset && !exitTransform
                      ? "none"
                      : "transform 0.28s ease-out, opacity 0.28s ease-out",
                  opacity: showCard ? 1 : 0,
                }}
              >
                {/* 3D Flip Card */}
                <div
                  className="relative w-full h-full transition-transform duration-500"
                  style={{
                    transformStyle: "preserve-3d",
                    transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                  }}
                >
                  {/* Front Face */}
                  <div
                    className="absolute inset-0 bg-[#403e41] rounded-2xl border border-[#5b595c] p-12 flex flex-col items-center justify-center overflow-auto"
                    style={{ backfaceVisibility: "hidden" }}
                  >
                    <div className="text-center w-full max-w-2xl" data-selectable="true">
                      <div className="text-sm text-[#939293] uppercase tracking-wider mb-4">
                        Front
                      </div>
                      {isCodeFront && (
                        <div className="flex items-center justify-center mb-3">
                          <span className="text-xs bg-[#78dce8]/20 text-[#78dce8] px-2 py-0.5 rounded">
                            {CODE_LANGUAGE_LABELS[currentCard?.frontLanguage || "PLAINTEXT"]}
                          </span>
                        </div>
                      )}
                      <div className="mb-6">
                        {isCodeFront ? (
                          <div className="w-full text-left">
                            <CodeBlock
                              code={currentCard?.front || ""}
                              language={currentCard?.frontLanguage}
                            />
                          </div>
                        ) : (
                          <p className="text-2xl text-center whitespace-pre-wrap text-[#fcfcfa]">
                            {currentCard?.front}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-8 text-sm text-[#939293]">
                      Click or press Space to flip
                    </div>
                  </div>

                  {/* Back Face */}
                  <div
                    className="absolute inset-0 bg-[#403e41] rounded-2xl border border-[#5b595c] p-12 flex flex-col items-center justify-center overflow-auto"
                    style={{
                      backfaceVisibility: "hidden",
                      transform: "rotateY(180deg)",
                    }}
                  >
                    <div className="text-center w-full max-w-2xl" data-selectable="true">
                      <div className="text-sm text-[#939293] uppercase tracking-wider mb-4">
                        Back
                      </div>
                      {isCodeBack && (
                        <div className="flex items-center justify-center mb-3">
                          <span className="text-xs bg-[#78dce8]/20 text-[#78dce8] px-2 py-0.5 rounded">
                            {CODE_LANGUAGE_LABELS[currentCard?.backLanguage || "PLAINTEXT"]}
                          </span>
                        </div>
                      )}
                      <div className="mb-6">
                        {isCodeBack ? (
                          <div className="w-full text-left">
                            <CodeBlock
                              code={currentCard?.back || ""}
                              language={currentCard?.backLanguage}
                            />
                          </div>
                        ) : (
                          <p className="text-2xl text-center whitespace-pre-wrap text-[#fcfcfa]">
                            {currentCard?.back}
                          </p>
                        )}
                      </div>
                      {currentCard?.notes && (
                        <div className="mt-8 pt-6 border-t border-[#5b595c]">
                          <div className="text-sm text-[#939293] uppercase tracking-wider mb-2">
                            Notes
                          </div>
                          <div className="text-[#939293] text-base">{currentCard.notes}</div>
                        </div>
                      )}
                      {currentCard?.tags && currentCard.tags.length > 0 && (
                        <div className="mt-4 flex justify-center gap-2 flex-wrap">
                          {currentCard.tags.map((tag) => (
                            <span
                              key={tag.id}
                              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[#ab9df2]/20 text-[#ab9df2]"
                            >
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <div className="mt-6 flex justify-between items-center flex-shrink-0">
              <button
                onClick={handlePrev}
                disabled={currentIndex === 0}
                className="px-6 py-3 bg-[#403e41] border border-[#5b595c] rounded-lg hover:bg-[#5b595c]/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium text-[#fcfcfa] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Previous
              </button>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleFlip}
                  className="px-8 py-3 bg-[#ffd866] text-[#2d2a2e] rounded-lg hover:bg-[#ffd866]/90 font-medium transition-colors"
                >
                  {isFlipped ? "Hide" : "Show"} Answer
                </button>
                <button
                  onClick={handleSpeak}
                  title="Read this side aloud"
                  aria-label="Read this side aloud"
                  className="p-3 bg-[#78dce8] text-[#2d2a2e] rounded-lg hover:bg-[#78dce8]/90 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M11 5L6 9H2v6h4l5 4V5z" />
                  </svg>
                </button>
              </div>

              <button
                onClick={handleNext}
                className="px-6 py-3 bg-[#403e41] border border-[#5b595c] rounded-lg hover:bg-[#5b595c]/30 flex items-center gap-2 font-medium text-[#fcfcfa] transition-colors"
              >
                {currentIndex === cards.length - 1 ? "Finish" : "Next"}
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Auto-read toggle */}
            <div className="mt-6 flex items-center justify-center flex-shrink-0">
              <button
                onClick={toggleAutoRead}
                title="Automatically read each side aloud as you study"
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  autoRead
                    ? "bg-[#a9dc76]/20 text-[#a9dc76]"
                    : "bg-[#5b595c]/30 text-[#939293] hover:text-[#fcfcfa]"
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M11 5L6 9H2v6h4l5 4V5z" />
                </svg>
                Auto-read {autoRead ? "on" : "off"}
              </button>
            </div>

            {/* Keyboard hints */}
            <div className="mt-8 text-center text-sm text-[#939293] flex-shrink-0">
              <div className="inline-flex items-center gap-6">
                <span>
                  <kbd className="px-2 py-1 bg-[#5b595c]/50 rounded text-xs text-[#fcfcfa]">Space</kbd> Flip
                </span>
                <span>
                  <kbd className="px-2 py-1 bg-[#5b595c]/50 rounded text-xs text-[#fcfcfa]">←</kbd> Previous
                </span>
                <span>
                  <kbd className="px-2 py-1 bg-[#5b595c]/50 rounded text-xs text-[#fcfcfa]">→</kbd> Next
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
