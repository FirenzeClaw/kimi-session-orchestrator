import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TunnelServices } from "../types.js";

// 懒创建的 grader session ID，进程级复用
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

      const prevSessionId = wireClient.getSessionId();
      const focusHint = focus ? `评分侧重维度: ${focus}。` : "";

      const gradingPrompt = `你是独立产出质量评分助手。请阅读最近一轮 task session 的产出，根据以下验收标准评估质量。
严格仅返回 JSON，不含任何其他文字：{"pass":true|false,"score":0-100,"feedback":"具体原因，点明通过/不通过的具体证据"}

验收标准：
${criteria}

${focusHint}
请根据 session ${session_id} 的最新产出进行评分。`;

      try {
        // 懒创建 grader session（独立 session，不污染 task session）
        if (!_graderSessionId) {
          const created = await wireClient.createSession({
            cwd: process.cwd(),
            title: "[grader] Loop Engineering 评分器",
            permissionMode: "auto",
          });
          _graderSessionId = created.sessionId;
        }

        // 切到 grader session 评分
        wireClient.setSessionId(_graderSessionId);
        const response = await wireClient.sendPrompt(gradingPrompt, { timeoutMs: 30000, autoApprove: true });

        // 切回原 session
        wireClient.setSessionId(prevSessionId);

        try {
          const parsed = JSON.parse(response.finalText);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                pass: !!parsed.pass,
                score: typeof parsed.score === "number" ? parsed.score : (parsed.pass ? 80 : 30),
                feedback: parsed.feedback || "无反馈",
                session_id,
              }, null, 2),
            }],
          };
        } catch {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                pass: false,
                score: 0,
                feedback: "grader JSON 解析失败，原始响应: " + response.finalText.slice(0, 200),
                session_id,
              }, null, 2),
            }],
          };
        }
      } catch (err) {
        wireClient.setSessionId(prevSessionId);
        return {
          content: [{ type: "text", text: `grade_step 失败: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
