import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TunnelServices } from "../types.js";
import { flowOrchestrator } from "../flow-orchestrator.js";

export function registerRunFlow(server: McpServer, services: TunnelServices): void {
  const { wireClient } = services;
  server.tool(
    "run_flow",
    "分步流程执行引擎。创建 session 后逐步提交任务，隧道后台轮询等待每步完成后再自动提交下一步。即发即返，通过 poll_session 跟踪流程进度。",
    {
      cwd: z.string().describe("工作目录的绝对路径，如 D:/code/glass-desktop/scene"),
      steps: z
        .array(z.string())
        .min(1)
        .max(30)
        .describe("步骤描述数组。按顺序逐步执行，每步完成后自动进入下一步。"),
      auto_mode: z
        .boolean()
        .default(true)
        .describe("自动审批工具调用。默认 true。"),
      model: z.string().optional().describe("模型标识符，如 deepseek/deepseek-v4-pro"),
      thinking: z
        .enum(["off", "low", "medium", "high", "xhigh", "max"])
        .optional()
        .describe("思考级别，默认 max"),
    },
    async ({ cwd, steps, auto_mode, model, thinking }) => {
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

      try {
        // Create session without permission_mode to avoid Kimi Code injecting /auto
        const { sessionId } = await wireClient.createSession({ cwd, model, thinking });
        wireClient.setSessionId(sessionId);

        // Start background orchestration — submits step 0, polls every 15s, auto-advances
        flowOrchestrator.start(sessionId, wireClient, steps, auto_mode);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  session_id: sessionId,
                  cwd,
                  auto_mode,
                  total_steps: steps.length,
                  submitted: true,
                  mode: "background",
                  hint: `已创建 session 并启动后台分步执行（共 ${steps.length} 步，每步完成后自动提交下一步）。用 poll_session 跟踪进度。`,
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
              text: `流程执行失败: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
