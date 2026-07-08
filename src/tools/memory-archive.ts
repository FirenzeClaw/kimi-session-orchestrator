import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TunnelServices } from "../types.js";

export function registerMemoryArchive(server: McpServer, services: TunnelServices): void {
  const { memoryStore } = services;
  server.tool(
    "memory_archive",
    "将指定 session 的 L2 findings 归档为 L1 learnings。PM 审查后调用。",
    {
      session_id: z.string().describe("要归档的源 session ID。"),
      target_namespace: z.string().optional().default("project/learnings").describe("目标命名空间，默认 project/learnings。"),
      keys: z.array(z.string()).optional().describe("指定要归档的键名，省略则归档该 session 全部 findings。"),
    },
    ({ session_id, target_namespace, keys }) => {
      if (!memoryStore) {
        return {
          content: [{ type: "text", text: "知识库未初始化。在项目根目录创建 .kimi-tunnel/ 目录以启用共享内存功能。" }],
          isError: true,
        };
      }

      try {
        const result = memoryStore.archive(session_id, target_namespace, keys);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              ok: true,
              ...result,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `归档失败: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
