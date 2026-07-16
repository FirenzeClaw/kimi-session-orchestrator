# Loop Orchestrator v2 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 从 `kimi-session-orchestrator` skill 完全剥离 Loop Engineering 功能，创建独立 `loop-orchestrator` skill（9 个新文件），清理旧 skill（移除 A 选项 + 删除 7 个旧 guide-loop-*.md），更新项目文档。

**架构：** 纯 skill 层变更——新增 `skills/loop-orchestrator/` 目录含 9 个 markdown 文件，修改 `skills/kimi-session-orchestrator/SKILL.md` 移除 Loop 入口，删除旧 `guide-loop-*.md`，更新 README.md 和 AGENTS.md。无 `src/` 代码变更。

**技术栈：** Markdown（skill 文件），无代码依赖。

---

## 依赖图

```
loop-orchestrator/SKILL.md (入口)
    │
    ├── guide-loop-core.md      (SKILL 加载后 Read)
    ├── guide-loop-injection.md (阶段1 拆解时 Read)
    ├── guide-loop-memory.md    (阶段0/5 记忆操作时 Read)
    ├── guide-loop-blockage.md  (阶段3 阻塞时 Read)
    ├── guide-loop-implement.md (Q2=A 实施循环)
    ├── guide-loop-verify.md    (Q2=B 验收循环)
    ├── guide-loop-parallel.md  (Q3=B 并行策略)
    └── guide-loop-deliver.md   (阶段5 交付时 Read)

kimi-session-orchestrator/SKILL.md 编辑（独立，无依赖）

README.md / AGENTS.md 更新（独立，但应最后做以反映最终状态）

旧 guide-loop-*.md 删除（依赖：新 skill 写完后确认迁移完整）
```

---

## 任务列表

### 阶段 1：创建 loop-orchestrator skill

#### 任务 1：创建 SKILL.md（入口文件）

**文件：**
- 创建：`skills/loop-orchestrator/SKILL.md`

**描述：** 编写 skill 主入口，包含启动协议（auto/非 auto 适配、Q1-Q4 问询序列、确认概要后进入自主编排）、核心铁律（即发即返、后台轮询）、关键约束。

- [ ] **步骤 1：创建目录结构**

```bash
mkdir -p skills/loop-orchestrator
```

- [ ] **步骤 2：编写 SKILL.md**

写入以下内容（对应 spec §1 + §2）：

```markdown
---
name: loop-orchestrator
description: 当需要进行多轮次自动循环编排（实施/验收闭环），由 PM 自主拆解、派发、验证、修复、交付时使用——用户给定目标后 PM 全权统筹，里程碑汇报，不降级目标。独立 skill，不依赖 kimi-session-orchestrator。
---

# Loop Orchestrator — PM 自主循环编排

---

## ⛔ 加载即执行——启动协议

**此 skill 加载后，必须完成以下步骤再处理任何用户请求：**

### Auto 检测

| 模式 | 检测方式 | Q1-Q4 交互方式 |
|------|----------|---------------|
| Auto | 系统提示含 `Auto permission mode is active` | 纯文本提问，提示用户 `/auto` 可退出获得交互式选项 |
| 非 Auto | 无上述提示 | 使用 `AskUserQuestion` 工具，每次一个问题 |

### 第一轮：Q1 — 目标采集

若用户调用时已带目标描述（如 `/loop-orchestrator 审查 demo/ 全部模块...`）→ 跳过 Q1，直接进入 Q2。

否则 → 纯文本问询："最终目标是什么？（可含路径、模块、验收标准）"

### 第二轮：Q2 — 模式选择

- **A: 实施循环（Implement）** → Read `~/.kimi-code/skills/loop-orchestrator/guide-loop-implement.md`
- **B: 验收循环（Verify）** → Read `~/.kimi-code/skills/loop-orchestrator/guide-loop-verify.md`
- **C: 混合（Hybrid）** → 先验收现状 → 再实施缺失，先后 Read implement + verify

### 第三轮：Q3 — 并行策略

- **A: 单 session 串行** → Read `~/.kimi-code/skills/loop-orchestrator/guide-loop-core.md`
- **B: 多 session 并行** → Read `~/.kimi-code/skills/loop-orchestrator/guide-loop-parallel.md`

### 第四轮：Q4 — 验收标准

"验收标准是什么？按可验证条件逐条列出。"

- 若用户未给出 → PM 自行从项目 spec/AGENTS.md 提取 + 展示确认
- 若用户给出 → PM 逐条确认可验证性

每条标准必须独立可验。示例：`"src/types.ts 中所有类型与 spec §3.2 字段定义一致"` ✅ / `"代码没问题"` ❌

### 第五轮：确认概要 → 进入 PM 自主编排

输出确认卡片：

```
目标: <摘要>
模式: 实施/验收/混合
并行: 单/多 session
验收标准: <N 条>
```

用户确认后进入自主编排。此后 PM **自主全权**决策，里程碑自动汇报，不降级目标。

---

## ⛔ PM 硬边界

| ✅ 允许 | ❌ 禁止 |
|--------|--------|
| `create_session` / `execute_prompt` | `Edit` / `Write`（绝不碰文件） |
| `poll_session` / `list_io_records` / `read_session_log` | Bash（文件操作/构建/测试/代码执行） |
| `grade_step` / `memory_*` | 自行降级目标（绝对目标铁律） |
| `approve_tool` / `deny_tool` | |
| Bash（仅限：后台轮询 poll_command / 读日志） | |

---

## 核心铁律

> 提交 prompt 后，必须 `Bash(run_in_background=true)` 后台轮询，绝不阻塞。

| 规则 | 违反后果 |
|------|----------|
| 即发即返，不阻塞 | MCP 超时截断 |
| 后台 Bash 轮询 | 零 token 等待 |
| 一个 execute_prompt 一个目标 | 多目标合一 → 注意力腐化 |
| 跨模块必须分 session | 上下文污染 |
| session 复用优先 | grade_step / 修复同 session 继续 |

---

## 关键约束

1. 不重复 poll — 每次调用消耗 token
2. 一个后台 bash 只轮询一个 session — 多 session 用多个后台任务
3. 收到通知后再读 output.log — 不提前 TaskOutput
4. auto_mode=true 时不需要手动审批
5. create_session permission_mode="auto" 是 session 级别
6. grade_step 不每次回复调用 — 仅在关键产出/修复后/交付前使用

---

## 下一步

Q1-Q4 全部确认后进入自主编排 → 根据 Q3 选择：
  Q3=A → Read `~/.kimi-code/skills/loop-orchestrator/guide-loop-core.md`
  Q3=B → Read `~/.kimi-code/skills/loop-orchestrator/guide-loop-parallel.md`
```

