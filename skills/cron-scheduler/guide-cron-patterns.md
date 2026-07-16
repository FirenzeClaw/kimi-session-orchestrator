# Cron Patterns Guide

加载条件：只有在 PM 需要选择 heartbeat、cron、hook、goal 模式，或需要处理 cron 续期、无工作日、失败恢复时加载本指南。

## 四模式选型

| 模式 | 触发 | 适用场景 | 主要风险 | 配置示例 |
|------|------|----------|----------|----------|
| Heartbeat | 固定间隔唤醒并检查状态 | 队列、日志、服务健康、待处理任务轮询 | 前次循环未结束导致重叠工作 | `*/15 * * * *` + lock guard |
| Cron | 固定时间点执行 | 日报、周报、工作日开发循环、定期审计 | 陈旧 prompt 长期运行 | `0 10 * * 1-5` |
| Hook | 外部事件触发 | PR 创建、CI 失败、webhook、Slack 消息 | webhook 风暴和预算失控 | webhook receiver + rate limit |
| Goal | 一次性启动直到目标满足 | 自主研究、迁移、bug hunt、重构 | 没有收敛条件导致无限循环 | `/goal` objective + completion criterion |

## 选择流程

1. 工作是否锚定在固定时间？是：用 Cron。
2. 工作是否只是定期检查状态，有事才处理？是：用 Heartbeat。
3. 工作是否响应外部事件？是：用 Hook，并设置限流和背压。
4. Agent 是否需要持续推进直到可验证目标完成？是：用 Goal，并写清完成条件和停止规则。
5. 以上都不满足时，先定义业务事件或状态条件，不要创建空泛 cron。

## Heartbeat 配置示例

```yaml
name: queue-health-heartbeat
pattern: heartbeat
schedule: "*/15 * * * *"
timezone: Asia/Shanghai
lock:
  key: queue-health-heartbeat
  ttl_minutes: 20
source:
  type: queue
  query: "status=pending"
execution:
  mode: check-then-act
  max_items: 10
completion:
  no_work: skip
retire:
  strategy: context_threshold
  context_tokens: 36000
  successor_cron: true
```

使用 heartbeat 时必须有锁守卫。若上一轮仍 active，本轮只记录 skipped-overlap，不启动新 session。

## Cron 配置示例

```yaml
name: daily-dev-loop
pattern: cron
schedule: "0 10 * * 1-5"
timezone: Asia/Shanghai
source:
  type: github
  issue_filter:
    labels: ["AI"]
    state: open
execution:
  mode: autonomous
completion:
  no_work: skip-and-renew
retire:
  strategy: after_completion
  spawn_successor: true
  successor_cron: true
```

Cron 到点执行，不以“是否有工作”为前置。没有匹配任务时静默跳过工作体，但仍执行 retire 和续期。

Cron 模板必须包含 `run_lock` 和 `renewal`：

```yaml
run_lock:
  key: daily-dev-loop
  ttl_minutes: 180
  on_conflict: skip-and-renew
renewal:
  mode: one-shot-chain # one-shot-chain | single-recurring-job
  cron_create:
    recurring: false
  existing_job_id: null
```

- `one-shot-chain`：每次只注册下一次触发，调用 `CronCreate(..., recurring=false)`。
- `single-recurring-job`：只允许一个 recurring job，`existing_job_id` 非空时禁止再次创建。
- `run_lock` 未过期时，本轮记录 `skipped-overlap` 并续期，不启动工作体。

## Hook 配置示例

```yaml
name: pr-review-hook
pattern: hook
trigger:
  type: github_webhook
  events: ["pull_request.opened", "pull_request.synchronize"]
rate_limit:
  max_per_hour: 20
  overflow: queue
execution:
  mode: review-only
  skill_chain:
    - code-review
completion:
  comment_on_pr: false
  write_report: true
retire:
  strategy: after_completion
  spawn_successor: false
```

Hook 必须设置限流、去重键和失败队列。没有这些保护时，不要把高频事件接入 Agent。

## 外部动作门控

任何会触达共享状态或外部系统的动作都必须在 `external_actions` 中声明：

```yaml
external_actions:
  push_branch:
    enabled: true
    requires_confirmation: true
  update_issue:
    enabled: true
    requires_confirmation: false
```

