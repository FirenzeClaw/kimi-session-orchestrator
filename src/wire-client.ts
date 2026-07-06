/**
 * Kimi Server REST API client.
 *
 * Uses the local Kimi Code server REST API to send prompts and read responses.
 * Thinking content is filtered out by default; set `includeThinking: true` to include it.
 *
 * Prerequisites: kimi web --no-open --port <port>
 * Token: printed at startup or available from the web UI URL hash.
 */

interface KimiContentBlock {
  type: "text" | "thinking" | "tool_use" | "tool_result";
  text?: string;
  thinking?: string;
  tool_call_id?: string;
  tool_name?: string;
  input?: Record<string, unknown>;
  [key: string]: unknown;
}

interface KimiMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: KimiContentBlock[];
  created_at: string;
}

interface KimiApiResponse<T> {
  code: number;
  msg: string;
  data: T;
  request_id: string;
}

export interface TurnPromptResponse {
  promptId: string;
  finalText: string;
  thinkingText: string;
  status: string;
  messages: KimiContentBlock[];
}

export interface CreateSessionOptions {
  cwd: string;
  title?: string;
  permissionMode?: "manual" | "yolo" | "auto";
  model?: string;
  thinking?: string;
}

export class WireClient {
  private baseUrl: string;
  private token: string;
  private sessionId: string;
  private connected = false;

  constructor(sessionId?: string) {
    this.baseUrl =
      process.env.KIMI_SERVER_URL || "http://127.0.0.1:5494";
    this.token =
      process.env.KIMI_SERVER_TOKEN || "";
    this.sessionId = sessionId || "";
  }

  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  setToken(token: string): void {
    this.token = token;
  }

  /**
   * Create a new session via the Kimi Server REST API.
   */
  async createSession(options: CreateSessionOptions): Promise<{ sessionId: string; title: string }> {
    const body: Record<string, unknown> = {
      metadata: { cwd: options.cwd },
      agent_config: {},
    };
    if (options.title) body.title = options.title;
    if (options.permissionMode) {
      (body.agent_config as Record<string, unknown>).permission_mode = options.permissionMode;
    }
    if (options.model) {
      (body.agent_config as Record<string, unknown>).model = options.model;
    }
    if (options.thinking) {
      (body.agent_config as Record<string, unknown>).thinking = options.thinking;
    }

    const resp = await this.apiPost<{ id: string; title: string }>(
      "/api/v1/sessions",
      body
    );
    process.stderr.write(
      `[wire-client] Created session ${resp.id} (cwd: ${options.cwd}, permission: ${options.permissionMode || "default"})\n`
    );

    // Enable auto mode by sending /auto as the first prompt.
    // The API's permission_mode field is not persisted, so we use the CLI command instead.
    if (options.permissionMode === "auto") {
      this.sessionId = resp.id;
      try {
        await this.sendPrompt("/auto", {
          timeoutMs: 30000,
          autoApprove: false,
          includeThinking: false,
        });
        process.stderr.write(`[wire-client] Auto mode enabled on ${resp.id}\n`);
      } catch {
        process.stderr.write(`[wire-client] /auto on ${resp.id} failed (may already be auto)\n`);
      }
    }

    return { sessionId: resp.id, title: resp.title };
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    const maxRetries = 3;
    const retryDelayMs = 2000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const metaResp = await this.apiGet<{
          server_version: string;
          capabilities: Record<string, boolean>;
        }>("/api/v1/meta");
        this.connected = true;
        process.stderr.write(
          `[wire-client] Connected to Kimi server v${metaResp.server_version} (session: ${this.sessionId || "none"})\n`
        );
        return;
      } catch (err) {
        const isLastAttempt = attempt === maxRetries;
        if (isLastAttempt) {
          if (!this.token) {
            throw new Error(
              `Cannot connect to Kimi server at ${this.baseUrl}. Start with: kimi web --no-open. Then set KIMI_SERVER_TOKEN env var.`
            );
          }
          throw new Error(
            `Cannot connect to Kimi server at ${this.baseUrl}: ${(err as Error).message}`
          );
        }
        process.stderr.write(
          `[wire-client] Connection attempt ${attempt + 1} failed: ${(err as Error).message}. Retrying in ${retryDelayMs}ms...\n`
        );
        await sleep(retryDelayMs);
      }
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Submit a prompt without waiting for completion. Returns prompt_id immediately.
   * Use read_session_log or list_io_records to track progress.
   *
   * When autoApprove is true, automatically approves pending approvals before submitting,
   * and retries if session was awaiting_approval.
   */
  async submitPrompt(
    prompt: string,
    options: { autoApprove?: boolean } = {}
  ): Promise<{ promptId: string }> {
    const { autoApprove = false } = options;

    if (!this.connected) {
      throw new Error("Wire client not connected");
    }
    if (!this.sessionId) {
      throw new Error("No session ID set.");
    }

    // Guard: refuse to inject a prompt while tool_calls are in-flight.
    // If autoApprove is on and session is awaiting_approval, approve all and retry.
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const status = await this.getSessionStatus();

      if (status === "awaiting_approval" && autoApprove) {
        await this.approveAll(this.sessionId);
        await sleep(500);
        continue;
      }

      if (status === "running") {
        if (autoApprove && attempt < maxRetries - 1) {
          await sleep(2000);
          continue;
        }
        throw new Error(
          `Session ${this.sessionId} is busy (status: ${status}). ` +
          `Wait for the current turn to complete before sending a new prompt. ` +
          `Use poll_session to check progress.`
        );
      }

      break; // idle or unknown — proceed
    }

