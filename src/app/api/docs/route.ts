import { NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { extractLinks } from "@/lib/parser/extractLinks";
import { badRequest, serverError } from "@/server/http/api-response";
import { backendRequiredForWriteResponse } from "@/server/http/backend-write-policy";
import { proxyBackendRequest } from "@/server/http/directive-backend-proxy";
import { listDocs, searchDocs } from "@/server/repositories/docs-repo";
import { writeDashboardContextFiles, writeDocContextFile } from "@/server/services/workspace-context-writer";

export const dynamic = "force-dynamic";

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

export async function GET(req: Request) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const response = await proxyBackendRequest({
      req,
      projectId: project.id,
      path: "/docs",
    });

    if (response.status === 502) {
      const url = new URL(req.url);
      const search = (url.searchParams.get("search") || "").trim();
      const tag = (url.searchParams.get("tag") || "").trim().toLowerCase() || undefined;
      const fileType = (url.searchParams.get("fileType") || "").trim() || undefined;
      const parsedLimit = Number.parseInt(url.searchParams.get("limit") || "50", 10);
      const limit = Number.isFinite(parsedLimit)
        ? Math.max(1, Math.min(parsedLimit, 100))
        : 50;
      const parsedSkip = Number.parseInt(url.searchParams.get("skip") || "0", 10);
      const skip = Number.isFinite(parsedSkip) ? Math.max(0, parsedSkip) : 0;

      const docs = (search || tag || fileType)
        ? searchDocs(user.id, project.id, search, { tag, fileType, limit, skip })
        : listDocs(user.id, project.id).slice(skip, skip + limit);

      return NextResponse.json({ docs: docs.map(serializeDoc) });
    }

    if (!response.ok) {
      return response;
    }
    const payload = (await response.json()) as { docs?: BackendDoc[] };
    const docs = Array.isArray(payload.docs) ? payload.docs.map(serializeDoc) : [];
    return NextResponse.json({ docs }, { status: response.status });
  } catch (error) {
    return serverError(error, "Fetch docs error");
  }
}

interface CreateDocPayload {
  title?: string;
  content?: string;
  tags?: string[];
  fileType?: string;
}

export async function POST(req: Request) {
  try {
    const reqForProxy = req.clone();
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);

    const body = (await req.json()) as CreateDocPayload;
    const title = String(body.title || "").trim();

    if (!title) {
      return badRequest("Document title is required.");
    }
    if (title.length > 200) {
      return badRequest("Title must be 200 characters or less.");
    }

    const content = String(body.content || "").slice(0, 50000);
    const tags = Array.isArray(body.tags) && body.tags.length > 0
      ? body.tags.map((t) => String(t).trim()).filter(Boolean)
      : ["Other"];
    const fileType = String(body.fileType || ".md").trim();
    const proxiedReq = new Request(reqForProxy.url, {
      method: "POST",
      headers: reqForProxy.headers,
      body: JSON.stringify({
        title,
        content,
        tags: tags.map((tag) => tag.toLowerCase()),
        fileType,
      }),
    });

    const response = await proxyBackendRequest({
      req: proxiedReq,
      projectId: project.id,
      path: "/docs",
    });
    if (response.status === 502) {
      return backendRequiredForWriteResponse(
        "Document",
        "Start the backend with `npm run backend:dev` or `npm run backend:start`, then retry document creation.",
      );
    }
    if (!response.ok) {
      return response;
    }

    const payload = (await response.json()) as { msg?: string; doc?: BackendDoc };
    const doc = payload.doc ? serializeDoc(payload.doc) : null;
    const writes: Promise<unknown>[] = [writeDashboardContextFiles(user.id, project)];
    if (doc?.id) {
      writes.push(writeDocContextFile(user.id, project, doc.id));
    }
    Promise.all(writes).catch(console.error);

    return NextResponse.json(
      {
        ...payload,
        doc,
      },
      { status: response.status },
    );
  } catch (error) {
    return serverError(error, "Create doc error");
  }
}
