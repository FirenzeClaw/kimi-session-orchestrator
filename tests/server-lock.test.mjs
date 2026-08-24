import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// KIMI_CODE_HOME 注入隔离家目录（对齐 session-store 约定；server-lock 读取该变量）
let tmpHome = "";
const realCodeHome = process.env.KIMI_CODE_HOME;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "srvlock-"));
  process.env.KIMI_CODE_HOME = tmpHome;
});

after(() => {
  if (realCodeHome === undefined) {
    delete process.env.KIMI_CODE_HOME;
  } else {
    process.env.KIMI_CODE_HOME = realCodeHome;
  }
  if (tmpHome) {
    try { rmSync(tmpHome, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

function writeInstance(id, content) {
  const dir = join(tmpHome, "server", "instances");
  mkdirSync(dir, { recursive: true });
  const p = join(dir, `${id}.json`);
  writeFileSync(p, JSON.stringify(content));
  return p;
}

test("实例文件存在且 PID 已死（陈旧）→ 仍返回其 URL，文件不被删除或修改", async () => {
  const { detectKimiServerUrl } = await import("../dist/server-lock.js");
  const p = writeInstance("stale-1", {
    host: "127.0.0.1", port: 59999,
    pid: 99999999, // 必然不存在的 PID
    started_at: Date.now() - 3600_000,
    heartbeat_at: Date.now() - 120_000, // 远超旧 30s 心跳阈值
  });
  const before = readFileSync(p, "utf-8");
  const url = detectKimiServerUrl();
  assert.equal(url, "http://127.0.0.1:59999");
  // 只读：内容未变、文件仍在
  assert.equal(readFileSync(p, "utf-8"), before);
  assert.equal(existsSync(p), true);
});

test("legacy server/lock 格式仍支持", async () => {
  const { detectKimiServerUrl } = await import("../dist/server-lock.js");
  const dir = join(tmpHome, "server");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "lock"), JSON.stringify({ host: "127.0.0.1", port: 51234 }));
  assert.equal(detectKimiServerUrl(), "http://127.0.0.1:51234");
});

test("多实例：返回第一个可读实例文件", async () => {
  const { detectKimiServerUrl } = await import("../dist/server-lock.js");
  writeInstance("a", { host: "127.0.0.1", port: 10001 });
  writeInstance("b", { host: "127.0.0.1", port: 10002 });
  assert.equal(detectKimiServerUrl(), "http://127.0.0.1:10001");
});

test("损坏 JSON 跳过，仍可读到后续有效实例", async () => {
  const { detectKimiServerUrl } = await import("../dist/server-lock.js");
  const dir = join(tmpHome, "server", "instances");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "broken.json"), "{not json");
  writeInstance("ok", { host: "127.0.0.1", port: 10003 });
  assert.equal(detectKimiServerUrl(), "http://127.0.0.1:10003");
});

test("无实例文件 → fallback 5494", async () => {
  const { detectKimiServerUrl } = await import("../dist/server-lock.js");
  assert.equal(detectKimiServerUrl(), "http://127.0.0.1:5494");
});