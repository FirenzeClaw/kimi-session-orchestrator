# SPEC: Cron Scheduler Skill — 定时自动化编排

> 来源：Loop Engineering 差距分析 #3 Cron 调度
> 日期：2026-07-16
> 状态：Draft

---

## 定位

独立 Skill：`cron-scheduler`。启动后采集用户自动化需求，生成定时调度文档，启动 cron，后续接班 session 自动继承。

## 触发

- `/cron-scheduler` 或 PM 说"设置定时任务""每天自动..."

## 核心流程

```
Phase 1: 采集
  向用户展示预置自动化模板 → 用户选择/自定义 → 补齐参数

Phase 2: 文档化
  生成 .kimi-tunnel/cron.yaml → 写入 project/decisions memory

Phase 3: 启动
  创建首个执行 session → Bash CronCreate 注册定时触发

Phase 4: 自举
  每日执行完成后 → session-retire → 接班 session 读取 cron.yaml → CronCreate 续期
```

---

## Phase 1 — 采集：预置模板 + 自定义

### 预置模板：Daily Dev Loop

```
触发: 每个工作日 10:00
流程:
  ① git pull origin main → git checkout -b ai/$(date +%Y%m%d)
  ② 读取 GitHub Issues（label:AI, status:open）
  ③ 对每个 issue:
      a. 调用 loop-contract-from-docs skill → 生成 Loop 实施规范
      b. PM 审查规范（可跳过确认 → 进入自主模式）
      c. 更新 issue 状态: AI 已接手 (in_progress)
      d. 启用 loop-orchestrator → 读取 guide + 文档 → 自主实施
      e. 实施完成后 → 多轮 grade_step 自检
      f. 更新文档 + issue 状态: AI 已完成 (done) + 附 PR 链接
      g. git push origin ai/$(date +%Y%m%d)
  ④ 所有 issue 处理完毕 → session-retire
  ⑤ 接班 session → 读取 cron.yaml → 按 renewal.mode 安全续期下一轮 cron
```

### 用户可自定义维度

| 维度 | 选项 |
|------|------|
| **触发时间** | 每天 / 工作日 / 指定时刻 / 自定义 cron 表达式 |
| **Git 策略** | 新分支命名规则 / 是否 rebase / 是否自动 PR |
| **任务来源** | GitHub Issues / Linear / 项目 TODO 文件 / 自定义 |
| **Issue 过滤** | label / assignee / milestone / 自定义 |
| **实施模式** | 全自动 / 规范确认后自动 / 每步确认 |
| **验证策略** | grade_step 自检 / 多轮 cross-model / 仅编译通过 |
| **完成后动作** | 自动 PR / 仅 push / 仅本地 |
| **退役策略** | 每日退役 / 按 issue 数退役 / 上下文阈值退役 |

---

## Phase 2 — 文档化

生成 `cron.yaml` 到项目 `.kimi-tunnel/` 目录：

```yaml
# .kimi-tunnel/cron.yaml — 定时自动化配置
name: daily-dev-loop
schedule: "0 10 * * 1-5"  # 工作日 10:00
timezone: Asia/Shanghai

run_lock:
  key: daily-dev-loop
  ttl_minutes: 180
  on_conflict: skip-and-renew

renewal:
  mode: one-shot-chain      # one-shot-chain | single-recurring-job
  cron_create:
    recurring: false        # one-shot-chain 必须 false，避免重复 recurring job
  existing_job_id: null     # single-recurring-job 模式下复用

external_actions:
  update_issue:
    enabled: true
    requires_confirmation: false
  comment_on_issue:
    enabled: true
    requires_confirmation: false
  push_branch:
    enabled: true
    requires_confirmation: true
  create_pr:
    enabled: false
    requires_confirmation: true

source:
  type: github
  repo: FirenzeClaw/kimi-session-orchestrator
  issue_filter:
    labels: ["AI"]
    state: open

git:
  base_branch: main
  branch_pattern: "ai/{{date}}"

execution:
  mode: autonomous           # autonomous | confirmed | step-by-step
  skill_chain:
    - loop-contract-from-docs
    - loop-orchestrator
  verify:
    method: grade_step       # grade_step | cross-model | compile-only
    rounds: 3
    grader_model: gpt-5.5    # 若 cross-model

completion:
  update_issue: true
  push_branch: true
  create_pr: false

retire:
  strategy: after_completion  # after_completion | context_threshold | per_issue
  spawn_successor: true
  successor_cron: true        # 接班 session 自动续期 cron

created_by: session_xxx
created_at: 2026-07-16T13:00:00Z
```

