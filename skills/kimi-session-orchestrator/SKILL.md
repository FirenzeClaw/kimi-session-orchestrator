---
name: kimi-session-orchestrator
description: 当需要操作 kimi-session-orchestrator MCP 工具时使用
---

# Kimi Session Orchestrator — PM 视角多 session 编排

---

## ⛔ 加载即执行——启动协议

**此 skill 加载后，必须完成以下步骤再处理任何用户请求：**

### Auto 检测

如果当前 session 处于 auto permission mode（系统提示 `Auto permission mode is active`），AskUserQuestion 工具将不可用。

- **Auto 模式**：用纯文本提问，同时提示用户 `/auto` 可退出
  ```
  **Q1: 角色与维度？**
  A: Loop Engineering / B: PM 规划派发 / C: PM 长轮次编排 / D: 执行者
  （提示：输入 /auto 退出 auto 模式可获得交互式选项）
  ```
- **非 auto 模式**：使用 AskUserQuestion 工具，一次一个问题
- 禁止调用 ExitPlanMode——它与 auto permission 无关

### 第一轮：Q1 — 角色与维度

非 auto 模式用 AskUserQuestion，auto 模式用纯文本提问。选项：
- **A: PM 统筹 — Loop Engineering 编排** → 回答后 Read `~/.agents/skills/kimi-session-orchestrator/guide-loop-entry.md`
- **B: PM 统筹 — 规划派发与验收** → 回答后 Read `~/.agents/skills/kimi-session-orchestrator/guide-planning.md`
- **C: PM 统筹 — 长轮次编排验收修复** → 回答后 Read `~/.agents/skills/kimi-session-orchestrator/guide-orchestration.md`
- **D: 执行者** → 回答后 Read `~/.agents/skills/kimi-session-orchestrator/guide-execute.md`

### 第二轮：Q2 — 目标与追问

#### Q2a: 最终目标？（通用）
自由文本。示例："审查 specs/003 的全部实现，修复发现的 bug，输出审查报告"

#### Q2b: 派发模式？（仅 Q1=B 时追问）
- **纯派发验收**：PM 拆解 → 派发 task session 执行 → PM 对照规范验收
- **派发+自审**：PM 拆解 → 派发 task session 执行 → session 自审查修复 → PM 验收

### Loop 子问题（仅 Q1=A 时）

选择 Q1=A 后进入 Loop Engineering 子问题树：

#### Q2 — 循环类型
- **A: 编排自循环 Loop 实施** → 回答后 Read `~/.agents/skills/kimi-session-orchestrator/guide-loop-implement.md`
- **B: 编排自循环 Loop 验收** → 回答后 Read `~/.agents/skills/kimi-session-orchestrator/guide-loop-verify.md`

#### Q3 — 并行度
根据 Q2 回答，追问并行策略：
- **A: 单 task session 串行循环** → 回答后 Read 对应终端 guide（guide-loop-implement-single.md 或 guide-loop-verify-single.md）
- **B: 多 session 并行循环** → 回答后 Read 对应终端 guide（guide-loop-implement-parallel.md 或 guide-loop-verify-parallel.md）

### 第三轮：Q3 — 决策模式
- **自主执行**：阻塞自判（重试/跳过/降级），结果交付时汇报
- **关键点等待**：拆解后、审查后、异常时暂停等用户指示

### 运行模式设定

根据 Q1+Q3 组合设定行为：
- Loop+任意：自动进入 Q2→Q3→加载终端 guide。执行中自主完成 grade_step 验证闭环，关键点暂停等用户确认。
- PM+自主：自主完成 理解→拆解→编排→收集→合成 全流程
- PM+关键点：每阶段暂停展示进度
- 执行者+任意：不使用 PM 决策框架，仅工具操作辅助

---

## 核心铁律

> 提交 prompt 后，必须 `Bash(run_in_background=true)` 后台轮询，绝不阻塞。

| 规则 | 违反后果 |
|------|----------|
| 即发即返，不阻塞 | MCP 超时截断 |
| 后台 Bash 轮询 | 零 token 等待，自动通知 |
| 不用 `wait=true` | 已废弃 |
| 不重复 poll | 浪费 token |

## 关键约束

1. **不要在同一 turn 内多次 poll** — 每次调用消耗 token，且 session 未完成时空等
2. **一个后台 bash 任务只轮询一个 session** — 多 session 用多个后台任务
3. **收到通知后再读 output.log** — 不要提前 TaskOutput
4. **auto_mode=true 时不需要手动审批** — 工具调用自动通过
5. **create_session 的 permission_mode="auto" 是 session 级别** — 后续 prompt 也需 auto_mode=true
