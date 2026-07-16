import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TunnelServices } from "../types.js";

export function registerMemoryList(server: McpServer, services: TunnelServices): void {
  const { memoryStore, tunnelProjectRoot } = services;
  server.tool(
    "memory_list",
    "列出指定命名空间下所有键名，不含值体。支持前缀匹配快速浏览。省略参数列出所有命名空间。",
    {
      namespace: z.string().optional().describe("命名空间前缀，如 project/。省略则列出全部。"),
      project: z.string().optional().describe("目标项目的绝对路径（如 D:/code/project-a）。省略则使用当前项目。"),
    },
    ({ namespace, project }) => {
      if (!memoryStore) {
        return {
          content: [{ type: "text", text: "知识库未初始化。在项目根目录创建 .kimi-tunnel/ 目录以启用共享内存功能。" }],
          isError: true,
        };
      }

      // Route to child project DB if specified
      if (project) {
        const resolved = memoryStore.resolveProjectRoot(project);
        if (!resolved) {
          return {
            content: [{ type: "text", text: `${project} 下未找到 .kimi-tunnel/ 目录` }],
            isError: true,
          };
        }
        // Guard: resolveProjectRoot may walk up to tunnel's .kimi-tunnel/ by mistake.
        // If the resolved root is the tunnel root but the requested project path is different,
        // the child project doesn't have its own .kimi-tunnel/ — return error.
        const normProject = project.replace(/\\/g, "/");
        const normTunnel = (tunnelProjectRoot || "").replace(/\\/g, "/");
        if (resolved === tunnelProjectRoot && normProject !== normTunnel) {
          return {
            content: [{ type: "text", text: `${project} 下未找到 .kimi-tunnel/ 目录` }],
            isError: true,
          };
        }
        memoryStore.ensureDb(resolved);
      } else {
        // Restore default DB (previous call with project may have switched)
        memoryStore.ensureDb(tunnelProjectRoot!);
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
