#!/usr/bin/env node
/**
 * Fix wire.jsonl for session affected by 400 "insufficient tool messages" error.
 * Usage: node fix-wire.js <path-to-wire.jsonl>
 */
const fs = require("fs");
const path = process.argv[2];
if (!path) {
  console.error("Usage: node fix-wire.js <path-to-wire.jsonl>");
  process.exit(1);
}

const lines = fs.readFileSync(path, "utf-8").split("\n").filter((l) => l.trim());
console.log(`Input: ${lines.length} lines`);

// 1. Extract metadata (first 4 lines: metadata, config, tools, config)
const meta = lines.slice(0, 4);

// 2. Find all turns with their boundaries
const turns = [];
let current = null;
for (let i = 4; i < lines.length; i++) {
  try {
    const e = JSON.parse(lines[i]);
    if (e.type === "turn.prompt") {
      if (current) turns.push(current);
      const text = (e.input || []).find((x) => x.type === "text")?.text || "";
      current = { start: i, end: i, prompt: text.slice(0, 200) };
    }
    if (
      current &&
      e.type === "context.append_loop_event" &&
      e.event?.type === "step.end" &&
      e.event?.finishReason === "end_turn"
    ) {
      current.end = i;
    }
  } catch {}
}
if (current) turns.push(current);

console.log(`Turns found: ${turns.length}`);

// 3. Keep last N turns with full detail, rest as summary
const KEEP = 3;
const lastTurns = turns.slice(-KEEP);
if (lastTurns.length === 0) {
  console.error("No complete turns found");
  process.exit(1);
}

const keepStart = lastTurns[0].start;
const keepEnd = lastTurns[lastTurns.length - 1].end;
const keepLines = lines.slice(keepStart, keepEnd + 1);

// 4. Build summary from earlier turns
const earlierPrompts = turns.slice(0, -KEEP).map((t, i) => `${i + 1}. ${t.prompt}`);
const summary =
  `之前 ${earlierPrompts.length} 轮对话摘要：\n` +
  earlierPrompts.join("\n").slice(0, 2000);

const now = Date.now();
const summaryEntries = [
  JSON.stringify({ type: "turn.prompt", input: [{ type: "text", text: summary }], origin: { kind: "user" }, time: now }),
  JSON.stringify({ type: "context.append_message", message: { role: "user", content: [{ type: "text", text: summary }], toolCalls: [], origin: { kind: "user" } }, time: now }),
];

// 5. Write output
const output = [...meta, ...summaryEntries, ...keepLines].join("\n") + "\n";

// Backup
fs.copyFileSync(path, path + `.bak.${Math.floor(Date.now() / 1000)}`);

// Write atomically via temp file
const tmp = path + ".tmp";
fs.writeFileSync(tmp, output);
fs.renameSync(tmp, path);

console.log(`Output: ${output.split("\n").filter((l) => l.trim()).length} lines`);
console.log(`Backup: ${path}.bak.*`);
