# Loop Engineering Guide 分层设计

<!--
创建日期: 2026-07-15 | kimi-code (design) | brainstorming → 设计确认
状态: 用户已确认，待审查后进入 writing-plans
-->

## 1. 目标

将 Loop Engineering 概念融入现有 `kimi-session-orchestrator` skill 的 guide-driven 体系，利用已有的 wireClient + workflow-engine 基础设施，以最小改动量实现 L2 验证闭环的 PM 可选操作模式。

## 2. 设计原则

- **不重已有内容**：退役/注意力管理/即发即返/后台轮询等共享规范引用已有 guide（orchestration），loop guide 只管增量
- **每个 guide ≤ 50 行**：保持在 `guide-execute.md`（56 行）水平，token 节省最大化
- **Q 分叉树负载**：每层只读一个 ~40 行的 guide，三层总 token ≈ 120 行，不到 `guide-orchestration.md`（298 行）的一半
- **工具最小化**：仅新增 `grade_step` 一个 MCP 工具；loop 指纹检测内置于 workflow-engine，PM 无感知

## 3. Skill 入口改动

### 3.1 Q1 选项重排

Loop Engineering 作为 A 入口，现有选项顺延：

```
A: PM 统筹 — Loop Engineering 编排   → Read guide-loop-entry.md
B: PM 统筹 — 规划派发与验收           → Read guide-planning.md
C: PM 统筹 — 长轮次编排验收修复       → Read guide-orchestration.md
D: 执行者                            → Read guide-execute.md
```

修改文件：`skills/kimi-session-orchestrator/SKILL.md`（Q1 选项列表，+2 行）

### 3.2 子问题树

选 A 后进入两级子问题：

```
Q2 循环类型:
  A: 编排自循环 Loop 实施  → Read guide-loop-implement.md
  B: 编排自循环 Loop 验收  → Read guide-loop-verify.md

Q3 并行度:
  A: 单 task session 串行循环  → Read guide-loop-{type}-single.md
  B: 多 session 并行循环        → Read guide-loop-{type}-parallel.md
```

修改文件：`skills/kimi-session-orchestrator/SKILL.md`（Q2/Q3 逻辑，+10 行）

## 4. 新增 Guide 文件列表

全部安装到 `~/.agents/skills/kimi-session-orchestrator/` 目录。

| 文件 | 预估行数 | 触发路径 |
|------|:--:|------|
| `guide-loop-entry.md` | ~30 | Q1=A 后立刻 |
| `guide-loop-implement.md` | ~50 | Q2=A |
| `guide-loop-implement-single.md` | ~40 | Q2=A + Q3=A |
| `guide-loop-implement-parallel.md` | ~50 | Q2=A + Q3=B |
| `guide-loop-verify.md` | ~50 | Q2=B |
| `guide-loop-verify-single.md` | ~40 | Q2=B + Q3=A |
| `guide-loop-verify-parallel.md` | ~50 | Q2=B + Q3=B |

**合计：7 个文件，~310 行，平均 44 行/文件**

## 5. Guide 内容概要

### 5.1 guide-loop-entry.md（~30 行）

```
§一 Loop Engineering 是什么（3 句）
    不去手动 prompt Agent，而是设计自动 prompt Agent 的循环
§二 两种模式
    实施模式：有任务 → 循环执行 → 每步自动验证
    验收模式：有结果 → 循环审查 → 不合格打回 → 修复 → 重验
§三 接下来：Q2 选择循环类型
```

### 5.2 guide-loop-implement.md（~50 行）

```
§一 实施循环模型
    ① create_session → ② execute_prompt(step) → ③ poll 等待
    → ④ grade_step 验证 → ⑤ 决策 → ② 或升级
§二 grade_step 工具
    调用格式、返回值、"筛子非裁判"边界说明
§三 决策表
    grade pass + PM 抽查通过 → 继续下一步
    grade pass + PM 抽查不通过 → 标注原因，重试
    grade fail → 看 feedback 重试，上限 2 次 → 升级
§四 重试计数与 loop 指纹告警
§五 衔接：Q3 选择并行度
```

### 5.3 guide-loop-implement-single.md（~40 行）

```
§一 单 session 串行循环
    一个 session，顺序执行步骤 1→2→3→N
    每步后 grade，通过才走下一步
§二 流程速览
    create → execute(step1) → poll → grade → pass? → execute(step2) → ...
§三 核心约束
    步骤间不跳步、grade fail 不跨步骤重试限 2 次
§四 注意：上下文可达 ~360K 拐点 → 退役策略见 guide-orchestration.md
```

### 5.4 guide-loop-implement-parallel.md（~50 行）

```
§一 多 session 并行循环
    拆解为 N 个独立子任务 → N 个 session 并行启动
    每个 session 独立执行 + grade 验证
§二 并行编排流程
    create N sessions → N× execute_prompt → N× Bash 后台轮询
    → 收到哪个先处理哪个 → 全部完成后汇总
§三 grade_step 并行接入
    每个子任务完成后独立 grade
    单 session grade fail 不影响其他 session 继续
§四 汇总决策
    全部通过 → 合成交付
    部分失败 → 判断是重试/跳过/升级
§五 并行度 gating
    最多 5 个并行 session（Kimi Server 承受力）
```

### 5.5 guide-loop-verify.md（~50 行）

