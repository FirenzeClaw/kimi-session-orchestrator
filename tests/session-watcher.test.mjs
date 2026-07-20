import { test } from "node:test";
import assert from "node:assert/strict";
import { SessionWatcher } from "../dist/session-watcher.js";

// watch() 会启动 3s 轮询 interval，测试后必须停掉否则 node:test 进程不退出
function stop(w) {
  if (w.pollInterval) { clearInterval(w.pollInterval); w.pollInterval = null; }
}

// stub 工厂：sessionClient/statusClient 均为接口级假实现
function makeClients({ latest = null, status = "idle", submitAt = null }) {
  let cur = latest;
  let curSubmitAt = submitAt;
  const submitted = [];
  const sessionClient = {
    getLatestAssistantMessage: async () => cur,
    getLastSubmitAt: () => curSubmitAt,
    getSessionMessages: async () => [],
    submitPrompt: async (sid, text) => { submitted.push(text); curSubmitAt = Date.now(); return { promptId: "p" }; },
  };
  const statusClient = {
    getCachedStatus: () => status,
    getSessionStatus: async () => status,
  };
  return { sessionClient, statusClient, submitted, setLatest: (v) => { cur = v; } };
}

const NOW = Date.now();

test("时间锚：最新消息早于 watch 创建 → 不解析（防陈旧 idle 过早解析）", async () => {
  const c = makeClients({ latest: { id: "m1", text: "old", createdAt: NOW - 60000 }, submitAt: null });
  const w = new SessionWatcher(c.sessionClient, c.statusClient);
  const wid = w.watch("s1");
  await w.pollAll();
  assert.equal(w.getResult(wid), null);
  stop(w);
});

test("时间锚：最新消息晚于 watch 创建 → 解析新文本", async () => {
  const c = makeClients({ latest: { id: "m1", text: "old", createdAt: NOW - 60000 }, submitAt: null });
  const w = new SessionWatcher(c.sessionClient, c.statusClient);
  const wid = w.watch("s1");
  c.setLatest({ id: "m2", text: "fresh reply", createdAt: Date.now() });
  await w.pollAll();
  assert.equal(w.getResult(wid).result, "fresh reply");
  stop(w);
});

test("时间锚：turn 在 watch 创建前完成（submit 锚点）→ 仍正确解析（快 turn 竞态）", async () => {
  // submit 在 T-10s，turn 已完成，消息 createdAt=T-8s；watch 现在才创建——提交锚点生效
  const c = makeClients({
    latest: { id: "m1", text: "fast reply", createdAt: NOW - 8000 },
    submitAt: NOW - 10000,
  });
  const w = new SessionWatcher(c.sessionClient, c.statusClient);
  const wid = w.watch("s1");
  await w.pollAll();
  assert.equal(w.getResult(wid).result, "fast reply");
  stop(w);
});

test("running 状态不解析", async () => {
  const c = makeClients({
    latest: { id: "m1", text: "fresh", createdAt: Date.now() },
    status: "running",
    submitAt: NOW - 1000,
  });
  const w = new SessionWatcher(c.sessionClient, c.statusClient);
  const wid = w.watch("s1");
  await w.pollAll();
  assert.equal(w.getResult(wid), null);
  stop(w);
});

test("continueWatch：提交下一步后新 watch 以新锚点监听", async () => {
  const c = makeClients({
    latest: { id: "m1", text: "first reply", createdAt: NOW - 5000 },
    submitAt: NOW - 6000,
  });
  const w = new SessionWatcher(c.sessionClient, c.statusClient);
  const wid = w.watch("s1");
  await w.pollAll(); // 解析 wid（first reply 晚于 submitAt）
  const r = await w.continueWatch(wid, "next step");
  assert.equal(r.ready, true);
  assert.equal(r.result, "first reply");
  assert.deepEqual(c.submitted, ["next step"]);
  // 新 watch 锚点 = continueWatch 时刻（无 submit 记录）→ 旧消息不解析
  await w.pollAll();
  assert.equal(w.getResult(r.next_watch_id), null);
  c.setLatest({ id: "m2", text: "second reply", createdAt: Date.now() });
  await w.pollAll();
  assert.equal(w.getResult(r.next_watch_id).result, "second reply");
  stop(w);
});
