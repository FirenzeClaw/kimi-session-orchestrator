# Implementation Plan: 任务 Session 权限与策略管理

**Feature**: `003-permission-policy`
**Branch**: `master` (plan only; implementation on feature branch)
**Date**: 2026-07-07
**Status**: Done (v2.8 — approveAll 移除，Bash→PM 手动决策闭环)

---

## 1. Summary

在 kimi-session-orchestrator 中新增三层权限系统（Session 级 + 任务级策略 + 工具级拦截）。核心交付：
- **策略引擎模块** (`policy-engine.ts`)：加载/解析/执行策略规则
- **3 个内置策略** (`read-only`, `safe-edit`, `full-access`)
- **自定义策略支持** (YAML 文件，`.kimi-tunnel/policies/`)
- **3 个新 MCP 工具** (`list_policies`, `approve_tool`, `deny_tool`)
- **5 个已有工具增强** (新增 `policy` 参数)
- **PM Dashboard 阻断事件展示**

---

## 2. Technical Context

### 2.1 技术栈
- **Language**: TypeScript 5.6 (strict mode, ES2022, Node16)
- **Runtime**: Node.js ≥ 18
- **Key libs**: MCP SDK 1.12, Zod 3, js-yaml, ws
- **Storage**: YAML 文件系统 + 内存 Map

### 2.2 架构约束（来自 AGENTS.md）
- **DI 注入**: 所有模块通过 `TunnelServices` 接口接收依赖，禁止模块级单例
- **深模块**: 接口复杂度 < 实现复杂度
- **接缝验证**: 每个抽象 ≥ 2 个适配器（生产 + 测试 mock）
- **单一职责**: 每个文件只做一件事
- **Guard Clauses**: 嵌套 ≤ 3 层
- **类型优先**: 显式标注返回类型，禁止 `any`

### 2.3 拦截点
- **位置**: `wire-client.ts` — `handleDirectEvent()` 中 `awaiting_approval` 分支
- **API**: `GET /api/v1/sessions/{id}/approvals?status=pending` → `POST .../approvals/{id}` with `decision`
- **时机**: WS 事件 `event.session.status_changed` → status = `awaiting_approval`

---

## 3. Constitution Check

项目无 `.specify/memory/constitution.md`。以下对照 AGENTS.md 的约束自检：

| 约束 | 合规 | 说明 |
|------|:--:|------|
| DI 注入 | ✅ | `PolicyEngine` 实现 `IPolicyEngine`，注入到 `TunnelServices` |
| 深模块 | ✅ | 策略引擎封装所有策略逻辑，对外只暴露 check/list 两个操作 |
| 单文件单责 | ✅ | `policy-engine.ts`(执行) + `policy-builtins.ts`(定义) + `policy-types.ts`(类型) |
| 无 any | ✅ | 所有接口显式类型标注 |
| 嵌套 ≤ 3 | ✅ | 策略匹配用 early return guard clauses |
| 注释只写 why | ✅ | 阻断原因、策略意图注释 why，代码自描述 how |

---

## 4. Files to Create

| 文件 | 行数估算 | 职责 |
|------|:--:|------|
| `src/policy-types.ts` | ~50 | 策略类型定义 + Zod schema |
| `src/policy-builtins.ts` | ~80 | 三个内置策略的硬编码定义 |
| `src/policy-store.ts` | ~60 | YAML 文件 CRUD（list/load/validate） |
| `src/policy-engine.ts` | ~120 | 策略匹配引擎 + 会话绑定管理 |
| `src/tools/list-policies.ts` | ~40 | `list_policies` MCP 工具注册 |
| `src/tools/approve-tool.ts` | ~45 | `approve_tool` MCP 工具注册 |
| `src/tools/deny-tool.ts` | ~35 | `deny_tool` MCP 工具注册 |

**新建总计**: 7 文件, ~430 行

## 5. Files to Modify

