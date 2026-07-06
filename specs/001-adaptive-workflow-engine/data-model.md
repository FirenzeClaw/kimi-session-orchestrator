# Data Model: 自适应工作流引擎

**Feature**: `001-adaptive-workflow-engine`

---

## Entity: WorkflowTemplate

持久化于 `templates/<name>.yaml`。

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | ✅ | 模板唯一标识（文件名） |
| version | string | ✅ | 语义版本号 |
| projectCwd | string | ✅ | 任务 session 工作目录 |
| specDocs | string[] | ✅ | 项目规范文档路径列表 |
| steps | WorkflowStep[] | ✅ | 步骤序列 |
| blockagePolicy | BlockagePolicy | ✅ | 阻塞处理策略 |
| timeout | TimeoutConfig | ✅ | 超时配置 |
| description | string | ❌ | 人类可读描述 |
| createdAt | ISO8601 | ❌ | 创建时间 |
| updatedAt | ISO8601 | ❌ | 更新时间 |

### WorkflowStep

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | ✅ | 步骤标识 |
| instruction | string | ✅ | 下发给任务 session 的指令 |
| expectedOutcome | string | ❌ | 预期产出关键词 |
| onBlockage | BlockageAction | ❌ | 覆盖全局阻塞策略 |
| maxRetries | number | ❌ | 最大重试次数（默认 1） |

### BlockagePolicy

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| autoResolve | BlockageType[] | ✅ | 可自动处理的阻塞类型 |
| maxRetriesPerStep | number | ✅ | 每步最大重试次数 |

### BlockageType (enum)

```
dependency_missing   — 正则: /command not found|module not found|package.*not found/i
file_not_found       — 正则: /No such file|ENOENT|cannot find|cannot access/i
permission_denied    — 正则: /EACCES|Permission denied|not permitted/i
timeout              — 条件: sendPrompt 返回超时错误
ambiguous            — 条件: isAmbiguous() 返回 true 且读 thinking 后仍不明确
tool_approval        — 条件: 状态为 awaiting_approval
```

**误判处理**: 正则匹配后，检查上下文排除否定句式（如 "不需要安装"），减少误判。

### TimeoutConfig

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| perStep | number | ✅ | 每步超时（ms），默认 600000 |
| total | number | ✅ | 总超时（ms），默认 3600000 |

---

## Entity: WorkflowExecution

内存对象，不持久化。

| Field | Type | Description |
|-------|------|-------------|
| id | string | 执行 ID（uuid） |
| template | WorkflowTemplate | 关联模板 |
| sessionId | string | 任务 session ID |
| currentStep | number | 当前步骤序号（0-based） |
| stepResults | StepResult[] | 已完成步骤结果 |
| status | ExecutionStatus | 执行状态 |
| startTime | number | 开始时间戳 |
| blockageQueue | BlockageEvent[] | 待处理阻塞 |

### ExecutionStatus (enum)

```
pending      — 未开始
running      — 执行中
awaiting_user — 等待用户决策
completed    — 全部完成
failed       — 不可恢复错误
cancelled    — 用户取消
```

### StepResult

| Field | Type | Description |
|-------|------|-------------|
| stepId | string | 步骤 ID |
| stepIndex | number | 步骤序号 |
| instruction | string | 下发的指令 |
| response | string | session 回复文本 |
| thinkingSummary | string | 思考链摘要（若读过） |
| status | "ok" \| "adjusted" \| "blocked" \| "failed" | 执行结果 |
| adjustment | string | 自适应调整说明（如有） |
| blockages | BlockageEvent[] | 遇到的阻塞 |

### BlockageEvent

| Field | Type | Description |
|-------|------|-------------|
| type | BlockageType | 阻塞类型 |
| context | string | 触发上下文（回复片段） |
| resolved | boolean | 是否已解决 |
| resolution | string | 解决方式 |
| needsUserDecision | boolean | 是否需要用户决策 |

---

## State Transitions

```
创建模板:
  [口头描述/历史session] → parse → validate → save → WorkflowTemplate

执行工作流:
  Pending → Running → (per step: execute → classify → [advance|adjust|block])
  Running → AwaitingUser (on unresolvable blockage)
  AwaitingUser → Running (user decision: continue)
  AwaitingUser → Cancelled (user decision: abort)
  Running → Completed (all steps done)
  Running → Failed (unrecoverable error)
```
