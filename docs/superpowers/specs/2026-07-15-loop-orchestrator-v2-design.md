# Loop Orchestrator v2 — 独立 PM 循环编排 Skill

> 设计日期：2026-07-15 | 状态：设计阶段 | 基于 brainstorming 流程输出

## 动机

当前 `kimi-session-orchestrator` skill 的 Loop Engineering 模式存在 5 个结构性缺陷：

1. **PM 越界执行**：PM 直接 `Edit`/`Write` 操作文件，而非委派 task session
2. **"关键点"定义模糊**：PM 逢节点就停，缺乏自主串联全流程的能力
3. **注入腐化**：验收标准 + 修复指令一次注入过多，task session 注意力稀释
4. **Memory 系统完全缺席**：8 份 guide 0 处提及存储/读取/归档
5. **grade_step 无节奏**：每次回复后机械调用，而非 PM 自主判断时机

**根本原因**：Loop 功能混在主 skill 内，与"PM 规划派发"等非 Loop 模式共享入口和上下文，导致指导不够聚焦。

## 方案决策

选择 **方案 2：Loop 独立为 `loop-orchestrator` skill**，从 `kimi-session-orchestrator` 完全剥离。

- 零耦合：用户 `/loop-orchestrator` 直接激活，不走主 skill Q1 分叉
- 独立上下文：进入 loop = 加载专用 guide，不污染非 loop 模式
- 主 skill Q1 移除 A（Loop Engineering）选项

## §1 架构边界

```
┌──────────────────────────────────────────────┐
│ kimi-session-orchestrator skill              │
│ Q1: A=PM规划派发 / B=长轮次编排 / C=执行者    │
│ （不再含 Loop 选项）                          │
└──────────────────────────────────────────────┘
                      │ 用户显式调用 /loop-orchestrator
                      ▼
┌──────────────────────────────────────────────┐
│ loop-orchestrator skill（全新独立）            │
│                                               │
│ 加载 → Q1→Q2→Q3→Q4→确认 → PM Loop 自主编排    │
│                                               │
│ 硬边界：仅操作 MCP 工具 + 编排必需的 Bash          │
│   ✅ create_session / execute_prompt           │
│   ✅ poll_session / list_io_records            │
│   ✅ read_session_log                          │
│   ✅ grade_step / memory_*                     │
│   ✅ approve_tool / deny_tool                  │
│   ✅ Bash（仅限：后台轮询 poll_command / 读日志）   │
│   ❌ Edit / Write（绝不碰文件）                   │
│   ❌ Bash（禁止：文件操作 / 构建 / 测试 / 代码执行） │
│                                               │
│ 自主权：                                       │
│   ✅ 自主拆解 → 派发 → grade → 修复循环          │
│   ✅ 自主决定注入粒度（单次/分次）                │
│   ✅ 自主决定 grade_step 时机                   │
│   ✅ 阻塞时自主诊断 / 搜索 / xmind-orchestrated  │
│   ✅ 里程碑自动汇报（不等确认）                   │
│   ❌ 不降级目标（绝对目标，多轮循环直至达成）       │
└──────────────────────────────────────────────┘
```

## §2 启动协议

独立 skill 加载即执行，无预读其他文件。

### Auto / 非 Auto 模式适配

| 模式 | 检测方式 | Q1-Q4 交互方式 |
|------|----------|---------------|
| Auto | 系统提示含 `Auto permission mode is active` | 纯文本提问，提示用户 `/auto` 可退出获得交互式选项 |
| 非 Auto | 无上述提示 | 使用 `AskUserQuestion` 工具，每次一个问题 |

