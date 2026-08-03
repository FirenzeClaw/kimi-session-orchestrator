/**
 * Session 状态归一化：统一 0.22.x（status 枚举）、0.24+（busy/pending_interaction）
 * 与 0.31+（busy 含后台任务）三种服务端模型到内部沿用词表。
 *
 * 内部词表: idle | running | awaiting_approval | awaiting_question | aborted | unknown
 * 映射规则（0.27.0 实测；0.31.1 漂移修正见 v2.21 / API.md §五）:
 *   pending_interaction=approval → awaiting_approval（优先于 busy——审批等待时 busy 仍为 true）
 *   pending_interaction=question → awaiting_question（同理）
 *   main_turn_active=true        → running（0.31+ 主 turn 信号，实测可靠）
 *   main_turn_active=false       → idle（0.31+ 实测：busy 含后台任务/持续活动，turn 结束后仍可能为 true）
 *   busy=true                    → running（0.24-0.30 兼容，main_turn_active 缺失时回退）
 *   busy=false + none/无详情       → idle
 * 两模型字段均缺失                → unknown（不误判为 offline/idle）
 * status 与 busy 同时存在          → status 优先（前向兼容）
 *
 * 注意: 0.24+ 无 aborted 等价字段；中止由 turn.ended 事件承载，REST 侧按 idle 处理。
 */

/** GET /api/v1/sessions/{id}/status 响应体（两种模型的并集） */
export interface StatusEndpointBody {
  status?: string; // 0.22.x 枚举模型
  busy?: boolean; // 0.24+ busy 模型
  [key: string]: unknown;
}

/** GET /api/v1/sessions/{id} 响应体的相关子集 */
export interface SessionDetailBody {
  status?: string; // 0.22.x
  busy?: boolean; // 0.24+
  // 0.31+ 主 turn 信号（0.27 起字段存在）：busy 含后台任务/持续活动，主 turn 判定以此为准（v2.21）
  main_turn_active?: boolean;
  // 0.24+: none 已经 0.27.0 实测确认；approval/question 从二进制 schema 推断、尚未实测（见 API.md §五）
  pending_interaction?: string;
  [key: string]: unknown;
}

export function normalizeSessionStatus(
  statusBody: StatusEndpointBody,
  sessionBody?: SessionDetailBody
): string {
  // 旧模型优先：0.22.x 直接给出枚举值
  if (typeof statusBody.status === "string" && statusBody.status) {
    return statusBody.status;
  }
  // 新模型：pending_interaction 优先于 busy（0.27 实测：审批/提问等待时 busy 仍为 true）
  const pending = sessionBody?.pending_interaction;
  if (pending === "approval") return "awaiting_approval";
  if (pending === "question") return "awaiting_question";
  // 0.31+ 实测：busy 含后台任务/持续活动（turn 结束后仍可能为 true），
  // 主 turn 判定以 main_turn_active 为准；缺失时回退 busy（0.24-0.30 兼容）
  if (sessionBody?.main_turn_active === true) return "running";
  if (sessionBody?.main_turn_active === false) return "idle";
  if (statusBody.busy === true) return "running";
  if (statusBody.busy === false) return "idle";
  return "unknown";
}
