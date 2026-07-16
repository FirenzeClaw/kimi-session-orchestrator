import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TunnelServices } from "../types.js";

export function registerMemoryArchive(server: McpServer, services: TunnelServices): void {
  const { memoryStore, tunnelProjectRoot } = services;
  server.tool(
    "memory_archive",
    "将指定 session 的 L2 findings 归档为 L1 learnings。PM 审查后调用。",
    {
      session_id: z.string().describe("要归档的源 session ID。"),
      target_namespace: z.string().optional().default("project/learnings").describe("目标命名空间，默认 project/learnings。"),
      keys: z.array(z.string()).optional().describe("指定要归档的键名，省略则归档该 session 全部 findings。"),
      project: z.string().optional().describe("目标项目的绝对路径（如 D:/code/project-a）。省略则使用当前项目。"),
    },
    ({ session_id, target_namespace, keys, project }) => {
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
