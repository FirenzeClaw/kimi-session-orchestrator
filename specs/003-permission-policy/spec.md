# 任务 Session 权限与策略管理

**Feature**: `003-permission-policy`
**Created**: 2026-07-07
**Status**: Draft
**Parent**: kimi-debug-tunnel v2.4

---

## 问题陈述

当前 kimi-debug-tunnel 的权限控制仅支持 session 级别的 `permission_mode`（auto/manual/yolo），存在三个核心局限：

1. **粒度不足**：无法为单个任务指定工具级权限。一个需要执行构建的任务 session 和只需要读文件的任务 session 拥有相同的工具访问权限
2. **无策略复用**：权限配置无法保存为可复用模板。PM 每次创建 session 都需要重新描述权限约束，或接受默认的全量权限
3. **无防御性阻断**：权限控制依赖 AI 自觉遵守（prompt 中的"请勿编辑文件"），而非系统级强制。越权行为只能在事后由 PM 人工检测

**行业对标**：

| 方案 | 模式 | 粒度 |
|------|------|------|
| OpenAI Codex | `read-only` / `workspace-write` / `danger-full-access` + `on-request`审批 | 目录级 |
| Microsoft AGT | YAML 策略引擎 + `allow`/`deny`/`require_approval` | 工具级 |
| 本项目当前 | `auto`/`manual`/`yolo` session 级 | Session 级 |

---

## 解决方案

构建**三层权限系统**——在现有 session 级权限之上，增加任务级策略控制和工具级拦截。PM 可定义可复用的策略模板，在分派任务时指定适用策略，系统在工具调用前强制执行。

### 三层架构

```
┌─────────────────────────────────────────────────┐
│ L1: Session 级权限（现有）                        │
│ permission_mode: auto / manual / yolo            │
│ 决定整个 session 的审批模式                       │
├─────────────────────────────────────────────────┤
│ L2: 任务级策略（新增）                            │
│ policy: "read-only" / "safe-edit" / 自定义 YAML   │
│ 决定单次任务允许的工具类别和操作范围                 │
├─────────────────────────────────────────────────┤
│ L3: 工具级拦截（新增）                            │
│ 策略引擎在每次工具调用前执行判定                    │
│ allow → 放行 / deny → 阻断 / require_approval → 审批 │
└─────────────────────────────────────────────────┘
```

### 三种内置策略级别

| 策略名 | 允许的操作 | 禁止的操作 | 对标 |
|--------|-----------|-----------|------|
| `read-only` | Read, Grep, Glob, list_sessions, poll_session, get_session_info, list_io_records, read_session_log | Edit, Write, Bash, 所有写入类 MCP 工具 | Codex `read-only` |
| `safe-edit` | read-only 全部 + Edit + Write | 任意 shell 命令 (Bash, npm, git 等) | AGT `safe-edit` |
| `full-access` | 所有工具 | 无 | Codex `danger-full-access` |

### 策略文件格式（自定义策略）

```yaml
name: "review-policy"
version: "1.0"
default_action: deny                          # 默认拒绝，显式开放
rules:
  - name: "allow-read-tools"
    action: allow
    tools: ["Read", "Grep", "Glob"]
  - name: "allow-status-tools"
    action: allow
    tools: ["poll_session", "list_io_records", "get_session_info"]
  - name: "block-writes"
    action: deny
    tools: ["Edit", "Write", "Bash"]
    message: "此任务为只读审查，禁止修改文件"
```

---

## 用户故事

1. **作为项目经理（PM）**，我希望在分派审查任务时指定 `policy="read-only"`，确保审查 session 不可能意外修改文件——越权问题从"事后检测"变为"事前阻断"
2. **作为项目经理（PM）**，我希望能创建自定义策略文件（如"仅允许读 spec 和审查工具，禁止所有构建命令"），并在多次分派中复用
3. **作为任务 session（修复者）**，当我的操作被策略阻断时，我希望收到清晰的阻断原因（引用具体策略规则），而不是困惑的通用错误
4. **作为项目经理（PM）**，当 session 的工具调用被策略阻断时，我希望能收到通知，以便判断是策略过严需要调整，还是 session 确实在越权

---

## 功能需求

