# 执行者指南

> 你是执行者，不是 PM——当前 session 自己干活，仅用 tunnel 工具做后台编排辅助。

## 标准工作流

```
① create_session(cwd="/path", permission_mode="auto")
   → { session_id }

② execute_prompt(session_id, "任务描述", auto_mode=true)
   → { submitted: true, poll_command: "..." }

③ Bash(run_in_background=true, command=poll_command)
   → 后台轮询，完成时 <notification> 自动通知

④ 等待通知 → Read ~/.kimi-tunnel/poll-result-{sid}.txt → 拿到回复
   （或读取通知附带的 output.log 路径）
```

> ⛔ **poll_command 必须原样使用，禁止手写改写。** v2.16 起 poll_command 为纯 Python 脚本（短命令 `python3 ~/.kimi-tunnel/poll.py <args>` 或降级内联版），`fetch_result` 自动写入 `~/.kimi-tunnel/poll-result-{sid}.txt`。直接传给 Bash，一字不改。

## 轮询行为（v2.24）

- 每轮默认等待 **900s（15 分钟）**；一轮超时若 session 仍存活，自动进入下一轮（默认最多 2 轮，`KIMI_POLL_MAX_ROUNDS` 可调），输出 `[POLL_ROUND n/max]`
- 回执为空/极短（< `KIMI_POLL_MIN_TEXT`=20 字符且回合未完成）时，脚本自动检测 wire 日志状态：
  - `MODEL_TIMEOUT` → 自动发送"继续"（≤3 次，每次观察 ≥ `KIMI_POLL_STALL_SEC`=120s）；3 次仍无产出 → 输出 `[POLL_BLOCKED]` + 写 `~/.kimi-tunnel/poll-blocked-{sid}.md`，**exit 5**，需 PM 介入
  - `IMAGE_BLOCK`（停滞 + 图片内容，模型无多模态）→ 不发送"继续"，直接 `[POLL_BLOCKED]` + 标记文件"session 已阻塞需另起"，**exit 5**
- 退出码：`0`=完成（含 `[CTX_HIGH]` 警告）`2`=server 离线 `3`=轮询超时 `4`=未检测到 Kimi Server（tunnel 会自动激活，可稍后重试）`5`=检测到阻塞

## 核心铁律

| 规则 | 违反后果 |
|------|----------|
| 即发即返，不阻塞 | MCP 超时截断，任务 session 仍在跑但你拿不到结果 |
| 后台 Bash 轮询 | OS 进程信号驱动，零 token 等待，完成时自动通知 |
| 不用 `wait=true` | 已废弃，受 MCP 超时限制 |
| 不在同一 turn 反复 poll | 浪费 token，session 未完成时空等 |

## 工具速查

**Session 管理** `create_session` `list_sessions` `get_session_info` `get_tunnel_status`
**任务下发** `execute_prompt` `chat_with_session` `run_flow`
**状态查询** `poll_session` `list_io_records` `read_session_log`

## 状态含义

| state | 含义 | 处理 |
|-------|------|------|
| `active` | 正在执行工具调用 | 继续等 |
| `swarm` | 并行子代理调度中 | 继续等 |
| `awaiting_approval` | 等待审批 | 检查 auto_mode |
| `done` | turn 完成 (end_turn) | 读取回复 |
| `error` | 检测到错误 | 查看 log |
| `idle` | 空闲 | 可能刚启动或卡住 |

## 红线

- "我手动轮询几次看看" → 启动后台 Bash 任务
- "这次简单，阻塞等也没事" → MCP 超时 30s，必截断
- "用 wait=true 更方便" → 已废弃，始终即发即返
- "直接把 poll_command 改一下" → 工具已生成正确命令（v2.8.4 urllib 直连 + UTF-8），不要修改

---

## Server 断联/未启动自主恢复

**v2.24 起：tunnel 启动时若 Kimi Server 不在线，会自动激活 `kimi web`（detached、无超时、原子互斥防多实例）**——冷启动场景无需手动执行 R2。以下流程用于**运行中**断联或自动激活失败的兜底：

**R1 — 诊断**
`Bash: ls ~/.kimi-code/server/instances/ && get_tunnel_status`
→ 实例文件存在且 `wireConnected: false`？跳 R3（等自动重连）
→ 实例文件缺失？进 R2

**R2 — 启动 Kimi Server（兜底）**
`Bash(run_in_background=true): kimi web --no-open`
等待 8-10s，确认 `~/.kimi-code/server/instances/` 出现实例文件且 port 字段有效。
（lock 文件已只读化——tunnel 只读取，不做清理；陈旧文件由自动激活流程覆盖）

**R3 — 等待 Tunnel 自动重连**
Tunnel 每 10s 自动检测实例文件并重试连接。等待 ≤30s。
`get_tunnel_status` 确认 `wireConnected: true`。
超过 120s 仍未恢复 → 在终端执行 `/reload` 强制重启 MCP 进程。

**R4 — 恢复状态**
- `get_tunnel_status` 确认 `wireConnected: true`
- 检查活跃 task session：`poll_session` 逐个确认状态
- 检查后台 Bash 任务：`TaskList` 查看是否因断连异常退出 → 重建
- 断连前已提交的 prompt 不受影响——继续原流程

> 关键约束（不重复 poll、一 bash 一 session、auto_mode 规则等）见 SKILL.md。
> 完整规范见 docs/coordinator-guide.md
