import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TunnelServices } from "../types.js";
import { orchestrateTask } from "../session-orchestrator.js";

export function registerChatWithSession(server: McpServer, services: TunnelServices): void {
  const { wireClient } = services;
  server.tool(
    "chat_with_session",
    "全自动多轮任务编排。向指定 session 发送任务需求，自动检测回复是否完成，必要时继续对话，直到任务完成或达到最大轮次。默认排除思考链，仅在回复模糊时自动读取思考内容以确认方向。",
    {
      session_id: z.string().describe("目标 session ID。可从 list_sessions 获取。"),
      task: z
        .string()
        .describe("任务需求描述。如'写一个 Python web scraper'或'审查 src/ 目录的代码'"),
      max_turns: z
        .number()
        .min(1)
        .max(20)
        .default(10)
        .describe("最大对话轮次上限"),
      include_thinking: z
        .boolean()
        .default(false)
        .describe("是否始终包含思考内容。默认 false，仅在回复模糊时自动读取"),
      auto_mode: z
        .boolean()
        .default(false)
        .describe(
          "启用自动模式：自动审批所有工具调用（scope=session），无需人工确认。用于全自动工作流回放。"
        ),
      wait: z
        .boolean()
        .default(false)
        .describe(
          "已废弃。受 MCP 超时限制，始终即发即返。用 poll_session / list_io_records 轮询进度。"
        ),
    },
    async ({ session_id, task, max_turns, include_thinking, auto_mode, wait }) => {
      if (!wireClient.isConnected()) {
        try {
          await wireClient.connect();
        } catch {
          return {
            content: [
              {
                type: "text",
                text: "Wire client 未连接到 Kimi Server。请先启动: kimi web --no-open",
              },
            ],
            isError: true,
          };
        }
      }

      wireClient.setSessionId(session_id);

      // Always fire-and-forget: orchestrateTask blocks up to 10min which exceeds MCP timeout.
      // Use list_io_records / poll_session to track progress.
      try {
        const { promptId } = await wireClient.submitPrompt(task, { autoApprove: auto_mode });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  submitted: true,
                  session_id,
                  prompt_id: promptId,
                  max_turns,
                  hint: "任务已提交，session 正在处理。请用 list_io_records 或 read_session_log 跟踪进度。",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `提交失败: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
