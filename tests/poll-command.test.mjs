import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { POLL_SCRIPT, generatePollCommand } from "../dist/poll-command.js";

// ── 生成侧：参数默认值与 env 覆盖 ──────────────────────────────────────────────

test("generatePollCommand: 默认参数 900s / 3 fails / 2 rounds（末行 args）", () => {
  const cmd = generatePollCommand({ sessionId: "s1", baseUrl: "http://127.0.0.1:9999" });
  const last = cmd.split("\n").filter(Boolean).pop() ?? "";
  assert.match(last, /s1 http:\/\/127\.0\.0\.1:9999 default 900 3 2$/);
});

test("generatePollCommand: KIMI_POLL_MAX_ROUNDS 覆盖轮数", () => {
  process.env.KIMI_POLL_MAX_ROUNDS = "5";
  try {
    const cmd = generatePollCommand({ sessionId: "s1", baseUrl: "http://127.0.0.1:9999" });
    const last = cmd.split("\n").filter(Boolean).pop() ?? "";
    assert.match(last, / 900 3 5$/);
  } finally {
    delete process.env.KIMI_POLL_MAX_ROUNDS;
  }
});

test("generatePollCommand: 显式 maxRounds 优先于 env", () => {
  process.env.KIMI_POLL_MAX_ROUNDS = "5";
  try {
    const cmd = generatePollCommand({ sessionId: "s1", baseUrl: "http://127.0.0.1:9999", maxRounds: 3 });
    const last = cmd.split("\n").filter(Boolean).pop() ?? "";
    assert.match(last, / 900 3 3$/);
  } finally {
    delete process.env.KIMI_POLL_MAX_ROUNDS;
  }
});

// ── 诊断侧：从 POLL_SCRIPT 提取诊断函数区段，Python 子进程跑真实判定 ──────────

const DIAG_START = "# ---- v2.24: blocked-session diagnosis";
const DIAG_END = "# ---- main polling loop ----";

function diagSnippet() {
  const lines = POLL_SCRIPT.split("\n");
  const start = lines.findIndex((l) => l.includes(DIAG_START));
  const end = lines.findIndex((l, i) => i > start && l.includes(DIAG_END));
  assert.ok(start > 0 && end > start, "诊断区段定位失败——POLL_SCRIPT 结构可能已变更");
  return lines.slice(start, end).join("\n");
}

/** 在隔离家目录构造 wire.jsonl + 包装脚本，运行 diagnose_blocked() 并返回输出 */
function runDiag(fixtureLines, env = {}) {
  const home = mkdtempSync(join(tmpdir(), "pollfixture-"));
  try {
    const sid = "ses_fixture_0001";
    const wireDir = join(home, ".kimi-code", "sessions", "wd_t", sid, "agents", "main");
    mkdirSync(wireDir, { recursive: true });
    writeFileSync(join(wireDir, "wire.jsonl"), fixtureLines.join("\n") + "\n");

    const wrapper = [
      "import sys, json, os, time, urllib.request",
      `sid = '${sid}'`,
      diagSnippet(),
      "print('DIAG:' + diagnose_blocked()[0] + '|' + diagnose_blocked()[1])",
    ].join("\n");
    const pyFile = join(home, "diag.py");
    writeFileSync(pyFile, wrapper);

    // USERPROFILE/HOME 指向隔离家目录：python expanduser 才命中 fixture
    return execFileSync("python", [pyFile], {
      env: { ...process.env, USERPROFILE: home, HOME: home, ...env },
      encoding: "utf-8",
    }).trim();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

const now = () => Math.floor(Date.now() / 1000);

test("diagnose: end_turn 完成 + 空回复 → NORMAL（纯工具回合，不干预）", () => {
  const out = runDiag([
    JSON.stringify({ type: "turn.prompt", time: now() - 50, input: [{ type: "text", text: "hi" }] }),
    JSON.stringify({ type: "context.append_loop_event", time: now() - 10, event: { type: "step.end", finishReason: "end_turn" } }),
  ]);
  assert.match(out, /DIAG:NORMAL\|/);
});

test("diagnose: 尾部错误条目 → ERROR", () => {
  const out = runDiag([
    JSON.stringify({ type: "turn.prompt", time: now() - 50, input: [{ type: "text", text: "go" }] }),
    JSON.stringify({ type: "some.error", time: now() - 5 }),
  ]);
  assert.match(out, /DIAG:ERROR\|/);
});

test("diagnose: 停滞 + image 内容 → IMAGE_BLOCK（图片关键词命中）", () => {
  const out = runDiag([
    JSON.stringify({ type: "turn.prompt", time: now() - 300, input: [{ type: "image", image_url: "x.png" }] }),
    JSON.stringify({ type: "context.append_loop_event", time: now() - 250, event: { type: "content.part", part: { type: "text", text: "分析这张图片" } } }),
  ]);
  assert.match(out, /DIAG:IMAGE_BLOCK\|/);
});

test("diagnose: 停滞 + 无 image 无 error → MODEL_TIMEOUT", () => {
  const out = runDiag([
    JSON.stringify({ type: "turn.prompt", time: now() - 300, input: [{ type: "text", text: "继续分析" }] }),
    JSON.stringify({ type: "context.append_loop_event", time: now() - 250, event: { type: "content.part", part: { type: "think", text: "思考中" } } }),
  ]);
  assert.match(out, /DIAG:MODEL_TIMEOUT\|/);
});

test("diagnose: 停滞不足阈值 → UNKNOWN（留给后续观察）", () => {
  const out = runDiag([
    JSON.stringify({ type: "turn.prompt", time: now() - 30, input: [{ type: "text", text: "快" }] }),
    JSON.stringify({ type: "context.append_loop_event", time: now() - 20, event: { type: "content.part", part: { type: "text", text: "x" } } }),
  ]);
  assert.match(out, /DIAG:UNKNOWN\|/);
});

test("diagnose: KIMI_POLL_STALL_SEC 缩短后停滞判定提前", () => {
  const out = runDiag(
    [
      JSON.stringify({ type: "turn.prompt", time: now() - 60, input: [{ type: "text", text: "继续分析" }] }),
    ],
    { KIMI_POLL_STALL_SEC: "30" }
  );
  assert.match(out, /DIAG:MODEL_TIMEOUT\|/);
});