# v2.18 适配收尾迭代实现计划（watch 重置 / 失败报错 / retire 归档 / e2e 复验）

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 完成 0.27 适配的剩余功能项——watch 文本重置兜底、sendPrompt turn 失败显式报错、session-retire 服务端归档，并对 grade_step / run_flow / watch 输出做 0.27 端到端复验。

**架构：** 全部为既有链路的增量修正：handleDirectEvent 增加 `turn.started` 重置兜底（0.27 无 `prompt.submitted` 事件）；sessionStateCache 增加 `lastError` 字段承载 turn 失败信号；session-retire skill 的 Phase 2 追加服务端归档步骤。无新增模块、无接口变更。

**技术栈：** TypeScript 5.6（strict）、Node ≥22（node:test）、skill 文档（Markdown）

**分支：** `feat/v2.18-post-adaptation`（从 master 新建，master 当前 HEAD `70a9777`）

**依据文档：** `docs/issues/web-engine-027-adaptation.md` §七（P2-3/P2-4 研究结论）、`API.md`（0.27 实测事件表）

---

## 实测依据（均已验证，无需再调研）

| 事项 | 结论 |
|------|------|
| `prompt.submitted` 事件 | 0.27 帧流中**不出现**（有 `prompt.completed`）；watch 文本重置需 `turn.started` 兜底 |
| `assistant.delta` | 0.27 正常流动，结构不变 `{turnId, delta}` |
| turn 失败信号 | `turn.ended` 载荷含 `reason: "failed"` + `error{code, message, retryable}`；实测样例 `model.not_configured: Model not set` |
| `POST /sessions/{id}:archive` | body `{}` → `{archived: true}`；归档后 REST 列表不可见 |
| `POST /sessions/{id}/export` | body `{}` → ZIP 二进制（含 manifest.json） |
| 端口/token 获取 | 锁文件 `~/.kimi-code/server/lock` 的 `port`；token 在 `~/.kimi-code/server.token`（poll-command.py 同款模式） |

---

## 文件清单

| 文件 | 职责 | 动作 |
|------|------|------|
| `src/wire-client.ts` | 任务 1（turn.started 重置）+ 任务 2（lastError 记录与抛出） | 修改 |
| `tests/wire-client-status.test.mjs` | 任务 1 单测（追加） | 修改 |
| `tests/wire-client-sendprompt.test.mjs` | 任务 2 单测（新建） | 创建 |
| `skills/session-retire/SKILL.md` | 任务 3：Phase 2 追加服务端归档步骤 | 修改 |
| `CHANGELOG.md` / `AGENTS.md` / `README.md` / `package.json` / `src/index.ts` / `src/mcp-server.ts` / `src/http-server.ts` / `src/tools/get-tunnel-status.ts` / `docs/issues/web-engine-027-adaptation.md` | 任务 5：v2.18 收尾 | 修改 |

---

## 任务列表

### 阶段 1：两个代码修正

---

### 任务 1：watch 文本重置兜底（turn.started）

**描述：** 0.27 不再发送 `prompt.submitted` 事件，`handleDirectEvent` 的 watch 文本重置永不触发，多 prompt watch 会累积旧文本。增加 `turn.started` 作为重置兜底（0.22.x 两事件都发，重置两次无害；计数仍只在 `prompt.submitted` 时累加，0.27 下 promptCount 为 0 属可接受的 cosmetic 差异）。

**文件：**
- 修改：`src/wire-client.ts`（handleDirectEvent watch output 块，约 433-438 行）
- 测试：`tests/wire-client-status.test.mjs`（追加 2 例）

- [ ] **步骤 1：追加失败的测试**

`tests/wire-client-status.test.mjs` 末尾追加：

