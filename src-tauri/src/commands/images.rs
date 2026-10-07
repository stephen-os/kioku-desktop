use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

/// Allowed image file extensions (lowercase, no dot).
// SECURITY: allowlist, not denylist — anything not listed is rejected.
const ALLOWED_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp"];

/// Get the images directory path, creating it if needed
fn get_images_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let images_dir = app_data.join("images");

    if !images_dir.exists() {
        fs::create_dir_all(&images_dir)
            .map_err(|e| format!("Failed to create images directory: {}", e))?;
    }

    Ok(images_dir)
}

/// SECURITY: validate a caller-supplied extension against the allowlist.
/// Rejects anything containing a path separator, `.`, or not in the allowlist
/// so it can never smuggle traversal (`..`) or an unexpected file type.
fn validate_extension(extension: &str) -> Result<String, String> {
    let ext = extension.trim().to_lowercase();
    if ext.is_empty()
        || ext.contains('/')
        || ext.contains('\\')
        || ext.contains('.')
        || !ALLOWED_EXTENSIONS.contains(&ext.as_str())
    {
        return Err(format!("Unsupported image extension: {}", extension));
    }
    Ok(ext)
}

/// SECURITY: resolve a caller-supplied image filename to an absolute path and
/// confine it to `images_dir`. Rejects path separators, `..`, and absolute
/// paths up front, then canonicalizes and verifies the result stays inside the
/// images directory (defense in depth against symlink/`..` escapes). The file
/// must already exist for canonicalization to succeed.
fn resolve_image_path(images_dir: &Path, filename: &str) -> Result<PathBuf, String> {
    if filename.is_empty()
        || filename.contains('/')
        || filename.contains('\\')
        || filename.contains("..")
        || Path::new(filename).is_absolute()
    {
        return Err(format!("Invalid image filename: {}", filename));
    }

    let candidate = images_dir.join(filename);

    let canonical_dir = images_dir
        .canonicalize()
        .map_err(|e| format!("Failed to resolve images directory: {}", e))?;
    let canonical_file = candidate
        .canonicalize()
        .map_err(|_| format!("Image not found: {}", filename))?;

    if !canonical_file.starts_with(&canonical_dir) {
        return Err(format!("Invalid image filename: {}", filename));
    }

    Ok(canonical_file)
}

/// Save an image from base64 data and return the file path
#[tauri::command]
pub fn save_image(app: AppHandle, base64_data: String, extension: String) -> Result<String, String> {
    let images_dir = get_images_dir(&app)?;

    // SECURITY: the filename is a server-generated UUID, but the extension is
    // caller-supplied — validate it against the allowlist before use.
    let extension = validate_extension(&extension)?;

    // Generate unique filename
    let filename = format!("{}.{}", Uuid::new_v4(), extension);
    let file_path = images_dir.join(&filename);

    // Decode base64 and save
    let image_data = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        &base64_data
    ).map_err(|e| format!("Failed to decode base64: {}", e))?;

    fs::write(&file_path, image_data)
        .map_err(|e| format!("Failed to write image: {}", e))?;

    // Return the path as a string
    Ok(file_path.to_string_lossy().to_string())
}

/// Get the full path for an image filename
#[tauri::command]
pub fn get_image_path(app: AppHandle, filename: String) -> Result<String, String> {
    let images_dir = get_images_dir(&app)?;
    let file_path = resolve_image_path(&images_dir, &filename)?;
    Ok(file_path.to_string_lossy().to_string())
}

/// Delete an image by filename
#[tauri::command]
pub fn delete_image(app: AppHandle, filename: String) -> Result<(), String> {
    let images_dir = get_images_dir(&app)?;

    // resolve_image_path confines to the images dir and errors if the file is
    // absent; treat a missing file as a no-op to keep delete idempotent.
    match resolve_image_path(&images_dir, &filename) {
        Ok(file_path) => fs::remove_file(&file_path)
            .map_err(|e| format!("Failed to delete image: {}", e)),
        Err(_) => Ok(()),
    }
}

/// List all images in the images directory
#[tauri::command]
pub fn list_images(app: AppHandle) -> Result<Vec<String>, String> {
    let images_dir = get_images_dir(&app)?;

    let entries = fs::read_dir(&images_dir)
        .map_err(|e| format!("Failed to read images directory: {}", e))?;

    let mut images = Vec::new();
    for entry in entries {
        if let Ok(entry) = entry {
            if let Some(filename) = entry.file_name().to_str() {
                images.push(filename.to_string());
            }
        }
    }

    Ok(images)
}

/// Get the images directory URL for use in the frontend
#[tauri::command]
pub fn get_images_dir_url(app: AppHandle) -> Result<String, String> {
    let images_dir = get_images_dir(&app)?;
    Ok(images_dir.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extension_allowlist() {
        for ok in ["png", "jpg", "jpeg", "gif", "webp", "PNG", " Png "] {
            assert!(validate_extension(ok).is_ok(), "{ok} should be allowed");
        }
        for bad in ["", "exe", "svg", "png/..", "..", "p.ng", "jpg\\x", "php5"] {
            assert!(validate_extension(bad).is_err(), "{bad} should be rejected");
        }
    }

    #[test]
    fn filenames_with_traversal_are_rejected() {
        // Guard fires before any filesystem access for these shapes.
        let dir = Path::new("images");
        for bad in [
            "",
            "../secret.txt",
            "..\\secret.txt",
            "sub/dir.png",
            "sub\\dir.png",
            "/etc/passwd",
            "a/../../b.png",
        ] {
            assert!(
                resolve_image_path(dir, bad).is_err(),
                "{bad} should be rejected"
            );
        }
    }
}
