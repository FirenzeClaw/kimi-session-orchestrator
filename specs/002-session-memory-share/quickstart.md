# Quickstart: 任务 Session 冷启动记忆共享

**Feature**: `002-session-memory-share`
**Date**: 2026-07-07

---

## 30 秒快速体验

```bash
# 1. PM 录入项目知识（一次性）
#    在你的 kimi-code 统筹 session 中调用：

memory_set(namespace="project/meta", key="tech_stack",
  value="TypeScript 5.6, Node 24, Express 4, MCP SDK 1.12")

memory_set(namespace="project/meta", key="coding_conventions",
  value="DI via TunnelServices, 深模块优先, Guard Clauses ≤ 3 层")

memory_set(namespace="project/decisions", key="use_sqlite",
  value="使用 node:sqlite 内置模块存储共享内存，零额外依赖")

# 2. 创建任务 session（自动注入）
create_session(cwd="D:/code/kimi-debug-tunnel", memory_level="standard")
  → session 启动即具备项目背景，零重读

# 3. 执行任务
execute_prompt(session_id="...", prompt="审查 src/types.ts 的类型定义")
  → AI 不需要先理解 DI/深模块/Guard Clauses 约定
  → 直接进入审查工作
```

---

## 典型工作流

### 场景 A：审查任务

```
PM:
  memory_set("project/specs", "phase5", "Phase 5 要求: ...")
  create_session(cwd, memory_level="full")
  execute_prompt(sid, "审查 src/workflow-engine.ts 是否符合 Phase 5 规范")

Task Session (审查者):
  启动时自动获得: 技术栈 + 编码约定 + Phase 5 规范摘要
  → 直接开始逐行审查，不用先读 spec 文件
```

### 场景 B：修复任务（接续审查）

```
PM:
  memory_archive("审查 session ID")
  create_session(cwd, from_session="审查 session ID")
  execute_prompt(sid, "修复审查发现的 3 个问题")

Task Session (修复者):
  启动时自动获得: 项目背景 + 审查结论摘要
  → 精确知道"改什么"，零上下文浪费
```

### 场景 C：更新过期知识

```
PM:
  memory_set("project/specs", "phase5", "Phase 5 已更新为 v2: ...")
  # version 自动递增到 2
  memory_status()
  # 看到 project/specs/phase5 expired=0, version=2
  
  下次 create_session → 自动注入最新版本
```

---

## 命令速查

| 命令 | 用途 |
|------|------|
| `memory_set ns key val` | 录入/更新知识 |
| `memory_get ns [key]` | 读取知识 |
| `memory_list [ns]` | 浏览命名空间 |
| `memory_delete ns key` | 删除条目 |
| `memory_status` | 知识库概览 |
| `memory_archive sid` | 归档 session 发现 |
| `create_session ... memory_level=full` | 创建全量注入 session |

---

## 注入级别对照

| Level | 注入内容 | 预估 Token |
|:------|------|:--:|
| `off` | 无注入 | 0 |
| `minimal` | project/meta | ~500 |
| `standard` (默认) | meta + decisions | ~1.5K |
| `full` | meta + decisions + risks + learnings | ~3K |
| + `from_session` | 以上 + 前置 session handoff | +~1K |

> 注入上限 8K tokens，超量自动截断。Session 可通过 `memory_get` 按需读取详细内容。

---

## 文件位置

```
<project_root>/
└── .kimi-tunnel/
    ├── memory.db          ← SQLite 知识库
    └── policies/          ← 权限策略（SPEC 003，已有）
```
