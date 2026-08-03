/**
 * Tool manifest — single import point for all MCP tool registrars.
 * v2.11: Replaces 29 individual imports in mcp-server.ts.
 * v2.23: 拆 core/optional 分组——审批流/工作流引擎/watch族/推送 归可选组，
 *        由 KIMI_TUNNEL_OPTIONAL_TOOLS=core 关闭（可选部署，见 README）。
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TunnelServices } from "../types.js";
// 分组注册器需要本地绑定（re-export 不创建模块内绑定）
import { registerCreateSession } from "./create-session.js";
import { registerExecutePrompt } from "./execute-prompt.js";
import { registerChatWithSession } from "./chat-with-session.js";
import { registerRunFlow } from "./run-flow.js";
import { registerStreamResponse } from "./stream-response.js";
import { registerListSessions } from "./list-sessions.js";
import { registerGetSessionInfo } from "./get-session-info.js";
import { registerReadSessionLog } from "./read-session-log.js";
import { registerListIORecords } from "./list-io-records.js";
import { registerPollSession } from "./poll-session.js";
import { registerLearnWorkflow } from "./learn-workflow.js";
import { registerListTemplates } from "./list-workflow-templates.js";
import { registerExecuteWorkflow } from "./execute-workflow.js";
import { registerContinueWorkflow } from "./continue-workflow.js";
import {
  registerWatchSession,
  registerGetWatchResult,
  registerContinueWatch,
  registerSetWatchOutput,
} from "./session-watch.js";
import { registerGetTunnelStatus } from "./get-tunnel-status.js";
import { registerListPolicies } from "./list-policies.js";
import { registerApproveTool } from "./approve-tool.js";
import { registerDenyTool } from "./deny-tool.js";
import { registerMemorySet } from "./memory-set.js";
import { registerMemoryGet } from "./memory-get.js";
import { registerMemoryList } from "./memory-list.js";
import { registerMemoryDelete } from "./memory-delete.js";
import { registerMemoryStatus } from "./memory-status.js";
import { registerMemoryArchive } from "./memory-archive.js";
import { registerGradeStep } from "./grade-step.js";
import { registerListModels } from "./list-models.js";

export { registerCreateSession } from "./create-session.js";
export { registerExecutePrompt } from "./execute-prompt.js";
export { registerChatWithSession } from "./chat-with-session.js";
export { registerRunFlow } from "./run-flow.js";
export { registerStreamResponse } from "./stream-response.js";

export { registerListSessions } from "./list-sessions.js";
export { registerGetSessionInfo } from "./get-session-info.js";
export { registerReadSessionLog } from "./read-session-log.js";
export { registerListIORecords } from "./list-io-records.js";
export { registerPollSession } from "./poll-session.js";

export { registerLearnWorkflow } from "./learn-workflow.js";
export { registerListTemplates } from "./list-workflow-templates.js";
export { registerExecuteWorkflow } from "./execute-workflow.js";
export { registerContinueWorkflow } from "./continue-workflow.js";
export {
  registerWatchSession,
  registerGetWatchResult,
  registerContinueWatch,
  registerSetWatchOutput,
} from "./session-watch.js";

export { registerGetTunnelStatus } from "./get-tunnel-status.js";

export { registerListPolicies } from "./list-policies.js";
export { registerApproveTool } from "./approve-tool.js";
export { registerDenyTool } from "./deny-tool.js";

export { registerMemorySet } from "./memory-set.js";
export { registerMemoryGet } from "./memory-get.js";
export { registerMemoryList } from "./memory-list.js";
export { registerMemoryDelete } from "./memory-delete.js";
export { registerMemoryStatus } from "./memory-status.js";
export { registerMemoryArchive } from "./memory-archive.js";

export { registerGradeStep } from "./grade-step.js";
export { registerListModels } from "./list-models.js";

// ═══════════════════════════════════════════════════════════════════════════════
// v2.23 可选部署分组
// ═══════════════════════════════════════════════════════════════════════════════

/** 核心工具（16 个，始终注册）——高频使用集：session 生命周期 + 监控 + 记忆 + 验证 + 模型 */
export const CORE_TOOLS = [
  "create_session",
  "execute_prompt",
  "list_sessions",
  "get_session_info",
  "read_session_log",
  "list_io_records",
  "poll_session",
  "get_tunnel_status",
  "memory_set",
  "memory_get",
  "memory_list",
  "memory_delete",
  "memory_status",
  "memory_archive",
  "grade_step",
  "list_models",
] as const;

/** 可选工具（14 个）——审批流/工作流引擎/watch族/推送，按使用率统计 0 使用，KIMI_TUNNEL_OPTIONAL_TOOLS=core 时关闭 */
export const OPTIONAL_TOOLS = [
  "chat_with_session",
  "run_flow",
  "stream_response",
  "learn_workflow",
  "list_templates",
  "execute_workflow",
  "continue_workflow",
  "watch_session",
  "get_watch_result",
  "continue_watch",
  "set_watch_output",
  "list_policies",
  "approve_tool",
  "deny_tool",
] as const;

/** 注册核心工具组（始终调用） */
export function registerCoreTools(server: McpServer, services: TunnelServices): void {
  registerCreateSession(server, services);
  registerExecutePrompt(server, services);
  registerListSessions(server, services);
  registerGetSessionInfo(server, services);
  registerReadSessionLog(server, services);
  registerListIORecords(server, services);
  registerPollSession(server, services);
  registerGetTunnelStatus(server, services);
  registerMemorySet(server, services);
  registerMemoryGet(server, services);
  registerMemoryList(server, services);
  registerMemoryDelete(server, services);
  registerMemoryStatus(server, services);
  registerMemoryArchive(server, services);
  registerGradeStep(server, services);
  registerListModels(server, services);
}

/** 注册可选工具组（KIMI_TUNNEL_OPTIONAL_TOOLS != "core" 时调用） */
export function registerOptionalTools(server: McpServer, services: TunnelServices): void {
  registerChatWithSession(server, services);
  registerRunFlow(server, services);
  registerStreamResponse(server, services);
  registerLearnWorkflow(server, services);
  registerListTemplates(server, services);
  registerExecuteWorkflow(server, services);
  registerContinueWorkflow(server, services);
  registerWatchSession(server, services);
  registerGetWatchResult(server, services);
  registerContinueWatch(server, services);
  registerSetWatchOutput(server, services);
  registerListPolicies(server, services);
  registerApproveTool(server, services);
  registerDenyTool(server, services);
}
