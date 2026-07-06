#!/usr/bin/env node
/**
 * Kimi Session Completion Monitor
 * 
 * Connects to Kimi Server WebSocket, subscribes to a target session,
 * waits for `prompt.completed` events, and writes results to a status file.
 * 
 * Usage:
 *   node watch-completion.mjs <session_id> [--output <path>] [--once]
 *   
 *   --output    Status file path (default: ./watch-status.json)
 *   --once      Exit after first completion (default: keep watching)
 * 
 * The coordinating session reads the status file:
 *   {
 *     "sessionId": "session_xxx",
 *     "status": "completed" | "watching" | "error",
 *     "result": "assistant text...",
 *     "seq": 42,
 *     "timestamp": "2026-07-06T..."
 *   }
 * 
 * Prerequisites:
 *   - Kimi Server running: kimi web --no-open --port 5494
 *   - KIMI_SERVER_TOKEN env var set (or --token argument)
 */

import { WebSocket } from "ws";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";

// ── Config ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const sessionId = args[0];
if (!sessionId) {
  console.error("Usage: node watch-completion.mjs <session_id> [--output <path>] [--once]");
  process.exit(1);
}

const once = args.includes("--once");
const outputIdx = args.indexOf("--output");
const outputPath = outputIdx >= 0 ? args[outputIdx + 1] : "./watch-status.json";
const tokenIdx = args.indexOf("--token");
const token = tokenIdx >= 0 ? args[tokenIdx + 1] : process.env.KIMI_SERVER_TOKEN || "";
const baseUrl = process.env.KIMI_SERVER_URL || "http://127.0.0.1:5494";
const wsUrl = baseUrl.replace(/^http/, "ws") + "/api/v1/ws";

// ── State ───────────────────────────────────────────────────────────────────────

const status = {
  sessionId,
  status: "connecting",
  result: "",
  seq: 0,
  timestamp: new Date().toISOString(),
};

function writeStatus() {
  try {
    writeFileSync(outputPath, JSON.stringify(status, null, 2), "utf-8");
  } catch (e) {
    process.stderr.write(`[watch] Failed to write status: ${e.message}\n`);
  }
}

// ── WebSocket ───────────────────────────────────────────────────────────────────

const ws = new WebSocket(wsUrl, {
  headers: { Authorization: `Bearer ${token}` },
});

let helloDone = false;
let subscribed = false;
let promptSeq = 0;
let assistantText = "";

ws.on("open", () => {
  ws.send(
    JSON.stringify({
      type: "client_hello",
      id: randomUUID(),
      payload: { client_id: "completion-watcher" },
    })
  );
});

ws.on("message", (raw) => {
  try {
    const frame = JSON.parse(raw.toString());
    const type = frame.type;

    if (type === "server_hello" && !helloDone) {
      helloDone = true;
      process.stderr.write(`[watch] Connected to Kimi Server, subscribing to ${sessionId.slice(0, 12)}...\n`);
      ws.send(
        JSON.stringify({
          type: "subscribe",
          id: randomUUID(),
          payload: { session_ids: [sessionId] },
        })
      );
      return;
    }

    if ((type === "subscribe_ack" || type === "ack") && !subscribed) {
      subscribed = true;
      status.status = "watching";
      writeStatus();
      process.stderr.write(`[watch] Watching ${sessionId.slice(0, 12)} (output: ${outputPath})\n`);
      return;
    }

    // ── Track prompt lifecycle ──────────────────────────────────────────────

    if (type === "prompt.submitted") {
      promptSeq = frame.seq || 0;
      assistantText = "";
    }

    if (type === "assistant.delta") {
      assistantText += (frame.payload?.delta || "");
    }

    if (type === "prompt.completed") {
      status.status = "completed";
      status.result = assistantText;
      status.seq = promptSeq;
      status.timestamp = new Date().toISOString();
      writeStatus();
      process.stderr.write(
        `[watch] COMPLETED: seq=${promptSeq}, text=${assistantText.length} chars\n`
      );

      if (once) {
        process.stderr.write(`[watch] Exiting (--once mode)\n`);
        ws.close();
        process.exit(0);
      }
    }

    if (type === "turn.ended") {
      status.turnReason = frame.payload?.reason || frame.reason || "";
    }

    if (type === "error") {
      status.status = "error";
      status.error = frame.payload?.message || frame.message || "unknown";
      writeStatus();
    }
  } catch {
    // Skip unparseable frames
  }
});

ws.on("error", (err) => {
  status.status = "error";
  status.error = err.message;
  writeStatus();
  process.stderr.write(`[watch] WS error: ${err.message}\n`);
});

ws.on("close", () => {
  if (status.status !== "completed" && status.status !== "error") {
    status.status = "disconnected";
    writeStatus();
  }
  process.stderr.write("[watch] Disconnected\n");
});
