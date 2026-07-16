# Loop Engineering 全面参考指南

> 2026 年 7 月 · 编译自 7 篇行业核心文章
> 含本项目（kimi-session-orchestrator）的对照分析

---

## 目录

1. [什么是 Loop Engineering](#1-什么是-loop-engineering)
2. [起源与关键人物](#2-起源与关键人物)
3. [四种循环模式](#3-四种循环模式)
4. [Agentic Loop 解剖](#4-agentic-loop-解剖)
5. [四大制动器](#5-四大制动器)
6. [上下文腐化与 Doom Loop](#6-上下文腐化与-doom-loop)
7. [Maker/Checker 验证模式](#7-makerchecker-验证模式)
8. [五大循环设计模式](#8-五大循环设计模式)
9. [Loop Failure Modes](#9-loop-failure-modes)
10. [成熟度模型](#10-成熟度模型)
11. [Andrew Ng 的三层循环](#11-andrew-ng-的三层循环)
12. [成本与路由策略](#12-成本与路由策略)
13. [学术验证：ComPilot](#13-学术验证compilot)
14. [Operation Loop Stack](#14-operator-loop-stack)
15. [与本项目的对照](#15-与本项目的对照)
16. [参考来源](#16-参考来源)

---

## 1. 什么是 Loop Engineering

**Loop Engineering** 是设计 AI Agent 自主循环的工程学科——设计的是"让 Agent 自我提示、自我验证、自我重试、自我停止"的系统，而非手动逐轮提示 Agent。

> Prompt engineering 优化单次交互。Loop engineering 优化系统化的自主行为。—— Agent Shortlist

### 核心公式

```
Agent = Model + Harness
Harness = 静态脚手架（规则、工具、沙箱、记忆、钩子）
Loop   = 动态运行时（观察→决策→执行→验证→重复）
```

四个工程层次（由内到外）：

| 层次 | 控制什么 | 回答的问题 |
|------|---------|-----------|
| Prompt Engineering | 发送给模型的文字 | "怎么措辞指令？" |
| Context Engineering | 模型能看到的所有信息 | "当前视野内有什么？" |
| Harness Engineering | 模型周围的代码——工具、状态、错误处理 | "它能做什么？失败时怎么办？" |
| **Loop Engineering** | 朝向目标的自主循环 | "它怎么在没有我的情况下运行并停止？" |

### 不是魔法自主

> "Loop engineering is not magic autonomy. It is systems engineering around AI agents." — Jack Njoroge

---

## 2. 起源与关键人物

2026 年 6 月，三个关键声音同时指向同一个范式转移：

| 人物 | 身份 | 名言 |
|------|------|------|
| **Boris Cherny** | Claude Code 创建者 | "I don't prompt Claude anymore. I have loops that are running. My job is to write loops." |
| **Peter Steinberger** | OpenClaw 创建者 | "You should be designing loops that prompt your agents." |
| **Addy Osmani** | Google Cloud 工程负责人 | "Loop engineering is replacing yourself as the person who prompts the agent. You design the system that does it instead." |
| **Andrew Ng** | DeepLearning.AI 创始人 | "Loops are now a key part of how we get AI agents to iterate at length to build software." |

### 命名关系

```
Addy Osmani 提出命名 → "Loop Engineering" 成为行业术语
Jack Njoroge   → Operator Loop Stack（实操框架）
AgentPatterns  → Three Loops 诊断词汇（tool/verification/convergence loops）
```

---

## 3. 四种循环模式

> 来源：Agent Shortlist / Requesty / Jack Njoroge

四种模式覆盖 ~95% 的生产级 Agent 部署：

### Pattern 1: Heartbeat（心跳）

Agent 按固定间隔唤醒，检查是否有工作要做。

| 特征 | 值 |
|------|-----|
| 触发 | 定时器（每 5 分钟 / 每小时） |
| 签名用例 | 监控——检查日志、队列、服务健康 |
| 优势 | 对状态变化的反应性，成本受频率限制 |
| 失败模式 | 前次循环未结束 → 重叠工作（需锁守卫） |
| 月成本参考 | ~$13（每 5 分钟，500 tokens/次） |

### Pattern 2: Cron（定时任务）

锚定在时间上，到点必执行，不在乎是否有"工作要做"。

| 特征 | 值 |
|------|-----|
| 触发 | 固定时刻（每天 9am / 每周一） |
| 签名用例 | 周报、日报汇总、定期审计 |
| 优势 | 可预测性，利益相关者准确知道何时有产出 |
| 失败模式 | 用陈旧 prompt 运行了 6 个月没人注意——需季度审计 |
| 月成本参考 | ~$0.06（每周一次，5000 tokens） |

### Pattern 3: Hook（事件钩子）

外部事件触发——PR 推送、CI 失败、Slack 消息、webhook。

| 特征 | 值 |
|------|-----|
| 触发 | 外部事件 |
| 签名用例 | PR 到来时审查+分类；CI 失败时分析+修复 |
| 优势 | 实时响应 |
| 失败模式 | webhook 风暴（一次 10000 事件 → 10000 次 agent 运行 → 预算瞬间烧穿）。必须限流+背压。 |
| 月成本参考 | ~$60（1000 次/月，2000 tokens/次） |

### Pattern 4: Goal（目标驱动）

Agent 持续运行，自我提示，直到严格定义的结果被验证。无心跳、无 cron、无外部触发器——仅初始启动。

| 特征 | 值 |
|------|-----|
| 触发 | 一次性启动 |
| 签名用例 | 自主研究、重构、bug 猎杀、迁移 |
| 优势 | 无界努力应用于明确定义的目标 |
| **失败模式最昂贵** | 没有收敛条件的目标 = 烧几千美元才有人发现 |
| 月成本参考 | ~$9（5 次/月，20 迭代 × 3000 tokens） |

### 如何选择循环模式

五个问题按顺序问：

1. ⏰ 工作是锚定在时间上还是状态上？ → cron / heartbeat
2. 🔔 工作是否响应外部事件？ → hook
3. 🎯 Agent 是否需要持续工作直到条件满足？ → goal
4. 💰 每次循环的成本上限是多少？
5. 🆘 失败升级路径是什么？

**常见组合**：客服 agent = Hook（收工单）+ Heartbeat（检查升级队列）+ Cron（每日报表）

---

## 4. Agentic Loop 解剖

> 来源：Flowtivity / AppScale

每个有效 AI Agent 都运行同一四阶段循环：

```
┌─────────────────────────────────────────┐
│ ① Observe  收集上下文                     │
│    ↓                                     │
│ ② Decide   规划下一个动作                  │
│    ↓                                     │
│ ③ Act      执行（写代码/运行命令/调API）     │
│    ↓                                     │
│ ④ Verify   检查结果（最关键！大多数团队跳过）  │
│    ↓                                     │
│ 成功 → 交付 / 失败 → 回到 Observe            │
└─────────────────────────────────────────┘
```

### 六个核心组件

每个生产级循环需要：

1. **Worktrees** — 每次迭代在隔离的 git worktree 中运行，避免污染主分支
2. **Skills** — 可复用的指令集，循环可引用而非内联粘贴
3. **Connectors (MCP)** — 外部工具接入（数据库、issue tracker、CI 系统）
4. **Subagents** — 循环控制器拆分工作，委托给专业化 subagent（各自独立上下文窗口）
5. **State Tracking** — JSON checkpoint / git history / DB，防止跨迭代重复工作
6. **Verification Gate** — "done" = 验证通过，不是 "agent 觉得完成了"

---

## 5. 四大制动器

> 来源：AppScale

**"Turn-end is not task-done."** —— 当 agent 不再请求工具时，它结束了一个 turn——这不等于完成了任务。

每个生产级循环必须配备四个独立制动器：

| 制动器 | 说明 | 典型值 |
|--------|------|--------|
| **Max-iteration cap** | 硬上限——stuck agent 不能永远运行 | 25-50 步 |
| **Budget/time limits** | tokens / 美元 / 墙钟时间上限 | $5 + 30min |
| **No-progress detection** | 若 agent 用相同参数发出相同工具调用两次 → 正在自旋 → 干预 | 注入提示或升级 |
| **Completion check** | **真正的完成检查**——测试套件通过 ≠ "agent 自我感觉良好" | 可机器验证的条件 |

> Karpathy 的教训：他的 AGENTS.md 规则告诉 coding agent 保持每行做一件事——agent 仍然链式调用和内联索引结果，不管规则写了多少遍。修复不在 prompting 里，在 loop 的制动器里。

---

## 6. 上下文腐化与 Doom Loop

> 来源：AppScale

**Context rot（上下文腐化）**：每次 turn 将工具输出、死胡同、过时推理追加到上下文 → 模型性能随堆涨而下降 → 更差的决策 → 更多噪音 → 更腐化 → **doom loop**。

### 应对策略

| 策略 | 做法 |
|------|------|
| **Compaction** | 对话变长时，总结并继续——丢弃原始，保留摘要 |
| **Offloading** | 40000 token 的工具输出推到文件，仅保留下一个决策需要的切片 |
| **Subagents** | 把脏子任务交给独立 agent（干净上下文），只让干净结果返回主循环 |

> "Context is a budget, not a bucket. The instinct is to keep everything, just in case. The skill is knowing what to throw away."

---

## 7. Maker/Checker 验证模式

> 来源：AppScale / Flowtivity

**核心原则：代理不能批改自己的作业。**

```
┌──────────────┐    产出     ┌──────────────┐
│ Maker Agent  │ ──────────→ │ Checker      │
│ 生产工作      │             │ 测试/类型/    │
└──────────────┘             │ schema/第二模型│
                             └──────┬───────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ↓               ↓               ↓
                 pass            fail+可操作       N次失败
                 证明完成        反馈→context      →升级到人类
```

### Write-Time Verification（写时验证）

2026 年的关键迭代：验证应在**工作产生的地方**运行，在 agent 自己的 session 内，而非作为分离的下游 gate。Sonar 把这个循环（guide → verify → fix）称为 Agent-Centric Development Cycle。

### 工具契约

- 工具要**少而聚焦**——Anthropic 的法则："如果一个人类工程师不能确切说哪个工具适合某任务，agent 更不可能"
- 写操作必须**幂等**——重试是循环的天性，不幂等的写 = 重复记录 + 双重扣费
- **错误即指令**——"Invalid input" 困住 agent；"date must be YYYY-MM-DD, got '3rd June'" 告诉它 next turn 做什么

---

## 8. 五大循环设计模式

> 来源：Flowtivity

### Pattern 1: Single-Pass（单次直出）

```
Observe → Decide → Act → Deliver
```

- 一次完成，不验证、不迭代
- 适用：低风险可逆任务（头脑风暴、初稿大纲）
- 禁用：任何涉及生产/客户/不可逆系统的事

### Pattern 2: Reflective（自省式）

```
Observe → Decide → Act → Verify → (修复) → Deliver
```

- 同一 agent 戴两顶帽子：生成者 + 审查者
- 适用：存在客观成功标准的任务（测试通过、schema 校验）
- 风险：自我评价偏见——用刚性检查清单而非开放式自审

### Pattern 3: Multi-Agent Review（多 Agent 审查）

```
Agent A: 生产 → Agent B: 验证+批判 → Agent A: 修复 → 循环至 B 批准
```

- 生成和评估分给不同 agent、不同上下文
- 适用：高风险工作（客户交付物、安全敏感代码、合规文档）
- 风险：委员会困境——太友好则橡皮图章，太挑剔则永不终止

### Pattern 4: Human-in-Loop（人类在环）

```
Observe → Decide → Act → Human Review → (批准或拒绝)
```

- Agent 产出由人类审查后再发布，循环在人类判断处暂停
- 适用：不可逆的外部操作（发邮件、发社交、改生产数据）
- 风险：审查疲劳——第 20 次之后人类开始橡皮图章

### Pattern 5: Autonomous with Guardrails（护栏自治）

```
Observe → Decide → Act → Verify → (pass→继续 / fail超阈值→升级人类)
```

- Agent 在定义约束内自由运行，失败超阈值时升级而非无限循环
- 适用：批处理、数据管道、持续监控、研究任务
- 风险：护栏盲区——规则机械执行，上下文变化时仍照旧执行

---

## 9. Loop Failure Modes

> 来源：Flowtivity / AppScale

### 五大常见失败模式

| 失败模式 | 表现 | 根因 | 修复 |
|----------|------|------|------|
| **Infinite Loop** | Agent 重复相同操作：试→失败→试相同→失败 | 没有迭代记忆 | 每次 observe 注入历史 + max-iterations |
| **Premature Exit** | Agent 写到一半就宣布成功退出 | 终止条件太松 | 定义显式可检查完成标准：tests pass ≠ "looks done" |
| **Context Bloat** | 到第 8 次迭代上下文窗口被历史窒息 | 迭代间无上下文管理 | Summarise + offload + 只保留最后错误和当前计划 |
| **Yes-Spiral** | Agent 产生→审查→"很棒！"→产生→审查→"很棒！"→质量永不提升 | 自我评价偏见 | 分离 maker/checker 或用刚性检查清单替代自评 |
| **Loop Drift** | 第 5 次迭代时已悄然偏离原始目标 | 原始任务描述被上下文淹没 | 每次迭代注入 ORIGINAL GOAL 在上下文顶部 |

### 反模式速查（AppScale 七条）

1. ❌ 信任 turn-end = task-done
2. ❌ 无制动器的循环（无上限、无预算、无超时）
3. ❌ 上下文囤积（"just in case" → rot）
4. ❌ 工具泛滥（100 个重叠工具 → 选择瘫痪）
5. ❌ 非幂等写入放进重试循环
6. ❌ Agent 自我评分
7. ❌ Prompt 力度加大而非修复 harness

---

## 10. 成熟度模型

> 来源：AppScale / Flowtivity

| 阶段 | 名称 | 特征 |
|:--:|------|------|
| 0 | **手工 Prompt** | 你逐轮输入——你就是循环，没有你什么都不运行 |
| 1 | **基础循环+制动器** | Day 1 就装上 max-iterations + timeout + cost ceiling + 自动化完成检查 |
| 2 | **上下文管理** | Compaction + offloading + subagent 隔离 + 工具审计（少/聚焦/幂等） |
| 3 | **Critic 就位** | Maker/checker 分离 + 写时验证 + N 次连续失败后升级人类（带完整轨迹） |
| 4 | **脱手运行** | 成功标准即 spec + 持久化 checkpoint + 隔夜循环可信——因为"说不"的系统从未需要你来说 |

> 大多数团队在 Stage 0 说着 Stage 4 的话。梯子是一个制动器、一个预算、一个 verifier 一步步爬上去的——只有当你信任那个 "no" 时才算真正脱手。

---

## 11. Andrew Ng 的三层循环

> 来源：ADTmag / Andrew Ng's X post

Andrew Ng 将 Loop Engineering 分为三个时间尺度的循环：

```
┌─────────────────────────────────────────────────────────┐
│ ③ External Feedback Loop（外部反馈循环）                   │
│    朋友 / alpha 测试者 / 生产用户 / A/B 测试               │
│    周期：数天到数周                                        │
│    → 塑造产品愿景 → 驱动 Spec → 驱动 Coding Loop            │
├─────────────────────────────────────────────────────────┤
│ ② Developer Feedback Loop（开发者反馈循环）                  │
│    人类审查 + 引导                                         │
│    人类有 AI 没有的上下文优势（用户理解、产品品味）             │
│    周期：数小时到数天                                       │
├─────────────────────────────────────────────────────────┤
│ ① Agentic Coding Loop（Agent 编码循环）                    │
│    Agent 收到 Spec + Evals → 写代码 → 测试 → 迭代           │
│    每几分钟一个版本                                         │
│    周期：数分钟                                            │
│    可自主运行 ~1 小时无需人类干预                            │
└─────────────────────────────────────────────────────────┘
```

核心洞察：**"只要人类知道 AI 不知道的事情，human-in-the-loop 就是必要的——用来将那些知识注入系统。"**

---

## 12. 成本与路由策略

> 来源：Requesty / Agent Shortlist

### 循环成本对照

| 模式 | 频率 | tokens/次 | 月成本 |
|------|------|-----------|--------|
| Heartbeat | 每 5 分钟 | 500 | ~$13 |
| Cron | 每周 | 5,000 | ~$0.06 |
| Hook | 1000/月 | 2,000 | ~$60 |
| Goal（研究） | 5×/月 | 60,000 (20 迭代 × 3k) | ~$9 |

### 模型路由降本 60-80%

| 循环步骤 | 模型层级 | 每 1M tokens 成本 |
|----------|---------|-------------------|
| 文件扫描/分类 | Nano (GPT-5.4-nano, Gemini Flash) | $0.10–$0.30 |
| 摘要/草稿 | Mid-tier (Sonnet 4.6, GPT-5.4) | $1–$3 |
| 最终审查/决策 | Frontier (Opus 4.8, GPT-5.5) | $10–$15 |

配合 prompt caching（重复 system prompt + 工具定义 90% 输入成本削减），日成本可从 $50 降到 $8–$12。

---

## 13. 学术验证：ComPilot

> 来源：Flowtivity / PACT 2025 论文（Merouani et al.）

ComPilot 是一个 LLM 驱动编译器优化的 Agent 框架——这是 Loop Engineering 理论最有力的学术证据。

### 架构（教科书级的四阶段循环）

| 阶段 | ComPilot 实现 |
|------|--------------|
| Observe | LLM 收到循环嵌套代码 + 基线执行时间 + **完整历史**（所有之前尝试的变换及结果） |
| Decide | Chain-of-thought 推理 → 提出变换序列 |
| Act | 编译器尝试应用变换（合法性分析 + 代码生成 + 执行） |
| Verify | 编译器回报 5 类反馈（非法 schedule / 编译器崩溃 / 成功执行 + 实测加速比） |

### 结果

- **2.66x** 几何平均加速（单次优化运行）
- **3.54x** 加速（best-of-5 运行）
- **超越 Pluto**（polyhedral optimizer 的 SOTA）
- 在某些 benchmark 上 **>100x 加速**
- **无任何 fine-tuning**——用的就是 off-the-shelf LLM

### 验证了什么

1. **Verify 阶段不可协商**——没有编译器反馈，LLM 就是在猜
2. **Chain-of-thought 有实际作用**——Decide 阶段不是形式化步骤
3. **Premature Exit 真实存在**——LLM "在显著加速后趋于保守地提前停止"
4. **上下文管理至关重要**——优化对话累积历史，可能导致 Context Bloat
5. **循环将通才变成专家**——通过反馈循环，通用 LLM 达到甚至超越专用工具

---

## 14. Operator Loop Stack

> 来源：Jack Njoroge / The New Operators

Jack Njoroge 提出的五层实操框架：

```
┌──────────────────────────────────┐
│ 5. Human Checkpoint              │ 人类判断——生产变更、客户影响、安全风险
├──────────────────────────────────┤
│ 4. Checker                       │ 独立验证器——不可是生产模型自我评分
├──────────────────────────────────┤
│ 3. State Layer                   │ 状态持久化——run logs / artifacts / memory
├──────────────────────────────────┤
│ 2. Loop Contract                 │ 循环契约——目标/范围/验证器/停止条件/预算
├──────────────────────────────────┤
│ 1. Harness                       │ 环境——规则/工具/沙箱/worktree/可发现文档
└──────────────────────────────────┘
```

### The Operator Test（上线前必过）

> "If the agent cannot prove it is done, you are not engineering a loop. You are automating drift."

### 循环就绪检查清单

在运行任何循环之前，回答这些：

- [ ] 什么启动循环？触发器是什么？
- [ ] 目标——什么确切条件应该变为 true？
- [ ] Agent 需要什么文件/规则/工具？
- [ ] Agent 可以触碰什么？
- [ ] 什么**确定性**验证器检查结果？
- [ ] 状态写在哪里？
- [ ] 最大迭代次数/预算是多少？
- [ ] 什么导致升级到人类？
- [ ] Kill switch 是什么？
- [ ] 结束后你会审查什么？

---

## 15. 与本项目的对照

kimi-session-orchestrator 本质上是 **Loop Engineering 的一个完整实现**——为 Kimi Code CLI 构建的 PM 编排系统。

### 对照表

| Loop Engineering 概念 | 本项目对应实现 |
|----------------------|--------------|
| **Agentic Loop** | loop-orchestrator skill 的 6 阶段执行循环 (STEP 1–7) |
| **Heartbeat 模式** | `poll_command` Bash 后台轮询 + `watch_session` WS 监听 |
| **Goal 模式** | `execute_workflow` / `run_flow`——定义目标，逐步驱动直到完成 |
| **Hook 模式** | `set_watch_output`——任务完成时自动写入结果文件 |
| **Maker/Checker** | `grade_step` LLM 评分工具 + PM 审查（§3.3 结果审查清单） |
| **四大制动器** | `context_tokens` 监控 [CTX_HIGH]（v2.14）+ `BlockageTypeEnum::loop_detected`（v2.9）|
| **Context Rot 应对** | `session-retire` skill——360K 拐点主动退役 + 接班 pipeline |
| **Subagents** | `create_session` + `from_session` 注入——干净上下文 + 零污染 |
| **State Layer** | `memory_set/get` SQLite 三层记忆（project → session → learnings）|
| **Loop Contract** | 7-block 上下文交接模板——目标/规范/已完成/待办/决策/权限/风险 |
| **Human Checkpoint** | `approve_tool` / `deny_tool` + manual session 审批流 + PM Dashboard |
| **No-progress Detection** | workflow-engine 自动 blockage 检测 + `continue_workflow` 决策 |
| **Operator Test** | 5 步启动协议——新 session 必须完成上下文建立后才接收任务 |
| **Cost/Budget** | `context_tokens` 阈值（36000）+ wire.jsonl 行数代理监控 |
| **Kill Switch** | session 退役协议——偏离规范 2 次 → 退役；幻觉 → 立即退役 |

### 本项目当前成熟度

对照成熟度模型，kimi-session-orchestrator 处于 **Stage 3→4**：

| 组件 | 状态 |
|------|:--:|
| 基础循环+制动器 | ✅ Stage 1 |
| 上下文管理（compaction/offloading/subagent） | ✅ Stage 2 |
| Critic 就位（grade_step + maker/checker） | ✅ Stage 3 |
| 脱手运行（overnight loop + durable checkpoint） | 🔄 Stage 4 进行中 |

### 可改进方向

| 差距 | Loop Engineering 建议 |
|------|---------------------|
| 缺显式预算上限（$ cap） | 添加每 session / 每 workflow token 预算约束 |
| 缺循环健康仪表盘 | 追踪首次通过率、平均迭代次数、人工升级率 |
| Checkpoint 不持久 | 当前仅内存 OrchestrationStore，session 重启丢失 → 需 durable execution |
| 缺模型路由 | 简单轮询用便宜模型，关键决策用 Frontier——可降本 60-80% |

---

## 16. 参考来源

| # | 来源 | 标题 | 日期 |
|---|------|------|------|
| 1 | Agent Shortlist | [Loop Engineering: AI Agent Patterns (2026)](https://agentshortlist.com/articles/loop-engineering) | 2026-06-17 |
| 2 | AppScale Blog | [Loop Engineering for AI Agents: The Complete Guide](https://appscale.blog/en/blog/loop-engineering-ai-agents-complete-guide-2026) | 2026-07-07 |
| 3 | Requesty | [Loop Engineering: How to Build AI Agent Loops That Run Themselves](https://www.requesty.ai/blog/loop-engineering-how-to-build-ai-agent-loops-that-run-themselves) | 2026-06-17 |
| 4 | Flowtivity | [Loop Engineering: The Feedback Cycle That Turns AI Agents Into Reliable Workers](https://flowtivity.ai/blog/loop-engineering-the-feedback-cycle-that-makes-ai-agents-work/) | 2026-06-26 |
| 5 | AgentPatterns.ai | [Loop Engineering: Designing Agent Loops That Converge](https://www.agentpatterns.ai/loop-engineering/) | 2026-06-29 |
| 6 | Jack Njoroge | [Loop Engineering: The 2026 Guide to AI Agent Loops](https://www.jacknjoroge.com/loop-engineering/) | 2026-06-19 |
| 7 | ADTmag | [Loop Engineering Emerges as Developers Put AI Coding Agents on Repeat](https://adtmag.com/articles/2026/07/01/loop-engineering-emerges-as-developers-put-ai-coding-agents-on-repeat.aspx) | 2026-07-01 |

### 延伸阅读

- [Addy Osmani: Loop Engineering](https://addyosmani.com/blog/loop-engineering/)
- [Firecrawl: Loop Engineering — Should You Stop Prompting Agents?](https://www.firecrawl.dev/blog/loop-engineering)
- [Kilo: What Is Loop Engineering? AI Feedback Loops](https://kilo.ai/articles/what-is-loop-engineering)
- [Data Science Dojo: 10 Loop Engineering Design Patterns](https://datasciencedojo.com/blog/loop-engineering-design-patterns/)
- [Data Science Dojo: Agentic Loops — From ReAct to Loop Engineering](https://datasciencedojo.com/blog/agentic-loops-explained-from-react-to-loop-engineering-2026-guide/)
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
- [Claude Code: Agent Loop Documentation](https://code.claude.com/docs/en/agent-sdk/agent-loop)
- [Merouani et al. (PACT 2025): Agentic Auto-Scheduling](https://arxiv.org/abs/2511.00592)
- [awesome-loop-engineering (GitHub)](https://github.com/ChaoYue0307/awesome-loop-engineering)
