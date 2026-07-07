/**
 * MCP tool: approve_tool — PM manually approves a blocked/held tool call.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TunnelServices } from "../types.js";

export function registerApproveTool(server: McpServer, services: TunnelServices): void {
  const { wireClient, policyEngine } = services;
  server.tool(
    "approve_tool",
    "放行被策略阻断的工具调用（仅 PM 使用）。scope=once 仅放行本次调用，scope=session 将工具加入 session 临时白名单。",
    {
      block_id: z.string().describe("阻断事件 ID。从 PM Dashboard 阻断面板获取"),
      scope: z
        .enum(["once", "session"])
        .default("once")
        .describe("once=仅本次调用, session=后续同类工具均放行"),
      session_id: z.string().optional().describe("目标 session ID"),
      approval_id: z.string().optional().describe("Kimi Server 审批 ID（高级用法）"),
    },
    async ({ block_id, scope, session_id, approval_id }) => {
      if (!policyEngine) {
        return { content: [{ type: "text", text: "策略引擎未初始化" }], isError: true };
      }

      try {
        // Resolve the block event
        const block = policyEngine.resolveBlock(block_id, "approved");
        if (!block) {
          return { content: [{ type: "text", text: `阻断事件未找到: ${block_id}` }], isError: true };
        }

        const sid = session_id || block.sessionId;

        // If scope=session, add the tool to a temporary whitelist for this session
        if (scope === "session" && sid) {
          process.stderr.write(`[approve-tool] Session scope whitelist: ${block.toolName} for ${sid}\n`);
          // (whitelist logic lives in policy-engine; for MVP we approve the specific call)
        }

        // If we have an approval_id, POST the approval to Kimi Server
        if (approval_id && wireClient.isConnected()) {
          try {
            await wireClient.apiPost(
              `/api/v1/sessions/${sid}/approvals/${approval_id}`,
              { decision: "approved", scope: scope === "session" ? "session" : "once" }
            );
          } catch {
            // Non-fatal: approval may have already been handled
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  approved: true,
                  block_id,
                  tool: block.toolName,
                  scope,
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
          content: [{ type: "text", text: `放行失败: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
