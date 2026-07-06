# Implementation Plan: 自适应工作流引擎

**Feature**: `001-adaptive-workflow-engine`
**Plan**: `specs/001-adaptive-workflow-engine/plan.md`
**Date**: 2026-07-06

---

## Technical Context

| Aspect | Decision |
|--------|----------|
| **Language** | TypeScript 5.6 (strict, ES2022, Node16) |
| **Runtime** | Node.js ≥ 18 |
| **Persistence** | YAML files in `templates/` directory |
| **Real-time** | WebSocket via existing `ws` + `message-queue` |
| **Session API** | Kimi Server REST API (existing `WireClient`) |
| **MCP SDK** | `@modelcontextprotocol/sdk` 1.12 |
| **Validation** | Zod 3 (existing) |

## Constitution Check

| Rule | Compliance |
|------|-----------|
| DI via TunnelServices | ✅ `WorkflowEngine` injected through `TunnelServices` |
| Deep modules | ✅ `WorkflowEngine` — single `execute(template, sessionId)` public method, complex internal state machine |
| Single responsibility | ✅ `workflow-template.ts` (parse/validate), `workflow-engine.ts` (execute), `workflow-store.ts` (persist) |
| No `any` | ✅ All types explicit |
| Guard clauses ≤ 3 | ✅ Step driver uses early returns for each block type |
| Seam validation | ✅ `WorkflowTemplate` — YAML filesystem (prod) + inline object (test mock) |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     统筹 Session (MCP)                    │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │ learn_      │  │ execute_     │  │ workflow_      │ │
│  │ workflow    │  │ workflow     │  │ console.html   │ │
│  └──────┬──────┘  └──────┬───────┘  └───────┬────────┘ │
│         │                │                   │          │
│  ┌──────┴────────────────┴───────────────────┴────────┐ │
│  │              WorkflowEngine                         │ │
│  │  ┌──────────┐  ┌───────────┐  ┌─────────────────┐ │ │
│  │  │ Template │  │ Step      │  │ Blockage        │ │ │
│  │  │ Parser   │  │ Driver    │  │ Handler         │ │ │
│  │  └──────────┘  └───────────┘  └─────────────────┘ │ │
│  └──────────────────────┬─────────────────────────────┘ │
│                         │                                │
│  ┌──────────────────────┴─────────────────────────────┐ │
│  │              TunnelServices (DI)                    │ │
│  │  wireClient │ messageQueue │ sessionLogReader      │ │
│  └──────────────────────┬─────────────────────────────┘ │
└─────────────────────────┼───────────────────────────────┘
                          │ REST API
                   ┌──────┴──────┐
                   │ Kimi Server │
                   └──────┬──────┘
                          │
                   ┌──────┴──────┐
                   │ 任务 Session │
                   └─────────────┘
```

## Module Design

### Phase 1: Core Foundation (files to create/modify)

#### 1. `src/workflow-template.ts` — Template Definition & Parser

```typescript
// Interface
interface WorkflowTemplate {
  name: string;
  version: string;
  projectCwd: string;
  specDocs: string[];        // 规范文档路径
  steps: WorkflowStep[];
  blockagePolicy: BlockagePolicy;
  timeout: { perStep: number; total: number };
}

interface WorkflowStep {
  id: string;
  instruction: string;       // 下发给任务 session 的指令
  expectedOutcome?: string;  // 预期产出关键词（用于判断完成）
  onBlockage?: BlockageAction;
  maxRetries?: number;
}

// Functions
parseTemplate(yaml: string): WorkflowTemplate
validateTemplate(t: WorkflowTemplate): ValidationResult
```

#### 2. `src/workflow-store.ts` — Template Persistence

```typescript
// Functions
listTemplates(): Promise<WorkflowTemplate[]>
loadTemplate(name: string): Promise<WorkflowTemplate>
saveTemplate(t: WorkflowTemplate): Promise<void>
deleteTemplate(name: string): Promise<void>
```

#### 3. `src/workflow-engine.ts` — Execution Engine

```typescript
class WorkflowEngine {
  constructor(services: TunnelServices)
  
  async execute(
    template: WorkflowTemplate,
    options: { autoMode: boolean; onProgress: ProgressCallback }
  ): Promise<WorkflowResult>
  