- [ ] **步骤 3：语法验证**

```bash
wc -l skills/loop-orchestrator/SKILL.md
```

**验收标准：**
- [ ] 包含完整 5 轮启动协议（Q1-Q4 + 确认概要）
- [ ] 包含 Auto/非 Auto 适配表格
- [ ] 包含 PM 硬边界表格（✅/❌）
- [ ] 包含核心铁律 + 关键约束

**预估规模：** S（1 文件，约 110 行）

---

#### 任务 2：创建 guide-loop-core.md（核心执行循环）

**文件：**
- 创建：`skills/loop-orchestrator/guide-loop-core.md`

**描述：** 涵盖 spec §3 全部 6 阶段（阶段 0-5）+ grade_step 使用节奏 + PM spot-check 规则。

- [ ] **步骤 1：写入 guide-loop-core.md**

```markdown
# Loop 核心执行循环

> 加载条件：Q3 选择后 Read。定义 PM 进入自主编排后的完整 6 阶段循环。

---

## §1 阶段 0 — 记忆加载

```
memory_get("project/meta")     → 技术栈/规范/约定    <!-- ⚠️ 实际调用须用 memory_get(namespace="project/meta")，见 docs/issues/memory-call-namespace-mismatch.md -->
memory_get("project/learnings") → 过往 session 沉淀经验
```

若 project/ 命名空间为空 → 跳过，不阻塞。

---

## §2 阶段 1 — 拆解

按验收标准维度拆分工作包。判定注入粒度：

单次注入条件（全部满足）：
  ① 工作包 ≤ 3 条独立验收项
  ② 项间无先后依赖
  ③ 总指令 ≤ 500 字
  ④ 无需运行测试/构建等耗时验证

任一条不满足 → 分次注入。

拆解完成后：
```
memory_set("session/loop-<loop-id>/plan", json) ← 持久化
```
`loop-id = loop-<ISO timestamp>`。

---

## §3 阶段 2 — 执行循环

```
每个工作包：
  create_session(cwd, permission_mode="auto")
    → execute_prompt(sid, task, auto_mode=true)
    → Bash(run_in_background=true) 后台轮询
    → 拿到回复
    → PM 自主判断：需要 grade_step?
      yes(关键产出/修复后/交付前)
        → grade_step(复用同 session!)
        → pass? → memory_set("session/<sid>/findings", ...) → 下一工作包
        → fail? → execute_prompt(sid, 修复指令)
                  ≤2 retry → 3rd fail → 阶段3
      no(中间步骤/简单验证)
        → PM spot-check → 继续
