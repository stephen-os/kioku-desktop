use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::hash_map::DefaultHasher;
use std::collections::HashSet;
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::db::{self, DbState};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
/// Windows: don't pop a console window when spawning the engine.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Download URL for the prebuilt standalone `kioku-tts` engine (MeloTTS, frozen
/// with PyInstaller). The user hosts the per-platform ZIP on a `kioku-desktop`
/// GitHub release and fills this in. Until then it stays as the placeholder
/// below and `install_tts` returns a friendly error so the UI shows the
/// Web Speech fallback.
///
/// TODO(KIOKU_TTS_RELEASE_URL): set this to the hosted release ZIP URL, e.g.
/// "https://github.com/stephen-os/kioku-desktop/releases/download/tts-v1/kioku-tts-windows.zip"
///
/// SECURITY: this URL MUST be `https` (enforced at install time) and MUST be set
/// together with `EXPECTED_TTS_SHA256` below — the two placeholders are a pair.
/// Shipping a real URL without the matching hash (or vice versa) is a mistake:
/// `install_tts` fails closed if either is still a placeholder.
const KIOKU_TTS_RELEASE_URL: &str = "TODO_SET_AFTER_HOSTING";

/// SECURITY: pinned lowercase hex SHA-256 of the exact release ZIP named by
/// `KIOKU_TTS_RELEASE_URL`. The downloaded archive is verified against this
/// digest *before* it is extracted and the engine executable is ever run, so a
/// compromised release host / account / CDN cannot deliver a trojaned engine.
/// MUST be set in lockstep with `KIOKU_TTS_RELEASE_URL` (see the note above);
/// until the artifact is hosted both stay placeholders and install is disabled.
const EXPECTED_TTS_SHA256: &str = "TODO_SET_AFTER_HOSTING";

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

/// `<app_data>/tts/models` — writable Hugging Face cache for models the engine
/// downloads on first use (fetch-at-install; models are not bundled in the exe).
fn get_models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(get_tts_dir(app)?.join("models"))
}

/// Point a spawned engine process at the writable model cache via `HF_HOME`.
///
/// `offline` controls whether the process may hit the network: study/bake runs
/// pass `true` so Hugging Face is NEVER contacted at use time (a model that
/// isn't already installed simply fails, instead of downloading mid-study). The
/// ONLY caller that passes `false` is the explicit install/Settings model
/// download — the single place HF fetching is allowed.
fn apply_model_env(cmd: &mut Command, app: &AppHandle, offline: bool) -> Result<(), String> {
    let models = get_models_dir(app)?;
    fs::create_dir_all(&models).map_err(|e| format!("Failed to create models dir: {}", e))?;
    cmd.env("HF_HOME", &models);
    cmd.env("HF_HUB_DISABLE_SYMLINKS_WARNING", "1");
    if offline {
        cmd.env("HF_HUB_OFFLINE", "1");
        cmd.env("TRANSFORMERS_OFFLINE", "1");
    }
    Ok(())
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
    // SECURITY: fail closed unless both the URL and the pinned hash are set.
    // They are a pair (see the constants above); refusing when either is still
    // a placeholder prevents an unverified download from ever being extracted.
    if KIOKU_TTS_RELEASE_URL == "TODO_SET_AFTER_HOSTING"
        || EXPECTED_TTS_SHA256 == "TODO_SET_AFTER_HOSTING"
    {
        return Err("TTS engine not yet available".to_string());
    }

    // Stop any running daemon so the engine files aren't locked during extract
    // (a running .exe can't be overwritten on Windows).
    kill_daemon(&app);

    // SECURITY: only fetch the engine over TLS. Reject anything that is not an
    // https URL so the download cannot be downgraded to cleartext.
    if !KIOKU_TTS_RELEASE_URL.starts_with("https://") {
        return Err("Refusing to download TTS engine over a non-HTTPS URL".to_string());
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

    // SECURITY: hash the bytes as they stream so we can verify integrity before
    // extracting anything from the archive.
    let mut hasher = Sha256::new();
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download error: {}", e))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Failed to write chunk: {}", e))?;
        hasher.update(&chunk);

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

    // SECURITY: verify the downloaded archive against the pinned SHA-256 before
    // extracting or executing anything. On mismatch, delete the file and fail
    // closed — a compromised host/CDN/account cannot deliver a trojaned engine.
    let actual_digest = format!("{:x}", hasher.finalize());
    if !actual_digest.eq_ignore_ascii_case(EXPECTED_TTS_SHA256) {
        let _ = fs::remove_file(&zip_path);
        return Err("TTS engine failed integrity check (SHA-256 mismatch)".to_string());
    }

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
    // Stop the daemon first so the engine files aren't locked and no stale
    // process keeps running against a removed engine.
    kill_daemon(&app);

    let engine_dir = get_engine_dir(&app)?;
    let cache_dir = get_cache_dir(&app)?;
    let models_dir = get_models_dir(&app)?;

    if engine_dir.exists() {
        fs::remove_dir_all(&engine_dir)
            .map_err(|e| format!("Failed to remove engine: {}", e))?;
    }
    if cache_dir.exists() {
        fs::remove_dir_all(&cache_dir)
            .map_err(|e| format!("Failed to remove cache: {}", e))?;
    }
    if models_dir.exists() {
        fs::remove_dir_all(&models_dir)
            .map_err(|e| format!("Failed to remove models: {}", e))?;
    }

    Ok(())
}

