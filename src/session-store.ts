import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const KIMI_CODE_HOME = process.env.KIMI_CODE_HOME ||
  join(process.env.HOME || process.env.USERPROFILE || "C:/Users/FirenzeClaw", ".kimi-code");

export interface SessionInfo {
  id: string;
  workdir: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  agentCount: number;
  lastPrompt: string;
  wirePath: string;
}

interface StateJson {
  createdAt: string;
  updatedAt: string;
  title: string;
  agents: Record<string, { type: string; homedir: string }>;
  lastPrompt: string;
}

function extractWorkdir(sessionRelPath: string): string {
  const parts = sessionRelPath.replace(/\\/g, "/").split("/");
  const wdPart = parts.find((p) => p.startsWith("wd_")) || "";
  return wdPart.replace(/^wd_/, "").replace(/_/g, "/");
}

export async function listSessions(): Promise<SessionInfo[]> {
  const sessionsDir = join(KIMI_CODE_HOME, "sessions");
  const sessions: SessionInfo[] = [];

  try {
    const workdirs = await readdir(sessionsDir);

    for (const wd of workdirs) {
      if (!wd.startsWith("wd_")) continue;
      const wdPath = join(sessionsDir, wd);
      const wdStat = await stat(wdPath);
      if (!wdStat.isDirectory()) continue;

      const sessionDirs = await readdir(wdPath);
      for (const sd of sessionDirs) {
        if (!sd.startsWith("session_") && !sd.startsWith("ses_")) continue;
        const sessionPath = join(wdPath, sd);
        const statePath = join(sessionPath, "state.json");

        try {
          const stateRaw = await readFile(statePath, "utf-8");
          const state: StateJson = JSON.parse(stateRaw);

          sessions.push({
            id: sd,
            workdir: extractWorkdir(wd),
            title: state.title || "(untitled)",
            createdAt: state.createdAt,
            updatedAt: state.updatedAt,
            agentCount: Object.keys(state.agents || {}).length,
            lastPrompt: state.lastPrompt || "",
            wirePath: join(sessionPath, "agents", "main", "wire.jsonl"),
          });
        } catch {
          // Skip sessions with unreadable state
        }
      }
    }
  } catch {
    // sessions dir may not exist
  }

  sessions.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  return sessions;
}

export async function getSessionInfo(sessionId: string): Promise<SessionInfo | null> {
  const sessionsDir = join(KIMI_CODE_HOME, "sessions");

  try {
    const workdirs = await readdir(sessionsDir);

    for (const wd of workdirs) {
      if (!wd.startsWith("wd_")) continue;
      const wdPath = join(sessionsDir, wd);
      const sessionPath = join(wdPath, sessionId);
      const statePath = join(sessionPath, "state.json");

      try {
        const stateRaw = await readFile(statePath, "utf-8");
        const state: StateJson = JSON.parse(stateRaw);

        return {
          id: sessionId,
          workdir: extractWorkdir(wd),
          title: state.title || "(untitled)",
          createdAt: state.createdAt,
          updatedAt: state.updatedAt,
          agentCount: Object.keys(state.agents || {}).length,
          lastPrompt: state.lastPrompt || "",
          wirePath: join(sessionPath, "agents", "main", "wire.jsonl"),
        };
      } catch {
        continue;
      }
    }
  } catch {
    // sessions dir may not exist
  }

  return null;
}

export async function findSessionPath(sessionId: string): Promise<string | null> {
  const sessionsDir = join(KIMI_CODE_HOME, "sessions");

  try {
    const workdirs = await readdir(sessionsDir);

    for (const wd of workdirs) {
      if (!wd.startsWith("wd_")) continue;
      const sessionPath = join(sessionsDir, wd, sessionId);
      try {
        await stat(join(sessionPath, "state.json"));
        return sessionPath;
      } catch {
        continue;
      }
    }
  } catch {
    // sessions dir may not exist
  }

  return null;
}

export function getKimiCodeHome(): string {
  return KIMI_CODE_HOME;
}
