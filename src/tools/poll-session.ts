import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { pollSessionStatus } from "../session-manager.js";

export function registerPollSession(server: McpServer): void {
  server.tool(
    "poll_session",
    "轮询 session 运行状态。返回结构化状态报告：active/swarm/awaiting_approval/done/error/idle，以及行数、tool call 计数、告警列表。用于监控工作流是否正常运行或已卡住。",
    {
      session_id: z
        .string()
        .describe("目标 session ID。可从 list_sessions 或 create_session 获取。"),
    },
    async ({ session_id }) => {
      const status = await pollSessionStatus(session_id);

      if (!status) {
        return {
          content: [
            {
              type: "text",
              text: `Session "${session_id}" 未找到或日志不可读。`,
            },
          ],
          isError: true,
        };
      }

      // Human-readable state labels
      const stateLabels: Record<string, string> = {
        active: "🟢 运行中",
        swarm: "🟢 并行调度中",
        awaiting_approval: "🟡 等待审批",
        done: "✅ 已完成",
        error: "🔴 错误",
        idle: "⏳ 空闲",
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ...status,
                stateLabel: stateLabels[status.state] || status.state,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
