'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { views } from '@/features/views/api';
import { useState } from 'react';
import { Eye, Plus, Trash2 } from 'lucide-react';

export default function ViewsPage() {
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [surface, setSurface] = useState<'quests' | 'reports'>('quests');
  const [newView, setNewView] = useState({
    name: '',
    type: 'quests' as 'quests' | 'reports',
    filters: '',
  });
  const [formError, setFormError] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['views', surface],
    queryFn: () => views.list(surface),
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => views.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['views'] });
      setShowCreateForm(false);
      setNewView({ name: '', type: 'quests', filters: '' });
      setFormError('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => views.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['views'] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newView.name.trim()) return;
    let parsedFilters: Record<string, unknown> = {};
    if (newView.filters.trim()) {
      try {
        parsedFilters = JSON.parse(newView.filters);
      } catch {
        setFormError('Filters must be valid JSON.');
        return;
      }
    }
    setFormError('');
    createMutation.mutate({
      name: newView.name,
      surface: newView.type,
      filters: parsedFilters,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 animate-pulse">Loading views...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-red-800 font-semibold mb-2">Failed to load views</h3>
        <p className="text-red-600 text-sm">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Saved Views</h2>
          <div className="flex gap-2">
            <select
              value={surface}
              onChange={(e) => setSurface(e.target.value as 'quests' | 'reports')}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="quests">Quests</option>
              <option value="reports">Reports</option>
            </select>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New View
            </button>
          </div>
        </div>

        {/* Create Form */}
        {showCreateForm && (
          <form onSubmit={handleSubmit} className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
            <div className="space-y-3">
              <input
                type="text"
                placeholder="View name"
                value={newView.name}
                onChange={(e) => setNewView({ ...newView, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
              <select
                value={newView.type}
                onChange={(e) =>
                  setNewView({
                    ...newView,
                    type: e.target.value as 'quests' | 'reports',
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="quests">Quests</option>
                <option value="reports">Reports</option>
              </select>
              <textarea
                placeholder="Filters (JSON format, optional)"
                value={newView.filters}
                onChange={(e) => {
                  setNewView({ ...newView, filters: e.target.value });
                  if (formError) {
                    setFormError('');
                  }
                }}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
              />
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create View'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Views List */}
        <div className="space-y-3">
          {data?.views?.map((view: any) => (
            <div
              key={view.id}
              className="p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Eye className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{view.name}</h3>
                  <p className="text-sm text-gray-600 capitalize">{view.surface} view</p>
                </div>
              </div>
              <button
                onClick={() => deleteMutation.mutate(view.id)}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          {data?.views?.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No saved views. Create one to get started!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
