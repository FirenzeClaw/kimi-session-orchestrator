# 阻塞干预决策树

> 加载条件：阶段 3 阻塞发生时 Read。

---

## §1 阻塞识别

| 信号 | 检测方式 |
|------|----------|
| session 卡死 | `poll_session` 返回 `idle` 持续 > 60s 且无产出 |
| 3 次 retry 失败 | PM 内部计数（同 step 连续 3 次 grade_step fail） |
| loop 指纹触发 | `list_io_records` 发现同一 tool 模式连续 ≥ 3 次 |

## §2 诊断步骤

```
read_session_log(sid) + list_io_records(sid) → 分析阻塞根因
```

## §3 决策树

| 根因 | 动作 | session 创建参数 |
|------|------|-----------------|
| 方向问题（理解偏差/误读需求） | 创建诊断 session | `cwd=同项目`, `memory_level=off`, prompt="分析以下 session 的产出，判断是否偏离目标..." |
| 知识缺口（缺少文档/API 信息） | 创建搜索 session | `cwd=同项目`, `memory_level=off`, prompt="搜索以下问题的答案..." |
| 思维僵局（同一模式反复失败） | 调用 `xmind-orchestrated` | 通过 skill 机制激活，非 MCP 工具 |
| 工具/环境问题（依赖缺失/权限） | 暂停汇报 | 向用户汇报具体缺失项 |

## §4 诊断后分流

```
诊断 session 结果拿到 →
  原 session 健康（turns < 80 且 lines < 1500）?
    → execute_prompt(sid, "根据以下诊断调整方向: <诊断结果>")
    → 重置 retry 计数 → 重试
  原 session 腐化?
    → memory_set("session/loop-<id>/progress", ...)
    → memory_archive(旧sid)
    → create_session(from_session=旧sid, cwd=同上)
    → execute_prompt(新sid, "接续上一个 session 的进度，根据诊断调整: <诊断结果>")
```

## §5 升级条件

诊断后重试仍 2 次失败 → 暂停向用户汇报：

```
阻塞汇报格式:
  阻塞历史: <时间线：最初失败 → 诊断 → 重试 → 仍然失败>
  已尝试方案: <1. 原始修复 2. 诊断调整 3. 新 session 接续>
  疑点: <PM 判断的最可能根因>
  建议: <需要用户决策的方向>

不自行降级目标——等待用户给出新方向或确认放弃。
```

---

> 完整规范见 spec §3 阶段 3