```

**上下文腐化监控：**
- `list_io_records` → `totalTurns ≥ 80` → retire
- `read_session_log` → `totalLines ≥ 1500` → retire
- 产出质量下降（偏离规范/遗漏要点/幻觉）→ 立即 retire

**强制拆 session 操作序列：**
```
memory_set("session/loop-<id>/progress", ...)
memory_archive(旧sid)
create_session(from_session=旧sid, cwd=..., permission_mode="auto")
```

---

## §4 阶段 3 — 阻塞干预

触发条件：session 卡死 / 3 次 retry 失败 / loop 指纹触发。

```
诊断：read_session_log + list_io_records
决策树：
  ├─ 方向问题? → 创建诊断 session 分析根因
  ├─ 知识缺口? → 创建搜索 session 补充信息
  ├─ 思维僵局? → 调用 xmind-orchestrated
  └─ 无法解决? → 暂停向用户汇报（不降级）

诊断结果拿到后：
  上下文健康（turns < 80 且 lines < 1500）?
    → 注入原 session → 重试（重置 retry 计数）
  上下文腐化?
    → memory_set progress
    → memory_archive 归档
    → create_session(from_session=旧sid) 接班
    → 新 session 重试

诊断后重试仍 2 次失败 → 暂停向用户汇报
  汇报含：阻塞历史 + 已尝试方案 + 疑点
  不自行降级目标
```

---

## §5 阶段 4 — 里程碑汇报

每完成一个模块/工作包：

```
📦 {模块} 完成: {M} PASS / {N} FAIL → 已修复
memory_set("session/loop-<id>/milestones", ...)
```

不等待用户确认，直接进入下一工作包。

---

## §6 阶段 5 — 交付

全部验收标准通过：

```
memory_archive(session_id) → findings → learnings
最终报告（全模块 PASS/FAIL 历史 + 修复记录）
```

---

## §7 grade_step 使用节奏

| 场景 | 是否 grade_step | 原因 |
|------|:--:|------|
| task session 完成首次验收输出 | ✅ yes | 关键产出 |
| 修复后重新输出 | ✅ yes | 验证修复 |
| 最终交付前 | ✅ yes | 全量终验 |
| 中间辅助步骤（如"读取 spec"） | ❌ no | PM spot-check 即可 |
| 阻塞诊断 session 的分析结果 | ❌ no | 供 PM 决策，非交付物 |
| "已确认，开始执行" 等确认回复 | ❌ no | 无实质产出 |

## §8 PM Spot-check

即使 grade_step pass (score ≥ 70)，抽查：
- 产出中引用的文件路径是否存在
- 修复是否真的改了代码（对比修复前后）
- 是否引入了新的越权操作

---

> 完整规范见 `docs/superpowers/specs/2026-07-15-loop-orchestrator-v2-design.md`
```

**验收标准：**
- [ ] 涵盖 spec §3 全部 6 阶段
- [ ] 包含 grade_step 使用节奏表（6 种场景）
- [ ] 包含上下文腐化判定阈值（turns≥80 / lines≥1500）
- [ ] 包含阻塞干预完整决策树

**预估规模：** S（1 文件，约 150 行）

---

#### 任务 3：创建 guide-loop-injection.md（注入防腐化）

**文件：**
- 创建：`skills/loop-orchestrator/guide-loop-injection.md`

**描述：** 涵盖 spec §4——单次/分次注入判定、分次注入流程、强制拆 session 触发条件、铁律。

- [ ] **步骤 1：写入 guide-loop-injection.md**

```markdown
# 注入防腐化规则

> 加载条件：阶段 1 拆解时 Read。避免一次注入过多指令导致 task session 注意力稀释。

---

## §1 单次注入判定

```
单次注入条件（全部满足）：
  ① 工作包 ≤ 3 条独立验收项
  ② 项间无先后依赖（可并行检查）
  ③ 总指令 ≤ 500 字
  ④ 无需运行测试/构建等耗时验证

