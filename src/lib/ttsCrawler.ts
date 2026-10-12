// Front-end TTS "crawler": when generation is enabled, it bakes all pending
// card-side audio in the background, one language at a time (each bakeTts call
// evicts the model when done, so memory stays bounded to one model). Study then
// just plays the cached WAVs. See docs/TTS-ARCHITECTURE.md.

import { ttsPending, bakeTts, getTtsGenerationEnabled } from "./tts";

export interface CrawlStatus {
  active: boolean;
  done: number;
  total: number;
}

let running = false;
const listeners = new Set<(s: CrawlStatus) => void>();

function emit(status: CrawlStatus): void {
  for (const l of listeners) l(status);
}

/** Subscribe to crawl status changes. Returns an unsubscribe fn. */
export function onCrawlStatus(listener: (s: CrawlStatus) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Bake all pending audio in the background. Single-flight (a second call while
 * one is running is a no-op). No-ops when generation is disabled. Best-effort —
 * failures don't throw; a pass that makes no progress stops the loop so a
 * persistently-failing clip can't spin forever.
 */
export async function startTtsCrawl(): Promise<void> {
  if (running) return;
  if (!(await getTtsGenerationEnabled())) return;

  running = true;
  try {
    let lastRemaining = Number.POSITIVE_INFINITY;
    for (;;) {
      const pending = await ttsPending();
      const remaining = pending.length;
      if (remaining === 0 || remaining >= lastRemaining) break; // done, or no progress
      lastRemaining = remaining;

      // Group by language so each model is loaded once, then evicted.
      const byLang = new Map<string, string[]>();
      for (const p of pending) {
        const arr = byLang.get(p.lang);
        if (arr) arr.push(p.text);
        else byLang.set(p.lang, [p.text]);
      }

      let done = 0;
      emit({ active: true, done, total: remaining });
      for (const [lang, texts] of byLang) {
        try {
          await bakeTts(lang, texts);
        } catch {
          /* best-effort; unresolved items are caught by the no-progress guard */
        }
        done += texts.length;
        emit({ active: true, done, total: remaining });
      }
    }
  } finally {
    running = false;
    emit({ active: false, done: 0, total: 0 });
  }
}