```
用户: /loop-orchestrator [目标描述，可选]

Skill 加载:
  ① Q1 — 目标采集
     若用户调用时已带目标 → 跳过，直接进入 Q2
     否则 → 纯文本问询："最终目标是什么？"

  ② Q2 — 模式选择
     A: 实施循环（从零构建，逐步产出）
     B: 验收循环（已有产出，逐项检查修复）
     C: 混合（先验收现状 → 再实施缺失）

  ③ Q3 — 并行策略
     A: 单 session 串行（≤5 验收项 / 步骤依赖链强）
     B: 多 session 并行（独立模块，同时推进）

  ④ Q4 — 验收标准
     "验收标准是什么？按可验证条件逐条列出。"
     若用户未给出 → PM 自行从项目 spec/AGENTS.md 提取 + 展示确认
     若用户给出 → PM 逐条确认可验证性

  ⑤ 确认概要 → 进入 PM 自主编排
     输出: 目标摘要 + 模式 + 并行策略 + 验收标准 N 条
     → 用户确认后进入自主编排
     → 里程碑汇报，不降级目标
```

### Q4 验收标准编写规范

每条标准必须**独立可验**——不需要额外上下文即可判断通过/失败。

| ❌ 差 | ✅ 好 |
|------|------|
| "代码没问题" | "src/types.ts 中所有类型与 spec §3.2 字段定义一致" |
| "功能正确" | "POST /api/submit 返回 201，body 符合 contract schema" |
| "文档完整" | "AGENTS.md 存在修改记录条目，含日期+作者+变更摘要" |

## §3 核心执行循环

```
┌──────────────────────────────────────────────────────────┐
│ 阶段 0 — 记忆加载                                         │
│   memory_get("project/meta")     → 技术栈/规范/约定        │   <!-- ⚠️ v2.12.1 修正：此格式为设计草案伪代码，实际调用须使用命名参数 memory_get(namespace="project/meta")，见 docs/issues/memory-call-namespace-mismatch.md -->
│   memory_get("project/learnings") → 过往沉淀经验           │
├──────────────────────────────────────────────────────────┤
│ 阶段 1 — 拆解                                             │
│   按验收标准维度拆分工作包                                  │
│   判定注入粒度：单次注入 vs 分次注入（按 §4 规则）            │
│   memory_set("session/loop-<id>/plan", json) ← 持久化拆解方案 │
├──────────────────────────────────────────────────────────┤
│ 阶段 2 — 执行循环（每个工作包）                             │
│   ┌─────────────────────────────────────┐                 │
│   │ create_session → execute_prompt     │                 │
│   │   → Bash 后台轮询 → 拿到回复        │                 │
│   │   → PM 自主判断：需要 grade_step?   │                 │
│   │     yes(关键产出/修复后/交付前)      │                 │
│   │       → grade_step(复用同 session!)  │                 │
│   │     no(中间步骤/简单验证)            │                 │
│   │       → PM spot-check → 继续        │                 │
│   │   → ALL PASS?                       │                 │
│   │     yes → memory_set findings       │                 │
│   │     no  → execute_prompt(修复)      │                 │
│   │           同 session, ≤2 retry      │                 │
│   │           3rd fail → 进入阶段 3     │                 │
│   └─────────────────────────────────────┘                 │
├──────────────────────────────────────────────────────────┤
│ 阶段 3 — 阻塞干预                                          │
│   session 卡死 / 3 次 retry 失败 / loop 指纹触发            │
│     → PM 诊断：read_session_log + list_io_records         │
│     → 决策树：                                             │
│       ├─ 方向问题? → 创建诊断 session 分析根因              │
│       ├─ 知识缺口? → 创建搜索 session 补充信息              │
│       ├─ 思维僵局? → 调用 xmind-orchestrated              │
│       └─ 无法解决? → 暂停向用户汇报（不降级目标）            │
│     → 诊断/搜索/xmind 结果拿到后：                          │
│       ├─ 原 session 上下文健康?                               │
│       │   判定：list_io_records(totalTurns) +                  │
│       │         read_session_log(totalLines) →                │
│       │         turns < 80 且 lines < 1500 → 健康             │
│       │   → 注入原 session → 重试（重置 retry 计数）           │
│       └─ 原 session 上下文腐化?                                │
│           → memory_set("session/loop-<id>/progress") 当前进度  │
│           → memory_archive(旧sid) 归档 findings                │
│           → create_session(from_session=旧sid) 接班           │
│           → 新 session 重试                                   │
│     → 诊断后重试仍 2 次失败 → 暂停向用户汇报                 │
│       （汇报含：阻塞历史 + 已尝试方案 + 疑点，不自行降级）     │
├──────────────────────────────────────────────────────────┤
│ 阶段 4 — 里程碑汇报                                        │
│   每完成一个模块/工作包 → 输出摘要：                         │
│     📦 {模块} 完成: {M} PASS / {N} FAIL → 已修复            │
│   memory_set("session/loop-<id>/milestones", ...)           │
│   不等待用户确认，直接进入下一工作包                          │
├──────────────────────────────────────────────────────────┤
│ 阶段 5 — 交付                                              │
│   全部验收标准通过                                          │
│     memory_archive(session_id) → L2 findings → L1 learnings│
│     最终报告（全模块 PASS/FAIL 历史 + 修复记录）             │
│     记忆沉淀供下个 loop 复用                                │
└──────────────────────────────────────────────────────────┘
```

