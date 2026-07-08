# Research: 记忆注入策略升级

**Feature**: `004-memory-lazy-inject`
**Date**: 2026-07-08
**Status**: Complete

---

## 1. Index Format

**Decision**: Markdown table with `namespace | keys | suggestion` columns.

**Rationale**:
- AI models parse Markdown tables naturally — structured, scannable
- `suggestion` column ("必读"/"按需") replaces PM's manual judgment of what to pre-read
- Compatible with existing `##` block structure in `buildInjection()`
- Tested in conversation: task session correctly parsed manual index table and called `memory_get` accordingly

**Alternatives**:

| Option | Pros | Cons | Verdict |
|--------|------|------|:--:|
| JSON key list | Machine-readable | AI less fluent with JSON in natural-language prompt | ❌ |
| Bullet list | Simplest | No structure for read suggestions | ❌ |
| **Markdown table** | AI-friendly, scannable, supports suggestion column | Slightly longer than bullet list (~+30B) | ✅ |

---

## 2. Read Suggestion Classification

**Decision**: Static mapping per namespace level:
- `project/meta` → "必读" (project fundamentals always relevant)
- `project/decisions` → "必读" (architectural decisions affect all work)
- `project/risks` → "按需" (only relevant when touching risky areas)
- `project/learnings` → "按需" (historical lessons, context-dependent)

**Rationale**:
- Deterministic: session needs no AI judgment to decide what to read first
- PM convention-aligned: meta + decisions = project baseline, risks + learnings = contextual
- Low complexity: hardcoded mapping, no per-key analysis needed

**Alternatives**:

| Option | Pros | Cons | Verdict |
|--------|------|------|:--:|
| AI-per-key suggestion | Dynamic, adaptive | Inconsistent, adds analysis complexity | ❌ |
| Expire-flag-based priority | Data-driven | Over-engineered for 4 namespace scale | ❌ |
| PM-configured per-entry | Flexible | Adds PM burden, configuration storage | ❌ |

---

## 3. Collapse Threshold

**Decision**: 20 total entries across all `full`-level namespaces triggers collapse.

**Rationale**:
- `full` = 4 namespaces, average 5 entries each = 20 is realistic max for well-maintained projects
- Table becomes visually noisy beyond 20 rows in prompt context
- Collapse to namespace-name-only + entry count: preserves discoverability without noise

**Threshold derivation**: `minimal` (1 NS) × 5 + `standard` (2 NS) × 5 + `full` extra (2 NS) × 5 = 20. Adding buffer for growth = 20 threshold is conservative but sufficient.

---

## 4. Role Anchor Text

**Decision**: `[系统注入] 你是任务 session。` as injection prefix.

**Rationale**:
- "你是任务 session" establishes execution mode — session understands it needs to self-orient
- Maintains `[系统注入]` marker for traceability in wire logs
- Short (14 chars) — minimal overhead
- Validated: prior test session responded correctly to index + role anchor

**Alternatives**:

| Option | Pros | Cons | Verdict |
|--------|------|------|:--:|
| No role anchor | Zero overhead | Session may not realize it should self-read | ❌ |
| Long role description | Detailed guidance | Wastes context, redundant with index | ❌ |
| **Short role + index** | Minimal, actionable | — | ✅ |

---

## 5. Implementation Approach

**Decision**: Rewrite `MemoryStore.buildInjection()` (single function, ~70 lines → ~90 lines).

**Rationale**:
- All injection logic centralized in one method — no need to touch `memory-injector.ts` (thin wrapper) or `execute-prompt.ts` (consumer)
- Interface unchanged: `buildInjection(profile: InjectionProfile): string`
- Zero migration: `memory.db` schema, MCP tool signatures, parameter semantics all preserved

**Risk**: None. Pure function rewrite, backward-compatible output format change.
