import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TunnelServices } from "../types.js";

export function registerMemoryGet(server: McpServer, services: TunnelServices): void {
  const { memoryStore, tunnelProjectRoot } = services;
  server.tool(
    "memory_get",
    "读取指定命名空间下的条目。不指定 key 则返回全部条目。支持过滤已过期条目。",
    {
      namespace: z.string().describe('命名空间路径，如 "project/meta"。'),
      key: z.string().optional().describe("条目键名，省略则返回该 namespace 下全部条目。"),
      include_expired: z.boolean().optional().default(false).describe("是否包含已过期条目。"),
      project: z.string().optional().describe("目标项目的绝对路径（如 D:/code/project-a）。省略则使用当前项目。"),
    },
    ({ namespace, key, include_expired, project }) => {
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
