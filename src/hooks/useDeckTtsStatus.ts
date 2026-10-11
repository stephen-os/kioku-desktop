import { useState, useEffect } from "react";
import { ttsDeckStatus, type DeckGenStatus } from "@/lib/tts";
import { onCrawlStatus } from "@/lib/ttsCrawler";

// Polls a deck's baked-audio status (and refreshes on crawl progress) so the UI
// can show a "Generating audio N/M" indicator. Returns null when unavailable
// (engine not installed, etc.).
export function useDeckTtsStatus(deckId: string | undefined): DeckGenStatus | null {
  const [status, setStatus] = useState<DeckGenStatus | null>(null);

  useEffect(() => {
    if (!deckId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const s = await ttsDeckStatus(deckId);
        if (!cancelled) setStatus(s);
      } catch {
        /* engine not installed / no active user */
      }
    };
    poll();
    const unsub = onCrawlStatus(() => poll());
    const iv = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      unsub();
      clearInterval(iv);
    };
  }, [deckId]);

  return status;
}
