import { NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { updateNote, deleteNote, type NoteRow } from "@/server/repositories/notes-repo";
import { badRequest, notFound, serverError } from "@/server/http/api-response";
import { writeDashboardContextFiles } from "@/server/services/workspace-context-writer";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

interface UpdateNotePayload {
  content?: string;
  completed?: boolean;
}

function serializeNote(note: NoteRow) {
  return {
    id: note.id,
    content: note.content,
    completed: note.completed,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

export async function PUT(req: Request, { params }: RouteContext) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);

    const { id } = await params;

    const body = (await req.json()) as UpdateNotePayload;
    
    let content: string | undefined;
    if (body.content !== undefined) {
      content = String(body.content).trim();
      if (!content) {
        return badRequest("Note content cannot be empty.");
      }
      if (content.length > 500) {
        return badRequest("Note content must be 500 characters or less.");
      }
    }

    const updateData: Partial<{ content: string; completed: boolean }> = {};
    if (content !== undefined) {
      updateData.content = content;
    }
    if (body.completed !== undefined) {
      updateData.completed = Boolean(body.completed);
    }

    if (Object.keys(updateData).length === 0) {
      return badRequest("No valid fields provided for update.");
    }

    const note = updateNote(user.id, project.id, id, updateData);

    if (!note) {
      return notFound("Note not found.");
    }

    writeDashboardContextFiles(user.id, project).catch(console.error);

    return NextResponse.json({
      msg: "Note updated.",
      note: serializeNote(note),
    });
  } catch (error) {
    return serverError(error, "Update note error");
  }
}

export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);

    const { id } = await params;

    const success = deleteNote(user.id, project.id, id);
    if (!success) {
      return notFound("Note not found.");
    }

    writeDashboardContextFiles(user.id, project).catch(console.error);

    return NextResponse.json({ msg: "Note deleted." });
  } catch (error) {
    return serverError(error, "Delete note error");
  }
}
