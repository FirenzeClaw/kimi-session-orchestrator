# 记忆注入策略升级：全量预载 → 索引 + 按需自读

**Feature**: `004-memory-lazy-inject`
**Created**: 2026-07-08
**Status**: Implemented (2026-07-08)
**Parent**: kimi-session-orchestrator v2.5
**Depends on**: `002-session-memory-share` (已实施)

---

## 问题陈述

当前记忆注入策略（SPEC 002 Phase 4）在 `execute_prompt` / `chat_with_session` 中将全量记忆内容拼接为 prompt 前缀。这带来三个问题：

### 1. 注入文本随每轮对话历史重复

Kimi Server 将首条 prompt 的注入前缀视为 conversation history 的一部分，每轮重发：

```
Turn 1: [注入 614B] + prompt
Turn 2: [注入 614B] + Turn 1 全文
Turn N: [注入 614B] + Turn 1~N-1 全文
```

对于 `full` 级别（4 个命名空间，~600字节），10 轮 session 累计浪费约 5.5KB——相当于一次注入开销的 9 倍。

### 2. PM 代劳了信息检索——session 失去上下文建立环节

注入式让 PM 替任务 session 完成了记忆条目的检索和选择。任务 session 收到的是一个"结论包"，缺少以下认知过程：

- "我是任务 session，需要先了解项目才能开始工作"（角色锚定）
- "有哪些知识可用？哪些与当前任务相关？"（信息评估）
- "读到一条经验教训——这和当前任务有关，我会注意"（理解消化）

这导致任务 session 的注意力分配次优——被动接收了大量信息但缺乏结构化理解。

### 3. 中途更新不可达

记忆条目在 `execute_prompt` 时冻结为注入文本。若 PM 在 session 运行期间通过 `memory_set` 新增条目，任务 session 无法感知——除非 PM 再次干预。

### 量化影响

| 场景 | 当前浪费 | 改进后 |
|------|----------|--------|
| `full` 级别 5 轮 session | 注入 614B × 5 = 3.0KB | 索引 ~80-200B × 1 + memory_get 结果（按需） |
| `full` 级别 10 轮 session | 注入 614B × 10 = 6.0KB | 索引 ~80-200B × 1 + memory_get 结果（按需） |

> 注：80B 对应折叠模式（>20 条），200B 对应完整 `full` 索引表（4 命名空间 × 平均 5 条）。
| PM 需要读记忆再发 prompt | PM 手动 `memory_get` 4 次（~200 token） | PM 零操作——只发 prompt |
| 中途新增条目 | 不可达 | session 可随时 `memory_get` 获取 |

---

## 解决方案

将注入策略从"全量预载"改为"索引 + 按需自读"：

### 注入内容对比

**当前（全量预载）**：
```
[系统注入] 以下为项目共享知识...

## 项目背景
- test_project_overview: D:/code/test 是一个 TypeScript 工具库项目...
- tech_stack: TypeScript 5.6, Node.js ≥ 18...（全量展开）

## 相关决策
- naming_convention: 所有导出函数必须使用 camelCase...（全量展开）

## 已知风险
- division_by_zero: divide 函数...（全量展开）

## 经验沉淀
- comment_sync: 历史问题...（全量展开）
---
任务：...
```

**改进后（索引 + 自读）**：
```
[系统注入] 你是任务 session。以下共享记忆命名空间可用，请用 memory_get 按需读取：

| 命名空间 | 可用条目 | 读取建议 |
|---------|---------|---------|
| project/meta | project_overview, tech_stack, coding_conventions | 必读——了解项目背景和技术约定 |
| project/decisions | naming_convention | 必读——了解命名字段决策 |
| project/risks | division_by_zero | 按需——涉及除零相关代码时读取 |
| project/learnings | comment_sync | 按需——涉及注释修改时读取 |

---
任务：在 src/utils.ts 中新增一个 subtract 函数，遵循项目编码规范。
```

任务 session 收到后，在同一 turn 内：
1. 评估哪些命名空间与自己相关
2. 调用 `memory_get("project/meta")` → 获取技术栈和编码规范
3. 调用 `memory_get("project/decisions", "naming_convention")` → 获取命名规则
4. 基于获取的记忆上下文执行任务

---

## 用户故事

