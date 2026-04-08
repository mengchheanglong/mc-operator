import { NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { extractLinks } from "@/lib/parser/extractLinks";
import { badRequest, notFound, serverError } from "@/server/http/api-response";
import { backendRequiredForWriteResponse } from "@/server/http/backend-write-policy";
import { proxyBackendRequest } from "@/server/http/directive-backend-proxy";
import { writeDashboardContextFiles, writeDocContextFile } from "@/server/services/workspace-context-writer";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface BackendDoc {
  id: string;
  title: string;
  content: string;
  fileType: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

function serializeDoc(doc: BackendDoc) {
  return {
    ...doc,
    _id: doc.id,
    links: extractLinks(doc.content),
    tags: Array.isArray(doc.tags) ? doc.tags : [],
  };
}

export async function GET(req: Request, { params }: RouteContext) {
  try {
    await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const { id } = await params;

    const response = await proxyBackendRequest({
      req,
      projectId: project.id,
      path: `/docs/${encodeURIComponent(id)}`,
      includeSearchParams: false,
    });
    if (!response.ok) {
      return response;
    }

    const payload = (await response.json()) as { doc?: BackendDoc };
    if (!payload.doc) {
      return notFound("Document not found.");
    }

    return NextResponse.json({ doc: serializeDoc(payload.doc) }, { status: response.status });
  } catch (error) {
    return serverError(error, "Fetch doc error");
  }
}

interface UpdateDocPayload {
  title?: string;
  content?: string;
  tags?: string[];
  fileType?: string;
}

export async function PUT(req: Request, { params }: RouteContext) {
  try {
    const reqForProxy = req.clone();
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const { id } = await params;

    const body = (await req.json()) as UpdateDocPayload;
    const updateData: { title?: string; content?: string; tags?: string[]; fileType?: string } = {};

    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title) return badRequest("Title cannot be empty.");
      if (title.length > 200) return badRequest("Title must be 200 characters or less.");
      updateData.title = title;
    }
    if (body.content !== undefined) {
      updateData.content = String(body.content).slice(0, 50000);
    }
    if (body.tags !== undefined) {
      updateData.tags = Array.isArray(body.tags)
        ? body.tags.map((t) => String(t).trim()).filter(Boolean)
        : [];
    }
    if (body.fileType !== undefined) {
      updateData.fileType = String(body.fileType).trim();
    }

    if (Object.keys(updateData).length === 0) {
      return badRequest("No valid fields provided for update.");
    }

    const proxiedReq = new Request(reqForProxy.url, {
      method: "PUT",
      headers: reqForProxy.headers,
      body: JSON.stringify(updateData),
    });
    const response = await proxyBackendRequest({
      req: proxiedReq,
      projectId: project.id,
      path: `/docs/${encodeURIComponent(id)}`,
      includeSearchParams: false,
    });
    if (response.status === 502) {
      return backendRequiredForWriteResponse(
        "Document",
        "Start the backend with `npm run backend:dev` or `npm run backend:start`, then retry document update.",
      );
    }
    if (!response.ok) {
      return response;
    }

    const payload = (await response.json()) as {
      msg?: string;
      doc?: BackendDoc;
    };
    if (!payload.doc) {
      return notFound("Document not found.");
    }
    const doc = serializeDoc(payload.doc);

    // Fire & forget context file updates
    Promise.all([
      writeDashboardContextFiles(user.id, project),
      writeDocContextFile(user.id, project, doc.id)
    ]).catch(console.error);

    return NextResponse.json({ ...payload, doc }, { status: response.status });
  } catch (error) {
    return serverError(error, "Update doc error");
  }
}

export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const { id } = await params;

    if (!id) {
      return badRequest("Document ID is required.");
    }

    const response = await proxyBackendRequest({
      req,
      projectId: project.id,
      path: `/docs/${encodeURIComponent(id)}`,
      includeSearchParams: false,
    });
    if (response.status === 502) {
      return backendRequiredForWriteResponse(
        "Document",
        "Start the backend with `npm run backend:dev` or `npm run backend:start`, then retry document deletion.",
      );
    }
    if (!response.ok) {
      return response;
    }

    // Fire & forget context file updates
    writeDashboardContextFiles(user.id, project).catch(console.error);

    return response;
  } catch (error) {
    return serverError(error, "Delete doc error");
  }
}
