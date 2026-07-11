# Skill 拆分加载架构设计

## 动机

当前 `kimi-session-orchestrator` skill 存在两个问题：

1. **SKILL.md 过大（222 行）**：skill 激活时全量加载，执行者只需工具速查却被迫读完所有 PM 规范，浪费 ~200 行 token
2. **coordinator-guide.md 过大（775 行）**：启动协议第一步就要求读取完整 guide，首轮交互即消耗大量上下文

## 目标

- 最小化 skill 激活时的 token 消耗（目标 ≤60 行）
- 按用户角色和维度按需加载对应 guide 文档
- 保留现有 3 个核心问题（角色/目标/决策模式）
- 规划派发维度新增子模式选择（纯派发 vs 派发+自审）
- 处理 auto 模式下 AskUserQuestion 不可用的问题

## 文件结构

```
skills/kimi-session-orchestrator/
├── SKILL.md              # 基础引导 (~60行)
├── guide-planning.md     # 规划派发指南 (~200行)
├── guide-orchestration.md # 长轮次编排指南 (~250行)
├── guide-execute.md      # 执行者指南 (~30行)
└── coordinator-guide.md  # 完整参考手册（保留，按需读取）
```

## 加载流程

```
SKILL.md 加载（~60行）
  │
  ├── ① Auto 检测
  │     如果当前处于 auto 模式 → 先 ExitPlanMode 退出
  │     原因：auto 模式下 AskUserQuestion 不可用
  │
  ├── ② 核心铁律（4 条）
  │     • 即发即返，不阻塞
  │     • 后台 Bash 轮询
  │     • 不用 wait=true
  │     • 不重复 poll
  │
  ├── ③ 第一轮 — Q1：角色与维度
  │     ├─ A: PM 统筹 — 规划派发与验收
  │     │      → Read guide-planning.md
  │     ├─ B: PM 统筹 — 长轮次编排验收修复
  │     │      → Read guide-orchestration.md
  │     └─ C: 执行者
  │            → Read guide-execute.md
  │
  ├── ④ 第二轮 — Q2：目标 + 维度追问
  │     ├─ 通用: Q2a = "最终目标？" ← 保留现 Q2
  │     └─ 仅规划派发: Q2b = "派发模式？"
  │           ├─ 纯派发验收：PM 派发 → session 执行 → PM 对照规范验收
  │           └─ 派发+自审：PM 派发 → session 执行 → session 自行审查修复
  │
  └── ⑤ 第三轮 — Q3：决策模式
        ├─ 自主执行：阻塞自判，结果交付时汇报
        └─ 关键点等待：拆解后、审查后、异常时暂停
```

## guie 文档内容划分

### SKILL.md（~60 行）

| 内容 | 说明 |
|------|------|
| Skill 元信息 | name, description |
| Auto 检测逻辑 | 若 auto → ExitPlanMode → 再执行以下步骤 |
| 核心铁律 | 4 条，必须 |
| Q1 角色维度选择 | 3 选项 |
| 读文档指引 | 根据 Q1 答案指导 Read 哪个 guide |
| Q2 目标 + 追问 | 通用 Q2a + 规划派发 Q2b |
| Q3 决策模式 | 2 选项 |
| 运行模式设定 | 根据 Q1+Q3 的组合 |

### guide-planning.md（~200 行）

| 内容 | 来源 |
|------|------|
| 工作分解 (WBS) 原则 | coordinator-guide §一 |
| Prompt 编写规范 | coordinator-guide §一 |
| 并行编排模式 | coordinator-guide §四 |
| 结果审查清单 | coordinator-guide §四 |
| 合成与交付 | coordinator-guide §四 |
| 质量门 | coordinator-guide §五 |
| 工具速查（Session/任务/状态） | 现 SKILL.md |
| 红线 | coordinator-guide §六 |

### guide-orchestration.md（~250 行）

| 内容 | 来源 |
|------|------|
| 一次性一指令原则 | 新增：每个 prompt 只含一个操作，等完成再发下一步 |
| 记忆读取→任务理解→审查→二次审查→修复→selftest→md-update 7 步管线 | 新增：标准审查修复流程 |
| 注意力管理与退役 | coordinator-guide §1.5 |
| 迭代循环：每轮 7 步完成后 PM 审查 → 严重问题则创建新 session 重复 | 新增 |
| 结果审查清单 | coordinator-guide §四 |
| 质量门 | coordinator-guide §五 |
| 工具速查（完整） | 现 SKILL.md |
| 红线 | coordinator-guide §六 |

### guide-execute.md（~30 行）

| 内容 | 来源 |
|------|------|
| 核心铁律 | 现 SKILL.md |
| 工具速查（基本） | 现 SKILL.md |

## Token 节省估算

| 场景 | 当前 | 拆分后 | 节省 |
|------|-----:|-----:|-----:|
| 加载 skill | ~1000 行 | **~60 行** | 94% |
| 规划派发问答后 | — | + ~200 行 | 总计 260 vs 1000 |
| 长轮次编排问答后 | — | + ~250 行 | 总计 310 vs 1000 |
| 执行者问答后 | — | + ~30 行 | 总计 90 vs 1000 |

## 成功标准

1. SKILL.md ≤ 60 行
2. Auto 模式下先退出再提问，不出现 AskUserQuestion 静默失败
3. Q1 选择"执行者"后不加载 PM 规范内容
4. Q2b 仅在规划派发维度时出现
5. coordinator-guide.md 保留为完整参考，不再自动加载
6. 现有 3 个核心问题（角色/目标/决策模式）全部保留
