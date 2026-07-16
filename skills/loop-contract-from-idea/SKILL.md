---
name: loop-contract-from-idea
description: Use when PM starts from a one-line product or engineering idea and must turn it into a locked Loop Contract before loop-orchestrator execution, including /loop-contract-new requests.
---

# Loop Contract From Idea — 一句话需求到严格循环契约

## 概述

此 skill 将一句话需求转换为 `.kimi-tunnel/loop-contract.yaml`。核心原则：先追问，再锁定基线，再生成 Contract；未确认的推断不得伪装成事实。

共享模板只引用，不复制：`skills/loop-contract-from-docs/templates/loop-contract.yaml`。

## 何时使用

- 用户调用 `/loop-contract-new`
- PM 只有一句话需求，尚无可直接执行的 Loop Contract
- 需要先从目标、约束、技术栈、方向边界推断 AC，并让用户确认后再进入循环编排

不用于用户已给出 SPEC/PLAN/PRD/TASK 文档集的场景。此时升级到 `loop-contract-from-docs` 路径。

## 加载即执行

### Auto 检测

若系统提示含 `Auto permission mode is active`，用纯文本逐轮追问，不调用 `AskUserQuestion`。非 auto 模式可用结构化问题，但仍必须逐轮完成。

### Phase 1 — 5 轮追问

加载 `skills/loop-contract-from-idea/guide-clarify-chain.md`，按顺序完成 Q1-Q5：

1. Q1 最终目标：谁用、做什么、为什么重要。
2. Q2 平台/环境约束：OS、浏览器、嵌入式、性能基线等。
3. Q3 技术栈：语言、框架、数据库；用户明确“不限”时可跳过细化。
4. Q4 方向约束：明确不做什么、不碰什么模块、不可降级边界。
5. Q5 是否已有相关文档：若有文档，立即升级为 `loop-contract-from-docs` 路径继续，不再走 from-idea 推断。

硬门：Phase 1 不可跳过。即使用户回答不充分，也必须按 guide 的追问策略继续追问，直到达到每轮退出标准或明确记录“不足但已追问”。

完成标准：Q1-Q5 均有记录；Q5 已判定继续 from-idea 或升级 from-docs。

### Phase 2 — 基线锁定

加载 `skills/loop-contract-from-idea/guide-baseline-lock.md`。

1. 从 Q1-Q4 推断 AC 草案，每条必须可验证。
2. 从 Q4 和 Q1-Q3 的边界信息推断 `direction_baseline`。
3. 向用户展示“PM 推断的 AC 草案 + 方向基线草案”。
4. 用户确认“是”后写入 Contract 草案，此后 PM 不得自行修改。
5. 用户要求修改时，走变更流程：改草案 → 重新展示 → 重新确认 → 再锁定。

完成标准：AC 与 direction_baseline 均已锁定，且锁定依据能追溯到用户确认。

### Phase 3 — 复杂度评估

基于 Q2-Q4 评估 `complexity.level` 与 `complexity.factors`：

| Level | 判定线索 | Loop 参数 |
|-------|----------|-----------|
| low | 单模块、无协议/DB/跨平台约束，AC 少于 4 条 | `min_cycles: 2`, `max_cycles: 4`, `consecutive_pass_required: 2` |
| medium | 2-3 个模块、存在接口/状态/兼容性约束 | `min_cycles: 3`, `max_cycles: 5`, `consecutive_pass_required: 2` |
| high | 跨系统/协议/DB schema/安全/性能基线，或方向约束严格 | `min_cycles: 4`, `max_cycles: 6`, `consecutive_pass_required: 3` |

完成标准：`complexity.factors` 至少 2 条；循环参数不得低于 low 的保障线。

### Phase 4 — 生成 Contract

使用共享模板路径 `skills/loop-contract-from-docs/templates/loop-contract.yaml` 填充同格式 Contract，输出到 `.kimi-tunnel/loop-contract.yaml`。

必须保持与 from-docs 格式一致：

