/**
 * Auto-detect Kimi Server URL from the lock file written by `kimi web`.
 * Validates that the lock PID is still alive; if stale, cleans the lock
 * and logs a diagnostic so users know to restart kimi web.
 *
 * Compatibility:
 *   - 0.29+: server/instances/<id>.json ONLY (legacy lock file removed)
 *   - 0.28 : server/instances/<id>.json (multi-instance) + server/lock (legacy)
 *   - <0.28: server/lock (legacy single-instance)
 *
 * Extracted from WireClient to give this concern its own module —
 * independent of any class, importable by poll-command, index, and WireClient.
 */

import { readFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface LockInfo {
  host: string;
  port: number;
  pid?: number;
  /** Server start time (0.28-: string; 0.29+: epoch ms number). */
  started_at?: number | string;
  /** Last heartbeat epoch ms (0.29+ instances/ only). Absent → skip freshness check. */
  heartbeat_at?: number;
}

/** Check if a process with the given PID is currently alive (cross-platform). */
function isProcessAlive(pid: number): boolean {
  try {
    // signal 0 is a no-op that checks existence; throws if PID not found
    process.kill(pid, 0);
    return true;
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    return err.code !== "ESRCH";
  }
}

/**
 * Parse and validate a lock file. Returns LockInfo if the lock is valid
 * (file readable, JSON well-formed, PID alive, heartbeat fresh), or null if stale.
 */
function parseLockFile(lockPath: string, label: string): LockInfo | null {
  // Staleness threshold for heartbeat-based detection (0.29+ instances/ only).
  const HEARTBEAT_STALE_MS = 30_000;

  try {
    const raw = readFileSync(lockPath, "utf-8");
    const info = JSON.parse(raw) as LockInfo;

    // ── PID staleness: process no longer running ──────────────────
    if (info.pid && !isProcessAlive(info.pid)) {
      const age = info.started_at ? ` (started ${info.started_at})` : "";
      process.stderr.write(
        `[wire-client] Stale ${label} lock detected: PID ${info.pid} is no longer running${age}.\n` +
          `  Auto-cleaning stale lock and falling back to default port.\n` +
          `  Run "kimi web --no-open" to start the server, then /reload.\n`
      );
      try { unlinkSync(lockPath); } catch { /* best-effort cleanup */ }
      return null;
    }

    // ── Heartbeat staleness (0.29+ instances/ only) ───────────────
    if (info.heartbeat_at) {
      const ageMs = Date.now() - info.heartbeat_at;
      if (ageMs > HEARTBEAT_STALE_MS) {
        process.stderr.write(
          `[wire-client] Stale ${label} lock detected: ` +
          `heartbeat ${Math.round(ageMs / 1000)}s old (threshold ${HEARTBEAT_STALE_MS / 1000}s).\n` +
          `  Server PID ${info.pid ?? "?"} may be hung. Cleaning stale instance file.\n` +
          `  Run "kimi web --no-open" to restart, then /reload.\n`
        );
        try { unlinkSync(lockPath); } catch { /* best-effort cleanup */ }
        return null;
      }
    }

    if (info.host && info.port) {
      return info;
    }
  } catch {
    // lock file not found or unreadable — normal when no server is running
  }
  return null;
}

/**
 * Auto-detect Kimi Server URL from the lock file(s).
 *
 * Priority:
 *   1. Legacy format: ~/.kimi-code/server/lock (single file, <0.29)
 *   2. Multi-instance format: ~/.kimi-code/server/instances/<id>.json (0.28+; 0.29+ ONLY)
 *   3. Fallback: http://127.0.0.1:5494
 *
 * For each valid instance found, validates the PID is alive,
 * cleans stale locks, and returns the first live server URL.
 */
export function detectKimiServerUrl(): string {
  const serverDir = join(homedir(), ".kimi-code", "server");

  // ── 1. Legacy format: server/lock (<0.29) ─────────────────────────
  const legacyLockPath = join(serverDir, "lock");
  const legacy = parseLockFile(legacyLockPath, "legacy");
  if (legacy) {
    return `http://${legacy.host}:${legacy.port}`;
  }

  // ── 2. Multi-instance format: server/instances/<id>.json (0.28+) ─
  const instancesDir = join(serverDir, "instances");
  try {
    const entries = readdirSync(instancesDir);
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const instancePath = join(instancesDir, entry);
      const instance = parseLockFile(instancePath, `instance "${entry}"`);
      if (instance) {
        return `http://${instance.host}:${instance.port}`;
      }
    }
  } catch {
    // instances/ directory not found — no multi-instance servers running
  }

  // ── 3. Fallback ───────────────────────────────────────────────────
  return "http://127.0.0.1:5494";
}
