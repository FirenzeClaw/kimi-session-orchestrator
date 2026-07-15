# 多 Session 并行

> 加载触发：Q3=P（并行策略）。多 session 同时推进独立模块。

---

## §1 适用条件

- 工作包之间无文件依赖
- 每个工作包 ≤ 5 条验收项
- 最多 5 个并行 session

## §2 派发

```
create_session × N（每模块独立 session）
  → execute_prompt × N（独立 criteria）
  → Bash(run_in_background=true) × N（并行后台轮询）
  → 先完成先审查，不必等全部
```

## §3 约束

| 规则 | 原因 |
|------|------|
| 同文件 ≤ 3 session 覆盖 | 冗余 + 矛盾概率激增 |
| 独立模块必须分 session | 上下文隔离 |
| 全部完成后交叉对比 | 检测矛盾结论 |
