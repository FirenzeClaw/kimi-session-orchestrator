import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TunnelServices } from "../types.js";
import { listIORecords } from "../session-log-reader.js";

// 懒创建的 grader session ID，进程级复用
// 若复用 session 产生空响应，重置后重试（上下文腐化容错）
let _graderSessionId: string | null = null;

export function registerGradeStep(server: McpServer, services: TunnelServices): void {
  const { wireClient } = services;

  server.tool(
    "grade_step",
    "对 task session 的产出进行 LLM 自动评分验证。返回 pass/fail 及详细反馈。grader 是筛子非裁判——pass 不代表完美，fail 也不一定是真问题。",
    {
      session_id: z.string().describe("目标 task session ID"),
      criteria: z.string().describe("验收标准，自由文本。逐条明确可量化/可判定的条件"),
      focus: z
        .enum(["completeness", "accuracy", "format"])
        .optional()
        .describe("评分侧重维度：completeness=完整度, accuracy=准确性, format=格式规范"),
    },
    async ({ session_id, criteria, focus }) => {
      if (!wireClient.isConnected()) {
        return { content: [{ type: "text", text: "Wire client 未连接。请先启动 Kimi Server。" }], isError: true };
      }

      // 拉取目标 session 的 IO 记录，作为评分依据
      const ioResult = await listIORecords(session_id, { limit: 5, maxContentLength: 8000 });
      const sessionOutput = ioResult?.records
        ?.map((r) => `[Turn ${r.turn}] ${r.type === "user" ? "Prompt" : "Response"}: ${r.content}`)
        .join("\n\n") ?? "(无法读取 session 产出)";

      const focusHint = focus ? `评分侧重维度: ${focus}。` : "";

      const gradingPrompt = `你是独立产出质量评分助手。以下是 task session ${session_id} 的最近产出，请根据验收标准评估质量。
严格仅返回 JSON，不含任何其他文字：{"pass":true|false,"score":0-100,"feedback":"具体原因，点明通过/不通过的具体证据"}

=== Session 产出 ===
${sessionOutput}

=== 验收标准 ===
${criteria}

${focusHint}`;

      // 重试配置：阶梯 timeout，3 次尝试后判定 grader 不可用
      const retryTimeouts = [60_000, 30_000, 15_000];

      for (let attempt = 0; attempt < retryTimeouts.length; attempt++) {
        // 每次重试前重置 grader session（避免复用腐化上下文）
        if (attempt > 0) {
          _graderSessionId = null;
        }

        // 懒创建 grader session（独立 session，不污染 task session）
        if (!_graderSessionId) {
          const created = await wireClient.createSession({
            cwd: process.cwd(),
            title: "[grader] Loop Engineering 评分器",
            permissionMode: "auto",
          });
          _graderSessionId = created.sessionId;
        }

        try {
          const response = await wireClient.sendPrompt(_graderSessionId, gradingPrompt, {
            timeoutMs: retryTimeouts[attempt],
            autoApprove: true,
          });

          // 解析 grader 响应
          const result = parseGraderResponse(response.finalText);
          if (result) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ ...result, session_id }, null, 2),
              }],
            };
          }

          // finalText 为空——grader 未产出文本，尝试重试
        } catch {
          // sendPrompt 抛异常（超时/断连），尝试重试
        }
      }

      // 3 次尝试全部失败：grader 不可用
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            pass: null,
            score: null,
            feedback: "grader unavailable: 3 次尝试均未产出有效评分，请检查 Kimi Server 状态",
            session_id,
          }, null, 2),
        }],
        isError: true,
      };
    }
  );
}

/**
 * 解析 grader LLM 的评分响应。
 * 返回 { pass, score, feedback } 或 null（表示需重试）。
 */
function parseGraderResponse(finalText: string): { pass: boolean; score: number; feedback: string } | null {
  if (!finalText || finalText.trim().length === 0) {
    return null; // 空响应 → 触发重试
  }

  try {
    const parsed = JSON.parse(finalText);
    return {
      pass: !!parsed.pass,
      score: typeof parsed.score === "number" ? parsed.score : (parsed.pass ? 80 : 30),
      feedback: parsed.feedback || "无反馈",
    };
  } catch {
    // JSON 截断容错——正则 fallback
    const passMatch = finalText.match(/"pass"\s*:\s*(true|false)/);
    const scoreMatch = finalText.match(/"score"\s*:\s*(\d+)/);
    if (!passMatch && !scoreMatch) {
      return null; // 无法提取任何有效字段 → 触发重试
    }
    const feedbackMatch = finalText.match(/"feedback"\s*:\s*"([^"]*)/);
    return {
      pass: passMatch ? passMatch[1] === "true" : false,
      score: scoreMatch ? Number(scoreMatch[1]) : 0,
      feedback: (feedbackMatch ? feedbackMatch[1] + "…(截断)" : "") || finalText.slice(0, 200),
    };
  }
}
