/**
 * MCP tool: list_policies — list all available policy files (built-in + custom).
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TunnelServices } from "../types.js";

export function registerListPolicies(server: McpServer, services: TunnelServices): void {
  const { policyEngine } = services;
  server.tool(
    "list_policies",
    "列出所有可用的权限策略。包括内置策略（read-only/safe-edit/full-access）和项目 .kimi-tunnel/policies/ 下的自定义策略文件。每个策略附带验证状态。",
    {},
    async () => {
      if (!policyEngine) {
        return {
          content: [{ type: "text", text: "策略引擎未初始化" }],
          isError: true,
        };
      }

      try {
        const cwd = process.cwd();
        const result = policyEngine.listPolicies(cwd);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  builtin: result.builtin,
                  custom: result.custom,
                  hint: '使用 create_session(policy="read-only") 或 create_session(policy=".kimi-tunnel/policies/<name>.yaml") 应用策略',
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `获取策略列表失败: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