/// Total bytes used by the engine + cache directories.
#[tauri::command]
pub async fn get_tts_storage_size(app: AppHandle) -> Result<u64, String> {
    tts_storage_bytes(&app)
}

/// The persistent MeloTTS daemon (`kioku-tts --serve`): torch is imported once
/// and each language's model stays resident, so every request after warm-up is
/// fast. Spawned lazily (warm-up or first synth); when the app exits its stdin
/// closes and the daemon reaches EOF and exits on its own.
struct Daemon {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}

/// Tauri managed state: the (optional) running daemon, behind a mutex so requests
/// serialize (the engine processes one utterance at a time anyway).
pub struct TtsEngine(Mutex<Option<Daemon>>);

impl Default for TtsEngine {
    fn default() -> Self {
        TtsEngine(Mutex::new(None))
    }
}

/// Spawn the engine in `--serve` mode and block until it signals readiness
/// (i.e. torch has finished importing).
fn spawn_daemon(app: &AppHandle) -> Result<Daemon, String> {
    let exe = get_engine_exe(app)?;
    if !exe.exists() {
        return Err("TTS engine not installed".to_string());
    }

    let mut cmd = Command::new(&exe);
    cmd.arg("--serve")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    apply_model_env(&mut cmd, app, true)?; // study/bake daemon never downloads
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start TTS daemon: {}", e))?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "TTS daemon has no stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "TTS daemon has no stdout".to_string())?;
    let mut reader = BufReader::new(stdout);

    // Readiness handshake — blocks while the daemon imports torch.
    let mut ready = String::new();
    reader
        .read_line(&mut ready)
        .map_err(|e| format!("TTS daemon handshake failed: {}", e))?;

    Ok(Daemon {
        child,
        stdin,
        stdout: reader,
    })
}

/// Send one JSON request line and read one JSON response line.
fn daemon_exchange(
    daemon: &mut Daemon,
    req: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let mut line = serde_json::to_string(req).map_err(|e| e.to_string())?;
    line.push('\n');
    daemon
        .stdin
        .write_all(line.as_bytes())
        .map_err(|e| format!("TTS daemon write failed: {}", e))?;
    daemon
        .stdin
        .flush()
        .map_err(|e| format!("TTS daemon flush failed: {}", e))?;

    let mut resp = String::new();
    let n = daemon
        .stdout
        .read_line(&mut resp)
        .map_err(|e| format!("TTS daemon read failed: {}", e))?;
    if n == 0 {
        return Err("TTS daemon closed unexpectedly".to_string());
    }
    serde_json::from_str(&resp).map_err(|e| format!("TTS daemon bad response: {}", e))
}

/// True if the daemon response carried `{"ok": true}`; else an Err with its message.
fn daemon_ok(resp: serde_json::Value) -> Result<(), String> {
    if resp.get("ok").and_then(|v| v.as_bool()).unwrap_or(false) {
        Ok(())
    } else {
        Err(resp
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown TTS daemon error")
            .to_string())
    }
}

