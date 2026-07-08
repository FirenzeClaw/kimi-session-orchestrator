import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TunnelServices } from "../types.js";

export function registerMemoryDelete(server: McpServer, services: TunnelServices): void {
  const { memoryStore } = services;
  server.tool(
    "memory_delete",
    "删除指定键。仅 PM 或写入者有权删除。",
    {
      namespace: z.string().describe("命名空间路径。"),
      key: z.string().describe("要删除的键名。"),
    },
    ({ namespace, key }) => {
      if (!memoryStore) {
        return {
          content: [{ type: "text", text: "知识库未初始化。在项目根目录创建 .kimi-tunnel/ 目录以启用共享内存功能。" }],
          isError: true,
        };
      }

      try {
        // Permission check: verify entry exists and check source
        const entries = memoryStore.get(namespace, key, true);
        if (entries.length === 0) {
          return {
            content: [{ type: "text", text: `条目不存在: ${namespace}/${key}` }],
            isError: true,
          };
        }

        memoryStore.delete(namespace, key);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              ok: true,
              deleted: `${namespace}/${key}`,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `删除失败: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
