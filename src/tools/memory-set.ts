import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TunnelServices } from "../types.js";

export function registerMemorySet(server: McpServer, services: TunnelServices): void {
  const { memoryStore, tunnelProjectRoot } = services;
  server.tool(
    "memory_set",
    "写入一条键值对到指定命名空间，自动记录写入时间和来源 session。若 key 已存在则覆盖（upsert），version 递增。",
    {
      namespace: z.string().describe('命名空间路径，如 "project/meta"、"session/abc123/findings"。必须以 project/ 或 session/ 开头。'),
      key: z.string().describe('条目键名，不含 /。如 "tech_stack"、"coding_conventions"。'),
      value: z.string().describe("条目值，可为 JSON 字符串或纯文本。"),
      session_id: z.string().optional().describe("来源 session ID，用于追踪。"),
      expire: z.boolean().optional().default(false).describe("标记为已过期。PM 可在规范更新后标记旧条目。"),
      project: z.string().optional().describe("目标项目的绝对路径（如 D:/code/project-a）。省略则使用当前项目。"),
    },
    ({ namespace, key, value, session_id, expire, project }) => {
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

      // Validate namespace format
      if (!namespace.startsWith("project/") && !namespace.startsWith("session/")) {
        return {
          content: [{ type: "text", text: "命名空间必须以 project/ 或 session/ 开头。" }],
          isError: true,
        };
      }

      // Validate key
      if (!key || key.includes("/")) {
        return {
          content: [{ type: "text", text: "key 不能为空或包含 /。" }],
          isError: true,
        };
      }

      // Validate value
      if (!value) {
        return {
          content: [{ type: "text", text: "value 不能为空。" }],
          isError: true,
        };
      }

      // Validate value size (64KB limit to prevent abuse)
      if (Buffer.byteLength(value, "utf-8") > 65536) {
        return {
          content: [{ type: "text", text: "value 超过 64KB 上限。请拆分存储或使用更精简的内容。" }],
          isError: true,
        };
      }

      try {
        const entry = memoryStore.set(namespace, key, value, session_id, expire);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              ok: true,
              entry: {
                namespace,
                key,
                version: entry.version,
                expired: entry.expired,
                updated_at: entry.updatedAt,
              },
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `写入失败: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
