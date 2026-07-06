# Tasks: 自适应工作流引擎

**Feature**: `001-adaptive-workflow-engine`
**Generated**: 2026-07-06
**Base**: `specs/001-adaptive-workflow-engine/plan.md`

---

## Phase 1: Setup

**Goal**: 项目基础设施就绪，新增依赖安装

- [X] T001 安装 js-yaml 类型定义：`npm install --save-dev @types/js-yaml`
- [X] T002 创建模板存储目录 `templates/` 并加入 `.gitignore` 例外（允许提交示例模板）
- [X] T003 更新 `src/types.ts` — `TunnelServices` 接口新增 `workflowEngine: WorkflowEngine` 字段

---

## Phase 2: Foundational — Template 类型 + 存储

**Goal**: 模板定义、解析、持久化完成。无 MCP 工具，纯模块可独立测试。

**Independent test**: 调用 `parseTemplate(yamlString)` → 返回 `WorkflowTemplate`，调用 `saveTemplate` + `loadTemplate` → 读写一致。

- [X] T004 [P] 定义 `WorkflowTemplate`, `WorkflowStep`, `BlockagePolicy`, `TimeoutConfig` 类型于 `src/workflow-template.ts`
- [X] T005 [P] 实现 `parseTemplate(yaml: string): WorkflowTemplate` 于 `src/workflow-template.ts`（含 Zod schema 校验）
- [X] T006 [P] 实现 `validateTemplate(t: WorkflowTemplate): ValidationResult` 于 `src/workflow-template.ts`
- [X] T007 [P] 实现 `listTemplates(): Promise<WorkflowTemplate[]>` 于 `src/workflow-store.ts`（扫描 `templates/*.yaml`）
- [X] T008 实现 `loadTemplate(name: string): Promise<WorkflowTemplate>` 于 `src/workflow-store.ts`
- [X] T009 实现 `saveTemplate(t: WorkflowTemplate): Promise<void>` 于 `src/workflow-store.ts`
- [X] T010 实现 `deleteTemplate(name: string): Promise<void>` 于 `src/workflow-store.ts`

---

## Phase 3: User Story 1 — 模板学习 (P1)

**Goal**: 用户可通过口头描述或历史 session 自动生成工作流模板。

**Independent test**: 提供口头描述 "先读规范文档，然后逐项检查，修复问题，运行 selftest，更新文档" → 调用 `learn_workflow` → `templates/` 目录下生成正确 YAML 文件。

- [X] T011 [US1] 实现 `learn_workflow` MCP 工具于 `src/tools/learn-workflow.ts`
  - 参数: `name`, `cwd`, `spec_docs[]`, `description?`, `from_session?`
  - 口头描述路径：AI 从 description 文本提取步骤序列（当前 session 内完成，无额外 API 调用）
  - 历史 session 路径：调用 `list_io_records(from_session)` → 提取规则：仅取 `type="user"` 且非系统注入（排除 `<system-reminder>`）、非空、非纯错误重贴 → 相邻短 prompt（<50字）合并为一个 step
  - 调用 `saveTemplate()` 持久化
- [X] T012 [US1] 在 `src/mcp-server.ts` 注册 `learn_workflow` 工具
- [X] T013 [US1] 创建示例模板 `templates/phase5-audit.yaml` 用于验证
- [X] T013a [US1] 实现模板版本管理：`loadTemplate(name, version?)` 支持 `templates/<name>/<version>.yaml` 多版本目录结构

---

## Phase 4: User Story 2 — 自适应步骤驱动 (P1)

**Goal**: 加载模板，创建 session，逐条下发指令，根据回复自适应调整。

**Independent test**: 加载 `phase5-audit.yaml` → 创建 session → 逐条 sendPrompt → 模糊回复时读 thinking → 正确推进或调整。

- [X] T014 [US2] 实现 `WorkflowEngine` 类于 `src/workflow-engine.ts`
  - 构造函数接收 `TunnelServices`
  - `execute(template, options): Promise<WorkflowResult>` 主入口
  - 内部方法 `driveStep(step, sessionId)` — submit + wait + classify
  - 内部方法 `classifyResponse(text): StepClassification` — done/ambiguous/blocked
- [X] T015 [US2] 实现模糊检测逻辑于 `src/workflow-engine.ts`
  - 复用 `session-orchestrator.ts` 的 `isAmbiguous()` 模式
  - 模糊时调用 `readSessionLog(after_line, includeThinking=true)` 读思考链
- [X] T016 [US2] 实现 `execute_workflow` MCP 工具于 `src/tools/execute-workflow.ts`
  - 参数: `template_name`, `cwd?`, `auto_mode`, `model?`, `thinking?`
  - 加载模板 → create_session → 循环 driveStep → push WebSocket 进度
- [X] T017 [US2] 实现 `list_templates` MCP 工具于 `src/tools/list-workflow-templates.ts`
  - 无参数，返回所有模板列表
- [X] T018 [US2] 在 `src/mcp-server.ts` 注册 `execute_workflow` + `list_templates` 工具
- [X] T019 [US2] 在 `src/index.ts` 创建 `WorkflowEngine` 实例并注入 `TunnelServices`

---

## Phase 5: User Story 4 — 阻塞处理 (P2)

**Goal**: 预定义阻塞策略表 + 自定义覆盖。不可自动处理的阻塞暂停等用户决策。

**Independent test**: 模拟 session 回复 "command not found: python" → 自动处理 → 生成重试指令。模拟 "Permission denied" → 暂停等 `continue_workflow`。

