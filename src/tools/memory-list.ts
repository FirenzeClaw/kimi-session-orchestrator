import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TunnelServices } from "../types.js";

export function registerMemoryList(server: McpServer, services: TunnelServices): void {
  const { memoryStore } = services;
  server.tool(
    "memory_list",
    "列出指定命名空间下所有键名，不含值体。支持前缀匹配快速浏览。省略参数列出所有命名空间。",
    {
      namespace: z.string().optional().describe("命名空间前缀，如 project/。省略则列出全部。"),
    },
    ({ namespace }) => {
      if (!memoryStore) {
        return {
          content: [{ type: "text", text: "知识库未初始化。在项目根目录创建 .kimi-tunnel/ 目录以启用共享内存功能。" }],
          isError: true,
        };
      }

      try {
        const list = memoryStore.list(namespace);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              namespaces: list,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `列出失败: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
