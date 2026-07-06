# Research: 自适应工作流引擎

**Feature**: `001-adaptive-workflow-engine`
**Date**: 2026-07-06

---

## R1: Kimi Server Callback API Availability

**Decision**: 使用低频状态轮询作为主方案，WebSocket 事件作为增强

**Rationale**: 
- Kimi Server API (`kimi-openapi.json`) 中未暴露原生回调端点
- `/api/v1/sessions/{id}/status` 返回轻量 JSON（仅 status, model, thinking_level），不拉全量日志
- 轮询间隔可设为 3-5 秒，token 消耗远低于 `poll_session`（读取文件）或 `list_io_records`（解析全量）
- `poll_session` 工具仍保留供手动检查

**Alternatives Considered**:
- Webhook：Kimi Server 不支持
- Server-Sent Events：无对应端点
- 高频轮询 `list_io_records`：token 开销大

---

## R2: Template Persistence Format

**Decision**: YAML

**Rationale**:
- 项目已依赖 `js-yaml`（Node.js 生态标准）
- 人类可编辑，符合 FR-1.4
- 结构化但有注释能力，方便记录规范文档路径
- JSON 备选同样支持，但不易读

**Template Schema**:
```yaml
name: "phase5-audit"
version: "1.0"
projectCwd: "D:/code/glass-desktop/scene"
specDocs:
  - "docs/we-analysis/00-指导文档.md"
  - "docs/we-analysis/phase5-高级渲染.md"
steps:
  - id: "read-specs"
    instruction: "阅读 docs/we-analysis/00-指导文档.md 和 phase5-高级渲染.md，理解规范要求"
  - id: "audit"
    instruction: "逐项检查 phase5 完成情况，查找错误、疏漏、偏差"
  - id: "fix"
    instruction: "实施所有发现的增补修复"
  - id: "selftest"
    instruction: "运行 /selftest 进行六维自审查"
  - id: "update-docs"
    instruction: "运行 /md-update 将变更同步到项目文档"
    expectedOutcome: "[DONE]"
blockagePolicy:
  autoResolve: ["dependency_missing", "file_not_found"]
  maxRetriesPerStep: 1
timeout:
  perStep: 600000
  total: 3600000
```

---

## R3: Step Driver Loop Design

**Decision**: 使用 `wireClient.sendPrompt()`（现有方法，已支持 `autoApprove` + 状态前置等待）

**Rationale**:
- `sendPrompt` 内置 submit → poll idle → return 循环，无需重复实现
- 修复后的版本已支持预提交状态检查（避免 mid-turn 注入）
- 每步调用 `sendPrompt(wait=true)` 等价于"发指令→等回复→拿结果"

**Step Classification Logic**:
1. 回复含 `[DONE]` 或明确的完成模式 → 步骤完成
2. 回复含模糊词（同 `orchestrateTask` 的 `isAmbiguous`） → 读 thinking
3. 回复含阻塞信号 → `handleBlockage()`
4. 其他 → 步骤完成（默认推进）

**Alternatives Considered**:
- 复用 `orchestrateTask`：但它的检查逻辑假设"单一任务多轮对话"，不适合"多步不同指令"
- 直接 `submitPrompt` + `poll_session`：需要自己管理超时和状态，重复造轮

---

## R4: Ambiguity Detection via Thinking Chain

**Decision**: 使用 `session-log-reader` 的 `readSessionLog(after_line, includeThinking=true)`

**Rationale**:
- `wire.jsonl` 的 `content.part(think)` 包含完整思考过程
- 只读最近 10 条增量（`after_line`），避免全量解析
- 已有机读解析器（`session-log-reader.ts`），直接复用

**Trigger Pattern**:
```typescript
const AMBIGUOUS_PATTERNS = [
  /不确定/, /可能/, /也许/, /不太确定/,
  /需要.*确认/, /需要.*更多/,
  /可以.*尝试/, /可以.*考虑/,
  /unsure/, /maybe/, /perhaps/, /might/, /could/
];
```

---

## R5: WebSocket Progress Push

**Decision**: 复用现有 `message-queue.ts` + `stream_response` 工具

**Rationale**:
- `messageQueue` 已管理 WebSocket 客户端注册/广播
- `stream_response` MCP 工具已实现推送
- Web 页面 `workflow-console.html` 监听 WebSocket `/ws`，解析 `type: "workflow_progress"` 消息

**Progress Message Schema**:
```json
{
  "type": "workflow_progress",
  "template": "phase5-audit",
  "currentStep": 3,
  "totalSteps": 5,
  "stepId": "fix",
  "sessionId": "session_xxx",
  "status": "executing",  // executing | done | blocked | error
  "lastResponse": "已修复3处偏差...",
  "blockage": null,
  "timestamp": "..."
}
```
