#!/usr/bin/env node
/**
 * Launch `tauri dev` fully isolated inside the project.
 *
 * All Kioku data (DB, demo, images, TTS engine/models/audio cache) lives under
 * `kioku-desktop/.dev-data` via KIOKU_DATA_DIR. There is no installed production
 * app, so on first run we simply **relocate** whatever dev data currently sits in
 * `%AppData%\Roaming\Kioku` into `.dev-data` (a move, not a copy) and leave
 * app-data empty. After that, dev is self-contained and never touches app-data.
 *
 * See docs/TTS-DEV-SETUP.md.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, ".."); // kioku-desktop/
const dataDir = path.join(root, ".dev-data");
const exeName = process.platform === "win32" ? "kioku-tts.exe" : "kioku-tts";

const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
const kiokuAppData = path.join(appData, "Kioku");
// Fallback engine source (the frozen dev build in the sibling melotts workspace).
const engineSrc = path.resolve(root, "..", "melotts", "dist", "kioku-tts");

fs.mkdirSync(dataDir, { recursive: true });

/** Move `name` out of app-data into .dev-data (one-time), unless already there. */
function relocate(name) {
  const src = path.join(kiokuAppData, name);
  const dst = path.join(dataDir, name);
  if (fs.existsSync(dst) || !fs.existsSync(src)) return;
  console.log(`[dev-sandbox] Moving ${name} from app-data into .dev-data…`);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  try {
    fs.renameSync(src, dst); // instant on the same volume
  } catch {
    fs.cpSync(src, dst, { recursive: true }); // cross-volume fallback
    fs.rmSync(src, { recursive: true, force: true });
  }
}

// One-time migration: pull existing dev data into the project.
["kioku.db", "images", "tts"].forEach(relocate);

// Tidy: remove the now-empty app-data Kioku dir (ignore if non-empty/missing).
try {
  if (fs.existsSync(kiokuAppData) && fs.readdirSync(kiokuAppData).length === 0) {
    fs.rmdirSync(kiokuAppData);
  }
} catch {
  /* leave it */
}

// If there's still no engine (nothing relocated), copy the frozen dev build in.
const engineExe = path.join(dataDir, "tts", "engine", exeName);
if (!fs.existsSync(engineExe) && fs.existsSync(engineSrc)) {
  console.log("[dev-sandbox] Seeding TTS engine from melotts/dist…");
  fs.mkdirSync(path.join(dataDir, "tts"), { recursive: true });
  fs.cpSync(engineSrc, path.join(dataDir, "tts", "engine"), { recursive: true });
}

const env = { ...process.env, KIOKU_DATA_DIR: dataDir };
console.log(`[dev-sandbox] KIOKU_DATA_DIR=${dataDir}`);
console.log("[dev-sandbox] All dev data is contained in kioku-desktop/.dev-data (git-ignored); %AppData% is left empty.");

const child = spawn("npm", ["run", "tauri:dev"], { stdio: "inherit", env, shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
