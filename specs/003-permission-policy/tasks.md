# Tasks: 任务 Session 权限与策略管理

**Feature**: `003-permission-policy`
**Branch**: `master`
**Generated**: 2026-07-07
**Source**: spec.md (4 user stories), plan.md (3 phases), data-model.md, contracts/mcp-tools.md

---

## User Stories

| ID | Priority | Story | FR Coverage |
|----|:--:|------|:--:|
| US1 | P1 🎯 | PM 使用 `policy="read-only"` 创建受保护 session，阻断意外写入 | FR-1, FR-3 |
| US2 | P2 | PM 创建自定义 YAML 策略文件并跨 session 复用 | FR-2, FR-5 |
| US3 | P2 | Task session 被阻断时收到清晰规则引用和替代建议 | FR-3.2, FR-3.3 |
| US4 | P2 | PM Dashboard 实时展示阻断事件，PM 可放行/拒绝 | FR-4 |

---

## Phase 1: Setup

**Goal**: 确认环境就绪，目录结构准备

- [X] T001 Verify dependencies + directory init — run `npm ls js-yaml zod ws` to confirm deps exist; ensure `.kimi-tunnel/policies/` directory is handled: `listPolicyFiles()` returns `[]` gracefully when absent (no crash), with stderr hint "创建 .kimi-tunnel/policies/ 目录以添加自定义策略"

---

## Phase 2: Foundational — 策略引擎核心

**Goal**: 策略引擎可独立加载/解析/匹配策略规则，但尚未串联到 WireClient 审批流。**阻塞所有 User Story**。

**Independent Test**: 在 Node.js REPL 中导入 `PolicyEngine`，调用 `resolve("read-only")` → 返回 Policy 对象；调用 `check(policy, "Bash")` → 返回 `{ action: "deny", ... }`。

- [X] T002 [P] Create `src/policy-types.ts` — define `Policy`, `PolicyRule`, `PolicyDecision`, `BuiltinPolicyName` types + `PolicySchema` / `PolicyRuleSchema` Zod validators
- [X] T003 [P] Create `src/policy-builtins.ts` — export `READONLY_POLICY`, `SAFEEDIT_POLICY`, `FULLACCESS_POLICY` as const Policy objects; export `BUILTIN_POLICIES` Map
- [X] T004 Create `src/policy-store.ts` — implement `loadPolicyFile(filePath)`, `listPolicyFiles(cwd)`, `validatePolicy(policy)` with YAML parse + Zod validation; report parse errors with line numbers
- [X] T005 Create `src/policy-engine.ts` — implement `IPolicyEngine` interface and `PolicyEngine` class: `resolve(policySpec)`, `check(policy, toolName)`, `bind(sessionId, policy, boundBy?)`, `unbind(sessionId)`, `getActivePolicy(sessionId)`, `getBlockMessage(policy, ruleName, toolName)`; `bind()` records `boundBy` (PM session ID) and timestamp for audit; `check()` returns `PolicyDecision { action: "allow"|"deny"|"require_approval", ruleName?, message? }`
- [X] T006 Update `src/types.ts` — add `IPolicyEngine` interface to exports; add `policyEngine?: IPolicyEngine` to `TunnelServices`
- [X] T007 Update `src/index.ts` — import `PolicyEngine`, instantiate with `new PolicyEngine()`, inject into `services.policyEngine`

---

## Phase 3: US1 — Built-in Policy Protection (P1) 🎯 MVP

**Goal**: PM 通过 `create_session(policy="read-only")` 或 `execute_prompt(policy="safe-edit")` 指定内置策略，task session 的工具调用被策略引擎检查并阻断非法操作。

**Independent Test**: 创建 `policy="read-only"` 的 session → 发送 prompt 要求 "write a file" → 确认 Write 工具调用被 deny → session 收到阻断消息。

- [X] T008 [US1] Update `src/wire-client.ts:handleDirectEvent()` — in `awaiting_approval` handler: after fetching pending approvals, for each approval: extract tool name from payload → call `policyEngine.check()` → if `deny`, POST approval with `decision: "denied"` and block message; if `allow`, POST with `decision: "approved"` (current behavior); if `require_approval`, broadcast via `messageQueue` and skip auto-resolution
- [X] T009 [US1] Update `src/tools/create-session.ts` — add `policy: z.string().optional()` parameter; after session creation, call `policyEngine.bind(sessionId, resolvedPolicy)`; return policy info in response JSON
- [X] T010 [US1] Update `src/tools/execute-prompt.ts` — add `policy: z.string().optional()` parameter; if session not yet bound and policy provided, call `policyEngine.bind()` before submitting

---

## Phase 4: US2 — Custom Policy Files (P2)