```js
test("watch: assistant.delta 累积 + turn.started 重置（0.27 无 prompt.submitted 的兜底）", () => {
  const c = makeClient();
  c.watchOutputPath = "x"; // 仅开启累积分支，不触发写文件
  c.handleDirectEvent({ type: "assistant.delta", payload: { delta: "abc", session_id: "s1" } });
  assert.equal(c.watchAssistantText, "abc");
  c.handleDirectEvent({ type: "turn.started", payload: { turnId: 2, session_id: "s1" } });
  assert.equal(c.watchAssistantText, "");
});

test("watch: prompt.submitted 仍重置并计数（0.22.x 兼容）", () => {
  const c = makeClient();
  c.watchOutputPath = "x";
  c.handleDirectEvent({ type: "assistant.delta", payload: { delta: "abc", session_id: "s1" } });
  c.handleDirectEvent({ type: "prompt.submitted", payload: { session_id: "s1" } });
  assert.equal(c.watchAssistantText, "");
  assert.equal(c.watchPromptCount, 1);
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm run build && npm test`
预期：FAIL —— turn.started 重置用例失败（`watchAssistantText` 仍为 "abc"）

- [ ] **步骤 3：实现**

`src/wire-client.ts` 中找到：

```ts
      if (type === "prompt.submitted") {
        this.watchPromptCount++;
        this.watchAssistantText = "";
      }
```

替换为：

```ts
      // 0.27 无 prompt.submitted 事件，turn.started 作为重置兜底（0.22.x 重置两次无害）
      if (type === "prompt.submitted" || type === "turn.started") {
        if (type === "prompt.submitted") this.watchPromptCount++;
        this.watchAssistantText = "";
      }
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm run build && npm test`
预期：25/25 全绿

- [ ] **步骤 5：Commit**

```bash
git add src/wire-client.ts tests/wire-client-status.test.mjs
git commit -m "fix: watch 文本重置兜底 turn.started——0.27 无 prompt.submitted 事件（任务 1/5）"
```

**验收标准：**
- [ ] turn.started 触发 watch 文本重置；prompt.submitted 行为不变（重置 + 计数）
- [ ] 25/25 单测全绿，构建零错误

**依赖：** 无
**预估规模：** S

---

### 任务 2：sendPrompt turn 失败显式报错

**描述：** 0.27 下 turn 失败（如 model.not_configured）时 sendPrompt 会等到 idle 后拉到空回复而不报错。在 `handleDirectEvent` 的 `turn.ended` 分支记录失败信号到缓存 `lastError`，`sendPrompt` 等待结束后检查并抛出带错误码的异常。WS 事件路径专属（REST 兜底路径无事件，保持现状——拉到空回复，与旧行为一致）。

**文件：**
- 修改：`src/wire-client.ts`（sessionStateCache 类型约 103 行、turn.ended 分支约 428-430 行、sendPrompt Step 2 后约 661-668 行）
- 测试：`tests/wire-client-sendprompt.test.mjs`（新建）

- [ ] **步骤 1：编写失败的测试**

创建 `tests/wire-client-sendprompt.test.mjs`：

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { WireClient } from "../dist/wire-client.js";

function makeStubClient() {
  const c = new WireClient();
  c.connected = true;
  c.transport = {
    apiGet: async () => ({ items: [] }),
    apiPost: async () => ({ prompt_id: "p1", content: [] }),
  };
  c.waitForStatus = async () => "idle";
  c.wsSubscribe = () => {};
  return c;
}

test("turn.ended failed → lastError 写入缓存", () => {
  const c = makeStubClient();
  c.handleDirectEvent({
    type: "turn.ended",
    payload: { reason: "failed", error: { code: "model.not_configured", message: "Model not set" }, session_id: "s1" },
  });
  assert.equal(c.sessionStateCache.get("s1").lastError, "[model.not_configured] Model not set");
});

test("turn.ended completed → 清除 lastError", () => {
  const c = makeStubClient();
  c.handleDirectEvent({
    type: "turn.ended",
    payload: { reason: "failed", error: { code: "x", message: "y" }, session_id: "s1" },
  });
  c.handleDirectEvent({ type: "turn.ended", payload: { reason: "completed", session_id: "s1" } });
  assert.equal(c.sessionStateCache.get("s1").lastError, undefined);
});

test("sendPrompt：turn 失败抛带错误码的异常", async () => {
  const c = makeStubClient();
  c.handleDirectEvent({
    type: "turn.ended",
    payload: { reason: "failed", error: { code: "model.not_configured", message: "Model not set" }, session_id: "s1" },
  });
  await assert.rejects(() => c.sendPrompt("s1", "hi"), /model\.not_configured/);
});

