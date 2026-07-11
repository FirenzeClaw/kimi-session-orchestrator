# Skill 拆分加载 实现计划

> **面向 AI 代理的工作者：** 使用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将 222 行 SKILL.md 拆分为最小基础引导 + 3 个按维度加载的 guide 文档，skill 激活 token 从 ~1000 行降至 ~60 行。

**架构：** SKILL.md 负责 auto 检测 + 核心铁律 + 三问启动协议；根据 Q1 答案按需 Read guide-{planning,orchestration,execute}.md；coordinator-guide.md 保留为完整参考不再自动加载。

**技术栈：** Markdown（skill 文件均为纯 Markdown，无代码依赖）

---

## 任务列表

### 阶段 1：创建新 guide 文档

- [ ] **任务 1：创建 guide-execute.md**

从现有 SKILL.md 中提取执行者最小指南：核心铁律 + 基本工具速查。

**验收标准：**
- [ ] 文件存在于 `skills/kimi-session-orchestrator/guide-execute.md`
- [ ] ≤ 40 行
- [ ] 含核心铁律（4 条）
- [ ] 含工具速查（Session/任务/状态三类，不含记忆/工作流/权限）

**验证：**
- [ ] `wc -l skills/kimi-session-orchestrator/guide-execute.md` ≤ 40

**依赖：** 无

**涉及文件：**
- 创建：`skills/kimi-session-orchestrator/guide-execute.md`

**预估规模：** XS（1 文件，纯文本提取）

---

- [ ] **任务 2：创建 guide-planning.md**

从 `docs/coordinator-guide.md` 提取规划派发内容 + 从 SKILL.md 提取工具速查。

**验收标准：**
- [ ] 文件存在于 `skills/kimi-session-orchestrator/guide-planning.md`
- [ ] ≤ 230 行
- [ ] 含工作分解 (WBS) 原则
- [ ] 含 Prompt 编写规范
- [ ] 含并行编排模式（批量并行启动、串行等待反模式）
- [ ] 含结果审查清单
- [ ] 含合成与交付流程
- [ ] 含质量门
- [ ] 含工具速查（Session/任务/状态/记忆/工作流/权限）
- [ ] 含红线
- [ ] 含 Q2b 派发模式详细说明——两种模式的行为差异必须明确：
  - **纯派发验收**：PM 拆解工作包 → 派发 task session 执行 → PM 对照设计文档与代码实现验收
  - **派发+自审**：PM 拆解工作包 → 派发 task session 执行 → task session 执行完毕后自行审查并修复 → PM 最终验收
- [ ] 末尾标注"完整规范见 coordinator-guide.md"

**验证：**
- [ ] `wc -l skills/kimi-session-orchestrator/guide-planning.md` ≤ 220
- [ ] 每个声称的内容章节可定位

**依赖：** 无（可与任务 1 并行）

**涉及文件：**
- 创建：`skills/kimi-session-orchestrator/guide-planning.md`

**预估规模：** M（3-5 文件等价内容提取）

---

- [ ] **任务 3：创建 guide-orchestration.md**

从 `docs/coordinator-guide.md` 提取长轮次编排内容 + 新增管线说明 + 工具速查。

**核心约束（必含——用户明确要求）：**

> **任务注入必须逐级进行，严禁一次性全注入。**
> 每个 prompt 只含当前 step 的一个操作；等待 task session 完成并返回结果后，PM 审查通过，再发送下一步。避免 task session 因信息过载导致注意力分散和会话降级。

**管线流程（7 步——不可缩减）：**

```
Step 1: memory_read — task session 调用 memory_get 读取项目背景和决策
Step 2: task_understand — task session 阅读 spec/代码理解任务范围
Step 3: review — 审查代码/设计，输出结构化问题清单
Step 4: secondary_review — 对照 Step 3 清单逐项复查确认
Step 5: fix — 根据审查结论实施修复
Step 6: selftest — 自检审查（依赖本机安装的 selftest skill，其他设备可能不可用）
Step 7: md-update — 文档更新（依赖本机安装的 md-update skill，其他设备可能不可用）
```

> **注意**：Step 6 和 Step 7 依赖本机 skill 库。若目标设备未安装 `selftest` 或 `md-update` skill，PM 应手动执行等效的自审查和文档同步操作。

**迭代循环：**
每完成一轮 7 步管线 → PM 审查是否存在严重问题 → 若有则创建新的 task session 重复流程 → 直到达到用户目标

**验收标准：**
- [ ] 文件存在于 `skills/kimi-session-orchestrator/guide-orchestration.md`
- [ ] ≤ 300 行（因新增大量内容，放宽到 300）
- [ ] 含"一次性一指令原则"完整说明——每 prompt 单一操作，等完成再发下一步
- [ ] 含完整 7 步管线，每步有明确产出格式和成功标准；Step 6/7 标注依赖本机 skill（其他设备可能不可用）
- [ ] 含迭代循环判断规则：什么算"严重问题"→ 什么情况创建新 session
- [ ] 含注意力管理与退役
- [ ] 含结果审查清单
- [ ] 含质量门
- [ ] 含工具速查（完整：Session/任务/状态/记忆/工作流/权限/后台监听）
- [ ] 含红线
- [ ] 末尾标注"完整规范见 coordinator-guide.md"