  // Internal
  private async driveStep(step, sessionId): Promise<StepResult>
  private async handleBlockage(event, sessionId): Promise<BlockageResolution>
  private async checkAmbiguity(stepResult): Promise<boolean>
}
```

#### 4. `src/tools/learn-workflow.ts` — MCP Tool: Learn

```typescript
// MCP Tool: learn_workflow
// Parameters: session_id? | description? | name | cwd | spec_docs
// Extracts workflow from session history or verbal description
// Saves as YAML template
```

#### 5. `src/tools/execute-workflow.ts` — MCP Tool: Execute

```typescript
// MCP Tool: execute_workflow
// Parameters: template_name | cwd | auto_mode
// Loads template, creates session, drives steps sequentially
// Pushes progress via WebSocket to console page
```

#### 6. `src/public/workflow-console.html` — Web Monitoring Page

```html
<!-- Enhanced console with workflow-specific panels -->
<!-- Connects via WebSocket to /ws -->
<!-- Displays: template name, current step, session status, alerts -->
```

### Phase 2: Step Driver (detail)

The step driver is the core loop:

```
for each step in template.steps:
  1. Submit instruction via wireClient.sendPrompt(step.instruction, {autoApprove})
  2. Wait for session idle (status endpoint, NOT poll_session)
  3. Read response via list_io_records(limit=1)
  4. Classify response:
     - "done" pattern → next step
     - ambiguous → read thinking chain → re-classify
     - blocked → handleBlockage()
  5. If blocked and unresolvable → pause, notify user
  6. Push progress to WebSocket
```

### Phase 3: Blockage Handler

| Blockage Type | Detection Pattern | Auto-Handle | Fallback |
|--------------|-------------------|-------------|----------|
| dependency_missing | "command not found" / "module not found" | Send: "请先安装缺失的依赖" | Ask user |
| file_not_found | "No such file" / "ENOENT" | Send: "请确认文件路径，或检查项目结构" | Ask user |
| permission_denied | "EACCES" / "Permission denied" | — | Ask user |
| timeout | sendPrompt timeout | Retry once | Ask user |
| ambiguous | 模糊词检测（同 orchestrateTask） | Read thinking | Ask user |

## Implementation Steps

### Step 1: Template Types + Parser + Store
**Files**: `src/workflow-template.ts`, `src/workflow-store.ts`
**Estimate**: S (2 files, ~120 lines each)
**Dependencies**: None

### Step 2: Workflow Engine
**Files**: `src/workflow-engine.ts`
**Estimate**: M (1 file, ~250 lines)
**Dependencies**: Step 1, existing WireClient, session-log-reader

### Step 3: MCP Tools
**Files**: `src/tools/learn-workflow.ts`, `src/tools/execute-workflow.ts`, `src/tools/list-workflow-templates.ts`, `src/tools/continue-workflow.ts`
**Estimate**: M (4 files, ~80 lines each)
**Dependencies**: Step 2

### Step 4: Register Tools + DI
**Files**: `src/mcp-server.ts`, `src/types.ts`, `src/index.ts`
**Estimate**: XS (3 files, ~10 lines each)
**Dependencies**: Step 3

### Step 5: Web Console Enhancement
**Files**: `src/public/workflow-console.html`
**Estimate**: S (1 file, ~200 lines)
**Dependencies**: Step 2

### Step 6: Integration Test
**Files**: Manual test flow
**Estimate**: M
**Dependencies**: Step 1-5

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Kimi Server no callback API | High | Medium | Fall back to low-frequency status polling (FR-3.3) |
| Step driver timeout on complex steps | Medium | Medium | Configurable per-step timeout; max 10 min default |
| Template learning quality varies | Medium | Low | Manual edit supported (FR-1.4) |
| WireClient session coupling | Low | High | Use dedicated WireClient instance per execution |
| Ambiguity detection false positives | Medium | Low | Conservative patterns; manual override available |

## Artifacts

| Artifact | Path |
|----------|------|
| Plan | `specs/001-adaptive-workflow-engine/plan.md` |
| Research | `specs/001-adaptive-workflow-engine/research.md` |
| Data Model | `specs/001-adaptive-workflow-engine/data-model.md` |
| Contracts | `specs/001-adaptive-workflow-engine/contracts/` |

---

## Implementation Log

**2026-07-06 | kimi-code | 实施完成**

- 新增 4 个 MCP 工具：`learn_workflow`, `execute_workflow`, `list_templates`, `continue_workflow`
- 新增 3 个核心模块：`workflow-template.ts` (类型+解析), `workflow-store.ts` (CRUD), `workflow-engine.ts` (引擎)
- 新增 `templates/` 目录 + 示例模板 `phase5-audit.yaml`
- 新增 `public/workflow-console.html` Web 监管页面
- 依赖新增 `js-yaml` + `@types/js-yaml`
- 所有 32 项 tasks 完成，`npm run build` 通过

**Selftest 发现并修复 (2026-07-06)**:
- WireClient.connect() 未在引擎 execute() 中调用 → 已修复
- activeExecutions 内存泄漏 → 已修复
- model/thinking 参数被忽略 → 已透传
- escapeYaml 转义不完整 → 已增强
