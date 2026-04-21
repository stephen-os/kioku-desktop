import type { TTSVoice } from "@/types";

// Check if Web Speech API is available
const isSpeechSynthesisAvailable = typeof window !== "undefined" && "speechSynthesis" in window;

export interface SynthesizeOptions {
  voice: string;
  rate?: number;  // 0.1 to 10, default 1
  pitch?: number; // 0 to 2, default 1
  volume?: number; // 0 to 1, default 1
}

// Cache for available voices
let cachedVoices: SpeechSynthesisVoice[] = [];

/**
 * Get available system voices
 * Returns a promise because voices may load asynchronously
 */
export function getSystemVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!isSpeechSynthesisAvailable) {
      resolve([]);
      return;
    }

    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      cachedVoices = voices;
      resolve(voices);
      return;
    }

    // Voices may not be loaded yet, wait for them
    speechSynthesis.onvoiceschanged = () => {
      cachedVoices = speechSynthesis.getVoices();
      resolve(cachedVoices);
    };

    // Fallback timeout
    setTimeout(() => {
      cachedVoices = speechSynthesis.getVoices();
      resolve(cachedVoices);
    }, 1000);
  });
}

/**
 * Get filtered English voices suitable for flashcard reading
 */
export async function getAvailableVoices(): Promise<TTSVoice[]> {
  const systemVoices = await getSystemVoices();

  // Filter to English voices and convert to our format
  const englishVoices = systemVoices
    .filter(v => v.lang.startsWith("en"))
    .map(v => ({
      id: v.name,
      name: v.name.replace(/Microsoft |Google |Apple /g, "").replace(/ Online \(Natural\)| \(Natural\)/g, ""),
      locale: v.lang,
      gender: guessGender(v.name),
    }));

  // Sort: prefer "natural" or "neural" voices first
  englishVoices.sort((a, b) => {
    const aIsNeural = a.id.toLowerCase().includes("natural") || a.id.toLowerCase().includes("neural");
    const bIsNeural = b.id.toLowerCase().includes("natural") || b.id.toLowerCase().includes("neural");
    if (aIsNeural && !bIsNeural) return -1;
    if (!aIsNeural && bIsNeural) return 1;
    return a.name.localeCompare(b.name);
  });

  return englishVoices;
}

// Guess gender from voice name (not always accurate)
function guessGender(name: string): "Male" | "Female" {
  const lowerName = name.toLowerCase();
  const femaleNames = ["zira", "eva", "aria", "jenny", "sonia", "natasha", "samantha", "karen", "female", "woman"];
  const maleNames = ["david", "mark", "guy", "ryan", "christopher", "william", "james", "male", "man"];

  if (femaleNames.some(n => lowerName.includes(n))) return "Female";
  if (maleNames.some(n => lowerName.includes(n))) return "Male";
  return "Female"; // Default
}

/**
 * Find a voice by ID (name) from system voices
 */
function findVoice(voiceId: string): SpeechSynthesisVoice | null {
  if (cachedVoices.length === 0) {
    cachedVoices = speechSynthesis.getVoices();
  }
  return cachedVoices.find(v => v.name === voiceId) || null;
}

/**
 * Synthesize text to speech using Web Speech API
 * Returns a promise that resolves when speech is complete
 */
export function speak(text: string, options: SynthesizeOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!isSpeechSynthesisAvailable) {
      reject(new Error("Speech synthesis not available"));
      return;
    }

    if (!text.trim()) {
      resolve();
      return;
    }

    // Cancel any ongoing speech
    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    // Set voice if specified
    const voice = findVoice(options.voice);
    if (voice) {
      utterance.voice = voice;
    }

    // Set rate, pitch, and volume
    utterance.rate = options.rate ?? 1;
    utterance.pitch = options.pitch ?? 1;
    utterance.volume = options.volume ?? 1;

    // Track if we've already resolved/rejected
    let settled = false;

    // Workaround for Chrome bug where speech synthesis gets stuck on long pauses
    let resumeInterval: ReturnType<typeof setInterval> | null = null;

    const cleanup = () => {
      if (resumeInterval) {
        clearInterval(resumeInterval);
        resumeInterval = null;
      }
    };

    utterance.onstart = () => {
      // Start the keepalive interval for long speeches
      resumeInterval = setInterval(() => {
        if (speechSynthesis.speaking) {
          speechSynthesis.pause();
          speechSynthesis.resume();
        }
      }, 10000);
    };

    utterance.onend = () => {
      cleanup();
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    utterance.onerror = (event) => {
      cleanup();
      if (!settled) {
        settled = true;
        // Ignore 'interrupted' and 'canceled' errors (happens when we cancel)
        if (event.error === "interrupted" || event.error === "canceled") {
          resolve();
        } else {
          reject(new Error(`Speech error: ${event.error}`));
        }
      }
    };

    speechSynthesis.speak(utterance);

    // Check state after a short delay to handle stuck speech
    setTimeout(() => {
      // If speech hasn't started but is pending, try resuming
      if (!speechSynthesis.speaking && speechSynthesis.pending) {
        speechSynthesis.resume();
      }
    }, 500);
  });
}

/**
 * Stop any ongoing speech
 */
export function stopSpeaking(): void {
  if (isSpeechSynthesisAvailable) {
    speechSynthesis.cancel();
  }
}

/**
 * Check if currently speaking
 */
export function isSpeaking(): boolean {
  return isSpeechSynthesisAvailable && speechSynthesis.speaking;
}

// Recommended voices - these will be populated dynamically based on system
export let RECOMMENDED_VOICES: TTSVoice[] = [];

// Default voice - will be set when voices load
export let DEFAULT_VOICE = "";

// Initialize voices
export async function initializeVoices(): Promise<void> {
  const voices = await getAvailableVoices();
  RECOMMENDED_VOICES = voices.slice(0, 10); // Take top 10 voices

  if (RECOMMENDED_VOICES.length > 0) {
    // Prefer a natural/neural voice if available
    const naturalVoice = RECOMMENDED_VOICES.find(v =>
      v.id.toLowerCase().includes("natural") ||
      v.id.toLowerCase().includes("neural")
    );
    DEFAULT_VOICE = naturalVoice?.id || RECOMMENDED_VOICES[0].id;
  }
}

// Get display name for a voice
export function getVoiceDisplayName(voiceId: string): string {
  const voice = RECOMMENDED_VOICES.find(v => v.id === voiceId);
  if (voice) {
    return `${voice.name} (${voice.locale})`;
  }
  // Fallback: clean up the voice ID
  return voiceId.replace(/Microsoft |Google |Apple /g, "").replace(/ Online \(Natural\)| \(Natural\)/g, "");
}
