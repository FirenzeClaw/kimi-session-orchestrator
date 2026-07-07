/**
 * Policy file store — load, list, and validate YAML policy files.
 *
 * Custom policies are stored as YAML files in <projectCwd>/.kimi-tunnel/policies/.
 * This module handles filesystem I/O and Zod validation.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename, extname, resolve } from "node:path";
import { load } from "js-yaml";
import type { Policy } from "./policy-types.js";
import { PolicySchema, isKnownTool, KNOWN_TOOLS } from "./policy-types.js";

// ── Types ───────────────────────────────────────────────────────────────────────

/** Result of loading/listing a policy file, including validation status. */
export interface PolicyFileInfo {
  name: string;
  file: string;
  version: string;
  rulesCount: number;
  valid: boolean;
  error?: string;
}

// ── Policy directory ────────────────────────────────────────────────────────────

const POLICIES_DIR = ".kimi-tunnel/policies";

function getPoliciesDir(cwd: string): string {
  return resolve(cwd, POLICIES_DIR);
}

// ── Load ────────────────────────────────────────────────────────────────────────

/**
 * Load and validate a single YAML policy file.
 * Returns the parsed Policy on success, or throws with a structured error.
 */
export function loadPolicyFile(filePath: string): Policy {
  const raw: unknown = load(readFileSync(filePath, "utf-8"));

  const parsed = PolicySchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`策略解析失败: ${filePath}\n${issues}`);
  }

  const data = parsed.data;

  // Validate tool names
  const unknownTools: string[] = [];
  for (const rule of data.rules) {
    for (const tool of rule.tools) {
      if (!isKnownTool(tool)) {
        unknownTools.push(`规则 "${rule.name}" 中的 "${tool}"`);
      }
    }
  }
  if (unknownTools.length > 0) {
    throw new Error(
      `策略文件 "${filePath}" 包含未知工具名:\n${unknownTools.map((t) => `  - ${t}`).join("\n")}\n已知工具: ${KNOWN_TOOLS.join(", ")}`
    );
  }

  // Transform snake_case from YAML to camelCase for internal Policy type
  const name = basename(filePath, extname(filePath));
  return {
    name,
    version: data.version,
    defaultAction: data.default_action,
    rules: data.rules.map((r) => ({
      name: r.name,
      action: r.action,
      tools: r.tools,
      message: r.message,
    })),
    source: "file",
    filePath,
  };
}

// ── List ────────────────────────────────────────────────────────────────────────

/**
 * Scan .kimi-tunnel/policies/ and return info for all YAML files found.
 * Returns empty array (no crash) if directory doesn't exist.
 */
export function listPolicyFiles(cwd: string): PolicyFileInfo[] {
  const dir = getPoliciesDir(cwd);

  if (!existsSync(dir)) {
    return [];
  }

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  if (entries.length === 0) {
    return [];
  }

  return entries
    .filter((f) => extname(f) === ".yaml" || extname(f) === ".yml")
    .map((f) => {
      const filePath = join(dir, f);
      try {
        const policy = loadPolicyFile(filePath);
        return {
          name: policy.name,
          file: `${POLICIES_DIR}/${f}`,
          version: policy.version,
          rulesCount: policy.rules.length,
          valid: true,
        };
      } catch (err) {
        return {
          name: basename(f, extname(f)),
          file: `${POLICIES_DIR}/${f}`,
          version: "?",
          rulesCount: 0,
          valid: false,
          error: (err as Error).message,
        };
      }
    });
}

// ── Validate ────────────────────────────────────────────────────────────────────

/**
 * Validate a policy object — check rules structure and tool name references.
 * Returns null if valid, or an error string describing the first issue found.
 */
export function validatePolicy(policy: Policy): string | null {
  if (!policy.name || policy.name.length === 0) {
    return "策略名称不能为空";
  }
  if (!policy.rules || policy.rules.length === 0) {
    if (policy.defaultAction === "deny") {
      return "默认动作为 deny 时，至少需要一条 allow 规则";
    }
    // full-access with no rules is valid
  }
  for (const rule of policy.rules) {
    if (!rule.tools || rule.tools.length === 0) {
      return `规则 "${rule.name}" 的工具列表不能为空`;
    }
    for (const tool of rule.tools) {
      if (!isKnownTool(tool)) {
        return `规则 "${rule.name}" 引用了未知工具 "${tool}"`;
      }
    }
  }
  return null;
}
