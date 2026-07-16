# Implementation Plan: 记忆注入策略升级

**Feature**: `004-memory-lazy-inject`
**Plan Version**: 1.0
**Created**: 2026-07-08
**Status**: Ready for implementation
**Spec**: [spec.md](./spec.md)

---

## Technical Context

**Change Type**: Enhancement — modify existing `buildInjection()` logic, zero new files  
**Affected Modules**: `src/memory-store.ts` (primary), no MCP tool or API surface changes  
**Risk Level**: Low — single-function rewrite, backward-compatible parameter semantics

### Target State

| Component | Current | After |
|-----------|---------|-------|
| `buildInjection()` output | Full Markdown blocks with entry values (~600B for `full`) | Index table with role anchor (~200B for `full`) |
| `memory_level` params | Unchanged | Unchanged |
| `skip_memory` | Unchanged | Unchanged |
| All other tools | Unchanged | Unchanged |

---

## Constitution Check

> Project constitution not defined in `.specify/memory/constitution.md`. Applying project conventions from `AGENTS.md`.

| Principle | Compliance |
|-----------|:--:|
| **依赖注入 (DI)** | ✅ `buildInjection` receives `IMemoryStore` via parameter |
| **深模块优先** | ✅ Interface unchanged (`buildInjection(profile) → string`), only implementation changes |
| **单一职责** | ✅ `buildInjection` remains single-purpose: generate injection text |
| **Guard Clauses** | ✅ Edge cases (empty NS, >20 entries, expired filter) handled with early returns |
| **TypeScript strict** | ✅ No `any`, explicit return type `string` |
| **Minimal changes** | ✅ 1 file, 1 function rewrite; no cascade |

---

## Phase 0: Research

### Decision 1: Index Format

**Chosen**: Markdown table with namespace/keys/suggestion columns.

**Rationale**:
- Tables parse cleanly for AI models (structured, easy to scan)
- `read_suggestion` column replaces PM's manual judgment of "必读/按需"
- Compatible with existing `##` Markdown block structure

**Alternatives considered**:
| Option | Pros | Cons | Verdict |
|--------|------|------|:--:|
| JSON key list | Machine-readable | AI less natural with raw JSON in prompt | ❌ |
| Plain text list | Simplest | No structure for read suggestions | ❌ |
| Markdown table | AI-friendly, scannable | Slightly longer than plain text | ✅ |

### Decision 2: Read Suggestion Logic

**Chosen**: Hardcoded mapping per namespace: `project/meta` + `project/decisions` → "必读", `project/risks` + `project/learnings` → "按需".

**Rationale**:
- Predictable: session doesn't need AI judgment to decide what to read
- PM-established convention: meta/decisions always relevant, risks/learnings contextual
- Simple: no dynamic analysis needed

**Alternatives considered**:
| Option | Pros | Cons | Verdict |
|--------|------|------|:--:|
| AI-assigned per key | Adaptive | Inconsistent, adds complexity | ❌ |
| Tag-based (expire flag) | Dynamic | Over-engineering for 4 namespaces | ❌ |

### Decision 3: Truncation Threshold

**Chosen**: 20 total entries across all `full`-level namespaces.

**Rationale**:
- `full` level = 4 namespaces, average 5 entries each = 20 typical max
- Table becomes unwieldy beyond 20 rows in prompt context
- Collapse to namespace-name-only list (no key expansion)

---

## Phase 1: Design

### Data Model

No schema changes. The injection index is read-only view data, generated from existing `entries` table.

**Index generation query** (pseudo):
```
FOR ns IN levelMap[profile.level]:
  entries = SELECT key FROM entries WHERE namespace = ns AND expired = 0
  IF total entries across all NS > 20: COLLAPSE to NS names only
  ELSE: include key list + suggestion
```

### Injection Format Specification

#### `minimal`

<!-- ⚠️ 以下注入文本为设计草案格式。v2.8 起 memory-store.ts buildInjection() 实际输出已改为 memory_get(namespace="project/meta") 命名参数格式。详见 docs/issues/memory-call-namespace-mismatch.md -->

```
[系统注入] 你是任务 session。使用 memory_get("project/meta") 读取项目背景后开始工作。
```

#### `standard`

```
[系统注入] 你是任务 session。使用 memory_get 按需读取：

- memory_get("project/meta") — 项目背景（必读）
- memory_get("project/decisions") — 架构决策（必读）
```

#### `full`

```
[系统注入] 你是任务 session。以下记忆条目可用，请用 memory_get 按需读取：

| 命名空间 | 条目 | 建议 |
|---------|------|------|
| project/meta | key1, key2, key3 | 必读 |
| project/decisions | key1 | 必读 |
| project/risks | key1 | 按需 |
| project/learnings | key1, key2 | 按需 |

条目数 > 20 时折叠：

| 命名空间 | 条目 | 建议 |
|---------|------|------|
| project/meta | (5 条) | 必读 |
| project/decisions | (3 条) | 必读 |
| project/risks | (8 条) | 按需 |
| project/learnings | (12 条) | 按需 |

总计 28 条，已折叠。使用 memory_get(ns) 读取具体内容。
```

#### Empty namespace

若某命名空间无条目，注入文本中不列出该命名空间。若所有命名空间均空：

```
[系统注入] 你是任务 session。当前无共享记忆条目。
```

### Contract (MCP Tool Surface)

No changes to MCP tool signatures. `execute_prompt` and `chat_with_session` parameters unchanged. The output of `buildInjection()` changes transparently — consumers (`execute-prompt.ts:103`) receive a different string but the interface (`buildInjection(profile) → string`) is identical.

### Implementation Map

```
src/memory-store.ts:313-384  buildInjection()
  │
  ├─ [REPLACE] Full Markdown block builder
  │            → Index table generator
  │
  ├─ [ADD]    Role anchor prefix: "你是任务 session"
  ├─ [ADD]    Read suggestion mapping per namespace
  ├─ [ADD]    Collapse logic (>20 entries)
  ├─ [ADD]    Empty-all guard
  │
  └─ [KEEP]   levelMap, namespace resolution
              maxBytes limit, handoff injection
```

### Files Changed

| File | Change | Lines |
|------|--------|:--:|
| `src/memory-store.ts` | Rewrite `buildInjection()` | ~70 → ~90 |

**Zero files added, zero MCP tool changes, zero migration.**

---

## Verification Plan

| SC | Test | Expected |
|----|------|---------|
| SC-1 | `execute_prompt` without prior `memory_get` | PM sends 1 MCP call, session receives index |
| SC-2 | Measure injection text length for `full` level with 4 entries | < 200 bytes |
| SC-3 | Task session first turn tool calls | Contains `memory_get` calls |
| SC-4 | `memory_set` new entry mid-session → session calls `memory_get` | New entry visible |
| SC-5 | Session produces code following conventions from self-read memory | Review passes |
| Edge: empty | `full` level with 0 entries | "无共享记忆条目" message |
| Edge: large | `full` level with 25 entries | Collapsed: namespace names + counts only |

---

## Risk Assessment

| Risk | Probability | Mitigation |
|------|:--:|------|
| Session ignores index, doesn't call `memory_get` | Low | Role anchor "你是任务 session" strongly prompts self-read; validated in SC-3 |
| Index format not understood by AI | Very Low | Table format is standard Markdown; tested in prior session with manual index prompt |
| `full` → `standard` → `minimal` regression | None | `memory_level` semantics unchanged; only injection format changes |
