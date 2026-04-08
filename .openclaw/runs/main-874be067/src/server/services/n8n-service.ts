import type { WorkspaceProject } from "@/server/projects/workspace-projects";
import {
  AUTOMATION_TOKEN_HEADER,
} from "@/server/http/automation-auth";
import type {
  AutomationSnapshotView,
  AutomationWorkflowView,
} from "@/types/context-pack";

type WorkflowApiRecord = {
  id?: string | number;
  name?: string;
  active?: boolean;
  updatedAt?: string;
  tags?: Array<{ name?: string } | string>;
};

function normalizeUrl(value?: string | null) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return null;
  }

  return normalized.replace(/\/+$/, "");
}

function joinUrl(baseUrl: string, pathname: string) {
  return `${baseUrl}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

function buildMissionControlUrl(pathname: string) {
  const baseUrl = normalizeUrl(process.env.MISSION_CONTROL_BASE_URL);
  if (!baseUrl) {
    return pathname;
  }

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
  const { signal, cancel } = buildAbortSignal(2500);

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

    if (Array.isArray(objectPayload.data)) {
      return objectPayload.data as WorkflowApiRecord[];
    }

    if (Array.isArray(objectPayload.items)) {
      return objectPayload.items as WorkflowApiRecord[];
    }

    if (Array.isArray(objectPayload.workflows)) {
      return objectPayload.workflows as WorkflowApiRecord[];
    }
  }

  return [];
}

function toWorkflowView(record: WorkflowApiRecord): AutomationWorkflowView {
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

export async function buildN8nAutomationSnapshot(
  project: WorkspaceProject,
): Promise<AutomationSnapshotView> {
  const baseUrl = normalizeUrl(process.env.N8N_BASE_URL);
  const webhookBaseUrl = normalizeUrl(process.env.N8N_WEBHOOK_BASE_URL);
  const apiKey = String(process.env.N8N_API_KEY || "").trim();
  const hasApiKey = Boolean(apiKey);
  const projectId = encodeURIComponent(project.id);

  const missionControlBaseUrl = normalizeUrl(process.env.MISSION_CONTROL_BASE_URL);
  const sessionBriefUrl = buildMissionControlUrl(
    `/api/automation/session-brief?projectId=${projectId}`,
  );
  const reportUrl = buildMissionControlUrl("/api/automation/reports");
  const statusUrl = buildMissionControlUrl(
    `/api/automation/n8n/status?projectId=${projectId}`,
  );

  if (!baseUrl && !webhookBaseUrl) {
    return {
      provider: "n8n",
      status: "missing",
      summary: "n8n is not configured yet. Add local n8n URLs to connect automation into Mission Control.",
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
        projectId: project.id,
      },
    };
  }

  let healthcheckOk = false;
  let workflowApiOk = false;
  let workflows: AutomationWorkflowView[] = [];
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
        workflows = parseWorkflowRecords(workflowsResponse.payload).map(
          toWorkflowView,
        );
        workflowApiOk = true;
      } else if (!error) {
        error =
          workflowsResponse.error ||
          `Workflow API returned ${workflowsResponse.status}.`;
      }
    }
  }

  const activeWorkflowCount = workflowApiOk ? workflows.filter((item) => item.active).length : null;
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

  const status: AutomationSnapshotView["status"] =
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
      projectId: project.id,
    },
  };
}
