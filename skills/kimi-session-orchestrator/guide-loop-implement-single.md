# 单 Session 串行实施循环

> **加载触发**：Q2=A（实施执行）+ Q3=A（自主执行）。
> **适用场景**：单 session 串行执行多步骤实施任务，每步完成后 PM grade，通过则推进下一步。

---

## 一、核心模式

一条 session 顺序执行 step 1 → 2 → N。每步完成 → PM grade_step → pass? → 下一步。所有步骤通过 → 交付最终产出。

## 二、标准流程

```
create_session(cwd, permission_mode="auto")
  → execute_prompt(sid, step_1, auto_mode=true)
    → Bash(run_in_background=true) poll → done
      → PM grade_step → pass?
        ├─ yes → execute_prompt(sid, step_2) → ...
        └─ no  → retry same step（max 2）→ escalate
  → ... → all done → deliver
```

## 三、核心约束

| 约束 | 说明 |
|------|------|
| **不可跳步** | 严格按序执行，不得跳过任何步骤 |
| **失败先本 session 重试** | grade fail → retry within same session，不立即新建 session |
| **最多 2 次重试** | 同一 step 重试 2 次仍失败 → 向用户升级报告阻塞原因 |
| **每步单指令** | 一个 `execute_prompt` 只含一步操作，不合并多步——多步合一稀释注意力、PM 无法精确定位问题来源 |

## 四、上下文窗口预警

| 信号 | 决策 |
|------|------|
| 上下文预估 ~360K 拐点 | 主动评估是否退役 |
| >5 个连续步骤 | 考虑中途退役换新 session |
| 产出质量下降（偏离规范/幻觉/遗漏要点） | 立即退役，交接上下文到新 session |

> 退役流程：`memory_archive` → `list_io_records` 确认进度 → 创建接班 session + 7-block 交接模板。完整规范见 `guide-orchestration.md` §五。

## 五、GM 检查点（每步 grade_step）

- [ ] 产出完整覆盖 step 预期？
- [ ] 无越权操作（修改未授权文件/范围外代码）？
- [ ] 无幻觉产出（引用不存在文件/函数名）？
- [ ] 符合项目规范（AGENTS.md / spec 约定）？
