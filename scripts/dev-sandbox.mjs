#!/usr/bin/env node
/**
 * Launch `tauri dev` fully isolated from the installed/production app.
 *
 * Everything Kioku writes (DB, demo data, images, TTS engine/models/audio cache)
 * is redirected under `kioku-desktop/.dev-data` via KIOKU_DATA_DIR, so dev never
 * reads or writes `%AppData%\Roaming\Kioku`. On first run it seeds the engine and
 * voice models from existing local copies so dev doesn't re-download several GB.
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

// The frozen engine lives in the sibling melotts workspace (a dev build, not the
// installed app). Copy it IN so the whole dev env is contained in kioku-desktop.
const engineSrc = path.resolve(root, "..", "melotts", "dist", "kioku-tts");
const engineDst = path.join(dataDir, "tts", "engine");

const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
const modelsSrc = path.join(appData, "Kioku", "tts", "models");
const modelsDst = path.join(dataDir, "tts", "models");

fs.mkdirSync(dataDir, { recursive: true });

/** One-time local copy of `src` dir → `dst` dir, skipped if `presentPath` exists. */
function seed(label, src, dst, presentPath) {
  if (fs.existsSync(presentPath)) return;
  if (!fs.existsSync(src)) {
    console.log(`[dev-sandbox] ${label}: no local source (${src}) — skipping; dev will behave as if it isn't installed yet.`);
    return;
  }
  console.log(`[dev-sandbox] Seeding ${label} into .dev-data (one-time local copy; may take a minute)…`);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
  console.log(`[dev-sandbox] ${label} ready.`);
}

seed("TTS engine (~2.5 GB)", engineSrc, engineDst, path.join(engineDst, exeName));
seed("TTS voices (~2.7 GB)", modelsSrc, modelsDst, modelsDst);

const env = { ...process.env, KIOKU_DATA_DIR: dataDir };
console.log(`[dev-sandbox] KIOKU_DATA_DIR=${dataDir}`);
console.log("[dev-sandbox] All dev data is contained in kioku-desktop/.dev-data (git-ignored); %AppData% is untouched.");

const child = spawn("npm", ["run", "tauri:dev"], { stdio: "inherit", env, shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
