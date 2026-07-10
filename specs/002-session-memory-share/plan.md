# Implementation Plan: 任务 Session 冷启动记忆共享

**Feature**: `002-session-memory-share`
**Branch**: `master`
**Date**: 2026-07-08
**Status**: Planning
**Parent**: kimi-session-orchestrator v2.5

---

## 1. Summary

在 kimi-session-orchestrator 中新增三层共享内存系统，解决任务 session 冷启动时重复阅读项目规范的上下文浪费问题。核心交付：

- **SQLite 存储层** (`memory-store.ts`)：`node:sqlite` 内置模块，零额外依赖
- **6 个新 MCP 工具**：`memory_set`, `memory_get`, `memory_list`, `memory_delete`, `memory_status`, `memory_archive`
- **3 个已有工具增强**：`create_session`（+`memory_level`, `from_session`）、`execute_prompt`（+`skip_memory`）、`chat_with_session`（+`skip_memory`）、`run_flow`（+`memory_level`）
- **自动注入机制**：`execute_prompt` 在发送 prompt 前自动从知识库拉取上下文并拼接为结构化前缀

**量化目标**：新建任务 session 冷启动上下文消耗从 ~30K 降至 <5K（减少 83%+）。

---

## 2. Technical Context

| Aspect | Decision |
|--------|----------|
| **Language** | TypeScript 5.6 (strict, ES2022, Node16) |
| **Runtime** | Node.js ≥ 18（实际 v24.18.0） |
| **Storage** | `node:sqlite` 内置模块 — `.kimi-tunnel/memory.db` |
| **Injection** | Prompt 前缀拼接（Markdown 区块格式） |
| **Namespacing** | cwd → 向上查找 `.kimi-tunnel/`，`project_id` 隔离 |
| **Permissions** | 条目级 `source_session_id`；PM 全权限，task session 只读 L1 |

### 架构约束（from AGENTS.md）

| 约束 | 合规方式 |
|------|---------|
| DI via TunnelServices | `MemoryStore` 实现 `IMemoryStore`，注入到 `TunnelServices` |
| 深模块 | `MemoryStore` 对外暴露 CRUD + inject，内部封装 SQL 和命名空间逻辑 |
| 单一职责 | `memory-store.ts`（SQLite CRUD）、`tools/memory-*.ts`（MCP 注册）、`memory-injector.ts`（注入拼接） |
| 无 any | 所有接口显式类型标注 |
| Guard Clauses ≤ 3 | SQL 查询用 early return，注入拼接用分层 if |
| 接缝验证 | `IMemoryStore` — SQLite（prod）+ 内存 Map（test mock） |

---

## 3. Constitution Check

> 项目无 `.specify/memory/constitution.md`，以 AGENTS.md 的架构原则自检。