**验证：**
- [ ] `wc -l skills/kimi-session-orchestrator/guide-orchestration.md` ≤ 300
- [ ] 7 步管线每步描述完整，不可有占位符；Step 6/7 已标注 skill 依赖
- [ ] "一次性一指令"原则有明确的正反示例

---

### 检查点：阶段 1
- [ ] 3 个 guide 文件全部创建
- [ ] 每个文件在行数限制内
- [ ] 内容无占位符、无 TODO

---

### 阶段 2：重写 SKILL.md

- [ ] **任务 4：重写 SKILL.md 为最小基础引导**

将 222 行 SKILL.md 精简为 ~60 行基础引导，删除所有工具速查、标准工作流、状态含义——这些在各 guide 中。**删除旧的"第一步：读取 PM 规范 → Read coordinator-guide.md"指令**（不再自动加载 coordinator-guide）。

**Auto 检测机制**：通过检查当前 kimi-code session 的 permission mode 是否为 `auto`。若为 auto → 调用 ExitPlanMode 工具退出 → auto 模式解除后 AskUserQuestion 才能正常工作。

**验收标准：**
- [ ] ≤ 65 行
- [ ] 含 auto 检测逻辑：检查 permission mode → 若 auto 则 ExitPlanMode
- [ ] 含核心铁律（4 条，精简版，仅保留规则本身无需解释）
- [ ] 含 Q1 角色维度：3 选项（规划派发 / 长轮次编排 / 执行者），每个选项标注对应 Read 的 guide 文件名
- [ ] 含 Q2 两轮：通用 Q2a（最终目标）+ 仅规划派发维度追问 Q2b（派发模式）
- [ ] 含 Q3 决策模式：2 选项
- [ ] 含运行模式设定：Q1+Q3 共 4 种组合的行为简述
- [ ] **不含**工具速查、标准工作流、状态含义、coordinator-guide 自动加载
- [ ] **不含**旧"第一步：Read coordinator-guide.md"——该文件保留为参考，guide 中末尾标注引用

**验证：**
- [ ] `wc -l skills/kimi-session-orchestrator/SKILL.md` ≤ 65
- [ ] 人工审查：Q1 选择执行者后不会触发读取 PM guide

**依赖：** 任务 1（guide-execute.md 文件名需与 SKILL.md 中指引一致）

**涉及文件：**
- 修改：`skills/kimi-session-orchestrator/SKILL.md`

**预估规模：** S（1-2 文件，大幅重写）

---

### 检查点：阶段 2
- [ ] SKILL.md 行数 ≤ 65
- [ ] 三问流程完整，逻辑连贯
- [ ] auto 检测代码路径正确
- [ ] 所有 Read 指引指向存在的文件

---

### 阶段 3：文档更新

- [ ] **任务 5：更新 README.md Skill 章节**

将"Skill 列表"表更新以反映拆分后的文件结构，标注每个 guide 的加载方式。

**验收标准：**
- [ ] Skill 列表表增加列说明"加载方式"（自动 / Q1选择后 / 按需）
- [ ] 安装命令包含新的 guide 文件（cp -r 已覆盖目录）

**验证：**
- [ ] README 中 Skill 描述与拆分后文件结构一致

**依赖：** 任务 4

**涉及文件：**
- 修改：`README.md`

**预估规模：** XS（1 文件，微量修改）

---

- [ ] **任务 6：更新 AGENTS.md 同步描述**

**验收标准：**
- [ ] Skill 表格反映拆分后结构
- [ ] 安装命令无变化（`cp -r` 覆盖目录）

**依赖：** 任务 4

**涉及文件：**
- 修改：`AGENTS.md`

**预估规模：** XS（1 文件，微量修改）

---

### 检查点：完成
- [ ] 所有文件创建/修改完毕
- [ ] `wc -l skills/kimi-session-orchestrator/SKILL.md` ≤ 65
- [ ] 3 个 guide 文件各行数达标
- [ ] guide-orchestration.md 含完整 7 步管线 + 一次性一指令约束
- [ ] guide-planning.md 含 Q2b 两种模式的明确行为差异
- [ ] SKILL.md **不含**旧 coordinator-guide 自动加载指令
- [ ] 每个 guide 末尾标注"完整规范见 coordinator-guide.md"
- [ ] `npm run build` 零错误
- [ ] README + AGENTS 与拆分后结构一致

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| guide 内容从 coordinator-guide 提取时有遗漏 | 中 | 对照设计文档的内容清单逐项检查；每个 guide 末尾标注完整参考路径 |
| SKILL.md 过于精简导致执行者缺少必要信息 | 低 | guide-execute.md 保证执行者关键信息完整 |
| auto 退出逻辑在部分 Kimi Code 版本不生效 | 低 | ExitPlanMode 是标准功能，广泛支持；若不生效则跳过 auto 检测直接提问（AskUserQuestion 会报错提示用户退出 auto） |
| guide-orchestration 管线步骤在实际使用中发现遗漏 | 中 | 7 步基于用户明确描述。实施后首次使用即验证 |
| 一次性一指令原则被 task session 忽略 | 中 | guide 中提供正反示例，PM 在每轮 prompt 中明确"本次执行 Step X，完成后等待指令" |

## 待定问题

- 无。设计文档已覆盖所有决策。
