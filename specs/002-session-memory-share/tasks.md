# Tasks: 任务 Session 冷启动记忆共享

**Feature**: `002-session-memory-share`
**Branch**: `master`
**Generated**: 2026-07-08
**Source**: spec.md (5 user stories), plan.md (6 phases), data-model.md, contracts/mcp-tools.md

---

## User Stories

| ID | Priority | Story | FR Coverage |
|----|:--:|------|:--:|
| US1 | P1 🎯 | PM 录入/管理项目知识库（CRUD） | FR-1, FR-5 |
| US2 | P1 🎯 | Session 冷启动自动注入共享内存 | FR-2, FR-4 |
| US3 | P2 | Session 退役知识归档 + 接续 | FR-5 |
| US4 | P2 | 知识库版本与新鲜度管理 | FR-3 |

> **US5 "知识库状态概览" (FR-1.5, FR-3.3) 已合并到 US1 和 US4 中**：`memory_status` 工具（T011）归入 US1 Phase；过期条目展示（T020–T021）归入 US4 Phase。不再设独立 Phase。

---

## Phase 1: Setup

**Goal**: 确认环境就绪，依赖验证，目录初始化

- [x] T001 Verify `node:sqlite` availability — run `node -e "require('node:sqlite')"` to confirm sync API usable on Node 24; if unavailable, report clear error "需要 Node.js ≥ 22"
- [x] T002 Create directory structure and `.gitignore` — ensure `.kimi-tunnel/` directory exists; add `.kimi-tunnel/memory.db` to `.gitignore`; keep `.kimi-tunnel/policies/` path for SPEC 003 compatibility

---

## Phase 2: Foundational — MemoryStore Core + Injector

**Goal**: SQLite CRUD 完成，注入拼接逻辑就绪，可独立测试。**阻塞所有 User Story。**

**Independent Test**: 在 Node REPL 中导入 `MemoryStore`，调用 `set() → get()` 验证读写一致；调用 `buildInjection(profile)` 验证返回格式化的 Markdown 前缀。

- [x] T003 [P] Define types in `src/types.ts` — add `MemoryEntry` interface (id, namespace, key, value, sourceSessionId, version, expired, createdAt, updatedAt, projectId), `InjectionProfile` type ({level, maxBytes, fromSession?}), `IMemoryStore` interface (set, get, list, delete, status, archive, resolveProjectRoot, buildInjection, close), and add `memoryStore?: IMemoryStore` to `TunnelServices`
- [x] T004 Create `src/memory-store.ts` — implement `MemoryStore` class implementing `IMemoryStore`:
  - `resolveProjectRoot(cwd)`: walk up directory tree looking for `.kimi-tunnel/` directory; return first match or null
  - `constructor()`: store db handle; lazy initialization via internal `ensureDb(root)` which opens/creates `memory.db` and runs `CREATE TABLE IF NOT EXISTS` for `project_meta` and `entries` tables per data-model.md schema
  - `set(namespace, key, value, sessionId?)`: UPSERT using `INSERT OR REPLACE`, auto-increment `version` on conflict, update `updated_at`
  - `get(namespace, key?, includeExpired?)`: SELECT with namespace filter; if key provided, exact match; return `MemoryEntry[]`
  - `list(namespace?)`: SELECT DISTINCT namespace + COUNT; if namespace param, use `LIKE 'namespace%'` prefix match
  - `delete(namespace, key)`: DELETE WHERE namespace + key exact match
  - `status()`: aggregate query — COUNT total, COUNT WHERE expired=0, COUNT WHERE expired=1, GROUP BY namespace
  - `archive(sessionId, targetNs?, keys?)`: COPY from `session/<id>/findings` to `targetNs` (default `project/learnings`), mark source as expired
  - `close()`: close db connection if open
- [x] T005 Create `src/memory-injector.ts` — export `buildInjection(store: IMemoryStore, profile: InjectionProfile): string`:
  - Resolve namespaces by level (`minimal`→project/meta, `standard`→+project/decisions, `full`→+project/risks+project/learnings)
  - Query entries for each namespace; build Markdown blocks per spec §4 format: `## 项目背景`, `## 相关决策`, `## 已知风险`, `## 前置结论`
  - Apply 8K maxBytes limit: prioritize `meta > decisions > risks > learnings > handoff`; truncate with `…(truncated, N entries omitted. Use memory_get for details)`
  - If `fromSession` set, additionally pull `session/<fromSession>/handoff`
  - Return empty string if store is null or db not opened