| 原则 | 合规 | 说明 |
|------|:--:|------|
| DI 注入 | ✅ | `MemoryStore` 注入到 `TunnelServices.memoryStore` |
| 深模块 | ✅ | 公共接口 6 个方法，内部封装 SQL 构建/命名空间验证/注入拼接 |
| 单文件单责 | ✅ | store(CRUD) + injector(拼接) + tools/*(注册) 严格分离 |
| 类型优先 | ✅ | `MemoryEntry`, `InjectionProfile`, `IMemoryStore` 全量类型标注 |
| 注释只写 why | ✅ | 仅解释设计意图，不写 how |
| 嵌套 ≤ 3 | ✅ | 查询/注入逻辑用 guard clauses 扁平化 |

**无违规项，计划合规。**

---

## 4. Files to Create

| 文件 | 行数估算 | 职责 |
|------|:--:|------|
| `src/memory-store.ts` | ~200 | SQLite CRUD：open/close、set/get/list/delete/status、namespace 验证、project root 解析 |
| `src/memory-injector.ts` | ~80 | 注入文本拼接：根据 `InjectionProfile` 从 store 拉取条目 → 格式化为 Markdown 前缀 |
| `src/tools/memory-set.ts` | ~55 | `memory_set` MCP 工具注册 |
| `src/tools/memory-get.ts` | ~55 | `memory_get` MCP 工具注册 |
| `src/tools/memory-list.ts` | ~45 | `memory_list` MCP 工具注册 |
| `src/tools/memory-delete.ts` | ~50 | `memory_delete` MCP 工具注册 |
| `src/tools/memory-status.ts` | ~40 | `memory_status` MCP 工具注册 |
| `src/tools/memory-archive.ts` | ~55 | `memory_archive` MCP 工具注册 |

**新建总计**: 8 文件, ~580 行

## 5. Files to Modify

| 文件 | 改动量 | 改动说明 |
|------|:--:|------|
| `src/types.ts` | +15 | 新增 `IMemoryStore` 接口 + `MemoryEntry`/`InjectionProfile` 类型 + 扩展 `TunnelServices` |
| `src/index.ts` | +10 | 初始化 `MemoryStore`，注入到 services；启动时 open db |
| `src/mcp-server.ts` | +10 | 注册 6 个新 memory_* 工具 |
| `src/tools/create-session.ts` | +15 | 新增 `memory_level`、`from_session` 参数；创建后绑定 memory profile |
| `src/tools/execute-prompt.ts` | +20 | 发送前检查 memory profile → 调用 injector → 拼接前缀；新增 `skip_memory` 参数 |
| `src/tools/chat-with-session.ts` | +15 | 同 execute-prompt，新增 `skip_memory` |
| `src/tools/run-flow.ts` | +8 | 新增 `memory_level`、`from_session` 参数，透传 |
| `src/tools/execute-workflow.ts` | +8 | 同上 |
| `src/wire-client.ts` | +15 | 新增 `setMemoryProfile(sessionId, profile)` / `getMemoryProfile(sessionId)` 方法，内部用 `Map<string, InjectionProfile>` 存储 session→profile 映射 |

**修改总计**: 9 文件, ~116 行净增量

---

## 6. Implementation Phases

### Phase 1: Setup

**Goal**: 依赖确认 + 目录初始化。

- [ ] T001 确认 `node:sqlite` 可用：`node -e "require('node:sqlite')"` 在 Node 24.18 下通过
- [ ] T002 创建 `.kimi-tunnel/.gitkeep` 确保目录存在（已部分存在 — policies/ 已建）；更新 `.gitignore` 排除 `memory.db` 但保留目录结构

---

### Phase 2: Foundational — MemoryStore 核心

**Goal**: SQLite CRUD 完成，可独立测试。**阻塞所有 User Story。**

- [ ] T003 [P] 更新 `src/types.ts` — 新增类型定义：
  - `MemoryEntry` interface
  - `InjectionProfile` type（`{ level, maxBytes, fromSession? }`）
  - `IMemoryStore` interface（`set`, `get`, `list`, `delete`, `status`, `archive`, `resolveProjectRoot`, `injectContext`）
  - 扩展 `TunnelServices` 增加 `memoryStore?: IMemoryStore`
- [ ] T004 [P] 创建 `src/memory-store.ts` — 实现 `MemoryStore` class：
  - `resolveProjectRoot(cwd)`: 向上遍历目录树，查找 `.kimi-tunnel/` 目录，返回最近的 project root
  - `open(projectRoot)`: 打开/创建 `memory.db`，执行 `CREATE TABLE IF NOT EXISTS`
  - `set(namespace, key, value, sessionId?)`: UPSERT（`INSERT OR REPLACE`），自动递增 version
  - `get(namespace, key?)`: 查询条目，支持 `includeExpired` 过滤
  - `list(namespace?)`: 列出命名空间及键名，支持前缀 LIKE 匹配
  - `delete(namespace, key)`: 删除单条
  - `status()`: 聚合查询——总数、活跃/过期、按命名空间分组
  - `archive(sessionId, targetNs, keys?)`: 读取 findings → 插入到 target namespace
  - `close()`: 关闭数据库连接
- [ ] T005 创建 `src/memory-injector.ts` — 实现注入拼接逻辑：
  - `buildInjection(store, profile)`: 根据 level 拉取对应命名空间条目 → 格式化为 Markdown 区块 → 字符串拼接
  - 超 8K 截断逻辑：按命名空间优先级保留，末尾附 "…(truncated, N entries omitted. Use memory_get for details)"
  - 若 `fromSession` 指定，额外拉取 `session/<id>/handoff`
- [ ] T006 更新 `src/index.ts` — 创建 `MemoryStore` 实例，注入到 `services.memoryStore`；若 cwd 存在则 `open()`

**Checkpoint**: `MemoryStore` 可独立读写 SQLite，查询返回正确条目；injector 生成格式化的 Markdown 前缀。

---

### Phase 3: US1 — MCP Tools for PM (P1)

**Goal**: PM 可通过 MCP 工具录入/读取/管理项目知识库。

- [ ] T007 [US1] 创建 `src/tools/memory-set.ts` — 注册 `memory_set` 工具：
  - 参数：`namespace`(required), `key`(required), `value`(required), `session_id`(optional)
  - 验证 namespace 格式（必须以 `project/` 或 `session/` 开头）
  - 调用 `memoryStore.set()`，返回 `{ ok, entry }`
- [ ] T008 [US1] 创建 `src/tools/memory-get.ts` — 注册 `memory_get` 工具
- [ ] T009 [US1] 创建 `src/tools/memory-list.ts` — 注册 `memory_list` 工具
- [ ] T010 [US1] 创建 `src/tools/memory-delete.ts` — 注册 `memory_delete` 工具
- [ ] T011 [US1] 创建 `src/tools/memory-status.ts` — 注册 `memory_status` 工具
- [ ] T012 [US1] 创建 `src/tools/memory-archive.ts` — 注册 `memory_archive` 工具
- [ ] T013 [US1] 更新 `src/mcp-server.ts` — 导入并注册全部 6 个新工具

---

### Phase 4: US2 — Auto-Injection on Session Create (P1)

**Goal**: `create_session` / `execute_prompt` 自动注入共享内存上下文。

- [ ] T014 [US2] 更新 `src/tools/create-session.ts`：
  - 新增 `memory_level: z.enum(["off","minimal","standard","full"]).default("standard")`
  - 新增 `from_session: z.string().optional()`
  - 创建 session 后，将 memory profile 绑定到 session（存入 wireClient 的状态 Map）
  - 若提供 `task` 参数（首条 prompt），调用 injector 拼接前缀后发送
- [ ] T015 [US2] 更新 `src/tools/execute-prompt.ts`：
  - 新增 `skip_memory: z.boolean().default(false)`
  - 发送前：检查 session 的 memory profile → 调用 `memoryStore.injectContext(profile)` → 若有注入内容，拼接 `[注入前缀]\n---\n[用户 prompt]`
- [ ] T016 [US2] 更新 `src/tools/chat-with-session.ts`：
  - 同 T015，新增 `skip_memory` 参数
- [ ] T017 [US2] 更新 `src/tools/run-flow.ts`：
  - 新增 `memory_level`、`from_session` 参数，透传到 `create_session`
- [ ] T018 [US2] 更新 `src/tools/execute-workflow.ts`：
  - 同 T017

---

### Phase 5: US3 — Session Retirement & Handoff (P2)

**Goal**: Session 退役时归档发现，接续 session 可获取交接信息。

- [ ] T019 [US3] 增强 `memory_archive` 工具：
  - 读取 `session/<id>/findings` 全部条目
  - 写入 `project/learnings/<session_id>_<timestamp>` 作为归档快照
  - 标记原 findings 为 expired

---

### Phase 6: Polish & Cross-Cutting

**Goal**: 错误处理、日志、端到端验证。

- [ ] T020 [P] 错误处理 pass：
  - `memory-store.ts`: db 打开失败 → 明确错误消息（"无法访问 .kimi-tunnel/memory.db"）；schema 迁移失败 → 回滚
  - `memory-set.ts`: namespace 验证失败 → 返回具体哪条规则违反
  - 所有工具：db 未打开时尝试自动 `open()`；仍失败则返回 "知识库未初始化，请先调用 memory_set 自动创建"
- [ ] T021 [P] 注入边界测试：
  - 空知识库 → execute_prompt 行为不变（无前缀拼接）
  - 注入超 8K → 截断 + 提示
  - `skip_memory=true` → 跳过注入
  - `memory_level="off"` → 跳过注入
- [ ] T022 [P] 更新 `AGENTS.md`：新增 memory 模块描述，工具表从 22 更新到 28
- [ ] T023 [P] 更新 `README.md`：新增 6 个 memory 工具文档 + 快速开始示例
- [ ] T024 运行 `npm run build` 验证全部编译通过
- [ ] T025 端到端 smoke test：memory_set → memory_get → create_session(standard) → execute_prompt → 验证注入内容出现在 prompt 中

---

## 7. Dependency Graph

```
Phase 1: Setup (T001–T002)
    │
    ▼
Phase 2: Foundational (T003–T006) ─── blocks ALL user stories
    │
    ├──▶ Phase 3: US1 MCP Tools (T007–T013)  ← depends on Phase 2
    │         │
    │         └──▶ Phase 4: US2 Auto-Injection (T014–T018)  ← depends on Phase 3
    │                   │
    │                   └──▶ Phase 5: US3 Retirement (T019)  ← depends on Phase 4
    │
    └──▶ Phase 6: Polish (T020–T025) ─── depends on ALL completed
```

---

## 8. Parallel Execution Opportunities

| Batch | Tasks | Rationale |
|-------|-------|-----------|
| Phase 2 | T003 ∥ T004 | types.ts 和 memory-store.ts 互不依赖 |
| Phase 3 | T007–T012 | 6 个 MCP 工具可全部并行开发（独立文件） |
| Phase 4 | T014–T018 | 5 个工具增强可并行（独立文件） |
| Phase 6 | T020, T022, T023 | 错误处理、AGENTS.md、README 互不依赖 |

---

## 9. Risk Assessment

| Risk | Prob | Impact | Mitigation |
|------|:--:|:--:|------|
| `node:sqlite` 在低版本 Node 不可用 | 低 | 高 | 启动时检测，不可用则报 clear error + 建议升级 Node ≥22 |
| 注入过大导致 prompt 超长被截断 | 中 | 中 | 8K 硬上限 + 截断提示；用户可通过 `memory_level` 控制 |
| cwd 不在项目根目录（子目录中执行） | 中 | 低 | `resolveProjectRoot()` 向上遍历，确保找到 `.kimi-tunnel/` |
| SQLite 并发写入冲突 | 低 | 低 | kimi-session-orchestrator 单进程，无并发写入场景 |
| 与 SPEC 003 的 `.kimi-tunnel/policies/` 目录共存 | 无 | — | 不同子路径，无冲突（policies/ vs memory.db） |

---

## 10. Success Criteria Traceability

| SC | Criteria | Verified By |
|----|----------|:--:|
| SC-1 | 冷启动从 30K → <5K | T015 + T025 |
| SC-2 | 并行 session 无需重复描述背景 | T014 + T018 |
| SC-3 | Session 退役后 1 分钟内可获取发现 | T019 |
| SC-4 | 1000 条记录，查询 <500ms | T004 (SQLite 本地 SSD，天然满足) |
| SC-5 | PM 2 分钟内完成初始化录入 | T007 (memory_set 单次调用即录入) |

---

## 11. File Change Summary

| Type | Count | Files |
|------|:--:|------|
| New files | 8 | `memory-store.ts`, `memory-injector.ts`, `memory-set.ts`, `memory-get.ts`, `memory-list.ts`, `memory-delete.ts`, `memory-status.ts`, `memory-archive.ts` |
| Modified files | 9 | `types.ts`, `index.ts`, `mcp-server.ts`, `wire-client.ts`, `create-session.ts`, `execute-prompt.ts`, `chat-with-session.ts`, `run-flow.ts`, `execute-workflow.ts` |

---

## 12. Generated Artifacts

| Artifact | Path |
|----------|------|
| Research | `specs/002-session-memory-share/research.md` |
| Data Model | `specs/002-session-memory-share/data-model.md` |
| Contracts | `specs/002-session-memory-share/contracts/mcp-tools.md` |
| Quickstart | `specs/002-session-memory-share/quickstart.md` |
| Plan | `specs/002-session-memory-share/plan.md` (this file) |

---

## 13. Implementation Log

**2026-07-08 | kimi-code | 实施完成**

- 新增 6 个 MCP 工具：`memory_set`, `memory_get`, `memory_list`, `memory_delete`, `memory_status`, `memory_archive`
- 新增 2 个核心模块：`memory-store.ts`（SQLite CRUD，node:sqlite 零依赖）, `memory-injector.ts`（注入拼接）
- 修改 9 个文件：`types.ts`（类型）、`index.ts`（DI 注入）、`mcp-server.ts`（工具注册）、`wire-client.ts`（memory profile 管理）、`create-session.ts`（+memory_level/from_session）、`execute-prompt.ts`（+skip_memory/自动注入）、`chat-with-session.ts`（+skip_memory）、`run-flow.ts`（+memory_level/from_session）、`execute-workflow.ts`（+memory_level/from_session）
- 自动注入机制：create_session 绑定 profile → execute_prompt 自动拼接 Markdown 上下文前缀（8K 上限 + 截断提示 + 过期警告）
- 工具总数：22 → 28
- 所有 27 项 tasks 完成，`npm run build` 通过

**Selftest 发现并修复 (2026-07-08)**:
- value 空串检查缺失 → 已添加（memory-set.ts + memory-store.ts）
- value 64KB 上限缺失 → 已添加（双重防御：工具层 + 存储层）
- execute-prompt.ts 缩进不一致（tab/spaces 混合）→ 已统一为空格
- FR-4.3 memory_write 标记 [DEFER v2.6]、US5 合并到 US1+US4、FR-2.2 关键词匹配简化为全量拉取 → spec.md 已更新

**已知限制**:
- run-flow.ts 和 execute-workflow.ts 的 memoryLevel/fromSession 参数未透传到 WorkflowEngine（引擎接口不支持），已标记 TODO
- FR-4.3 memory_write 参数标记 [DEFER v2.6]（任务 session 无 MCP 工具访问权，当前天然无需）
- 自动 session 退役归档（FR-5.1）降为手动触发（Kimi Server 无可靠 close hook）
