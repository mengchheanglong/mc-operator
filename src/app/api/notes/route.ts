import { NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { listNotes, createNote, type NoteRow } from "@/server/repositories/notes-repo";
import { badRequest, serverError } from "@/server/http/api-response";
import { writeDashboardContextFiles } from "@/server/services/workspace-context-writer";

export const dynamic = "force-dynamic";

interface CreateNotePayload {
  content?: string;
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

export async function GET(req: Request) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const notes = listNotes(user.id, project.id);

    return NextResponse.json({
      notes: notes.map(serializeNote),
    });
  } catch (error) {
    return serverError(error, "Fetch notes error");
  }
}

export async function POST(req: Request) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);

    const body = (await req.json()) as CreateNotePayload;
    const content = String(body.content || "").trim();

    if (!content) {
      return badRequest("Note content is required.");
    }

    if (content.length > 500) {
      return badRequest("Note content must be 500 characters or less.");
    }

    const note = createNote(user.id, project.id, content);

    writeDashboardContextFiles(user.id, project).catch(console.error);

    return NextResponse.json({
      msg: "Note created.",
      note: serializeNote(note),
    });
  } catch (error) {
    return serverError(error, "Create note error");
  }
}
