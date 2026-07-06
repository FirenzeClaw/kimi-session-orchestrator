import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TunnelServices } from "../types.js";

export function registerCreateSession(server: McpServer, services: TunnelServices): void {
  const { wireClient } = services;
  server.tool(
    "create_session",
    "创建新的 Kimi Code session。可指定工作目录和权限模式（auto/manual/yolo）。",
    {
      cwd: z
        .string()
        .describe("工作目录的绝对路径，如 D:/code/glass-desktop/scene"),
      title: z.string().optional().describe("Session 标题，可选"),
      permission_mode: z
        .enum(["manual", "yolo", "auto"])
        .default("auto")
        .describe("权限模式：auto=自动审批所有工具调用，manual=需确认，yolo=超级自动"),
      model: z.string().optional().describe("模型标识符，如 deepseek/deepseek-v4-pro"),
      thinking: z
        .enum(["off", "low", "medium", "high", "xhigh", "max"])
        .optional()
        .describe("思考级别，默认 max"),
    },
    async ({ cwd, title, permission_mode, model, thinking }) => {
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

      try {
        const result = await wireClient.createSession({
          cwd,
          title,
          permissionMode: permission_mode,
          model,
          thinking,
        });

        wireClient.setSessionId(result.sessionId);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  session_id: result.sessionId,
                  title: result.title,
                  cwd,
                  permission_mode,
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
              text: `创建 session 失败: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