| 文件 | 改动量 | 改动说明 |
|------|:--:|------|
| `src/types.ts` | +10 | 新增 `IPolicyEngine` 接口 + 扩展 `TunnelServices` |
| `src/index.ts` | +5 | 初始化 `PolicyEngine`，注入到 services |
| `src/mcp-server.ts` | +8 | 注册 3 个新工具 + 导入 |
| `src/wire-client.ts` | +30 | `handleDirectEvent` 中插入策略检查逻辑 |
| `src/tools/create-session.ts` | +12 | 新增 `policy` 参数 |
| `src/tools/execute-prompt.ts` | +10 | 新增 `policy` 参数 |
| `src/tools/run-flow.ts` | +8 | 新增 `policy` 参数 |
| `src/tools/chat-with-session.ts` | +10 | 新增 `policy` 参数 |
| `src/tools/execute-workflow.ts` | +8 | 新增 `policy` 参数 |
| `src/public/workflow-console.html` | +40 | 策略状态列 + 阻断事件面板 |

**文件变更总计**: 7 新建 + 10 修改 = 17 文件, ~570 行净增量

---

## 6. Implementation Phases

### Phase 2: 策略引擎核心（无外部可见变化）

**目标**: 策略引擎可加载/解析/匹配，但尚未串联到 API 流。

#### Task 2.1: 创建 `policy-types.ts`
- 定义 `Policy`、`PolicyRule`、`PolicyDecision`、`BuiltinPolicyName` 类型
- Zod schema: `PolicySchema`、`PolicyRuleSchema`（用于 YAML 文件校验）
- 输出文件: `src/policy-types.ts`

#### Task 2.2: 创建 `policy-builtins.ts`
- 硬编码三个内置策略：`READONLY_POLICY`、`SAFEEDIT_POLICY`、`FULLACCESS_POLICY`
- 内置策略工具白名单常量
- 输出文件: `src/policy-builtins.ts`

#### Task 2.3: 创建 `policy-store.ts`
- `loadPolicyFile(filePath)`: 读取 YAML → Zod 校验 → 返回 Policy 或错误
- `listPolicyFiles(cwd)`: 扫描 `.kimi-tunnel/policies/` 目录
- `validatePolicy(policy)`: 结构校验（工具名是否合法等）
- 输出文件: `src/policy-store.ts`

#### Task 2.4: 创建 `policy-engine.ts`
- `IPolicyEngine` 接口
- `PolicyEngine` 类实现
  - `resolve(policySpec)`: 解析策略标识 → Policy 对象（内置名 → 内置定义，路径 → 文件加载）
  - `check(policy, toolName)`: 规则匹配，返回 `PolicyDecision`
  - `bind(sessionId, policy)`: 绑定 session → 策略
  - `unbind(sessionId)`: 解绑
  - `getActivePolicy(sessionId)`: 查询绑定
  - `getBlockMessage(policy, toolName)`: 生成阻断消息
- 输出文件: `src/policy-engine.ts`

**Checkpoint**: `PolicyEngine` 可独立调用 `check()`，返回正确决策。此阶段不与现有代码耦合。

---

### Phase 3: API 串联（策略实际生效）

**目标**: 策略引擎接入审批流，session 的工具调用真正受策略约束。

#### Task 3.1: 更新 `TunnelServices` 和 `index.ts`
- `types.ts`: 新增 `IPolicyEngine` 接口，`TunnelServices` 增加 `policyEngine?: IPolicyEngine`
- `index.ts`: 创建 `PolicyEngine` 实例，注入 services

#### Task 3.2: 修改 `wire-client.ts` 审批流（v2.8 更新）
- **原设计**: `handleDirectEvent` 的 `awaiting_approval` 分支中自动调用 `approveAll()` 根据策略裁决
- **v2.8 实现**: 移除 `approveAll()` 自动裁决引擎
  - `submitPrompt` 检查 `sessionPermissionMode === "auto"` 时自动发送 `permission_mode: "auto"`（auto session 零审批）
  - 移除 `waitForStatus` / `waitForApproval` 中的 auto-approve 逻辑
  - 移除 `handleDirectEvent` 中 awaiting_approval 触发 approveAll 的逻辑
- 审批决策权完全归 PM：Bash 后台輪詢检测 → PM 手动 `approve_tool` / `deny_tool`

#### Task 3.3: 修改工具——新增 `policy` 参数
- `create-session.ts`: 新增 `policy: z.string().optional()`，创建后调用 `policyEngine.bind()`
- `execute-prompt.ts`: 新增 `policy: z.string().optional()`，若 session 尚未绑定策略则绑定
- `run-flow.ts`: 同上
- `chat-with-session.ts`: 同上
- `execute-workflow.ts`: 同上

**注意**: `policy` 参数逻辑：若 session 已有绑定 → 忽略（不覆盖）；若无绑定 + 提供了 policy → 绑定。

