# MemoryStore 初始化时机缺陷

**状态**: 已修复 (2026-07-08)  
**修复方式**: 方案 1（index.ts 启动时主动初始化）+ 方案 2（requireDb() 错误消息区分两种失败原因）  
**修复 commit**: 待提交  
**发现日期**: 2026-07-08  
**严重度**: P0（功能阻断）  
**影响范围**: 全部 6 个记忆管理 MCP 工具

---

## 问题概述

`MemoryStore` 在 `index.ts` 启动时只创建对象，不调用 `ensureDb()`。DB 的实际初始化被延迟到三个会话类工具（`create_session` / `execute_prompt` / `chat_with_session`）中——这导致 6 个纯记忆管理工具在没有任何会话工具被调用的前提下**完全不可用**。

---

## 根因

### 初始化路径不对称

```
会话类工具（有 cwd 参数）           记忆管理工具（无 cwd）
─────────────────────────          ─────────────────────
create_session                     memory_status
execute_prompt                     memory_list
chat_with_session                  memory_get
    │                              memory_set
    ├─ resolveProjectRoot(cwd)     memory_delete
    ├─ ensureDb(projectRoot)       memory_archive
    └─ ✅ DB 已打开                    │
                                       ├─ requireDb()
                                       └─ ❌ throw: "未初始化"
```

**关键代码路径**：

- `src/index.ts:21` — `new MemoryStore()` 创建对象，**不调用** `ensureDb()`
- `src/memory-store.ts:88-92` — `requireDb()` 仅检查 `this.db !== null`，无自愈逻辑
- `src/memory-store.ts:25` — `ensureDb()` 只在三个会话工具中被调用（见下文）

### 三个初始化入口（均不在管理工具中）

| 文件 | 行号 | 触发条件 |
|------|------|---------|
| `src/tools/create-session.ts` | 91 | `memory_level !== "off"` 且项目有 `.kimi-tunnel/` |
| `src/tools/execute-prompt.ts` | 91 | 同上 |
| `src/tools/chat-with-session.ts` | 46 | 同上 |

---

## 具体问题清单

### P0-1: 记忆管理工具无法独立使用

**现象**：Tunnel 启动后直接调用 `memory_status` / `memory_set` / `memory_get` 等任一工具，均抛出：  
> "知识库未初始化。在项目根目录创建 .kimi-tunnel/ 目录以启用共享内存功能。"

**复现步骤**：
1. 启动 Tunnel（`npm start`）
2. 调用 `memory_status` → ❌ 失败
3. 调用 `memory_set` → ❌ 失败
4. 必须先调用 `create_session(cwd=项目路径, memory_level=standard)` → ✅
5. 再次调用 `memory_status` → ✅ 成功

**影响**：PM 无法在创建任何任务 session 之前查看/管理知识库——而按 coordinator-guide 规范，PM 应**先侦察再开工**，其中包括检查已有知识库。

### P0-2: 错误消息误导

**文件**: `src/memory-store.ts:88-92`

```typescript
private requireDb(): DatabaseSync {
  if (!this.db) {
    throw new Error(
      "知识库未初始化。在项目根目录创建 .kimi-tunnel/ 目录以启用共享内存功能。"
    );
  }
  return this.db;
}
```

**问题**：此消息无法区分两种完全不同的失败原因：
- **情况 A**：`.kimi-tunnel/` 目录确实不存在 → 消息正确
- **情况 B**：目录存在但 `ensureDb()` 从未被调用 → 消息错误，用户会困惑"明明创建了为什么还提示创建"

### P1-3: 启动时无自动初始化

**文件**: `src/index.ts:21`

```typescript
const memoryStore = new MemoryStore();
// ❌ 缺少: memoryStore.ensureDb(projectRoot)
```

`MemoryStore.resolveProjectRoot(process.cwd())` 可以在启动时确定项目根目录，但未被调用。

### P1-4: 记忆工具缺少 fallback 自愈

6 个记忆管理工具（`memory_status` / `memory_list` / `memory_get` / `memory_set` / `memory_delete` / `memory_archive`）的实现模式一致：

```typescript
// 例如 src/tools/memory-status.ts
if (!memoryStore) {
  return { content: [...], isError: true };  // 仅检查对象是否为 null
}
// ❌ 未调用 ensureDb() — 假设 DB 已打开
try {
  const status = memoryStore.status();  // → requireDb() → throw
}
```

所有工具都没有 `cwd` 参数，无法自行调用 `resolveProjectRoot` + `ensureDb`。

---

## 影响评估

| 维度 | 说明 |
|------|------|
| **功能完整性** | 记忆系统名义上已实现 8 个 MCP 工具，但 6 个管理工具在首次使用前处于不可用状态 |
| **用户体验** | PM 必须先创建 dummy session 才能查看知识库——违反了 coordinator-guide §1.1 的"先侦察再开工"原则 |
| **错误诊断** | 统一的错误消息导致用户在两种不同失败场景下收到相同提示，排查困难 |
| **架构一致性** | 违反项目 DI 原则——记忆工具隐式依赖会话工具的初始化 side effect |

---

## 修复方案

### 方案 1: 启动时主动初始化（推荐）

在 `src/index.ts` 中，`MemoryStore` 创建后立即调用 `ensureDb()`：

```typescript
const memoryStore = new MemoryStore();

// 新增: 启动时主动初始化
const projectRoot = memoryStore.resolveProjectRoot(process.cwd());
if (projectRoot) {
  memoryStore.ensureDb(projectRoot);
  process.stderr.write(`[kimi-session-orchestrator] Memory DB: ${projectRoot}/.kimi-tunnel/memory.db\n`);
} else {
  process.stderr.write("[kimi-session-orchestrator] Memory DB: .kimi-tunnel/ not found, deferred\n");
}
```

**优点**：
- 最小侵入，仅改 `index.ts` 一处
- 启动后所有记忆工具立即可用
- 不改变现有工具的接口签名

**注意**：Tunnel 必须在项目根目录启动（当前已是如此——用户从 `D:/code/kimi-debug-tunnel` 运行 `npm start`）

### 方案 2: 改进 requireDb() 错误消息

```typescript
private requireDb(): DatabaseSync {
  if (!this.db) {
    const hasTunnelDir = this.projectRoot 
      ? existsSync(join(this.projectRoot, ".kimi-tunnel"))
      : false;
    throw new Error(
      hasTunnelDir
        ? "知识库 DB 未打开。请先通过 create_session / execute_prompt 触发初始化，或重启 Tunnel。"
        : "知识库未初始化。在项目根目录创建 .kimi-tunnel/ 目录以启用共享内存功能。"
    );
  }
  return this.db;
}
```

### 方案 3: 管理工具增加 fallback（可选的补充）

在 `memory_set` / `memory_get` 等工具中增加：

```typescript
// 在 try 块前增加 fallback
if (!memoryStore.isReady()) {  // 需新增 isReady() 方法
  const root = memoryStore.resolveProjectRoot(process.cwd());
  if (root) memoryStore.ensureDb(root);
}
```

但此方案需在所有 6 个工具中重复相同逻辑，不如方案 1 集中处理。

---

## 建议实施顺序

1. **P0** — 方案 1：`index.ts` 启动时主动初始化
2. **P1** — 方案 2：改进 `requireDb()` 错误消息
3. **P2** — 方案 3 可选，取决于是否需要额外的健壮性

---

## 参考

- SPEC 002: `specs/002-session-memory-share/` — 三层共享内存架构规格
- `docs/coordinator-guide.md` §1.1 — 前置侦察规范
- `src/memory-store.ts` — MemoryStore 实现
- `src/index.ts` — 启动入口
