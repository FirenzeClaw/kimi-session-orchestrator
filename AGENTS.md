<!--
修改记录:
  2026-07-06 | kimi-code (architecture) | 架构深化（6/6 项）：① 消除 9 文件 584 行死代码 ② 拆分 session-manager 为 store+reader（576→72 行） ③ 消除 3 个单例为 DI（wireClient/messageQueue/startTime） ④ WireClient 拆分跳过（收益边际） ⑤ 激活 TunnelServices DI ⑥ 统一路由/WS 模式（保持内联）
  2026-07-06 | kimi-code (feature) | 新增 poll_session 工具：结构化轮询 session 运行状态，替代后台 bash 监控
  2026-07-06 | kimi-code (feature) | 新增 create_session 工具：通过 REST API 创建新 session，支持权限模式 auto/manual/yolo
  2026-07-06 | kimi-code (feature) | execute_prompt / chat_with_session 新增 wait 参数（默认 false）：即发即返不阻塞；新增 submitPrompt 快通道
  2026-07-06 | kimi-code (feature) | execute_prompt / chat_with_session 新增 auto_mode 参数：自动通过 API 审批所有工具调用
  2026-07-06 | kimi-code (polish) | 工具质量提升：readSessionLog 分页修复、tool_call 截断、get_session_info 含 wirePath、超时诊断提示
  2026-07-06 | kimi-code (feature) | 新增 list_io_records 工具
  2026-07-06 | kimi-code (bugfix) | 修复 EADDRINUSE 多 session 冲突
  2026-07-05 | kimi-code (project-init) | 初始生成
-->

<!-- AUTO:PROJECT-META -->
## 项目元信息

- **项目**: kimi-debug-tunnel
- **仓库**: https://github.com/FirenzeClaw/kimi-debug-tunnel.git
- **分支**: master
- **技术栈**: TypeScript 5.6, Node.js ≥ 18, Express 4, WebSocket (ws), MCP SDK 1.12, Zod 3
- **类型**: MCP 服务器 + HTTP/WebSocket 调试隧道
- **初始化时间**: 2026-07-05T16:11:30Z
<!-- AUTO:END -->

<!-- AUTO:STRUCTURE -->
## 目录结构

```
src/
├── index.ts                 # 入口：创建 TunnelServices，启动 HTTP+MCP 双服务器
├── types.ts                 # TunnelServices 接口（wireClient, messageQueue, startTime）
├── mcp-server.ts            # MCP stdio 服务器，注册全部 10 个工具
├── http-server.ts           # Express + WebSocket 装配入口（薄层）
├── wire-client.ts           # Kimi Server REST API 客户端
├── message-queue.ts         # WebSocket 客户端管理 + 响应广播
├── session-manager.ts       # Session 管理（枚举、日志解析、IO提取、状态轮询）
├── session-orchestrator.ts  # 多轮任务编排引擎
├── tools/
│   ├── execute-prompt.ts    # 发送 prompt 并等待完整回复
│   ├── create-session.ts    # 通过 REST API 创建新 session
│   ├── chat-with-session.ts # 全自动多轮编排
│   ├── stream-response.ts   # 实时推送到所有 WebSocket 客户端
│   ├── list-sessions.ts     # 列出所有 session
│   ├── get-session-info.ts  # 查看 session 详情
│   ├── read-session-log.ts  # 读取对话日志
│   ├── list-io-records.ts   # 快速查看输入输出记录（仅 prompt+回复）
│   ├── poll-session.ts      # 结构化轮询 session 运行状态
│   └── get-tunnel-status.ts # Wire 连接状态、客户端数、运行时间
└── public/
    └── console.html          # Web 调试控制台
```
<!-- AUTO:END -->

<!-- AUTO:BUILD -->
## 构建与运行

```bash
npm install          # 安装依赖
npm run build        # tsc 编译 + 复制静态文件到 dist/
npm start            # node dist/index.js（需先 build 且 Kimi Server 运行中）
npm run dev          # tsc --watch
npm run inspector    # MCP Inspector 调试模式
```

**前置条件**：
1. 启动 Kimi Server: `kimi web --no-open --port 5494`
2. 设置 token: `export KIMI_SERVER_TOKEN="<printed-at-startup>"`
3. 启动 Tunnel: `npm start`
<!-- AUTO:END -->

## 项目约定

<!-- AUTO:CONVENTIONS -->
### 架构原则

- **依赖注入**: 所有模块通过 `TunnelServices` 接口接收依赖，禁止模块级 `export const` 单例
- **深模块优先**: 每个模块遵循"小接口、大实现"原则 —— 接口复杂度 < 实现复杂度
- **接缝验证**: 每个抽象至少要有两个适配器（生产运行时 + 测试 mock），否则视为假设接缝
- **单一职责**: 每个文件只做一件事（Transport 只管 HTTP、ContentProcessor 只管文本处理）

### 编码风格

- 函数命名：动词短语（`extractText`, `findById`）
- 类型优先：所有函数签名显式标注返回类型，禁止 `any`
- Guard Clauses 优先，嵌套 ≤ 3 层
- 注释只写 why，不写 how
- TypeScript strict 模式，ES2022 target，Node16 模块

### 模块分层

```
入口层:    index.ts（创建服务容器、装配、启动）
传输层:    http-server.ts, mcp-server.ts
工具层:    tools/*（MCP 工具注册）
业务层:    wire-client.ts, session-orchestrator.ts, session-manager.ts
数据层:    message-queue.ts
类型层:    types.ts
```
<!-- AUTO:END -->

## 标准工作流

全自动 session 编排的标准流程（所有工具 `wait` 默认 `false`，即发即返）：

```
① create_session(cwd, permission_mode="auto")
   → { session_id: "session_xxx" }

② chat_with_session(session_id, task, auto_mode=true)
   → { submitted: true, hint: "用 poll_session 跟踪" }

③ poll_session(session_id)          ← 每 10-30s 轮询一次
   → { state: "active", totalLines: 156, complete: false }

④ poll_session(session_id)
   → { state: "done", complete: true }    ← 工作流完成

⑤ list_io_records(session_id)       ← 查看对话摘要
```

### 状态含义

| state | 含义 | 处理 |
|-------|------|------|
| `active` | 正常执行工具调用 | 继续轮询 |
| `swarm` | 并行子代理调度中 | 继续轮询 |
| `awaiting_approval` | 等待人工审批 | 检查 auto_mode |
| `done` | turn 完成 (end_turn) | 工作流结束 |
| `error` | 检测到错误 | 查看 log |
| `idle` | 空闲等待中 | 可能卡住 |
