import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TunnelServices } from "../types.js";

export function registerMemoryGet(server: McpServer, services: TunnelServices): void {
  const { memoryStore } = services;
  server.tool(
    "memory_get",
    "读取指定命名空间下的条目。不指定 key 则返回全部条目。支持过滤已过期条目。",
    {
      namespace: z.string().describe('命名空间路径，如 "project/meta"。'),
      key: z.string().optional().describe("条目键名，省略则返回该 namespace 下全部条目。"),
      include_expired: z.boolean().optional().default(false).describe("是否包含已过期条目。"),
    },
    ({ namespace, key, include_expired }) => {
      if (!memoryStore) {
        return {
          content: [{ type: "text", text: "知识库未初始化。在项目根目录创建 .kimi-tunnel/ 目录以启用共享内存功能。" }],
          isError: true,
        };
      }

      try {
        const entries = memoryStore.get(namespace, key, include_expired);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              namespace,
              entries: entries.map((e) => ({
                key: e.key,
                value: e.value,
                version: e.version,
                expired: e.expired,
                source_session_id: e.sourceSessionId,
                updated_at: e.updatedAt,
              })),
              count: entries.length,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `读取失败: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
