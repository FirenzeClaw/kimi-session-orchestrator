# Loop 核心执行循环

> 加载条件：Q3 选择后 Read。定义 PM 进入自主编排后的完整 6 阶段循环。

---

## §1 阶段 0 — 记忆加载

```
memory_get(namespace="project/meta")     → 技术栈/规范/约定
memory_get(namespace="project/learnings") → 过往 session 沉淀经验
```

若 project/ 命名空间为空 → 跳过，不阻塞。

> 完整 memory 操作映射见 → Read `~/.kimi-code/skills/loop-orchestrator/guide-loop-memory.md`

---

## §2 阶段 1 — 拆解

按验收标准维度拆分工作包。判定注入粒度：

单次注入条件（全部满足）：
  ① 工作包 ≤ 3 条独立验收项
  ② 项间无先后依赖
  ③ 总指令 ≤ 500 字
  ④ 无需运行测试/构建等耗时验证

任一条不满足 → 分次注入。

拆解完成后：
```
memory_set(namespace="session/loop-<loop-id>", key="plan", value="<plan JSON>") ← 持久化
```
`loop-id = loop-<ISO timestamp>`。

> 详细注入判定规则见 → Read `~/.kimi-code/skills/loop-orchestrator/guide-loop-injection.md`

---

## §3 阶段 2 — 执行循环

```
每个工作包：
  create_session(cwd, permission_mode="auto")
    → execute_prompt(sid, task, auto_mode=true)
    → Bash(run_in_background=true) 后台轮询
    → 拿到回复
    → PM 自主判断：需要 grade_step?
      yes(关键产出/修复后/交付前)
        → grade_step(复用同 session!)
        → pass? → memory_set(namespace="session/<sid>", key="findings", value="<findings JSON>") → 下一工作包
        → fail? → execute_prompt(sid, 修复指令)
                  ≤2 retry → 3rd fail → 阶段3
      no(中间步骤/简单验证)
        → PM spot-check → 继续
```

**上下文腐化监控：**
- `list_io_records` → `totalTurns ≥ 80` → retire
- `read_session_log` → `totalLines ≥ 1500` → retire
- 产出质量下降（偏离规范/遗漏要点/幻觉）→ 立即 retire

**强制拆 session 操作序列：**
```
memory_set(namespace="session/loop-<id>", key="progress", value="<progress JSON>")
memory_archive(旧sid)
create_session(from_session=旧sid, cwd=..., permission_mode="auto")
```

---

## §4 阶段 3 — 阻塞干预

触发条件：session 卡死 / 3 次 retry 失败 / loop 指纹触发。

```
诊断：read_session_log + list_io_records
决策树：
  ├─ 方向问题? → 创建诊断 session 分析根因
  ├─ 知识缺口? → 创建搜索 session 补充信息
  ├─ 思维僵局? → 调用 xmind-orchestrated
  └─ 无法解决? → 暂停向用户汇报（不降级）

诊断结果拿到后：
  上下文健康（turns < 80 且 lines < 1500）?
    → 注入原 session → 重试（重置 retry 计数）
  上下文腐化?
    → memory_set(namespace="session/loop-<id>", key="progress", value="<progress JSON>")
    → memory_archive 归档
    → create_session(from_session=旧sid) 接班
    → 新 session 重试

诊断后重试仍 2 次失败 → 暂停向用户汇报
  汇报含：阻塞历史 + 已尝试方案 + 疑点
  不自行降级目标
```

> 完整决策树及诊断 session 创建规范见 → Read `~/.kimi-code/skills/loop-orchestrator/guide-loop-blockage.md`

---

## §5 阶段 4 — 里程碑汇报

每完成一个模块/工作包：

```
📦 {模块} 完成: {M} PASS / {N} FAIL → 已修复
memory_set(namespace="session/loop-<id>", key="milestones", value="<milestones JSON>")
```

不等待用户确认，直接进入下一工作包。

---

## §6 阶段 5 — 交付

全部验收标准通过：

```
memory_archive(session_id) → findings → learnings
最终报告（全模块 PASS/FAIL 历史 + 修复记录）
```

> 交付归档完整流程见 → Read `~/.kimi-code/skills/loop-orchestrator/guide-loop-deliver.md`

---

## §7 grade_step 使用节奏

| 场景 | 是否 grade_step | 原因 |
|------|:--:|------|
| task session 完成首次验收输出 | ✅ yes | 关键产出 |
| 修复后重新输出 | ✅ yes | 验证修复 |
| 最终交付前 | ✅ yes | 全量终验 |
| 中间辅助步骤（如"读取 spec"） | ❌ no | PM spot-check 即可 |
| 阻塞诊断 session 的分析结果 | ❌ no | 供 PM 决策，非交付物 |
| "已确认，开始执行" 等确认回复 | ❌ no | 无实质产出 |

## §8 PM Spot-check

即使 grade_step pass (score ≥ 70)，抽查：
- 产出中引用的文件路径是否存在
- 修复是否真的改了代码（对比修复前后）
- 是否引入了新的越权操作

---

> 完整规范见 `docs/superpowers/specs/2026-07-15-loop-orchestrator-v2-design.md`
