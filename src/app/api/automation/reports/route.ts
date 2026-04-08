import { NextRequest, NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import {
  AUTOMATION_TOKEN_HEADER,
  requireAutomationToken,
} from "@/server/http/automation-auth";
import { badRequest, serverError } from "@/server/http/api-response";
import { proxyBackendRequest } from "@/server/http/directive-backend-proxy";
import { type ReportCategory, type ReportStatus } from "@/server/repositories/reports-repo";
import { writeDashboardContextFiles } from "@/server/services/workspace-context-writer";

export const dynamic = "force-dynamic";

interface AutomationReportPayload {
  title?: string;
  content?: string;
  category?: ReportCategory;
  status?: ReportStatus;
  area?: string;
  linkedQuestId?: string;
  topics?: string[];
  metadata?: Record<string, unknown>;
  source?: string;
}

export async function POST(req: NextRequest) {
  const authError = requireAutomationToken(req);
  if (authError) {
    return authError;
  }

  try {
    const reqForProxy = req.clone();
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const body = (await req.json()) as AutomationReportPayload;

    const title = String(body.title || "").trim();
    const content = String(body.content || "").trim();
    const category = body.category || "maintenance";
    const status = body.status || "info";
    const area = String(body.area || "").trim();
    const linkedQuestId = String(body.linkedQuestId || "").trim();
    const topics = Array.isArray(body.topics)
      ? body.topics.map((topic) => String(topic || ""))
      : [];
    const metadata = body.metadata || {};
    const source = String(body.source || "n8n").trim();

    if (!title) {
      return badRequest("Title is required.");
    }

    if (!content) {
      return badRequest("Content is required.");
    }

    if (title.length > 200) {
      return badRequest("Title must be 200 characters or less.");
    }

    if (content.length > 5000) {
      return badRequest("Content must be 5000 characters or less.");
    }

    const proxiedReq = new Request(reqForProxy.url, {
      method: "POST",
      headers: reqForProxy.headers,
      body: JSON.stringify({
        title,
        content,
        category,
        status,
        area,
        linkedQuestId: linkedQuestId || undefined,
        source,
        topics,
        metadata: {
          ...metadata,
          automation: "n8n",
          tokenHeader: AUTOMATION_TOKEN_HEADER,
        },
      }),
    });

    const response = await proxyBackendRequest({
      req: proxiedReq,
      projectId: project.id,
      path: "/reports",
    });
    if (!response.ok) {
      return response;
    }
    const payload = (await response.json()) as {
      report?: Record<string, unknown>;
    };

    writeDashboardContextFiles(user.id, project).catch(console.error);

    return NextResponse.json({
      success: true,
      msg: "Automation report created.",
      report: payload.report || null,
    });
  } catch (error) {
    return serverError(
      error,
      "Automation report creation error",
      "Failed to create automation report.",
    );
  }
}