- `requires_confirmation: true`：执行前暂停，等待 PM 或配置中的明确授权。
- `requires_confirmation: false`：只允许用于低风险、可回滚、配置已明确授权的动作。
- 未声明的外部动作一律视为禁止。

## Goal 配置示例

```yaml
name: migration-goal
pattern: goal
objective: "Migrate all workflow template parsing to schema-validated YAML loading."
completion_criterion:
  - "All template load paths reject invalid YAML with explicit errors."
  - "Existing templates still load successfully."
stop_rule:
  max_iterations: 20
  max_hours: 4
execution:
  mode: autonomous
  verify:
    method: grade_step
retire:
  strategy: context_threshold
  context_tokens: 36000
  spawn_successor: true
```

Goal 模式必须有 completion criterion 和 stop rule。目标模糊时先使用规格或计划技能，不要直接启动。

## 链式自举协议

每日接班使用固定协议：

```text
1. Cron fire prompt 要求读取 .kimi-tunnel/cron.yaml。
2. 当前 session 获取 `run_lock`；若锁未过期，记录 `skipped-overlap` 并进入续期，不执行工作体。
3. 当前 session 按 cron.yaml 执行任务。
4. 完成或无工作后调用 session-retire。
5. 接班 session 启动时读取 .kimi-tunnel/cron.yaml。
6. 接班 session 按 `renewal.mode` 续期：one-shot-chain 调用 `CronCreate(recurring=false)`；single-recurring-job 复用 `existing_job_id`。
7. 接班 session 写入 project/decisions/cron_config，确保 memory 与文件一致。
```

续期 prompt 必须短而稳定：

```text
读取 .kimi-tunnel/cron.yaml。先获取 run_lock；若锁未过期，记录 skipped-overlap 并按 renewal.mode 续期。锁获取成功后，按 name/source/execution/completion 执行今日任务；若无匹配任务，静默跳过工作体。完成后执行 session-retire；接班 session 读取同一 cron.yaml，并按 renewal.mode 续期：one-shot-chain 使用 CronCreate(recurring=false)，single-recurring-job 复用 existing_job_id。
```

## 无工作日处理

无匹配任务不是失败。

- GitHub Issues 查询为空：不创建分支、不运行实施循环、不报错。
- 文档同步无 diff：不写文件、不运行验证、不报错。
- Triage 无新 issue：不标注、不评论、不报错。

必须继续执行：

```text
no_work -> record concise status -> session-retire -> successor reads cron.yaml -> renew by renewal.mode
```

## 失败恢复

### session-retire 异常

1. 先用 `memory_set(namespace="session/<current>", key="cron_status", value="retire_failed:<reason>")` 保存当前状态。
2. 当前 session 直接读取 `.kimi-tunnel/cron.yaml` 并按 `renewal.mode` 续期一次；one-shot-chain 必须 `CronCreate(recurring=false)`，single-recurring-job 必须复用 `existing_job_id`。
3. 创建一个轻量 successor session，只注入 cron.yaml 路径、失败原因和恢复指令。
4. successor 启动后重试 `session-retire` 交接；若再次失败，保留当前 cron 续期并向 PM 报告。

### CronCreate 失败

1. 不要丢弃已完成工作。
2. 检查 cron 表达式、时区、prompt 长度和当前 session 是否支持 CronCreate。
3. 若仍失败，把 `.kimi-tunnel/cron.yaml` 与错误写入 `project/decisions/cron_config_recovery`。
4. 向 PM 报告需要手动创建 cron；不要静默结束链条。

### Kimi Server 断连

1. 诊断 tunnel/server 状态。
2. 等待或重启 server 后恢复连接。
3. 读取 `.kimi-tunnel/cron.yaml`。
4. 重新调用 `CronCreate` 续期，避免链条断开。

## 红线

- 不允许只有 memory 没有 `.kimi-tunnel/cron.yaml`。
- 不允许无匹配任务时取消未来 cron。
- 不允许缺少 `run_lock` 的 cron/heartbeat 进入自动执行。
- 不允许 one-shot-chain 用默认 recurring cron 续期。
- 不允许 single-recurring-job 重复创建同 schedule recurring job。
- 不允许把 hook 风暴接到无限并发 session。
- 不允许 goal 没有完成条件和停止规则。
- 不允许接班 session 依赖旧上下文续期；必须重新读取 `cron.yaml`。
