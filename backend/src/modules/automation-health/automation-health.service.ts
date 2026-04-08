import { Injectable } from "@nestjs/common";
import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const AUTOMATION_TOKEN_HEADER = "x-openclaw-automation-token";

type WorkflowApiRecord = {
  id?: string | number;
  name?: string;
  active?: boolean;
  updatedAt?: string;
  tags?: Array<{ name?: string } | string>;
};

function normalizeUrl(value?: string | null) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  return normalized.replace(/\/+$/, "");
}

function joinUrl(baseUrl: string, pathname: string) {
  return `${baseUrl}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

function buildMissionControlUrl(pathname: string) {
  const baseUrl = normalizeUrl(process.env.MISSION_CONTROL_BASE_URL);
  if (!baseUrl) return pathname;
  return joinUrl(baseUrl, pathname);
}

function buildAbortSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cancel() {
      clearTimeout(timer);
    },
  };
}

async function fetchJson(url: string, init?: RequestInit) {
  const { signal, cancel } = buildAbortSignal(2_500);
  try {
    const response = await fetch(url, {
      ...init,
      signal,
      cache: "no-store",
    });
    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        payload = text;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      payload,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      payload: null,
      error: error instanceof Error ? error.message : "Unknown fetch error",
    };
  } finally {
    cancel();
  }
}

function parseWorkflowRecords(payload: unknown): WorkflowApiRecord[] {
  if (Array.isArray(payload)) {
    return payload as WorkflowApiRecord[];
  }

  if (payload && typeof payload === "object") {
    const objectPayload = payload as {
      data?: unknown;
      items?: unknown;
      workflows?: unknown;
    };

    if (Array.isArray(objectPayload.data)) return objectPayload.data as WorkflowApiRecord[];
    if (Array.isArray(objectPayload.items)) return objectPayload.items as WorkflowApiRecord[];
    if (Array.isArray(objectPayload.workflows)) return objectPayload.workflows as WorkflowApiRecord[];
  }

  return [];
}

function toWorkflowView(record: WorkflowApiRecord) {
  const tags = Array.isArray(record.tags)
    ? record.tags
        .map((tag) =>
          typeof tag === "string" ? tag.trim() : String(tag?.name || "").trim(),
        )
        .filter(Boolean)
    : [];

  return {
    id: String(record.id || record.name || "workflow"),
    name: String(record.name || "Untitled workflow"),
    active: Boolean(record.active),
    updatedAt: record.updatedAt ? String(record.updatedAt) : undefined,
    tags,
  };
}

@Injectable()
export class AutomationHealthService {
  private resolveRepairScriptPath() {
    return path.join(
      os.homedir(),
      ".openclaw",
      "workspace",
      "scripts",
      "repair-openclaw-command.ps1",
    );
  }

  private resolveAgentId() {
    return process.env.OPENCLAW_AGENT_ID?.trim() || "main";
  }

  private async resolveProbePowerShellArgs(agentId: string) {
    const repairScript = this.resolveRepairScriptPath();
    try {
      await access(repairScript);
      return ["-ExecutionPolicy", "Bypass", "-File", repairScript, "agent", "--help"];
    } catch {
      return ["-Command", `openclaw agent --agent "${agentId}" --help`];
    }
  }

  async probeOpenClawAgent(input: { timeoutSeconds?: number } = {}) {
    const command = "powershell.exe";
    const agentId = this.resolveAgentId();
    const args = await this.resolveProbePowerShellArgs(agentId);

    try {
      const { stdout = "", stderr = "" } = await execFileAsync(command, args, {
        windowsHide: true,
        timeout: (input.timeoutSeconds ?? 12) * 1000,
        maxBuffer: 1024 * 1024 * 2,
      });
      const body = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n\n").trim();

      return {
        ok: true,
        status: 200,
        body: body || "OpenClaw CLI is available.",
        command,
        args,
        agentId,
      };
    } catch (error) {
      const execError = error as Error & {
        code?: number | string;
        stdout?: string;
        stderr?: string;
        message: string;
      };
      const body = [execError.stdout?.trim() || "", execError.stderr?.trim() || ""]
        .filter(Boolean)
        .join("\n\n")
        .trim();

      return {
        ok: false,
        status:
          typeof execError.code === "number" && Number.isFinite(execError.code)
            ? execError.code
            : 503,
        body: body || execError.message || "OpenClaw CLI probe failed.",
        command,
        args,
        agentId,
      };
    }
  }

  async getOpenClawHealth() {
    const payload = await this.probeOpenClawAgent({ timeoutSeconds: 12 });
    return {
      statusCode: payload.ok ? 200 : 503,
      payload,
    };
  }

  async buildN8nAutomationSnapshot(projectId: string) {
    const baseUrl = normalizeUrl(process.env.N8N_BASE_URL);
    const webhookBaseUrl = normalizeUrl(process.env.N8N_WEBHOOK_BASE_URL);
    const apiKey = String(process.env.N8N_API_KEY || "").trim();
    const hasApiKey = Boolean(apiKey);
    const encodedProjectId = encodeURIComponent(projectId);

    const missionControlBaseUrl = normalizeUrl(process.env.MISSION_CONTROL_BASE_URL);
    const sessionBriefUrl = buildMissionControlUrl(
      `/api/automation/session-brief?projectId=${encodedProjectId}`,
    );
    const reportUrl = buildMissionControlUrl("/api/automation/reports");
    const statusUrl = buildMissionControlUrl(
      `/api/automation/n8n/status?projectId=${encodedProjectId}`,
    );

    if (!baseUrl && !webhookBaseUrl) {
      return {
        provider: "n8n",
        status: "missing",
        summary:
          "n8n is not configured yet. Add local n8n URLs to connect automation into Mission Control.",
        baseUrl,
        webhookBaseUrl,
        hasApiKey,
        healthcheckOk: false,
        workflowApiOk: false,
        activeWorkflowCount: null,
        workflows: [],
        suggestions: [
          "Set N8N_BASE_URL to your local n8n instance, for example http://127.0.0.1:5678.",
          "Set N8N_WEBHOOK_BASE_URL if you want Mission Control to call n8n webhooks directly.",
          "Keep OPENCLAW_AUTOMATION_TOKEN set so n8n can write reports back into Mission Control.",
        ],
        error: null,
        missionControl: {
          baseUrl: missionControlBaseUrl,
          sessionBriefUrl,
          reportUrl,
          statusUrl,
          tokenHeader: AUTOMATION_TOKEN_HEADER,
          projectId,
        },
      };
    }

    let healthcheckOk = false;
    let workflowApiOk = false;
    let workflows: Array<Record<string, unknown>> = [];
    let error: string | null = null;

    if (baseUrl) {
      const healthResponse = await fetchJson(joinUrl(baseUrl, "/healthz"));
      healthcheckOk = healthResponse.ok;

      if (!healthResponse.ok && healthResponse.status !== 404) {
        error = healthResponse.error || `Healthcheck returned ${healthResponse.status}.`;
      }

      if (hasApiKey) {
        const workflowsResponse = await fetchJson(
          joinUrl(baseUrl, "/api/v1/workflows?active=true&limit=8"),
          {
            headers: {
              "X-N8N-API-KEY": apiKey,
              Accept: "application/json",
            },
          },
        );

        if (workflowsResponse.ok) {
          workflows = parseWorkflowRecords(workflowsResponse.payload).map(toWorkflowView);
          workflowApiOk = true;
        } else if (!error) {
          error =
            workflowsResponse.error ||
            `Workflow API returned ${workflowsResponse.status}.`;
        }
      }
    }

    const activeWorkflowCount = workflowApiOk
      ? workflows.filter((item) => Boolean(item.active)).length
      : null;
    const suggestions: string[] = [];

    if (!hasApiKey) {
      suggestions.push(
        "Set N8N_API_KEY if you want Mission Control to inspect active n8n workflows.",
      );
    }
    if (!webhookBaseUrl) {
      suggestions.push(
        "Set N8N_WEBHOOK_BASE_URL to make outbound Mission Control -> n8n webhook calls easier to standardize.",
      );
    }
    if (!healthcheckOk && baseUrl) {
      suggestions.push(
        "Enable the n8n health endpoint if you want Mission Control to verify connectivity instead of assuming configuration is enough.",
      );
    }

    const status =
      healthcheckOk || workflowApiOk
        ? "connected"
        : error
          ? "error"
          : "configured";

    const summary =
      status === "connected"
        ? workflowApiOk
          ? `Mission Control can reach n8n and currently sees ${activeWorkflowCount ?? 0} active workflow${activeWorkflowCount === 1 ? "" : "s"}.`
          : "Mission Control can reach n8n, but workflow discovery is limited because no API key is configured."
        : status === "configured"
          ? "n8n is configured, but Mission Control could not verify the connection yet."
          : "Mission Control could not verify the n8n connection with the current configuration.";

    return {
      provider: "n8n",
      status,
      summary,
      baseUrl,
      webhookBaseUrl,
      hasApiKey,
      healthcheckOk,
      workflowApiOk,
      activeWorkflowCount,
      workflows,
      suggestions,
      error,
      missionControl: {
        baseUrl: missionControlBaseUrl,
        sessionBriefUrl,
        reportUrl,
        statusUrl,
        tokenHeader: AUTOMATION_TOKEN_HEADER,
        projectId,
      },
    };
  }

  async getN8nStatus(projectId: string) {
    try {
      const snapshot = await this.buildN8nAutomationSnapshot(projectId);
      return {
        statusCode: 200,
        payload: {
          success: true,
          automation: snapshot,
        },
      };
    } catch {
      return {
        statusCode: 500,
        payload: {
          success: false,
          error: "Failed to inspect n8n status.",
        },
      };
    }
  }
}
