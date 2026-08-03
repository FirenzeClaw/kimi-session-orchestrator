/**
 * Generate a pure Python inline polling script (`python3 -c "..."`) that
 * waits for a session to become idle, then fetches and prints the assistant's
 * response. Wrapped in a single-line bash command with PYTHONIOENCODING=utf-8
 * for Windows emoji compatibility.
 *
 * Designed for `Bash(run_in_background=true)` — the OS process exits on completion,
 * timeout, or server disconnection, and the runtime injects a `<notification>`
 * into the coordinating session.
 *
 * Defenses:
 *   - Max N consecutive request failures → exit(2) "server unreachable"
 *   - Max total elapsed → exit(3) "timeout"
 *   - Lock file missing after retries → exit(4) "lock lost"
 *   - Context token threshold exceeded → warning printed but exit(0)
 *
 * Uses `python3` with `python` fallback in the shell wrapper for cross-platform
 * compatibility.
 *
 * Modification history:
 *   2026-08-03 | kimi-code (fix) | poll-result 失败标记：fetch 异常/无文本时写 [POLL_FETCH_FAILED] 覆盖旧文件，防 PM 误读残留（v2.21）
 *   2026-08-03 | kimi-code (fix) | 0.31+ busy 漂移：busy=true 补查详情 main_turn_active 判定主 turn（后台任务不再阻塞轮询；v2.21）
 *   2026-07-24 | kimi-code (fix) | 0.28+ 兼容：lock 路径 server/lock → server/instances/*.json 双格式，5 次重试遍历全部路径
 *   2026-07-20 | kimi-code (fix) | 0.24+ 适配：status 枚举 → busy/pending_interaction 双模型判定，消除 SERVER_OFFLINE 误报；busy=False 补查 pending_interaction 防审批中间态提前退出
 *   2026-07-16 | kimi-code (feat) | v2.16 预置脚本 + 降级：POLL_SCRIPT 常量、existsSync 短命令分支、fetch_result 写入 poll-result-{sid}.txt；路径规范化 \→/
 *   2026-07-16 | kimi-code (fix) | Bash→Python 重写：消除 node 依赖、LOCK_LOST 重试、退出码扩展 0/2/3/4
 *   2026-07-16 | kimi-code (feat) | v2.14 新增 parse_context() + CTX_HIGH 阈值检测
 *   2026-07-16 | kimi-code (feat) | 提取 POLL_SCRIPT 常量 + existsSync 文件检测分支（预置脚本优先）
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { detectKimiServerUrl } from "./server-lock.js";

export interface PollConfig {
  sessionId: string;
  baseUrl?: string;
  token?: string;
  maxWaitSeconds?: number;   // total timeout, default 300
  maxFailures?: number;       // consecutive curl failures to abort, default 3
}

export const POLL_SCRIPT = [
  "import sys, json, os, time, urllib.request",
  "sys.stdout.reconfigure(encoding='utf-8')",
  "",
  "sid = sys.argv[1]",
  "base_url = sys.argv[2] if sys.argv[2] != 'default' else ''",
  "token = sys.argv[3] if sys.argv[3] != 'default' else ''",
  "max_sec = int(sys.argv[4]) if len(sys.argv) > 4 else 300",
  "max_fails = int(sys.argv[5]) if len(sys.argv) > 5 else 3",
  "",
  "# ---- read lock (retry 5x sleep 3s) — 0.28+ instances compat ----",
  "server_dir = os.path.expanduser('~/.kimi-code/server')",
  "",
  "# helper: try to read port from a lock file, return port or None",
  "def try_lock(path):",
  "    try:",
  "        return json.load(open(path)).get('port')",
  "    except Exception:",
  "        return None",
  "",
  "# build lock path list: legacy server/lock first, then server/instances/*.json",
  "def get_lock_paths():",
  "    paths = [os.path.join(server_dir, 'lock')]  # legacy (<0.28)",
  "    inst = os.path.join(server_dir, 'instances')",
  "    if os.path.isdir(inst):",
  "        for f in sorted(os.listdir(inst)):",
  "            if f.endswith('.json'):",
  "                paths.append(os.path.join(inst, f))",
  "    return paths",
  "",
  "lock_paths = get_lock_paths()",
  "port = None",
  "for i in range(5):",
  "    for p in lock_paths:",
  "        port = try_lock(p)",
  "        if port:",
  "            break",
  "    if port:",
  "        break",
  "    time.sleep(3)",
  "",
  "if not port:",
  "    print(f'[LOCK_LOST] checked {len(lock_paths)} lock path(s) retries=5')",
  "    sys.exit(4)",
  "",
  "if not base_url:",
  "    base_url = f'http://127.0.0.1:{port}'",
  "",
  "# ---- build auth header helper ----",
  "def make_req(path):",
  "    req = urllib.request.Request(f'{base_url}{path}')",
  "    if token:",
  "        req.add_header('Authorization', f'Bearer {token}')",
  "    return req",
  "",
  "# ---- context threshold reader ----",
  "def read_ctx_threshold():",
  "    th_path = os.path.expanduser('~/.kimi-tunnel/ctx-threshold')",
  "    try:",
  "        return int(open(th_path).read().strip())",
  "    except:",
  "        return 36000",
  "",
  "# ---- fetch assistant reply ----",
  "def fetch_result():",
  "    result_path = os.path.expanduser(f'~/.kimi-tunnel/poll-result-{sid}.txt')",
  "    def mark_failed(reason):",
  "        # 失败标记覆盖旧文件，防 PM 误读上次残留结果（v2.21）",
  "        try:",
  "            with open(result_path, 'w', encoding='utf-8') as f:",
  "                f.write('[POLL_FETCH_FAILED] %s @ %s\\n' % (reason, time.strftime('%Y-%m-%dT%H:%M:%S')))",
  "        except Exception:",
  "            pass",
  "    try:",
  "        req = make_req(f'/api/v1/sessions/{sid}/messages?page_size=1&role=assistant')",
  "        data = json.load(urllib.request.urlopen(req, timeout=10))",
  "        for m in data.get('data', {}).get('items', []):",
  "            for b in m.get('content', []):",
  "                if b.get('type') == 'text' and b.get('text'):",
  "                    text = b['text']",
  "                    print(text)",
  "                    # Write to fixed path for PM quick-read (sid isolates parallel sessions)",
  "                    try:",
  "                        with open(result_path, 'w', encoding='utf-8') as f:",
  "                            f.write(text)",
  "                    except Exception:",
  "                        pass",
  "                    return",
  "        mark_failed('no text block in latest assistant message')",
  "    except Exception as e:",
  "        print(f'[fetch_result] {e}')",
  "        mark_failed(str(e))",
  "",
  "# ---- main polling loop ----",
  "start_ts = time.time()",
  "fails = 0",
  "while True:",
  "    elapsed = int(time.time() - start_ts)",
  "",
  "    # Guard: total timeout",
  "    if elapsed >= max_sec:",
  "        print(f'[POLL_TIMEOUT] 等待 {max_sec}s 超时，session 可能卡住或 server 离线')",
  "        fetch_result()",
  "        sys.exit(3)",
  "",
  "    # Poll session status",
  "    status = ''",
  "    ctx_tokens = ''",
  "    ctx_max = ''",
  "    try:",
  "        req = make_req(f'/api/v1/sessions/{sid}/status')",
  "        d = json.load(urllib.request.urlopen(req, timeout=10))",
  "        sdata = d.get('data', {})",
  "        # 双模型兼容: 0.22.x status 枚举优先; 0.24+ 按 busy 推导（见 API.md §五）",
  "        if sdata.get('status'):",
  "            status = sdata['status']",
  "        elif sdata.get('busy') is True:",
  "            # 0.31+ 实测：busy 含后台任务/持续活动（turn 结束后仍可能为 true），主 turn 判定补查详情",
  "            # （pending_interaction 优先于 main_turn_active，与 wire-client getSessionStatus 同策略）",
  "            status = 'running'",
  "            try:",
  "                req2 = make_req(f'/api/v1/sessions/{sid}')",
  "                d2 = json.load(urllib.request.urlopen(req2, timeout=10))",
  "                d2data = d2.get('data', {})",
  "                pi = d2data.get('pending_interaction', 'none')",
  "                if pi == 'approval':",
  "                    status = 'awaiting_approval'",
  "                elif pi == 'question':",
  "                    status = 'awaiting_question'",
  "                elif d2data.get('main_turn_active') is False:",
  "                    status = 'idle'",
  "            except Exception:",
  "                pass",
  "        elif sdata.get('busy') is False:",
  "            status = 'idle'",
  "            # 0.24+ 补查 pending_interaction: approval/question 暂停时 busy=false 但 turn 未完结",
  "            # （与 wire-client getSessionStatus 同一策略；取值 approval/question 为推断，未命中则保持 idle 兜底）",
  "            try:",
  "                req2 = make_req(f'/api/v1/sessions/{sid}')",
  "                d2 = json.load(urllib.request.urlopen(req2, timeout=10))",
  "                pi = d2.get('data', {}).get('pending_interaction', 'none')",
  "                if pi == 'approval':",
  "                    status = 'awaiting_approval'",
  "                elif pi == 'question':",
  "                    status = 'awaiting_question'",
  "            except Exception:",
  "                pass",
  "        ctx_tokens = sdata.get('context_tokens', '')",
  "        ctx_max = sdata.get('max_context_tokens', '')",
  "    except Exception:",
  "        pass",
  "",
  "    # Guard: server unreachable (empty status)",
  "    if not status:",
  "        fails += 1",
  "        if fails >= max_fails:",
  "            print(f'[SERVER_OFFLINE] 连续 {fails} 次请求失败，Kimi Server 可能已离线')",
  "            sys.exit(2)",
  "        time.sleep(3)",
  "        continue",
  "",
  "    fails = 0  # reset on success",
  "",
  "    if status in ('idle', 'aborted'):",
  "        # Context token check",
  "        if ctx_tokens:",
  "            try:",
  "                threshold = read_ctx_threshold()",
  "                if int(ctx_tokens) > threshold:",
  "                    cm = ctx_max or '?'",
  "                    print(f'[CTX_HIGH] {ctx_tokens} / {cm} tokens（阈值: {threshold}）— 建议 PM 评估退役')",
  "            except:",
  "                pass",
  "        print('---RESULT---')",
  "        fetch_result()",
  "        sys.exit(0)",
  "",
  "    time.sleep(2)",
].join("\n");

export function generatePollCommand(config: PollConfig): string {
  const { sessionId, token = "", maxWaitSeconds = 300, maxFailures = 3 } = config;
  const baseUrl = config.baseUrl || process.env.KIMI_SERVER_URL || detectKimiServerUrl();
  const effectiveToken = token || process.env.KIMI_SERVER_TOKEN || "";
  const safe = (v: string) => v.includes(" ") ? `"${v}"` : v;
  const args = `${safe(sessionId)} ${safe(baseUrl || "default")} ${safe(effectiveToken || "default")} ${maxWaitSeconds} ${maxFailures}`;

  const pollPyPath = `${homedir()}/.kimi-tunnel/poll.py`.replace(/\\/g, "/");

  if (existsSync(pollPyPath)) {
    // Prebuilt script available — short command
    return [
      `PYTHONIOENCODING=utf-8 python3 ${pollPyPath} ${args} 2>/dev/null`,
      `|| python ${pollPyPath} ${args}`,
    ].join(" \\\n   ");
  }

  // Degraded: inline full script
  const pyEncoded = POLL_SCRIPT.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const pythonLine = `python3 -c "${pyEncoded}" ${args}`;
  return [
    `PYTHONIOENCODING=utf-8 ${pythonLine} 2>/dev/null`,
    `|| ${pythonLine}`,
  ].join(" \\\n   ");
}