- [x] T006 Update `src/index.ts` — import `MemoryStore`; instantiate `new MemoryStore()`; add to `services.memoryStore` in `TunnelServices`; if environment has a CWD, attempt `memoryStore.ensureDb()` with auto-resolved project root (log success/failure to stderr)
- [x] T006a [P] Update `src/wire-client.ts` — add `Map<string, InjectionProfile>` private field; implement `setMemoryProfile(sessionId: string, profile: { level: string; cwd: string; fromSession?: string; hasExpiredEntries?: boolean })`: stores profile in Map; implement `getMemoryProfile(sessionId: string): InjectionProfile | null`: retrieves profile from Map; used by create-session (T013) and execute-prompt (T014)

---

## Phase 3: US1 — MCP CRUD Tools for PM (P1) 🎯

**Goal**: PM 可通过 MCP 工具录入、读取、管理项目知识库条目。

**Independent Test**: 调用 `memory_set("project/meta", "test", "hello")` → `memory_get("project/meta", "test")` → 返回 `{ value: "hello" }` → `memory_delete("project/meta", "test")` → 确认已删除。

- [x] T007 [P] [US1] Create `src/tools/memory-set.ts` — register `memory_set` MCP tool:
  - Parameters: `namespace` (z.string(), required), `key` (z.string(), required), `value` (z.string(), required), `session_id` (z.string(), optional)
  - Validate namespace starts with `project/` or `session/`; reject with clear error otherwise
  - Validate key is non-empty and contains no `/`
  - Call `services.memoryStore.set()`; return `{ ok: true, entry: { namespace, key, version, updated_at } }`
  - On null store: return graceful error "知识库未初始化。在项目根目录创建 .kimi-tunnel/ 目录以启用共享内存功能。"
- [x] T008 [P] [US1] Create `src/tools/memory-get.ts` — register `memory_get` MCP tool:
  - Parameters: `namespace` (z.string()), `key` (z.string(), optional), `include_expired` (z.boolean(), default false)
  - Call `services.memoryStore.get()`; format return as `{ namespace, entries: [...], count }`
  - If key specified and not found: return `{ entries: [], count: 0 }` (not an error)
- [x] T009 [P] [US1] Create `src/tools/memory-list.ts` — register `memory_list` MCP tool:
  - Parameters: `namespace` (z.string(), optional, prefix match)
  - Call `services.memoryStore.list()`; return `{ namespaces: [{ path, keys: [...], count }] }`
- [x] T010 [P] [US1] Create `src/tools/memory-delete.ts` — register `memory_delete` MCP tool:
  - Parameters: `namespace` (z.string()), `key` (z.string())
  - Permission check: query entry's `source_session_id`; if caller session differs and `force` param not set, reject with "无权删除此条目（仅创建者可删除）"
  - Call `services.memoryStore.delete()`; return `{ ok: true, deleted: "namespace/key" }`
  - On not found: return error "条目不存在: namespace/key"
- [x] T011 [P] [US1] Create `src/tools/memory-status.ts` — register `memory_status` MCP tool:
  - No parameters
  - Call `services.memoryStore.status()`; return structured status per contracts/mcp-tools.md §memory_status
- [x] T012 [US1] Update `src/mcp-server.ts` — import and register all 6 memory tools: `registerMemorySet`, `registerMemoryGet`, `registerMemoryList`, `registerMemoryDelete`, `registerMemoryStatus`, `registerMemoryArchive`

---

## Phase 4: US2 — Auto-Injection on Session Create & Execute (P1) 🎯

**Goal**: `create_session` 创建时绑定 memory profile；`execute_prompt` 自动拼接共享内存上下文为 prompt 前缀。

**Independent Test**: `memory_set("project/meta", "stack", "Node+TS")` → `create_session(cwd, memory_level="minimal")` → `execute_prompt(sid, "what stack?")` → session 收到的 prompt 包含 "Node+TS"。

- [x] T013 [US2] Update `src/tools/create-session.ts` — add parameters:
  - `memory_level`: `z.enum(["off","minimal","standard","full"]).default("standard")`
  - `from_session`: `z.string().optional()`
  - After session creation, store memory profile in wireClient's state: `wireClient.setMemoryProfile(sessionId, { level: memory_level, cwd, from_session })`
  - If level != "off": open memory db, query injected entries for `expired=1`; if any found, store `hasExpiredEntries: true` in profile for injection warning prefix
