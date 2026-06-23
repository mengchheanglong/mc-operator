'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { quests } from '@/features/quests/api';
import type { CreateQuestPayload, Quest, QuestDifficulty, QuestStatus } from '@/features/quests/api';
import { useState } from 'react';
import {
  CheckCircle,
  Circle,
  Filter,
  ListChecks,
  Plus,
  Search,
  Target,
  Trash2,
} from 'lucide-react';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  LoadingState,
  PageHeader,
  Surface,
  Toolbar,
  cn,
  inputClassName,
} from '@/components/ui/primitives';

const statusLabels: Record<QuestStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};

const statusTones: Record<QuestStatus, 'blue' | 'slate' | 'green' | 'amber' | 'red' | 'purple'> = {
  open: 'blue',
  in_progress: 'purple',
  blocked: 'amber',
  done: 'green',
};

const difficultyTones: Record<QuestDifficulty, 'blue' | 'slate' | 'green' | 'amber' | 'red' | 'purple'> = {
  easy: 'green',
  normal: 'blue',
  hard: 'amber',
  nightmare: 'red',
  hell: 'red',
};

export default function QuestsPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    status: '',
    area: '',
    completed: '',
  });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newQuest, setNewQuest] = useState<CreateQuestPayload>({
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
    mutationFn: (data: CreateQuestPayload) => quests.create(data),
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

  const handleComplete = (quest: Quest) => {
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
    return <LoadingState label="Loading quests..." />;
  }

  if (error) {
    return <ErrorState title="Failed to load quests" message={error.message} />;
  }

  const questList = data?.quests ?? [];
  const meta = data?.meta;
  const activeFilters = [filters.status, filters.completed, filters.area].filter(Boolean).length;

  return (
    <div className="space-y-5">
      <Surface>
        <div className="px-5 py-5">
          <PageHeader
            eyebrow="Execution"
            title="Quests"
            description="Current work, verification status, and delivery flow."
            actions={
              <Button
                icon={Plus}
                onClick={() => setShowCreateForm((visible) => !visible)}
                tone={showCreateForm ? 'secondary' : 'primary'}
              >
                {showCreateForm ? 'Close' : 'New Quest'}
              </Button>
            }
          />

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Total', meta?.total ?? questList.length],
              ['Open', meta?.statusCounts?.open ?? 0],
              ['In progress', meta?.statusCounts?.in_progress ?? 0],
              ['Done', meta?.statusCounts?.done ?? 0],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-lg border border-white/8 bg-white/[0.035] px-4 py-3"
              >
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  {label}
                </p>
                <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {showCreateForm && (
          <form onSubmit={handleSubmit} className="border-t border-white/8 px-5 py-4">
            <div className="grid gap-3 lg:grid-cols-[1fr_180px_220px_auto_auto]">
              <Field icon={Target}>
                <input
                  type="text"
                  value={newQuest.goal}
                  onChange={(e) => setNewQuest({ ...newQuest, goal: e.target.value })}
                  placeholder="Quest goal"
                  className={cn(inputClassName, 'pl-9')}
                  required
                />
              </Field>
              <select
                value={newQuest.difficulty}
                onChange={(e) =>
                  setNewQuest({ ...newQuest, difficulty: e.target.value as QuestDifficulty })
                }
                className={inputClassName}
              >
                <option value="easy">Easy</option>
                <option value="normal">Normal</option>
                <option value="hard">Hard</option>
              </select>
              <input
                type="text"
                value={newQuest.area}
                onChange={(e) => setNewQuest({ ...newQuest, area: e.target.value })}
                placeholder="Area"
                className={inputClassName}
              />
              <Button
                type="submit"
                icon={Plus}
                disabled={createMutation.isPending || !newQuest.goal.trim()}
              >
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </Button>
              <Button
                type="button"
                onClick={() => setShowCreateForm(false)}
                tone="secondary"
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        <Toolbar>
          <div className="flex items-center gap-2 text-sm font-medium text-slate-400 lg:w-28">
            <Filter className="h-4 w-4 text-blue-200" />
            Filters
            {activeFilters > 0 && <Badge tone="blue">{activeFilters}</Badge>}
          </div>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className={cn(inputClassName, 'lg:w-48')}
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
            className={cn(inputClassName, 'lg:w-44')}
          >
            <option value="">All</option>
            <option value="true">Completed</option>
            <option value="false">Active</option>
          </select>
          <Field icon={Search} className="lg:min-w-64 lg:flex-1">
            <input
              type="text"
              value={filters.area}
              onChange={(e) => setFilters({ ...filters, area: e.target.value })}
              placeholder="Filter by area"
              className={cn(inputClassName, 'pl-9')}
            />
          </Field>
        </Toolbar>

        <div className="space-y-2 px-5 py-5">
          {questList.map((quest) => (
            <article
              key={quest.id}
              className={cn(
                'group rounded-lg border bg-white/[0.035] px-4 py-3 transition hover:-translate-y-0.5 hover:border-blue-300/22 hover:bg-white/[0.055]',
                quest.completed ? 'border-emerald-300/16' : 'border-white/8',
              )}
            >
              <div className="flex items-start gap-3">
                <div className="pt-0.5">
                  {quest.completed ? (
                    <CheckCircle className="h-5 w-5 text-emerald-300" />
                  ) : (
                    <Circle className="h-5 w-5 text-slate-500" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3
                    className={cn(
                      'break-words text-sm font-semibold leading-6',
                      quest.completed ? 'text-slate-500 line-through' : 'text-slate-100',
                    )}
                  >
                    {quest.goal}
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge tone={difficultyTones[quest.difficulty]}>{quest.difficulty}</Badge>
                    <Badge tone={statusTones[quest.status]}>{statusLabels[quest.status]}</Badge>
                    {quest.area && <Badge tone="purple">{quest.area}</Badge>}
                    {quest.topics.slice(0, 3).map((topic) => (
                      <Badge key={topic} tone="slate">
                        {topic}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {!quest.completed && (
                    <IconButton
                      onClick={() => handleComplete(quest)}
                      icon={CheckCircle}
                      tone="success"
                      title="Mark complete"
                    />
                  )}
                  <IconButton
                    onClick={() => deleteMutation.mutate(quest.id)}
                    icon={Trash2}
                    tone="danger"
                    title="Delete"
                  />
                </div>
              </div>
            </article>
          ))}

          {questList.length === 0 && (
            <EmptyState
              icon={ListChecks}
              title="No quests found"
              description="Adjust filters or add a quest to this workspace."
            />
          )}
        </div>
      </Surface>
    </div>
  );
}
