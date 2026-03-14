import { NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { badRequest, serverError } from "@/server/http/api-response";
import {
  createAutomationTemplate,
  listAutomationTemplates,
} from "@/server/repositories/automation-templates-repo";

export const dynamic = "force-dynamic";

interface CreateAutomationTemplatePayload {
  name?: string;
  prompt?: string;
  executor?: string;
  executionEnv?: string;
  status?: string;
  area?: string | null;
  webhookPath?: string | null;
  topics?: string[];
}

export async function GET(req: Request) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);

    return NextResponse.json({
      templates: listAutomationTemplates(user.id, project.id),
    });
  } catch (error) {
    return serverError(error, "List automation templates error", "Failed to fetch automation templates.");
  }
}

export async function POST(req: Request) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const body = (await req.json()) as CreateAutomationTemplatePayload;
    const name = String(body.name || "").trim();
    const prompt = String(body.prompt || "").trim();

    if (!name) {
      return badRequest("Template name is required.");
    }

    if (!prompt) {
      return badRequest("Template prompt is required.");
    }

    return NextResponse.json({
      msg: "Automation template created.",
      template: createAutomationTemplate(user.id, project.id, {
        name,
        prompt,
        executor: body.executor,
        executionEnv: body.executionEnv,
        status: body.status,
        area: body.area,
        webhookPath: body.webhookPath,
        topics: body.topics,
      }),
    });
  } catch (error) {
    return serverError(error, "Create automation template error", "Failed to create automation template.");
  }
}
