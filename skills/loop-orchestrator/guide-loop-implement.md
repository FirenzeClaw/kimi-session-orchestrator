# 实施循环 — 操作指南

> 加载触发：Q2=I（实施循环）。从零构建，逐步产出，每步验证。
> ⚠️ 工具调用失败时先执行 guide-loop-core.md §9 断连恢复流程。

---

## §1 模式

```
create_session → step_1 → grade_step → pass? → step_2 → ... → deliver
                                 └→ fail → fix → grade_step ↻ (≤2 retry)
```

## §2 流程

执行 guide-loop-core.md §3 协议，以下为实施场景的差异化步骤：

```
STEP 1: create_session(cwd, permission_mode="auto")
STEP 2: execute_prompt(sid, step_1, auto_mode=true)
STEP 3: ⛔ Bash(run_in_background=true) 执行 poll_command → 确认 task_id
STEP 5: 等待结果 → 拿到回复
STEP 6: PM grade_step
  pass → STEP 2（执行 next step）
  fail → execute_prompt(sid, 修复指令) → STEP 3 → grade_step
          ≤2 retry → 3rd fail → 阻塞干预
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
