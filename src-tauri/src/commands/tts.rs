use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

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

/// Point a spawned engine process at the writable model cache via `HF_HOME`, so
/// Hugging Face downloads/loads models there instead of the user's `~/.cache`.
fn apply_model_env(cmd: &mut Command, app: &AppHandle) -> Result<(), String> {
    let models = get_models_dir(app)?;
    fs::create_dir_all(&models).map_err(|e| format!("Failed to create models dir: {}", e))?;
    cmd.env("HF_HOME", &models);
    cmd.env("HF_HUB_DISABLE_SYMLINKS_WARNING", "1");
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
    apply_model_env(&mut cmd, app)?;
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
    apply_model_env(&mut cmd, &app)?;
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
