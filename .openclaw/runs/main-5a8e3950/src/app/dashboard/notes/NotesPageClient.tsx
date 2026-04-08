"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { buildPromptPackHref } from "@/lib/context-pack/href";
import { CheckCircle2, Copy, Edit3, Loader2, Plus, Save, StickyNote, Trash2, Undo2, X } from "lucide-react";

interface Note {
  id: string;
  content: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

interface NotesPageClientProps {
  initialNotes: Note[];
}

export default function NotesPageClient({ initialNotes }: NotesPageClientProps) {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const sortedNotes = useMemo(
    () =>
      [...notes].sort((a, b) => {
        if (a.completed !== b.completed) {
          return Number(a.completed) - Number(b.completed);
        }
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }),
    [notes],
  );

  const fetchNotes = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get("/api/notes");
      setNotes(Array.isArray(response.data?.notes) ? response.data.notes : []);
      setError("");
    } catch {
      setError("Unable to load notes.");
    } finally {
      setLoading(false);
    }
  }, []);

  const createNote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;

    try {
      setSaving(true);
      const response = await axios.post("/api/notes", { content });
      const created = response.data?.note as Note | undefined;
      if (created) {
        setNotes((current) => [created, ...current.filter((note) => note.id !== created.id)]);
      }
      setDraft("");
      setError("");
    } catch {
      setError("Unable to create note.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (note: Note) => {
    setEditingId(note.id);
    setEditingContent(note.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingContent("");
  };

  const saveEdit = async (id: string) => {
    const content = editingContent.trim();
    if (!content) return;

    try {
      const response = await axios.put(`/api/notes/${id}`, { content });
      const updated = response.data?.note as Note | undefined;
      if (updated) {
        setNotes((current) => current.map((note) => (note.id === id ? updated : note)));
      }
      cancelEdit();
      setError("");
    } catch {
      setError("Unable to update note.");
    }
  };

  const deleteNote = async (id: string) => {
    try {
      await axios.delete(`/api/notes/${id}`);
      setNotes((current) => current.filter((note) => note.id !== id));
      if (editingId === id) {
        cancelEdit();
      }
      setError("");
    } catch {
      setError("Unable to delete note.");
    }
  };

  const toggleComplete = async (note: Note) => {
    try {
      const response = await axios.put(`/api/notes/${note.id}`, { completed: !note.completed });
      const updated = response.data?.note as Note | undefined;
      if (updated) {
        setNotes((current) => current.map((n) => (n.id === note.id ? updated : n)));
      }
      setError("");
    } catch {
      setError("Unable to update note completion status.");
    }
  };

  return (
    <div className="matte-page mx-auto w-full max-w-5xl animate-fade-in pb-10 text-text-primary">
      <header className="matte-page-header">
        <div className="flex items-center gap-3">
          <div className="matte-icon-frame">
            <StickyNote className="h-5 w-5" />
          </div>
          <div>
            <h1 className="matte-page-title">Notes</h1>
            <p className="mt-1 matte-panel-copy">Capture and manage quick mission notes.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push(buildPromptPackHref("workspace"))}
          className="matte-action-secondary"
        >
          <Copy className="h-4 w-4" />
          Generate Task
        </button>
      </header>

      <section className="matte-panel p-5">
        <form onSubmit={createNote} className="space-y-3">
          <label htmlFor="note-content" className="block matte-section-title">
            New Note
          </label>
          <textarea
            id="note-content"
            value={draft}
            maxLength={500}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Write a note..."
            className="input-discord min-h-24 resize-y bg-bg-base/50 focus:bg-bg-base"
          />
          <button
            type="submit"
            disabled={saving || !draft.trim()}
            className="matte-action-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add Note
          </button>
        </form>
      </section>

      {error && (
        <p className="matte-panel-muted px-4 py-3 text-sm text-text-secondary">
          {error}
        </p>
      )}

      <section className="space-y-3">
        {loading ? (
          <div className="matte-panel flex items-center justify-center py-10 text-text-secondary">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="ml-2 text-sm">Loading notes...</span>
          </div>
        ) : sortedNotes.length === 0 ? (
          <div className="matte-empty py-10 text-center">
            <p className="text-sm text-text-secondary">No notes yet.</p>
          </div>
        ) : (
          sortedNotes.map((note) => {
            const isEditing = editingId === note.id;
            return (
              <article 
                key={note.id} 
                className={`matte-panel-muted p-4 transition-all ${note.completed ? "opacity-60" : ""}`}
              >
                {isEditing ? (
                  <div className="space-y-3">
                    <textarea
                      value={editingContent}
                      maxLength={500}
                      onChange={(event) => setEditingContent(event.target.value)}
                      className="input-discord min-h-24 resize-y bg-bg-base/50 focus:bg-bg-base"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void saveEdit(note.id)}
                        disabled={!editingContent.trim()}
                        className="inline-flex items-center gap-1.5 rounded-md border border-status-success/40 bg-status-success/20 px-3 py-1.5 text-xs font-semibold text-status-success transition-colors hover:bg-status-success/30 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Save className="h-3.5 w-3.5" />
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-panel px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:text-white"
                      >
                        <X className="h-3.5 w-3.5" />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <p className={`whitespace-pre-wrap text-sm text-text-primary ${note.completed ? "line-through text-text-muted" : ""}`}>
                        {note.content}
                      </p>
                      <p className="text-xs text-text-muted">
                        Updated {new Date(note.updatedAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {note.completed ? (
                        <button
                          type="button"
                          onClick={() => void toggleComplete(note)}
                          className="rounded-md p-2 text-status-warning transition-colors hover:bg-status-warning/10"
                          title="Reopen note"
                        >
                          <Undo2 className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void toggleComplete(note)}
                          className="rounded-md p-2 text-status-success transition-colors hover:bg-status-success/10"
                          title="Mark as done"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                      )}
                      {!note.completed && (
                        <button
                          type="button"
                          onClick={() => startEdit(note)}
                          className="rounded-md p-2 text-text-secondary transition-colors hover:bg-bg-panel hover:text-white"
                          title="Edit note"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void deleteNote(note.id)}
                        className="rounded-md p-2 text-text-secondary transition-colors hover:bg-status-error/10 hover:text-status-error"
                        title="Delete note"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
