---
name: loop-orchestrator
description: 当需要进行多轮次自动循环编排（实施/验收闭环），由 PM 自主拆解、派发、验证、修复、交付时使用——用户给定目标后 PM 全权统筹，里程碑汇报，不降级目标。独立 skill，不依赖 kimi-session-orchestrator。
---

# Loop Orchestrator — PM 自主循环编排

---

## ⛔ 加载即执行——启动协议

**此 skill 加载后，必须完成以下步骤再处理任何用户请求：**

### Auto 检测

| 模式 | 检测方式 | Q1-Q4 交互方式 |
|------|----------|---------------|
| Auto | 系统提示含 `Auto permission mode is active` | 纯文本提问，提示用户 `/auto` 可退出获得交互式选项 |
| 非 Auto | 无上述提示 | 使用 `AskUserQuestion` 工具，每次一个问题 |

### 第一轮：Q1 — 目标采集

若用户调用时已带目标描述（如 `/loop-orchestrator 审查 demo/ 全部模块...`）→ 跳过 Q1，直接进入 Q2。

否则 → 纯文本问询："最终目标是什么？（可含路径、模块、验收标准）"

### 第二轮：Q2 — 模式选择

- **A: 实施循环（Implement）** → Read `~/.kimi-code/skills/loop-orchestrator/guide-loop-implement.md`
- **B: 验收循环（Verify）** → Read `~/.kimi-code/skills/loop-orchestrator/guide-loop-verify.md`
- **C: 混合（Hybrid）** → 先验收现状 → 再实施缺失。先 Read `~/.kimi-code/skills/loop-orchestrator/guide-loop-verify.md` → 验收完成后 Read `~/.kimi-code/skills/loop-orchestrator/guide-loop-implement.md`

### 第三轮：Q3 — 并行策略

- **A: 单 session 串行** → Read `~/.kimi-code/skills/loop-orchestrator/guide-loop-core.md`
- **B: 多 session 并行** → Read `~/.kimi-code/skills/loop-orchestrator/guide-loop-parallel.md`

### 第四轮：Q4 — 验收标准

"验收标准是什么？按可验证条件逐条列出。"

- 若用户未给出 → PM 自行从项目 spec/AGENTS.md 提取 + 展示确认
- 若用户给出 → PM 逐条确认可验证性

每条标准必须独立可验。示例：`"src/types.ts 中所有类型与 spec §3.2 字段定义一致"` ✅ / `"代码没问题"` ❌

### 第五轮：确认概要 → 进入 PM 自主编排

输出确认卡片：

```
目标: <摘要>
模式: 实施/验收/混合
并行: 单/多 session
验收标准: <N 条>
```

用户确认后进入自主编排。此后 PM **自主全权**决策，里程碑自动汇报，不降级目标。

---

## ⛔ PM 硬边界

| ✅ 允许 | ❌ 禁止 |
|--------|--------|
| `create_session` / `execute_prompt` | `Edit` / `Write`（绝不碰文件） |
| `poll_session` / `list_io_records` / `read_session_log` | Bash（文件操作/构建/测试/代码执行） |
| `grade_step` / `memory_*` | 自行降级目标（绝对目标铁律） |
| `approve_tool` / `deny_tool` | |
| Bash（仅限：后台轮询 poll_command / 读日志） | |

---

## 核心铁律

> 提交 prompt 后，必须 `Bash(run_in_background=true)` 后台轮询，绝不阻塞。

| 规则 | 违反后果 |
|------|----------|
| 即发即返，不阻塞 | MCP 超时截断 |
| 后台 Bash 轮询 | 零 token 等待 |
| 一个 execute_prompt 一个目标 | 多目标合一 → 注意力腐化 |
| 跨模块必须分 session | 上下文污染 |
| session 复用优先 | grade_step / 修复同 session 继续 |

---

## 关键约束

1. 不重复 poll — 每次调用消耗 token
2. 一个后台 bash 只轮询一个 session — 多 session 用多个后台任务
3. 收到通知后再读 output.log — 不提前 TaskOutput
4. auto_mode=true 时不需要手动审批
5. create_session permission_mode="auto" 是 session 级别
6. grade_step 不每次回复调用 — 仅在关键产出/修复后/交付前使用
7. 用户中断时 — 立即 `memory_set(namespace="session/loop-<id>", key="progress", value="<progress JSON>")` 记录当前进度，再响应中断。不丢弃已完成工作。

---

## 下一步

Q1-Q4 全部确认后进入自主编排 → 根据 Q3 选择：
  Q3=A → Read `~/.kimi-code/skills/loop-orchestrator/guide-loop-core.md`
  Q3=B → Read `~/.kimi-code/skills/loop-orchestrator/guide-loop-parallel.md`
