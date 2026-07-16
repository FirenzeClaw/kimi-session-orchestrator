---
name: loop-contract-from-docs
description: Use when a PM has existing SPEC, PRD, PLAN, TASK, or design documents and needs a Loop Contract before running loop-orchestrator
---

# Loop Contract From Docs

## 概述

从已存在的项目文档生成严格循环编排用的 `loop-contract.yaml`。文档是事实来源；PM 不补写需求、不降低循环深度、不跳过生成后审计。

## 触发

- 用户调用 `/loop-contract`
- PM 指定项目路径和文档集，要求从 SPEC/PRD/PLAN/TASK/设计文档生成 Loop Contract
- cron、复盘或验收流程需要把已有文档转换为 loop-orchestrator 的执行契约

## 先决条件

| 条件 | 门控 |
|------|------|
| 已给出项目路径或当前工作目录可作为项目根 | 否则先定位项目根 |
| 至少一份 SPEC/PRD/PLAN/TASK/设计文档可读 | 否则停止并要求补充文档 |
| 需要输出 Contract，而不是直接执行 loop-orchestrator | 否则切换到 `loop-orchestrator` |

## 硬门

| 硬门 | 处理 |
|------|------|
| 输出前必须 Read `guide-contract-qa.md` 并逐项审计 | 不通过则拒绝输出，修正后重新生成 |
| `loop_config.min_cycles >= 2` | 发现为 1 或缺失时立即修正 |
| `loop_config.degradation_detection: true` | 缺失或 false 时立即修正 |
| `loop_config.verify.cross_model` 必须不同于 PM session 当前模型 | 相同或未知时标记为需 PM 替换，不得伪造已验证 |
| Contract 格式必须与 `templates/loop-contract.yaml` 保持一致 | 字段缺失时回到 Phase 4 |
| `operational_brakes` 必须包含 no-progress、wall-time、context 阈值 | 缺失时回到 Phase 4 |
| `harness` 必须声明 required_tools、allowed_paths、forbidden_paths、state_namespace、kill_switch | 缺失时回到 Phase 4 |

## 循环保障说明

Contract 必须内建以下保障，防止 Loop 退化为浅层执行：

- `min_cycles >= 2`：至少完成两轮执行/验证循环，不能一轮就交付。
- `consecutive_pass_required >= 2`：修复后需要连续通过，不能单次 pass 即收尾。
- `degradation_detection: true`：每轮检测范围缩减、验证跳过、AC 省略等降级倾向。
- `direction_baseline`：每轮对照范围边界和不做事项，防止方向漂移。
- `verify.cross_model`：使用不同于 PM session 模型的交叉验证，降低同模型自我确认风险。
- `operational_brakes`：记录 no-progress、wall-time 和 context 阈值，触发后必须暂停处置。
- `harness`：声明工具、允许/禁止路径、状态命名空间和 kill switch，防止执行边界只靠自然语言。

## Phase 1 — 文档侦察

Read `guide-doc-analysis.md`。

1. 读取全部指定文档，记录文档类型和路径。
2. 按 `SPEC 接口定义 ↔ PLAN 实现步骤 ↔ TASK 粒度` 做交叉对照。
3. 输出一致性报告：已覆盖、遗漏、矛盾点。

完成标准：已覆盖/遗漏/矛盾点三列均有结论；无文档时停止，不生成 Contract。

## Phase 2 — 基准提取

1. 提取 acceptance criteria，优先级为 `SPEC AC章节 > PRD 验收条件 > PLAN 成功标准`。
2. 提取方向约束：范围边界、不做事项、接口契约、兼容性要求。
3. Read `guide-complexity.md`，按复杂度矩阵计算 level 和 factors。

完成标准：`goal.acceptance_criteria`、`goal.direction_baseline`、`complexity.level`、`complexity.factors` 均可填入模板。

## Phase 3 — 循环深度判定

按 `guide-complexity.md` 的映射写入循环参数：

| complexity.level | loop_config |
|------------------|-------------|
| `low` | `min_cycles: 2`, `consecutive_pass_required: 2`, `max_cycles: 4` |
| `medium` | `min_cycles: 3`, `consecutive_pass_required: 2`, `max_cycles: 5` |
| `high` | `min_cycles: 4`, `consecutive_pass_required: 3`, `max_cycles: 6` |

完成标准：循环参数只由复杂度矩阵驱动；不得因任务看似简单把 `min_cycles` 降到 1。

## Phase 4 — 生成

1. 复制 `templates/loop-contract.yaml` 的字段结构。
2. 填充 `meta.generated_by: loop-contract-from-docs`、`generated_at`、`source_docs`。
3. 填充 goal、complexity、loop_config、operational_brakes、harness、blockage_recovery、pm_duties、delivery_gate。
4. Read `guide-contract-qa.md`，执行 12 项模板校验和降级探测。
5. 校验失败则修正 Contract 后重新审计。

完成标准：`guide-contract-qa` 全部通过；未通过前禁止输出给 PM。

## Phase 5 — 交接

输出摘要卡片给 PM：

```markdown
目标: <goal.statement>
来源文档: <N 个>
复杂度: <low|medium|high> (<factors 摘要>)
循环参数: min=<N>, consecutive=<N>, max=<N>
降级探测: enabled
交叉验证: <cross_model>
制动器: no-progress=<N>, wall-time=<N>min, context=<N>
执行边界: allowed=<N>, forbidden=<N>, state=<namespace>
遗漏/矛盾: <数量与摘要>
下一步: PM 确认后进入 loop-orchestrator
```

完成标准：摘要卡片与生成的 Contract 一致；遗漏/矛盾不能被隐藏。

## 异常处理

| 异常 | 处理 |
|------|------|
| 文档互相矛盾 | 标记到一致性报告和 Contract factors；需要 PM 裁决时停止 |
| SPEC 有接口但 PLAN/TASK 未覆盖 | 作为遗漏写入报告，AC 不删除 |
| TASK 粒度太粗无法映射 AC | 标记风险，提高复杂度 factors |
| 找不到不同 cross_model | 写入占位 `<must-differ-from-pm-model>` 并在摘要卡片提示 PM 替换 |
| guide-contract-qa 不通过 | 拒绝输出，回到 Phase 4 修正 |

## 禁止项

| 禁止行为 | 原因 |
|----------|------|
| 未读 guide-contract-qa 就输出 Contract | 跳过硬门 |
| 把 `min_cycles` 设为 1 | 破坏循环保障 |
| 删除文档中难以实现的 AC | 自行降级范围 |
| 将矛盾点静默解释为 PM 意图 | 文档事实被篡改 |
| 用同一个 PM 模型作为 `verify.cross_model` | 失去交叉验证意义 |