### grade_step 使用节奏

| 场景 | 是否 grade_step | 原因 |
|------|:--:|------|
| task session 完成首次验收输出 | ✅ yes | 关键产出，需形式化评分 |
| 修复后重新输出 | ✅ yes | 验证修复质量 |
| 最终交付前 | ✅ yes | 全量终验 |
| 中间辅助步骤（如"读取 spec 确认字段定义"） | ❌ no | 简单验证，PM spot-check 即可 |
| 阻塞诊断 session 的分析结果 | ❌ no | 诊断结果供 PM 决策，非交付物 |
| content="已确认，开始执行" 等确认性回复 | ❌ no | 无实质产出 |

### PM Spot-check 规则

即使 grade_step pass (score ≥ 70)，PM 仍需抽查：
- 产出中引用的文件路径是否存在
- 修复是否真的改了代码（对比修复前后）
- 是否引入了新的越权操作

## §4 注入防腐化规则

### 单次注入判定

```
单次注入条件（全部满足）：
  ① 工作包 ≤ 3 条独立验收项
  ② 项间无先后依赖（可并行检查）
  ③ 总指令 ≤ 500 字
  ④ 无需运行测试/构建等耗时验证

任一条不满足 → 分次注入
```

### 分次注入流程

```
session 1: execute_prompt(step_1) → grade → PASS
session 1（复用）: execute_prompt(step_2) → grade → PASS
...
同一 session 串行注入，完成即进下一步
```

### 强制拆 session 触发条件

| 触发条件 | 操作 |
|----------|------|
| 累计注入 > 5 条独立指令 | `memory_set` 记录进度 → `memory_archive` 归档旧 session → `create_session(from_session=旧sid)` 接班 |
| 上下文腐化信号 | `list_io_records` → `totalTurns ≥ 80` 或 `read_session_log` → `totalLines ≥ 1500` → retire |
| 产出质量下降（偏离规范/遗漏要点/幻觉） | 立即 retire |
| 跨模块切换 | 必须新 session |

### 铁律

| 规则 | 原因 |
|------|------|
| 一个 execute_prompt 一个目标 | 多目标合一 → 注意力稀释 |
| 验收标准一次给完，修复一条一条来 | 验收需全局视角，修复需聚焦 |
| 跨模块必须分 session | 不同模块上下文互不相关 |
| session 复用优先 | grade_step / 修复指令同 session 继续 |

## §5 文件结构

