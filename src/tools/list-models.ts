import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TunnelServices } from "../types.js";
import { ensureConnected } from "./helpers.js";

/**
 * list_models — 列出当前 Kimi Server 可用模型别名（v2.22）。
 * 权威来源：GET /api/v1/models 的 model 字段（provider/别名 格式）。
 * create_session 的 model 参数应取本工具返回值；旧名（如 deepseek/deepseek-v4-pro）已失效。
 */
export function registerListModels(server: McpServer, services: TunnelServices): void {
  const { wireClient } = services;
  server.tool(
    "list_models",
    "列出当前 Kimi Server 可用的模型别名（GET /api/v1/models 的 model 字段，provider/别名 格式）。" +
      "create_session 的 model 参数应从此列表取值——0.31.1 实测如 deepseek/flash、deepseek/pro、kimi-code/k3；" +
      "旧名（deepseek/deepseek-v4-*）已失效，直接传入会导致首次 turn 失败。",
    {
      refresh: z
        .boolean()
        .optional()
        .default(false)
        .describe("true=强制刷新缓存（默认 30s TTL，一般无需传）"),
    },
    async ({ refresh }) => {
      if (!(await ensureConnected(services))) {
        return {
          content: [{ type: "text", text: "Wire client 未连接到 Kimi Server。请先执行 `kimi web --no-open` 启动。" }],
          isError: true,
        };
      }
      try {
        if (refresh) wireClient.clearModelsCache();
        const models = await wireClient.listModels();
        if (models.length === 0) {
          return {
            content: [{ type: "text", text: "模型列表为空（Kimi Server 未配置模型或接口异常）。" }],
            isError: true,
          };
        }
        const fmtCtx = (n?: number) => (n ? `${Math.round(n / 1024)}K` : "?");
        const rows = models
          .map((m) => `- \`${m.model}\` — ${m.display_name || ""}（上下文 ${fmtCtx(m.max_context_size)}）`)
          .join("\n");
        return {
          content: [
            {
              type: "text",
              text: `当前可用模型（${models.length} 个，未指定时 server 默认见 /api/v1/auth）：\n${rows}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `查询失败: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
