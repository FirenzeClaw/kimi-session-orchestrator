# [FIXED] MCP 进程在 Kimi Server 离线时假死

## 表现

Kimi Server 离线时 `/reload`，MCP server 进程 30s 超时，Kimi Code CLI 报告 "Timed out after 30000ms"。所有 MCP 工具不可用（"Not connected"）。

stderr 日志：
```
[wire-client] Connection attempt 1/6 failed: ECONNREFUSED 127.0.0.1:5494
...
MCP server "kimi-session-orchestrator" failed: Timed out after 30000ms
```

## 根因

`src/index.ts` 中 `await wireClient.connect()` 在 `startMcpServer()` **之前**执行。connect() 的 6 次指数退避重试耗时 ~63s，期间 MCP stdio transport 尚未建立。Kimi Code CLI 在 30s 内未收到 `tools/list` 响应 → 判定进程失败。

## 修复（2026-07-15）

1. `startMcpServer()` 移至 `wireClient.connect()` **之前**——stdio 立即就绪，响应 `tools/list` 不受 wire 状态影响
2. `connect()` 改为 `.then().catch()` 后台异步——连接成功/失败不阻塞 MCP 生命周期
3. wire 离线时，工具调用返回 `"Wire client 未连接"` 而非进程崩溃

## 相关

- 此修复后，P2 级平台限制（MCP 工具 schema 会话级冻结）仍存在——`/reload` 后新工具不出现于当前 PM session，需新 session 才能看到
