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
          "是否等待编排完成。默认 false（即发即返），true 时阻塞等待全部轮次完成。建议用 list_io_records 轮询进度。"
        ),
    },
    async ({ session_id, task, max_turns, include_thinking, auto_mode, wait }) => {
      if (!wireClient.isConnected()) {
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

      wireClient.setSessionId(session_id);

      if (!wait) {
        // Fire-and-forget: submit initial prompt, return immediately
        try {
          const { promptId } = await wireClient.submitPrompt(task);
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

      const result = await orchestrateTask(wireClient, session_id, task, {
        maxTurns: max_turns,
        includeThinking: include_thinking,
        withCheckThinking: !include_thinking,
        autoApprove: auto_mode,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: result.success,
                turns: result.turns,
                result: result.finalResponse,
                summary: result.summary,
                error: result.error,
                hint: result.error && /timeout|timed out/i.test(result.error)
                  ? "目标 session 可能正忙。prompt 可能已注入——请用 read_session_log 或 list_io_records 检查进度。"
                  : undefined,
              },
              null,
              2
            ),
          },
        ],
        isError: !result.success,
      };
    }
  );
}
