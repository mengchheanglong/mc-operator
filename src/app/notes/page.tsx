'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notes } from '@/features/notes/api';
import { useState } from 'react';
import { CheckCircle2, Circle, Plus, StickyNote, Trash2 } from 'lucide-react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  IconButton,
  LabeledField,
  LoadingState,
  PageContainer,
  PageHeader,
  cn,
  inputClassName,
} from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';

interface Note {
  id: string;
  content: string;
  completed: boolean;
}

export default function NotesPage() {
  const queryClient = useQueryClient();
  const [newNote, setNewNote] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['notes'],
    queryFn: notes.list,
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: (content: string) => notes.create({ content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      setNewNote('');
      toast.success('Note added');
    },
    onError: () => toast.error('Failed to add note'),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => {
      const note = data?.notes?.find((n: Note) => n.id === id);
      return notes.update(id, { completed: !note?.completed });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
    onError: () => toast.error('Failed to update note'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => notes.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      toast.success('Note deleted');
    },
    onError: () => toast.error('Failed to delete note'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newNote.trim()) {
      createMutation.mutate(newNote.trim());
    }
  };

  const noteList = (data?.notes ?? []) as Note[];

  if (isLoading) {
    return (
      <PageContainer>
        <LoadingState label="Loading notes..." />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <ErrorState
          title="Failed to load notes"
          message={error.message}
          onRetry={() => refetch()}
        />
      </PageContainer>
    );
  }

  const activeCount = noteList.filter((n) => !n.completed).length;
  const doneCount = noteList.filter((n) => n.completed).length;

  return (
    <PageContainer width="narrow">
      <PageHeader
        eyebrow="Knowledge"
        title="Notes"
        description="Quick captures and reminders for this workspace."
        actions={
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="tabular-nums">{activeCount} active</span>
            <span aria-hidden="true" className="h-1 w-1 rounded-full bg-slate-700" />
            <span className="tabular-nums">{doneCount} done</span>
          </div>
        }
      />

      <Card>
        <CardHeader title="Add a note" icon={Plus} />
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-3">
            <LabeledField label="Note" htmlFor="note-input" hint="Press Enter to add.">
              <input
                id="note-input"
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Add a quick note..."
                className={inputClassName}
              />
            </LabeledField>
            <div className="flex gap-2">
              <Button
                type="submit"
                icon={Plus}
                disabled={createMutation.isPending || !newNote.trim()}
              >
                {createMutation.isPending ? 'Adding...' : 'Add Note'}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <div className="space-y-2 mc-stagger">
        {noteList.map((note) => (
          <Card
            key={note.id}
            as="article"
            padding="none"
            interactive
            className={cn(
              'group flex items-center gap-3 px-4 py-3',
              note.completed && 'opacity-70',
            )}
          >
            <button
              type="button"
              onClick={() => toggleMutation.mutate(note.id)}
              aria-label={note.completed ? 'Mark as active' : 'Mark as done'}
              className="shrink-0 rounded-md p-0.5 text-slate-500 outline-none transition hover:text-slate-300 focus-visible:ring-4 focus-visible:ring-blue-400/20"
            >
              {note.completed ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-300" />
              ) : (
                <Circle className="h-5 w-5 text-slate-500" />
              )}
            </button>
            <span
              className={cn(
                'min-w-0 flex-1 text-sm leading-6',
                note.completed ? 'text-slate-500 line-through' : 'text-slate-100',
              )}
            >
              {note.content}
            </span>
            <IconButton
              onClick={() => deleteMutation.mutate(note.id)}
              icon={Trash2}
              tone="danger"
              aria-label="Delete note"
              className="opacity-0 transition group-hover:opacity-100"
            />
          </Card>
        ))}

        {noteList.length === 0 && (
          <EmptyState
            icon={StickyNote}
            title="No notes yet"
            description="Add a quick note above to capture a reminder or thought."
          />
        )}
      </div>
    </PageContainer>
  );
}
