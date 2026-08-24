/**
 * Discover the Kimi Server URL from the instance files written by `kimi web`.
 *
 * v2.24 (read-only): the lock file is treated purely as a port hint — PID
 * liveness / heartbeat freshness checks and auto-cleanup (unlink) are removed.
 * A stale instance file (server exited but file left behind) is harmless:
 * the wire connection attempt will fail, and the server-spawner activation
 * flow (FR-3) covers that case by spawning a fresh `kimi web`.
 *
 * Compatibility:
 *   - 0.29+: server/instances/<id>.json ONLY (legacy lock file removed)
 *   - 0.28 : server/instances/<id>.json (multi-instance) + server/lock (legacy)
 *   - <0.28: server/lock (legacy single-instance)
 *
 * Modification history:
 *   2026-08-24 | kimi-code (fix) | v2.24 只读化：删除 PID 活性/心跳新鲜度检测与陈旧文件自动清理
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/** Kimi Code 数据目录（对齐 session-store.ts 的 KIMI_CODE_HOME 约定，测试可注入） */
function kimiCodeHome(): string {
  return process.env.KIMI_CODE_HOME || join(homedir(), ".kimi-code");
}

export interface LockInfo {
  host: string;
  port: number;
  pid?: number;
  /** Server start time (0.28-: string; 0.29+: epoch ms number). */
  started_at?: number | string;
  /** Last heartbeat epoch ms (0.29+ instances/ only). Present but not validated. */
  heartbeat_at?: number;
}

/**
 * Parse a lock file. Read-only: returns LockInfo when host+port are present,
 * null otherwise. No staleness checks, no cleanup.
 */
function parseLockFile(lockPath: string): LockInfo | null {
  try {
    const raw = readFileSync(lockPath, "utf-8");
    const info = JSON.parse(raw) as LockInfo;
    if (info.host && info.port) {
      return info;
    }
  } catch {
    // lock file not found or unreadable — normal when no server is running
  }
  return null;
}

/**
 * Discover the Kimi Server URL from the lock file(s).
 *
 * Priority:
 *   1. Legacy format: ~/.kimi-code/server/lock (single file, <0.29)
 *   2. Multi-instance format: ~/.kimi-code/server/instances/<id>.json (0.28+; 0.29+ ONLY)
 *   3. Fallback: http://127.0.0.1:5494
 *
 * Returns the first readable instance file. Does not delete or modify anything.
 */
export function detectKimiServerUrl(): string {
  const serverDir = join(kimiCodeHome(), "server");

  // ── 1. Legacy format: server/lock (<0.29) ─────────────────────────
  const legacyLockPath = join(serverDir, "lock");
  const legacy = parseLockFile(legacyLockPath);
  if (legacy) {
    return `http://${legacy.host}:${legacy.port}`;
  }

  // ── 2. Multi-instance format: server/instances/<id>.json (0.28+) ─
  const instancesDir = join(serverDir, "instances");
  try {
    const entries = readdirSync(instancesDir);
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const instance = parseLockFile(join(instancesDir, entry));
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