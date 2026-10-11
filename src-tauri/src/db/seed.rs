// First-run seed: builds a single "Demo" profile with hand-designed data that
// exercises every feature so each can be walked through one by one:
//   - TTS: a deck with every spoken language (en/es/fr/zh/ja/ko), per side.
//   - Code highlighting: a deck with one card per supported code language.
//   - Quizzes: a showcase quiz covering every question option, plus a shuffle quiz.
//   - Notes: a notebook with backlinks, a pinned page, and code blocks.
//   - Courses: a linear-gated tour and an open-navigation course, both owning
//     their content, with deck/quiz/note items and study/min_score/read gates.
// See docs/DEMO-WALKTHROUGH.md for the guided tour. Runs once (no users yet).

use rusqlite::{params, Connection};
use uuid::Uuid;

use super::{course_content, courses};

fn uuid() -> String {
    Uuid::new_v4().to_string()
}

// ---- small insert helpers (keep the body readable) ----

fn deck(
    conn: &Connection,
    user_id: &str,
    name: &str,
    description: &str,
    now: &str,
) -> Result<String, String> {
    let id = uuid();
    conn.execute(
        "INSERT INTO decks (id, user_id, name, description, shuffle_cards, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 0, ?5, ?5)",
        params![id, user_id, name, description, now],
    )
    .map_err(|e| format!("seed deck '{}': {}", name, e))?;
    Ok(id)
}

#[allow(clippy::too_many_arguments)]
fn card(
    conn: &Connection,
    deck_id: &str,
    front: &str,
    front_type: &str,
    front_language: Option<&str>,
    back: &str,
    back_type: &str,
    back_language: Option<&str>,
    notes: Option<&str>,
    front_tts: Option<&str>,
    back_tts: Option<&str>,
    now: &str,
) -> Result<String, String> {
    let id = uuid();
    conn.execute(
        "INSERT INTO cards (id, deck_id, front, front_type, front_language, back, back_type,
            back_language, notes, front_tts_lang, back_tts_lang, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)",
        params![
            id, deck_id, front, front_type, front_language, back, back_type, back_language,
            notes, front_tts, back_tts, now
        ],
    )
    .map_err(|e| format!("seed card: {}", e))?;
    Ok(id)
}

/// A text/text card with per-side spoken language.
fn tts_card(
    conn: &Connection,
    deck_id: &str,
    front: &str,
    back: &str,
    front_tts: &str,
    back_tts: &str,
    notes: Option<&str>,
    now: &str,
) -> Result<String, String> {
    card(
        conn, deck_id, front, "TEXT", None, back, "TEXT", None, notes, Some(front_tts),
        Some(back_tts), now,
    )
}

/// A text-front / code-back card for showing syntax highlighting.
fn code_card(
    conn: &Connection,
    deck_id: &str,
    front: &str,
    code: &str,
    language: &str,
    notes: Option<&str>,
    now: &str,
) -> Result<String, String> {
    card(
        conn, deck_id, front, "TEXT", None, code, "CODE", Some(language), notes, None, None, now,
    )
}

fn quiz(
    conn: &Connection,
    user_id: &str,
    name: &str,
    description: &str,
    shuffle: bool,
    now: &str,
) -> Result<String, String> {
    let id = uuid();
    conn.execute(
        "INSERT INTO quizzes (id, user_id, name, description, shuffle_questions, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![id, user_id, name, description, shuffle as i32, now],
    )
    .map_err(|e| format!("seed quiz '{}': {}", name, e))?;
    Ok(id)
}

