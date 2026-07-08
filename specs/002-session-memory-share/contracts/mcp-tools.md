# MCP Tool Contracts: 任务 Session 冷启动记忆共享

**Feature**: `002-session-memory-share`
**Date**: 2026-07-07

---

## Tool: `memory_set`

**Description**: 写入一条键值对到指定命名空间，自动记录写入时间和来源 session。若 key 已存在则覆盖（upsert），version 递增。

### Parameters

| Name | Type | Required | Description |
|------|------|:--:|------|
| `namespace` | `string` | ✅ | 命名空间路径，如 `project/meta`、`session/abc123/findings` |
| `key` | `string` | ✅ | 条目键名，不含 `/`，如 `tech_stack`、`coding_conventions` |
| `value` | `string` | ✅ | 条目值，可为 JSON 字符串或纯文本 |
| `session_id` | `string` | ❌ | 来源 session ID，用于追踪。默认由 AI 从当前上下文获取 |

### Response

```json
{
  "ok": true,
  "entry": {
    "namespace": "project/meta",
    "key": "tech_stack",
    "version": 1,
    "updated_at": "2026-07-07T12:00:00Z"
  }
}
```

### Errors

| Code | Message |
|------|---------|
| `INVALID_NAMESPACE` | 命名空间必须以 project/ 或 session/ 开头 |
| `INVALID_KEY` | key 不能为空或包含 / |
| `EMPTY_VALUE` | value 不能为空 |
| `DB_ERROR` | 数据库操作失败: {details} |

---

## Tool: `memory_get`

**Description**: 读取指定命名空间下的条目。不指定 key 则返回全部条目。

### Parameters

| Name | Type | Required | Description |
|------|------|:--:|------|
| `namespace` | `string` | ✅ | 命名空间路径 |
| `key` | `string` | ❌ | 条目键名，省略返回该 namespace 下全部条目 |
| `include_expired` | `boolean` | ❌ | 是否包含已过期条目，默认 false |

### Response

```json
{
  "namespace": "project/meta",
  "entries": [
    {
      "key": "tech_stack",
      "value": "{\"language\":\"TypeScript\",\"runtime\":\"Node 18+\"}",
      "version": 1,
      "expired": false,
      "updated_at": "2026-07-07T12:00:00Z"
    }
  ],
  "count": 1
}
```

---

## Tool: `memory_list`

**Description**: 列出指定命名空间下所有键名，不含值体。支持前缀匹配快速浏览。

### Parameters

| Name | Type | Required | Description |
|------|------|:--:|------|
| `namespace` | `string` | ❌ | 命名空间前缀。省略列出所有顶级命名空间 |

### Response

```json
{
  "namespaces": [
    {
      "path": "project/meta",
      "keys": ["tech_stack", "coding_conventions", "directory_structure"],
      "count": 3
    },
    {
      "path": "project/decisions",
      "keys": ["use_sqlite_for_memory"],
      "count": 1
    }
  ]
}
```

---

## Tool: `memory_delete`

**Description**: 删除指定键。仅 PM（统筹 session）或写入者可删除。

### Parameters

| Name | Type | Required | Description |
|------|------|:--:|------|
| `namespace` | `string` | ✅ | 命名空间路径 |
| `key` | `string` | ✅ | 要删除的键名 |

### Response

```json
{
  "ok": true,
  "deleted": "project/meta/tech_stack"
}
```

### Errors

| Code | Message |
|------|---------|
| `NOT_FOUND` | 条目不存在: project/meta/unknown_key |
| `PERMISSION_DENIED` | 无权删除此条目（非创建者） |

---

## Tool: `memory_status`

**Description**: 查看当前项目知识库整体状态：条目数、最后更新时间、过期条目列表。

### Parameters

None.

### Response

```json
{
  "project_root": "D:/code/kimi-debug-tunnel",
  "db_path": "D:/code/kimi-debug-tunnel/.kimi-tunnel/memory.db",
  "total_entries": 12,
  "active_entries": 10,
  "expired_entries": 2,
  "namespaces": {
    "project/meta": 3,
    "project/decisions": 2,
    "project/risks": 5,
    "project/learnings": 1,
    "session/ses_abc/findings": 1
  },
  "last_updated": "2026-07-07T14:30:00Z"
}
```

---

## Tool: `memory_archive`

**Description**: 将指定 session 的 L2 findings 归档为 L1 learnings。PM 审查后调用。

### Parameters

| Name | Type | Required | Description |
|------|------|:--:|------|
| `session_id` | `string` | ✅ | 要归档的源 session ID |
| `target_namespace` | `string` | ❌ | 目标命名空间，默认为 `project/learnings` |
| `keys` | `string[]` | ❌ | 指定要归档的键名，省略则归档该 session 全部 findings |

### Response

```json
{
  "ok": true,
  "archived": 3,
  "source": "session/ses_abc/findings",
  "target": "project/learnings"
}
```

---

## Modified Tool: `create_session`

**新增参数**:

| Name | Type | Required | Description |
|------|------|:--:|------|
| `memory_level` | `"off" \| "minimal" \| "standard" \| "full"` | ❌ | 冷启动内存注入级别。默认 `"standard"` |
| `from_session` | `string` | ❌ | 接续的前置 session ID，自动拉取其 handoff 信息 |

---

## Modified Tool: `execute_prompt`

**新增行为**:
1. 检查 session 是否绑定了 memory profile
2. 若有，从 `.kimi-tunnel/memory.db` 拉取对应命名空间的条目
3. 拼接为结构化前缀，注入到 prompt 内容之前
4. 注入量受 `maxBytes`（默认 8K）限制，超过截断并附提示

**新增参数**:

| Name | Type | Required | Description |
|------|------|:--:|------|
| `skip_memory` | `boolean` | ❌ | 跳过内存注入，默认 false |

---

## Modified Tool: `chat_with_session`

同 `execute_prompt`，新增 `skip_memory` 参数。

---

## Modified Tool: `run_flow`

新增 `memory_level` 和 `from_session` 参数，透传到 `create_session`。
