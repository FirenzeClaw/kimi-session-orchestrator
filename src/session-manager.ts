// Session management — thin delegation layer.
//
// File-system operations → session-store.ts
// Wire.jsonl parsing/analysis → session-log-reader.ts

export {
  type SessionInfo,
  listSessions,
  getSessionInfo,
  findSessionPath,
  getKimiCodeHome,
} from "./session-store.js";

export {
  type LogEntry,
  type SessionLog,
  type IORecord,
  type IORecordsResult,
  type SessionStatus,
  readSessionLog,
  listIORecords,
  pollSessionStatus,
  extractPromptText,
  truncateText,
} from "./session-log-reader.js";

// Legacy: direct wire.jsonl write (pre-API injection fallback)
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { getKimiCodeHome } from "./session-store.js";

export async function sendPromptToSession(
  sessionId: string,
  prompt: string
): Promise<{ success: boolean; message: string }> {
  const sessionsDir = join(getKimiCodeHome(), "sessions");

  try {
    const workdirs = await readdir(sessionsDir);

    for (const wd of workdirs) {
      if (!wd.startsWith("wd_")) continue;
      const sessionPath = join(sessionsDir, wd, sessionId);
      const statePath = join(sessionPath, "state.json");

      try {
        await stat(statePath);
      } catch {
        continue;
      }

      const wirePath = join(sessionPath, "agents", "main", "wire.jsonl");
      const entry = JSON.stringify({
        role: "user",
        content: prompt,
        timestamp: new Date().toISOString(),
        source: "debug-tunnel",
      });

      try {
        const { appendFile } = await import("node:fs/promises");
        await appendFile(wirePath, entry + "\n", "utf-8");
        return {
          success: true,
          message: `Prompt sent to session ${sessionId}`,
        };
      } catch (err) {
        return {
          success: false,
          message: `Failed to write wire file: ${(err as Error).message}`,
        };
      }
    }
  } catch (err) {
    return {
      success: false,
      message: `Failed to access sessions: ${(err as Error).message}`,
    };
  }

  return {
    success: false,
    message: `Session ${sessionId} not found`,
  };
}
