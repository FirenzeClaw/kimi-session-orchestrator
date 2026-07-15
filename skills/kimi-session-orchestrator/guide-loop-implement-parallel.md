# 多 Session 并行实施循环

> 加载条件：Q2=A + Q3=B。独立子任务并行派发 → 多 session 同时执行 → 独立验收 → 聚合交付。

---

## §1 并行循环模型

拆解 N 个独立子任务 → N× create_session → N× execute_prompt →
N× Bash 后台轮询 → 各自 grade_step 验证 → 聚合决策

| 约束 | 说明 |
|------|------|
| 单一职责 | 每个子任务只做一件事 |
| 无依赖 | 子任务间不传递产出 |
| 独立 grade | 一份 fail 不阻塞其他 session |

---

## §2 并行编排流程

```
① create_session × N              → N 个 session_id
② execute_prompt × N              → N 个 {submitted, poll_command}
③ Bash(run_in_background) × N     → N 个独立后台轮询
④ 先完成先处理，不等最慢的
⑤ 全部完成 → 聚合交付
```

> poll_command 必须原样使用，禁止改写。

---

## §3 grade_step 并行访问

每个子任务产出**独立 grade**。一份 fail 不阻塞其他 session——标记原因后继续处理已完成的。

---

## §4 聚合决策

| 结果 | 动作 |
|------|------|
| 全部 pass | 合成 → 结构化交付 |
| 部分 fail | 逐项：retry / skip（标注缺口）/ escalate |
| 全部 fail | 检查拆解 → 重新规划 |

---

## §5 并行度上限

**最多 5 个并行 session**（Kimi Server 容忍上限）。超过则分批：首批 5 个 → 全完成 → 下批 5 个。

---

## §6 适用条件

**仅限独立子任务。** 有依赖关系的任务必须串行编排：

- ❌ A 的产出是 B 的输入
- ❌ 先改接口再改实现
- ✅ 独立文档审查、多模块并行修复、独立数据采集