**Goal**: PM 在 `.kimi-tunnel/policies/` 下创建 YAML 策略文件，`list_policies` 列出所有策略（含验证状态），`create_session` 可通过文件路径引用自定义策略。

**Independent Test**: 创建 `.kimi-tunnel/policies/review.yaml` → 调用 `list_policies` → 返回含 `review-policy` 的列表 → `create_session(policy=".kimi-tunnel/policies/review.yaml")` 创建成功。

- [X] T011 [P] [US2] Update `src/policy-store.ts` — ensure `listPolicyFiles(cwd)` scans `.kimi-tunnel/policies/*.yaml`, returns `{ name, file, version, rulesCount, valid, error? }[]`; `validatePolicy()` checks tool names against known kimi-code tool list
- [X] T012 [P] [US2] Create `src/tools/list-policies.ts` — register `list_policies` MCP tool: reads CWD from project context (or current process), calls `policyEngine.listPolicies()`; returns `{ builtin: [...], custom: [...] }` with validation status per policy
- [X] T013 [P] [US2] Update `src/tools/run-flow.ts` — add `policy: z.string().optional()` parameter; bind policy on flow start (same pattern as create-session)
- [X] T014 [P] [US2] Update `src/tools/chat-with-session.ts` — add `policy: z.string().optional()` parameter; bind policy if session not yet bound
- [X] T015 [US2] Update `src/tools/execute-workflow.ts` — add `policy: z.string().optional()` parameter; pass through to session creation
- [X] T016 [US2] Update `src/mcp-server.ts` — import and register `registerListPolicies`; update imports for US1 tool changes

---

## Phase 5: US3 — Clear Block Messages (P2)

**Goal**: Task session 被策略阻断时，收到结构化阻断消息——含被哪条规则阻止、允许的操作、建议替代方案。

**Independent Test**: 创建 read-only session → prompt "write to file" → 从 session log 读取阻断消息 → 确认包含策略名、规则名、"建议使用 read-only 兼容的方式" 等关键词。

- [X] T017 [US3] Enhance `src/policy-engine.ts:getBlockMessage()` (message quality — builds on T005 base implementation) — return structured message: `"🔒 策略阻断: [{policyName}] 规则 '{ruleName}' 禁止使用 {toolName}。{customMessage} 如需此操作，请联系 PM 调整策略或使用 approve_tool 放行。"`; for `read-only` → append suggest alternative tools (e.g., "改用 Read 检查文件内容")
- [X] T018 [US3] Update `src/wire-client.ts` — in denial POST, include structured block info in approval rejection body: `{ decision: "denied", reason: { policy, rule, tool, message, suggestion } }`; log to stderr for tunnel diagnostics

---

## Phase 6: US4 — PM Dashboard & Approval Flow (P2)

**Goal**: PM Dashboard 实时展示策略阻断事件，PM 可通过 `approve_tool`/`deny_tool` 手动干预；阻断事件 3 秒内出现在 Dashboard。

**Independent Test（v2.8 更新）**: 创建 read-only session → 触发 Bash 阻断 → Bash 后台轮询检测 awaiting_approval → PM 调用 approve_tool(approval_id) → session 收到工具放行。

- [X] T019 [P] [US4] Create `src/tools/approve-tool.ts` — register `approve_tool` MCP tool: accepts `block_id` (optional), `scope` (Kimi Server 仅支持 `"session"`), `session_id` (optional), `approval_id` (optional); scope=session 时解绑 session 策略；API 失败返回 isError 而非静默吞错
- [X] T020 [P] [US4] Create `src/tools/deny-tool.ts` — register `deny_tool` MCP tool: accepts `block_id` (optional), `session_id` (optional), `approval_id` (optional); 当提供 approval_id 时直接 POST Kimi Server 拒绝；API 失败返回 isError
- [X] ~~T021 [US4] Update `src/wire-client.ts` — auto-broadcast policy.block events~~ **v2.8 废弃**: approveAll 已移除，WS 自动推送阻断事件不再需要。BlockEvent 类型已从 policy-types.ts 完全移除，审批改为 Bash 回调 + PM 手动决策。
- [X] ~~T022 [US4] Update `src/public/workflow-console.html`~~ **v2.8 废弃**: WS 推送 `policy.block` 事件随 approveAll 移除。PM 改为 Bash 后台轮询 + `approve_tool`/`deny_tool` 手动决策，不再依赖 Dashboard UI。
- [X] T023 [US4] Update `src/mcp-server.ts` — import and register `registerApproveTool`, `registerDenyTool`

---

## Phase 7: Polish & Cross-Cutting

**Goal**: 边界处理、日志完整性、端到端验证。

