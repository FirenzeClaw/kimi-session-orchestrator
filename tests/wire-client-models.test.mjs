import { test } from "node:test";
import assert from "node:assert/strict";
import { WireClient } from "../dist/wire-client.js";

// TS private 仅编译期约束，.mjs 中可直接触达以做单测
function makeStubClient(models) {
  const c = new WireClient();
  c.connected = true;
  let calls = 0;
  c.transport = {
    apiGet: async () => {
      calls++;
      return { items: models };
    },
    apiPost: async () => ({ prompt_id: "p1", content: [] }),
  };
  return { c, countCalls: () => calls };
}

test("listModels：首次拉取并缓存（30s TTL 内不重复请求）", async () => {
  const { c, countCalls } = makeStubClient([
    { provider: "deepseek", model: "deepseek/flash", display_name: "Flash" },
    { provider: "deepseek", model: "deepseek/pro", display_name: "Pro" },
  ]);
  const first = await c.listModels();
  const second = await c.listModels();
  assert.equal(first.length, 2);
  assert.equal(first[0].model, "deepseek/flash");
  assert.equal(second, first); // 同一引用 = 缓存命中
  assert.equal(countCalls(), 1); // 仅一次 HTTP
});

test("listModels：clearModelsCache 后重新拉取", async () => {
  const { c, countCalls } = makeStubClient([{ provider: "x", model: "x/y" }]);
  await c.listModels();
  c.clearModelsCache();
  await c.listModels();
  assert.equal(countCalls(), 2);
});

test("listModels：拉取失败返回缓存或空（不抛异常）", async () => {
  const c = new WireClient();
  c.connected = true;
  c.transport = {
    apiGet: async () => {
      throw new Error("offline");
    },
    apiPost: async () => ({}),
  };
  const list = await c.listModels();
  assert.deepEqual(list, []); // 无缓存 → 空列表，不抛
});
