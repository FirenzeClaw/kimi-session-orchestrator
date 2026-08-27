import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { POLL_SCRIPT } from "../dist/poll-command.js";

const execFileP = promisify(execFile);

/**
 * 接线级验证（v2.25 统一容错）：真实运行 dist 构建出的 poll.py 全脚本，
 * 用 mock Kimi Server 复现「上游报错 → 回执无效 → 自动注入"继续"×3 → exit 5」。
 *
 * mock 行为：status 恒 busy:false（idle 分支）；messages 返回空文本 assistant；
 * prompts 记录每次 POST body。wire.jsonl fixture 含近期 step.end finishReason=error
 * （2026-08-27 cc54fc49 实际故障形态）。KIMI_POLL_RESUME_GRACE=1 加速启动宽限（非观察期）。
 */

test("poll.py 端到端：上游报错形态自动注入\"继续\"×3 后落标记 exit 5 回调 PM", async () => {
  const promptsSeen = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.method === "POST" && req.url.includes("/prompts")) promptsSeen.push(body);
      res.setHeader("Content-Type", "application/json");
      if (req.url.endsWith("/status")) {
        res.end(JSON.stringify({ data: { busy: false } }));
      } else if (req.url.replace(/\?.*$/, "").endsWith(`/sessions/${sid}`)) {
        res.end(JSON.stringify({ data: { pending_interaction: "none" } }));
      } else if (req.url.includes("/messages")) {
        res.end(JSON.stringify({ data: { items: [{ content: [{ type: "text", text: "" }] }] } }));
      } else if (req.method === "POST" && req.url.includes("/prompts")) {
        res.end(JSON.stringify({ data: {} }));
      } else {
        res.statusCode = 200;
        res.end(JSON.stringify({ data: {} }));
      }
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  const home = mkdtempSync(join(tmpdir(), "pollrecovery-"));
  const sid = "ses_fixture_recovery";
  try {
    // lock 文件：脚本要求至少一个实例文件提供端口
    const instDir = join(home, ".kimi-code", "server", "instances");
    mkdirSync(instDir, { recursive: true });
    // marker/result 写入目标：~/.kimi-tunnel 由隧道在生产预建，测试环境需自建
    mkdirSync(join(home, ".kimi-tunnel"), { recursive: true });
    writeFileSync(join(instDir, "fake.json"), JSON.stringify({ port }));

    // wire 日志：近期(25s前) step.end=error —— 上游报错形态
    const wireDir = join(home, ".kimi-code", "sessions", "wd_t", sid, "agents", "main");
    mkdirSync(wireDir, { recursive: true });
    const t = Math.floor(Date.now() / 1000);
    const fx = [
      JSON.stringify({ type: "turn.prompt", time: t - 40, input: [{ type: "text", text: "task" }] }),
      JSON.stringify({ type: "llm.request", time: t - 26 }),
      JSON.stringify({ type: "context.append_loop_event", time: t - 25, event: { type: "step.end", finishReason: "error" } }),
    ].join("\n");
    writeFileSync(join(wireDir, "wire.jsonl"), fx + "\n");

    // 部署 poll.py 到隔离家目录的 .kimi-tunnel/poll.py？——不需要：
    // 直接以文件参数运行 dist 导出的 POLL_SCRIPT 写入临时路径。
    const pollPyPath = join(home, "poll-under-test.py");
    writeFileSync(pollPyPath, POLL_SCRIPT);

    let err = null;
    let childStdout = "";
    // 代理无关性由脚本自身保证（install_opener 空 ProxyHandler），这里不设置任何代理相关变量
    const childEnv = {
      ...process.env,
      USERPROFILE: home, HOME: home,
      KIMI_POLL_RESUME_GRACE: "1", PYTHONIOENCODING: "utf-8",
    };
    try {
      // 必须异步：同进程内的 mock server 依赖事件循环 accept/respond，
      // execFileSync 会造成「python 等响应 ↔ node 无法处理连接」死锁（实测恒 3×12s 超时 exit 2）
      ({ stdout: childStdout } = await execFileP(
        "python",
        [pollPyPath, sid, `http://127.0.0.1:${port}`, "default", "900", "3", "2"],
        { env: childEnv, timeout: 60000 }
      ));
    } catch (e) {
      err = e;
    }
    if (!err || (err.code ?? err.status) !== 5) {
      // 失败现场直出：能看到脚本走到了哪一步、败在哪类请求
      console.error("=== child exit:", err?.status, "===");
      console.error("--- stdout ---\n" + String(err?.stdout ?? childStdout ?? "(empty)"));
      console.error("--- stderr ---\n" + String(err?.stderr ?? "(empty)").slice(0, 800));
    }

    assert.ok(err, "应因 3 次注入无效而以退出码 5 结束");
    // 注意：promisified execFile 的非零码挂在 err.code（err.status 属于 execSync API）
    assert.equal(err.code ?? err.status, 5);
    const outText = String(childStdout ?? "") || String(err?.stdout ?? "");
    assert.match(outText, /（1\/3）/);
    assert.match(outText, /（2\/3）/);
    assert.match(outText, /（3\/3）/);
    assert.match(outText, /\[POLL_BLOCKED\]/);

    // 三次注入均携带"继续"文本（json.dumps 默认 ensure_ascii，需解析后比对）
    assert.equal(promptsSeen.length, 3);
    for (const b of promptsSeen) {
      const parsed = JSON.parse(b);
      assert.equal(parsed?.content?.[0]?.text, "继续");
    }

    // 阻塞标记文件落地：kind + continue-sent + PM 建议动作
    const markerPath = join(home, ".kimi-tunnel", `poll-blocked-${sid}.md`);
    assert.ok(existsSync(markerPath), "标记文件应存在");
    const marker = readFileSync(markerPath, "utf-8");
    assert.match(marker, /kind: UPSTREAM_ERROR/);
    assert.match(marker, /continue-sent=3/);
    assert.match(marker, /异常未恢复/);

    // 结果文件被失败标记覆盖，防误读残留
    const resultPath = join(home, ".kimi-tunnel", `poll-result-${sid}.txt`);
    assert.ok(existsSync(resultPath));
    assert.match(readFileSync(resultPath, "utf-8"), /\[POLL_FETCH_FAILED\]/);
  } finally {
    rmSync(home, { recursive: true, force: true });
    server.close();
  }
});