```
§一 验收循环模型
    已完成产出 → grade_step 逐条对照 criteria 评分
    → 不合格项清单 → 修复 → grade_step 重验 → 全绿通过
§二 grade_step 验收模式
    criteria 应逐条明确（可量化/可判定）
    pass 阈值建议：单条 grade 只作参考，多项交叉验证可信度更高
§三 验收决策表
    全部 pass → 交付
    部分 fail → 生成不合格清单 → 发给修复 session 或 PM 手动修复
    重验：修复完成后按同等 criteria 重新 grade_step
§四 衔接：Q3 并行度（单 session 逐项串行 vs 多维度并行验收）
```

### 5.6 guide-loop-verify-single.md（~40 行）

```
§一 单 session 串行验收
    一个 session，逐条 criteria 审查 → grade → 汇总
§二 流程
    execute_prompt("对照 criteria #1 审查...") → poll → grade
    → execute_prompt("对照 criteria #2 审查...") → ...
    → 汇总不合格清单
§三 注意
    严格 pass 阈值，不通过直接记录，不做模糊判定
    session 上下文有限，>5 条 criteria 建议拆为多维度并行
```

### 5.7 guide-loop-verify-parallel.md（~50 行）

```
§一 多 session 并行验收
    不同审查维度分派到不同 session
    例：A 审正确性 / B 审完整度 / C 审安全性
§二 分派流程
    create N sessions → 各 session 配独立 criteria + 独立 grade_step
§三 跨 session 一致性检查
    收齐结果后 PM 交叉验证——两个 session 对同一文件的结论矛盾？
    矛盾 → 建调停 session 裁决
§四 汇总交付
    合并各维度结果 → 去重 → 输出结构化验收报告
```

## 6. 新增代码

| 文件 | 改动 | 行数 |
|------|------|------|
| `src/tools/grade-step.ts` | 新 MCP 工具 | ~35 |
| `src/mcp-server.ts` | 注册 `grade_step` | +4 |
| `src/workflow-template.ts` | `BlockageTypeEnum` 追加 `"loop_detected"` | +3 |
| `src/workflow-engine.ts` | `ActiveExecution` 加 `lastFingerprints`，`driveStep()` 中加指纹比对 | +20 |

### 6.1 grade_step 工具定义

```
grade_step(
  session_id: string,        // 目标 task session
  criteria: string,          // 验收标准（自由文本）
  focus?: "completeness" | "accuracy" | "format"
)
→ { pass: boolean; score: number; feedback: string }
```

**内部实现**（~35 行）：
1. 保存当前 wireClient session
2. 切到内置 grader session（懒创建，复用）
3. 拼评分 prompt → `sendPrompt()` → 解析 JSON
4. JSON 解析失败时返回 `{ pass: false, score: 0, feedback: "parse error" }`
5. 切回原 session
6. 返回结果

### 6.2 Loop 指纹检测（workflow-engine 内部）

`driveStep()` 每轮执行后：
1. 从 `response.messages` 中提取 `tool_use` 块 → `tool_name + JSON.stringify(input).slice(0,80)` 哈希
2. 与 `ActiveExecution.lastFingerprints` 比对
3. 连续 3 轮完全相同 → 生成 `loop_detected` blockage（需 `BlockageTypeEnum` 追加 `"loop_detected"`）
4. 每轮更新 `lastFingerprints`

**PM 层无感知**——堵住后 workflow-engine 自动暂停等待 `continue_workflow` 决策，与现有 blockage 处理流程（重试/跳过/终止）完全一致，不需要 PM 学新操作。

## 7. 不改的内容

| 不碰 | 原因 |
|------|------|
| `wire-client.ts` | sendPrompt/setSessionId/createSession 已满足所有需求 |
| `workflow-template.ts`（YAML schema 部分） | `WorkflowStepSchema` 不新增字段，模板结构不变 |
| `guide-orchestration.md` | Loop guide 通过交叉引用（"见 guide-orchestration §X"）引用共享规范 |
| `guide-planning.md` / `guide-execute.md` | 职责独立，不变 |
| L3 Event-driven / L4 Hill Climbing | 不属于 guide-driven PM 操作模式——这些适合全自动运行层，不在本设计范围 |

## 8. 部署

安装脚本追加（README.md + skill 安装命令）：

```bash
cp skills/kimi-session-orchestrator/guide-loop-*.md \
   ~/.agents/skills/kimi-session-orchestrator/
```

## 9. Token 经济学

对比现有最长 guide：

| 路径 | 加载文件 | 总行数 |
|------|---------|:--:|
| 现状 B: orchestrator | `guide-orchestration.md` | 298 |
| 新 A: loop → implement → single | `entry(30)` + `implement(50)` + `impl-single(40)` | **120** |
| 新 A: loop → verify → parallel | `entry(30)` + `verify(50)` + `verify-parallel(50)` | **130** |

Loop 路径比最大现有 guide 少 56-60% token，且 PM 只读到与当前任务直接相关的内容。

## 10. 自检

- [x] **无 TODO/占位符** — 所有 guide 内容概要已明确
- [x] **内部一致性** — 7 个 guide 的边界无重叠、无遗漏
- [x] **范围可控** — 仅 L2 验证闭环（guide-driven 层），不含 L3/L4 自动化
- [x] **无歧义** — "实施 vs 验收"二分清晰，"单 vs 并行"决策维度单一
- [x] **复用已有能力** — grade_step 复刻 wireClient.sendPrompt 模式，loop 指纹复用 response.messages 中的 tool_use 块
- [x] **不重已有内容** — 退役/注意力管理/后台轮询均交叉引用已有 guide
