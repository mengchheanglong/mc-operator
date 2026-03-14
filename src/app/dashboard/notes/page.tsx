import NotesPageClient from "./NotesPageClient";
import { resolveProjectContext } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { listNotes } from "@/server/repositories/notes-repo";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const user = await resolveUserContext();
  const project = await resolveProjectContext();
  const notes = listNotes(user.id, project.id).map((note) => ({
    id: note.id,
    content: note.content,
    completed: note.completed,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  }));

  return <NotesPageClient initialNotes={notes} />;
}
