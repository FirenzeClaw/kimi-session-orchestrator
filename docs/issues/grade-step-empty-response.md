# [FIXED] grade_step — grader 无数据评分 + JSON 截断

## 问题 1：grader 无 session 产出可评分

**表现**：`grade_step(session_id, criteria)` 返回 `"grader JSON 解析失败，原始响应: "`（空响应）。

**根因**：grader prompt 仅包含 `session_id` 名称（`请根据 session ${session_id} 的最新产出进行评分`），但 grader session 无法跨 session 读取目标产出。LLM 收到评分指令但无任何数据可评估。

**修复**（2026-07-15）：
- `src/tools/grade-step.ts`：导入 `listIORecords`，在构建 grading prompt 前拉取目标 session 的最近 5 条 IO 记录（`maxContentLength: 8000`）
- 将 IO 产出以 `=== Session 产出 ===` 段落嵌入 prompt

## 问题 2：grader 反馈过长 → JSON 截断

**表现**：grader 产出详细反馈（含行号引用如 `L1-18`）时，`finalText` 被截断在 JSON 中间，`JSON.parse` 失败 → 返回 `pass: false, score: 0`（实际 pass/100）。

**根因**：`sendPrompt` 返回的 `response.finalText` 对长文本有隐式截断。

**修复**（2026-07-15）：
- `catch` 分支增加正则 fallback：`/"pass"\s*:\s*(true|false)/` + `/"score"\s*:\s*(\d+)/`
- 截断时仍能正确返回 pass/score，feedback 标注 `…(截断)` 后缀
