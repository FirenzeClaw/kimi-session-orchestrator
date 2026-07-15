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
