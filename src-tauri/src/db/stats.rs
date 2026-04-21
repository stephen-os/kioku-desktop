use rusqlite::{params, Connection};
use uuid::Uuid;

use super::models::{DeckStudyStats, QuestionAnswer, QuestionResult, QuizAttempt, QuizStats, StudySession};

// ============================================
// Quiz Attempt Operations
// ============================================

pub fn start_quiz_attempt(conn: &Connection, quiz_id: &str) -> Result<QuizAttempt, String> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    // Get question count
    let total_questions: i32 = conn
        .query_row(
            "SELECT COUNT(*) FROM questions WHERE quiz_id = ?1",
            params![quiz_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    conn.execute(
        "INSERT INTO quiz_attempts (id, quiz_id, started_at, total_questions, correct_answers, score_percentage)
         VALUES (?1, ?2, ?3, ?4, 0, 0)",
        params![id, quiz_id, now, total_questions],
    )
    .map_err(|e| format!("Failed to start quiz attempt: {}", e))?;

    Ok(QuizAttempt {
        id,
        quiz_id: quiz_id.to_string(),
        started_at: now,
        completed_at: None,
        duration_seconds: None,
        total_questions,
        correct_answers: 0,
        score_percentage: 0,
        question_results: vec![],
    })
}

pub fn submit_quiz_attempt(
    conn: &Connection,
    attempt_id: &str,
    answers: &[QuestionAnswer],
) -> Result<QuizAttempt, String> {
    let now = chrono::Utc::now().to_rfc3339();

    // Get attempt info
    let (_quiz_id, started_at): (String, String) = conn
        .query_row(
            "SELECT quiz_id, started_at FROM quiz_attempts WHERE id = ?1",
            params![attempt_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Attempt not found: {}", e))?;

    // Calculate duration
    let start = chrono::DateTime::parse_from_rfc3339(&started_at)
        .map_err(|e| format!("Invalid start time: {}", e))?;
    let end = chrono::DateTime::parse_from_rfc3339(&now)
        .map_err(|e| format!("Invalid end time: {}", e))?;
    let duration = (end - start).num_seconds() as i32;

    // Begin transaction for atomic quiz submission
    conn.execute("BEGIN TRANSACTION", [])
        .map_err(|e| format!("Failed to begin transaction: {}", e))?;

    let result = (|| -> Result<(), String> {
        // Grade each answer
        let mut correct_count = 0;
        for answer in answers {
            let is_correct = grade_answer(conn, &answer.question_id, &answer.answer)?;
            if is_correct {
                correct_count += 1;
            }

            // Save question result
            let result_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO question_results (id, attempt_id, question_id, user_answer, is_correct)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![result_id, attempt_id, answer.question_id, answer.answer, is_correct as i32],
            )
            .map_err(|e| format!("Failed to save question result: {}", e))?;
        }

        // Calculate score
        let total: i32 = conn
            .query_row(
                "SELECT total_questions FROM quiz_attempts WHERE id = ?1",
                params![attempt_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        let score_percentage = if total > 0 {
            ((correct_count as f64 / total as f64) * 100.0).round() as i32
        } else {
            0
        };

        // Update attempt
        conn.execute(
            "UPDATE quiz_attempts SET completed_at = ?1, duration_seconds = ?2,
             correct_answers = ?3, score_percentage = ?4 WHERE id = ?5",
            params![now, duration, correct_count, score_percentage, attempt_id],
        )
        .map_err(|e| format!("Failed to complete attempt: {}", e))?;

        Ok(())
    })();

    // Commit or rollback based on result
    match result {
        Ok(()) => {
            conn.execute("COMMIT", [])
                .map_err(|e| format!("Failed to commit transaction: {}", e))?;
        }
        Err(e) => {
            if let Err(rollback_err) = conn.execute("ROLLBACK", []) {
                eprintln!("Warning: Failed to rollback transaction: {}", rollback_err);
            }
            return Err(e);
        }
    }

    get_quiz_attempt(conn, attempt_id)
}

fn grade_answer(conn: &Connection, question_id: &str, user_answer: &str) -> Result<bool, String> {
    let (question_type, correct_answer): (String, Option<String>) = conn
        .query_row(
            "SELECT question_type, correct_answer FROM questions WHERE id = ?1",
            params![question_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Question not found: {}", e))?;

    match question_type.as_str() {
        "fill_in_blank" => {
            // Case-insensitive match for fill-in-blank, trimming whitespace
            let user_trimmed = user_answer.trim().to_lowercase();
            let correct_trimmed = correct_answer.as_deref().map(|s| s.trim().to_lowercase());
            Ok(correct_trimmed.as_deref() == Some(user_trimmed.as_str()))
        }
        "multiple_choice" => {
            // Get correct choice IDs
            let mut stmt = conn
                .prepare("SELECT id FROM choices WHERE question_id = ?1 AND is_correct = 1")
                .map_err(|e| format!("Failed to prepare query: {}", e))?;

            let correct_ids: Vec<String> = stmt
                .query_map(params![question_id], |row| row.get(0))
                .map_err(|e| format!("Failed to query choices: {}", e))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("Failed to collect choices: {}", e))?;

            // Parse user's answer (comma-separated choice IDs), filtering empty strings
            let mut user_ids: Vec<&str> = user_answer
                .split(',')
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();
            user_ids.sort();

            let mut correct_sorted = correct_ids.clone();
            correct_sorted.sort();

            // Compare
            Ok(user_ids == correct_sorted.iter().map(|s| s.as_str()).collect::<Vec<_>>())
        }
        _ => Ok(false),
    }
}

pub fn get_quiz_attempt(conn: &Connection, attempt_id: &str) -> Result<QuizAttempt, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, quiz_id, started_at, completed_at, duration_seconds,
             total_questions, correct_answers, score_percentage
             FROM quiz_attempts WHERE id = ?1",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let attempt = stmt
        .query_row(params![attempt_id], |row| {
            Ok(QuizAttempt {
                id: row.get(0)?,
                quiz_id: row.get(1)?,
                started_at: row.get(2)?,
                completed_at: row.get(3)?,
                duration_seconds: row.get(4)?,
                total_questions: row.get(5)?,
                correct_answers: row.get(6)?,
                score_percentage: row.get(7)?,
                question_results: vec![],
            })
        })
        .map_err(|e| format!("Attempt not found: {}", e))?;

    let results = get_question_results_for_attempt(conn, attempt_id)?;

    Ok(QuizAttempt {
        question_results: results,
        ..attempt
    })
}

pub fn get_question_results_for_attempt(
    conn: &Connection,
    attempt_id: &str,
) -> Result<Vec<QuestionResult>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, attempt_id, question_id, user_answer, is_correct
             FROM question_results WHERE attempt_id = ?1",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let results = stmt
        .query_map(params![attempt_id], |row| {
            Ok(QuestionResult {
                id: row.get(0)?,
                attempt_id: row.get(1)?,
                question_id: row.get(2)?,
                user_answer: row.get(3)?,
                is_correct: row.get::<_, i32>(4)? != 0,
            })
        })
        .map_err(|e| format!("Failed to query results: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect results: {}", e))?;

    Ok(results)
}

pub fn get_quiz_attempts(conn: &Connection, quiz_id: &str) -> Result<Vec<QuizAttempt>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, quiz_id, started_at, completed_at, duration_seconds,
             total_questions, correct_answers, score_percentage
             FROM quiz_attempts WHERE quiz_id = ?1 ORDER BY started_at DESC",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let attempts = stmt
        .query_map(params![quiz_id], |row| {
            Ok(QuizAttempt {
                id: row.get(0)?,
                quiz_id: row.get(1)?,
                started_at: row.get(2)?,
                completed_at: row.get(3)?,
                duration_seconds: row.get(4)?,
                total_questions: row.get(5)?,
                correct_answers: row.get(6)?,
                score_percentage: row.get(7)?,
                question_results: vec![],
            })
        })
        .map_err(|e| format!("Failed to query attempts: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect attempts: {}", e))?;

    Ok(attempts)
}

// ============================================
// Quiz Statistics
// ============================================

pub fn get_quiz_stats(conn: &Connection, quiz_id: &str) -> Result<QuizStats, String> {
    // Get aggregate stats
    let (total_attempts, avg_score, best_score, avg_duration, last_attempt): (
        i32,
        f64,
        f64,
        Option<f64>,
        Option<String>,
    ) = conn
        .query_row(
            "SELECT
                COUNT(*),
                COALESCE(AVG(score_percentage), 0.0),
                COALESCE(MAX(score_percentage), 0.0),
                AVG(duration_seconds),
                MAX(completed_at)
             FROM quiz_attempts
             WHERE quiz_id = ?1 AND completed_at IS NOT NULL",
            params![quiz_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        )
        .map_err(|e| format!("Failed to get quiz stats: {}", e))?;

    // Get last 5 scores
    let mut stmt = conn
        .prepare(
            "SELECT score_percentage FROM quiz_attempts
             WHERE quiz_id = ?1 AND completed_at IS NOT NULL
             ORDER BY completed_at DESC LIMIT 5",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let recent_scores: Vec<i32> = stmt
        .query_map(params![quiz_id], |row| row.get(0))
        .map_err(|e| format!("Failed to query scores: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .unwrap_or_default();

    Ok(QuizStats {
        quiz_id: quiz_id.to_string(),
        total_attempts,
        average_score: avg_score,
        best_score: best_score as i32,
        average_duration_seconds: avg_duration.map(|d| d as i32),
        last_attempt_at: last_attempt,
        recent_scores,
    })
}

// ============================================
// Study Session Operations
// ============================================

pub fn start_study_session(conn: &Connection, deck_id: &str) -> Result<StudySession, String> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO study_sessions (id, deck_id, started_at, cards_studied)
         VALUES (?1, ?2, ?3, 0)",
        params![id, deck_id, now],
    )
    .map_err(|e| format!("Failed to start study session: {}", e))?;

    Ok(StudySession {
        id,
        deck_id: deck_id.to_string(),
        started_at: now,
        ended_at: None,
        duration_seconds: None,
        cards_studied: 0,
    })
}

pub fn end_study_session(
    conn: &Connection,
    session_id: &str,
    cards_studied: i32,
) -> Result<StudySession, String> {
    let now = chrono::Utc::now().to_rfc3339();

    // Get start time
    let started_at: String = conn
        .query_row(
            "SELECT started_at FROM study_sessions WHERE id = ?1",
            params![session_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Session not found: {}", e))?;

    // Calculate duration
    let start = chrono::DateTime::parse_from_rfc3339(&started_at)
        .map_err(|e| format!("Invalid start time: {}", e))?;
    let end = chrono::DateTime::parse_from_rfc3339(&now)
        .map_err(|e| format!("Invalid end time: {}", e))?;
    let duration = (end - start).num_seconds() as i32;

    conn.execute(
        "UPDATE study_sessions SET ended_at = ?1, duration_seconds = ?2, cards_studied = ?3
         WHERE id = ?4",
        params![now, duration, cards_studied, session_id],
    )
    .map_err(|e| format!("Failed to end study session: {}", e))?;

    // Get updated session
    let mut stmt = conn
        .prepare(
            "SELECT id, deck_id, started_at, ended_at, duration_seconds, cards_studied
             FROM study_sessions WHERE id = ?1",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    stmt.query_row(params![session_id], |row| {
        Ok(StudySession {
            id: row.get(0)?,
            deck_id: row.get(1)?,
            started_at: row.get(2)?,
            ended_at: row.get(3)?,
            duration_seconds: row.get(4)?,
            cards_studied: row.get(5)?,
        })
    })
    .map_err(|e| format!("Failed to get session: {}", e))
}

pub fn get_deck_study_stats(conn: &Connection, deck_id: &str) -> Result<DeckStudyStats, String> {
    let (total_sessions, total_time, total_cards, last_studied): (i32, i32, i32, Option<String>) =
        conn.query_row(
            "SELECT
                COUNT(*),
                COALESCE(SUM(duration_seconds), 0),
                COALESCE(SUM(cards_studied), 0),
                MAX(ended_at)
             FROM study_sessions
             WHERE deck_id = ?1 AND ended_at IS NOT NULL",
            params![deck_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .unwrap_or((0, 0, 0, None));

    Ok(DeckStudyStats {
        deck_id: deck_id.to_string(),
        total_sessions,
        total_study_time_seconds: total_time,
        total_cards_studied: total_cards,
        last_studied_at: last_studied,
    })
}
