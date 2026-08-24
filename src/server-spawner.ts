/**
 * Auto-activate `kimi web` when the tunnel starts and no Kimi Server is reachable.
 *
 * v2.24 (FR-3): only runs at startup (index.ts connect failure). The spawned
 * process is detached — it outlives the tunnel and is NOT subject to any
 * background-task timeout. Concurrency is guarded by an atomic `mkdir` mutex:
 * only the first tunnel wins; the rest wait for that instance's lock file.
 *
 * The instance files under ~/.kimi-code/server/instances/ remain the single
 * source of truth for the server URL (read-only, see server-lock.ts).
 */

import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  rmdirSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createConnection } from "node:net";
import { detectKimiServerUrl } from "./server-lock.js";

const FALLBACK_URL = "http://127.0.0.1:5494";

/** Tunnel 数据目录（对齐 KIMI_CODE_HOME 的注入约定；默认 ~/.kimi-tunnel） */
export function tunnelDir(): string {
  return process.env.KIMI_TUNNEL_HOME || join(homedir(), ".kimi-tunnel");
}

function spawnLockPath(): string {
  return join(tunnelDir(), "spawn.lock");
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** TCP probe: is a server actually listening at this URL? */
export async function probeUrl(url: string, timeoutMs = 1500): Promise<boolean> {
  try {
    const u = new URL(url);
    const port = parseInt(u.port || "80", 10);
    return await new Promise<boolean>((resolve) => {
      const sock = createConnection({ host: u.hostname, port }, () => {
        sock.destroy();
        resolve(true);
      });
      sock.on("error", () => resolve(false));
      sock.setTimeout(timeoutMs, () => {
        sock.destroy();
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}

/**
 * Resolve the `kimi` executable path.
 * Priority: KIMI_BIN env → ~/.kimi-code/bin/kimi → PATH lookup ("kimi").
 */
export function resolveKimiBin(): string | null {
  if (process.env.KIMI_BIN) return process.env.KIMI_BIN;
  const known = join(
    process.env.KIMI_CODE_HOME || join(homedir(), ".kimi-code"),
    "bin",
    "kimi"
  );
  if (existsSync(known)) return known;
  return null; // caller falls back to PATH lookup
}

export interface SpawnResult {
  spawned: boolean;
  url: string;
}

/**
 * Ensure a reachable Kimi Server. Returns the server URL.
 *
 * Steps:
 *   1. Probe the current detected URL (instances file or fallback) — if
 *      reachable, return as-is (`spawned: false`).
 *   2. Atomic `mkdir ~/.kimi-tunnel/spawn.lock` — if it already exists,
 *      another tunnel is activating; wait for its instance file (≤ timeout).
 *   3. Exclusive winner spawns `kimi web --no-open` detached (stdio ignored,
 *      unref'd — immune to background-task timeouts).
 *   4. Poll for the instance file (≤ timeout, 1s interval) → return its URL.
 *   5. finally: remove the mutex so later activations can proceed.
 */
export async function spawnKimiWebIfNeeded(
  opts: { timeoutMs?: number } = {}
): Promise<SpawnResult> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const deadline = Date.now() + timeoutMs;

  // ── 1. Already reachable? ──────────────────────────────────────────
  const current = detectKimiServerUrl();
  if (await probeUrl(current)) {
    return { spawned: false, url: current };
  }

  // ── 2. Atomic mutex ────────────────────────────────────────────────
  try {
    mkdirSync(tunnelDir(), { recursive: true }); // spawn.lock 父目录必须存在（防 ENOENT 误判为他方激活）
    mkdirSync(spawnLockPath());
  } catch {
    // Someone else is activating — wait for their instance file
    while (Date.now() < deadline) {
      await sleep(1000);
      const url = detectKimiServerUrl();
      if (url !== FALLBACK_URL) return { spawned: false, url };
    }
    return { spawned: false, url: detectKimiServerUrl() };
  }

  try {
    // ── 3. Spawn detached kimi web ───────────────────────────────────
    const bin = resolveKimiBin() ?? "kimi";
    const child = spawn(bin, ["web", "--no-open"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();

    // ── 4. Wait for instance file ────────────────────────────────────
    while (Date.now() < deadline) {
      await sleep(1000);
      const url = detectKimiServerUrl();
      if (url !== FALLBACK_URL) return { spawned: true, url };
    }
    return { spawned: true, url: detectKimiServerUrl() };
  } finally {
    // ── 5. Release mutex ─────────────────────────────────────────────
    try {
      rmdirSync(spawnLockPath());
    } catch {
      /* best-effort */
    }
  }
}