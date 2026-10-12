/**
 * Shared localStorage utilities for Kioku
 * All storage keys should be prefixed with "kioku-" for consistency
 */

/**
 * Load a value from localStorage with JSON parsing
 * Returns defaultValue if key doesn't exist or parsing fails
 */
export function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const saved = localStorage.getItem(key);
    if (saved === null) {
      return defaultValue;
    }
    return JSON.parse(saved) as T;
  } catch (error) {
    console.error(`Failed to load setting "${key}":`, error);
    return defaultValue;
  }
}

/**
 * Save a value to localStorage with JSON serialization
 */
export function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Failed to save setting "${key}":`, error);
  }
}