- [x] T014 [US2] Update `src/tools/execute-prompt.ts` — add `skip_memory` parameter (`z.boolean().default(false)`); before calling `wireClient.sendPrompt()`:
  - Retrieve memory profile from wireClient: `wireClient.getMemoryProfile(sessionId)`
  - If profile exists and level != "off" and !skip_memory: resolve project root from cwd → open memory db via `services.memoryStore` → call `buildInjection(store, profile)` → prepend injection text to the first content block's `text` field in the prompt's `content` array
  - Injection format: `[注入文本]\n\n---\n\n[用户原始 prompt]`
  - If profile has `hasExpiredEntries`, prepend `⚠️ 警告: 以下注入的部分条目已被 PM 标记为过期，内容可能不是最新。\n\n` before injection text
  - This injection happens at the MCP tool layer (execute-prompt.ts), modifying the prompt content before passing to wireClient — no changes to the REST API/transport layer
- [x] T015 [P] [US2] Update `src/tools/chat-with-session.ts` — add `skip_memory` parameter (same logic as T014)
- [x] T016 [P] [US2] Update `src/tools/run-flow.ts` — add `memory_level` and `from_session` parameters; pass through to `create_session` call
- [x] T017 [P] [US2] Update `src/tools/execute-workflow.ts` — add `memory_level` and `from_session` parameters; pass through to `create_session` call

---

## Phase 5: US3 — Session Retirement & Archival (P2)

**Goal**: Session 退役时将关键发现归档为项目级知识，接续 session 自动获取交接信息。

**Independent Test**: `memory_set("session/ses_abc/findings", "bug_found", "null pointer")` → `memory_archive("ses_abc")` → `memory_get("project/learnings")` 包含 "bug_found" → `create_session(cwd, from_session="ses_abc")` → execute_prompt 自动注入 handoff。

- [x] T018 [US3] Create `src/tools/memory-archive.ts` — register `memory_archive` MCP tool:
  - Parameters: `session_id` (z.string()), `target_namespace` (z.string(), default "project/learnings"), `keys` (z.array(z.string()), optional)
  - Read `session/<id>/findings` entries → insert into target namespace with key prefix `<session_id>/`
  - Mark source entries as `expired = 1`
  - Return `{ ok: true, archived: N, source, target }`
- [x] T019 [US3] Update `src/memory-injector.ts:buildInjection()` — when `fromSession` is set, additionally query `session/<fromSession>/handoff` namespace and append as "## 前置结论" block in injection text (respecting maxBytes priority order)

---

## Phase 6: US4 — Version & Freshness (P2)

**Goal**: 知识库条目维护版本号；过期标记；`memory_status` 展示过期条目。

**Implementation note**: Core version increment (SET on conflict) and expired column already exist in Phase 2 schema (T004). This phase adds the tooling and integration.

**Independent Test**: `memory_set` 两次同一 key → version 递增到 2 → `memory_status` 显示 version=2 → PM 手动标记过期 → `memory_get(include_expired=true)` 可见已过期条目。

- [x] T020 [US4] Update `src/tools/memory-set.ts` — after set, return entry with `version` and `updated_at` fields (T004 already handles version auto-increment); add `expire` param (`z.boolean().optional()`) to allow PM to explicitly mark entries as expired
- [x] T021 [US4] Update `src/tools/memory-get.ts` — when `include_expired=true`, include expired entries in results; add `expired: true` flag visibly in output for expired entries

---

## Phase 7: Polish & Cross-Cutting

**Goal**: 错误处理、边界场景、编译验证。

- [x] T022 [P] Error handling pass in `src/memory-store.ts`:
  - `ensureDb()` failure → throw descriptive error "无法访问 .kimi-tunnel/memory.db: {details}"
  - All query methods: catch SQL errors, wrap with context (which operation, which namespace)
  - `resolveProjectRoot()` returns null: throw "未找到项目根目录（缺少 .kimi-tunnel/）。请在项目根目录创建 .kimi-tunnel/ 目录。"
- [x] T023 [P] Injection boundary tests (manual verification):
  - Empty knowledge base → execute_prompt produces no prefix, prompt unchanged
  - Injection exceeds 8K → truncation message present, key entries retained
  - `skip_memory=true` → no injection
  - `memory_level="off"` → no injection
  - Missing `.kimi-tunnel/` directory → execute_prompt works normally (no crash)
- [x] T024 [P] Update `AGENTS.md` — add memory module entries: `memory-store.ts`, `memory-injector.ts`, 6 memory tools; tool count update 22→28
- [x] T025 [P] Update `README.md` — add 6 memory tool rows to MCP 工具 table; add memory quickstart section referencing `specs/002-session-memory-share/quickstart.md`
- [x] T026 Run `npm run build` to verify full compilation passes

---

## Dependency Graph

