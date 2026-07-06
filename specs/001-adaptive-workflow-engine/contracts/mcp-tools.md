# Contracts: MCP Tool Schemas

**Feature**: `001-adaptive-workflow-engine`

---

## `learn_workflow`

从口头描述或历史 session 学习工作流，生成模板文件。

### Parameters

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| name | string | ✅ | — | 模板名称（作为文件名） |
| cwd | string | ✅ | — | 项目工作目录 |
| spec_docs | string[] | ❌ | [] | 项目规范文档路径 |
| description | string | ❌ | — | 口头流程描述 |
| from_session | string | ❌ | — | 从已完成 session 提取 |
| overwrite | boolean | ❌ | false | 覆盖已有同名模板 |

### Behavior

1. 若提供 `from_session`：调用 `list_io_records(session_id)` 提取用户 prompt 序列 → 每轮 non-empty prompt 作为一个 step
2. 若提供 `description`：AI 从描述中提取步骤序列
3. 至少提供一个学习来源
4. 生成 YAML → `templates/<name>.yaml`

### Response

```json
{
  "template_name": "phase5-audit",
  "file_path": "templates/phase5-audit.yaml",
  "steps_extracted": 5,
  "source": "session",  // "session" | "description"
  "preview": [
    {"id": "step-1", "instruction": "阅读规范文档..."},
    {"id": "step-2", "instruction": "逐项检查..."}
  ]
}
```

### Errors

- `NO_SOURCE`: 未提供学习来源
- `SESSION_NOT_FOUND`: `from_session` 不存在
- `ALREADY_EXISTS`: 模板已存在且 `overwrite=false`

---

## `execute_workflow`

加载模板并在新 session 中执行。

### Parameters

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| template_name | string | ✅ | — | 模板名称 |
| cwd | string | ❌ | 模板中的 projectCwd | 覆盖工作目录 |
| auto_mode | boolean | ❌ | true | 自动审批工具调用 |
| model | string | ❌ | — | 任务 session 模型 |
| thinking | string | ❌ | "max" | 思考级别 |

### Behavior

1. 加载 `templates/<name>.yaml`
2. 调用 `create_session(cwd, permission_mode="auto")`
3. 按模板 steps 逐条 `execute_prompt(session_id, step.instruction, wait=true, auto_mode=true)`
4. 每步完成后：
   - 分析回复（完成/模糊/阻塞）
   - 模糊时读 thinking 确认
   - 阻塞时按 `blockagePolicy` 处理
   - 推送进度到 WebSocket
5. 全部完成后返回摘要
6. 遇到不可自动处理的阻塞时暂停，等待用户通过 `continue_workflow` 决策

### Response (immediate)

```json
{
  "execution_id": "exec_xxx",
  "template": "phase5-audit",
  "session_id": "session_xxx",
  "total_steps": 5,
  "status": "running",
  "hint": "Web 控制台查看实时进度: http://localhost:3456/workflow-console.html"
}
```

### Progress Event (WebSocket)

```json
{
  "type": "workflow_progress",
  "execution_id": "exec_xxx",
  "template": "phase5-audit",
  "current_step": 3,
  "total_steps": 5,
  "step_id": "fix",
  "session_id": "session_xxx",
  "status": "executing",
  "last_response": "已修复3处偏差...",
  "blockage": null
}
```

### Completion Event (WebSocket)

```json
{
  "type": "workflow_complete",
  "execution_id": "exec_xxx",
  "template": "phase5-audit",
  "session_id": "session_xxx",
  "total_steps": 5,
  "completed": 5,
  "adjusted": 2,
  "blocked": 0,
  "result": "全部完成。3处偏差已修复，/selftest 通过，文档已更新。"
}
```

### Errors

- `TEMPLATE_NOT_FOUND`: 模板不存在
- `TEMPLATE_INVALID`: 模板格式错误
- `SESSION_CREATE_FAILED`: 创建 session 失败
- `STEP_TIMEOUT`: 单步超时
- `BLOCKED_UNRESOLVABLE`: 遇到不可自动处理的阻塞

---

## `continue_workflow`

对暂停的工作流执行用户决策。

### Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| execution_id | string | ✅ | 执行 ID |
| decision | string | ✅ | "retry" \| "skip" \| "abort" \| "manual" |
| instruction | string | ❌ | 若 decision="manual"，用户提供的新指令 |

### Behavior

- `retry`: 重新执行当前步骤
- `skip`: 跳过当前步骤，从下一步继续
- `abort`: 终止执行，关闭任务 session
- `manual`: 使用用户提供的 `instruction` 覆盖当前步骤继续

---

## `list_templates`

列出所有已学习的工作流模板。

### Parameters

无参数。

### Response

```json
{
  "templates": [
    {"name": "phase5-audit", "version": "1.0", "steps": 5, "project": "scene"},
    {"name": "code-review", "version": "1.0", "steps": 3, "project": "my-app"}
  ]
}
```