同时写入 memory：

```
memory_set(namespace="project/decisions", key="cron_config",
  value="<cron.yaml 内容>")
```

---

## Phase 3 — 启动首个 Cron

```
① create_session(cwd, permission_mode="auto")
   → first_session_id

② 注入首日 prompt（从 cron.yaml 渲染）:
   "今日任务: 按 cron.yaml 配置执行 daily-dev-loop..."

③ Bash CronCreate:
   schedule  = cron.yaml.schedule
   recurring = false  # renewal.mode=one-shot-chain 时必须 false
   prompt    = "读取 .kimi-tunnel/cron.yaml，获取 run_lock，执行今日任务；完成后按 renewal.mode 续期..."

④ 接班协议:
   每日执行完毕后 → session-retire 流程
   新 session 启动步骤 5 改为:
     "5. 读取 .kimi-tunnel/cron.yaml → one-shot-chain 用 CronCreate(recurring=false) 注册下一轮；single-recurring-job 复用 existing_job_id，不重复创建"
```

---

## Phase 4 — 自举：Cron 续期链

```
Day 1:
  Session_A (cron 触发) → 获取 run_lock → 执行任务 → session-retire
    → Session_B (接班) → 读取 cron.yaml → CronCreate("0 10 * * 1-5", recurring=false) → 等待

Day 2:
  Session_B (cron 触发) → 获取 run_lock → 执行任务 → session-retire
    → Session_C (接班) → 读取 cron.yaml → CronCreate(..., recurring=false) → 等待

...循环...
```

关键：`cron.yaml` 是持久化的事实来源。每个接班 session 读取它并按 `renewal.mode` 续期，确保链条不断且不累积重复 recurring job。

若某天无需执行（无匹配 issue）：
- 静默退出 → session-retire → 接班 session 照常按 renewal.mode 注册明日 cron

若前一轮仍持有未过期 `run_lock`：
- 记录 `skipped-overlap` → 不启动工作体 → 仍按 renewal.mode 续期

---

## Skill 文件结构

```
skills/cron-scheduler/
├── SKILL.md              # 入口：启动协议 + Phase 1-4 流程
├── templates/
│   ├── daily-dev-loop.yaml  # 预置模板
│   ├── issue-triage.yaml
│   └── doc-sync.yaml
└── guide-cron-patterns.md   # Cron 模式参考（heartbeat/cron/hook 选型）
```

---

## 与现有 Skill 的关系

```
cron-scheduler (本 skill)
  ├─ 触发 loop-contract-from-docs / loop-contract-from-idea (待建)
  │    └─ 生成 Loop Contract → 规范实施流程
  ├─ 触发 loop-orchestrator (已有)
  │    └─ 自主编排执行
  ├─ 触发 session-retire (已有)
  │    └─ 每日退役 + 接班
  └─ 使用 memory_set/get (已有)
       └─ cron.yaml 持久化
```

---

## 验收标准

1. `/cron-scheduler` → 展示预置模板 → 用户选择 daily-dev-loop
2. 用户自定义时间 + issue 过滤条件 → 生成 `cron.yaml`
3. `cron.yaml` 写入 `.kimi-tunnel/` + `project/decisions` memory，且包含 `run_lock`、`renewal`、`external_actions`
4. 首个 session 创建成功 + CronCreate 注册；one-shot-chain 必须 `recurring=false`
5. 接班 session 读取 cron.yaml → 按 renewal.mode 自动续期 cron，不重复创建同 schedule recurring job
6. 无匹配 issue 时静默跳过，cron 链不断
7. 前一轮未结束时记录 `skipped-overlap`，不启动重叠工作体，cron 链不断
8. GitHub/Git 外部副作用按 `external_actions.requires_confirmation` 执行确认门控
