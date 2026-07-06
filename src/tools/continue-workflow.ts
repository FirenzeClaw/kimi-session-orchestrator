import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TunnelServices } from "../types.js";

export function registerContinueWorkflow(server: McpServer, services: TunnelServices): void {
  server.tool(
    "continue_workflow",
    "对暂停的工作流执行决策：重试当前步骤、跳过、终止、或用自定义指令覆盖。用于处理工作流执行中遇到的阻塞。",
    {
      execution_id: z
        .string()
        .min(1)
        .describe("工作流执行 ID。从 execute_workflow 返回结果或 workflow_progress 推送中获取。"),
      decision: z
        .enum(["retry", "skip", "abort", "manual"])
        .describe(
          "决策类型：retry=重新执行当前步骤, skip=跳过当前步骤, abort=终止工作流, manual=用自定义指令覆盖当前步骤"
        ),
      instruction: z
        .string()
        .optional()
        .describe("自定义指令（仅 decision=manual 时使用），替换当前步骤的原始指令。"),
    },
    async ({ execution_id, decision, instruction }) => {
      if (!services.workflowEngine) {
        return {
          content: [{ type: "text", text: "WorkflowEngine 未初始化。" }],
          isError: true,
        };
      }

      try {
        const result = await services.workflowEngine.handleBlockage(
          execution_id,
          decision,
          { instruction }
        );

        if (!result) {
          return {
            content: [
              {
                type: "text",
                text: `执行 "${execution_id}" 未找到或已结束。执行 ID 可能已过期。`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  execution_id: result.executionId,
                  template: result.template,
                  session_id: result.sessionId,
                  status: result.status,
                  steps_completed: result.steps.filter(
                    (s) => s.status === "ok" || s.status === "adjusted"
                  ).length,
                  steps_total: result.steps.length,
                  summary: result.summary,
                  duration_ms: result.totalDuration,
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
              text: `继续工作流失败: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
