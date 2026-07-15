/**
 * Auto-detect Kimi Server URL from the lock file written by `kimi web`.
 * Validates that the lock PID is still alive; if stale, cleans the lock
 * and logs a diagnostic so users know to restart kimi web.
 *
 * Extracted from WireClient to give this concern its own module —
 * independent of any class, importable by poll-command, index, and WireClient.
 */

import { readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

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
 * Auto-detect Kimi Server URL from the lock file.
 * Validates that the lock PID is still alive; if stale, cleans the lock
 * and logs a diagnostic so users know to restart kimi web.
 */
export function detectKimiServerUrl(): string {
  try {
    const lockPath = join(homedir(), ".kimi-code", "server", "lock");
    const raw = readFileSync(lockPath, "utf-8");
    const info = JSON.parse(raw) as {
      host: string;
      port: number;
      pid?: number;
      started_at?: string;
    };

    // ── Stale lock detection ──────────────────────────────────────────
    if (info.pid && !isProcessAlive(info.pid)) {
      const age = info.started_at ? ` (started ${info.started_at})` : "";
      process.stderr.write(
        `[wire-client] Stale lock detected: PID ${info.pid} is no longer running${age}.\n` +
          `  The Kimi Server may have crashed or been killed — its lock file was left behind.\n` +
          `  Auto-cleaning stale lock and falling back to default port.\n` +
          `  Run "kimi web --no-open" to start the server, then /reload.\n`
      );
      try {
        unlinkSync(lockPath);
      } catch {
        /* best-effort cleanup */
      }
      return "http://127.0.0.1:5494";
    }
    // ──────────────────────────────────────────────────────────────────

    if (info.host && info.port) {
      return `http://${info.host}:${info.port}`;
    }
  } catch {
    // lock file not found or unreadable — normal when no server is running
  }
  return "http://127.0.0.1:5494";
}
