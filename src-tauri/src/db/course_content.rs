// Course-owned content: decks/cards, quizzes/questions/choices, and notebook
// pages that belong to a course (separate from the personal library). Rows load
// into the SAME model structs as library content (Deck/Card/Quiz/Question/
// Choice/Page) so the study, quiz, and notes engines work on them unchanged.

use rusqlite::{params, Connection};

use super::models::{Card, Choice, Deck, Page, Question, QuestionType, Quiz};

// ============================================
// Decks & Cards (read)
// ============================================

pub fn get_course_deck(conn: &Connection, id: &str) -> Result<Deck, String> {
    conn.query_row(
        "SELECT id, name, description, shuffle_cards, created_at, updated_at
         FROM course_decks WHERE id = ?1",
        params![id],
        |row| {
            Ok(Deck {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                shuffle_cards: row.get::<_, i32>(3)? != 0,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
                card_count: None,
                is_favorite: None,
            })
        },
    )
    .map_err(|e| format!("Course deck not found: {}", e))
}

pub fn get_course_cards(conn: &Connection, course_deck_id: &str) -> Result<Vec<Card>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, course_deck_id, front, front_type, front_language,
                    back, back_type, back_language, notes,
                    created_at, updated_at, front_tts_lang, back_tts_lang
             FROM course_cards WHERE course_deck_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let cards = stmt
        .query_map(params![course_deck_id], |row| {
            Ok(Card {
                id: row.get(0)?,
                deck_id: row.get(1)?,
                front: row.get(2)?,
                front_type: row.get(3)?,
                front_language: row.get(4)?,
                back: row.get(5)?,
                back_type: row.get(6)?,
                back_language: row.get(7)?,
                notes: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                front_tts_lang: row.get(11)?,
                back_tts_lang: row.get(12)?,
                tags: vec![],
            })
        })
        .map_err(|e| format!("Failed to query course cards: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect course cards: {}", e))?;

    Ok(cards)
}

// ============================================
// Quizzes, Questions & Choices (read)
// ============================================

pub fn get_course_quiz(conn: &Connection, id: &str) -> Result<Quiz, String> {
    let mut quiz = conn
        .query_row(
            "SELECT id, name, description, shuffle_questions, created_at, updated_at
             FROM course_quizzes WHERE id = ?1",
            params![id],
            |row| {
                Ok(Quiz {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    shuffle_questions: row.get::<_, i32>(3)? != 0,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                    questions: vec![],
                    question_count: None,
                    is_favorite: None,
                })
            },
        )
        .map_err(|e| format!("Course quiz not found: {}", e))?;

    quiz.questions = get_course_questions(conn, id)?;
    Ok(quiz)
}

fn get_course_questions(conn: &Connection, course_quiz_id: &str) -> Result<Vec<Question>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, course_quiz_id, question_type, content, content_type, content_language,
                    correct_answer, multiple_answers, explanation, position, created_at, updated_at
             FROM course_questions WHERE course_quiz_id = ?1 ORDER BY position",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let questions = stmt
        .query_map(params![course_quiz_id], |row| {
            Ok(Question {
                id: row.get(0)?,
                quiz_id: row.get(1)?,
                question_type: QuestionType::from_str(&row.get::<_, String>(2)?),
                content: row.get(3)?,
                content_type: row.get(4)?,
                content_language: row.get(5)?,
                correct_answer: row.get(6)?,
                multiple_answers: row.get::<_, i32>(7)? != 0,
                explanation: row.get(8)?,
                position: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
                choices: vec![],
                tags: vec![],
            })
        })
        .map_err(|e| format!("Failed to query course questions: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect course questions: {}", e))?;

    let mut out = Vec::new();
    for q in questions {
        let choices = get_course_choices(conn, &q.id)?;
        out.push(Question { choices, ..q });
    }
    Ok(out)
}

fn get_course_choices(conn: &Connection, course_question_id: &str) -> Result<Vec<Choice>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, course_question_id, text, is_correct, position
             FROM course_choices WHERE course_question_id = ?1 ORDER BY position",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let choices = stmt
        .query_map(params![course_question_id], |row| {
            Ok(Choice {
                id: row.get(0)?,
                question_id: row.get(1)?,
                text: row.get(2)?,
                is_correct: row.get::<_, i32>(3)? != 0,
                position: row.get(4)?,
            })
        })
        .map_err(|e| format!("Failed to query course choices: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect course choices: {}", e))?;

    Ok(choices)
}

// ============================================
// Notebook pages (read)
// ============================================

pub fn get_course_page(conn: &Connection, id: &str) -> Result<Page, String> {
    conn.query_row(
        "SELECT id, course_notebook_id, title, content, position, created_at, updated_at
         FROM course_pages WHERE id = ?1",
        params![id],
        |row| {
            Ok(Page {
                id: row.get(0)?,
                notebook_id: row.get(1)?,
                title: row.get(2)?,
                content: row.get(3)?,
                position: row.get(4)?,
                is_pinned: false,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        },
    )
    .map_err(|e| format!("Course page not found: {}", e))
}
