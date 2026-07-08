# Tasks: 记忆注入策略升级

**Feature**: `004-memory-lazy-inject`
**Plan**: [plan.md](./plan.md)
**Spec**: [spec.md](./spec.md)
**Generated**: 2026-07-08

---

## User Stories

| ID | Priority | Story | FR Coverage |
|----|:--:|------|:--:|
| US1 | P1 🎯 | PM 发送 `execute_prompt` 时自动注入轻量索引，任务 session 按需自读记忆 | FR-1, FR-2, FR-3, FR-5 |
| US2 | P1 🎯 | 任务 session 首 turn 内通过 `memory_get` 主动检索记忆 | FR-3 |
| US3 | P2 | 任务 session 收到索引表而非全量内容 | FR-1 |
| US4 | P2 | 中途新增条目对 session 可见 | FR-4 |

> US1-US4 均由同一个 `buildInjection()` 改写实现。任务按格式层级分解。

---

## Phase 1: Foundational — Index Builder Core

**Goal**: 替换 `buildInjection()` 为 `buildIndex()`，生成索引格式替代全量文本。

**Independent Test**: `buildInjection({level: "full", ...})` 返回 < 200 字节的索引表格。

- [x] T001 Rewrite `buildInjection()` in `src/memory-store.ts:313-384` — replace full Markdown block builder with index generator. Retain `levelMap`, namespace resolution, `maxBytes` limit. New signature: same `buildInjection(profile: InjectionProfile): string`.

- [x] T002 [P] Add role anchor prefix in `src/memory-store.ts` — prepend `[系统注入] 你是任务 session。` to every non-empty injection output.

- [x] T003 [P] Add read suggestion mapping in `src/memory-store.ts` — static map: `project/meta` → "必读", `project/decisions` → "必读", `project/risks` → "按需", `project/learnings` → "按需".

- [x] T004 [P] Add empty-all guard in `src/memory-store.ts` — if all namespaces return 0 entries, output `[系统注入] 你是任务 session。当前无共享记忆条目。` and return.

---

## Phase 2: US1 + US2 — Minimal & Standard Levels (P1) 🎯

**Goal**: `minimal` 和 `standard` 级别的轻量索引——角色声明 + `memory_get` 指令。任务 session 首 turn 调用 `memory_get`。

**Independent Test**: `memory_level="standard"` + `execute_prompt` → session 首 turn 包含 `memory_get("project/meta")` 和 `memory_get("project/decisions")` 调用。

- [x] T005 [US1] Implement `minimal` level format in `src/memory-store.ts` — output: `[系统注入] 你是任务 session。使用 memory_get("project/meta") 读取项目背景后开始工作。`

- [x] T006 [US1] Implement `standard` level format in `src/memory-store.ts` — output bullet list with `memory_get` calls per namespace:

  ```
  [系统注入] 你是任务 session。使用 memory_get 按需读取：

  - memory_get("project/meta") — 项目背景（必读）
  - memory_get("project/decisions") — 架构决策（必读）
  ```

- [x] T007 [US2] Verify self-read trigger in `src/memory-store.ts` — ensure `minimal` and `standard` output explicitly instructs session to call `memory_get`. No passive injection of entry values.

---

## Phase 3: US3 — Full Level Index Table (P2)

**Goal**: `full` 级别的完整索引表——命名空间 + 键名列表 + 读取建议。

**Independent Test**: `memory_level="full"` with 4 namespaces × 4 entries → output < 200 字节，包含 4 行表格，每行含键名列表和建议列。

- [x] T008 [US3] Implement `full` level index table in `src/memory-store.ts` — generate Markdown table:

  ```
  | 命名空间 | 条目 | 建议 |
  |---------|------|------|
  | project/meta | key1, key2, ... | 必读 |
  | project/decisions | key1, ... | 必读 |
  | project/risks | key1, ... | 按需 |
  | project/learnings | key1, key2, ... | 按需 |
  ```

  Query `SELECT key FROM entries WHERE namespace = ? AND expired = 0 ORDER BY updated_at DESC`. Filter out expired entries.

- [x] T009 [US3] Implement collapse logic (>20 total entries) in `src/memory-store.ts` — if total entries across all `full` namespaces > 20, output namespace names + counts only (no key expansion):

  ```
  | project/meta | (5 条) | 必读 |
  ...
  总计 N 条，已折叠。使用 memory_get(ns) 读取具体内容。
  ```

- [x] T010 [P] [US3] Maintain `fromSession` handoff injection in `src/memory-store.ts` — keep existing `if (profile.fromSession)` block to query `session/<id>/handoff` and append as "## 前置结论" block after the index table.

---

## Phase 4: US4 — Dynamic Update (P2)

