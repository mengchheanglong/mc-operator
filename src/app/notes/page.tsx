'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notes } from '@/features/notes/api';
import { useState } from 'react';
import { Plus, Trash2, CheckCircle, Circle } from 'lucide-react';

export default function NotesPage() {
  const queryClient = useQueryClient();
  const [newNote, setNewNote] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['notes'],
    queryFn: notes.list,
    staleTime: 5 * 60 * 1000, // 5 minutes for notes
  });

  const createMutation = useMutation({
    mutationFn: (content: string) => notes.create({ content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      setNewNote('');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => {
      const note = data?.notes.find((n: any) => n.id === id);
      return notes.update(id, { completed: !note?.completed });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => notes.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newNote.trim()) {
      createMutation.mutate(newNote);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 animate-pulse">Loading notes...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-red-800 font-semibold mb-2">Failed to load notes</h3>
        <p className="text-red-600 text-sm">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Notes</h2>

        {/* Add Note Form */}
        <form onSubmit={handleSubmit} className="mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add a new note..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={!newNote.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>
        </form>

        {/* Notes List */}
        <div className="space-y-2">
          {data?.notes?.map((note: any) => (
            <div
              key={note.id}
              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <button
                onClick={() => toggleMutation.mutate(note.id)}
                className="flex-shrink-0"
              >
                {note.completed ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <Circle className="w-5 h-5 text-gray-400" />
                )}
              </button>
              <span
                className={`flex-1 ${
                  note.completed ? 'line-through text-gray-500' : 'text-gray-900'
                }`}
              >
                {note.content}
              </span>
              <button
                onClick={() => deleteMutation.mutate(note.id)}
                className="flex-shrink-0 text-gray-400 hover:text-red-600 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          {data?.notes?.length === 0 && (
            <div className="text-center py-8 text-gray-500">No notes yet. Add one above!</div>
          )}
        </div>
      </div>
    </div>
  );
}
