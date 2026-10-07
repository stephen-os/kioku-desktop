use rusqlite::Connection;
use tauri::State;

use crate::db::{self, CreateUserRequest, DbState, LocalUser};

/// SECURITY: resolve the logged-in user and confirm the request targets their
/// own record. Default-deny: no active user, or a mismatch, is rejected. This
/// is the Rust-side authorization gate for self-service account commands, which
/// previously trusted the (client-only) React login state and would operate on
/// any profile by id.
fn require_self(conn: &Connection, target_user_id: &str) -> Result<(), String> {
    let active = db::get_active_user(conn)?.ok_or_else(|| "No active user".to_string())?;
    if active.id != target_user_id {
        return Err("Access denied".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn get_all_users(state: State<DbState>) -> Result<Vec<LocalUser>, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::get_all_users(&conn)
}

#[tauri::command]
pub fn get_user(state: State<DbState>, user_id: String) -> Result<LocalUser, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::get_user(&conn, &user_id)
}

#[tauri::command]
pub fn create_user(state: State<DbState>, request: CreateUserRequest) -> Result<LocalUser, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::create_user(&conn, &request)
}

#[tauri::command]
pub fn login_user(
    state: State<DbState>,
    user_id: String,
    password: Option<String>,
) -> Result<LocalUser, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::login_user(&conn, &user_id, password.as_deref())
}

#[tauri::command]
pub fn get_active_user(state: State<DbState>) -> Result<Option<LocalUser>, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::get_active_user(&conn)
}

#[tauri::command]
pub fn logout_user(state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    db::logout_user(&conn)
}

#[tauri::command]
pub fn delete_user(state: State<DbState>, user_id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    require_self(&conn, &user_id)?;
    db::delete_user(&conn, &user_id)
}

#[tauri::command]
pub fn update_user(
    state: State<DbState>,
    user_id: String,
    name: String,
    password: Option<String>,
    avatar: Option<String>,
) -> Result<LocalUser, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    require_self(&conn, &user_id)?;
    db::update_user(&conn, &user_id, &name, password.as_deref(), avatar.as_deref())
}

#[tauri::command]
pub fn remove_user_password(state: State<DbState>, user_id: String) -> Result<LocalUser, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    require_self(&conn, &user_id)?;
    db::remove_user_password(&conn, &user_id)
}
