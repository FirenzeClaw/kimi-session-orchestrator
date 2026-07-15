# 实施循环 — PM 操作指南

> **加载触发**：PM 选择 Q2=A（实施循环）。逐步驱动 task session，每步验证通过才进下一步，失败自动重试。

## 一、实施循环模型（5 步）

```
① create_session → ② execute_prompt(step) → ③ poll/Bash wait
       ↑                                            ↓
       ⑤ decision ←───────────────── ④ grade_step verify
  pass→next step  /  fail→retry(≤2x)→escalate
```

每步一个指令，完成验证后才发下一步。严禁一次性注入多步。

## 二、grade_step 工具

```
grade_step(session_id, criteria, focus?)
→ { pass: bool, score: 0-100, feedback: "..." }
```

Grader 是过滤器不是法官——`pass` 不保证完美，`fail` 不总代表真实失败。`pass + score≥70` 仍需 PM spot-check。

## 三、决策矩阵

| grade_step 结果 | PM spot-check | 决策 |
|-----------------|---------------|------|
| pass | ✅ 确认无误 | → 下一步 |
| pass | ❌ 发现问题 | → 标注原因，retry（同一步） |
| fail | — | → 读 feedback → retry（≤2 次）→ escalate |

**PM spot-check 优先级高于 grader。** grader 看表面合规，PM 判断实质正确性。

---

## 四、重试上限 + 循环指纹告警

单步最大 **2 次** retry。若 workflow-engine 检测到同一 tool 模式连续出现 3 次 → auto-blockage，PM 必须决策 continue/abort。

---

## 五、下一步：Q3

完成实施循环后，PM 选择并行策略：
- **single**：单 session 串行推进（适合依赖链强的任务）
- **parallel**：多 session 并行（适合独立工作包）

> 完整规范见 `docs/coordinator-guide.md`
