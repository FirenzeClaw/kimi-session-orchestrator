/**
 * Shared tool helpers — eliminate duplicated memory injection, policy binding,
 * and connection check across tool files.
 *
 * v2.10: Extracted from execute-prompt.ts, chat-with-session.ts, create-session.ts,
 * and workflow-engine.ts (~25 lines each × 4 = ~100 lines saved).
 */

import type { TunnelServices } from "../types.js";

export interface PreparePromptOpts {
  sessionId: string;
  prompt: string;
  skipMemory?: boolean;
  policy?: string;
  cwd?: string;  // used for policy resolution
}

/**
 * Prepare a prompt with optional memory injection and policy binding.
 * Returns the effective prompt text (possibly augmented with injected memory).
 *
 * Side-effects:
 * - Binds a policy to the session if `policy` is specified.
 * - Reads and injects shared memory if `skipMemory` is false and a profile exists.
 */
export function preparePrompt(
  services: TunnelServices,
  opts: PreparePromptOpts
): string {
  const { wireClient, memoryStore, tunnelProjectRoot } = services;
  const { sessionId, prompt, skipMemory, policy, cwd } = opts;

  // Bind policy if specified (non-fatal on failure)
  if (policy) {
    try {
      wireClient.setSessionPolicy(sessionId, policy, cwd);
    } catch {
      // Non-fatal: policy binding failure shouldn't block prompt submission
    }
  }

  // Build effective prompt with optional memory injection (SPEC 002)
  let effectivePrompt = prompt;
  if (!skipMemory && memoryStore && tunnelProjectRoot) {
    const profile = memoryStore.getMemoryProfile(sessionId);
    if (profile && profile.level !== "off") {
      try {
        memoryStore.ensureDb(tunnelProjectRoot);
        const injection = memoryStore.buildInjection({
          level: profile.level as "off" | "minimal" | "standard" | "full",
          maxBytes: 8192,
          fromSession: profile.fromSession,
          cwd: profile.cwd,
          hasExpiredEntries: profile.hasExpiredEntries,
        });
        if (injection) {
          const warning = profile.hasExpiredEntries
            ? "⚠️ 警告: 以下注入的部分条目已被 PM 标记为过期，内容可能不是最新。\n\n"
            : "";
          effectivePrompt = `${warning}${injection}\n\n---\n\n${prompt}`;
        }
      } catch {
        // Non-fatal: memory injection failure shouldn't block prompt submission
      }
    }
  }

  return effectivePrompt;
}

/**
 * Ensure the wire client is connected. Tries a single connect() attempt.
 * Returns true if connected, false otherwise.
 */
export async function ensureConnected(
  services: TunnelServices
): Promise<boolean> {
  const { wireClient } = services;
  if (wireClient.isConnected()) return true;
  try {
    await wireClient.connect();
    return wireClient.isConnected();
  } catch {
    return false;
  }
}
