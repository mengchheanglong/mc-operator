import { NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { findDocById, updateDoc, deleteDoc, type DocWithTags } from "@/server/repositories/docs-repo";
import { extractLinks } from "@/lib/parser/extractLinks";
import { badRequest, notFound, serverError } from "@/server/http/api-response";
import { writeDashboardContextFiles, writeDocContextFile } from "@/server/services/workspace-context-writer";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function serializeDoc(doc: DocWithTags) {
  return {
    ...doc,
    _id: doc.id,
    links: extractLinks(doc.content),
  };
}

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(_req);
    const { id } = await params;

    const doc = findDocById(user.id, project.id, id);
    if (!doc) {
      return notFound("Document not found.");
    }

    return NextResponse.json({ doc: serializeDoc(doc) });
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

    const doc = updateDoc(user.id, project.id, id, updateData);

    if (!doc) {
      return notFound("Document not found.");
    }

    // Fire & forget context file updates
    Promise.all([
      writeDashboardContextFiles(user.id, project),
      writeDocContextFile(user.id, project, doc.id)
    ]).catch(console.error);

    return NextResponse.json({ msg: "Document updated.", doc: serializeDoc(doc) });
  } catch (error) {
    if (error instanceof Error && error.message.includes("already exists")) {
      return badRequest(error.message);
    }
    return serverError(error, "Update doc error");
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(_req);
    const { id } = await params;

    const success = deleteDoc(user.id, project.id, id);
    if (!success) {
      return notFound("Document not found.");
    }

    // Fire & forget context file updates
    writeDashboardContextFiles(user.id, project).catch(console.error);

    return NextResponse.json({ msg: "Document deleted." });
  } catch (error) {
    return serverError(error, "Delete doc error");
  }
}