#### Task 3.4: 注册新 MCP 工具
- 创建 `src/tools/list-policies.ts`: `list_policies` 工具
- 创建 `src/tools/approve-tool.ts`: `approve_tool` 工具
- 创建 `src/tools/deny-tool.ts`: `deny_tool` 工具
- `mcp-server.ts`: 注册三个新工具

**Checkpoint**: 创建 `policy="read-only"` 的 session → 发送 prompt 要求写文件 → 工具调用被阻断 → session 收到清晰阻断原因。

---

### Phase 4: Bash 回调 + PM 手动决策（v2.8 重设计）

**目标**: PM 通过 Bash 后台轮询 + MCP 工具手动决策审批。

**原设计（已废弃）**: WS push `policy.block` 事件到 workflow-console.html Dashboard。
**v2.8 实现**: 
- Bash 后台 `while` 循环检测 `status === "awaiting_approval"` → 通知 PM
- PM 审查 pending approvals → `approve_tool(approval_id, scope="session")` 或 `deny_tool(approval_id)`
- `approveAll()` / `broadcastBlockEvent` / `appendToWireLog` 全部移除

#### Task 4.1: 审批工具增强
- `approve_tool`: scope 固定为 session（Kimi Server 约束）；API 失败返回 isError
- `deny_tool`: block_id 可选，支持 approval_id 直接 POST Kimi Server

#### Task 4.2: （废弃）阻断日志自动记录
- `appendToWireLog` 随 approveAll 移除——审批记录由 Kimi Server 管理

#### Task 4.3: 错误处理与边界
- 策略文件不存在 → 明确错误消息
- YAML 解析失败 → 报告行号
- 工具名未知 → 使用 `defaultAction`
- 审批 API 调用失败 → 返回 isError（不再静默吞错）

---

## 7. Task Dependency Graph

```
Phase 2 (Core Engine)
  T2.1 (types) ──┬── T2.3 (store)
  T2.2 (builtins)┘    │
                      ├── T2.4 (engine)
                      │
Phase 3 (API Integration) ───── depends on Phase 2 ─────
  T3.1 (services) ──┬── T3.2 (wire-client)
                    │       │
                    │       ├── T3.3 (tools: policy param)
                    │       │
                    │       └── T3.4 (new MCP tools)
                    │
Phase 4 (Dashboard) ───── depends on Phase 3 ─────
  T4.1 (dashboard UI)
  T4.2 (logging)
  T4.3 (error handling)
```

---

## 8. Risk Assessment

| Risk | Prob | Impact | Mitigation |
|------|:--:|:--:|------|
| Kimi Server approval payload 不含 tool_name | 中 | 高 | Fallback: 解析 description 关键词，或注入前通过 prompt 标记 |
| 策略与 `permission_mode` 语义冲突 | 低 | 中 | 文档明确两者独立，policy 控制工具可用性，permission_mode 控审批流程 |
| 自定义策略文件热加载与绑定不可变冲突 | 低 | 低 | 策略在 bind 时 snapshot，后续文件修改不影响已绑定 session |
| WS 事件丢失导致阻断未推送 Dashboard | 低 | 中 | 定时轮询 pending approvals 作为补充检查 |

---

## 9. Success Criteria Traceability

| SC | 验证方法 | 对应 Task |
|----|---------|:---:|
| SC-1: 100% 阻断写入 | 创建 read-only session，prompt 要求写文件，确认被阻断 | T3.2 |
| SC-2: 1 分钟内创建策略 | 手动创建 YAML + `list_policies` 验证 | T2.3, T3.4 |
| SC-3: 2 秒内返回阻断原因 | 测量 deny 响应延迟 | T3.2 |
| SC-4: 3 秒内 Dashboard 展示 | WS 推送延迟测试 | T4.1 |
| SC-5: 语法错误精确到行号 | 故意创建有 bug 的 YAML → `list_policies` 返回行号 | T2.3 |

---

## 10. Generated Artifacts

| 产出 | 路径 |
|------|------|
| 研究文档 | `specs/003-permission-policy/research.md` |
| 数据模型 | `specs/003-permission-policy/data-model.md` |
| MCP 契约 | `specs/003-permission-policy/contracts/mcp-tools.md` |
| 快速开始 | `specs/003-permission-policy/quickstart.md` |
| 实施计划 | `specs/003-permission-policy/plan.md` (this file) |
