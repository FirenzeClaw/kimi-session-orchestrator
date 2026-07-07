# Quick Start: 权限策略引擎

**Feature**: `003-permission-policy`

---

## 5 分钟快速体验

### 1. 创建自定义策略

```bash
mkdir -p .kimi-tunnel/policies
```

创建 `.kimi-tunnel/policies/review-only.yaml`:

```yaml
name: "review-only"
version: "1.0"
default_action: deny
rules:
  - name: "allow-read"
    action: allow
    tools: [Read, Grep, Glob]
  - name: "allow-status"
    action: allow
    tools: [poll_session, list_io_records, get_session_info]
  - name: "block-all-writes"
    action: deny
    tools: [Write, Edit, Bash]
    message: "审查任务——禁止修改任何文件"
```

### 2. 使用内置策略

```python
# 创建只读审查 session
create_session(
  cwd="/path/to/project",
  permission_mode="auto",
  policy="read-only"
)
```

### 3. 使用自定义策略

```python
# 创建含自定义策略的 session
create_session(
  cwd="/path/to/project",
  permission_mode="auto",
  policy=".kimi-tunnel/policies/review-only.yaml"
)
```

### 4. 查看可用策略

```python
list_policies()
# → builtin: [read-only, safe-edit, full-access]
# → custom: [review-only]
```

### 5. 在任务分派时指定策略

```python
execute_prompt(
  session_id="ses_abc123",
  prompt="审查 src/ 下的所有 TypeScript 文件",
  policy="read-only"
)
```

### 6. 处理阻断事件

当 session 试图执行被禁工具时，PM Dashboard 会自动显示阻断通知。PM 可以：
- **放行一次**: `approve_tool(block_id, scope="once")`
- **放行本 session**: `approve_tool(block_id, scope="session")`
- **拒绝**: `deny_tool(block_id)`

---

## 三个内置策略对比

| 操作 | read-only | safe-edit | full-access |
|------|:---:|:---:|:---:|
| 读文件 (Read) | ✅ | ✅ | ✅ |
| 搜索 (Grep) | ✅ | ✅ | ✅ |
| 搜索文件 (Glob) | ✅ | ✅ | ✅ |
| 编辑文件 (Edit) | ❌ | ✅ | ✅ |
| 写文件 (Write) | ❌ | ✅ | ✅ |
| 执行命令 (Bash) | ❌ | ❌ | ✅ |
| 启动子代理 (Agent) | ❌ | ❌ | ✅ |
| 查看 session 状态 | ✅ | ✅ | ✅ |

---

## 策略文件规范

- **位置**: `<项目根>/.kimi-tunnel/policies/*.yaml`
- **`default_action`**: `allow`（默认放行）或 `deny`（默认拒绝）
- **规则匹配**: 从上到下，第一个匹配生效
- **工具名**: kimi-code 内置工具名（大小写敏感）
- **验证**: 加载时 Zod schema 校验，语法错误精确到行号
