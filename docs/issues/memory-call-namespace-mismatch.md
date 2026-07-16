# [FIXED] Skill 中 memory_get/set 调用参数格式错误

## 现象

`session-retire` 接班 session 手动调用 `memory_get` 读取 handoff 数据返回空，但数据已验证存在（`memory_status` 确认），`fromSession` 注入也正常（`buildInjection()` 用正确 namespace）。

## 根因

两类系统性格式错误：

### A: `memory_get` 位置参数（v2.8 曾修复，v2.11 loop-orchestrator 回归）

```diff
- memory_get("project/meta")          # 位置参数——与 memory MCP 工具名冲突
+ memory_get(namespace="project/meta") # 命名参数——明确路由到 kimi-session-orchestrator
```

### B: `memory_set` 把 key 拼进 namespace

```diff
- memory_set("session/<id>/handoff", key="completed", value="...")  # 正确
- 但 skill 写成了:
- memory_set("session/<id>/handoff/completed", value)  # ❌ namespace 包含 key

+ memory_get(namespace="session/<id>/handoff/completed")  # ❌ 查不到
+ memory_get(namespace="session/<id>/handoff")            # ✅ 返回全部 entries
```

`memory_set` 的 `key` 参数不含 `/`（代码强制校验），所以 `session/<id>/handoff/plan` 作为 namespace 合法但语义错误——数据存到了 `namespace="session/<id>/handoff/plan"` 而非 `namespace="session/<id>/handoff" + key="plan"`。

## 受影响文件

| skill | 文件 | 类型 | 修复数 |
|-------|------|:--:|:--:|
| session-retire | SKILL.md | B | 3→1 |
| loop-orchestrator | guide-loop-core.md | A+B | 8 |
| loop-orchestrator | guide-loop-memory.md | A+B | 7 |
| loop-orchestrator | SKILL.md | B | 1 |
| loop-orchestrator | guide-loop-blockage.md | B | 1 |

## 修复原则

Skill 中的 MCP 工具调用伪代码应使用**命名参数 + 与工具签名一致的参数结构**：

```
✅ memory_get(namespace="project/meta")
✅ memory_set(namespace="session/x", key="plan", value="<JSON>")
✅ memory_archive(session_id="<id>")

❌ memory_get("project/meta")           # 位置参数
❌ memory_set("session/x/plan", json)   # key-in-ns
```

## 时间线

- 2026-07-11: v2.8 修复 `buildInjection()` 注入文本 `memory_get("ns")` → `memory_get(namespace="ns")`
- 2026-07-15: v2.11 loop-orchestrator skill 独立，引入回归（沿用旧格式）
- **2026-07-16: 修复全部 6 文件 17 处。部署到用户 skill 目录。**
