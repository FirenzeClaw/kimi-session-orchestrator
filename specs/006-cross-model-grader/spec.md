# SPEC: Cross-Model Grade Step — Maker/Checker 模型分离

> 来源：Loop Engineering 差距分析 §确定性 Verifier（🔴 第 3 项）
> 日期：2026-07-16
> 状态：Draft

---

## 问题

当前 `grade_step` 对 task session 产出评分时，使用的 grader 模型 = PM session 的当前模型。无显式指定评分模型的能力。

**风险**：若 PM session 模型与 task session 模型相同（或同系列），grader 与 maker 共享推理路径 → 自我确认偏差 → 漏判率高（Yes-Spiral）。

## 方案

`grade_step` 新增 `grader_model` 可选参数，允许 PM 指定用不同模型评分。

### API 变更

```
grade_step(
  session_id: string,        // 不变 — 被评分的 task session
  criteria: string,          // 不变 — 验收标准
  focus?: "completeness" | "accuracy" | "format",  // 不变
  grader_model?: string      // 新增 — 评分模型标识符，如 "gpt-5.5"
)
```

- `grader_model` 省略时 → 使用 PM session 当前模型（向后兼容）
- `grader_model` 指定时 → 用该模型创建独立评分 session，拉取 target session 的 IO 产出进行评分

### 实现要点

1. 用 `grader_model` 创建临时评分 session（`create_session(cwd, model=grader_model, permission_mode="auto")`）
2. 注入目标 session 的 IO 产出作为评分上下文
3. 评分完成后返回结果，临时 session 可保留供审查或自动关闭
4. 若 `grader_model` 指定的模型不可用 → 返回错误 + 可用模型列表

### 推荐配对

| Maker（task session） | Grader（grade_step） | 互补性 |
|----------------------|---------------------|--------|
| `deepseek-v4-pro` | `gpt-5.5` | 结构化 ↔ 整体性，差异最大 |
| `gpt-5.5` | `deepseek-v4-pro` | 语义灵活 ↔ 严格精确 |
| `kimi-code/kimi-for-coding` | `gpt-5.5` | 代码专精 ↔ 通用判断 |

## 验收标准

1. `grade_step(sid, criteria, grader_model="gpt-5.5")` → 用 GPT-5.5 评分，返回结构化结果
2. 省略 `grader_model` → 行为与当前版本完全一致
3. 不可用模型 → 返回明确错误（含可用模型列表）
4. 评分 session 的 IO 可追溯（保留 wirePath）

## 边界

- 评分 session 本身也会消耗 token → 加 `max_tokens` 预算保护
- 并发安全：同一 target session 的多次评分不冲突（各自独立评分 session）

## 可探索的后续方向

本 spec 解决的是 Maker/Checker 分离的最低可行版本（不同模型评分）。Loop Engineering 分析中还识别了以下可探索差距：

| # | 方向 | 简述 |
|---|------|------|
| 1 | 确定性 Verifier | **不实现**。通用 Verifier（测试运行器/lint/type checker）依赖项目特定工具链，本项目无法通用化。替代方案：提供 `verify_output` 工具接口作为桥梁，PM 自主调用 task session 执行项目自身的机械验证。Skill 层通过 Loop Contract 规范验证策略 |
| 2 | Durable Execution | OrchestrationStore SQLite 持久化 + workflow checkpoint。**TODO**：MCP 工具进程本质决定 OrchestrationStore 为内存态；Docker 常驻可解但当前架构不适合衍生，暂设为远期目标 |
| 3 | Cron 调度 | 定时触发工作流——`/loop` 式循环 vs `/goal` 式收敛 |
| 4 | 预算硬上限 | **不实现**。项目已有 `context_tokens` 监控（[CTX_HIGH] 阈值 36K）覆盖注意力衰减预警；非超大型项目下，本项目的规范注入+逐条派发已消除模糊指令造成的上下文浪费。项目无意控制用户 token 用量 |
| 5 | 工具幂等性审计 | create_session / execute_prompt 去重保护 |
| 6 | Compaction 轻量策略 | 非退役场景的上下文压缩（非 session-retire 的重方案） |
| 7 | Kill Switch 硬终止 | `force_abort` session 能力 |
| 8 | 循环健康指标 | 仪表盘：首次通过率 / 平均迭代 / 升级率 / cost per task |
| 9 | 模型路由 | 扫描用 flash，决策用 pro → 降本 60-80% |
| 10 | Self-Reporting 飞轮 | 循环失败后自动归档教训 → harness 规则自更新 |
