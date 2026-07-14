# Phase 1: Data Model — 权限策略引擎

**Feature**: `003-permission-policy`
**Date**: 2026-07-07

---

## 实体定义

### 1. Policy（策略）

策略定义一组工具权限规则。可为内置级别或 YAML 文件。

| 字段 | 类型 | 必填 | 描述 |
|------|------|:--:|------|
| `name` | `string` | ✅ | 策略唯一标识。内置: `"read-only"` / `"safe-edit"` / `"full-access"`；自定义: 文件名（不含 .yaml）|
| `version` | `string` | ✅ | 策略版本号，语义化（如 `"1.0"`）|
| `defaultAction` | `"allow"` \| `"deny"` | ✅ | 未匹配规则时的默认动作 |
| `rules` | `PolicyRule[]` | ✅ | 规则列表，按顺序匹配（先匹配先生效）|
| `source` | `"builtin"` \| `"file"` | ✅ | 来源类型 |
| `filePath` | `string?` | ❌ | 自定义策略的文件路径（仅 `source="file"`）|

**验证规则**:
- `name`: 只能包含字母、数字、连字符，1-64 字符
- `rules`: 至少一条规则
- `defaultAction` 为 `"deny"` 时，必须至少有一条 `action=allow` 的规则

**状态**: 无状态迁移。策略在 session 创建时绑定，生命周期内不可变。

---

### 2. PolicyRule（策略规则）

单条权限规则。按列表顺序匹配，第一个匹配的规则生效。

| 字段 | 类型 | 必填 | 描述 |
|------|------|:--:|------|
| `name` | `string` | ✅ | 规则名称（用于阻断消息引用，如 `"allow-read-tools"`）|
| `action` | `"allow"` \| `"deny"` \| `"require_approval"` | ✅ | 匹配时的动作 |
| `tools` | `string[]` | ✅ | 工具名列表（kimi-code 内置工具名，如 `"Read"` `"Bash"`）|
| `message` | `string?` | ❌ | 阻断时返回给 session 的说明消息 |

**验证规则**:
- `tools`: 非空数组，每个元素为非空字符串
- `name`: 1-128 字符，策略内唯一
- `message`: 最大 500 字符

---

### 3. BlockEvent（阻断事件）— v2.8 废弃

> **v2.8**: `approveAll()` 自动裁决引擎已移除。阻断事件不再由 tunnel 追踪，审批记录由 Kimi Server 管理。`BlockEvent` 类型已从 `policy-types.ts` 中移除。

原设计：一次被策略阻止的工具调用记录，用于 PM Dashboard 实时展示和 approve_tool/deny_tool 的 block_id 参数。现改为 Bash 后台轮询 + PM 手动决策（`approve_tool(approval_id)` / `deny_tool(approval_id)`）。

---

### 4. SessionPolicyBinding（Session-策略绑定）

session 与策略的关联记录。

| 字段 | 类型 | 描述 |
|------|------|------|
| `sessionId` | `string` | Task session ID |
| `policyName` | `string` | 绑定的策略名 |
| `boundAt` | `string` (ISO 8601) | 绑定时间 |
| `boundBy` | `string` | 绑定者 session ID（PM session）|

**验证规则**:
- session 生命周期内绑定不可变更
- 一个 session 只能绑定一个策略

---

## 内置策略定义

### read-only

```yaml
name: "read-only"
version: "1.0"
defaultAction: deny
rules:
  - name: "allow-read-tools"
    action: allow
    tools:
      - Read
      - Grep
      - Glob
      - WebSearch
      - FetchURL
  - name: "allow-status-tools"
    action: allow
    tools:
      - list_sessions
      - poll_session
      - get_session_info
      - list_io_records
      - read_session_log
      - get_tunnel_status
      - list_templates
  - name: "block-writes"
    action: deny
    tools:
      - Write
      - Edit
      - Bash
      - TaskStop
    message: "此任务使用 read-only 策略，禁止写入文件或执行命令"
```

### safe-edit

```yaml
name: "safe-edit"
version: "1.0"
defaultAction: deny
rules:
  - name: "allow-read-tools"
    action: allow
    tools: [Read, Grep, Glob, WebSearch, FetchURL]
  - name: "allow-status-tools"
    action: allow
    tools: [list_sessions, poll_session, get_session_info, list_io_records, read_session_log, get_tunnel_status, list_templates]
  - name: "allow-edit-tools"
    action: allow
    tools: [Write, Edit]
  - name: "deny-shell-and-exec"
    action: deny
    tools: [Bash, TaskStop]
    message: "此任务使用 safe-edit 策略，禁止执行 shell 命令。如需构建/测试，请联系 PM"
```

### full-access

```yaml
name: "full-access"
version: "1.0"
defaultAction: allow
rules: []
```

---

## 关系图

```
Policy 1 ──── * PolicyRule
   │
   │ binds
   ▼
SessionPolicyBinding ──── Session
```

---

## 存储

- **内置策略**: 硬编码在 `src/policy-builtins.ts`
- **自定义策略**: YAML 文件 → `<projectCwd>/.kimi-tunnel/policies/<name>.yaml`
- **运行时绑定**: 内存 `Map<string, SessionPolicyBinding>`（进程重启后丢失，符合 session 生命周期语义）
- **阻断日志**: v2.8 后审批记录由 Kimi Server 管理，tunnel 不再写入 wire.jsonl

---

## 附录: kimi-code 内置工具清单

策略验证和规则匹配依赖此清单。工具名区分大小写。

**读取类**（read-only 策略允许）:
`Read`, `Grep`, `Glob`, `WebSearch`, `FetchURL`, `TaskList`

**写入类**（read-only 策略禁止）:
`Write`, `Edit`

**执行类**（safe-edit 策略禁止）:
`Bash`, `Agent`, `AgentSwarm`, `TaskStop`, `TaskOutput`

**隧道状态类**（所有策略允许）:
`list_sessions`, `poll_session`, `get_session_info`, `list_io_records`, `read_session_log`, `get_tunnel_status`, `list_templates`, `list_workflow_templates`

**工作流类**（full-access 允许）:
`execute_prompt`, `chat_with_session`, `create_session`, `run_flow`, `learn_workflow`, `execute_workflow`, `continue_workflow`, `watch_session`, `get_watch_result`, `continue_watch`, `set_watch_output`, `stream_response`

新增工具出现时需更新此清单和内置策略定义