/// A multiple-choice question plus its choices (`(text, is_correct)`).
#[allow(clippy::too_many_arguments)]
fn mc_question(
    conn: &Connection,
    quiz_id: &str,
    content: &str,
    content_type: &str,
    content_language: Option<&str>,
    multiple: bool,
    explanation: Option<&str>,
    position: i32,
    now: &str,
    choices: &[(&str, bool)],
) -> Result<String, String> {
    let id = uuid();
    conn.execute(
        "INSERT INTO questions (id, quiz_id, question_type, content, content_type, content_language,
            multiple_answers, explanation, position, created_at, updated_at)
         VALUES (?1, ?2, 'multiple_choice', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
        params![
            id, quiz_id, content, content_type, content_language, multiple as i32, explanation,
            position, now
        ],
    )
    .map_err(|e| format!("seed mc question: {}", e))?;
    for (pos, (text, correct)) in choices.iter().enumerate() {
        conn.execute(
            "INSERT INTO choices (id, question_id, text, is_correct, position) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![uuid(), id, text, *correct as i32, pos as i32],
        )
        .map_err(|e| format!("seed choice: {}", e))?;
    }
    Ok(id)
}

#[allow(clippy::too_many_arguments)]
fn fib_question(
    conn: &Connection,
    quiz_id: &str,
    content: &str,
    content_type: &str,
    content_language: Option<&str>,
    correct_answer: &str,
    explanation: Option<&str>,
    position: i32,
    now: &str,
) -> Result<String, String> {
    let id = uuid();
    conn.execute(
        "INSERT INTO questions (id, quiz_id, question_type, content, content_type, content_language,
            correct_answer, multiple_answers, explanation, position, created_at, updated_at)
         VALUES (?1, ?2, 'fill_in_blank', ?3, ?4, ?5, ?6, 0, ?7, ?8, ?9, ?9)",
        params![
            id, quiz_id, content, content_type, content_language, correct_answer, explanation,
            position, now
        ],
    )
    .map_err(|e| format!("seed fib question: {}", e))?;
    Ok(id)
}

fn notebook(
    conn: &Connection,
    user_id: &str,
    name: &str,
    icon: &str,
    now: &str,
) -> Result<String, String> {
    let id = uuid();
    conn.execute(
        "INSERT INTO notebooks (id, user_id, name, description, icon, color, created_at, updated_at)
         VALUES (?1, ?2, ?3, NULL, ?4, NULL, ?5, ?5)",
        params![id, user_id, name, icon, now],
    )
    .map_err(|e| format!("seed notebook '{}': {}", name, e))?;
    Ok(id)
}

fn page(
    conn: &Connection,
    notebook_id: &str,
    title: &str,
    content: &str,
    position: i32,
    pinned: bool,
    now: &str,
) -> Result<String, String> {
    let id = uuid();
    conn.execute(
        "INSERT INTO pages (id, notebook_id, title, content, position, is_pinned, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        params![id, notebook_id, title, content, position, pinned as i32, now],
    )
    .map_err(|e| format!("seed page '{}': {}", title, e))?;
    Ok(id)
}

fn lesson(
    conn: &Connection,
    course_id: &str,
    title: &str,
    description: &str,
    position: i32,
    now: &str,
) -> Result<String, String> {
    let id = uuid();
    conn.execute(
        "INSERT INTO lessons (id, course_id, title, description, position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![id, course_id, title, description, position, now],
    )
    .map_err(|e| format!("seed lesson '{}': {}", title, e))?;
    Ok(id)
}

