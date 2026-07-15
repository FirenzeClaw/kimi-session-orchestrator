import { readFile, writeFile, unlink, readdir, stat, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { load as parseYaml, dump as dumpYaml } from "js-yaml";
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

  const yaml = dumpYaml(template, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    forceQuotes: false,
  });
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

