import { readFile, writeFile, unlink, readdir, stat, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { WorkflowTemplate } from "./workflow-template.js";
import { parseTemplate } from "./workflow-template.js";

// ── Path resolution ─────────────────────────────────────────────────────────────

const TEMPLATES_DIR = join(process.cwd(), "templates");

function templatePath(name: string, version?: string): string {
  // versioned: templates/<name>/<version>.yaml
  // unversioned: templates/<name>.yaml
  if (version) {
    return join(TEMPLATES_DIR, name, `${version}.yaml`);
  }
  return join(TEMPLATES_DIR, `${name}.yaml`);
}

async function ensureDir(): Promise<void> {
  await mkdir(TEMPLATES_DIR, { recursive: true });
}

// ── List ────────────────────────────────────────────────────────────────────────

/**
 * Scan templates/ directory and return all loaded WorkflowTemplate instances.
 * Supports both flat `templates/<name>.yaml` and versioned `templates/<name>/<version>.yaml` layouts.
 */
export async function listTemplates(): Promise<WorkflowTemplate[]> {
  await ensureDir();

  const templates: WorkflowTemplate[] = [];
  const entries = await readdir(TEMPLATES_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile() && (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml"))) {
      try {
        const raw = await readFile(join(TEMPLATES_DIR, entry.name), "utf-8");
        const t = parseTemplate(raw);
        templates.push(t);
      } catch {
        // Skip invalid templates
      }
    } else if (entry.isDirectory() && !entry.name.startsWith(".")) {
      // Versioned directory: templates/<name>/<version>.yaml
      const subEntries = await readdir(join(TEMPLATES_DIR, entry.name), { withFileTypes: true });
      for (const sub of subEntries) {
        if (sub.isFile() && (sub.name.endsWith(".yaml") || sub.name.endsWith(".yml"))) {
          try {
            const raw = await readFile(join(TEMPLATES_DIR, entry.name, sub.name), "utf-8");
            const t = parseTemplate(raw);
            templates.push(t);
          } catch {
            // Skip
          }
        }
      }
    }
  }

  return templates;
}

// ── Load ────────────────────────────────────────────────────────────────────────

/**
 * Load a single template by name. Supports optional version.
 * Tries versioned path first, then flat path.
 */
export async function loadTemplate(
  name: string,
  version?: string
): Promise<WorkflowTemplate | null> {
  await ensureDir();

  const pathsToTry: string[] = [];
  if (version) {
    pathsToTry.push(templatePath(name, version));
  }
  pathsToTry.push(templatePath(name));

  for (const p of pathsToTry) {
    try {
      await stat(p);
      const raw = await readFile(p, "utf-8");
      return parseTemplate(raw);
    } catch {
      continue;
    }
  }

  return null;
}

// ── Save ────────────────────────────────────────────────────────────────────────

/**
 * Save a WorkflowTemplate to a YAML file.
 * Ensures createdAt/updatedAt timestamps.
 */
export async function saveTemplate(t: WorkflowTemplate): Promise<void> {
  await ensureDir();

  const now = new Date().toISOString();
  const template = {
    ...t,
    createdAt: t.createdAt || now,
    updatedAt: now,
  };

  const yaml = toYaml(template);
  const targetPath = templatePath(t.name);

  // Ensure parent dir exists (for versioned paths this matters)
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, yaml, "utf-8");
}

// ── Delete ──────────────────────────────────────────────────────────────────────

export async function deleteTemplate(name: string, version?: string): Promise<boolean> {
  await ensureDir();

  try {
    const targetPath = templatePath(name, version);
    await unlink(targetPath);

    // Clean up empty version directories
    if (version) {
      const dir = dirname(targetPath);
      const remaining = await readdir(dir);
      if (remaining.length === 0) {
        try {
          await (await import("node:fs/promises")).rmdir(dir);
        } catch {
          // Dir might have hidden files; that's fine
        }
      }
    }

    return true;
  } catch {
    return false;
  }
}

// ── YAML serializer (minimal, avoids dependency on js-yaml dump) ─────────────────

function toYaml(template: WorkflowTemplate): string {
  const lines: string[] = [
    `# Workflow Template: ${template.name}`,
    `# Version: ${template.version}`,
    `# Generated: ${new Date().toISOString()}`,
    "",
    `name: "${escapeYaml(template.name)}"`,
    `version: "${escapeYaml(template.version)}"`,
    `projectCwd: "${escapeYaml(template.projectCwd)}"`,
    `description: "${escapeYaml(template.description || "")}"`,
  ];

  if (template.specDocs.length > 0) {
    lines.push("specDocs:");
    for (const doc of template.specDocs) {
      lines.push(`  - "${escapeYaml(doc)}"`);
    }
  } else {
    lines.push("specDocs: []");
  }

  lines.push("");
  lines.push("steps:");

  for (const step of template.steps) {
    lines.push(`  - id: "${escapeYaml(step.id)}"`);
    // instruction may contain special chars; wrap in quotes and escape
    lines.push(`    instruction: "${escapeYaml(step.instruction)}"`);
    if (step.expectedOutcome) {
      lines.push(`    expectedOutcome: "${escapeYaml(step.expectedOutcome)}"`);
    }
    if (step.maxRetries !== undefined) {
      lines.push(`    maxRetries: ${step.maxRetries}`);
    }
  }

  lines.push("");
  lines.push("blockagePolicy:");
  lines.push("  autoResolve:");
  if (template.blockagePolicy.autoResolve.length > 0) {
    for (const bt of template.blockagePolicy.autoResolve) {
      lines.push(`    - ${bt}`);
    }
  } else {
    lines.push("    []");
  }
  lines.push(`  maxRetriesPerStep: ${template.blockagePolicy.maxRetriesPerStep}`);

  lines.push("");
  lines.push("timeout:");
  lines.push(`  perStep: ${template.timeout.perStep}`);
  lines.push(`  total: ${template.timeout.total}`);

  if (template.createdAt) {
    lines.push("");
    lines.push(`createdAt: "${template.createdAt}"`);
  }
  if (template.updatedAt) {
    lines.push(`updatedAt: "${template.updatedAt}"`);
  }

  return lines.join("\n") + "\n";
}

function escapeYaml(s: string): string {
  // Escape backslash first, then double-quote, then other YAML-sensitive characters
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
  // For bare values containing ": " or " #", the caller wraps them in quotes, so
  // these don't need additional escaping.
}
