import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TunnelServices } from "../types.js";

export function registerMemoryStatus(server: McpServer, services: TunnelServices): void {
  const { memoryStore } = services;
  server.tool(
    "memory_status",
    "查看当前项目知识库整体状态：条目数、最后更新时间、过期条目列表、各命名空间分布。",
    {},
    () => {
      if (!memoryStore) {
        return {
          content: [{ type: "text", text: "知识库未初始化。在项目根目录创建 .kimi-tunnel/ 目录以启用共享内存功能。" }],
          isError: true,
        };
      }

      try {
        const status = memoryStore.status();
        return {
          content: [{
            type: "text",
            text: JSON.stringify(status, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `查询状态失败: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
