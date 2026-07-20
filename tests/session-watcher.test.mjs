import { test } from "node:test";
import assert from "node:assert/strict";
import { SessionWatcher } from "../dist/session-watcher.js";

// watch() 会启动 3s 轮询 interval，测试后必须停掉否则 node:test 进程不退出
function stop(w) {
  if (w.pollInterval) { clearInterval(w.pollInterval); w.pollInterval = null; }
}

// stub 工厂：sessionClient/statusClient 均为接口级假实现
function makeClients({ baseline, status = "idle" }) {
  let latest = baseline;
  const submitted = [];
  const sessionClient = {
    getLatestAssistantMessage: async () => latest,
    getSessionMessages: async () => [],
    submitPrompt: async (sid, text) => { submitted.push(text); return { promptId: "p" }; },
    setLatest(v) { latest = v; },
  };
  const statusClient = {
    getCachedStatus: () => status,
    getSessionStatus: async () => status,
  };
  return { sessionClient, statusClient, submitted, setLatest: (v) => { latest = v; } };
}

test("锚定：无新消息时 terminal 也不解析（防陈旧 idle 过早解析）", async () => {
  const { sessionClient, statusClient } = makeClients({ baseline: { id: "m1", text: "old" } });
  const w = new SessionWatcher(sessionClient, statusClient);
  const wid = await w.watch("s1");
  await w.pollAll();
  assert.equal(w.getResult(wid), null); // 仍在监听
  stop(w);
});

test("锚定：出现新 assistant 消息才解析，且返回新文本", async () => {
  const c = makeClients({ baseline: { id: "m1", text: "old" } });
  const w = new SessionWatcher(c.sessionClient, c.statusClient);
  const wid = await w.watch("s1");
  c.setLatest({ id: "m2", text: "fresh reply" });
  await w.pollAll();
  const r = w.getResult(wid);
  assert.equal(r.status, "done");
  assert.equal(r.result, "fresh reply");
  stop(w);
});

test("锚定：baseline 为 null（新 session 无历史消息）时首条回复即解析", async () => {
  const c = makeClients({ baseline: null });
  const w = new SessionWatcher(c.sessionClient, c.statusClient);
  const wid = await w.watch("s1");
  c.setLatest({ id: "m1", text: "first" });
  await w.pollAll();
  assert.equal(w.getResult(wid).result, "first");
  stop(w);
});

test("running 状态不解析", async () => {
  const c = makeClients({ baseline: { id: "m1", text: "old" }, status: "running" });
  const w = new SessionWatcher(c.sessionClient, c.statusClient);
  const wid = await w.watch("s1");
  c.setLatest({ id: "m2", text: "fresh" });
  await w.pollAll();
  assert.equal(w.getResult(wid), null);
  stop(w);
});

test("continueWatch：提交下一步后新 watch 以最新基线监听", async () => {
  const c = makeClients({ baseline: { id: "m1", text: "old" } });
  const w = new SessionWatcher(c.sessionClient, c.statusClient);
  const wid = await w.watch("s1");
  c.setLatest({ id: "m2", text: "fresh" });
  await w.pollAll(); // 解析 wid
  c.setLatest({ id: "m2", text: "fresh" }); // continue 时最新仍是 m2
  const r = await w.continueWatch(wid, "next step");
  assert.equal(r.ready, true);
  assert.equal(r.result, "fresh");
  assert.deepEqual(c.submitted, ["next step"]);
  // 新 watch 基线是 m2：m3 出现前不解析
  await w.pollAll();
  assert.equal(w.getResult(r.next_watch_id), null);
  c.setLatest({ id: "m3", text: "second reply" });
  await w.pollAll();
  assert.equal(w.getResult(r.next_watch_id).result, "second reply");
  stop(w);
});
