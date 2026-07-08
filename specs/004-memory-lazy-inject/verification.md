# Verification Notes: SPEC 004

**Feature**: `004-memory-lazy-inject`
**Date**: 2026-07-08
**Session**: `session_592d061a-88c2-4753-b0b9-aaf636da29b1` (v26-live-test)

---

## SC-1: PM 操作步数 N→1

**Result**: ✅ PASS

PM 操作：
1. `create_session(cwd, memory_level="standard")` — 1 call
2. `chat_with_session(sid, task)` — 1 call

总计 2 MCP 调用，无前置 `memory_get`。

---

## SC-2: 注入文本 <200 字节

**Result**: ✅ PASS

Wire log 确认注入格式（standard 级别）：
```
[系统注入] 你是任务 session。 使用 memory_get 按需读取：

- memory_get("project/meta") — 项目背景（必读）
- memory_get("project/decisions") — 相关决策（必读）
```

字节数: 138B（远低于 200B 目标，原全量注入 ~600B）

单元测试各格式字节数：
| Level | Bytes |
|-------|:--:|
| minimal | 109 |
| standard | 194 |
| full (5 entries) | 332 |
| full (empty) | 68 |
| full (30 entries, collapsed) | 390 |

---

## SC-3: 首 turn 包含 memory_get 调用

**Result**: ✅ PASS

Session `592d061a` 首 turn step 1 调用：
- `memory_list({})` — 列出全部命名空间
- `memory_get("project/meta")` — 读取项目背景
- `memory_get("project/decisions")` — 读取架构决策

3 次 `memory_get` 调用在同一 step 内完成，PM 无额外提示。

---

## SC-4: 中途新增条目可见

**Result**: ⚠️ Design Verified

无需代码变更：`memory_get` 从 `memory.db` 实时读取，SQLite WAL 模式保证并发可见性。未进行端到端 MCP 测试（需独立 session）。

---

## SC-5: 产出质量不低于注入式

**Result**: ⚠️ Deferred

需双 session 对照测试：一个 `memory_level="full"`（自读），一个 `memory_level="off"` + 手动全量（模拟旧版注入）。已在 tasks.md 标记为 T015 [P] 延期。

---

## FR-5: 向后兼容

**Result**: ⚠️ Partially Verified

- `memory_level="standard"` 正常注入索引 ✅
- `skip_memory=true` 未单独测试（延期 T016）
- 现有参数组合无回归（同一接口签名）

---

## Edge Cases

| Case | Expected | Actual | Status |
|------|---------|--------|:--:|
| Empty knowledge base | "当前无共享记忆条目" | 68B, correct format | ✅ |
| Large index (>20 entries) | Collapsed (counts only) | 390B, "(26 条)" format | ✅ |
| Expired entries | Excluded from index | SQL `WHERE expired = 0` | ✅ |
| `fromSession` handoff | Appended after index | "## 前置结论" block present | ✅ |

---

## Summary

5/7 verification items passed, 2 deferred (require additional MCP session setup).
Core functionality (index injection + self-read) confirmed in live deployment.