1. **作为项目经理（PM）**，我希望能让任务 session 自己按需读取记忆条目——我只指明有哪些知识可用，而不是替 session 选择和格式化全部内容，减少我的前置操作负担
2. **作为项目经理（PM）**，我希望任务 session 在理解任务时能主动检索相关记忆——读到"命名规范"时自觉调用 `memory_get("project/decisions")`，而不是我提前预判它需要什么
3. **作为任务 session**，我希望收到的是一个知识索引而非全量内容——我能评估哪些与我相关，选择性读取，建立自己的上下文理解，而不是被动接收海量信息
4. **作为项目经理（PM）**，当我在 session 运行期间新增记忆条目（如发现新的风险），任务 session 能通过 `memory_get` 自行获取——不需要我重新发送 prompt

---

## 功能需求

### FR-1：轻量索引注入

`execute_prompt` 和 `chat_with_session` 的注入行为从"全量内容"改为"索引"：

| `memory_level` | 注入内容 |
|---------------|---------|
| `off` | 无注入（不变） |
| `minimal` | "你是任务 session。可用记忆：project/meta。使用 memory_get 读取。" |
| `standard` | "你是任务 session。可用记忆：project/meta + project/decisions。使用 memory_get 按需读取。" |
| `full` | 命名空间 + 键名列表 + 简短描述（如上表）。使用 memory_get 按需读取。 |

### FR-2：角色锚定

注入文本必须包含明确的角色声明："你是任务 session"，使 session 理解自己处于任务执行模式，需要主动建立上下文。

### FR-3：按需自读

任务 session 应通过 `memory_get` MCP 工具自行读取记忆条目。PM 不再需要预先调用 `memory_get` 来准备注入内容。

### FR-4：动态可更新

记忆条目在 `execute_prompt` 后仍可通过 `memory_set` 新增。任务 session 可随时调用 `memory_get` 获取最新条目——session 运行期间新增的记忆对后续 `memory_get` 调用立即可见。

### FR-5：向后兼容

`skip_memory=true` 行为不变。现有 `memory_level` 参数语义保留（`off`/`minimal`/`standard`/`full`），仅改变注入内容的格式——从全量文本变为索引。

### FR-6：索引上限保护

`full` 级别若记忆条目数超过 20 条，索引仅列出命名空间名称（不展开键名），避免索引本身过大。

---

## 成功标准

| ID | 标准 | 度量方式 |
|----|------|---------|
| SC-1 | PM 发送 `execute_prompt` 不再需要前置 `memory_get` 调用 | PM 操作步数：N → 1（仅 `execute_prompt`） |
| SC-2 | `full` 级别注入文本从 ~600 字节降至 ~200 字节（索引格式） | 注入文本字节数对比 |
| SC-3 | 任务 session 在首个 turn 内能自行调用 `memory_get` 读取记忆，无需 PM 额外提示 | session 首 turn tool call 包含 `memory_get` |
| SC-4 | 记忆条目在 session 运行期间新增后，任务 session 可通过 `memory_get` 获取 | 新增条目 → session 调用 `memory_get` → 返回包含新条目 |
| SC-5 | 任务 session 基于自读记忆的代码产出规范遵守度不低于全量注入模式 | 以注释准确性、命名一致性为参照，对比自读模式与注入模式的产出质量 |

---

## 关键实体

- **注入索引（Injection Index）**：轻量文本，含角色声明 + 命名空间列表 + 键名摘要，替代原全量注入文本
- **命名空间（Namespace）**：`project/meta` / `project/decisions` / `project/risks` / `project/learnings`，索引中展示其包含的键名和简短描述
- **自读回合（Self-Read Turn）**：任务 session 的首个 turn，其中包含 `memory_get` 调用以拉取所需记忆

---

## 边界与约束

- 仅改变注入格式，不改变记忆库存储结构或已有的记忆管理工具行为
- `memory_get` 返回的内容同样会出现在 conversation history 中——但这是 session 主动检索的结果，不再是重复注入文本
- 任务 session 需要被告知"读取记忆"——这个提示本身就是索引注入的一部分
- 若指定 `memory_level` 对应的命名空间中无任何条目，注入索引包含声明"当前无记忆条目"，不强制要求 session 读取空命名空间
- 索引中键名列表按更新日期降序排列，过期条目默认不展示在索引中

---

## 假设

- 任务 session 拥有完整 MCP 工具集（包括 `memory_get`），能自主调用（已验证：本 session 创建的任务 session 均有此能力）
- Kimi Code CLI session 的 tool call 在同一 turn 内可多次执行——首次 `memory_get` 和后续任务操作发生在同一 turn 中
- 索引注入的 ~200 字节足以让 session 理解有哪些知识可用并做出读取决策
