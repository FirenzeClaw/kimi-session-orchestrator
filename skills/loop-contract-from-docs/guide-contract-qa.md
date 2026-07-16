# Guide: Contract 生成后审计

> 加载条件：Phase 4 生成 Contract 后、任何输出给 PM 前必须 Read。此 guide 是硬门；不通过则拒绝输出，修正后重新生成。

## §1 审计原则

Contract 是 loop-orchestrator 的执行边界。审计目标不是让 YAML 看起来完整，而是阻止浅层循环、同模型自我确认、范围静默缩减和不可验证交付。

## §2 12 项模板校验清单

逐字段检查以下 12 项；任何一项失败都必须回到生成阶段修正。

| # | 字段 | 通过标准 | 失败处理 |
|---|------|----------|----------|
| 1 | `meta.generated_by` | 等于 `loop-contract-from-docs` | 修正来源 |
| 2 | `meta.generated_at` | 非空 ISO timestamp | 填入当前生成时间 |
| 3 | `meta.source_docs` | 至少 1 项，路径可追溯 | 补齐源文档 |
| 4 | `goal.statement` | 非空，≤ 3 句话 | 压缩为目标陈述 |
| 5 | `goal.acceptance_criteria` | 至少 1 条，每条以可验证动词开头 | 回到文档提取 AC |
| 6 | `goal.direction_baseline` | 至少 2 条，包含范围边界或不做事项 | 回到基准提取 |
| 7 | `complexity.level` + `complexity.factors` | level 为 low/medium/high，factors ≥ 2 且含分值来源 | 回到复杂度矩阵 |
| 8 | `loop_config` | `min_cycles >= 2`，`max_cycles > min_cycles`，`consecutive_pass_required >= 2`，`degradation_detection: true` | 按复杂度映射修正 |
| 9 | `loop_config.verify` | `primary: grade_step`，`cross_model` 非空且不同于 PM session 模型，`self_audit_rounds >= 1` | 选择不同模型或标记必须替换 |
| 10 | `operational_brakes` | 含 `max_repeated_actions`、`max_wall_time_minutes`、`context_tokens_threshold`、`no_progress_escalation` | 补齐基础制动器 |
| 11 | `harness` | 含 required_tools、allowed_paths、forbidden_paths、state_namespace、kill_switch | 补齐执行边界 |
| 12 | `blockage_recovery` + `pm_duties` + `delivery_gate` | strategies ≥ 2，per_cycle ≥ 2，delivery_gate 条件独立可验且包含 brakes/harness 检查 | 补齐交付和阻塞门控 |

## §3 降级探测

### min_cycles 探测

| 检查 | 降级信号 | 处理 |
|------|----------|------|
| `loop_config.min_cycles` | 等于 1、缺失、或注释暗示可降为 1 | 拒绝输出，按复杂度矩阵修正 |
| `delivery_gate` | 未要求 min_cycles 满足 | 补充 delivery gate |
| 摘要卡片 | 写成“可一轮完成” | 删除降级表述 |

### cross_model 探测

| 检查 | 降级信号 | 处理 |
|------|----------|------|
| `verify.cross_model` | 等于 PM session 当前模型 | 拒绝输出，换不同模型 |
| `verify.cross_model` | 空、`same`、`self`、`current` | 拒绝输出，改为不同模型或 `<must-differ-from-pm-model>` |
| `verify.primary` | 不是 `grade_step` | 修正为 `grade_step` |

### 范围降级探测

| 检查 | 降级信号 | 处理 |
|------|----------|------|
| AC 数量 | 少于文档提取结果且无说明 | 回到 Phase 2 补齐 |
| direction_baseline | 不包含不做事项或范围边界 | 补齐基线 |
| complexity.level | 分数对应 high 但写 medium/low | 按矩阵修正 |
| delivery_gate | 缺少 PM 确认未降级 | 补齐交付门 |

### 制动器与 harness 探测

| 检查 | 降级信号 | 处理 |
|------|----------|------|
| `operational_brakes.max_repeated_actions` | 缺失或大于 1 且无说明 | 补齐 no-progress 制动器 |
| `operational_brakes.max_wall_time_minutes` | 缺失 | 补齐 wall-time 制动器 |
| `harness.allowed_paths` / `forbidden_paths` | 空或全项目通配且无边界说明 | 回到文档提取执行边界 |
| `harness.kill_switch` | 缺失或只写“PM决定” | 写明可检查停止条件 |
| `delivery_gate` | 未检查 brakes/harness | 补齐交付门 |

## §4 审计输出格式

```markdown
## Contract QA

| # | 检查项 | 结果 | 证据 |
|---|--------|:---:|------|
| 1 | meta.generated_by | PASS/FAIL | <值> |
| 2 | meta.generated_at | PASS/FAIL | <值> |
| 3 | meta.source_docs | PASS/FAIL | <数量> |
| 4 | goal.statement | PASS/FAIL | <句数> |
| 5 | goal.acceptance_criteria | PASS/FAIL | <数量与动词> |
| 6 | goal.direction_baseline | PASS/FAIL | <数量> |
| 7 | complexity | PASS/FAIL | <level/factors> |
| 8 | loop_config | PASS/FAIL | <min/max/consec/degradation> |
| 9 | verify | PASS/FAIL | <primary/cross_model> |
| 10 | operational_brakes | PASS/FAIL | <no-progress/wall-time/context> |
| 11 | harness | PASS/FAIL | <tools/paths/state/kill_switch> |
| 12 | recovery/duties/gate | PASS/FAIL | <数量> |

降级探测:
- min_cycles: PASS/FAIL
- cross_model: PASS/FAIL
- scope: PASS/FAIL
- brakes: PASS/FAIL
- harness: PASS/FAIL

结论: PASS / FAIL
```

## §5 失败处理

1. 任何模板校验 FAIL → 不输出 Contract。
2. 任何降级探测 FAIL → 不输出 Contract。
3. 回到对应 Phase 修正字段。
4. 修正后重新运行 12 项校验。
5. 只有结论为 PASS 时，才允许进入 Phase 5 交接。

## §6 禁止项

| 禁止行为 | 原因 |
|----------|------|
| “大体通过”后输出 | Contract 是硬门，不接受部分通过 |
| 手动忽略 `cross_model` 相同问题 | 破坏交叉验证 |
| 把 `min_cycles=1` 解释为快速路径 | 破坏 Loop Engineering |
| 发现 AC 缺失但交给 PM 后续补 | 输出不完整 Contract |
| 省略 QA 表格只说“已审计” | 无证据 |
