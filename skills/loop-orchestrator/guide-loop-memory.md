# Memory 集成规范

> 加载条件：阶段 0 和阶段 5 时 Read。Loop 全程读写的 memory 操作映射。

---

## §1 各阶段 Memory 操作

| 阶段 | 操作 | 内容 |
|------|------|------|
| 0 启动 | `memory_get(namespace="project/meta")` | 项目技术栈/规范/约定 |
| 0 启动 | `memory_get(namespace="project/learnings")` | 过往 session 沉淀经验 |
| 1 拆解 | `memory_set(namespace="session/loop-<id>", key="plan", value="<plan JSON>")` | 工作包拆解方案 |
| 2 每轮完成 | `memory_set(namespace="session/<sid>", key="findings", value="<findings JSON>")` | 关键发现/FAIL 项/修复记录 |
| 3 阻塞 | `memory_set(namespace="session/loop-<id>", key="blockages", value="<blockage JSON>")` | 阻塞原因+诊断结果 |
| 4 里程碑 | `memory_set(namespace="session/loop-<id>", key="milestones", value="<milestones JSON>")` | 完成模块+PASS/FAIL 统计 |
| 5 交付 | `memory_archive(session_id)` | L2 findings → L1 learnings |

## §2 命名空间约定

- `loop-id = loop-<ISO timestamp>`（如 `loop-2026-07-15T120000Z`）
- Loop 级数据写入 `session/loop-<loop-id>/` 前缀
- Task session 级数据写入 `session/<sid>/findings`
- 知识库级数据读写 `project/meta`、`project/learnings`

## §3 注意事项

- `memory_set` 仅接受 `project/` 或 `session/` 前缀（代码强制）
- `memory_get` namespace 无前缀限制（可读取任意 namespace）
- **⛔ MCP 工具去歧义**：task session 通过 `create_session` 的 `memory_level` 自动注入时会带 kimi-session-orchestrator 前缀。若 PM 手工在 prompt 中写 `memory_get`，必须加前缀说明，否则 session 可能调错 MCP 服务器（`memory` 知识图谱 vs `kimi-session-orchestrator`）
- 写入 `session/<sid>/findings` 后，交付时通过 `memory_archive(sid)` 自动提升为 `project/learnings`
