/**
 * Fisher-Yates (Knuth) shuffle algorithm.
 * Returns a new shuffled array without modifying the original.
 * This is uniformly random, unlike array.sort(() => Math.random() - 0.5).
 */
export function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Format duration in seconds to human-readable string.
 * Examples: "45s", "3m 20s", "2h 15m"
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
}

/**
 * Format duration in seconds to timer format (M:SS or H:MM:SS).
 * Returns "--:--" for null/undefined values.
 */
export function formatTimerDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
