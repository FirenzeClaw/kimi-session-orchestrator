import { test } from "node:test";
import assert from "node:assert/strict";
import { WireClient } from "../dist/wire-client.js";

// stub 掉网络与等待，只验证 body 构建与 model 解析优先级
function makeStubClient(authDefault = "server/default-model") {
  const c = new WireClient();
  const captured = [];
  c.connected = true;
  c.transport = {
    apiGet: async () => ({ default_model: authDefault }),
    apiPost: async (path, body) => { captured.push(body); return { prompt_id: "p1" }; },
  };
  c.waitForStatus = async () => "idle";
  c.wsSubscribe = () => {};
  return { c, captured };
}

test("createSession 显式 model 优先于 server default", async () => {
  const { c, captured } = makeStubClient();
  c.sessionModels.set("s1", "deepseek/deepseek-v4-flash");
  await c.submitPrompt("s1", "hi");
  assert.equal(captured[0].model, "deepseek/deepseek-v4-flash");
});

test("无显式 model 时用 server /auth default_model", async () => {
  const { c, captured } = makeStubClient("kimi-code/k3");
  await c.submitPrompt("s1", "hi");
  assert.equal(captured[0].model, "kimi-code/k3");
});

test("server default 获取失败时省略 model 字段（不阻断提交）", async () => {
  const c = new WireClient();
  const captured = [];
  c.connected = true;
  c.transport = {
    apiGet: async () => { throw new Error("boom"); },
    apiPost: async (path, body) => { captured.push(body); return { prompt_id: "p1" }; },
  };
  c.waitForStatus = async () => "idle";
  c.wsSubscribe = () => {};
  await c.submitPrompt("s1", "hi");
  assert.equal("model" in captured[0], false);
});

test("/auth 只拉取一次（缓存）", async () => {
  const { c } = makeStubClient();
  let calls = 0;
  const origGet = c.transport.apiGet;
  c.transport.apiGet = async (...a) => { calls++; return origGet(...a); };
  await c.submitPrompt("s1", "hi");
  await c.submitPrompt("s1", "hi2");
  assert.equal(calls, 1);
});
