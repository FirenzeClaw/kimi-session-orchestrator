# Data Model: 任务 Session 冷启动记忆共享

**Feature**: `002-session-memory-share`
**Date**: 2026-07-07
**Status**: Complete

---

## 1. Entity-Relationship

```
┌─────────────────┐       ┌─────────────────┐
│   MemoryEntry   │──────>│   Namespace     │ (logical, not a table)
│                 │       │                 │
│  id (PK)        │       │  path: string   │
│  namespace      │       │  level: L1|L2   │
│  key            │       │                 │
│  value          │       └─────────────────┘
│  created_at     │
│  updated_at     │       ┌─────────────────┐
│  source_session │       │ InjectionProfile│ (runtime, not persisted)
│  version        │       │                 │
│  expired        │       │  level: minimal │
│  project_id     │       │       |standard │
└─────────────────┘       │       |full     │
                          │  namespaces[]   │
                          │  maxBytes       │
                          └─────────────────┘
```

---

## 2. SQLite Schema

```sql
-- 项目元信息表
CREATE TABLE IF NOT EXISTS project_meta (
    project_id TEXT PRIMARY KEY,
    project_root TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 内存条目表
CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    namespace TEXT NOT NULL,           -- e.g. "project/meta", "session/abc123/findings"
    key TEXT NOT NULL,                 -- 条目键名
    value TEXT NOT NULL,               -- JSON 字符串值
    source_session_id TEXT,            -- 写入者的 session ID
    version INTEGER NOT NULL DEFAULT 1,
    expired INTEGER NOT NULL DEFAULT 0, -- 0=有效, 1=已过期
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    project_id TEXT NOT NULL,
    UNIQUE(project_id, namespace, key),
    FOREIGN KEY (project_id) REFERENCES project_meta(project_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_entries_namespace ON entries(project_id, namespace);
CREATE INDEX IF NOT EXISTS idx_entries_updated ON entries(project_id, updated_at);
```

---

## 3. TypeScript Types

```typescript
// === Core Entity ===

interface MemoryEntry {
  id: number;
  namespace: string;          // e.g. "project/meta"
  key: string;                // e.g. "tech_stack"
  value: string;              // JSON string
  sourceSessionId: string | null;
  version: number;
  expired: boolean;
  createdAt: string;          // ISO 8601
  updatedAt: string;
  projectId: string;
}

// === MCP Tool Parameters ===

interface MemorySetParams {
  namespace: string;          // "project/meta", "session/<id>/findings"
  key: string;
  value: string;              // arbitrary string (AI writes structured content)
  session_id?: string;        // source session ID (for tracking)
}

interface MemoryGetParams {
  namespace: string;
  key?: string;               // omit to get all entries in namespace
  include_expired?: boolean;
}

interface MemoryListParams {
  namespace?: string;         // prefix match; omit for root listing
}

interface MemoryDeleteParams {
  namespace: string;
  key: string;
}

interface MemoryStatusParams {}  // no params, returns project-level stats

interface MemoryArchiveParams {
  session_id: string;         // source session to archive
  target_namespace?: string;  // default: "project/learnings"
}

// === Injection Profile ===

interface InjectionProfile {
  level: "minimal" | "standard" | "full";
  maxBytes: number;           // default 8192
}

// level mapping:
// minimal → ["project/meta"]
// standard → ["project/meta", "project/decisions"]
// full → ["project/meta", "project/decisions", "project/risks", "project/learnings"]
// handoff → added when `from_session` is specified in create_session
```

---

## 4. Namespace Convention

| Namespace | Level | Description | Read/Write |
|-----------|:-----:|-------------|:----------:|
| `project/meta` | L1 | 项目根信息（技术栈、编码约定、目录结构） | PM: RW |
| `project/decisions` | L1 | 架构决策记录 | PM: RW |
| `project/risks` | L1 | 已知风险和注意事项 | PM: RW |
| `project/learnings` | L1 | 退役 session 归档的经验 | PM: RW |
| `session/<id>/findings` | L2 | Session 运行中的发现 | PM: RW, Task: W |
| `session/<id>/handoff` | L2 | Session 退役交接信息 | PM: RW |
| `session/<id>/context` | L2 | Session 自定义上下文 | PM: RW |

---

## 5. State Transitions

```
Entry lifecycle:
  created → [active] → expired → [archived to learnings]
  
Expired detection rules:
  - PM marks entry expired via memory_set(expire=true) → sets expired=1 in DB
  - create_session queries: SELECT WHERE expired=0 (default), expired=1 only when include_expired=true
  - If any injected entry has expired=1, injection prefix gets ⚠️ warning
  - Expired entries are excluded from injection (unless fromSession handoff explicitly needed)
  
Injection flow:
  create_session(cwd, memory_level="standard")
    → resolveProjectRoot(cwd) → find .kimi-tunnel/memory.db
    → open db → query entries by level
    → build injection string (max 8K, "…(truncated, use memory_get for details)")
    → prepend to first prompt

Session retirement (manual):
  memory_archive(session_id)
    → read session/<id>/findings
    → PM reviews → merge into project/learnings
    → mark session entries as expired
```

---

## 6. Validation Rules

| Rule | Scope | Error |
|------|-------|-------|
| namespace 必须以 `project/` 或 `session/` 开头 | `memory_set` | "命名空间必须以 project/ 或 session/ 开头" |
| key 不能为空或含 `/` | `memory_set` | "key 不能为空或包含 /" |
| value 不能为空 | `memory_set` | "value 不能为空" |
| session namespace 的 key 必须以有效 session_id 开头 | `memory_set` | "session 命名空间格式: session/<id>/..." |
| key 已存在 → 覆盖（upsert） | `memory_set` | 自动递增 version |
| 数据库不存在 → 自动创建 | all | 透明处理 |
| 注入超过 maxBytes → 截断 + 提示 | `execute_prompt` | "…(truncated, N entries omitted)" |
