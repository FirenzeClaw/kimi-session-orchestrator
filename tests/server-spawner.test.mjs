import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// KIMI_CODE_HOME + KIMI_TUNNEL_HOME 注入隔离目录
let tmpHome = "";
const realCodeHome = process.env.KIMI_CODE_HOME;
const realTunnelHome = process.env.KIMI_TUNNEL_HOME;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "spawner-"));
  process.env.KIMI_CODE_HOME = tmpHome;
  process.env.KIMI_TUNNEL_HOME = join(tmpHome, "tunnel");
});

after(() => {
  if (realCodeHome === undefined) delete process.env.KIMI_CODE_HOME;
  else process.env.KIMI_CODE_HOME = realCodeHome;
  if (realTunnelHome === undefined) delete process.env.KIMI_TUNNEL_HOME;
  else process.env.KIMI_TUNNEL_HOME = realTunnelHome;
  if (tmpHome) {
    try { rmSync(tmpHome, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

function writeInstance(port) {
  const dir = join(tmpHome, "server", "instances");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "x.json"), JSON.stringify({ host: "127.0.0.1", port }));
}

test("resolveKimiBin: KIMI_BIN env 优先", async () => {
  const { resolveKimiBin } = await import("../dist/server-spawner.js");
  process.env.KIMI_BIN = "D:/fake/kimi.exe";
  try {
    assert.equal(resolveKimiBin(), "D:/fake/kimi.exe");
  } finally {
    delete process.env.KIMI_BIN;
  }
});

test("resolveKimiBin: KIMI_CODE_HOME/bin/kimi 存在时返回它", async () => {
  const { resolveKimiBin } = await import("../dist/server-spawner.js");
  mkdirSync(join(tmpHome, "bin"), { recursive: true });
  writeFileSync(join(tmpHome, "bin", "kimi"), "");
  assert.equal(resolveKimiBin(), join(tmpHome, "bin", "kimi"));
});

test("resolveKimiBin: 无 env 无已知路径 → null（交给 PATH）", async () => {
  const { resolveKimiBin } = await import("../dist/server-spawner.js");
  assert.equal(resolveKimiBin(), null);
});

test("probeUrl: 可达端口 → true", async () => {
  const { probeUrl } = await import("../dist/server-spawner.js");
  const srv = createServer();
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  try {
    assert.equal(await probeUrl(`http://127.0.0.1:${port}`), true);
  } finally {
    srv.close();
  }
});

test("probeUrl: 未监听端口 → false", async () => {
  const { probeUrl } = await import("../dist/server-spawner.js");
  assert.equal(await probeUrl("http://127.0.0.1:1"), false);
});

test("spawnKimiWebIfNeeded: 已有可达实例 → spawned:false 不激活", async () => {
  const { spawnKimiWebIfNeeded } = await import("../dist/server-spawner.js");
  const srv = createServer();
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  writeInstance(port);
  try {
    const r = await spawnKimiWebIfNeeded({ timeoutMs: 3000 });
    assert.equal(r.spawned, false);
    assert.equal(r.url, `http://127.0.0.1:${port}`);
  } finally {
    srv.close();
  }
});

test("spawnKimiWebIfNeeded: 互斥已存在 + 他方实例文件就绪 → 等待并复用", async () => {
  const { spawnKimiWebIfNeeded } = await import("../dist/server-spawner.js");
  mkdirSync(join(process.env.KIMI_TUNNEL_HOME, "spawn.lock"), { recursive: true });
  setTimeout(() => writeInstance(40999), 500);
  const r = await spawnKimiWebIfNeeded({ timeoutMs: 5000 });
  assert.equal(r.spawned, false);
  assert.equal(r.url, "http://127.0.0.1:40999");
});

test("spawnKimiWebIfNeeded: 互斥已存在但超时无实例 → 返回当前探测结果（fallback）", async () => {
  const { spawnKimiWebIfNeeded } = await import("../dist/server-spawner.js");
  mkdirSync(join(process.env.KIMI_TUNNEL_HOME, "spawn.lock"), { recursive: true });
  const r = await spawnKimiWebIfNeeded({ timeoutMs: 2500 });
  assert.equal(r.spawned, false);
  assert.equal(r.url, "http://127.0.0.1:5494");
});