import { NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { searchDocs, createDoc, type DocWithTags } from "@/server/repositories/docs-repo";
import { extractLinks } from "@/lib/parser/extractLinks";
import { badRequest, serverError } from "@/server/http/api-response";
import { writeDashboardContextFiles, writeDocContextFile } from "@/server/services/workspace-context-writer";

export const dynamic = "force-dynamic";

function serializeDoc(doc: DocWithTags) {
  return {
    ...doc,
    _id: doc.id,
    links: extractLinks(doc.content),
  };
}

export async function GET(req: Request) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);

    const url = new URL(req.url);
    const search = url.searchParams.get("search")?.trim() || "";
    const tag = url.searchParams.get("tag")?.trim() || "";
    const fileType = url.searchParams.get("fileType")?.trim() || "";

    const paramLimit = parseInt(url.searchParams.get('limit') || '50', 10);
    const limit = isNaN(paramLimit) || paramLimit < 1 ? 50 : Math.min(paramLimit, 100);

    const paramSkip = parseInt(url.searchParams.get('skip') || '0', 10);
    const skip = isNaN(paramSkip) || paramSkip < 0 ? 0 : paramSkip;

    const docs = searchDocs(user.id, project.id, search, {
      limit,
      skip,
      tag: tag || undefined,
      fileType: fileType || undefined,
    });

    return NextResponse.json({ docs: docs.map(serializeDoc) });
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

    const doc = createDoc(user.id, project.id, {
      title,
      content,
      tags,
      fileType,
    });

    // Fire & forget context file updates
    Promise.all([
      writeDashboardContextFiles(user.id, project),
      writeDocContextFile(user.id, project, doc.id)
    ]).catch(console.error);

    return NextResponse.json({ msg: "Document created.", doc: serializeDoc(doc) });
  } catch (error) {
    if (error instanceof Error && error.message.includes("already exists")) {
      return badRequest(error.message);
    }
    return serverError(error, "Create doc error");
  }
}
