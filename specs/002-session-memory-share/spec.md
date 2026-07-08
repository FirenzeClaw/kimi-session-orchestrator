# 任务 Session 冷启动记忆共享

**Feature**: `002-session-memory-share`
**Created**: 2026-07-07
**Status**: Implemented (2026-07-08)
**Parent**: kimi-debug-tunnel v2.4

---

## 问题陈述

当前统筹 Session（PM）在全流程中存在严重的上下文重复浪费：

1. **PM 研究不可复用**：PM 在拆解任务前需阅读 spec、data-model、AGENTS.md 等规范文件以建立项目理解，但每个新建的任务 session 启动后**又需重新阅读这些文件**才能开始工作——每 session 浪费 25-40K 上下文
2. **跨 Session 信息传递靠 PM 手转**：Session A 的审查发现需由 PM 人工提取后写入 Session B 的 prompt，当并行 session 数增加时 PM 成为信息瓶颈
3. **退役知识随 session 消失**：有价值的研究发现、调试经验、设计决策随 session 关闭而丢失，除非 PM 手动归档

**量化影响**（以 360K 上下文窗口为基线）：

| 场景 | 当前浪费 | 占窗口比例 |
|------|----------|:--:|
| 审查 session 冷启动（重读 spec） | ~30K | 8.3% |
| 修复 session 冷启动（重读 spec） | ~25K | 6.9% |
| 5 个并行 session 总浪费 | ~150K | 41.7% |
| PM 手转审查结论到修复 session | ~5K/次 + PM token 消耗 | — |

---

## 解决方案

构建**多层级共享内存系统**——PM 研究成果结构化存入项目级知识库，任务 session 启动时零成本注入而不是重读原始文件。形成"研究一次，N 次复用"的知识流通闭环。

### 三层内存架构

```
┌─────────────────────────────────────────────────┐
│ L1: 项目知识库 (project/*)                       │
│ PM 一次性录入，全局只读，长期有效                   │
│ meta / specs / decisions / risks / learnings     │
├─────────────────────────────────────────────────┤
│ L2: Session 上下文 (session:<id>/*)              │
│ 创建时写入，运行时更新，退役后归档                   │
│ context / findings / handoff                    │
├─────────────────────────────────────────────────┤
│ L3: 学习沉淀 (learn skill → 向量库)               │
│ 从 L1+L2 中提取可复用模式，跨项目生效               │
└─────────────────────────────────────────────────┘
```

### 一次完整流程

```
① PM 研究阶段（一次性）
   PM 阅读 spec/AGENTS.md → 结构化录入 L1 项目知识库
   memory_set(ns="project/meta")    → 项目根信息
   memory_set(ns="project/specs")   → 各 Phase 摘要
   memory_set(ns="project/decisions") → 架构决策
   memory_set(ns="project/risks")   → 已知风险

② Session 创建（自动注入）
   create_session → 从 L1 拉取必读上下文 → 拼接为首条 prompt 前缀
   → session 启动即具备完整项目理解 → 直接进入工作，零重读

③ Session 运行（选择性读写）
   session 可通过 MCP 工具读取 L1/L2 信息（填补细节）
   有写入权限的 session 可将发现写入 L2 findings

④ Session 退役（知识归档）
   findings 归档为 L1 learnings（PM 审查后）
   handoff 存入 L2 供接续 session 读取
   learn skill 从 L1+L2 提取模式 → L3 向量库
```

---

## 用户故事

1. **作为项目经理（PM）**，我希望能将项目规范、架构决策等研究成果一次性录入系统，后续创建的每个任务 session 自动具备这些知识，不用我在每个 prompt 里重复描述项目背景
2. **作为项目经理（PM）**，我希望能查看和编辑项目知识库的内容，确保所有任务 session 使用的是最新的、经过我审查的信息
3. **作为任务 session（审查者）**，我希望启动时直接获得项目背景和审查目标，而不是先花 3-4 轮读取 spec 和源码才能开始实际审查
4. **作为任务 session（修复者）**，我希望启动时直接获得前置审查 session 的结论摘要，精确知道"改什么"，而不是重新理解整个项目的上下文
5. **作为项目经理（PM）**，当项目规范更新时，我希望能标记知识库条目为"已过期"，下次 session 创建时自动提示我刷新

---

## 功能需求

### FR-1：共享内存 CRUD

- FR-1.1：新增 `memory_set` 工具——写入一条键值对到指定命名空间，自动记录写入时间和来源 session
- FR-1.2：新增 `memory_get` 工具——读取指定命名空间下的单条或全部条目，支持按最后更新时间过滤
- FR-1.3：新增 `memory_list` 工具——列出指定命名空间下所有键名，不含值体，用于快速浏览
- FR-1.4：新增 `memory_delete` 工具——删除指定键，仅 PM 或写入者有权删除
- FR-1.5：命名空间采用层级路径格式（如 `project/specs/phase3`），支持前缀匹配查询