test("sendPrompt：turn 成功不抛错", async () => {
  const c = makeStubClient();
  c.handleDirectEvent({ type: "turn.ended", payload: { reason: "completed", session_id: "s1" } });
  const r = await c.sendPrompt("s1", "hi");
  assert.equal(r.status, "completed");
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm run build && npm test`
预期：FAIL —— `lastError` 为 undefined、sendPrompt 不抛错

- [ ] **步骤 3：实现**

3a. `src/wire-client.ts` 约 103 行 sessionStateCache 类型加字段：

```ts
  private sessionStateCache = new Map<string, { status: string; lastTurnId?: number; lastText?: string; lastError?: string; updatedAt: number }>();
```

3b. `handleDirectEvent` 的 turn.ended 分支（现状仅一行 stderr）替换为：

```ts
    if (type === "turn.ended") {
      const reason = payload?.reason as string | undefined;
      // 失败信号入缓存：sendPrompt 等待结束后据此显式抛错（0.27 实测 turn.ended 含 error{code,message}）
      if (reason === "failed" || reason === "cancelled") {
        const errObj = payload?.error as { code?: string; message?: string } | undefined;
        cached.lastError = errObj?.code
          ? `[${errObj.code}] ${errObj.message || ""}`.trim()
          : `turn ${reason}`;
        this.sessionStateCache.set(sessionId, cached);
      } else if (reason === "completed") {
        delete cached.lastError;
        this.sessionStateCache.set(sessionId, cached);
      }
      process.stderr.write(`[wire-client] Turn ended for ${sessionId}: ${reason || "unknown"}\n`);
    }
```

3c. `sendPrompt` 中 Step 2 的 `await this.waitForStatus(...)` 之后、Step 3 拉取消息之前，插入：

```ts
    // Step 2.5: turn 失败显式抛错（WS 事件路径；REST 兜底路径无事件，保持拉空回复的旧行为）
    const postTurn = this.sessionStateCache.get(sessionId);
    if (postTurn?.lastError) {
      throw new Error(`Turn failed for session ${sessionId}: ${postTurn.lastError}`);
    }
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm run build && npm test`
预期：29/29 全绿

- [ ] **步骤 5：Commit**

```bash
git add src/wire-client.ts tests/wire-client-sendprompt.test.mjs
git commit -m "feat: sendPrompt turn 失败显式报错——turn.ended 失败信号入缓存并抛出（任务 2/5）"
```

**验收标准：**
- [ ] turn.ended failed/cancelled 记录 `[code] message`；completed 清除
- [ ] sendPrompt 在 turn 失败时抛带错误码异常；成功路径不受影响
- [ ] 29/29 单测全绿，构建零错误

**依赖：** 无（与任务 1 同文件，串行）
**预估规模：** M

---

### 检查点：阶段 1

- [ ] `npm run build` 零错误，`npm test` 29/29 全绿
- [ ] 两个 commit 在 `feat/v2.18-post-adaptation` 分支
- [ ] 与人审查后再继续

---

### 阶段 2：skill 接入与 e2e 复验

### 任务 3：session-retire 接入服务端归档

**描述：** skill 的 Phase 2 在记忆归档（步骤⑤⑥）之后追加服务端归档步骤⑦——`:export` 可选导出 ZIP 留档、`:archive` 归档退役 session（归档后从 REST 列表消失）。归档失败降级为仅记忆归档，不阻塞 pipeline。

**文件：** 修改 `skills/session-retire/SKILL.md`（Phase 2，约 95-107 行；Edge Cases 表）

- [ ] **步骤 1：Phase 2 代码块追加步骤⑦**

在 `skills/session-retire/SKILL.md` Phase 2 的代码块中，步骤⑥之后追加：

```
⑦ 服务端归档（v2.18 新增，需 0.24+ 引擎）：
   # 可选：先导出留档（ZIP 含 manifest.json + 完整消息）
   curl -s -X POST -H "Authorization: Bearer $(cat ~/.kimi-code/server.token)" \
     -H "Content-Type: application/json" -d '{}' \
     "http://127.0.0.1:$(python -c "import json,os;print(json.load(open(os.path.expanduser('~/.kimi-code/server/lock')))['port'])" 2>/dev/null || python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/.kimi-code/server/lock')))['port'])")/api/v1/sessions/<retiring_id>/export" \
     -o ~/.kimi-tunnel/export-<retiring_id>.zip

   # 归档（归档后 session 从 REST 列表消失，wire.jsonl 仍保留在磁盘）
   curl -s -X POST -H "Authorization: Bearer $(cat ~/.kimi-code/server.token)" \
     -H "Content-Type: application/json" -d '{}' \
     "http://127.0.0.1:<port>/api/v1/sessions/<retiring_id>:archive"
   → 期望 {"code":0,"data":{"archived":true}}
```

完成标准行（约 107 行）替换为：

```
**完成标准**：memory_archive 返回成功 + 3 条 memory_set 全部写入 + `:archive` 返回 `archived:true`（0.24+）。若 session 无有价值的发现，memory_archive 可跳过（handoff 数据必须写入）；`:archive`/`/export` 失败（老引擎不支持或网络异常）降级为仅记忆归档，不阻塞 pipeline，汇报中注明降级。
```

- [ ] **步骤 2：Edge Cases 表追加一行**

在 Edge Cases 表（约 208-215 行）末尾追加：

```
| 服务端 `:archive` 失败（老引擎/网络异常） | 归档是增强而非必需：wire.jsonl 仍在磁盘，list_sessions 走文件解析不受影响 | Phase 2 步骤⑦捕获非 0 code 即降级，继续 Phase 3，汇报注明 |
```

- [ ] **步骤 3：Commit**

```bash
git add skills/session-retire/SKILL.md
git commit -m "feat: session-retire 接入服务端归档——Phase 2 追加 :export/:archive 步骤（任务 3/5）"
```

**验收标准：**
- [ ] Phase 2 含步骤⑦，curl 命令完整可执行（token/lock 模式与 poll-command 一致）
- [ ] 降级路径明确（归档失败不阻塞）
- [ ] 无其他段落被改动

**依赖：** 无
**预估规模：** S

---

### 任务 4：0.27 e2e 复验（grade_step / run_flow / watch 输出）

**描述：** 任务 1-3 部署（build + 用户 /reload）后，用 MCP 工具在真实 0.27 server 上复验三条尚未 e2e 过的链路。纯验证任务，发现异常立即停下汇报，不自行修复。

**文件：** 无代码改动（验证记录写入 commit message 与汇报）

- [ ] **步骤 1：watch 输出链路**

```
① set_watch_output(path="D:/code/kimi-session-orchestrator/.kimi-tunnel/watch-e2e.json")
② create_session(cwd, permission_mode="auto") → execute_prompt(auto_mode, "回复 ok 两个字")
③ 用 poll_command 后台等完成
④ Read .kimi-tunnel/watch-e2e.json → 期望 status:"completed"、result 非空含 "ok"
```

- [ ] **步骤 2：grade_step 链路**

```
对步骤①的 session 执行：
grade_step(session_id=<sid>, criteria="回复应包含 ok 字样")
→ 期望返回 pass/fail 判定与反馈（grader session 创建 + sendPrompt 全链路）
```

- [ ] **步骤 3：run_flow 链路**

```
run_flow(cwd, steps=["读取 package.json 的 name 字段并回复", "回复上一步 name 值加一个字 'ok'"])
→ poll_session 跟踪至完成，list_io_records 确认两步均有回复
```

- [ ] **步骤 4：收尾清理**

```
对本次新建的 session 逐个 POST :archive（body {}）归档；
删除 .kimi-tunnel/watch-e2e.json
```

- [ ] **步骤 5：Commit（验证记录）**

无代码变更则不 commit；若验证中发现问题并修复，单独 commit 并汇报。

**验收标准：**
- [ ] watch-e2e.json `status:"completed"` 且 result 非空（任务 1 修复的实证）
- [ ] grade_step 返回明确 pass/fail（grader 链路在 0.27 可用）
- [ ] run_flow 两步完成
- [ ] 新建 session 全部归档

**依赖：** 任务 1-2；**外部依赖：用户 /reload**
**预估规模：** M

---

### 任务 5：v2.18 收尾（版本面 + 文档）

**描述：** 版本面统一升 v2.18.0，CHANGELOG 与 AGENTS.md 记录，issue 文档 §七 P2 项标记闭环。

**文件：** `src/index.ts:17`、`src/mcp-server.ts:39`、`src/http-server.ts:83`、`src/tools/get-tunnel-status.ts:21`、`package.json:3`、`README.md:6`、`CHANGELOG.md`、`AGENTS.md`（头注）、`docs/issues/web-engine-027-adaptation.md`（§七）

- [ ] **步骤 1：版本面 5 处 + README badge**

```bash
sed -i 's/v2\.17\.1 Starting/v2.18.0 Starting/' src/index.ts
sed -i 's/"version": "2.17.1"/"version": "2.18.0"/' package.json
sed -i 's/version: "2.17.1"/version: "2.18.0"/' src/mcp-server.ts src/http-server.ts src/tools/get-tunnel-status.ts
sed -i 's/version-v2.17.1-brightgreen/version-v2.18-brightgreen/' README.md
```

- [ ] **步骤 2：CHANGELOG 条目**

`CHANGELOG.md` 顶部追加：

```markdown
## v2.18 — 2026-07-20

**0.27 适配收尾：watch 重置兜底 + turn 失败报错 + retire 服务端归档**

- fix: watch 文本重置兜底 `turn.started`——0.27 无 `prompt.submitted` 事件，多 prompt watch 不再累积旧文本
- feat: `sendPrompt` turn 失败显式报错——`turn.ended` 失败信号（`[code] message`）写入缓存并在等待结束后抛出，不再静默拉空回复
- feat: `session-retire` 接入服务端归档——Phase 2 追加 `:export`（ZIP 留档）+ `:archive`（REST 列表消失），失败降级不阻塞
- test: grade_step / run_flow / watch 输出 0.27 e2e 复验通过；单测增至 29 例
```

- [ ] **步骤 3：AGENTS.md 头注 + issue 文档 §七更新**

AGENTS.md 修改记录顶部追加一行（格式同既有）；issue 文档 §七 P2-3/P2-4 标记 ✅ 已实施，`prompt.submitted` 缺失从缺口清单移除。

- [ ] **步骤 4：终验 + Commit**

```bash
npm run build && npm test
git add -A
git commit -m "docs: v2.18 备案——版本面 + CHANGELOG + issue 文档收尾（任务 5/5）"
```

**验收标准：**
- [ ] 构建零错误，29/29 单测全绿
- [ ] 版本面 5 处一致为 2.18.0，文档与实际变更一致

**依赖：** 任务 1-4
**预估规模：** S

---

### 检查点：完成

- [ ] 全部验收标准满足
- [ ] `npm run build` 零错误，`npm test` 29/29
- [ ] e2e 复验三项通过
- [ ] 就绪合并 master + 部署（build → /reload）

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| turn.started 重置与 prompt.submitted 在 0.22.x 双重触发 | 文本重置两次（无害）；promptCount 只在 submitted 累加，0.27 下为 0（cosmetic） | 已在设计中规避计数重复；测试锁定两路径 |
| turn 失败报错影响既有调用方（WorkflowEngine/grade_step） | 这些调用方预期拿到空回复而非异常 | sendPrompt 抛错是行为变更：WorkflowEngine 的 catch 会按失败处理（合理）；grade_step 会在 turn 失败时得到异常而非空评分（更正确）。e2e 复验覆盖 grade_step |
| `:archive` 后 list_sessions 不可见 | PM 可能误以为 session 丢失 | skill 完成标准要求汇报注明已归档；wire.jsonl 保留磁盘可恢复 |
| REST 兜底路径 turn 失败仍静默 | WS 断连时退化为旧行为 | WS 已修复强制鉴权后稳定连接；文档注明该限制 |

## 待定问题

- `promptCount` 在 0.27 下恒为 0（无 prompt.submitted 事件）——是否改用 turn.started 计数？当前判断为 cosmetic 不处理，若 PM 面板依赖该字段再议
