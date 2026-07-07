/**
 * MCP tool: deny_tool — PM manually denies a blocked/held tool call.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TunnelServices } from "../types.js";

export function registerDenyTool(server: McpServer, services: TunnelServices): void {
  const { wireClient, policyEngine } = services;
  server.tool(
    "deny_tool",
    "拒绝被策略阻断或待审批的工具调用（仅 PM 使用）",
    {
      block_id: z.string().describe("阻断事件 ID。从 PM Dashboard 阻断面板获取"),
      session_id: z.string().optional().describe("目标 session ID"),
      approval_id: z.string().optional().describe("Kimi Server 审批 ID（高级用法）"),
    },
    async ({ block_id, session_id, approval_id }) => {
      if (!policyEngine) {
        return { content: [{ type: "text", text: "策略引擎未初始化" }], isError: true };
      }

      try {
        const block = policyEngine.resolveBlock(block_id, "denied");
        if (!block) {
          return { content: [{ type: "text", text: `阻断事件未找到: ${block_id}` }], isError: true };
        }

        const sid = session_id || block.sessionId;

        // If we have an approval_id, POST denial to Kimi Server
        if (approval_id && wireClient.isConnected()) {
          try {
            await wireClient.apiPost(
              `/api/v1/sessions/${sid}/approvals/${approval_id}`,
              { decision: "rejected", reason: `PM 拒绝: ${block.toolName}` }
            );
          } catch {
            // Non-fatal
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  denied: true,
                  block_id,
                  tool: block.toolName,
                  session_id: sid,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `拒绝失败: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