### FR-2：Session 冷启动自动注入

- FR-2.1：`create_session` 创建时自动从 `project/meta` 拉取项目根信息（cwd、技术栈、编码约定）
- FR-2.2：自动从 `project/decisions` 拉取全部架构决策条目（MVP 阶段全量拉取；后续版本可增加关键词匹配过滤以节省 token）
- FR-2.3：若通过 `create_session` 的 `from_session` 参数指定了前置 session，自动从该 session 的 `handoff` 命名空间拉取交接信息
- FR-2.4：注入内容拼接为结构化 prompt 前缀，在用户指定的 prompt 之前注入，格式为明确的区块："【项目背景】【相关决策】【已知风险】【前置结论】"
- FR-2.5：注入量可根据 `create_session` 新参数 `memory_level` 控制：`minimal`（仅 meta）、`standard`（meta+decisions）、`full`（全部匹配内容）

### FR-3：知识库版本与新鲜度

- FR-3.1：`project/meta` 条目维护版本号，PM 更新时递增
- FR-3.2：`create_session` 时检查注入条目的 `expired` 标志（由 PM 通过 `memory_set` 主动标记），若有过期条目则在注入前缀中附带 `⚠️ 以下条目可能已过期` 警告标记
- FR-3.3：新增 `memory_status` 工具——PM 查看知识库整体状态：条目数、最后更新时间、过期条目列表

### FR-4：权限与隔离

- FR-4.1：PM（统筹 session）拥有 L1 项目知识库的完全读写权限
- FR-4.2：任务 session 默认对 L1 只读，对自身的 L2 可读写
- FR-4.3：[DEFER v2.6] 任务 session 可通过 `create_session` 参数 `memory_write` 申请写入权限（写入 findings）— MVP 阶段暂不实现，当前任务 session 无 MCP 工具访问权限，天然无法写入
- FR-4.4：不同项目的知识库物理隔离（存储于项目根目录的 `.kimi-tunnel/memory.db`）

### FR-5：Session 退役知识归档

- FR-5.1：退役流程支持将 session 的 L2 findings 打包为归档摘要（通过 `memory_archive` 工具手动触发；因 Kimi Server 无可靠 session close hook，暂不做自动退役）
- FR-5.2：PM 审查后可将有价值条目提升为 L1 learnings
- FR-5.3：`learn` skill 可从 L1 learnings 中提取跨项目可复用模式，存入向量数据库（L3）

---

## 关键实体

- **命名空间（Namespace）**：知识库的分层路径，如 `project/specs`、`session/abc123/findings`
- **条目（Entry）**：命名空间下的一个键值对，包含 key、value（JSON 字符串）、写入时间、来源 session_id、版本号
- **注入配置（InjectionProfile）**：定义 session 创建时从哪些命名空间、以何种优先级拉取上下文

---

## 成功标准

- SC-1：新建任务 session 的冷启动上下文消耗从平均 30K 降低到 5K 以下（减少 83%+）
- SC-2：PM 向 5 个并行 session 分派任务时，不再需要在每个 prompt 中重复描述项目背景（信息通过共享内存自动注入）
- SC-3：Session 退役后，其关键发现可在 1 分钟内被接续 session 通过共享内存获取（对比当前需 PM 手转的 3-5 分钟）
- SC-4：知识库条目支持至少 1000 条记录，查询响应时间不超过 500ms
- SC-5：PM 可在 2 分钟内完成一个新项目的知识库初始化录入（录入 meta + 1 个 spec 摘要）

---

## 假设与约束

- 共享内存存储在项目本地的 SQLite 文件中，不依赖外部服务
- 注入的上下文大小有上限（默认 8K），超过部分折叠为摘要链接，session 可按需通过 `memory_get` 详细读取
- 当前版本仅支持 PM 手动录入 L1 知识，后续可扩展为自动从 spec 文件提取
- 与现有 `coordinator-guide.md` 的 PM 范式完全兼容——共享内存是 PM 工具的增强，不改变 PM 的决策权

---

## 范围外

- 不实现跨项目的全局知识库（L3 由 `learn` skill 的向量数据库独立处理）
- 不自动从 spec 文件提取知识（PM 仍需手动录入或审查自动提取的结果）
- 不实现 session 间的实时消息推送（已有 WS 事件系统覆盖）
- 不改变现有 `create_session` / `execute_prompt` 的核心行为——内存注入是可选增强，可关闭
