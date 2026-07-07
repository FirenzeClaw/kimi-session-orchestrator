/**
 * Built-in policy definitions — three standard permission levels.
 *
 * These are hard-coded to ensure consistency; custom policies are loaded
 * from YAML files in .kimi-tunnel/policies/.
 */

import type { Policy } from "./policy-types.js";

// ── read-only: inspect code & session state, no modifications ───────────────────

export const READONLY_POLICY: Policy = {
  name: "read-only",
  version: "1.0",
  defaultAction: "deny",
  source: "builtin",
  rules: [
    {
      name: "allow-read-tools",
      action: "allow",
      tools: ["Read", "Grep", "Glob", "WebSearch", "FetchURL"],
    },
    {
      name: "allow-status-tools",
      action: "allow",
      tools: [
        "list_sessions", "poll_session", "get_session_info",
        "list_io_records", "read_session_log", "get_tunnel_status",
        "list_templates", "list_workflow_templates",
      ],
    },
    {
      name: "block-writes",
      action: "deny",
      tools: ["Write", "Edit", "Bash", "TaskStop"],
      message: "此任务使用 read-only 策略，禁止写入文件或执行命令。如需修改，请联系 PM 调整策略。",
    },
  ],
};

// ── safe-edit: read + edit files, no shell execution ────────────────────────────

export const SAFEEDIT_POLICY: Policy = {
  name: "safe-edit",
  version: "1.0",
  defaultAction: "deny",
  source: "builtin",
  rules: [
    {
      name: "allow-read-tools",
      action: "allow",
      tools: ["Read", "Grep", "Glob", "WebSearch", "FetchURL"],
    },
    {
      name: "allow-status-tools",
      action: "allow",
      tools: [
        "list_sessions", "poll_session", "get_session_info",
        "list_io_records", "read_session_log", "get_tunnel_status",
        "list_templates", "list_workflow_templates",
      ],
    },
    {
      name: "allow-edit-tools",
      action: "allow",
      tools: ["Write", "Edit"],
    },
    {
      name: "deny-shell-and-exec",
      action: "deny",
      tools: ["Bash", "TaskStop"],
      message: "此任务使用 safe-edit 策略，禁止执行 shell 命令。如需构建或测试，请联系 PM。",
    },
  ],
};

// ── full-access: unrestricted ───────────────────────────────────────────────────

export const FULLACCESS_POLICY: Policy = {
  name: "full-access",
  version: "1.0",
  defaultAction: "allow",
  source: "builtin",
  rules: [],
};

// ── Lookup map ──────────────────────────────────────────────────────────────────

export const BUILTIN_POLICIES = new Map<string, Policy>([
  ["read-only", READONLY_POLICY],
  ["safe-edit", SAFEEDIT_POLICY],
  ["full-access", FULLACCESS_POLICY],
]);
