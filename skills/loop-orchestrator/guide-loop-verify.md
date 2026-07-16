# 验收循环 — 操作指南

> 加载触发：Q2=V（验收循环）。逐项检查已有产出，修复不合格项，重验放行。
> ⚠️ 工具调用失败时先执行 guide-loop-core.md §9 断连恢复流程。

---

## §1 模式

```
existing output → grade_step 逐项评分 → fail 项 → fix → re-verify → 全 PASS → done
```

## §2 流程

执行 guide-loop-core.md §3 协议，以下为验收场景的差异化步骤：

```
STEP 2 下发任务（验收 prompt 模板）:
  execute_prompt(sid, "逐条验证以下标准，PASS 标记 ✅，FAIL 附文件:行号+证据:
    #1 <标准> — 检查 <方法>
    #2 ...")
  → 进入 STEP 3（启动监控）... STEP 5（等待结果）

STEP 6 验证决策（验收差异化）:
  PM 解析回复: PASS/FAIL 逐条判定
  若有 FAIL:
    execute_prompt(sid, "标准 #N 未通过: <证据>。修复后重新验证。")
    → 回到 STEP 3（不可跳过）
    → grade_step 重验
  全 PASS → STEP 7
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
