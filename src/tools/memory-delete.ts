import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TunnelServices } from "../types.js";

export function registerMemoryDelete(server: McpServer, services: TunnelServices): void {
  const { memoryStore, tunnelProjectRoot } = services;
  server.tool(
    "memory_delete",
    "删除指定键。仅 PM 或写入者有权删除。",
    {
      namespace: z.string().describe("命名空间路径。"),
      key: z.string().describe("要删除的键名。"),
      project: z.string().optional().describe("目标项目的绝对路径（如 D:/code/project-a）。省略则使用当前项目。"),
    },
    ({ namespace, key, project }) => {
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
