# Quickstart: 记忆注入策略升级

**Feature**: `004-memory-lazy-inject`
**Requires**: SPEC 002 已实施

---

## 变更概览

此特性将记忆注入从"全量预载"改为"索引 + 按需自读"。PM 不再需要预先读取记忆，任务 session 自主调用 `memory_get`。

## 使用方式

### 之前（全量注入）

<!-- ⚠️ v2.12.1 修正：本文档中 memory_get("ns") 为设计草案伪代码，实际调用须使用命名参数 memory_get(namespace="ns")。详见 docs/issues/memory-call-namespace-mismatch.md -->

```
PM 操作:
  1. memory_get("project/meta")     ← 手动查记忆
  2. memory_get("project/decisions") ← 手动查记忆
  3. execute_prompt(prompt)         ← 注入拼接全量内容
```

### 之后（索引注入）

```
PM 操作:
  1. execute_prompt(prompt)  ← 仅此一步，自动注入索引
     (memory_level="full" 默认)

任务 session 首 turn:
  1. 收到索引 → 评估 → memory_get("project/meta")
  2. memory_get("project/decisions")
  3. 基于记忆执行任务
```

## 注入格式速查

| `memory_level` | PM 操作 | 注入内容 |
|---------------|---------|---------|
| `off` | `memory_level="off"` | 无注入 |
| `minimal` | 默认 | "你是任务 session。使用 memory_get(project/meta)" |
| `standard` | `memory_level="standard"` | 命名空间列表（meta + decisions），标注必读 |
| `full` | `memory_level="full"` | 完整索引表（4 命名空间，键名 + 建议） |

## 验证

```bash
# 1. 创建 session
create_session(cwd=项目路径, memory_level="full")

# 2. 发送任务（无需前置 memory_get）
execute_prompt(session_id, "审查 src/types.ts", auto_mode=true)

# 3. 检查 wire log
read_session_log(session_id)
# → 注入前缀为索引格式（~200B），不含全量值
# → session 首 turn 包含 memory_get 工具调用
```

## 回退

若需使用旧版全量注入行为：恢复 `buildInjection()` 到 SPEC 002 实现。数据模型和 MCP 工具无需变更。
