# Changelog

## v2.3.0 — Course-owned content & bake-ahead TTS

### Features
- Courses rebuilt around course-owned content: each course holds its own copies
  of decks/quizzes/notes, studied/taken/read in context with per-item progress
  and best scores.
- Adopt: save a personal, editable copy of a course item to your library.
- In-place course authoring: edit content, create blank decks/quizzes/notes, or
  copy library items into a course.
- Unlocked course items surface read-only on the library pages ("From your
  courses") with a Due filter; grid/list view toggle on library pages.
- JSON import/export for whole courses (course-owned), plus an Export action on
  the course page and a documented course schema in Help.
- Bake-ahead TTS: voice models download at install (opt-in per language); audio
  is pre-generated in the background and cached, so study playback uses no
  resident model. Per-side spoken language; clear-cache; system-voice fallback.
- Notes: clickable `[[wiki links]]` and syntax-highlighted code blocks.

### Notable changes in this release
- Multi-write course commands (add/remove item, adopt) and the first-run demo
  seed now run in transactions.
- TTS daemon I/O is bounded by timeouts (a stalled engine can't hang the app);
  the engine download is verified (`error_for_status` + SHA-256) and extraction
  is size/entry-capped; the bake crawler runs for the logged-in account only.
- Removed the unused file-based image-attachment IPC surface and other dead code
  and configuration (notes keep inline base64 images).

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