pub fn seed_demo(conn: &Connection) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();

    // --- Demo user (active) ---
    let user_id = uuid();
    conn.execute(
        "INSERT INTO users (id, name, password_hash, avatar, created_at)
         VALUES (?1, 'Demo', NULL, 'avatar-smile', ?2)",
        params![user_id, now],
    )
    .map_err(|e| format!("seed user: {}", e))?;
    conn.execute(
        "INSERT OR REPLACE INTO app_state (key, value) VALUES ('active_user_id', ?1)",
        params![user_id],
    )
    .map_err(|e| format!("seed active user: {}", e))?;

    // ============================================================
    // DECK 1 — Spoken languages (TTS), covering every language and
    // demonstrating different front vs. back spoken languages.
    // ============================================================
    let tts_deck = deck(
        conn,
        &user_id,
        "Languages — Read Aloud (TTS)",
        "One card per spoken language. Click the speaker on each side; front and back can speak different languages.",
        &now,
    )?;
    // front English → back target language (back reads in that language)
    tts_card(conn, &tts_deck, "Good morning", "Buenos días", "en", "es", Some("Spanish greeting"), &now)?;
    tts_card(conn, &tts_deck, "Thank you", "Merci", "en", "fr", Some("French"), &now)?;
    tts_card(conn, &tts_deck, "Hello", "你好", "en", "zh", Some("Mandarin Chinese"), &now)?;
    tts_card(conn, &tts_deck, "Good evening", "こんばんは", "en", "ja", Some("Japanese"), &now)?;
    tts_card(conn, &tts_deck, "Thank you", "감사합니다", "en", "ko", Some("Korean"), &now)?;
    // front in a non-English language → back English (front reads non-English)
    tts_card(conn, &tts_deck, "ありがとう", "Thank you", "ja", "en", Some("Front reads Japanese, back English"), &now)?;
    tts_card(conn, &tts_deck, "¿Cómo estás?", "How are you?", "es", "en", Some("Front reads Spanish"), &now)?;

    // Favorite this deck (tests deck favorites).
    conn.execute(
        "INSERT INTO deck_favorites (user_id, deck_id, created_at) VALUES (?1, ?2, ?3)",
        params![user_id, tts_deck, now],
    )
    .map_err(|e| format!("seed deck favorite: {}", e))?;

    // ============================================================
    // DECK 2 — Code syntax highlighting, one card per code language.
    // ============================================================
    let code_deck = deck(
        conn,
        &user_id,
        "Code — Every Highlight Language",
        "A card per supported language so you can eyeball syntax highlighting one by one.",
        &now,
    )?;
    // (stored language token, display label, snippet)
    let snippets: &[(&str, &str, &str)] = &[
        ("PLAINTEXT", "Plain Text", "Just some plain, unhighlighted text."),
        ("JAVASCRIPT", "JavaScript", "console.log(`Hello, ${\"World\"}!`);"),
        ("TYPESCRIPT", "TypeScript", "const greet = (name: string): string => `Hi ${name}`;"),
        ("HTML", "HTML", "<h1 class=\"title\">Hello, World</h1>"),
        ("CSS", "CSS", ".title { color: #ffd866; font-weight: 700; }"),
        ("C", "C", "#include <stdio.h>\nint main(void){ printf(\"Hello\\n\"); return 0; }"),
        ("CPP", "C++", "#include <iostream>\nint main(){ std::cout << \"Hello\\n\"; }"),
        ("RUST", "Rust", "fn main() {\n    println!(\"Hello, World!\");\n}"),
        ("GO", "Go", "package main\nimport \"fmt\"\nfunc main(){ fmt.Println(\"Hello\") }"),
        ("JAVA", "Java", "class Main { public static void main(String[] a){ System.out.println(\"Hi\"); } }"),
        ("KOTLIN", "Kotlin", "fun main() = println(\"Hello, World!\")"),
        ("SCALA", "Scala", "@main def run() = println(\"Hello, World!\")"),
        ("PYTHON", "Python", "def greet(name):\n    return f\"Hello, {name}!\"\n\nprint(greet(\"Kioku\"))"),
        ("RUBY", "Ruby", "puts \"Hello, #{'World'}!\""),
        ("PHP", "PHP", "<?php echo \"Hello, \" . \"World!\"; ?>"),
        ("PERL", "Perl", "print \"Hello, World!\\n\";"),
        ("SWIFT", "Swift", "print(\"Hello, \\(\"World\")!\")"),
        ("DART", "Dart", "void main() => print('Hello, World!');"),
        ("CSHARP", "C#", "Console.WriteLine($\"Hello, {\"World\"}!\");"),
        ("FSHARP", "F#", "printfn \"Hello, %s!\" \"World\""),
        ("HASKELL", "Haskell", "main :: IO ()\nmain = putStrLn \"Hello, World!\""),
        ("ELIXIR", "Elixir", "IO.puts(\"Hello, World!\")"),
        ("CLOJURE", "Clojure", "(println \"Hello, World!\")"),
        ("SQL", "SQL", "SELECT name FROM users WHERE active = 1 ORDER BY name;"),
        ("GRAPHQL", "GraphQL", "query { user(id: 1) { name email } }"),
        ("R", "R", "greet <- function(n) sprintf(\"Hello, %s!\", n)\nprint(greet(\"R\"))"),
        ("JSON", "JSON", "{\n  \"name\": \"Kioku\",\n  \"version\": 2\n}"),
        ("YAML", "YAML", "name: Kioku\nversion: 2\ntags:\n  - study\n  - code"),
        ("XML", "XML", "<note><to>World</to><body>Hello</body></note>"),
        ("TOML", "TOML", "[package]\nname = \"kioku\"\nversion = \"2.0.0\""),
        ("MARKDOWN", "Markdown", "# Hello\n\n- A **bold** list item\n- A [link](https://example.com)"),
        ("BASH", "Bash", "for i in 1 2 3; do\n  echo \"Hello $i\"\ndone"),
        ("POWERSHELL", "PowerShell", "1..3 | ForEach-Object { Write-Host \"Hello $_\" }"),
        ("DOCKER", "Dockerfile", "FROM rust:1 AS build\nWORKDIR /app\nCOPY . .\nRUN cargo build --release"),
        ("REGEX", "Regex", "^\\[\\[([^\\]|]+)(\\|[^\\]]+)?\\]\\]$"),
    ];
    for (lang, label, code) in snippets {
        let notes = format!("Language: {}", label);
        code_card(
            conn,
            &code_deck,
            &format!("Hello, World in {}", label),
            code,
            lang,
            Some(&notes),
            &now,
        )?;
    }
    // A code-on-front card and a plain card, to show both content types on front.
    card(
        conn,
        &code_deck,
        "fn add(a: i32, b: i32) -> i32 {\n    a + b\n}",
        "CODE",
        Some("RUST"),
        "A function that returns the sum of two integers.",
        "TEXT",
        None,
        Some("Front is code, back is text — the reverse layout."),
        None,
        None,
        &now,
    )?;

    // ============================================================
    // QUIZ 1 — Option showcase: every question option, documented.
    // ============================================================
    let showcase = quiz(
        conn,
        &user_id,
        "Quiz — Option Showcase",
        "Covers every question type and option: MC single/multiple, fill-in-blank, text & code content, explanations, and tags.",
        false,
        &now,
    )?;

    // Quiz tags (tests tagging).
    let tag_basics = uuid();
    let tag_code = uuid();
    conn.execute(
        "INSERT INTO quiz_tags (id, quiz_id, name) VALUES (?1, ?2, 'basics'), (?3, ?2, 'code')",
        params![tag_basics, showcase, tag_code],
    )
    .map_err(|e| format!("seed quiz tags: {}", e))?;

    // Q1: multiple choice, single answer, TEXT, with explanation.
    let q1 = mc_question(
        conn,
        &showcase,
        "Which keyword declares an immutable binding in Rust?",
        "TEXT",
        None,
        false,
        Some("`let` creates an immutable binding; add `mut` to make it mutable."),
        0,
        &now,
        &[("let", true), ("var", false), ("const", false), ("mut", false)],
    )?;
    conn.execute(
        "INSERT INTO question_tags (question_id, tag_id) VALUES (?1, ?2)",
        params![q1, tag_basics],
    )
    .map_err(|e| format!("seed question tag: {}", e))?;

    // Q2: multiple choice, MULTIPLE answers, TEXT.
    mc_question(
        conn,
        &showcase,
        "Select all systems programming languages:",
        "TEXT",
        None,
        true,
        Some("Rust, C, and C++ are systems languages; Python and HTML are not."),
        1,
        &now,
        &[
            ("Rust", true),
            ("C", true),
            ("C++", true),
            ("Python", false),
            ("HTML", false),
        ],
    )?;

    // Q3: fill in the blank, TEXT (case-insensitive exact match).
    fib_question(
        conn,
        &showcase,
        "Rust's build tool and package manager is ____.",
        "TEXT",
        None,
        "cargo",
        Some("Answers are matched case-insensitively after trimming whitespace."),
        2,
        &now,
    )?;

    // Q4: multiple choice, single answer, CODE content.
    let q4 = mc_question(
        conn,
        &showcase,
        "fn main() {\n    println!(\"{}\", 2 + 3 * 4);\n}",
        "CODE",
        Some("RUST"),
        false,
        Some("Multiplication binds tighter than addition: 3 * 4 = 12, then + 2 = 14."),
        3,
        &now,
        &[("14", true), ("20", false), ("24", false), ("9", false)],
    )?;
    conn.execute(
        "INSERT INTO question_tags (question_id, tag_id) VALUES (?1, ?2)",
        params![q4, tag_code],
    )
    .map_err(|e| format!("seed question tag: {}", e))?;

    // Q5: fill in the blank, CODE content.
    fib_question(
        conn,
        &showcase,
        "print(len(\"kioku\"))  # what number is printed?",
        "CODE",
        Some("PYTHON"),
        "5",
        Some("`len` returns the number of characters in the string."),
        4,
        &now,
    )?;

    // Q6: multiple choice with many options (layout check).
    mc_question(
        conn,
        &showcase,
        "Which of these is NOT a Kioku feature?",
        "TEXT",
        None,
        false,
        Some("Kioku is local-first and offline; it has no cloud sync in the desktop app."),
        5,
        &now,
        &[
            ("Flashcard decks", false),
            ("Quizzes", false),
            ("Courses", false),
            ("Notebooks", false),
            ("Text-to-speech", false),
            ("Cloud sync", true),
        ],
    )?;

    // ============================================================
    // QUIZ 2 — Shuffle demo (questions appear in random order).
    // ============================================================
    let shuffle_quiz = quiz(
        conn,
        &user_id,
        "Quiz — Shuffle Enabled",
        "Shuffle is on: question order is randomized each attempt.",
        true,
        &now,
    )?;
    mc_question(conn, &shuffle_quiz, "2 + 2 = ?", "TEXT", None, false, None, 0, &now,
        &[("4", true), ("3", false), ("5", false)])?;
    mc_question(conn, &shuffle_quiz, "The capital of France?", "TEXT", None, false, None, 1, &now,
        &[("Paris", true), ("Lyon", false), ("Nice", false)])?;
    mc_question(conn, &shuffle_quiz, "Rust mascot?", "TEXT", None, false, None, 2, &now,
        &[("Ferris the crab", true), ("Gopher", false), ("Duke", false)])?;

    // Favorite the showcase quiz (tests quiz favorites).
    conn.execute(
        "INSERT INTO quiz_favorites (user_id, quiz_id, created_at) VALUES (?1, ?2, ?3)",
        params![user_id, showcase, now],
    )
    .map_err(|e| format!("seed quiz favorite: {}", e))?;

    // ============================================================
    // NOTES — one notebook with backlinks, a pinned page, and code.
    // ============================================================
    let devbook = notebook(conn, &user_id, "Developer Notebook", "code", &now)?;
    // Pinned index page linking out to the others (creates backlinks on them).
    page(
        conn,
        &devbook,
        "Index",
        "# Index\n\nStart here. Core topics:\n\n- [[Ownership]]\n- [[Borrowing]]\n- [[Lifetimes]]\n- [[Code Snippets]]\n",
        0,
        true,
        &now,
    )?;
    page(
        conn,
        &devbook,
        "Ownership",
        "# Ownership\n\nEach value has a single owner. When the owner goes out of scope, the value is dropped.\n\nSee also [[Borrowing]].",
        1,
        false,
        &now,
    )?;
    page(
        conn,
        &devbook,
        "Borrowing",
        "# Borrowing\n\nReferences let you access a value without taking [[Ownership]]. Closely related to [[Lifetimes]].",
        2,
        false,
        &now,
    )?;
    page(
        conn,
        &devbook,
        "Lifetimes",
        "# Lifetimes\n\nLifetimes keep references valid. They build on [[Ownership]] and [[Borrowing]].",
        3,
        false,
        &now,
    )?;
    page(
        conn,
        &devbook,
        "Code Snippets",
        "# Code Snippets\n\nA fenced code block renders with highlighting:\n\n```rust\nfn main() {\n    println!(\"Hello from a note!\");\n}\n```\n\nAnd a shell example:\n\n```bash\ncargo run --release\n```\n",
        4,
        false,
        &now,
    )?;

    // A second notebook (tests multiple notebooks) + notebook favorite.
    let scratch = notebook(conn, &user_id, "Scratchpad", "notebook", &now)?;
    page(conn, &scratch, "Ideas", "# Ideas\n\n- Try a Spanish deck\n- Link notes with [[Ownership]]\n", 0, false, &now)?;
    conn.execute(
        "INSERT INTO notebook_favorites (user_id, notebook_id, created_at) VALUES (?1, ?2, ?3)",
        params![user_id, devbook, now],
    )
    .map_err(|e| format!("seed notebook favorite: {}", e))?;

    // ============================================================
    // COURSE 1 — Linear-gated feature tour (open_navigation = 0).
    // Lesson 2 & 3 stay locked until the previous lesson completes.
    // ============================================================
    let tour = uuid();
    conn.execute(
        "INSERT INTO courses (id, user_id, name, description, open_navigation, created_at, updated_at)
         VALUES (?1, ?2, 'Course — Feature Tour (Gated)', 'Walk the three item types in order. Later lessons unlock as you finish earlier ones.', 0, ?3, ?3)",
        params![tour, user_id, now],
    )
    .map_err(|e| format!("seed course tour: {}", e))?;

    // Lesson 1 — a deck to study (completes on opening study).
    let t_l1 = lesson(conn, &tour, "Lesson 1: Flashcards", "Study a course-owned deck.", 0, &now)?;
    let t_deck = course_content::copy_deck_to_course(conn, &tour, &tts_deck)?;
    courses::add_lesson_item(conn, &t_l1, "deck", "Languages (course copy)", Some(&t_deck), Some("study"), None, Some(0))?;

    // Lesson 2 — a quiz gate (must score >= 70). Locked until Lesson 1 done.
    let t_l2 = lesson(conn, &tour, "Lesson 2: Quizzes", "Pass the quiz to continue.", 1, &now)?;
    let t_quiz = course_content::copy_quiz_to_course(conn, &tour, &showcase)?;
    courses::add_lesson_item(conn, &t_l2, "quiz", "Showcase Quiz (course copy)", Some(&t_quiz), Some("min_score"), Some(70), Some(0))?;

    // Lesson 3 — a read-only note (completes on open). Locked until Lesson 2 done.
    let t_l3 = lesson(conn, &tour, "Lesson 3: Notes", "Read the lesson note.", 2, &now)?;
    let t_nb = course_content::create_course_notebook(conn, &tour, "Tour Notes", None)?;
    let t_page = course_content::create_course_page(
        conn,
        &t_nb,
        "Wrapping Up",
        "# Wrapping Up\n\nNice work! You studied a deck, passed a quiz, and read this note.\n\nTry **Save copy** on any course item to adopt it into your own library.",
        0,
    )?;
    courses::add_lesson_item(conn, &t_l3, "note", "Wrapping Up", Some(&t_page), Some("read"), None, Some(0))?;

    // Favorite this course (tests course favorites).
    conn.execute(
        "INSERT INTO course_favorites (user_id, course_id, created_at) VALUES (?1, ?2, ?3)",
        params![user_id, tour, now],
    )
    .map_err(|e| format!("seed course favorite: {}", e))?;

    // ============================================================
    // COURSE 2 — Open navigation (open_navigation = 1): nothing is
    // locked, so every item shows on the library "From your courses".
    // ============================================================
    let open = uuid();
    conn.execute(
        "INSERT INTO courses (id, user_id, name, description, open_navigation, created_at, updated_at)
         VALUES (?1, ?2, 'Course — Open Navigation', 'Gating is off: all lessons are unlocked and all items are accessible immediately.', 1, ?3, ?3)",
        params![open, user_id, now],
    )
    .map_err(|e| format!("seed course open: {}", e))?;

    let o_l1 = lesson(conn, &open, "Lesson 1: Mixed Items", "A deck and a quiz, both open.", 0, &now)?;
    let o_deck = course_content::copy_deck_to_course(conn, &open, &code_deck)?;
    courses::add_lesson_item(conn, &o_l1, "deck", "Code Deck (course copy)", Some(&o_deck), Some("study"), None, Some(0))?;
    let o_quiz = course_content::copy_quiz_to_course(conn, &open, &shuffle_quiz)?;
    courses::add_lesson_item(conn, &o_l1, "quiz", "Shuffle Quiz (course copy)", Some(&o_quiz), Some("min_score"), Some(50), Some(1))?;

    let o_l2 = lesson(conn, &open, "Lesson 2: Also Open", "Reachable immediately — no gating.", 1, &now)?;
    let o_deck2 = course_content::copy_deck_to_course(conn, &open, &tts_deck)?;
    courses::add_lesson_item(conn, &o_l2, "deck", "Languages (course copy)", Some(&o_deck2), Some("study"), None, Some(0))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn count(conn: &Connection, sql: &str) -> i64 {
        conn.query_row(sql, [], |r| r.get(0)).unwrap()
    }

    // Smoke test: the demo seed runs cleanly against the real schema and produces
    // the designed data (every feature represented). Guards the demo walkthrough.
    #[test]
    fn seed_demo_populates_the_full_demo_against_real_schema() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(include_str!("../../migrations/schema.sql")).unwrap();

        seed_demo(&conn).expect("seed_demo should succeed against the real schema");

        assert_eq!(count(&conn, "SELECT COUNT(*) FROM users"), 1);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM decks"), 2, "TTS + code decks");
        // 7 TTS cards + 35 code-language cards + 1 code-on-front card.
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM cards"), 43);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM quizzes"), 2);
        // Showcase (6) + shuffle (3) questions.
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM questions"), 9);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM notebooks"), 2);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM pages"), 6);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM courses"), 2);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM lessons"), 5);
        // Every course item points at owned content (no NULL item_id).
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM lesson_items WHERE item_id IS NULL"), 0);
        // Favorites across each type.
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM deck_favorites"), 1);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM quiz_favorites"), 1);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM notebook_favorites"), 1);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM course_favorites"), 1);
        // All six spoken languages are represented across card sides.
        assert_eq!(
            count(
                &conn,
                "SELECT COUNT(DISTINCT lang) FROM (
                    SELECT front_tts_lang AS lang FROM cards WHERE front_tts_lang IS NOT NULL
                    UNION
                    SELECT back_tts_lang AS lang FROM cards WHERE back_tts_lang IS NOT NULL
                 )"
            ),
            6
        );
        // One quiz has shuffle on.
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM quizzes WHERE shuffle_questions = 1"), 1);
        // One course is open-navigation.
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM courses WHERE open_navigation = 1"), 1);
    }
}