- [X] T020 [US4] 实现 `handleBlockage(event, policy)` 于 `src/workflow-engine.ts`
  - 阻塞类型枚举 + 匹配模式（正则检测回复文本）
  - `dependency_missing` → 生成 "请先安装缺失依赖" 指令
  - `file_not_found` → 生成 "请确认路径" 指令
  - `permission_denied` → 标记 `needsUserDecision=true`
  - `timeout` → 重试一次，再超时则 needsUserDecision
  - `ambiguous` → 读 thinking 后若仍不明确则 needsUserDecision
- [X] T021 [US4] 实现 `continue_workflow` MCP 工具于 `src/tools/continue-workflow.ts`
  - 参数: `execution_id`, `decision` ("retry"/"skip"/"abort"/"manual"), `instruction?`
  - `retry`: 重新执行当前步骤
  - `skip`: 跳至下一步
  - `abort`: 关闭 session，标记 cancelled
  - `manual`: 用用户指令覆盖当前步骤
- [X] T022 [US4] 在 `src/mcp-server.ts` 注册 `continue_workflow` 工具

---

## Phase 6: User Story 3 — Web 监管页面 (P2)

**Goal**: 轻量 HTML 页面通过 WebSocket 实时显示执行进度。

**Independent test**: 打开 `http://localhost:3456/workflow-console.html` → 启动工作流 → 页面实时显示步骤变化和回复摘要。

- [X] T023 [US3] 创建 `src/public/workflow-console.html` — Web 监管页面
  - WebSocket 连接 `/ws`
  - 监听 `type: "workflow_progress"` 和 `type: "workflow_complete"` 消息
  - 显示：模板名、步骤进度条、当前步骤描述、最近回复、阻塞警报
  - 样式：深色主题，简洁卡片布局，红色高亮阻塞
- [X] T024 [US3] 在 `src/http-server.ts` 添加 `/workflow-console.html` 路由

---

## Phase 7: User Story 5 — 流程控制 (P3)

**Goal**: 一轮完成后向用户汇报，支持继续/调整/新建。

**Independent test**: 模板执行完毕 → 收到完成汇报 → 用户选择"创建新 session 继续" → 新 session 创建并执行。

- [X] T025 [US5] 在 `WorkflowEngine.execute()` 末尾实现完成回调
  - 推送 `workflow_complete` WebSocket 事件
  - 返回 `WorkflowResult` 含摘要和下一步选项
- [X] T026 [US5] 在 `execute_workflow` 工具中实现完成汇报逻辑
  - 完成后暂停，等待用户通过 `continue_workflow(decision="new_session")` 或手动操作

---

## Phase 8: Polish & Integration

**Goal**: 端到端测试、文档同步、AGENTS.md 更新。

- [X] T027 [P] 编写集成测试流程：`learn_workflow` → `execute_workflow` → 验证 Web 推送 → `continue_workflow`
- [X] T028 [P] 阻塞场景验证：模拟 5 种阻塞类型（依赖缺失/文件不存在/权限不足/超时/模糊回复），统计自动处理成功率 ≥ 80%。测试文件：执行各阻塞场景的 `execute_workflow` 并核对 `BlockageEvent.resolved === true` 的比例
- [X] T029 [P] 更新 `AGENTS.md`：新增工作流引擎模块描述、工具表从 11 更新到 15
- [X] T030 [P] 更新 `README.md`：新增 `execute_workflow` / `learn_workflow` / `continue_workflow` / `list_templates` 工具文档
- [X] T031 运行 `npm run build` 验证全部编译通过

---

## Dependencies

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundational: Types + Store)
    ↓
Phase 3 (US1: 模板学习)  ← depends on Phase 2
    ↓
Phase 4 (US2: 步骤驱动)  ← depends on Phase 3 (needs templates to drive)
    ↓
Phase 5 (US4: 阻塞处理)  ← depends on Phase 4 (extend driveStep)
    ↓
Phase 6 (US3: Web 页面)  ← depends on Phase 4 (needs progress events)
    ↓
Phase 7 (US5: 流程控制)  ← depends on Phase 5 (completion + user decision)
    ↓
Phase 8 (Polish)
```

**Parallel within Phase 2**: T004, T005, T006, T007 可并行（不同关注点）

## Parallel Opportunities

| Phase | Parallel Tasks |
|-------|---------------|
| Phase 2 | T004 ∥ T007 (类型定义 ∥ 文件扫描，不同文件) |
| Phase 4 | T017 可与 T014-T016 并行（list_templates 不依赖 engine） |
| Phase 8 | T027, T028, T029 可并行（测试、文档、README 互不依赖） |

## MVP Scope

**MVP = Phase 1 + 2 + 3 + 4**

即：模板类型 → 存储 → `learn_workflow` → `execute_workflow`。此时已有核心能力：学习流程 + 逐步执行。Web 页面和阻塞处理作为增量。

## Task Summary

| Phase | Tasks | Count |
|-------|-------|-------|
| Phase 1: Setup | T001-T003 | 3 |
| Phase 2: Foundational | T004-T010 | 7 |
| Phase 3: US1 模板学习 | T011-T013a | 4 |
| Phase 4: US2 步骤驱动 | T014-T019 | 6 |
| Phase 5: US4 阻塞处理 | T020-T022 | 3 |
| Phase 6: US3 Web 页面 | T023-T024 | 2 |
| Phase 7: US5 流程控制 | T025-T026 | 2 |
| Phase 8: Polish | T027-T031 | 5 |
| **Total** | | **32** |
