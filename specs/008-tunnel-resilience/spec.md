# SPEC: Tunnel & Poll 稳健性加固（v2.24）

- **特性目录**: `specs/008-tunnel-resilience`
- **日期**: 2026-08-24
- **状态**: Implemented (2026-08-24, v2.24) — 实施与验证记录：lock 只读化 / poll 900s+续轮 / 自动激活（集成验证捕获并修复 spawner ENOENT bug）/ 状态机诊断；68/68 单测通过（新增 19）

## 定位

kimi-session-orchestrator 隧道（tunnel）与轮询（poll）链路的稳健性修复：消除 lock 文件维护负担、延长轮询容忍度、启动时自动拉起 Kimi Server、轮询失败时自动诊断并给出可行动的阻塞结论。

## 背景与动机

当前四个已知问题：

1. **lock 文件误删风险**：`server-lock.ts` 对 `~/.kimi-code/server/instances/*.json` 做 PID 活性与 30s 心跳检测，心跳瞬时超时即删除活跃实例文件，导致后续探测失败；清理逻辑本身不再必要——wire 连接成功与否才是事实来源。
2. **轮询超时过短**：poll 脚本默认 300s 总超时，长任务中途退出 `[POLL_TIMEOUT]`；超时后直接放弃，没有"session 未死就再等几轮"的机制。
3. **Kimi Server 需手工启动**：tunnel 启动时 server 不在线只输出提示并周期重连，从不自动拉起 `kimi web`；手动拉起的进程若挂在后台任务上还会被超时机制杀掉（实测事故）。多个 tunnel 同时激活会产生多实例竞态。
4. **回执异常无诊断**：poll 拿到空/极短回执时直接输出，不区分"模型超时"（可自救）与"读图阻塞"（必须另起 session），PM 无法快速决策。

## 用户与场景

**用户**：使用 kimi-session-orchestrator 的统筹 PM session（以及执行 `execute_prompt` 返回的 `poll_command` 的协调器）。

| 场景 | 现状 | 目标 |
|---|---|---|
| S1 陈旧 lock 文件残留 | 被心跳检测误删或误判，端口探测抖动 | lock 只读，读到即用；连不上走自动激活 |
| S2 长任务轮询 | 5 分钟到点退出，任务未完却丢结果 | 默认 15 分钟一轮 + 存活续轮，最长可配 |
| S3 冷启动（server 未开） | tunnel 只提示 + 重连，PM 手工 `kimi web` | tunnel 自动拉起（一次性、无竞态、不超时） |
| S4 模型超时 | 回执空，PM 手动判断、手动重发 | poll 自动发"继续"×3，仍失败写标记提醒 |
| S5 读图阻塞 | 回执空，PM 无法定位原因 | poll 直接判定并标记"需另起 session" |

## 功能需求

### FR-1：lock 只读化

- FR-1.1 移除 `server-lock.ts` 中 PID 活性检测、30s 心跳新鲜度检测、陈旧文件自动删除（`unlinkSync`）及对应诊断输出。
- FR-1.2 保留：多路径读取（legacy `server/lock` + `instances/*.json`）、`host`/`port` 提取、无有效条目时 fallback `http://127.0.0.1:5494`。
- FR-1.3 poll 脚本 lock 读取由 5×3s 重试改为一次遍历；`LOCK_LOST`（exit 4）保留但提示语改为"未检测到 Kimi Server——tunnel 将自动激活，可稍后重试"。
- FR-1.4 语义：读到的实例文件即视为候选；端口不通的陈旧文件不会被清理，而是被 FR-3 的激活流程覆盖。

### FR-2：轮询超时延长与续轮

- FR-2.1 `maxWaitSeconds` 默认 300 → 900；`execute_prompt` 生成的 `poll_command` 携带新默认。
- FR-2.2 新增 `max_rounds` 参数（默认 2；环境变量 `KIMI_POLL_MAX_ROUNDS` 覆盖）：一轮超时后查询 session 状态，**存活**（状态查询成功且非离线）则输出 `[POLL_ROUND n/max]` 并进入下一轮（重置计时）；离线或到达最大轮次则维持现有超时退出（exit 3）。
- FR-2.3 `kimi-session-orchestrator` SKILL.md 轮询章节同步新默认与续轮行为。

### FR-3：启动时自动激活 Kimi Server

- FR-3.1 新模块 `src/server-spawner.ts` 提供 `spawnKimiWebIfNeeded()`：
  1. 探测：存在实例文件且 TCP 端口可达 → 直接返回现状（不激活）。
  2. 原子互斥：`mkdir ~/.kimi-tunnel/spawn.lock`；已存在（EEXIST）→ 他方正在激活，轮询等待实例文件出现（≤30s）后返回。
  3. 独占成功 → spawn `kimi web --no-open`（命令解析：`KIMI_BIN` 环境变量 → `~/.kimi-code/bin/kimi` → PATH 中的 `kimi`；Windows `detached: true` + stdio 忽略 + `unref`，进程独立于 tunnel 生命周期、不受后台任务超时约束）。
  4. 轮询 `instances/*.json` 出现（≤30s，1s 间隔）→ 删除 `spawn.lock` → 返回最新 URL。
  5. 任意失败路径：finally 确保清理 `spawn.lock`。
- FR-3.2 `index.ts`：`connect()` 失败分支先调 `spawnKimiWebIfNeeded()`，成功后再次 `connect()`（其内部每次重新检测 URL）——二次失败**不递归 spawn**，进入现有 WARNING + healthcheck 流程。
- FR-3.3 运行中 server 崩溃**不**自动激活：保持现有 healthcheck 重连与日志提醒（触发范围仅启动时）。

