# Research: 任务 Session 冷启动记忆共享

**Feature**: `002-session-memory-share`
**Date**: 2026-07-07
**Status**: Complete

---

## 1. Storage Engine

**Decision**: `node:sqlite` (built-in, Node 22+)

**Rationale**:
- Node v24.18.0 内置 `node:sqlite` 模块，零 npm 依赖
- SQLite 单文件存储，天然适合项目本地知识库（`.kimi-tunnel/memory.db`）
- 支持参数化查询，防止 SQL 注入
- 写入性能满足 SC-4（1000 条记录，查询 <500ms）— SQLite 在本地 SSD 上 1000 行查询 <1ms

**Alternatives considered**:
| Option | Pros | Cons | Verdict |
|--------|------|------|:--:|
| `better-sqlite3` | 成熟、同步 API、高性能 | 需要 native 编译、额外依赖 | ❌ 有内置方案 |
| JSON 文件 | 零依赖、可读 | 无查询、并发写不安全、大文件性能差 | ❌ |
| 复用 memory MCP (JSONL) | 已有基础设施 | 非项目级隔离、JSONL 不支持结构化查询 | ❌ |

---

## 2. Memory Injection Mechanism

**Decision**: 在 `execute_prompt` 和 `chat_with_session` 中，检查 session 是否绑定了 memory profile，若有则在用户 prompt 前拼接结构化前缀。

**Rationale**:
- `create_session` 仅创建 session 不发送任务，注入延迟到首次 `execute_prompt`
- 若 `create_session` 增加了 `task` 参数（首个 prompt），则在创建时一并进行注入
- 注入内容以 Markdown 区块格式嵌入，对 AI 友好且可读

**Injection format**:
```markdown
> [系统注入] 以下为项目共享知识，由 PM 预先录入。请基于此上下文工作。

## 项目背景
{project/meta 内容}

## 相关决策
{project/decisions 匹配内容}

## 已知风险
{project/risks 匹配内容}

## 前置结论
{退役 session handoff 内容}

---
{用户原始 prompt}
```

**Alternatives considered**:
| Option | Pros | Cons | Verdict |
|--------|------|------|:--:|
| 系统消息 (role:system) | 标准协议 | Kimi Server prompt API 不支持 system role | ❌ |
| 单独的 memory context 参数 | 解耦 | 增加工具复杂度，用户困惑 | ❌ |
| 拼接在 prompt 尾部 | 简单 | AI 可能忽略尾部上下文 | ❌ |

---

## 3. Project Namespace Isolation

**Decision**: 以 `cwd` 的规范化路径作为项目标识符，SQLite 表 `entries` 中 `project_id` 列存储。`.kimi-tunnel/memory.db` 存放在项目根目录（`cwd`）。

**Rationale**:
- 不同项目的 `cwd` 天然不同，物理隔离
- 不依赖 session 信息（session 属于 Kimi Code 全局，不绑定项目）
- `create_session` 必传 `cwd`，可从中解析项目根目录

**Mapping**: `cwd` → 查找最近的 `.kimi-tunnel/memory.db`（向上遍历目录树至根）

---

## 4. Permission Model

**Decision**: 条目级 `source_session_id` 字段追踪写入者。PM session 通过调用 `memory_set` 自动成为写入者。任务 session 对 L1 (`project/*`) 只读。

**Implementation**:
- `memory_set`: 记录 `source_session_id` = 当前调用者的 MCP session（无法直接获取，改用可选 `session_id` 参数由 AI 传入）
- 实际简化：由于 kimi-debug-tunnel MCP 工具由统筹 session 调用，所有 memory_* 调用天然来自 PM，无需额外鉴权
- 任务 session 无 MCP 工具访问权限，天然无法调用 memory_set
- `memory_delete`: 增加 `force` 参数，默认 false 时仅允许删除自己创建的条目

---

## 5. Session Retirement Hook

**Decision**: 暂不实现自动退役归档（FR-5）。当前版本仅提供手动 `memory_archive` 工具。

**Rationale**:
- 自动退役需要感知 session 关闭事件，当前 Kimi Server 无可靠 close hook
- 手动归档更安全（PM 审查后再归档）
- FR-5.3 的 L3 向量库已由 `learn` skill 独立处理

---

## 6. Key Design Decisions Summary

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | `node:sqlite` 存储 | 零依赖，Node 24 内置 |
| D2 | prompt 前缀注入 | 对 AI 最友好的上下文传递方式 |
| D3 | cwd 向上查找 `.kimi-tunnel/` | 天然项目隔离 |
| D4 | 无自动退役 | 缺可靠 close hook，手动更安全 |
| D5 | 注入上限 8K，超量折叠 | 保护上下文窗口，按需展开 |
