import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { TunnelServices } from "./types.js";
import { registerCoreTools, registerOptionalTools, OPTIONAL_TOOLS } from "./tools/manifest.js";

export async function startMcpServer(services: TunnelServices): Promise<void> {
  const server = new McpServer({
    name: "kimi-session-orchestrator",
    version: "2.24.0",
    description:
      "Kimi Code CLI 调试隧道 v2——通过 WebSocket Wire 协议实现推送式全自动化 session 统筹。支持多轮对话编排、实时流式响应、智能思考过滤。",
  });

  // v2.23 可选部署：审批流/工作流引擎/watch族/推送 14 个工具默认注册；
  // KIMI_TUNNEL_OPTIONAL_TOOLS=core 时跳过（本机部署配置示例见 README「可选工具部署」）
  registerCoreTools(server, services);

  const optionalEnabled = process.env.KIMI_TUNNEL_OPTIONAL_TOOLS !== "core";
  if (optionalEnabled) {
    registerOptionalTools(server, services);
  } else {
    process.stderr.write(
      `[kimi-session-orchestrator] 可选工具已禁用（KIMI_TUNNEL_OPTIONAL_TOOLS=core，跳过 ${OPTIONAL_TOOLS.length} 个: ${OPTIONAL_TOOLS.join(", ")}）\n`
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[kimi-session-orchestrator] MCP server connected via stdio\n");
}
