# Guide — Contract 生成后审计

加载条件：在 `loop-contract-from-idea` Phase 5 执行。每次生成或修改 `.kimi-tunnel/loop-contract.yaml` 后必须加载。

## 核心规则

此审计与 from-docs 的 `guide-contract-qa` 保持同一字段规范，并额外检查 from-idea 的推断来源风险。审计不通过时，不得交接给 `loop-orchestrator`。

## 审计输入

- Phase 1 的 Q1-Q5 追问记录。
- Phase 2 的用户确认记录。
- 生成的 `.kimi-tunnel/loop-contract.yaml`。
- 共享模板路径：`skills/loop-contract-from-docs/templates/loop-contract.yaml`。

## 12 项模板校验清单

| # | 检查项 | 通过标准 |
|---|--------|----------|
| 1 | `meta` 全部字段非空 | `generated_by`、`generated_at`、`source_docs` 均存在且非空 |
| 2 | `meta.generated_by` | from-idea 路径必须为 `loop-contract-from-idea`；Q5 升级后不得伪装 from-idea |
| 3 | `goal.statement` | 不超过 3 句话，能对应 Q1 最终目标 |
| 4 | `goal.acceptance_criteria` | 每条以可验证动词开头，且至少 1 条 |
| 5 | `goal.direction_baseline` | 至少 2 条，且与 Q4 或默认方向约束一致 |
| 6 | `complexity.factors` | 至少 2 条，能解释 complexity level |
| 7 | `loop_config.min_cycles` | `>= 2`，不得降为 1 |
| 8 | `loop_config.max_cycles` | 必须大于 `min_cycles` |
| 9 | `loop_config.verify.cross_model` | 必须存在，且不同于当前 PM session 模型 |
| 10 | `operational_brakes` | 含 max_repeated_actions、max_wall_time_minutes、context_tokens_threshold、no_progress_escalation |
| 11 | `harness` | 含 required_tools、allowed_paths、forbidden_paths、state_namespace、kill_switch |
| 12 | `blockage_recovery`、`pm_duties`、`delivery_gate` | strategies ≥ 2；per_cycle ≥ 2；delivery_gate 条件互不重叠且独立可验，并包含 brakes/harness 检查 |

任一项失败，回到生成 Phase 修正。

## From-Idea 额外检查

### 1. AC 来源检查

检查问题：是否把 PM 推断写成事实，且未经用户确认？

通过标准：

- 每条 AC 都能追溯到 Q1-Q4 回答和 Phase 2 用户确认。
- Contract 或交接说明中不出现“文档要求”“规范规定”等事实化措辞，除非 Q5 已升级 from-docs。
- 不存在 PM 自行新增的隐性 AC。

失败处理：

- 未确认 AC → 回到 `guide-baseline-lock.md` Step 3 展示并请求确认。
- 来源不明 AC → 删除或重新追问，不得保留。

### 2. Direction Baseline 一致性检查

检查问题：`direction_baseline` 是否与 Q4 用户回答一致？

通过标准：

- Q4 明确“不碰模块/不做事项”必须逐条进入 `direction_baseline`。
- 用户确认“暂无方向约束”时，只能使用默认最小改动边界。
- 不得遗漏“不降级”“不跳过验证”“不引入依赖”等用户明确边界。

失败处理：回到 Phase 2 重新展示方向基线草案并确认。

### 3. Q5 升级检查

检查问题：用户是否提供文档但 Contract 仍按 from-idea 生成？

通过标准：

- Q5 无文档：`source_docs: [user-input]`。
- Q5 有文档：停止 from-idea，进入 from-docs；不得生成 from-idea Contract。

失败处理：废弃当前 Contract 草案，升级 from-docs。

## 降级探测

逐项搜索以下降级信号：

| 信号 | 判定 | 处理 |
|------|------|------|
| `min_cycles: 1` | 浅层循环 | 改回复杂度矩阵下限 |
| `consecutive_pass_required: 1` | 修完即交付 | 改为至少 2 |
| `degradation_detection: false` | 关闭降级检测 | 改为 true |
| `cross_model` 为空或等于 PM 模型 | 同模型自检偏差 | 选择不同模型 |
| `delivery_gate` 合并条件 | 交付门不可验 | 拆成独立条件 |
| `direction_baseline` 缺失 Q4 边界或少于 2 条 | 方向漂移风险 | 回到 Phase 2 确认 |
| complexity 因实现困难被调低 | 能力降级 | 恢复基于 Q2-Q4 的评估 |
| `operational_brakes` 缺失 no-progress 或 wall-time | 无制动器循环 | 补齐基础制动器 |
| `harness` 缺少 allowed/forbidden 边界 | 执行范围漂移 | 回到 Phase 2 确认边界 |
| `delivery_gate` 未检查 brakes/harness | 交付门不可验 | 拆成独立条件 |

发现任何降级信号，禁止交接。

## 审计输出格式

```markdown
## Contract QA

### 模板校验
| # | 检查项 | 状态 | 证据 |
|---|--------|:---:|------|
| 1 | meta 全部字段非空 | ✅/❌ | <字段摘要> |

### From-Idea 来源校验
| # | 检查项 | 状态 | 证据 |
|---|--------|:---:|------|
| 1 | AC 未从推断伪装成事实 | ✅/❌ | <确认记录> |
| 2 | direction_baseline 与 Q4 一致 | ✅/❌ | <Q4 对照> |
| 3 | Q5 升级路径正确 | ✅/❌ | <Q5 对照> |

### 降级探测
| # | 信号 | 状态 | 说明 |
|---|------|:---:|------|
| 1 | min_cycles 下限 | ✅/❌ | <值> |

### 结论
- ✅ 通过：可交接 `loop-orchestrator`
- ❌ 不通过：回到 <Phase> 修正
```

## 完成标准

- 12 项模板校验全部通过。
- AC 来源检查通过。
- direction_baseline 与 Q4 一致且至少 2 条。
- Q5 升级逻辑无误。
- operational_brakes 和 harness 完整。
- 未发现降级信号。
- Contract 格式与 from-docs 共享模板一致。