任一条不满足 → 分次注入
```

## §2 分次注入流程

```
session 1: execute_prompt(step_1) → grade → PASS
session 1（复用）: execute_prompt(step_2) → grade → PASS
...
同一 session 串行注入，完成即进下一步
```

## §3 强制拆 session 触发条件

| 触发条件 | 操作 |
|----------|------|
| 累计注入 > 5 条独立指令 | `memory_set` 记录进度 → `memory_archive` 归档 → `create_session(from_session=旧sid)` 接班 |
| 上下文腐化信号 | `list_io_records` → `totalTurns ≥ 80` 或 `read_session_log` → `totalLines ≥ 1500` → retire |
| 产出质量下降（偏离规范/遗漏要点/幻觉） | 立即 retire |
| 跨模块切换 | 必须新 session |

## §4 铁律

| 规则 | 原因 |
|------|------|
| 一个 execute_prompt 一个目标 | 多目标合一 → 注意力稀释 |
| 验收标准一次给完，修复一条一条来 | 验收需全局视角，修复需聚焦 |
| 跨模块必须分 session | 不同模块上下文互不相关 |
| session 复用优先 | grade_step / 修复指令同 session 继续 |

---

> 完整规范见 spec §4
```

**验收标准：**
- [ ] 包含单次注入 4 条件
- [ ] 包含分次注入流程图
- [ ] 包含强制拆 session 4 种触发条件 + 操作序列
- [ ] 包含 4 条铁律

**预估规模：** XS（1 文件，约 60 行）

---

#### 任务 4：创建 guide-loop-blockage.md（阻塞干预）

**文件：**
- 创建：`skills/loop-orchestrator/guide-loop-blockage.md`

**描述：** 涵盖 spec §3 阶段 3 的详细决策树——如何识别阻塞类型、诊断会话创建规范、上下文健康判定、重试与升级策略。

- [ ] **步骤 1：写入 guide-loop-blockage.md**

```markdown
# 阻塞干预决策树

> 加载条件：阶段 3 阻塞发生时 Read。

---

## §1 阻塞识别

| 信号 | 检测方式 |
|------|----------|
| session 卡死 | `poll_session` 返回 `idle` 持续 > 60s 且无产出 |
| 3 次 retry 失败 | PM 内部计数（同 step 连续 3 次 grade_step fail） |
| loop 指纹触发 | `list_io_records` 发现同一 tool 模式连续 ≥ 3 次 |

## §2 诊断步骤

```
read_session_log(sid) + list_io_records(sid) → 分析阻塞根因
```

## §3 决策树

| 根因 | 动作 | session 创建参数 |
|------|------|-----------------|
| 方向问题（理解偏差/误读需求） | 创建诊断 session | `cwd=同项目`, `memory_level=off`, prompt="分析以下 session 的产出，判断是否偏离目标..." |
| 知识缺口（缺少文档/API 信息） | 创建搜索 session | `cwd=同项目`, `memory_level=off`, prompt="搜索以下问题的答案..." |
| 思维僵局（同一模式反复失败） | 调用 `xmind-orchestrated` | 通过 skill 机制激活，非 MCP 工具 |
| 工具/环境问题（依赖缺失/权限） | 暂停汇报 | 向用户汇报具体缺失项 |

## §4 诊断后分流

```
诊断 session 结果拿到 →
  原 session 健康（turns < 80 且 lines < 1500）?
    → execute_prompt(sid, "根据以下诊断调整方向: <诊断结果>")
    → 重置 retry 计数 → 重试
  原 session 腐化?
    → memory_set("session/loop-<id>/progress", ...)
    → memory_archive(旧sid)
    → create_session(from_session=旧sid, cwd=同上)
    → execute_prompt(新sid, "接续上一个 session 的进度，根据诊断调整: <诊断结果>")
```

## §5 升级条件

诊断后重试仍 2 次失败 → 暂停向用户汇报：

```
阻塞汇报格式:
  阻塞历史: <时间线：最初失败 → 诊断 → 重试 → 仍然失败>
  已尝试方案: <1. 原始修复 2. 诊断调整 3. 新 session 接续>
  疑点: <PM 判断的最可能根因>
  建议: <需要用户决策的方向>

不自行降级目标——等待用户给出新方向或确认放弃。
```

---

> 完整规范见 spec §3 阶段 3
```

**验收标准：**
- [ ] 包含 3 种阻塞信号检测方式
- [ ] 包含完整决策树（4 种根因 + 对应动作）
- [ ] 包含上下文健康判定分流
- [ ] 包含升级汇报格式

**预估规模：** S（1 文件，约 80 行）

---

#### 任务 5：创建 guide-loop-memory.md（Memory 集成）

**文件：**
- 创建：`skills/loop-orchestrator/guide-loop-memory.md`

**描述：** 涵盖 spec §6 全部 6 个阶段的 memory 操作映射 + 命名空间约定。

- [ ] **步骤 1：写入 guide-loop-memory.md**

