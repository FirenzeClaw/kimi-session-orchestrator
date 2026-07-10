# Phase 0: Research — 权限策略引擎

**Feature**: `003-permission-policy`
**Date**: 2026-07-07

---

## 1. 拦截点分析

### 现状

- Kimi Server 通过 WebSocket 推送 session 状态变更事件（`event.session.status_changed`）
- 当 session 因工具调用需要审批时，状态变为 `awaiting_approval`
- kimi-session-orchestrator 已有 `wire-client.ts:approveAll()` 方法，通过 `POST /api/v1/sessions/{id}/approvals/{approval_id}` 自动审批

### 决策：在 `awaiting_approval` 事件处理中插入策略检查

**Rationale**: 这是唯一能感知 task session 工具调用的点。tunnel 不直接控制 kimi-code 的内置工具（Read/Write/Bash 等），但可以通过 Kimi Server 的审批 API 拒绝被禁工具的调用。

**具体拦截流程**：
```
WS event: awaiting_approval
  → fetch pending approvals: GET /api/v1/sessions/{id}/approvals?status=pending
  → for each approval:
      → extract tool_name from approval payload
      → check against active policy
      → allow → POST approve with decision=approved
      → deny  → POST approve with decision=denied
      → require_approval → emit WS event to PM Dashboard (leave pending)
```

**Alternatives considered**:
- ❌ 在 MCP 工具注册层包装：task session 的工具是 kimi-code 进程内的，tunnel 无法拦截
- ❌ 修改 Kimi Server 源码：超出项目范围
- ❌ 通过 prompt 注入规则：不满足 FR 的"系统级强制"要求

---

## 2. Kimi Server 审批 API 验证

### 决策：复用现有 `approveAll()` 模式，增加 policy 过滤

**API 端点确认**（来自 `wire-client.ts` 已有实现）：
- `GET /api/v1/sessions/{id}/approvals?status=pending` → 返回 `{ items: [{ approval_id, tool_name?, ... }] }`
- `POST /api/v1/sessions/{id}/approvals/{approval_id}` → body: `{ decision: "approved"|"denied", scope: "session" }`

**Rationale**: 这两个 API 已在项目中验证可用，无需额外调研。

**注意**: 需要确认 approval item 是否包含 `tool_name` 字段。如果 Kimi Server 的 approval payload 不直接暴露工具名，需要从其他字段推断（如 `description`、`message`）。作为保险，在策略引擎中实现基于 description 关键词匹配的 fallback。

---

## 3. 策略存储格式

### 决策：YAML 文件 + 内置策略硬编码

**格式**（与 spec 一致）：
```yaml
name: "review-policy"
version: "1.0"
default_action: deny
rules:
  - name: "allow-read-tools"
    action: allow
    tools: ["Read", "Grep", "Glob"]
  - name: "block-writes"
    action: deny
    tools: ["Edit", "Write", "Bash"]
    message: "此任务为只读审查，禁止修改文件"
```

**存储路径**: `<projectCwd>/.kimi-tunnel/policies/<name>.yaml`

**Rationale**: 
- YAML 是项目已有依赖（`js-yaml` 用于 workflow-template.ts）
- 文件系统存储 = 零依赖 + 直接可编辑
- 内置策略（read-only/safe-edit/full-access）硬编码在 `policy-engine.ts` 中，不需要文件

**Alternatives considered**:
- ❌ JSON 配置：不如 YAML 可读，且项目已在用 YAML
- ❌ SQLite 数据库：过度设计，策略数量预期 < 20 个

---

## 4. kimi-code 内置工具清单

### 决策：维护内置策略工具白名单，提供显式工具映射

**read-only 策略允许的工具**：
```
Read, Grep, Glob, WebSearch, FetchURL,
list_sessions, poll_session, get_session_info,
list_io_records, read_session_log, get_tunnel_status,
list_templates, list_workflow_templates
```

**safe-edit 策略额外允许**：
```
Edit, Write
```

**safe-edit 策略禁止**（关键）：
```
Bash, Agent, AgentSwarm, TaskStop,
npm, git (通过 Bash 执行)
```

**Rationale**: 
- kimi-code 工具名是稳定的（来自 MCP SDK 注册），不会频繁变化
- Bash 是最危险的——它等价于任意代码执行
- `npm`/`git` 只能通过 Bash 执行，所以阻断 Bash 即阻断所有 shell 命令

**注意**: `Bash` 阻断后，`npm run build` 等构建命令全部不可用。`safe-edit` 策略下，session 只能编辑文件但无法运行编译器——这在审查修正确认后由 PM 手动执行的场景中是预期的。

---

## 5. 策略引擎模块设计

### 决策：新增独立模块 `policy-engine.ts`，通过 `TunnelServices` DI 注入

**接口设计**：
```typescript
interface IPolicyEngine {
  loadPolicy(policySpec: string): Policy;  // "read-only" | "safe-edit" | path/to/file.yaml
  check(policy: Policy, toolName: string): PolicyDecision;  // allow | deny | require_approval
  getBlockMessage(policy: Policy, toolName: string): string;
  listPolicyFiles(): PolicyInfo[];
}
```

**Rationale**:
- 符合项目 DI 惯例（参考 `IWorkflowEngine`）
- 与 wire-client 解耦——策略检查是独立的关注点
- 可按需扩展（未来支持文件路径级权限等）

---

## 6. PM Dashboard 集成

### 决策：通过现有 WS 通道推送阻断事件

**流程**：
1. 策略引擎 `check()` 返回 `deny` 后，发送审批拒绝到 Kimi Server
2. 同时通过 `messageQueue` 广播 `policy_block` 事件
3. `workflow-console.html` (PM Dashboard) 的 WS 客户端接收并在注意力预警面板展示

**Rationale**:
- 复用现有 `messageQueue` pub/sub 基础设施（67 行，极简）
- 不新增 WebSocket 端点
- Dashboard 已在 `workflow-console.html` 存在，只需添加新事件类型处理

---

## 7. 技术依赖确认

| 依赖 | 版本 | 用途 | 状态 |
|------|------|------|------|
| `js-yaml` | 已安装 | YAML 策略文件解析 | ✅ 复用 |
| `zod` | 已安装 | 策略 schema 验证 | ✅ 复用 |
| `@modelcontextprotocol/sdk` | 1.12 | MCP 工具注册 | ✅ 复用 |
| `ws` | 已安装 | WebSocket 推送 | ✅ 复用 |

无需新增 npm 依赖。

---

## 8. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| Kimi Server approval payload 不暴露 tool_name | 策略检查失效 | Fallback: 解析 approval description 关键词 |
| 策略文件 YAML 格式错误 | session 创建失败 | 加载时 Zod 校验 + 错误位置精确报告 |
| 策略未覆盖新工具 | 新工具默认行为不一致 | `default_action` 在策略中显式声明 |
| 并发 session 策略更新冲突 | 不一致的权限 | 策略在 session 创建时绑定，生命周期内不变 |