```
Phase 1: Setup (T001–T002)
    │
    ▼
Phase 2: Foundational (T003–T006) ─── blocks ALL user stories
    │
    ├──▶ Phase 3: US1 MCP CRUD (T007–T012) 🎯 MVP
    │         │
    │         └──▶ Phase 4: US2 Auto-Injection (T013–T017) 🎯 MVP
    │                   │
    │                   ├──▶ Phase 5: US3 Archival (T018–T019)
    │                   │
    │                   └──▶ Phase 6: US4 Versioning (T020–T021)
    │
    └──▶ Phase 7: Polish (T022–T026) ─── depends on ALL completed
```

US3 and US4 can be implemented in parallel after US2 is done.

---

## Parallel Execution Examples

### Batch 1: Phase 2 Foundational
```
Parallel: T003 (types.ts)
Sequential: T004 (memory-store.ts) → T005 (memory-injector.ts, depends on T003+4)
Sequential: T006 (index.ts, depends on T004)
```

### Batch 2: Phase 3 US1 (after Phase 2)
```
Parallel: T007, T008, T009, T010, T011 (5 independent MCP tool files)
Sequential: T012 (mcp-server.ts, depends on all tool registrations existing)
```

### Batch 3: Phase 4 US2 (after Phase 3)
```
Parallel: T015, T016, T017 (chat-with-session, run-flow, execute-workflow — independent files)
Sequential: T013 → T014 (create-session sets profile, execute-prompt reads it)
```

### Batch 4: Phase 5+6 (after US2, can run in parallel)
```
Parallel group A: T018 → T019 (archive tool → injector update)
Parallel group B: T020, T021 (version/freshness updates)
```

### Batch 5: Phase 7 Polish
```
Parallel: T022, T024, T025 (error handling, AGENTS.md, README — independent)
Sequential: T023 (verify) → T026 (build)
```

---

## Implementation Strategy

### MVP (Minimum Viable Product) — Phase 1+2+3+4 only

**Scope**: Knowledge base CRUD + auto-injection on session prompt. PM can input knowledge, task sessions automatically get context.

**Task count**: T001–T017 (18 tasks, ~530 行新代码)

**Delivers**:
- ✅ US1 完整实现 (6 MCP CRUD tools)
- ✅ US2 完整实现 (auto-injection on create + execute)
- ✅ SC-1 (冷启动 30K→5K)
- ✅ SC-2 (并行 session 无需重复背景)
- ✅ SC-5 (PM 2 分钟内初始化)
- 不做: session 退役归档、版本管理

### Incremental Delivery

| Iteration | Phases | Stories | New value |
|-----------|--------|---------|-----------|
| 1 (MVP) | 1+2+3+4 | US1+US2 | CRUD + 自动注入生效 |
| 2 | +5 | US3 | Session 退役归档 |
| 3 | +6 | US4 | 版本与新鲜度管理 |
| 4 | +7 | — | 错误健壮性 |

---

## File Change Summary

| Type | Count | Files |
|------|:--:|------|
| New files | 8 | `memory-store.ts`, `memory-injector.ts`, `memory-set.ts`, `memory-get.ts`, `memory-list.ts`, `memory-delete.ts`, `memory-status.ts`, `memory-archive.ts` |
| Modified files | 9 | `types.ts`, `index.ts`, `mcp-server.ts`, `wire-client.ts`, `create-session.ts`, `execute-prompt.ts`, `chat-with-session.ts`, `run-flow.ts`, `execute-workflow.ts` |

---

## Success Criteria Traceability

| SC | Criteria | Verified By |
|----|----------|:--:|
| SC-1 | 冷启动 30K→5K (减少 83%+) | T014 + T023 |
| SC-2 | 并行 session 无需重复背景 | T013 + T017 |
| SC-3 | 退役后 1 分钟内可获取发现 | T018 + T019 |
| SC-4 | 1000 条记录, 查询 <500ms | T004 (SQLite 本地 SSD) |
| SC-5 | PM 2 分钟内初始化录入 | T007 |

---

## Task Summary

| Phase | Tasks | Count |
|-------|-------|:--:|
| Phase 1: Setup | T001–T002 | 2 |
| Phase 2: Foundational | T003–T006a | 5 |
| Phase 3: US1 CRUD Tools | T007–T012 | 6 |
| Phase 4: US2 Auto-Injection | T013–T017 | 5 |
| Phase 5: US3 Archival | T018–T019 | 2 |
| Phase 6: US4 Versioning | T020–T021 | 2 |
| Phase 7: Polish | T022–T026 | 5 |
| **Total** | | **27** |

---

## Format Validation

- ✅ All tasks use `- [ ]` checkbox format
- ✅ All tasks have sequential IDs (T001–T026)
- ✅ [P] marker applied to parallelizable tasks
- ✅ [US*] labels on all user story phase tasks
- ✅ File paths included in all implementation tasks
- ✅ No test tasks (not requested in spec)