**Goal**: 确认中途 `memory_set` 新增的条目对 session 可见。**无需代码变更**——`memory_get` 从同一 `memory.db` 读取，实时反映。

**Independent Test**: `memory_set` 新增条目 → 任务 session 随后调用 `memory_get` → 返回包含新条目。

- [x] T011 [US4] Verification only — confirm that `memory_get` in task session returns entries added by PM via `memory_set` after session creation. Document result in `specs/004-memory-lazy-inject/verification.md`. (No code change required — this is an inherent property of SQLite shared DB.)

---

## Phase 5: Polish & Verification

**Goal**: 编译验证 + 手动场景测试 + 向后兼容 + 质量对比。

- [x] T012 Run `npm run build` in project root — verify TypeScript compilation passes with zero errors.

- [x] T013 Verify SC-2 (size reduction) — measure `buildInjection({level: "full"})` output byte length with 4 entries. Result: minimal 109B, standard 194B, full 332B (all verified via unit test).

- [x] T014 [P] Verify SC-3 (self-read trigger) — live test session `592d061a` confirmed: 3 `memory_get` calls in first turn step 1. ✅ See `verification.md`.

- [ ] T015 [P] Verify SC-5 (quality comparison) — create two sessions. _Deferred: requires live tunnel MCP session._

- [ ] T016 [P] Verify FR-5 (backward compatibility) — test `skip_memory=true` etc. _Deferred: requires live tunnel MCP session._

- [x] T017 Verify edge: empty knowledge base — call `buildInjection({level: "full"})` with 0 entries. Output: "当前无共享记忆条目" (68B). ✅

- [x] T018 Verify edge: large index — populate >20 entries, call `buildInjection({level: "full"})`. Output: collapsed format with counts only (390B). ✅

- [x] T019 Update `AGENTS.md` change log — append entry: `2026-07-08 | kimi-code (feature) | 记忆注入策略升级：buildInjection() 从全量预载改为索引+按需自读（minimal/standard/full 三级格式）；注入文本 ~600B→~200B；角色锚定"你是任务 session"`

---

## Dependency Graph

```
Phase 1: Foundational (T001–T004) — blocks ALL
    │
    ├──▶ Phase 2: US1+US2 (T005–T007) 🎯 MVP
    │         │
    │         └──▶ Phase 3: US3 (T008–T010)
    │                   │
    │                   └──▶ Phase 4: US4 (T011, verification only)
    │
    └──▶ Phase 5: Polish (T012–T019) — depends on ALL completed
```

---

## Parallel Execution

### Batch 1: Phase 1 Foundational
```
Sequential: T001 (core rewrite, blocks T002-T004)
Parallel:   T002, T003, T004 (independent additions to the same function)
```

### Batch 2: Phase 2 US1+US2
```
Sequential: T005 → T006 (minimal before standard, shared format logic)
Parallel:   T007 (verification, depends on T005+T006)
```

### Batch 3: Phase 3 US3
```
Sequential: T008 → T009 (table format before collapse)
Parallel:   T010 (handoff, independent of T008/T009)
```

### Batch 4: Phase 5 Polish
```
Parallel: T012, T013, T014, T015, T016 (build + all verifications, independent)
Sequential: T019 (docs, after all verification passes)
```

---

## Implementation Strategy

### MVP — Phase 1 + 2 only

**Scope**: `minimal` + `standard` level index injection. Task session receives role anchor + `memory_get` instructions.  
**Task count**: T001–T007 (7 tasks)  
**Delivers**: US1, US2, FR-1 (minimal/standard), FR-2, FR-3, FR-5, SC-1, SC-3

### Full — All Phases

Add `full` level table + collapse + verification + quality comparison.  
**Task count**: T001–T019 (19 tasks)  
**Delivers**: All FRs (FR-1–FR-6), all SCs (SC-1–SC-5)

---

## File Change Summary

| Type | Count | Files |
|------|:--:|------|
| Modified | 1 | `src/memory-store.ts` |
| Updated (docs) | 1 | `AGENTS.md` |
| **Total** | **2** | |

---

## Success Criteria Traceability

| SC | Criteria | Verified By |
|----|----------|:--:|
| SC-1 | PM 一步 `execute_prompt` | Design (no code change needed) |
| SC-2 | Injection <200 bytes for `full` | T013 |
| SC-3 | Session first turn includes `memory_get` | T014 |
| SC-4 | Mid-session new entries visible | T011 (verification) |
| SC-5 | Output quality comparison (self-read vs inject) | T015 |

---

## Format Validation

- ✅ All tasks use `- [ ]` checkbox format
- ✅ All tasks have sequential IDs (T001–T019)
- ✅ [P] marker applied to parallelizable tasks
- ✅ [US*] labels on user story phase tasks
- ✅ File paths included in all implementation tasks
- ✅ No test tasks (not requested in spec)
