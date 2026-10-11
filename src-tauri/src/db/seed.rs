// First-run seed: creates the Demo profile with a small personal library and a
// course that OWNS its content (copied from that library), exercising the
// course-owned-content model. Runs once, when the database has no users.

use rusqlite::{params, Connection};
use uuid::Uuid;

use super::{course_content, courses};

fn uuid() -> String {
    Uuid::new_v4().to_string()
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

    // --- Personal library (so the Decks/Quizzes/Notes pages aren't empty and the
    //     course has sources to copy from / Adopt can be compared against) ---

    // Deck
    let deck_id = uuid();
    conn.execute(
        "INSERT INTO decks (id, user_id, name, description, shuffle_cards, created_at, updated_at)
         VALUES (?1, ?2, 'Rust Basics', 'Fundamental Rust concepts', 0, ?3, ?3)",
        params![deck_id, user_id, now],
    )
    .map_err(|e| format!("seed deck: {}", e))?;
    for (front, back) in [
        ("What keyword declares a variable in Rust?", "let"),
        ("What does `mut` add to a binding?", "Mutability"),
        ("Rust's build tool and package manager?", "Cargo"),
    ] {
        conn.execute(
            "INSERT INTO cards (id, deck_id, front, front_type, back, back_type, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'TEXT', ?4, 'TEXT', ?5, ?5)",
            params![uuid(), deck_id, front, back, now],
        )
        .map_err(|e| format!("seed card: {}", e))?;
    }

    // Quiz
    let quiz_id = uuid();
    conn.execute(
        "INSERT INTO quizzes (id, user_id, name, description, shuffle_questions, created_at, updated_at)
         VALUES (?1, ?2, 'Rust Quiz', 'Check your Rust basics', 0, ?3, ?3)",
        params![quiz_id, user_id, now],
    )
    .map_err(|e| format!("seed quiz: {}", e))?;
    let q1 = uuid();
    conn.execute(
        "INSERT INTO questions (id, quiz_id, question_type, content, content_type, multiple_answers, position, created_at, updated_at)
         VALUES (?1, ?2, 'multiple_choice', ?3, 'TEXT', 0, 0, ?4, ?4)",
        params![q1, quiz_id, "Which keyword declares a variable?", now],
    )
    .map_err(|e| format!("seed q1: {}", e))?;
    for (text, correct, pos) in [("let", 1, 0), ("var", 0, 1), ("const", 0, 2)] {
        conn.execute(
            "INSERT INTO choices (id, question_id, text, is_correct, position) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![uuid(), q1, text, correct, pos],
        )
        .map_err(|e| format!("seed choice: {}", e))?;
    }
    let q2 = uuid();
    conn.execute(
        "INSERT INTO questions (id, quiz_id, question_type, content, content_type, correct_answer, multiple_answers, position, created_at, updated_at)
         VALUES (?1, ?2, 'fill_in_blank', ?3, 'TEXT', 'cargo', 0, 1, ?4, ?4)",
        params![q2, quiz_id, "Rust's package manager is ____.", now],
    )
    .map_err(|e| format!("seed q2: {}", e))?;

    // Note (library notebook + page)
    let nb_id = uuid();
    conn.execute(
        "INSERT INTO notebooks (id, user_id, name, description, icon, color, created_at, updated_at)
         VALUES (?1, ?2, 'Rust Notes', NULL, 'notebook', NULL, ?3, ?3)",
        params![nb_id, user_id, now],
    )
    .map_err(|e| format!("seed notebook: {}", e))?;
    conn.execute(
        "INSERT INTO pages (id, notebook_id, title, content, position, is_pinned, created_at, updated_at)
         VALUES (?1, ?2, 'Ownership', ?3, 0, 0, ?4, ?4)",
        params![
            uuid(),
            nb_id,
            "Rust's ownership model ensures memory safety without a garbage collector.",
            now
        ],
    )
    .map_err(|e| format!("seed page: {}", e))?;

    // --- Course that OWNS its content ---
    let course_id = uuid();
    conn.execute(
        "INSERT INTO courses (id, user_id, name, description, open_navigation, created_at, updated_at)
         VALUES (?1, ?2, 'Getting Started with Rust (Demo)', 'A short demo course', 0, ?3, ?3)",
        params![course_id, user_id, now],
    )
    .map_err(|e| format!("seed course: {}", e))?;

    // Lesson 1 — a deck (study), a quiz (pass >= 70), and a note (read)
    let l1 = uuid();
    conn.execute(
        "INSERT INTO lessons (id, course_id, title, description, position, created_at, updated_at)
         VALUES (?1, ?2, 'Lesson 1: Basics', NULL, 0, ?3, ?3)",
        params![l1, course_id, now],
    )
    .map_err(|e| format!("seed lesson 1: {}", e))?;

    let cdeck = course_content::copy_deck_to_course(conn, &course_id, &deck_id)?;
    courses::add_lesson_item(conn, &l1, "deck", "Rust Basics", Some(&cdeck), Some("study"), None, Some(0))?;

    let cquiz = course_content::copy_quiz_to_course(conn, &course_id, &quiz_id)?;
    courses::add_lesson_item(conn, &l1, "quiz", "Rust Quiz", Some(&cquiz), Some("min_score"), Some(70), Some(1))?;

    let cnb = course_content::create_course_notebook(conn, &course_id, "Ownership", None)?;
    let cpage = course_content::create_course_page(
        conn,
        &cnb,
        "Ownership",
        "Rust's ownership model ensures memory safety without a garbage collector.",
        0,
    )?;
    courses::add_lesson_item(conn, &l1, "note", "Ownership", Some(&cpage), Some("read"), None, Some(2))?;

    // Lesson 2 — locked until Lesson 1 is complete (linear gating)
    let l2 = uuid();
    conn.execute(
        "INSERT INTO lessons (id, course_id, title, description, position, created_at, updated_at)
         VALUES (?1, ?2, 'Lesson 2: Keep Going', NULL, 1, ?3, ?3)",
        params![l2, course_id, now],
    )
    .map_err(|e| format!("seed lesson 2: {}", e))?;

    let cdeck2 = course_content::copy_deck_to_course(conn, &course_id, &deck_id)?;
    courses::add_lesson_item(conn, &l2, "deck", "Rust Basics (review)", Some(&cdeck2), Some("study"), None, Some(0))?;

    Ok(())
}
