mod commands;
mod db;

use std::sync::Mutex;
use tauri::{AppHandle, Manager};

use db::DbState;

fn init_db(app: &AppHandle) -> Result<(), String> {
    let conn = db::init_database(app)?;
    app.manage(DbState(Mutex::new(conn)));
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            init_db(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // User commands
            commands::users::get_all_users,
            commands::users::get_user,
            commands::users::create_user,
            commands::users::login_user,
            commands::users::get_active_user,
            commands::users::logout_user,
            commands::users::delete_user,
            commands::users::update_user,
            commands::users::remove_user_password,
            // Deck commands
            commands::decks::get_all_decks,
            commands::decks::get_deck,
            commands::decks::create_deck,
            commands::decks::update_deck,
            commands::decks::delete_deck,
            // Card commands
            commands::decks::get_cards_for_deck,
            commands::decks::get_card,
            commands::decks::create_card,
            commands::decks::update_card,
            commands::decks::delete_card,
            // Tag commands
            commands::decks::get_tags_for_deck,
            commands::decks::get_tags_for_card,
            commands::decks::create_tag,
            commands::decks::delete_tag,
            commands::decks::add_tag_to_card,
            commands::decks::remove_tag_from_card,
            // Deck favorite commands
            commands::decks::toggle_deck_favorite,
            // Course commands
            commands::courses::get_all_courses,
            commands::courses::get_course,
            commands::courses::get_course_with_lessons,
            commands::courses::create_course,
            commands::courses::update_course,
            commands::courses::delete_course,
            commands::courses::toggle_course_favorite,
            // Lesson commands
            commands::courses::get_lessons,
            commands::courses::get_lesson,
            commands::courses::create_lesson,
            commands::courses::update_lesson,
            commands::courses::delete_lesson,
            commands::courses::reorder_lessons,
            // Lesson item commands
            commands::courses::get_lesson_items,
            commands::courses::add_lesson_item,
            commands::courses::remove_lesson_item,
            commands::courses::reorder_lesson_items,
            commands::courses::update_lesson_item_reference,
            // Lesson progress commands
            commands::courses::record_lesson_progress,
            commands::courses::clear_lesson_item_progress,
            commands::courses::get_lesson_progress,
            commands::courses::link_course_items,
            // Quiz tag commands
            commands::quizzes::get_tags_for_quiz,
            commands::quizzes::get_tags_for_question,
            commands::quizzes::create_quiz_tag,
            commands::quizzes::delete_quiz_tag,
            commands::quizzes::add_tag_to_question,
            commands::quizzes::remove_tag_from_question,
            // Quiz commands
            commands::quizzes::get_all_quizzes,
            commands::quizzes::get_quiz,
            commands::quizzes::create_quiz,
            commands::quizzes::update_quiz,
            commands::quizzes::delete_quiz,
            // Question commands
            commands::quizzes::get_questions_for_quiz,
            commands::quizzes::get_question,
            commands::quizzes::create_question,
            commands::quizzes::update_question,
            commands::quizzes::delete_question,
            commands::quizzes::reorder_questions,
            commands::quizzes::update_question_choices,
            // Quiz attempt commands
            commands::quizzes::start_quiz_attempt,
            commands::quizzes::submit_quiz_attempt,
            commands::quizzes::get_quiz_attempt,
            commands::quizzes::get_quiz_attempts,
            commands::quizzes::get_quiz_stats,
            // Quiz favorite commands
            commands::quizzes::toggle_quiz_favorite,
            // Study session commands
            commands::sessions::start_study_session,
            commands::sessions::end_study_session,
            commands::sessions::get_deck_study_stats,
            // Import / Export commands
            commands::transfer::import_deck_from_file,
            commands::transfer::export_deck_to_json,
            commands::transfer::import_quiz_from_file,
            commands::transfer::export_quiz_to_json,
            commands::transfer::import_course_from_file,
            commands::transfer::export_course_to_json,
            // TTS commands
            commands::tts::tts_status,
            commands::tts::install_tts,
            commands::tts::uninstall_tts,
            commands::tts::get_tts_storage_size,
            commands::tts::synthesize_tts,
            // Notebook commands
            commands::notebooks::get_all_notebooks,
            commands::notebooks::get_notebook,
            commands::notebooks::create_notebook,
            commands::notebooks::update_notebook,
            commands::notebooks::delete_notebook,
            commands::notebooks::toggle_notebook_favorite,
            // Page commands
            commands::notebooks::get_pages_for_notebook,
            commands::notebooks::get_page,
            commands::notebooks::create_page,
            commands::notebooks::update_page,
            commands::notebooks::delete_page,
            commands::notebooks::reorder_pages,
            commands::notebooks::toggle_page_pin,
            // Search commands
            commands::notebooks::search_pages,
            commands::notebooks::get_recent_pages,
            // Page organization commands
            commands::notebooks::duplicate_page,
            commands::notebooks::move_page,
            // Backlinks commands
            commands::notebooks::get_backlinks,
            commands::notebooks::get_all_page_titles,
            // Image commands
            commands::images::save_image,
            commands::images::get_image_path,
            commands::images::delete_image,
            commands::images::list_images,
            commands::images::get_images_dir_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
