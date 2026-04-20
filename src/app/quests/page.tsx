'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { quests } from '@/features/quests/api';
import { useState } from 'react';
import { Plus, Trash2, CheckCircle, Circle } from 'lucide-react';

export default function QuestsPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    status: '',
    area: '',
    completed: '',
  });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newQuest, setNewQuest] = useState({
    goal: '',
    difficulty: 'normal',
    area: '',
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['quests', filters],
    queryFn: () => quests.list(filters),
    staleTime: 2 * 60 * 1000, // 2 minutes for quests
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => quests.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quests'] });
      setShowCreateForm(false);
      setNewQuest({ goal: '', difficulty: 'normal', area: '' });
    },
  });

  const completeMutation = useMutation({
    mutationFn: ({
      id,
      verificationSummary,
    }: {
      id: string;
      verificationSummary: string;
    }) => quests.complete(id, { verificationSummary }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quests'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => quests.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quests'] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newQuest.goal.trim()) {
      createMutation.mutate(newQuest);
    }
  };

  const handleComplete = (quest: any) => {
    const verificationSummary = window.prompt(
      `Record verification before completing "${quest.goal}".`,
      'Verified behavior manually.',
    );
    if (!verificationSummary?.trim()) {
      return;
    }
    completeMutation.mutate({
      id: quest.id,
      verificationSummary: verificationSummary.trim(),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 animate-pulse">Loading quests...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-red-800 font-semibold mb-2">Failed to load quests</h3>
        <p className="text-red-600 text-sm">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Quests</h2>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Quest
          </button>
        </div>

        {/* Create Quest Form */}
        {showCreateForm && (
          <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 rounded-lg space-y-3">
            <input
              type="text"
              value={newQuest.goal}
              onChange={(e) => setNewQuest({ ...newQuest, goal: e.target.value })}
              placeholder="Quest goal..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <div className="flex gap-3">
              <select
                value={newQuest.difficulty}
                onChange={(e) => setNewQuest({ ...newQuest, difficulty: e.target.value })}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="easy">Easy</option>
                <option value="normal">Normal</option>
                <option value="hard">Hard</option>
              </select>
              <input
                type="text"
                value={newQuest.area}
                onChange={(e) => setNewQuest({ ...newQuest, area: e.target.value })}
                placeholder="Area (optional)"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Create Quest
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Filters */}
        <div className="mb-4 flex gap-3">
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="blocked">Blocked</option>
            <option value="done">Done</option>
          </select>
          <select
            value={filters.completed}
            onChange={(e) => setFilters({ ...filters, completed: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All</option>
            <option value="true">Completed</option>
            <option value="false">Active</option>
          </select>
          <input
            type="text"
            value={filters.area}
            onChange={(e) => setFilters({ ...filters, area: e.target.value })}
            placeholder="Filter by area"
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Quests List */}
        <div className="space-y-3">
          {data?.quests?.map((quest: any) => (
            <div
              key={quest.id}
              className="p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {quest.completed ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <Circle className="w-5 h-5 text-gray-400" />
                    )}
                    <h3
                      className={`font-semibold ${
                        quest.completed ? 'line-through text-gray-500' : 'text-gray-900'
                      }`}
                    >
                      {quest.goal}
                    </h3>
                  </div>
                  <div className="flex gap-2 ml-7">
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                      {quest.difficulty}
                    </span>
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                      {quest.status}
                    </span>
                    {quest.area && (
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                        {quest.area}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  {!quest.completed && (
                    <button
                      onClick={() => handleComplete(quest)}
                      className="p-2 text-green-600 hover:bg-green-50 rounded transition-colors"
                      title="Mark complete"
                    >
                      <CheckCircle className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => deleteMutation.mutate(quest.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {data?.quests?.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No quests found. Create one to get started!
            </div>
          )}
        </div>

        {data?.meta && (
          <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
            {data.meta.total} total quests. Open: {data.meta.statusCounts?.open ?? 0}, in progress: {data.meta.statusCounts?.in_progress ?? 0}, blocked: {data.meta.statusCounts?.blocked ?? 0}, done: {data.meta.statusCounts?.done ?? 0}.
          </div>
        )}
      </div>
    </div>
  );
}
