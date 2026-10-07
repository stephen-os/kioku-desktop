use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Emitter, Manager};

/// Download URL for the prebuilt standalone `kioku-tts` engine (MeloTTS, frozen
/// with PyInstaller). The user hosts the per-platform ZIP on a `kioku-desktop`
/// GitHub release and fills this in. Until then it stays as the placeholder
/// below and `install_tts` returns a friendly error so the UI shows the
/// Web Speech fallback.
///
/// TODO(KIOKU_TTS_RELEASE_URL): set this to the hosted release ZIP URL, e.g.
/// "https://github.com/stephen-os/kioku-desktop/releases/download/tts-v1/kioku-tts-windows.zip"
const KIOKU_TTS_RELEASE_URL: &str = "TODO_SET_AFTER_HOSTING";

/// Progress payload emitted on the `tts-download-progress` event during install.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub id: String,
    pub progress: f32,
    pub message: String,
}

/// Engine installation status returned to the front end.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsStatus {
    pub installed: bool,
    pub size_bytes: u64,
}

/// `<app_data>/tts`
fn get_tts_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    Ok(app_data_dir.join("tts"))
}

/// `<app_data>/tts/engine`
fn get_engine_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(get_tts_dir(app)?.join("engine"))
}

/// `<app_data>/tts/cache`
fn get_cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(get_tts_dir(app)?.join("cache"))
}

/// Path to the engine executable (`.exe` on Windows) under the engine dir.
fn get_engine_exe(app: &AppHandle) -> Result<PathBuf, String> {
    let exe_name = if cfg!(windows) {
        "kioku-tts.exe"
    } else {
        "kioku-tts"
    };
    Ok(get_engine_dir(app)?.join(exe_name))
}

/// Recursively sum file sizes under a directory. Missing dir => 0.
fn dir_size(path: &PathBuf) -> u64 {
    let mut size = 0;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                size += dir_size(&path);
            } else if let Ok(meta) = path.metadata() {
                size += meta.len();
            }
        }
    }
    size
}

/// Deterministic cache filename for a (lang, text) pair: `<hex>.wav`.
fn cache_filename(lang: &str, text: &str) -> String {
    let mut hasher = DefaultHasher::new();
    lang.hash(&mut hasher);
    "\u{1f}".hash(&mut hasher); // separator so (a,bc) != (ab,c)
    text.hash(&mut hasher);
    format!("{:016x}.wav", hasher.finish())
}

/// Check engine installation status and total storage used (engine + cache).
#[tauri::command]
pub async fn tts_status(app: AppHandle) -> Result<TtsStatus, String> {
    let installed = get_engine_exe(&app)?.exists();
    let size_bytes = tts_storage_bytes(&app)?;
    Ok(TtsStatus {
        installed,
        size_bytes,
    })
}

/// Bytes used by the engine + cache directories.
fn tts_storage_bytes(app: &AppHandle) -> Result<u64, String> {
    let tts_dir = get_tts_dir(app)?;
    if !tts_dir.exists() {
        return Ok(0);
    }
    Ok(dir_size(&tts_dir))
}

