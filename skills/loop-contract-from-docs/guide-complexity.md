# Guide: 复杂度量化矩阵

> 加载条件：Phase 2 基准提取后 Read；生成 `complexity.level`、`complexity.factors` 和 `loop_config` 参数前必须 Read。

## §1 目标

用固定矩阵把文档事实转换为循环深度参数。复杂度只由证据驱动，不能因为 PM 想快速完成而降低。

## §2 计分规则

总分由四类因素相加：

| 因素 | 计分 |
|------|------|
| 涉及文件数 1-3 | 1 |
| 涉及文件数 4-8 | 2 |
| 涉及文件数 9+ | 3 |
| 跨模块依赖 0-1 | 1 |
| 跨模块依赖 2-3 | 2 |
| 跨模块依赖 4+ | 3 |
| 协议层变更 | +2 |
| DB schema 变更 | +2 |

### 判定说明

| 项 | 如何从文档提取 |
|----|----------------|
| 涉及文件数 | PLAN/TASK 明确列出的文件；没有文件名时按模块下可预期文件估算并标记为 estimate |
| 跨模块依赖 | 需要同时改动的 src/tools、workflow、memory、policy、HTTP、UI、docs 等模块数量 |
| 协议层变更 | API、MCP tool schema、wire protocol、CLI 参数、YAML Contract 格式变更 |
| DB schema 变更 | SQLite/Postgres 表、索引、迁移、持久化字段结构变更 |

## §3 等级映射

| 总分 | complexity.level |
|------|------------------|
| 2-3 | `low` |
| 4-5 | `medium` |
| 6+ | `high` |

> Guard clause：若最低两项基础分缺失，停止补齐证据；不得默认 `low`。

## §4 驱动参数

| complexity.level | min_cycles | consecutive_pass_required | max_cycles |
|------------------|:----------:|:-------------------------:|:----------:|
| `low` | 2 | 2 | 4 |
| `medium` | 3 | 2 | 5 |
| `high` | 4 | 3 | 6 |

## §5 输出格式

```yaml
complexity:
  level: medium
  factors:
    - "files=4-8 → +2: PLAN lists src/tools/* and memory-store.ts"
    - "cross_module_dependencies=2-3 → +2: tools + memory"
    - "protocol_layer_change → +2: MCP tool schema changes"
    - "total_score=6 → high"

loop_config:
  min_cycles: 4
  max_cycles: 6
  consecutive_pass_required: 3
```

## §6 门控条件

| 检查项 | 通过条件 |
|--------|----------|
| factors 可追溯 | 每个 factor 写明分值和来源 |
| level 与分数一致 | 总分 2-3 low、4-5 medium、6+ high |
| loop_config 与 level 一致 | 参数完全匹配 §4 表 |
| min_cycles 不降级 | 永远不小于 2 |

## §7 异常处理

| 情况 | 处理 |
|------|------|
| 文档没有文件数 | 用模块数量估算，factor 标记 `estimate` |
| 文档没有模块依赖 | 从接口/目录/任务名推断，无法推断则停止询问 PM 或标记 unknown |
| 协议层变更不明确 | 出现 API/MCP/YAML/CLI/wire/schema 字样时按协议层变更计分 |
| DB schema 变更不明确 | 出现 migration/table/index/schema/persistence 字样时按 DB schema 变更计分 |

## §8 禁止项

| 禁止行为 | 原因 |
|----------|------|
| 用主观难度覆盖矩阵分数 | 循环深度失真 |
| 高复杂度仍设置 `min_cycles: 2` | 降级循环保障 |
| 只写 level 不写 factors | PM 无法审计 |
| 因文档缺项默认 low | 缺证据不等于低复杂度 |