```yaml
meta:
  generated_by: loop-contract-from-idea
  generated_at: <ISO timestamp>
  source_docs:
    - user-input

goal:
  statement: "<一句话目标>"
  acceptance_criteria:
    - "<可验证条件>"
  direction_baseline:
    - "<范围边界>"
    - "<不做什么或不可降级边界>"

complexity:
  level: low | medium | high
  factors:
    - "<因素>"

loop_config:
  min_cycles: 2
  max_cycles: 5
  degradation_detection: true
  consecutive_pass_required: 2
  verify:
    primary: grade_step
    cross_model: <must-differ-from-pm-model>
    self_audit_rounds: 1

operational_brakes:
  max_repeated_actions: 1
  max_wall_time_minutes: 60
  context_tokens_threshold: 36000
  no_progress_escalation: "暂停当前轮 → 记录状态 → PM 诊断或退役接班"

harness:
  required_tools:
    - "kimi-session-orchestrator MCP"
    - "loop-orchestrator"
    - "grade_step"
  allowed_paths:
    - "<project-scope>"
  forbidden_paths:
    - "<out-of-scope>"
  state_namespace: "session/<loop-id>"
  kill_switch: "PM says stop, repeated no-progress, or delivery_gate cannot be made verifiable"

blockage_recovery:
  max_retries: 3
  strategies:
    - "xmind-orchestrated → 多视角分析"
    - "create_session(research) → 网络搜索或文档检索"
  escalation: "3 次仍阻塞 → 暂停并报告"

pm_duties:
  per_cycle:
    - "对照 direction_baseline 核查方向一致性"
    - "检测降级倾向：缩减范围/跳过验证/省略检查"
    - "检查 operational_brakes 是否触发"
  on_blockage:
    - "先诊断后决策"

delivery_gate:
  - min_cycles 满足
  - consecutive_pass_required 满足
  - direction_baseline 全部通过
  - operational_brakes 未触发或已完成 PM 处置
  - harness.allowed_paths / forbidden_paths 未被违反
  - PM 确认：方向一致且未发现降级
```

完成标准：Contract 字段完整；未确认的推断保留为“用户已确认的基线”，不得写成“文档事实”。

### Phase 5 — 生成后审计与交接

加载 `skills/loop-contract-from-idea/guide-contract-qa.md`，逐项审计 Contract。审计失败时回到对应 Phase 修正，不得交接。

交接卡片格式：

```markdown
Loop Contract 已生成
- 路径: `.kimi-tunnel/loop-contract.yaml`
- 来源: user-input / from-docs upgraded
- 复杂度: low | medium | high
- 循环参数: min=<N>, max=<N>, consecutive_pass=<N>
- 方向基线: <N 条>
- 制动器: no-progress=<N>, wall-time=<N>min, context=<N>
- 执行边界: allowed=<N>, forbidden=<N>, state=<namespace>
- 下一步: 加载 `loop-orchestrator` 并按 Contract 执行
```

完成标准：QA 全部通过，并明确下一步由 `loop-orchestrator` 消费 Contract。

## 循环保障

Contract 必须内建与 from-docs 一致的循环保障：

| 机制 | 要求 |
|------|------|
| `min_cycles` | 至少 2，复杂度越高越大；不可降到 1 |
| `consecutive_pass_required` | 至少 2，防止修完即交付 |
| `degradation_detection` | 必须为 true |
| `direction_baseline` | 每轮循环后逐条核查 |
| `verify.cross_model` | 必须不同于当前 PM session 模型 |
| `operational_brakes` | 包含 no-progress、wall-time、context 阈值 |
| `harness` | 声明工具、允许/禁止路径、状态命名空间和 kill switch |
| `blockage_recovery` | 至少 2 条策略，最多 3 次重试后升级 |
| `delivery_gate` | 至少六类条件同时满足才可交付，包含 brakes/harness 检查 |

## 红线

- 跳过 Phase 1 追问直接生成 Contract。
- 用户回答不充分时直接脑补，不执行追问策略。
- Q5 表明有文档仍继续 from-idea 推断。
- 未经用户确认就锁定 AC 或 direction_baseline。
- 锁定后自行修改 AC 或 direction_baseline。
- 复制 from-docs 模板到本 skill 目录。
- 缺失 `operational_brakes` 或 `harness` 字段仍交接。
- `min_cycles: 1`、`consecutive_pass_required: 1` 或关闭 `degradation_detection`。

违反规则的字面意思就是违反规则的精神。