/// Stop the daemon if one is running (used before uninstall/reinstall).
fn kill_daemon(app: &AppHandle) {
    if let Some(engine) = app.try_state::<TtsEngine>() {
        if let Ok(mut guard) = engine.0.lock() {
            if let Some(mut d) = guard.take() {
                let _ = d.child.kill();
            }
        }
    }
}

/// Start the daemon (if the engine is installed) and preload a language's model
/// so later synthesis is fast. Called from the front end at app launch. An error
/// here is harmless — the engine may simply not be installed yet, and the UI
/// keeps using the Web Speech fallback until it is.
#[tauri::command]
pub async fn tts_warmup(app: AppHandle, lang: Option<String>) -> Result<(), String> {
    let engine = app.state::<TtsEngine>();
    let mut guard = engine
        .0
        .lock()
        .map_err(|_| "TTS engine state poisoned".to_string())?;

    if guard.is_none() {
        *guard = Some(spawn_daemon(&app)?);
    }
    let daemon = guard.as_mut().unwrap();

    let lang = lang.unwrap_or_else(|| "en".to_string());
    let resp = daemon_exchange(daemon, &json!({ "cmd": "warm", "lang": lang }))?;
    daemon_ok(resp)
}

/// The distinct spoken languages the active user's cards actually use, so the
/// crawler can bake just those voices (not all six).
#[tauri::command]
pub fn get_used_tts_langs(state: State<DbState>) -> Result<Vec<String>, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let user = db::get_active_user(&conn)?.ok_or_else(|| "No active user".to_string())?;
    db::get_used_tts_langs(&conn, &user.id)
}

/// Which language voices are installed on disk (persisted when downloaded). The
/// crawler only bakes these; anything else is surfaced as "install in Settings".
#[tauri::command]
pub fn get_installed_tts_langs(state: State<DbState>) -> Result<Vec<String>, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(read_installed_langs(&conn))
}

fn read_installed_langs(conn: &rusqlite::Connection) -> Vec<String> {
    conn.query_row(
        "SELECT value FROM app_state WHERE key = 'tts_installed_langs'",
        [],
        |r| r.get::<_, String>(0),
    )
    .ok()
    .and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok())
    .unwrap_or_default()
}

/// Download the given language voice models **from Hugging Face**. This is the
/// ONLY place the engine is allowed to touch the network (install / Settings) —
/// study and baking always run offline. Each language's model is fetched into
/// the writable model cache and recorded as installed. Emits progress on
/// `tts-download-progress`.
#[tauri::command]
pub async fn download_tts_models(app: AppHandle, langs: Vec<String>) -> Result<(), String> {
    let engine = get_engine_exe(&app)?;
    if !engine.exists() {
        return Err("TTS engine not installed".to_string());
    }
    let cache = get_cache_dir(&app)?;
    fs::create_dir_all(&cache).map_err(|e| format!("Failed to create cache dir: {}", e))?;

    let total = langs.len().max(1);
    for (i, lang) in langs.iter().enumerate() {
        let _ = app.emit(
            "tts-download-progress",
            DownloadProgress {
                id: "models".to_string(),
                progress: i as f32 / total as f32,
                message: format!("Downloading {} voice…", lang),
            },
        );

        // Reuse the one-shot CLI online to pull the model into the cache (it
        // synths a throwaway clip as a side effect, which we delete).
        let tmp = cache.join(format!("_dl_{}.wav", lang));
        let mut cmd = Command::new(&engine);
        cmd.arg("--lang").arg(lang).arg("--out").arg(&tmp).arg("--text").arg("warm up");
        apply_model_env(&mut cmd, &app, false)?; // ONLINE — the one allowed exception
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);
        let status = cmd
            .status()
            .map_err(|e| format!("Failed to download {} voice: {}", lang, e))?;
        let _ = fs::remove_file(&tmp);
        if !status.success() {
            return Err(format!("Failed to download {} voice (exit {})", lang, status));
        }
    }

    // Record the installed set (union with what's already there).
    {
        let db = app.state::<DbState>();
        let conn = db.0.lock().map_err(|e| format!("Lock error: {}", e))?;
        let mut installed = read_installed_langs(&conn);
        for l in &langs {
            if !installed.contains(l) {
                installed.push(l.clone());
            }
        }
        let json = serde_json::to_string(&installed).map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO app_state (key, value) VALUES ('tts_installed_langs', ?1)",
            rusqlite::params![json],
        )
        .map_err(|e| format!("Failed to record installed voices: {}", e))?;
    }

    let _ = app.emit(
        "tts-download-progress",
        DownloadProgress {
            id: "models".to_string(),
            progress: 1.0,
            message: "Voices installed".to_string(),
        },
    );
    Ok(())
}