/// Download and extract the standalone MeloTTS engine into `<app_data>/tts/engine`.
/// Emits progress on `tts-download-progress`. Returns a friendly error while the
/// release URL is still the placeholder.
#[tauri::command]
pub async fn install_tts(app: AppHandle) -> Result<(), String> {
    if KIOKU_TTS_RELEASE_URL == "TODO_SET_AFTER_HOSTING" {
        return Err("TTS engine not yet available".to_string());
    }

    let engine_dir = get_engine_dir(&app)?;
    fs::create_dir_all(&engine_dir)
        .map_err(|e| format!("Failed to create engine dir: {}", e))?;

    let _ = app.emit(
        "tts-download-progress",
        DownloadProgress {
            id: "tts".to_string(),
            progress: 0.0,
            message: "Starting download...".to_string(),
        },
    );

    // Stream-download the ZIP to disk (mirrors the old Piper install flow).
    let client = reqwest::Client::new();
    let response = client
        .get(KIOKU_TTS_RELEASE_URL)
        .send()
        .await
        .map_err(|e| format!("Failed to download TTS engine: {}", e))?;

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;

    let zip_path = engine_dir.join("kioku-tts.zip");
    let mut file =
        fs::File::create(&zip_path).map_err(|e| format!("Failed to create zip file: {}", e))?;

    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Failed to write chunk: {}", e))?;

        downloaded += chunk.len() as u64;
        let progress = if total_size > 0 {
            (downloaded as f32 / total_size as f32) * 0.8 // 80% for download
        } else {
            0.5
        };

        let _ = app.emit(
            "tts-download-progress",
            DownloadProgress {
                id: "tts".to_string(),
                progress,
                message: format!("Downloading... {:.1} MB", downloaded as f64 / 1_000_000.0),
            },
        );
    }

    drop(file);

    // Extract the ZIP, preserving its internal directory structure (the engine
    // ships models and support files in subfolders).
    let _ = app.emit(
        "tts-download-progress",
        DownloadProgress {
            id: "tts".to_string(),
            progress: 0.85,
            message: "Extracting...".to_string(),
        },
    );

    let zip_file =
        fs::File::open(&zip_path).map_err(|e| format!("Failed to open zip: {}", e))?;
    let mut archive =
        zip::ZipArchive::new(zip_file).map_err(|e| format!("Failed to read zip: {}", e))?;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read zip entry: {}", e))?;

        // Use the sanitized path from the archive, preserving subfolders.
        let out_path = match entry.enclosed_name() {
            Some(name) => engine_dir.join(name),
            None => continue,
        };

        if entry.name().ends_with('/') {
            fs::create_dir_all(&out_path)
                .map_err(|e| format!("Failed to create dir {:?}: {}", out_path, e))?;
            continue;
        }

        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create dir {:?}: {}", parent, e))?;
        }

        let mut out_file = fs::File::create(&out_path)
            .map_err(|e| format!("Failed to create file {:?}: {}", out_path, e))?;
        std::io::copy(&mut entry, &mut out_file)
            .map_err(|e| format!("Failed to extract {:?}: {}", out_path, e))?;
    }

    // Clean up the archive.
    let _ = fs::remove_file(&zip_path);

    let _ = app.emit(
        "tts-download-progress",
        DownloadProgress {
            id: "tts".to_string(),
            progress: 1.0,
            message: "Complete!".to_string(),
        },
    );

    Ok(())
}

/// Remove the engine and the synthesized-audio cache.
#[tauri::command]
pub async fn uninstall_tts(app: AppHandle) -> Result<(), String> {
    let engine_dir = get_engine_dir(&app)?;
    let cache_dir = get_cache_dir(&app)?;

    if engine_dir.exists() {
        fs::remove_dir_all(&engine_dir)
            .map_err(|e| format!("Failed to remove engine: {}", e))?;
    }
    if cache_dir.exists() {
        fs::remove_dir_all(&cache_dir)
            .map_err(|e| format!("Failed to remove cache: {}", e))?;
    }

    Ok(())
}

/// Total bytes used by the engine + cache directories.
#[tauri::command]
pub async fn get_tts_storage_size(app: AppHandle) -> Result<u64, String> {
    tts_storage_bytes(&app)
}

/// Synthesize `text` in `lang` to a cached WAV and return its absolute path.
/// Returns cached audio immediately when present; otherwise requires the engine
/// to be installed (errors if not, so the front end can fall back to Web Speech),
/// invokes the engine as a subprocess, and returns the resulting file path.
#[tauri::command]
pub async fn synthesize_tts(app: AppHandle, text: String, lang: String) -> Result<String, String> {
    let cache_dir = get_cache_dir(&app)?;
    fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("Failed to create cache dir: {}", e))?;

    let out_path = cache_dir.join(cache_filename(&lang, &text));

    // Cache hit.
    if out_path.exists() {
        return Ok(out_path.to_string_lossy().to_string());
    }

    // Need the engine to generate a cache miss.
    let engine_exe = get_engine_exe(&app)?;
    if !engine_exe.exists() {
        return Err("TTS engine not installed".to_string());
    }

    let status = Command::new(&engine_exe)
        .arg("--lang")
        .arg(&lang)
        .arg("--text")
        .arg(&text)
        .arg("--out")
        .arg(&out_path)
        .status()
        .map_err(|e| format!("Failed to run TTS engine: {}", e))?;

    if !status.success() {
        return Err(format!("TTS engine exited with status {}", status));
    }

    if !out_path.exists() {
        return Err("TTS engine did not produce an audio file".to_string());
    }

    Ok(out_path.to_string_lossy().to_string())
}