```markdown
# Memory 集成规范

> 加载条件：阶段 0 和阶段 5 时 Read。Loop 全程读写的 memory 操作映射。

---

## §1 各阶段 Memory 操作

<!-- ⚠️ v2.12.1 修正：下表为设计草案伪代码，实际调用须使用命名参数，memory_set 须拆分 key 为独立参数。详见 docs/issues/memory-call-namespace-mismatch.md -->

| 阶段 | 操作 | 内容 |
|------|------|------|
| 0 启动 | `memory_get("project/meta")` | 项目技术栈/规范/约定 |
| 0 启动 | `memory_get("project/learnings")` | 过往 session 沉淀经验 |
| 1 拆解 | `memory_set("session/loop-<id>/plan", json)` | 工作包拆解方案 |
| 2 每轮完成 | `memory_set("session/<sid>/findings")` | 关键发现/FAIL 项/修复记录 |
| 3 阻塞 | `memory_set("session/loop-<id>/blockages")` | 阻塞原因+诊断结果 |
| 4 里程碑 | `memory_set("session/loop-<id>/milestones")` | 完成模块+PASS/FAIL 统计 |
| 5 交付 | `memory_archive(session_id)` | L2 findings → L1 learnings |

## §2 命名空间约定

- `loop-id = loop-<ISO timestamp>`（如 `loop-2026-07-15T120000Z`）
- Loop 级数据写入 `session/loop-<loop-id>/` 前缀
- Task session 级数据写入 `session/<sid>/findings`
- 知识库级数据读写 `project/meta`、`project/learnings`

## §3 注意事项

- `memory_set` 仅接受 `project/` 或 `session/` 前缀（代码限制）
- `memory_get` 无 namespace 限制
- 写入 `session/<sid>/findings` 后，交付时通过 `memory_archive(sid)` 自动提升为 `project/learnings`
```

**验收标准：**
- [ ] 包含全部 7 个阶段操作映射
- [ ] 包含命名空间约定（loop-id 格式）
- [ ] 包含 `memory_set` namespace 限制说明

**预估规模：** XS（1 文件，约 50 行）

---

#### 任务 6：创建 guide-loop-implement.md（实施循环）

**文件：**
- 创建：`skills/loop-orchestrator/guide-loop-implement.md`

**描述：** 实施循环专项——逐步构建，每步 grade，pass 则推进。最多 2 次 retry。

- [ ] **步骤 1：写入 guide-loop-implement.md**

```markdown
# 实施循环 — 操作指南

> 加载触发：Q2=I（实施循环）。从零构建，逐步产出，每步验证。

---

## §1 模式

```
create_session → step_1 → grade_step → pass? → step_2 → ... → deliver
                                 └→ fail → fix → grade_step ↻ (≤2 retry)
```

## §2 流程

```
create_session(cwd, permission_mode="auto")
  → execute_prompt(sid, step_1, auto_mode=true)
  → Bash(run_in_background=true) 后台轮询 → done
  → PM grade_step
    pass → execute_prompt(sid, step_2) ...
    fail → execute_prompt(sid, 修复指令) → grade_step
            ≤ 2 retry → 3rd fail → 阻塞干预
```

## §3 约束

| 约束 | 说明 |
|------|------|
| 不可跳步 | 严格按序 |
| 失败先本 session 重试 | 不立即新建 |
| 每步单指令 | 一个 execute_prompt 只含一步 |
| 最多 2 次 retry | 同一 step |

## §4 上下文窗口预警

| 信号 | 决策 |
|------|------|
| turns ≥ 80 或 lines ≥ 1500 | 评估退役 |
| > 5 个连续步骤 | 考虑中途退役接班 |
| 产出质量下降 | 立即退役 |

退役操作：`memory_set` 进度 → `memory_archive` → `create_session(from_session=旧sid)` 接班。

---

> 详细规范见 guide-loop-core.md + guide-loop-injection.md
```

**验收标准：**
- [ ] 包含实施循环流程图
- [ ] 包含 4 条约束
- [ ] 包含上下文窗口预警表

**预估规模：** XS（1 文件，约 50 行）

---

#### 任务 7：创建 guide-loop-verify.md（验收循环）

**文件：**
- 创建：`skills/loop-orchestrator/guide-loop-verify.md`

**描述：** 验收循环专项——对照标准逐项检查，FAIL 修复后重验，全 PASS 放行。

- [ ] **步骤 1：写入 guide-loop-verify.md**