// ============================================
// Audio baking (pre-generate WAVs; study just plays files)
// ============================================

/// Spoken text for a card side — code is never read verbatim (mirrors the
/// front end's `textForSpeech`). Must stay in sync so cache keys match.
const CODE_SPEECH: &str = "Code snippet. See screen for details.";

fn synth_text(content: &str, content_type: &str) -> String {
    if content_type.eq_ignore_ascii_case("CODE") {
        CODE_SPEECH.to_string()
    } else {
        content.to_string()
    }
}

fn cache_has(app: &AppHandle, lang: &str, text: &str) -> Result<bool, String> {
    Ok(get_cache_dir(app)?.join(cache_filename(lang, text)).exists())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingItem {
    pub lang: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeckGenStatus {
    pub total: i64,
    pub pending: i64,
}

#[tauri::command]
pub fn get_tts_generation_enabled(state: State<DbState>) -> Result<bool, String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(conn
        .query_row(
            "SELECT value FROM app_state WHERE key = 'tts_generation_enabled'",
            [],
            |r| r.get::<_, String>(0),
        )
        .map(|v| v == "1")
        .unwrap_or(false))
}

#[tauri::command]
pub fn set_tts_generation_enabled(state: State<DbState>, enabled: bool) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    conn.execute(
        "INSERT OR REPLACE INTO app_state (key, value) VALUES ('tts_generation_enabled', ?1)",
        rusqlite::params![if enabled { "1" } else { "0" }],
    )
    .map_err(|e| format!("Failed to save setting: {}", e))?;
    Ok(())
}

/// Card sides (across the active user's content) whose audio isn't baked yet,
/// limited to installed languages. Deduped by (lang, synth-text). The front-end
/// crawler bakes these in batches.
#[tauri::command]
pub fn tts_pending(app: AppHandle, state: State<DbState>) -> Result<Vec<PendingItem>, String> {
    let (installed, sides) = {
        let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
        let user = db::get_active_user(&conn)?.ok_or_else(|| "No active user".to_string())?;
        (read_installed_langs(&conn), db::get_tts_sides(&conn, &user.id)?)
    };

    let mut seen: HashSet<(String, String)> = HashSet::new();
    let mut out = Vec::new();
    for (content, content_type, lang) in sides {
        if !installed.iter().any(|l| l == &lang) {
            continue;
        }
        let text = synth_text(&content, &content_type);
        if text.trim().is_empty() {
            continue;
        }
        if !seen.insert((lang.clone(), text.clone())) {
            continue;
        }
        if cache_has(&app, &lang, &text)? {
            continue;
        }
        out.push(PendingItem { lang, text });
    }
    Ok(out)
}

/// `(total, pending)` baked-audio counts for a library deck — drives the
/// per-deck "Generating audio N/M" indicator.
#[tauri::command]
pub fn tts_deck_status(
    app: AppHandle,
    state: State<DbState>,
    deck_id: String,
) -> Result<DeckGenStatus, String> {
    let (installed, sides) = {
        let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
        (read_installed_langs(&conn), db::get_deck_tts_sides(&conn, &deck_id)?)
    };

    let mut seen: HashSet<(String, String)> = HashSet::new();
    let mut total = 0i64;
    let mut pending = 0i64;
    for (content, content_type, lang) in sides {
        if !installed.iter().any(|l| l == &lang) {
            continue;
        }
        let text = synth_text(&content, &content_type);
        if text.trim().is_empty() {
            continue;
        }
        if !seen.insert((lang.clone(), text.clone())) {
            continue;
        }
        total += 1;
        if !cache_has(&app, &lang, &text)? {
            pending += 1;
        }
    }
    Ok(DeckGenStatus { total, pending })
}

