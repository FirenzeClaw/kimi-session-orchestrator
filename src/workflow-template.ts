import { z } from "zod";
import { load as parseYaml } from "js-yaml";

// ── Enums ───────────────────────────────────────────────────────────────────────

export const BlockageTypeEnum = z.enum([
  "dependency_missing",
  "file_not_found",
  "permission_denied",
  "timeout",
  "ambiguous",
  "tool_approval",
]);
export type BlockageType = z.infer<typeof BlockageTypeEnum>;

export const ExecutionStatusEnum = z.enum([
  "pending",
  "running",
  "awaiting_user",
  "completed",
  "failed",
  "cancelled",
]);
export type ExecutionStatus = z.infer<typeof ExecutionStatusEnum>;

// ── Zod Schemas ─────────────────────────────────────────────────────────────────

const BlockagePolicySchema = z.object({
  autoResolve: z.array(BlockageTypeEnum),
  maxRetriesPerStep: z.number().int().min(0),
});

const TimeoutConfigSchema = z.object({
  perStep: z.number().int().min(10000),
  total: z.number().int().min(60000),
});

const WorkflowStepSchema = z.object({
  id: z.string().min(1),
  instruction: z.string().min(1),
  expectedOutcome: z.string().optional(),
  onBlockage: z
    .object({
      type: BlockageTypeEnum,
      action: z.enum(["retry", "skip", "ask_user"]),
    })
    .optional(),
  maxRetries: z.number().int().min(0).optional(),
});

export const WorkflowTemplateSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  projectCwd: z.string().min(1),
  specDocs: z.array(z.string()),
  steps: z.array(WorkflowStepSchema).min(1),
  blockagePolicy: BlockagePolicySchema,
  timeout: TimeoutConfigSchema,
  description: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// ── Interfaces (derived from Zod) ───────────────────────────────────────────────

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
export type BlockagePolicy = z.infer<typeof BlockagePolicySchema>;
export type TimeoutConfig = z.infer<typeof TimeoutConfigSchema>;
export type WorkflowTemplate = z.infer<typeof WorkflowTemplateSchema>;

// ── Runtime Types ───────────────────────────────────────────────────────────────

export interface BlockageEvent {
  type: BlockageType;
  context: string;
  resolved: boolean;
  resolution: string;
  needsUserDecision: boolean;
}

export interface StepResult {
  stepId: string;
  stepIndex: number;
  instruction: string;
  response: string;
  thinkingSummary: string;
  status: "ok" | "adjusted" | "blocked" | "failed";
  adjustment: string;
  blockages: BlockageEvent[];
}

export interface WorkflowExecution {
  id: string;
  template: WorkflowTemplate;
  sessionId: string;
  currentStep: number;
  stepResults: StepResult[];
  status: ExecutionStatus;
  startTime: number;
  blockageQueue: BlockageEvent[];
}

export interface WorkflowResult {
  executionId: string;
  template: string;
  sessionId: string;
  status: ExecutionStatus;
  steps: StepResult[];
  summary: string;
  totalDuration: number;
  nextStepOptions?: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ── Parse & Validate ────────────────────────────────────────────────────────────

/**
 * Parse a YAML string into a WorkflowTemplate, validated against Zod schema.
 */
export function parseTemplate(yaml: string): WorkflowTemplate {
  const raw = parseYaml(yaml);
  if (raw === null || raw === undefined) {
    throw new Error("Template YAML is empty");
  }
  if (typeof raw !== "object") {
    throw new Error("Template YAML must be an object");
  }
  return WorkflowTemplateSchema.parse(raw);
}

/**
 * Validate a WorkflowTemplate, returning detailed errors and warnings.
 */
export function validateTemplate(t: WorkflowTemplate): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Structural checks
  if (!t.name || t.name.trim().length === 0) {
    errors.push("Template name is required");
  }

  if (!t.steps || t.steps.length === 0) {
    errors.push("At least one step is required");
  } else {
    const stepIds = new Set<string>();
    for (let i = 0; i < t.steps.length; i++) {
      const step = t.steps[i];
      if (!step.id) {
        errors.push(`Step ${i + 1}: missing id`);
      } else if (stepIds.has(step.id)) {
        errors.push(`Step ${i + 1}: duplicate id "${step.id}"`);
      } else {
        stepIds.add(step.id);
      }
      if (!step.instruction || step.instruction.trim().length === 0) {
        errors.push(`Step ${i + 1} ("${step.id}"): instruction is required`);
      }
    }
  }

  // CWD check — warn if suspicious
  if (t.projectCwd && !/^[A-Za-z]:[\\/]|^\//.test(t.projectCwd)) {
    warnings.push(`projectCwd "${t.projectCwd}" does not look like an absolute path`);
  }

  // Spec docs check
  if (t.specDocs && t.specDocs.length === 0) {
    warnings.push("No specDocs defined; consider adding project specification documents");
  }

  // Timeout sanity
  if (t.timeout) {
    if (t.timeout.perStep < 10000) {
      warnings.push(`perStep timeout (${t.timeout.perStep}ms) is very low`);
    }
    if (t.timeout.total < t.timeout.perStep * t.steps.length) {
      warnings.push(
        `Total timeout (${t.timeout.total}ms) may be insufficient for ${t.steps.length} steps at ${t.timeout.perStep}ms each`
      );
    }
  }

  // Blockage policy
  if (t.blockagePolicy) {
    for (const bt of t.blockagePolicy.autoResolve) {
      if (!BlockageTypeEnum.options.includes(bt)) {
        errors.push(`Unknown blockage type in autoResolve: "${bt}"`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
