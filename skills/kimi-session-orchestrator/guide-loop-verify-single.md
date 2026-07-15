# 单 Session 串行验收

> 加载条件：Q1=B（长轮次编排） + Q3=A（自主执行）。单 session 内逐条验收多项标准。

## §1 模式说明

一个 session，逐条遍历验收标准，逐条打分，汇总 fail list。

**适用：** 验收项 ≤ 5 条、项间有上下文依赖。
**不适用：** > 5 条（session 上下文有限 → 拆分多维并行验收）。

## §2 执行流程

```
① execute_prompt(session_id, "逐条验证以下标准，通过标记 PASS，不通过记录证据：
   #1 <标准描述> — 检查 <具体方法>")
   → 后台轮询，拿到回复

② 解析回复 → 逐条 grade（PASS / FAIL）

③ 若有 FAIL，同 session 继续修复：
   execute_prompt(session_id, "标准 #1 未通过：<证据>。修复后重新验证。")
   → 后台轮询 → 重新 grade

④ 全部验收项处理完毕 → 汇总 fail list 输出
```

## §3 判定铁律

| 规则 | 说明 |
|------|------|
| **严格通过** | 不明确通过 = FAIL，禁止模糊判定 |
| **逐条独立** | 每条单独判定，不因其他项 PASS 而放水 |
| **上下文限制** | 单 session ≤ 5 条，超限 → 拆分多 session 并行 |
| **证据必附** | 每个 FAIL 必须附带文件路径、行号、代码片段 |

## §4 产出格式

```
❌ FAIL #1: <标准描述>
   文件: path/to/file.ts:42
   证据: <当前 vs 预期>
   严重度: critical / major / minor

✅ PASS: 标准 #3, #4
```

> 完整规范见 `docs/coordinator-guide.md`