```
skills/loop-orchestrator/
├── SKILL.md                      # 入口：加载即执行启动协议（§2）
├── guide-loop-core.md            # 核心执行循环（§3）+ PM 硬边界
├── guide-loop-injection.md       # 注入防腐化规则（§4）
├── guide-loop-blockage.md        # 阻塞干预决策树
├── guide-loop-memory.md          # Memory 集成规范
├── guide-loop-implement.md       # 实施循环专项
├── guide-loop-verify.md          # 验收循环专项
├── guide-loop-parallel.md        # 多 session 并行专项
└── guide-loop-deliver.md         # 交付与归档专项
```

## §6 Memory 集成点

<!-- ⚠️ v2.12.1 修正：下表中 memory_get/set 为设计草案伪代码。实际调用须使用命名参数：
  memory_get → memory_get(namespace="project/meta")
  memory_set → memory_set(namespace="session/loop-<id>", key="plan", value="<JSON>")
  详见 docs/issues/memory-call-namespace-mismatch.md -->

| 阶段 | memory 操作 | 内容 |
|------|------------|------|
| 0 启动 | `memory_get("project/meta")` | 项目技术栈/规范/约定 |
| 0 启动 | `memory_get("project/learnings")` | 过往 session 沉淀经验 |
| 1 拆解 | `memory_set("session/loop-<id>/plan")` | 工作包拆解方案 JSON |
| 2 每轮完成 | `memory_set("session/<sid>/findings")` | 关键发现/FAIL 项/修复记录 |
| 3 阻塞 | `memory_set("session/loop-<id>/blockages")` | 阻塞原因 + 诊断结果 |
| 4 里程碑 | `memory_set("session/loop-<id>/milestones")` | 完成模块 + PASS/FAIL 统计 |
| 5 交付 | `memory_archive(session_id)` | L2 findings → L1 learnings |

**命名空间约定**：`session/loop-<loop-id>/`，`loop-id = loop-<ISO timestamp>`。所有 loop 级数据写入 `session/` 前缀以兼容 `memory_set` 命名空间校验。

## §7 与现有系统的关系

| 现有组件 | 关系 |
|----------|------|
| `kimi-session-orchestrator` skill | Q1 移除 A 选项，Loop 入口删除。其余 PM/执行者功能不变 |
| `workflow-engine` | Loop 不依赖 — 独立 skill 直接驱动 MCP 工具。远期可选模板化 |
| `session-retire` skill | Loop 在强制拆 session 时按 retire pipeline 的 5 阶段操作：Phase 0（初始化检查）→ Phase 1（提取上下文：`list_io_records` + `read_session_log` + `memory_get`）→ Phase 2（`memory_archive` + `memory_set` handoff）→ Phase 3（构建 7-block 模板）→ Phase 4（`create_session(from_session=旧sid)` + `execute_prompt` 自举）。不直接"调用" skill，而是执行其定义的操作序列 |
| `xmind-orchestrated` skill | Loop 在思维僵局阻塞时调用 |
| `memory-store` / 6 个 memory_* 工具 | Loop 全程读写，是 memory 系统的主要消费者 |
| 29 个 MCP 工具 | Loop 仅使用子集（见 §1 硬边界），不引入新工具 |

## §8 变更范围

| 类型 | 文件 | 操作 |
|------|------|------|
| 新增 | `skills/loop-orchestrator/` (9 文件) | 创建完整 skill |
| 修改 | `skills/kimi-session-orchestrator/SKILL.md` | Q1 移除 A 选项 |
| 修改 | `skills/kimi-session-orchestrator/guide-loop-*.md` (8 文件) | 删除或迁移至新 skill |
| 修改 | `README.md` | 更新 skill 列表、Loop Engineering 章节、安装指令追加 loop-orchestrator |
| 修改 | `AGENTS.md` | Skill 列表追加 `loop-orchestrator`、更新 `kimi-session-orchestrator` 描述（移除 Loop 入口） |
| 不涉及 | 所有 `src/` 代码 | 纯 skill 层变更，无 MCP 工具改动 |