- [X] T024 [P] Error handling pass — `src/tools/list-policies.ts`: return graceful error if `.kimi-tunnel/policies/` doesn't exist (empty list, no crash); `src/policy-store.ts`: return `{ valid: false, error: "line N: ..." }` for malformed YAML; `src/wire-client.ts`: handle approval API failure with retry (2 attempts, log warning on final fail)
- [X] ~~T025 [P] Add policy block logging~~ **v2.8 废弃**: `appendToWireLog` 随 approveAll 移除。阻断事件不再自动写入 wire.jsonl。审批记录由 Kimi Server 管理。
- [X] T026 Run end-to-end smoke test — create read-only session → trigger blocked write → verify Bash 后台轮询检测到 awaiting_approval → PM 手动 approve_tool(approval_id) → verify tool allowed; auto session 零审批验证：create_session(permission_mode="auto") → submitPrompt 自动 permission_mode: auto

---

## Dependency Graph

```
Phase 1: Setup
    │
    ▼
Phase 2: Foundational (T002–T007) ─── blocks ALL user stories
    │
    ├──▶ Phase 3: US1 (T008–T010) 🎯 MVP
    │         │
    │         ├──▶ Phase 4: US2 (T011–T016)   ← can start after US1 wire-client change
    │         │
    │         ├──▶ Phase 5: US3 (T017–T018)   ← can start after US1 engine + wire-client
    │         │
    │         └──▶ Phase 6: US4 (T019–T023)   ← depends on US1 wire-client + US2 list_policies
    │
    └──▶ Phase 7: Polish (T024–T026) ─── depends on ALL completed
```

User stories **US2, US3, US4** can be implemented in parallel after US1 (MVP) is done.

---

## Parallel Execution Examples

### Batch 1: Phase 2 Foundational (after T002+T003)
```
Parallel: T002 (policy-types.ts) + T003 (policy-builtins.ts)
Sequential: T004 (policy-store.ts) → T005 (policy-engine.ts) → T006 (types.ts) → T007 (index.ts)
```

### Batch 2: Phase 4+5+6 (after US1 complete)
```
Parallel group A:
  T011, T012 (policy-store enhance + list-policies tool)

Parallel group B:
  T017, T018 (block message quality)

Parallel group C:
  T019, T020 (approve-tool.ts + deny-tool.ts)
```

---

## Implementation Strategy

### MVP (Minimum Viable Product) — Phase 1+2+3 only

**Scope**: 内置策略 `read-only` / `safe-edit` / `full-access` 可用，`create_session` + `execute_prompt` 支持 `policy` 参数，工具调用被实际阻断。

**Task count**: T001–T010 (10 tasks, ~300 行新代码)

**Delivers**:
- ✅ US1 完整实现
- ✅ SC-1 (100% 阻断写入)
- ✅ SC-3 (2 秒内返回阻断原因)
- 不做: 自定义策略、Dashboard、审批工具

### Incremental Delivery

| Iteration | Phases | Stories | New value |
|-----------|--------|---------|-----------|
| 1 (MVP) | 1+2+3 | US1 | 内置策略阻断生效 |
| 2 | +4 | US2 | PM 可创建自定义策略 |
| 3 | +5 | US3 | 阻断消息含清晰建议 |
| 4 | +6 | US4 | Dashboard 实时监控 |
| 5 | +7 | — | 边界健壮性 |

---

## File Change Summary

| Type | Count | Files |
|------|:--:|------|
| New files | 7 | `policy-types.ts`, `policy-builtins.ts`, `policy-store.ts`, `policy-engine.ts`, `list-policies.ts`, `approve-tool.ts`, `deny-tool.ts` |
| Modified files | 10 | `types.ts`, `index.ts`, `mcp-server.ts`, `wire-client.ts`, `create-session.ts`, `execute-prompt.ts`, `run-flow.ts`, `chat-with-session.ts`, `execute-workflow.ts`, `workflow-console.html` |

---

## Success Criteria Traceability

| SC | Criteria | Verified By |
|----|----------|:--:|
| SC-1 | 100% 阻断 read-only session 写入 | T008 + T026 |
| SC-2 | 1 分钟内创建并应用自定义策略 | T011 + T012 |
| SC-3 | 2 秒内返回阻断原因 | T008 + T017 |
| SC-4 | 3 秒内 Dashboard 展示阻断 | T021 + T022 |
| SC-5 | YAML 错误精确到行号 | T004 + T024 |

---

## Phase Mapping: plan.md ↔ tasks.md

plan.md 使用 3-phase 编号（Phase 2-4），tasks.md 使用 7-phase 编号。映射关系：

| plan.md | tasks.md | 内容 |
|:---:|:---:|------|
| Phase 2 | Phase 2 | 策略引擎核心（types→builtins→store→engine） |
| Phase 3 | Phase 3+4+5+6 | API 串联 + US1–US4 |
| Phase 4 | Phase 7 | Dashboard + Polish |

实施时请以 **tasks.md 的 Phase 编号** 为准
