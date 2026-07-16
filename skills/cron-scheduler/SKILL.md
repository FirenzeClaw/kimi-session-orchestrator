---
name: cron-scheduler
description: Use when PM invokes /cron-scheduler, asks to set up scheduled tasks, or needs recurring Kimi session automation anchored to a cron schedule.
---

# Cron Scheduler — 定时自动化编排

## 概述

`cron-scheduler` 把重复性 PM 编排沉淀为一个可续期的 cron 链。`cron.yaml` 是唯一事实来源：先写 `.kimi-tunnel/cron.yaml`，再把同一内容双写到 `project/decisions` memory，后续 session 只从该配置恢复和续期。

## 触发

- 用户调用 `/cron-scheduler`
- PM 说“设置定时任务”“每天自动...”“定期跑...”
- 需要把 `loop-orchestrator`、`session-retire`、`memory_get/set` 串成周期性执行链

## 启动前硬门

1. 读取项目规范：`AGENTS.md`、README、相关 SPEC。
2. 读取 `skills/cron-scheduler/guide-cron-patterns.md`，只有在选择 cron/heartbeat/hook/goal 模式时才加载。
3. 读取可用模板：`templates/daily-dev-loop.yaml`、`templates/issue-triage.yaml`、`templates/doc-sync.yaml`。
4. 调用 `memory_get(namespace="project/meta")` 与 `memory_get(namespace="project/decisions")` 时必须使用 `kimi-session-orchestrator` MCP，不使用 knowledge-graph memory MCP。

完成标准：PM 已确认项目背景、已有决策、目标工作目录和候选模板。

## Phase 1: 采集

向用户展示预置模板，并收集自定义参数。Auto permission mode 下不要调用 `AskUserQuestion`，改用纯文本列出选项并基于用户已有描述继续；非 Auto 模式可一次只问一个关键问题。

### 预置模板

| 模板 | 场景 | 文件 |
|------|------|------|
| `daily-dev-loop` | GitHub Issues 驱动的每日开发循环 | `templates/daily-dev-loop.yaml` |
| `issue-triage` | 定时分类、排序、标注 issue，不实施 | `templates/issue-triage.yaml` |
| `doc-sync` | 定时代码变更扫描并同步文档 | `templates/doc-sync.yaml` |

### 自定义维度

- 触发时间：每天、工作日、指定时刻、自定义 cron 表达式。
- Git 策略：分支命名规则、是否 pull/rebase、是否 push、是否自动 PR。
- 任务来源：GitHub Issues、Linear、项目 TODO 文件、自定义查询。
- Issue 过滤：label、assignee、milestone、state、自定义搜索语法。
- 实施模式：全自动、规范确认后自动、每步确认。
- 验证策略：`grade_step`、cross-model、多轮自检、仅编译通过。
- 完成后动作：自动 PR、仅 push、仅本地、只写报告。
- 退役策略：每日退役、按 issue 数退役、按 `context_tokens` 阈值退役。

完成标准：已得到模板名、schedule、timezone、source、execution、completion、retire 七类配置；缺失项已用模板默认值补齐并显式标注。

## Phase 2: 文档化

1. 渲染 `.kimi-tunnel/cron.yaml`。缺少 `.kimi-tunnel/` 时创建目录；不要把配置分散到多个文件。
2. 配置必须包含 `run_lock`、`renewal` 与 `external_actions`：
   - `run_lock` 防止同一 schedule 重叠执行；上一轮未结束时本轮只记录 `skipped-overlap`。
   - `renewal.mode` 必须为 `one-shot-chain` 或 `single-recurring-job`。默认用 `one-shot-chain`；每次 `CronCreate` 必须 `recurring=false`，只注册下一次触发。
   - `external_actions` 对 issue 评论、label 更新、push、PR 等外部副作用逐项声明 `requires_confirmation`。
3. 将同一份 YAML 内容写入 memory：

```text
memory_set(namespace="project/decisions", key="cron_config", value="<.kimi-tunnel/cron.yaml 完整内容>")
```

4. 在 memory value 中保留 `name`、`pattern`、`schedule`、`timezone`、`run_lock`、`renewal`、`external_actions`、`source`、`execution`、`completion`、`retire`、`created_by`、`created_at`。
5. 后续任何修改都必须先改 `.kimi-tunnel/cron.yaml`，再覆盖 `project/decisions/cron_config`。文件和 memory 不一致时，以文件为准并立即重写 memory。

完成标准：`.kimi-tunnel/cron.yaml` 与 `project/decisions/cron_config` 内容一致，且配置足以安全重建下一次 `CronCreate`，不会产生重复 recurring job 或重叠执行。

## Phase 3: 启动

