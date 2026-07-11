# Xmind Orchestrated — 设计规格

## 动机

原 xmind skill 通过 `Agent` 子代理打破思维惯性，但存在两个局限：
1. 子代理与主 session 共享部分上下文，隔离不彻底
2. kimi-session-orchestrator 的 task session 提供了真正的独立上下文和更完善的结果回收机制

## 目标

- 用 task session 替代子 Agent 作为主路径，实现完全认知隔离
- MCP 不可用时自动降级为本地子 Agent（保留原 xmind 全部能力）
- 降级路径不依赖 kimi-session-orchestrator，仅需 kimi-code 内置 `Agent` 工具
- **⛔ 零认知污染**：注入 task session 的 prompt 不得包含 PM 主观判断、猜测、归因
- 保留原 xmind 的迭代能力（最多 3 轮，拒绝原因驱动）
- 新建 `skills/xmind-orchestrated/`，不改写原用户级 xmind skill

## 文件结构

```
skills/xmind-orchestrated/
└── SKILL.md            # ~120行，完整 skill
```

不新建目录——改写现有 `skills/xmind/` 或在 `skills/` 下新建 `xmind-orchestrated/`。

## 加载流程

```
Skill 激活
  ↓
Auto 检测 → 若 auto 则纯文本提问
  ↓
Phase 0: 启动三问
  Q1: 问题描述？ 现象 + 发生时机 + 影响范围
  Q2: 相关文档与日志？ 路径列表（至少1个）
  Q3: 已尝试方案？ 方案 + 失败原因（可无）
  ↓
Phase 1: 认知过滤
  扫描 Q1-Q3 回答，移除主观语句：
  ⛔ "我觉得" "可能是" "怀疑" "应该不是" "好像" "大概" "估计"
  ⛔ "之前试过 X 好像不行" → 改为 "已尝试 X"（仅事实，不含归因）
  ↓
Phase 2: 路由
  get_tunnel_status → wireConnected?
  ├─ true  → Phase 3A: task session 路径
  └─ false → Phase 3B: 子 Agent 降级
  ↓
Phase 3A: task session 路径
  create_session(cwd, auto)
  execute_prompt(sid, facts_only_template + subagent_workflow)
  Bash(poll_command) → 等 <notification>
  list_io_records → 提取方案
  → 用户决策
  ↓
Phase 3B: 子 Agent 降级
  Agent(subagent_type="coder",
    prompt=facts_only + xmind subagent_workflow)
  → 保留原 zoom-out 流程
  ↓
Phase 4: 迭代
  用户接受 → 结束
  用户拒绝 → iteration < 3?
    Yes → memory_set(拒绝原因, 仅事实) → 新 session/子Agent
    No  → 输出 3 轮记录，标记需人工决策
```

## 注入模板（task session 路径）

```
[系统注入] 你是独立的问题分析 session。以下信息均为客观事实，不含任何主观判断。

## 问题描述
<Q1 过滤后内容>

## 相关文档与日志
<路径列表 + 日志原文>

## 已尝试方案
<Q3 过滤后内容：只保留方案描述和可观测结果>

## 已知约束
<从 project/decisions 提取，仅事实型决策>

---
请按以下步骤分析：

1. 读取上述相关文档和日志，理解项目上下文
2. 分析问题现象，用项目术语描述全局架构关系
3. 基于宏观理解，提出 1-3 个新方案
4. 每个方案标注：可行性 + 理由 + 风险 + 与已尝试方案的本质区别

⛔ 如果你发现缺少关键信息，列出需要补充的内容。
```

## 工具规范

| 工具 | 用途 | 路径 |
|------|------|------|
| `create_session` | 创建独立 xmind session | A |
| `execute_prompt` | 下发分析任务 | A |
| `Bash(poll_command)` | 后台等待结果 | A |
| `get_tunnel_status` | 检测 MCP 可用性 | A+B |
| `list_io_records` | 回收 task session 结果 | A |
| `memory_set` | 记录拒绝原因 | A+B |
| `Agent` | 降级子 Agent | B |
| `AskUserQuestion` | 启动三问（非 auto） | A+B |

## 成功标准

1. task session 注入不含 PM 主观语句
2. wireConnected=false 时自动降级子 Agent
3. 原 xmind 的 3 轮迭代、zoom-out 流程保留
4. SKILL.md ≤ 120 行
5. 认知过滤规则明确（黑名单可验证）