/// Bake one language's batch of clips, then **evict** the model by stopping the
/// daemon — so no more than one model is ever resident. Best-effort per clip.
#[tauri::command]
pub async fn bake_tts(app: AppHandle, lang: String, texts: Vec<String>) -> Result<(), String> {
    for text in texts {
        let _ = synthesize_tts(app.clone(), text, lang.clone()).await;
    }
    kill_daemon(&app); // free the model's memory before the next language
    Ok(())
}

/// Delete cached WAVs no longer referenced by any current card side
/// (reference-aware GC — WAVs are shared by `(lang, text)`). Returns count removed.
#[tauri::command]
pub fn tts_gc(app: AppHandle, state: State<DbState>) -> Result<u64, String> {
    let sides = {
        let conn = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
        let user = db::get_active_user(&conn)?.ok_or_else(|| "No active user".to_string())?;
        db::get_tts_sides(&conn, &user.id)?
    };

    let mut keep: HashSet<String> = HashSet::new();
    for (content, content_type, lang) in sides {
        let text = synth_text(&content, &content_type);
        if text.trim().is_empty() {
            continue;
        }
        keep.insert(cache_filename(&lang, &text));
    }

    let cache = get_cache_dir(&app)?;
    let mut removed = 0u64;
    if let Ok(entries) = fs::read_dir(&cache) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".wav") && !keep.contains(&name) && fs::remove_file(entry.path()).is_ok() {
                removed += 1;
            }
        }
    }
    Ok(removed)
}

/// Synthesize `text` in `lang` to a cached WAV and return its absolute path.
/// Returns cached audio immediately when present; otherwise requires the engine
/// to be installed (errors if not, so the front end can fall back to Web Speech).
/// Prefers the persistent daemon and falls back to a one-shot process if the
/// daemon is unavailable or fails.
#[tauri::command]
pub async fn synthesize_tts(app: AppHandle, text: String, lang: String) -> Result<String, String> {
    let cache_dir = get_cache_dir(&app)?;
    fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("Failed to create cache dir: {}", e))?;

    let out_path = cache_dir.join(cache_filename(&lang, &text));
    let out_str = out_path.to_string_lossy().to_string();

    // Cache hit.
    if out_path.exists() {
        return Ok(out_str);
    }

    // Need the engine to generate a cache miss.
    let engine_exe = get_engine_exe(&app)?;
    if !engine_exe.exists() {
        return Err("TTS engine not installed".to_string());
    }

    // Preferred path: the persistent daemon (fast once warmed).
    {
        let engine = app.state::<TtsEngine>();
        let mut guard = engine
            .0
            .lock()
            .map_err(|_| "TTS engine state poisoned".to_string())?;
        if guard.is_none() {
            // Spawn lazily; if it fails, fall through to a one-shot run.
            if let Ok(d) = spawn_daemon(&app) {
                *guard = Some(d);
            }
        }
        if let Some(daemon) = guard.as_mut() {
            let req = json!({ "cmd": "synth", "lang": lang, "text": text, "out": out_str });
            match daemon_exchange(daemon, &req).and_then(daemon_ok) {
                Ok(()) if out_path.exists() => return Ok(out_str),
                Ok(()) => { /* reported ok but no file — fall through to one-shot */ }
                Err(_) => {
                    // Daemon errored or died: drop it so the next call respawns,
                    // then fall back to a one-shot run below.
                    if let Some(mut d) = guard.take() {
                        let _ = d.child.kill();
                    }
                }
            }
        }
    }

    // Fallback: one-shot process.
    let mut cmd = Command::new(&engine_exe);
    cmd.arg("--lang")
        .arg(&lang)
        .arg("--text")
        .arg(&text)
        .arg("--out")
        .arg(&out_path);
    apply_model_env(&mut cmd, &app, true)?; // never download on a synth
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let status = cmd
        .status()
        .map_err(|e| format!("Failed to run TTS engine: {}", e))?;

    if !status.success() {
        return Err(format!("TTS engine exited with status {}", status));
    }

    if !out_path.exists() {
        return Err("TTS engine did not produce an audio file".to_string());
    }

    Ok(out_str)
}
