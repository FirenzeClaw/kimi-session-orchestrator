/**
 * Generate a bash polling script that waits for a session to become idle,
 * then fetches and prints the assistant's response.
 *
 * Designed for `Bash(run_in_background=true)` — the OS process exits on completion,
 * timeout, or server disconnection, and the runtime injects a `<notification>`
 * into the coordinating session.
 *
 * Defenses:
 *   - Max 3 consecutive curl failures → exit(2) "server unreachable"
 *   - Max 300s total elapsed → exit(3) "timeout"
 *   - Empty/malformed STATUS → counted as failure
 *
 * Auto-detects python3 vs python for cross-platform compatibility.
 */

import { detectKimiServerUrl } from "./wire-client.js";

export interface PollConfig {
  sessionId: string;
  baseUrl?: string;
  token?: string;
  maxWaitSeconds?: number;   // total timeout, default 300
  maxFailures?: number;       // consecutive curl failures to abort, default 3
}

export function generatePollCommand(config: PollConfig): string {
  const baseUrl = config.baseUrl || process.env.KIMI_SERVER_URL || detectKimiServerUrl();
  const token = config.token || process.env.KIMI_SERVER_TOKEN || "";
  const authHeader = token ? `-H "Authorization: Bearer ${token}"` : "";
  const maxSeconds = config.maxWaitSeconds || 300;
  const maxFails = config.maxFailures || 3;

  return [
    `SID="${config.sessionId}"`,
    `BASE="${baseUrl}"`,
    `MAX_SEC=${maxSeconds}`,
    `MAX_FAILS=${maxFails}`,
    `PY=$(which python3 2>/dev/null || which python 2>/dev/null || echo python)`,
    `START_TS=$(date +%s)`,
    `FAILS=0`,
    ``,
    `parse_status() {`,
    `  curl -s --max-time 10 ${authHeader} "$BASE/api/v1/sessions/$SID/status" | \\`,
    `    $PY -c "import sys,json; d=json.load(sys.stdin).get('data',{}); print(d.get('status',''))"`,
    `}`,
    ``,
    `fetch_result() {`,
    `  PYTHONIOENCODING=utf-8 $PY -c "`,
    `import urllib.request, json, sys`,
    `req=urllib.request.Request(f'$BASE/api/v1/sessions/$SID/messages?page_size=1&role=assistant')`,
    `req.add_header('Authorization','Bearer ${token}')`,
    `try:`,
    ` with urllib.request.urlopen(req,timeout=10) as r:`,
    `  data=json.loads(r.read()).get('data',{})`,
    `  for m in data.get('items',[]):`,
    `   for b in m.get('content',[]):`,
    `    if b.get('type')=='text' and b.get('text'):`,
    `     print(b['text']); break`,
    `except Exception as e:`,
    ` print(f'[fetch_result] {e}')`,
    `"`,
    `}`,
    ``,
    `while true; do`,
    `  NOW=$(date +%s)`,
    `  ELAPSED=$((NOW - START_TS))`,
    ``,
    `  # Guard: total timeout`,
    `  if [ $ELAPSED -ge $MAX_SEC ]; then`,
    `    echo "[POLL_TIMEOUT] 等待 \${MAX_SEC}s 超时，session 可能卡住或 server 离线"`,
    `    fetch_result`,
    `    exit 3`,
    `  fi`,
    ``,
    `  STATUS=$(parse_status)`,
    ``,
    `  # Guard: server unreachable (empty STATUS after curl failure)`,
    `  if [ -z "$STATUS" ]; then`,
    `    FAILS=$((FAILS + 1))`,
    `    if [ $FAILS -ge $MAX_FAILS ]; then`,
    `      echo "[SERVER_OFFLINE] 连续 \${FAILS} 次请求失败，Kimi Server 可能已离线"`,
    `      exit 2`,
    `    fi`,
    `    sleep 3`,
    `    continue`,
    `  fi`,
    ``,
    `  # Reset fail counter on successful request`,
    `  FAILS=0`,
    ``,
    `  if [ "$STATUS" = "idle" ] || [ "$STATUS" = "aborted" ]; then`,
    `    echo "---RESULT---"`,
    `    fetch_result`,
    `    exit 0`,
    `  fi`,
    ``,
    `  sleep 2`,
    `done`,
  ].join("\n");
}