### FR-1：内置策略级别

- FR-1.1：`create_session` 和 `execute_prompt` 新增 `policy` 参数，接受 `"read-only"` / `"safe-edit"` / `"full-access"` 三种内置值
- FR-1.2：`policy` 未指定时，默认值为 `"full-access"`（向后兼容——现有行为不变）
- FR-1.3：`policy` 与 `permission_mode` 独立运作——`policy` 控制工具可用性，`permission_mode` 控制审批流程

### FR-2：自定义策略文件

- FR-2.1：PM 可在项目根目录的 `.kimi-tunnel/policies/` 下创建 YAML 策略文件
- FR-2.2：`policy` 参数可接受策略文件路径（如 `policy=".kimi-tunnel/policies/review.yaml"`）
- FR-2.3：策略文件支持 `default_action`（allow/deny）+ 多条 `rules`，每条规则指定 `action`、`tools` 列表、可选 `message`
- FR-2.4：新增 `list_policies` 工具——列出 `.kimi-tunnel/policies/` 下所有可用策略文件

### FR-3：工具级拦截

- FR-3.1：任务 session 每次工具调用前，策略引擎检查该工具是否在允许列表中
- FR-3.2：`allow` → 正常执行；`deny` → 返回阻断错误（含策略规则名和阻断原因）；`require_approval` → 触发审批流程，通知 PM
- FR-3.3：阻断错误清晰描述：被哪条规则阻止、允许尝试的操作、建议的替代方案
- FR-3.4：策略检查对 session 透明——session 正常调用工具，策略引擎在隧道层拦截

### FR-4：策略集成 PM 工作流

- FR-4.1：PM Dashboard 新增"策略状态"列——显示每个 session 当前应用的策略
- FR-4.2：当 session 工具调用被 `deny` 阻断时，PM Dashboard 的注意力预警面板显示阻断事件
- FR-4.3：被 `require_approval` 阻断的调用，PM 可通过 `approve_tool` 或 `deny_tool` 工具做出决定
- FR-4.4：策略阻断记录写入 session 日志，供退役审计使用

### FR-5：策略验证

- FR-5.1：`list_policies` 工具返回策略列表时附带验证状态（有效/无效/警告）
- FR-5.2：无效策略（YAML 语法错误、引用不存在的工具名）在加载时报告具体错误位置

---

## 关键实体

- **策略（Policy）**：一组工具权限规则，可为内置级别或 YAML 文件
- **策略规则（Rule）**：单条规则——名称、动作（allow/deny/require_approval）、工具列表、可选阻断消息
- **阻断事件（BlockEvent）**：一次被策略阻止的工具调用记录——session_id、工具名、策略规则名、时间戳

---

## 成功标准

- SC-1：使用 `policy="read-only"` 的 session 对文件写入工具的调用 100% 被阻断（零绕过）
- SC-2：PM 可在 1 分钟内创建一个自定义策略文件并应用到新 session
- SC-3：工具被阻断时，session 在 2 秒内收到清晰的阻断原因（不超时等待）
- SC-4：策略阻断事件在 PM Dashboard 上的展示延迟不超过 3 秒（通过 WS 推送）
- SC-5：自定义策略的语法错误在加载时被检测并报告，错误位置精确到行号

---

## 假设与约束

- 策略在 session 创建时绑定，session 生命周期内不可更改（避免 session 中途权限变化导致不可预期的行为）
- 内置策略 `read-only` 和 `safe-edit` 的工具列表是固定的，不可自定义
- 策略引擎运行在 kimi-debug-tunnel 进程内，不依赖外部服务
- 工具调用拦截通过 MCP 工具注册层的包装实现，不需要修改 kimi-code 本身
- 与现有 `coordinator-guide.md` §1.5.6（越权与冲动控制）互补——策略是事前预防，越权检测是事后审计

---

## 范围外

- 不实现 OS 级沙箱（如 Codex 的 Seatbelt/bubblewrap）——那是 kimi-code 层面的功能
- 不实现基于文件路径的权限（如"只能写 `src/` 目录"）——当前仅工具级控制
- 不实现跨 session 的策略继承或组合
- 不替代现有的 `permission_mode`——两者互补而非替代
