# Loop Engineering 实施完整性验证

## 用途

本目录包含 Loop Engineering 功能实施的完整性验证工具。用于在开发流程中快速检查所需的核心组件是否已就位。

## 组件清单

`components.json` 列出了需要验证的 5 个核心 loop 组件：

| 组件 | 说明 | 预期位置 |
|------|------|----------|
| `grade_step` | LLM 自动评分工具 | `src/tools/grade-step.ts` |
| loop 指纹检测 | 重复执行模式识别 | `src/workflow-engine.ts` |
| 堵塞检测系统 | BLOCKAGE_PATTERNS 定义与检测 | `src/workflow-engine.ts` |
| guide 分层文件 | 7 层分级操作指南 | `docs/guide-loop-*.md` |
| `continue_workflow` | 工作流决策工具 | `src/tools/continue-workflow.ts` |

## 运行验证

### Linux / macOS / WSL / Git Bash

```bash
bash tests/loop-verification/verify.sh
```

### Windows PowerShell

```powershell
bash tests/loop-verification/verify.sh
```

## 输出说明

- `[PASS]` — 组件文件存在且内容匹配
- `[FAIL]` — 组件缺失或内容不匹配，需要实施

## 参考

- 架构分析文档：`docs/loop-engineering-analysis.md`
- 自适应工作流引擎：`specs/001-adaptive-workflow-engine/`
