# Changelog

## v2.0.0 — Local-only full app

The full-featured, offline desktop edition (local SQLite, no server dependency).

### Features
- Flashcard decks & cards: tags, favorites, search, and syntax-highlighted code cards
- Quizzes: multiple-choice & fill-in-the-blank, attempts, scoring, and review
- Courses & lessons: ordered deck/quiz items with per-item requirements and progress
- Notebooks & pages: rich editor, wiki-style links, backlinks, search, pin & reorder
- Study sessions & statistics
- Multilingual text-to-speech (MeloTTS) for English, Spanish, French, Chinese,
  Japanese, and Korean, with a browser Web Speech fallback
- JSON import/export for decks, quizzes, and courses
- Local multi-user with optional per-user passwords (Argon2)

### Notable changes in this release
- Multilingual TTS via a download-on-demand MeloTTS engine (en/es/fr/zh/ja/ko),
  replacing the earlier unused Piper flow; falls back to Web Speech until the
  engine is installed.
- Login fix: users whose passwords predate the Argon2 migration can sign in again
  (legacy hashes are verified once and upgraded in place).
- Course import fix: not-yet-linked ("missing") deck/quiz items no longer fail to
  import on a fresh database.
- Added automated test coverage for notebooks, courses, and link/slug parsing.