```markdown
# 验收循环 — 操作指南

> 加载触发：Q2=V（验收循环）。逐项检查已有产出，修复不合格项，重验放行。

---

## §1 模式

```
existing output → grade_step 逐项评分 → fail 项 → fix → re-verify → 全 PASS → done
```

## §2 流程

```
execute_prompt(sid, "逐条验证以下标准，PASS 标记 ✅，FAIL 附文件:行号+证据:
  #1 <标准> — 检查 <方法>
  #2 ...")
  → Bash 后台轮询 → 拿到回复
  → PM 解析: PASS/FAIL 逐条判定
  → 若有 FAIL:
      execute_prompt(sid, "标准 #N 未通过: <证据>。修复后重新验证。")
      → 后台轮询 → grade_step 重验
  → 全 PASS → 下一工作包
```

## §3 判定铁律

| 规则 | 说明 |
|------|------|
| 严格通过 | 不明确通过 = FAIL |
| 逐条独立 | 不因其他项 PASS 而放水 |
| 单 session ≤ 5 验收项 | 超限 → 拆分 |
| 证据必附 | 每个 FAIL 必须附文件路径+行号+代码片段 |

## §4 产出格式

```
❌ FAIL #1: <标准>
   文件: path/to/file.ts:42
   证据: <当前 vs 预期>
   严重度: critical / major / minor

✅ PASS: 标准 #3, #4
```

---

> 详细规范见 guide-loop-core.md + guide-loop-injection.md
```

**验收标准：**
- [ ] 包含验收循环流程图
- [ ] 包含 4 条判定铁律
- [ ] 包含 FAIL 产出格式

**预估规模：** XS（1 文件，约 50 行）

---

#### 任务 8：创建 guide-loop-parallel.md + guide-loop-deliver.md

**文件：**
- 创建：`skills/loop-orchestrator/guide-loop-parallel.md`
- 创建：`skills/loop-orchestrator/guide-loop-deliver.md`

**描述：** 多 session 并行专项 + 交付归档专项。

- [ ] **步骤 1：写入 guide-loop-parallel.md**

```markdown
# 多 Session 并行

> 加载触发：Q3=P（并行策略）。多 session 同时推进独立模块。

---

## §1 适用条件

- 工作包之间无文件依赖
- 每个工作包 ≤ 5 条验收项
- 最多 5 个并行 session

## §2 派发

```
create_session × N（每模块独立 session）
  → execute_prompt × N（独立 criteria）
  → Bash(run_in_background=true) × N（并行后台轮询）
  → 先完成先审查，不必等全部
```

## §3 约束

| 规则 | 原因 |
|------|------|
| 同文件 ≤ 3 session 覆盖 | 冗余 + 矛盾概率激增 |
| 独立模块必须分 session | 上下文隔离 |
| 全部完成后交叉对比 | 检测矛盾结论 |
```

- [ ] **步骤 2：写入 guide-loop-deliver.md**

```markdown
# 交付与归档

> 加载触发：阶段 5 交付时 Read。

---

## §1 交付条件

全部验收标准 grade_step PASS。若仍有 FAIL → 回到阶段 2 继续修复。

## §2 归档

```
memory_archive(session_id)
  → session/<sid>/findings → project/learnings
```

## §3 最终报告

```
模块汇总:
  ✅ user-service.ts: 5/5 PASS
  ✅ calculator.ts: 5/5 PASS (含 1 修复)

修复历史:
  getAdultUsers: 未过滤 inactive → 已修复
  deleteUser: 缺参数校验 → 已修复
  updateUser: 缺 email 唯一性 + age 校验 → 已修复

记忆沉淀: 3 条 findings → project/learnings
```
```

**验收标准：**
- [ ] parallel.md 包含派发流程 + 约束
- [ ] deliver.md 包含交付条件 + 归档操作 + 报告模板

**预估规模：** XS（2 文件，各约 30 行）

---

### 检查点：新 skill 文件完整

- [ ] 9 个文件全部创建于 `skills/loop-orchestrator/`
  ```bash
  ls skills/loop-orchestrator/ | wc -l  # 预期: 9
  ls skills/loop-orchestrator/SKILL.md skills/loop-orchestrator/guide-loop-*.md
  ```
- [ ] SKILL.md 可独立激活（含完整启动协议）
  ```bash
  grep -c "Q1\|Q2\|Q3\|Q4\|硬边界\|核心铁律" skills/loop-orchestrator/SKILL.md
  ```
- [ ] 每个 guide 覆盖对应 spec 章节
  ```bash
  for f in skills/loop-orchestrator/guide-loop-*.md; do echo "$f: $(wc -l < $f) lines"; done
  ```
- [ ] 所有 guide 之间的 Read 引用一致
  ```bash
  grep -r "Read.*guide-loop" skills/loop-orchestrator/SKILL.md
  ```

---

### 阶段 2：清理旧 skill

#### 任务 9：修改 kimi-session-orchestrator SKILL.md

**文件：**
- 修改：`skills/kimi-session-orchestrator/SKILL.md`

**描述：** Q1 移除 A（Loop Engineering）选项，更新角色描述。

- [ ] **步骤 1：定位 Q1 选项列表并移除 A**

当前内容（约第 28-33 行）：
```markdown
- **A: PM 统筹 — Loop Engineering 编排** → 回答后 Read `~/.agents/skills/kimi-session-orchestrator/guide-loop-entry.md`
- **B: PM 统筹 — 规划派发与验收** → 回答后 Read `~/.agents/skills/kimi-session-orchestrator/guide-planning.md`
- **C: PM 统筹 — 长轮次编排验收修复** → 回答后 Read `~/.agents/skills/kimi-session-orchestrator/guide-orchestration.md`
- **D: 执行者** → 回答后 Read `~/.agents/skills/kimi-session-orchestrator/guide-execute.md`
```

修改为：
```markdown
- **A: PM 统筹 — 规划派发与验收** → 回答后 Read `~/.agents/skills/kimi-session-orchestrator/guide-planning.md`
- **B: PM 统筹 — 长轮次编排验收修复** → 回答后 Read `~/.agents/skills/kimi-session-orchestrator/guide-orchestration.md`
- **C: 执行者** → 回答后 Read `~/.agents/skills/kimi-session-orchestrator/guide-execute.md`
```

- [ ] **步骤 2：移除 Loop 子问题章节**

定位 `### Loop 子问题（仅 Q1=A 时）` 整个 section（约第 44-55 行），删除。

- [ ] **步骤 3：更新运行模式设定**

移除 "Loop+任意" 行，A/B/C 字母对应关系调整。

- [ ] **步骤 4：检查其余引用**

```bash
grep -n "Loop\|loop\|guide-loop" skills/kimi-session-orchestrator/SKILL.md
```

确保无残留 Loop 引用。

**验收标准：**
- [ ] Q1 从 A/B/C/D 变为 A/B/C（移除 Loop）
- [ ] Loop 子问题章节已删除
- [ ] 运行模式设定无 Loop 残留
- [ ] 其余 PM/执行者功能完全不变

**预估规模：** XS（1 文件，3 处修改）

---

#### 任务 10：删除旧 guide-loop-*.md

**文件：**
- 删除：`skills/kimi-session-orchestrator/` 下全部 7 个 guide-loop-*.md 文件

- [ ] **步骤 1：确认文件列表**

```bash
ls skills/kimi-session-orchestrator/guide-loop-*.md
```

预期：`guide-loop-entry.md`, `guide-loop-implement.md`, `guide-loop-implement-single.md`, `guide-loop-implement-parallel.md`, `guide-loop-verify.md`, `guide-loop-verify-single.md`, `guide-loop-verify-parallel.md` 共 7 个。确认无遗漏。

- [ ] **步骤 2：删除**

```bash
rm skills/kimi-session-orchestrator/guide-loop-*.md
```

**验收标准：**
- [ ] 7 个旧 guide-loop-*.md 已删除
- [ ] `skills/kimi-session-orchestrator/` 下仅保留非 Loop 相关文件

**预估规模：** XS（7 文件删除，1 条命令）

---

### 检查点：旧 skill 清理完毕

- [ ] kimi-session-orchestrator 不再含任何 Loop 入口
  ```bash
  grep -n "Loop\|loop\|guide-loop" skills/kimi-session-orchestrator/SKILL.md  # 预期: 空
  ```
- [ ] 旧 guide-loop-*.md 全部移除
  ```bash
  ls skills/kimi-session-orchestrator/guide-loop-*.md 2>&1  # 预期: No such file
  ```
- [ ] 其余功能（规划派发/长轮次编排/执行者）完整保留
  ```bash
  grep -c "规划派发\|长轮次编排\|执行者" skills/kimi-session-orchestrator/SKILL.md
  ```

---

### 阶段 3：文档更新

#### 任务 11：更新 README.md

**文件：**
- 修改：`README.md`

**描述：** 更新 skill 列表（6→7 个）、Loop Engineering 章节、安装指令追加 loop-orchestrator。

- [ ] **步骤 1：更新 Skill 列表章节**

在 README.md 的 Skill 列表中，追加 `loop-orchestrator` 行：

```markdown
| `loop-orchestrator` | PM | Loop Engineering 自主编排——独立 skill。用户给定目标后 PM 全权拆解→派发→验证→修复→交付，里程碑汇报，不降级目标 |
```

- [ ] **步骤 2：更新使用场景表**

追加 Loop 相关场景入口。

- [ ] **步骤 3：更新安装指令**

在 Skill 安装脚本中追加：

```bash
# PM 级 skill — 安装到 ~/.kimi-code/skills/
rm -rf ~/.kimi-code/skills/loop-orchestrator
cp -r skills/loop-orchestrator ~/.kimi-code/skills/loop-orchestrator
```

- [ ] **步骤 4：更新 Skill 数量**

Badge 行 `skill 数量` 从 6→7。

- [ ] **步骤 5：更新 Loop Engineering 章节**

`## Loop Engineering（v2.9）` 章节改为指向新独立 skill：

```markdown
## Loop Engineering（v2.11+）

已独立为 `loop-orchestrator` skill。用户 `/loop-orchestrator` 直接激活，不再从 `kimi-session-orchestrator` Q1 分叉。

详细设计见 `docs/superpowers/specs/2026-07-15-loop-orchestrator-v2-design.md`。
```

**验收标准：**
- [ ] Skill 列表含 7 个 skill（含 loop-orchestrator）
- [ ] 安装指令含 loop-orchestrator 拷贝
- [ ] Loop Engineering 章节指向新 skill
- [ ] Badge 数量更新

**预估规模：** S（1 文件，约 5 处修改）

---

#### 任务 12：更新 AGENTS.md

**文件：**
- 修改：`AGENTS.md`

**描述：** Skill 列表追加 `loop-orchestrator`，更新 `kimi-session-orchestrator` 描述移除 Loop 入口。

- [ ] **步骤 1：定位 Skill 列表**

在 AGENTS.md 中找到 "## Agent Skills" 下的表格。

- [ ] **步骤 2：追加 loop-orchestrator 行**

```markdown
| `loop-orchestrator` | PM | Loop Engineering 自主编排——独立 skill。用户给定目标后 PM 全权统筹循环。`/loop-orchestrator` 激活 | `skills/loop-orchestrator/SKILL.md` | `~/.kimi-code/skills/` |
```

- [ ] **步骤 3：更新 kimi-session-orchestrator 描述**

移除 "含完整 6 阶段开发管线" 中与 Loop 相关的描述，聚焦 PM 规划派发/长轮次编排/执行者功能。

- [ ] **步骤 4：更新安装脚本**

在 AGENTS.md 的安装指令中追加 loop-orchestrator 相关行。

**验收标准：**
- [ ] Skill 表格含 loop-orchestrator
- [ ] kimi-session-orchestrator 描述不含 Loop 入口
- [ ] 安装指令完整

**预估规模：** XS（1 文件，3 处修改）

---

### 检查点：文档完整

- [ ] README.md 反映独立 skill 结构
  ```bash
  grep -c "loop-orchestrator" README.md  # 预期: ≥ 3
  ```
- [ ] AGENTS.md Skill 列表和安装指令最新
  ```bash
  grep -c "loop-orchestrator" AGENTS.md  # 预期: ≥ 2
  ```
- [ ] 用户可按文档完成全新安装
  ```bash
  grep -A2 "loop-orchestrator" README.md | grep "cp -r"
  ```

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 旧 guide-loop-*.md 内容在新 skill guide 中有遗漏 | 功能退化 | 任务 2-8 逐条对照 spec 编写，任务 10 前先验证新 skill 完整性 |
| kimi-session-orchestrator SKILL.md 还有隐藏的 Loop 引用 | 残留引用指向已删除文件 | 任务 9 步骤 4 grep 全量扫描 |
| 用户文件夹旧的 loop-orchestrator skill 与新版本冲突 | 安装后行为不一致 | README 安装指令用 `rm -rf` 先清理再拷贝 |
| README.md 的 6→7 skill 数量变更和其他 badge 不一致 | 文档矛盾 | 任务 11 步骤 4 精确更新 badge |

## 待定问题

无。所有设计决策已在 spec 中解决。

---

## 任务规模摘要

| 任务 | 文件数 | 规模 |
|------|:--:|:--:|
| 1. SKILL.md | 1 | S |
| 2. guide-loop-core.md | 1 | S |
| 3. guide-loop-injection.md | 1 | XS |
| 4. guide-loop-blockage.md | 1 | S |
| 5. guide-loop-memory.md | 1 | XS |
| 6. guide-loop-implement.md | 1 | XS |
| 7. guide-loop-verify.md | 1 | XS |
| 8. parallel + deliver | 2 | XS |
| 9. 修改 kimi-session-orchestrator SKILL.md | 1 | XS |
| 10. 删除旧 guide-loop-*.md | 7 | XS |
| 11. 更新 README.md | 1 | S |
| 12. 更新 AGENTS.md | 1 | XS |
