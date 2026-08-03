import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSessionStatus } from "../dist/status-normalize.js";

// ── 旧模型（0.22.x）：status 字段优先，原样透传 ──
test("legacy: status enum passthrough", () => {
  assert.equal(normalizeSessionStatus({ status: "idle" }), "idle");
  assert.equal(normalizeSessionStatus({ status: "running" }), "running");
  assert.equal(normalizeSessionStatus({ status: "awaiting_approval" }), "awaiting_approval");
  assert.equal(normalizeSessionStatus({ status: "aborted" }), "aborted");
});

// ── 新模型（0.24+）：busy=true → running；但 pending_interaction 优先（实测：审批/提问时 busy 仍为 true） ──
test("busy model: busy=true → running", () => {
  assert.equal(normalizeSessionStatus({ busy: true }), "running");
});
test("busy model: busy=true + approval → awaiting_approval（pi 优先）", () => {
  assert.equal(
    normalizeSessionStatus({ busy: true }, { pending_interaction: "approval" }),
    "awaiting_approval"
  );
});
test("busy model: busy=true + question → awaiting_question（pi 优先）", () => {
  assert.equal(
    normalizeSessionStatus({ busy: true }, { pending_interaction: "question" }),
    "awaiting_question"
  );
});

// ── 新模型（0.24+）：busy=false → 看 pending_interaction ──
test("busy model: busy=false + no detail → idle", () => {
  assert.equal(normalizeSessionStatus({ busy: false }), "idle");
});
test("busy model: busy=false + pending_interaction=none → idle", () => {
  assert.equal(
    normalizeSessionStatus({ busy: false }, { pending_interaction: "none" }),
    "idle"
  );
});
test("busy model: busy=false + approval → awaiting_approval", () => {
  assert.equal(
    normalizeSessionStatus({ busy: false }, { pending_interaction: "approval" }),
    "awaiting_approval"
  );
});
test("busy model: busy=false + question → awaiting_question", () => {
  assert.equal(
    normalizeSessionStatus({ busy: false }, { pending_interaction: "question" }),
    "awaiting_question"
  );
});

// ── 0.31+ 适配：busy 含后台任务/持续活动，main_turn_active 才是主 turn 信号（v2.21） ──
test("0.31: busy=true + main_turn_active=false → idle（后台任务不阻塞判定）", () => {
  assert.equal(
    normalizeSessionStatus({ busy: true }, { main_turn_active: false }),
    "idle"
  );
});
test("0.31: busy=true + main_turn_active=true → running", () => {
  assert.equal(
    normalizeSessionStatus({ busy: true }, { main_turn_active: true }),
    "running"
  );
});
test("0.31: busy=false + main_turn_active=false → idle", () => {
  assert.equal(
    normalizeSessionStatus({ busy: false }, { main_turn_active: false }),
    "idle"
  );
});
test("0.31: pending_interaction 仍优先于 main_turn_active", () => {
  assert.equal(
    normalizeSessionStatus({ busy: true }, { main_turn_active: true, pending_interaction: "approval" }),
    "awaiting_approval"
  );
  assert.equal(
    normalizeSessionStatus({ busy: true }, { main_turn_active: false, pending_interaction: "question" }),
    "awaiting_question"
  );
});
test("0.31: main_turn_active 缺失 → 回退 busy（0.24-0.30 兼容）", () => {
  assert.equal(normalizeSessionStatus({ busy: true }, {}), "running");
  assert.equal(normalizeSessionStatus({ busy: false }, {}), "idle");
});

// ── 边界：两模型字段都缺失 → unknown（不误判） ──
test("edge: empty body → unknown", () => {
  assert.equal(normalizeSessionStatus({}), "unknown");
  assert.equal(normalizeSessionStatus({ status: "" }), "unknown");
});

// ── 边界：status 与 busy 同时存在时 status 优先（前向兼容） ──
test("edge: status wins over busy", () => {
  assert.equal(normalizeSessionStatus({ status: "idle", busy: true }), "idle");
});

// ── 边界：busy 非布尔值 → unknown（严格相等判定，不做真值判断） ──
test("edge: non-boolean busy → unknown", () => {
  assert.equal(normalizeSessionStatus({ busy: null }), "unknown");
  assert.equal(normalizeSessionStatus({ busy: "true" }), "unknown");
});

// ── 边界：sessionBody 存在但无 pending_interaction → idle ──
test("edge: busy=false + detail without pending_interaction → idle", () => {
  assert.equal(normalizeSessionStatus({ busy: false }, {}), "idle");
});