    const resp = await this.apiPost<{ prompt_id: string }>(
      `/api/v1/sessions/${this.sessionId}/prompts`,
      { content: [{ type: "text", text: prompt }] }
    );
    return { promptId: resp.prompt_id };
  }

  /**
   * Send a prompt and wait for the complete response.
   * By default, thinking content is excluded from finalText.
   */
  async sendPrompt(
    prompt: string,
    options: {
      timeoutMs?: number;
      includeThinking?: boolean;
      autoApprove?: boolean;
    } = {}
  ): Promise<TurnPromptResponse> {
    const { timeoutMs = 300000, includeThinking = false, autoApprove = false } = options;

    if (!this.connected) {
      throw new Error("Wire client not connected");
    }
    if (!this.sessionId) {
      throw new Error("No session ID set. Use list_sessions to find one.");
    }

    // Step 0: Wait for session to become ready (idle).
    // Submitting mid-turn with in-flight tool_calls causes the LLM provider
    // to reject with 400 "insufficient tool messages following tool_calls".
    {
      const maxPreWait = Math.min(timeoutMs, 60000); // up to 60s pre-submit wait
      const preWaitStart = Date.now();
      while (Date.now() - preWaitStart < maxPreWait) {
        const currentStatus = await this.getSessionStatus();

        if (currentStatus === "idle" || currentStatus === "unknown") break;

        if (currentStatus === "awaiting_approval") {
          if (!autoApprove) {
            throw new Error(
              `Session ${this.sessionId} is awaiting approval. ` +
              `Enable auto_mode or approve manually before sending a new prompt.`
            );
          }
          await this.approveAll(this.sessionId);
          await sleep(500);
          continue;
        }

        // "running" or other active state — wait
        await sleep(1000);
      }
    }

    // Step 1: Submit prompt
    const submitResp = await this.apiPost<{
      prompt_id: string;
      user_message_id: string;
      status: string;
      content: KimiContentBlock[];
    }>(`/api/v1/sessions/${this.sessionId}/prompts`, {
      content: [{ type: "text", text: prompt }],
    });

    const promptId = submitResp.prompt_id;
    let lastMessageId = "";

    let finalText = "";
    let thinkingText = "";
    const allMessages: KimiContentBlock[] = [];

    // Step 2: Poll until idle, collecting messages
    const startTime = Date.now();
    const pollInterval = 1000;

    while (Date.now() - startTime < timeoutMs) {
      // Check session status
      try {
        const statusResp = await this.apiGet<{ status: string }>(
          `/api/v1/sessions/${this.sessionId}/status`
        );

        // Auto-approve pending approvals if enabled
        if (autoApprove && statusResp.status === "awaiting_approval") {
          await this.approveAll(this.sessionId);
        }

        // Fetch new messages
        const params = new URLSearchParams({
          page_size: "30",
          role: "assistant",
        });
        if (lastMessageId) {
          params.set("after_id", lastMessageId);
        }

        const msgsResp = await this.apiGet<{ items: KimiMessage[] }>(
          `/api/v1/sessions/${this.sessionId}/messages?${params}`
        );

        const items = msgsResp.items || [];
        for (const msg of items) {
          if (msg.id > lastMessageId) {
            lastMessageId = msg.id;
          }
          for (const block of msg.content) {
            allMessages.push(block);
            if (block.type === "text" && block.text) {
              finalText += block.text;
            }
            if (block.type === "thinking" && block.thinking) {
              thinkingText += block.thinking;
            }
          }
        }

        // Check if turn is complete
        if (statusResp.status === "idle" && items.length > 0) {
          // Verify we got a text response
          const hasText = allMessages.some((b) => b.type === "text");
          if (hasText || allMessages.length > 0) {
            break;
          }
        }

        // If still running and we haven't seen the prompt yet, wait longer first
        if (statusResp.status === "running" && lastMessageId === "") {
          await sleep(pollInterval * 2);
        }
      } catch {
        // Ignore polling errors, continue
      }

      await sleep(pollInterval);
    }

    return {
      promptId,
      finalText: includeThinking ? finalText : finalText,
      thinkingText,
      status: "completed",
      messages: allMessages,
    };
  }

  /**
   * Read thinking content for a specific turn.
   * Useful when response is ambiguous and needs confirmation.
   */
  getThinkingFromMessages(messages: KimiContentBlock[]): string {
    return messages
      .filter((b) => b.type === "thinking" && b.thinking)
      .map((b) => b.thinking!)
      .join("\n");
  }

  /**
   * Filter out thinking blocks, keeping only text and tool info.
   */
  filterTextOnly(messages: KimiContentBlock[]): KimiContentBlock[] {
    return messages.filter((b) => b.type !== "thinking");
  }

  /**
   * Query the session status from the Kimi Server.
   * Returns "idle", "running", "awaiting_approval", or "unknown" on error.
   */
  async getSessionStatus(): Promise<string> {
    try {
      const resp = await this.apiGet<{ status: string }>(
        `/api/v1/sessions/${this.sessionId}/status`
      );
      return resp.status || "unknown";
    } catch {
      return "unknown";
    }
  }

  /**
   * Auto-approve all pending approval requests for a session.
   * Uses session-scoped approval to enable auto mode for the entire session.
   */
  private async approveAll(sessionId: string): Promise<void> {
    try {
      const approvalsResp = await this.apiGet<{
        items: Array<{ approval_id: string }>;
      }>(`/api/v1/sessions/${sessionId}/approvals?status=pending`);

      const items = approvalsResp.items || [];
      for (const item of items) {
        await this.apiPost(
          `/api/v1/sessions/${sessionId}/approvals/${item.approval_id}`,
          { decision: "approved", scope: "session" }
        );
        process.stderr.write(
          `[wire-client] Auto-approved ${item.approval_id} (session scope)\n`
        );
      }
    } catch {
      // Ignore approval errors — session may not have pending approvals
    }
  }

  async close(): Promise<void> {
    this.connected = false;
  }

  private async apiGet<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      throw new Error(`API GET ${path} failed: ${resp.status}`);
    }
    const json: KimiApiResponse<T> = await resp.json();
    if (json.code !== 0) {
      throw new Error(`API error: ${json.msg} (code ${json.code})`);
    }
    return json.data;
  }

  private async apiPost<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      throw new Error(`API POST ${path} failed: ${resp.status}`);
    }
    const json: KimiApiResponse<T> = await resp.json();
    if (json.code !== 0) {
      throw new Error(`API error: ${json.msg} (code ${json.code})`);
    }
    return json.data;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
