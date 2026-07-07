# MCP Tool Contracts — 权限策略引擎

**Feature**: `003-permission-policy`

---

## 变更摘要

| 工具 | 类型 | 说明 |
|------|------|------|
| `create_session` | 修改 | 新增 `policy` 参数 |
| `execute_prompt` | 修改 | 新增 `policy` 参数 |
| `run_flow` | 修改 | 新增 `policy` 参数 |
| `chat_with_session` | 修改 | 新增 `policy` 参数 |
| `execute_workflow` | 修改 | 新增 `policy` 参数 |
| `list_policies` | 新增 | 列出可用策略文件 |
| `approve_tool` | 新增 | PM 手动放行被阻断的工具调用 |
| `deny_tool` | 新增 | PM 手动拒绝被阻断的工具调用 |

---

## 公共参数: `policy`

所有 session 创建/任务分派工具统一新增此参数：

```typescript
policy: z.string().optional()
  .describe(
    '任务策略。可选值:\n' +
    '- "read-only": 只读（禁止写文件/执行命令）\n' +
    '- "safe-edit": 安全编辑（禁止 shell 命令，可编辑文件）\n' +
    '- "full-access": 全部允许（默认）\n' +
    '- 自定义策略文件路径: 相对于项目根目录，如 ".kimi-tunnel/policies/review.yaml"'
  )
```

**行为**:
- 默认值: `"full-access"`（向后兼容——现有行为不变）
- `policy` 与 `permission_mode` / `auto_mode` 独立运作
- 策略在 session 创建时绑定，后续不可变更

**错误处理**:
- 策略文件不存在 → 返回错误: `策略文件未找到: {path}`
- 策略文件格式错误 → 返回错误: `策略解析失败: {path}, 第{line}行: {message}`

---

## `list_policies` — 新增

### Schema

```typescript
{
  name: "list_policies",
  description: "列出项目 .kimi-tunnel/policies/ 下所有可用的自定义策略文件，含验证状态",
  inputSchema: {},  // 无参数
}
```

### 响应

```json
{
  "policies": [
    {
      "name": "review-policy",
      "file": ".kimi-tunnel/policies/review.yaml",
      "version": "1.0",
      "rules_count": 3,
      "valid": true
    },
    {
      "name": "deploy-policy",
      "file": ".kimi-tunnel/policies/deploy.yaml",
      "version": "1.0",
      "rules_count": 5,
      "valid": false,
      "error": "第12行: 未知的工具名 'DeployTool'"
    }
  ],
  "builtin": ["read-only", "safe-edit", "full-access"]
}
```

---

## `approve_tool` — 新增

### Schema

```typescript
{
  name: "approve_tool",
  description: "放行被策略阻断的工具调用（仅 PM 使用）",
  inputSchema: {
    block_id: z.string().describe("阻断事件 ID。从 PM Dashboard 或 list_blocked_calls 获取"),
    scope: z.enum(["once", "session"]).default("once")
      .describe("once=仅本次, session=本 session 后续同类工具均放行"),
  }
}
```

### 响应

```json
{
  "approved": true,
  "block_id": "uuid-xxx",
  "tool": "Bash",
  "scope": "once"
}
```

---

## `deny_tool` — 新增

### Schema

```typescript
{
  name: "deny_tool",
  description: "拒绝被策略阻断或待审批的工具调用（仅 PM 使用）",
  inputSchema: {
    block_id: z.string().describe("阻断事件 ID"),
  }
}
```

### 响应

```json
{
  "denied": true,
  "block_id": "uuid-xxx",
  "tool": "Bash"
}
```

---

## WS 事件: `policy.block`

当策略阻断工具调用时，通过已有 WebSocket 通道推送到 PM Dashboard。

### Payload

```json
{
  "type": "policy.block",
  "payload": {
    "blockId": "uuid-xxx",
    "sessionId": "session_abc123",
    "policyName": "safe-edit",
    "ruleName": "deny-shell-and-exec",
    "toolName": "Bash",
    "message": "此任务使用 safe-edit 策略，禁止执行 shell 命令",
    "timestamp": "2026-07-07T12:00:00Z"
  }
}
```

### WS 事件: `policy.require_approval`

```json
{
  "type": "policy.require_approval",
  "payload": {
    "blockId": "uuid-xxx",
    "sessionId": "session_abc123",
    "toolName": "Bash",
    "args": {"command": "npm run build"},
    "timestamp": "2026-07-07T12:00:00Z"
  }
}
```
