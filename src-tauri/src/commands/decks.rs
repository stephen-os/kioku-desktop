use tauri::State;

use crate::db::{
    self, Card, CardTag, CreateCardRequest, CreateDeckRequest, DbState, Deck, Tag,
    UpdateCardRequest, UpdateDeckRequest,
};

// ============================================
// Deck Commands
// ============================================

#[tauri::command]
pub fn get_all_decks(state: State<DbState>) -> Result<Vec<Deck>, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let active_user = db::get_active_user(&conn)?
        .ok_or_else(|| "No active user".to_string())?;
    db::get_all_decks(&conn, &active_user.id)
}

#[tauri::command]
pub fn get_deck(state: State<DbState>, id: String) -> Result<Option<Deck>, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let active_user = db::get_active_user(&conn)?
        .ok_or_else(|| "No active user".to_string())?;
    db::get_deck(&conn, &active_user.id, &id)
}

#[tauri::command]
pub fn create_deck(state: State<DbState>, request: CreateDeckRequest) -> Result<Deck, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let active_user = db::get_active_user(&conn)?
        .ok_or_else(|| "No active user".to_string())?;
    db::create_deck(
        &conn,
        &active_user.id,
        &request.name,
        request.description.as_deref(),
        request.shuffle_cards.unwrap_or(false),
    )
}

#[tauri::command]
pub fn update_deck(
    state: State<DbState>,
    id: String,
    request: UpdateDeckRequest,
) -> Result<Deck, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let active_user = db::get_active_user(&conn)?
        .ok_or_else(|| "No active user".to_string())?;
    db::update_deck(
        &conn,
        &active_user.id,
        &id,
        &request.name,
        request.description.as_deref(),
        request.shuffle_cards.unwrap_or(false),
    )
}

#[tauri::command]
pub fn delete_deck(state: State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let active_user = db::get_active_user(&conn)?
        .ok_or_else(|| "No active user".to_string())?;
    db::delete_deck(&conn, &active_user.id, &id)
}

// ============================================
// Card Commands
// ============================================

#[tauri::command]
pub fn get_cards_for_deck(state: State<DbState>, deck_id: String) -> Result<Vec<Card>, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::get_cards_for_deck(&conn, &deck_id)
}

#[tauri::command]
pub fn get_card(
    state: State<DbState>,
    id: String,
    deck_id: String,
) -> Result<Option<Card>, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    match db::get_card(&conn, &id, &deck_id) {
        Ok(card) => Ok(Some(card)),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
pub fn create_card(
    state: State<DbState>,
    deck_id: String,
    request: CreateCardRequest,
) -> Result<Card, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::create_card(&conn, &deck_id, &request)
}

#[tauri::command]
pub fn update_card(
    state: State<DbState>,
    id: String,
    deck_id: String,
    request: UpdateCardRequest,
) -> Result<Card, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::update_card(&conn, &id, &deck_id, &request)
}

#[tauri::command]
pub fn delete_card(state: State<DbState>, id: String, deck_id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::delete_card(&conn, &id, &deck_id)
}

// ============================================
// Tag Commands
// ============================================

#[tauri::command]
pub fn get_tags_for_deck(state: State<DbState>, deck_id: String) -> Result<Vec<Tag>, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::get_tags_for_deck(&conn, &deck_id)
}

#[tauri::command]
pub fn get_tags_for_card(state: State<DbState>, card_id: String) -> Result<Vec<CardTag>, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::get_tags_for_card(&conn, &card_id)
}

#[tauri::command]
pub fn create_tag(state: State<DbState>, deck_id: String, name: String) -> Result<Tag, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::create_tag(&conn, &deck_id, &name)
}

#[tauri::command]
pub fn delete_tag(state: State<DbState>, deck_id: String, id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::delete_tag(&conn, &deck_id, &id)
}

#[tauri::command]
pub fn add_tag_to_card(
    state: State<DbState>,
    deck_id: String,
    card_id: String,
    tag_id: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::add_tag_to_card(&conn, &deck_id, &card_id, &tag_id)
}

#[tauri::command]
pub fn remove_tag_from_card(
    state: State<DbState>,
    deck_id: String,
    card_id: String,
    tag_id: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::remove_tag_from_card(&conn, &deck_id, &card_id, &tag_id)
}

// ============================================
// Favorite Commands
// ============================================

#[tauri::command]
pub fn toggle_deck_favorite(state: State<DbState>, deck_id: String) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let active_user = db::get_active_user(&conn)?
        .ok_or_else(|| "No active user".to_string())?;
    db::toggle_deck_favorite(&conn, &active_user.id, &deck_id)
}