1. 创建首个执行 session：`create_session(cwd=<project root>, permission_mode="auto", memory_level="standard")`。
2. 将首日 prompt 逐条注入。首条必须要求执行 session 读取 `.kimi-tunnel/cron.yaml`，再按配置执行今日任务。
3. 任务需要实施时，按配置集成：
   - `loop-contract-from-docs` 或 `loop-contract-from-idea` 生成 Loop Contract。
   - `loop-orchestrator` 执行实施、验收或混合循环。
   - `memory_get/set` 记录进展和最终决策。
4. 使用 `CronCreate` 注册下一次触发：
   - `renewal.mode: one-shot-chain` 时必须 `recurring=false`，只注册下一次触发。
   - `renewal.mode: single-recurring-job` 时只能创建一个 recurring job，并把 job id 写回 `cron.yaml` 与 memory；不得每次接班重复创建。
   - prompt 必须包含：读取 `.kimi-tunnel/cron.yaml`、获取 `run_lock`、执行对应模板、无匹配任务时静默跳过、完成后进入 `session-retire`。
5. `CronCreate` 成功后向用户报告 job id、schedule、renewal mode 和取消方式。

完成标准：首个执行 session 已创建，cron job 已注册，job prompt 明确以 `cron.yaml` 为唯一事实来源，且不会重复创建同 schedule recurring job。

## Phase 4: 自举

每日 cron 触发后执行以下链条：

```text
当前 session 获取 run_lock
  -> lock 已存在且未过期：记录 skipped-overlap，释放本轮，不启动工作体
  -> lock 获取成功：执行任务或无匹配任务时静默跳过工作体
  -> session-retire
  -> 接班 session 读取 .kimi-tunnel/cron.yaml
  -> 按 renewal.mode 续期下一轮
```

接班 session 的启动步骤 5 必须替换为：

```text
5. 读取 .kimi-tunnel/cron.yaml；如果 project/decisions/cron_config 缺失或过期，以文件内容重写 memory；根据 renewal.mode 续期：one-shot-chain 使用 CronCreate(recurring=false) 注册下一次触发；single-recurring-job 复用已有 job id，不重复创建；随后等待下一次触发。
```

完成标准：无论当天是否有匹配任务，接班 session 都已按 renewal.mode 安全续期 cron；`session-retire` 失败时按 `guide-cron-patterns.md` 的 fallback 策略恢复。

## Daily Dev Loop 样例

```text
工作日 10:00
  -> 拉取 GitHub Issues(label: AI, state: open)
  -> 每个 issue 生成 Loop Contract
  -> loop-orchestrator 自主实施与 grade_step 验证
  -> 更新 issue 状态或生成本地完成报告
  -> session-retire
  -> 接班 session 读取 cron.yaml 并续期
```

## 常见错误

| 错误 | 修正 |
|------|------|
| 只创建 `CronCreate`，不写 `cron.yaml` | 先文档化，再启动；`cron.yaml` 是唯一事实来源 |
| 只写文件，不写 memory | Phase 2 必须双写到 `project/decisions/cron_config` |
| 无匹配 issue 就停止链条 | 静默跳过工作体，但仍执行 retire 与续期 |
| 接班 session 继承旧 prompt | 接班必须重新读取 `cron.yaml`，再按 renewal.mode 续期 |
| 每次接班都创建 recurring job | 默认改为 one-shot-chain + `CronCreate(recurring=false)`；若用 recurring，必须复用既有 job id |
| 没有 run_lock | 加入 lock key、ttl、on_conflict=skip-and-renew，防止重叠执行 |
| 自动评论、打标、push 或 PR 无确认门 | 在 `external_actions` 中声明并按 `requires_confirmation` 暂停 |
| 把 heartbeat/hook/goal 都塞进 cron | 先读模式指南，选择正确循环模式 |

## 交付自检

- 5 个 skill 文件存在：入口、模式指南、3 个模板。
- `SKILL.md` 包含 Phase 1-4 和预置模板展示。
- `guide-cron-patterns.md` 覆盖 heartbeat、cron、hook、goal 与自举协议。
- `daily-dev-loop.yaml` 引用 `loop-contract-from-docs` 或 `loop-contract-from-idea`，并引用 `loop-orchestrator`。
- Phase 2 明确 `.kimi-tunnel/cron.yaml` + `project/decisions/cron_config` 双写策略。
- 模板包含 `run_lock`，并定义 overlap 时 `skip-and-renew`。
- 模板包含 `renewal.mode`；默认 one-shot-chain 必须使用 `CronCreate(recurring=false)`。
- 模板包含 `external_actions`，所有 GitHub/Git 外部副作用都有确认策略。
