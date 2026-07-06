import type { WireClient } from "./wire-client.js";

export interface FlowJob {
  sessionId: string;
  steps: string[];
  currentStep: number; // 0-based index of last SUBMITTED step
  autoApprove: boolean;
  status: "running" | "done" | "error";
  error?: string;
  startedAt: number;
  completedAt?: number;
}

export class FlowOrchestrator {
  private flows = new Map<string, FlowJob>();
  private timers = new Map<string, ReturnType<typeof setInterval>>();

  /**
   * Start a background flow orchestration.
   * Submits step 0 immediately, then polls every 15s and advances
   * when the session becomes idle.
   */
  start(
    sessionId: string,
    wireClient: WireClient,
    steps: string[],
    autoApprove: boolean,
    onComplete?: (job: FlowJob) => void
  ): void {
    const flow: FlowJob = {
      sessionId,
      steps,
      currentStep: 0,
      autoApprove,
      status: "running",
      startedAt: Date.now(),
    };
    this.flows.set(sessionId, flow);

    // Submit first step immediately, then start polling
    this.submitAndSchedule(sessionId, wireClient, flow, onComplete);
  }

  getFlow(sessionId: string): FlowJob | undefined {
    return this.flows.get(sessionId);
  }

  getActiveFlows(): FlowJob[] {
    return [...this.flows.values()].filter((f) => f.status === "running");
  }

  private async submitAndSchedule(
    sessionId: string,
    wireClient: WireClient,
    flow: FlowJob,
    onComplete?: (job: FlowJob) => void
  ): Promise<void> {
    wireClient.setSessionId(sessionId);

    // Submit current step
    let submitFailed = false;
    try {
      const step = flow.steps[flow.currentStep];
      await wireClient.submitPrompt(step, { autoApprove: flow.autoApprove });
      process.stderr.write(
        `[flow-orchestrator] ${sessionId.slice(0,12)} step ${flow.currentStep + 1}/${flow.steps.length} submitted\n`
      );
    } catch (err) {
      flow.status = "error";
      flow.error = (err as Error).message;
      process.stderr.write(
        `[flow-orchestrator] ${sessionId.slice(0,12)} step ${flow.currentStep + 1} failed: ${flow.error}\n`
      );
      onComplete?.(flow);
      return;
    }

    if (submitFailed) return;

    // If this was the last step, mark done (no polling needed)
    if (flow.currentStep >= flow.steps.length - 1) {
      // Last step submitted — keep polling until it completes, then mark done
    }

    // Start polling loop
    const interval = setInterval(async () => {
      const current = this.flows.get(sessionId);
      if (!current || current.status !== "running") {
        clearInterval(interval);
        this.timers.delete(sessionId);
        return;
      }

      try {
        wireClient.setSessionId(sessionId);
        const status = await this.getStatus(wireClient, sessionId);

        if (status === "idle") {
          // Current step completed. Advance.
          current.currentStep++;

          if (current.currentStep >= current.steps.length) {
            // All steps done
            current.status = "done";
            current.completedAt = Date.now();
            clearInterval(interval);
            this.timers.delete(sessionId);
            process.stderr.write(
              `[flow-orchestrator] ${sessionId.slice(0,12)} all ${flow.steps.length} steps complete\n`
            );
            onComplete?.(current);
            return;
          }

          // Submit next step
          const nextStep = current.steps[current.currentStep];
          try {
            await wireClient.submitPrompt(nextStep, { autoApprove: current.autoApprove });
            process.stderr.write(
              `[flow-orchestrator] ${sessionId.slice(0,12)} step ${current.currentStep + 1}/${current.steps.length} submitted\n`
            );
          } catch (err) {
            current.status = "error";
            current.error = (err as Error).message;
            clearInterval(interval);
            this.timers.delete(sessionId);
            onComplete?.(current);
          }
        }
      } catch {
        // Polling error — ignore, retry next interval
      }
    }, 15000);

    this.timers.set(sessionId, interval);
  }

  private async getStatus(wireClient: WireClient, sessionId: string): Promise<string> {
    wireClient.setSessionId(sessionId);
    return wireClient.getSessionStatus();
  }
}

/** Singleton orchestrator instance for the tunnel process */
export const flowOrchestrator = new FlowOrchestrator();
