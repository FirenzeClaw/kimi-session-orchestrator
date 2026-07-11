# Xmind Orchestrated 实现计划

> **面向 AI 代理的工作者：** 使用 superpowers:subagent-driven-development 逐任务实现此计划。

**目标：** 创建 `skills/xmind-orchestrated/SKILL.md`，将原 xmind 升级为 task session 主路径 + 子 Agent 降级双模式，实现零认知污染的问题求解。

## 架构决策

- **新建而非改写**：原 xmind 是用户级 skill，保留不动。新建 `skills/xmind-orchestrated/` 作为项目级 skill，用户可选择安装
- **路径 A 依赖 kimi-session-orchestrator MCP**：task session 路径需要 `create_session`、`execute_prompt`、`memory_get`、`list_io_records` 等工具
- **路径 B 完全独立**：仅需 kimi-code 内置 `Agent` 工具，无外部依赖

**技术栈：** Markdown（纯 skill 文件，无代码依赖）

---

## 任务列表

### 阶段 1：创建 SKILL.md

- [ ] **任务 1：创建 xmind-orchestrated SKILL.md**

从原 `C:/Users/admin/.agents/skills/xmind/SKILL.md` 提取核心逻辑并升级。

**文件：**
- 创建：`skills/xmind-orchestrated/SKILL.md`
- 参考：`C:/Users/admin/.agents/skills/xmind/SKILL.md`

**必须包含（按顺序）：**

1. **Auto 检测**（~5行）：若 auto → 纯文本提问
2. **Phase 0: 启动三问**（~20行）：
   - Q1: 问题描述（现象+发生时机+影响范围，必须具体）
   - Q2: 相关文档路径 + 日志内容（路径列表 + 关键日志/文档的原文摘要，至少1个）
   - Q3: 已尝试方案（每次尝试的方案描述 + 可观测结果。可无，有则必写失败原因）
   - 每问验证非空（Q3 可为空）；Q2 路径必须可访问
3. **Phase 1: 认知过滤**（~10行）：
   - 黑名单词表：`我觉得|可能是|怀疑|应该不是|好像|大概|估计`
   - 过滤规则：移除含黑名单词的整句
   - "之前试过 X 好像不行" → "已尝试 X"
4. **Phase 2: 路由检测**（~8行）：
   - `get_tunnel_status` → `wireConnected`
   - 若工具不可用或返回 false → 自动降级路径 B
   - 若 `wireConnected: true` 但 create_session 失败 → 降级路径 B
   - 禁止在路由阶段阻塞——3秒内未确定则降级
5. **Phase 3A: task session 路径**（~30行）：
   - 前提：`memory_get(namespace="project/decisions")` 获取已知约束
   - `create_session(cwd, permission_mode="auto")` → 失败则降级路径 B
   - `execute_prompt(sid, facts_only_template)` →
     注入模板含：问题描述 + 文档/日志 + 已尝试方案 + 已知约束 + subagent_workflow
   - `Bash(run_in_background=true, command=poll_command)` → 后台等 <notification>
   - `list_io_records` → 提取方案文本
   - 若 session 返回空或 error → 记录并降级路径 B 重试
6. **Phase 3B: 子 Agent 降级**（~15行）：
   - `Agent(subagent_type="coder")` + 原 xmind zoom-out 流程
   - 保留原 HandoffPackage 结构（project/docs/problems/constraints）
   - 迭代拒绝原因记录在 prompt 中（不依赖 memory_set）
7. **Phase 4: 迭代**（~15行）：
   - 接受 → 结束
   - 拒绝 → iteration < 3 →
       路径 A: `memory_set(拒绝原因, 仅事实)` → 新 session
       路径 B: 拒绝原因写入下一轮 prompt 前缀 → 新子 Agent
   - ≥3轮 → 输出 3 轮记录，标记需人工决策
   - 拒绝原因同样需过滤主观词
8. **工具规范表**（~10行）
9. **红线**（~8行）

**验收标准：**
- [ ] ≤ 145 行（因补充 edge case 处理，放宽到 145）
- [ ] 注入模板不含"我觉得/可能是/怀疑/应该不是/好像/大概/估计"
- [ ] 含双路径路由逻辑
- [ ] 含过滤规则和示例
- [ ] 含 tool 规范表
- [ ] 末尾标注原 xmind skill 路径作为参考

**验证：**
- [ ] `wc -l skills/xmind-orchestrated/SKILL.md` ≤ 145
- [ ] grep 主观词黑名单返回 0

**依赖：** 无

**预估规模：** M（新建单个文件，内容丰富）

---

### 检查点：完成
- [ ] SKILL.md 创建完毕
- [ ] 行数 ≤ 145
- [ ] 注入模板零主观词
- [ ] 双路径完整可走，含全部 edge case 处理
- [ ] 路径 B 不依赖 kimi-session-orchestrator MCP

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 过滤规则误删有效信息 | 中 | 只移除含黑名单词的整句，保留客观描述 |
| task session 空返回 | 中 | 降级路径 B 重试一次 |
| `memory_set` 在降级路径不可用 | 低 | 拒绝原因写入 prompt 前缀替代 |
| get_tunnel_status 自身超时 | 中 | 3秒超时自动降级路径 B |

## 待定问题

- 无。设计文档已覆盖所有决策。
