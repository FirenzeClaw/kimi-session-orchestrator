# Loop Engineering 编排 — 入口

> 加载条件：PM 在 Q1 选择 **A**（规划派发与验收），且任务涉及"设计系统来驱动 agent 循环执行"而非"手动逐条发给 agent"。

## §1 什么是 Loop Engineering

不是自己写 prompt 一条条发给 agent——而是**设计一个系统**，让系统按循环自动驱动 agent。每次循环：agent 产出 → 自动评分/验证 → 根据结果决定下一个循环。你负责设计循环规则和验收标准，让 task session 在循环中自我迭代。

## §2 两种模式

**Implement loop（实现循环）** — 有任务待做，循环驱动 agent 逐步产出：
```
create session → step_1 → grade_step → pass? → step_2 → … → deliver
                                 └→ fail → fix → grade_step ↻
```

**Verify loop（验证循环）** — 已有产出物，循环检查质量并修复：
```
existing output → grade_step against criteria → fail items → fix → re-verify ↻
                                                                    └→ all pass → done
```

| 维度 | Implement loop | Verify loop |
|------|---------------|-------------|
| 输入 | 任务需求 | 已完成产出 |
| 产出 | 从零交付物 | 修复后交付物 |
| 核心动作 | 逐步构建 + 验证 | 逐项检查 + 修复 |
| 适用场景 | 新建代码/文档 | 审查/质量把关 |

## §3 下一步

**Q2: Implement loop 还是 Verify loop？**

- **I（实现）** → Read `guide-loop-implement.md`
- **V（验证）** → Read `guide-loop-verify.md`