### FR-4：poll 状态机——自动"继续"与阻塞标记

- FR-4.1 **触发**：fetch 回执为空，或文本长度 < `KIMI_POLL_MIN_TEXT`（默认 20）且最近 turn 未 `end_turn`（已完成回合的短回复视为正常，如"好的"）。
- FR-4.2 **诊断** `diagnose_blocked()`：遍历 `~/.kimi-code/sessions/wd_*/{sid}/agents/main/wire.jsonl` 读尾部 50 行，状态机判定（优先级自上而下）：

| 判定 | 特征 | 动作 |
|---|---|---|
| `ERROR` | 尾部含错误条目或文本含 error/failed/timeout 关键词 | stdout 警告（`[POLL_DIAG]`），不自动干预 |
| 正常边界 | 尾部 `step.end` + `end_turn` | 视为纯工具回合，不诊断 |
| `IMAGE_BLOCK` | 停滞 > `KIMI_POLL_STALL_SEC`（默认 120s，锚定最后一条事件时间戳）且最后一次 turn.prompt 含 image 特征（`content.part type=image` 或文本含 `image`/`图片`） | **不发"继续"**（无效）→ 直接写阻塞标记 |
| `MODEL_TIMEOUT` | 停滞且无 image 特征 | 自动 `POST /api/v1/sessions/{sid}/prompts`（prompt="继续"，带 token）；每次发送后**回到轮询循环**（继续正常轮询，观察期 ≥ `KIMI_POLL_STALL_SEC`），期间回执恢复正常即停止干预；若观察期内仍判定 MODEL_TIMEOUT，再发下一次"继续"。单次 poll 进程生命周期内累计 ≤3 次 |

- FR-4.3 **阻塞标记**：`MODEL_TIMEOUT` 第 3 次"继续"后仍无产出，或 `IMAGE_BLOCK` 判定成立 → 写 `~/.kimi-tunnel/poll-blocked-{sid}.md`（时间戳 / 判定类型 / session / 建议动作），stdout 输出 `[POLL_BLOCKED]` 哨兵并 **exit 5**（区别于 0/2/3/4）；标记文件内容分别含"模型超时阻塞"、"session 已阻塞需另起"字样。
- FR-4.4 `UNKNOWN` 判定仅输出诊断信息（`[POLL_DIAG]`），不自动干预、不写标记。
- FR-4.5 所有诊断相关 stdout 行统一 `[POLL_DIAG]` 前缀。

### FR-5：环境变量

| 变量 | 默认 | 用途 |
|---|---|---|
| `KIMI_POLL_MAX_ROUNDS` | 2 | 轮询最大轮数 |
| `KIMI_POLL_MIN_TEXT` | 20 | 回执长度阈值（字符） |
| `KIMI_POLL_STALL_SEC` | 120 | 停滞判定秒数 |
| `KIMI_BIN` | 自动解析 | kimi 可执行文件路径 |

## 成功标准

1. 陈旧实例文件（PID 已死 / 心跳过期）存在时，端口探测仍返回其 URL 且文件**不被修改或删除**。
2. 单轮 poll 超时且 session 存活时自动进入下一轮；最大轮数可配置；离线时仍按原退出码（2/3/4）退出。
3. 冷启动（无实例文件 + 端口不可达）：tunnel 自动 spawn 成功后 wire 连接成功；并发激活仅产生一个 `kimi web` 进程。
4. 模似模型超时：poll 自动发送"继续"，累计不超过 3 次；3 次后输出 `[POLL_BLOCKED]`、写标记文件、exit 5。
5. 模似读图阻塞：poll 不发送"继续"，直接写标记文件（含"session 已阻塞需另起"）并 exit 5。
6. 已完成回合的正常短回复不触发任何诊断。
7. 全量单测（含既有 30+ 用例）通过，无回归。

## 验收标准（可测口径）

- 单测：`server-lock` 对陈旧 PID/心跳文件返回 URL 且无 unlink 调用。
- 单测：`server-spawner` mock 化覆盖 4 路径（探测短路 / EEXIST 等待 / 成功激活 / 失败清理 spawn.lock）。
- 单测：`poll-command` 新参数（`max_rounds`）生成正确；`diagnose_blocked` 对 4 种 fixture（error / image / timeout / 正常短回复）判定正确。
- 集成（手工一次）：`node dist/index.js` 在无 server 状态下启动 → 自动拉起 kimi web → 日志出现 Connected。

## 假设

- `~/.kimi-code/bin/kimi` 在 Windows 上为可直接执行的 PE 可执行文件（已实测确认，spawn 无需 shell 包装）。
- 日志中"模型超时"无显式标记（实测 finishReason 仅 `tool_use`/`end_turn`），须用停滞 + 无产出启发式判定，存在误判可能；"读图阻塞"以 image 关键特征 + 停滞双条件降低误报。
- 实例文件缺失时端口不可知（0.38.0 端口动态），poll 脚本不负责启动 server，交由 tunnel 激活流程。

## 排除范围

- 运行中 server 崩溃的自动重启（仅启动时激活）。
- poll 脚本不引入配置文件（阈值仅走环境变量）。
- 不改动 wire-client 的连接/重连核心逻辑（`connect()` 已支持每次重新检测 URL）。

## 引用

- 现有代码：`src/server-lock.ts`、`src/poll-command.ts`、`src/index.ts`、`src/tools/execute-prompt.ts`
- 参照状态机：`agent-session-monitor` skill（日志尾部状态推断，优先级 awaiting_approval > done > swarm > active > error > idle）