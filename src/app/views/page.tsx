'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { views } from '@/features/views/api';
import { useState } from 'react';
import { Eye, Plus, ScrollText, FileText, Trash2 } from 'lucide-react';
import {
  Badge,
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
  Select,
  Surface,
  Tabs,
  cn,
  inputClassName,
  textareaClassName,
} from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';

type Surface = 'quests' | 'reports';

interface SavedView {
  id: string;
  name: string;
  surface: Surface;
  filters?: Record<string, unknown>;
}

export default function ViewsPage() {
  const queryClient = useQueryClient();
  const [surface, setSurface] = useState<Surface>('quests');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newView, setNewView] = useState({
    name: '',
    type: 'quests' as Surface,
    filters: '',
  });
  const [formError, setFormError] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['views', surface],
    queryFn: () => views.list(surface),
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; surface: Surface; filters: Record<string, unknown> }) =>
      views.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['views'] });
      setShowCreateForm(false);
      setNewView({ name: '', type: surface, filters: '' });
      setFormError('');
      toast.success('View saved');
    },
    onError: () => toast.error('Failed to save view'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => views.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['views'] });
      toast.success('View deleted');
    },
    onError: () => toast.error('Failed to delete view'),
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
      name: newView.name.trim(),
      surface: newView.type,
      filters: parsedFilters,
    });
  };

  const viewList = (data?.views ?? []) as SavedView[];

  if (isLoading) {
    return (
      <PageContainer>
        <LoadingState label="Loading views..." />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <ErrorState
          title="Failed to load views"
          message={error.message}
          onRetry={() => refetch()}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Workspace"
        title="Saved Views"
        description="Persist filter sets for quests or reports and jump back to them quickly."
        actions={
          <Button
            icon={Plus}
            onClick={() => setShowCreateForm((v) => !v)}
            tone={showCreateForm ? 'secondary' : 'primary'}
          >
            {showCreateForm ? 'Close' : 'New View'}
          </Button>
        }
      />

      <Tabs<Surface>
        value={surface}
        onChange={(v) => {
          setSurface(v);
          setNewView((prev) => ({ ...prev, type: v }));
        }}
        tabs={[
          { value: 'quests', label: 'Quests', icon: ScrollText },
          { value: 'reports', label: 'Reports', icon: FileText },
        ]}
      />

      {showCreateForm && (
        <Surface>
          <CardHeader title="New saved view" icon={Plus} />
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-4">
              <LabeledField label="Name" required htmlFor="view-name">
                <input
                  id="view-name"
                  type="text"
                  value={newView.name}
                  onChange={(e) => setNewView({ ...newView, name: e.target.value })}
                  placeholder="e.g. Blocked hard quests"
                  className={inputClassName}
                  required
                />
              </LabeledField>
              <LabeledField label="Surface" htmlFor="view-surface">
                <Select
                  id="view-surface"
                  value={newView.type}
                  onChange={(e) => setNewView({ ...newView, type: e.target.value as Surface })}
                >
                  <option value="quests">Quests</option>
                  <option value="reports">Reports</option>
                </Select>
              </LabeledField>
              <LabeledField
                label="Filters (JSON)"
                hint="Optional. e.g. {&quot;status&quot;:&quot;blocked&quot;}"
                htmlFor="view-filters"
              >
                <textarea
                  id="view-filters"
                  value={newView.filters}
                  onChange={(e) => {
                    setNewView({ ...newView, filters: e.target.value });
                    if (formError) setFormError('');
                  }}
                  rows={4}
                  placeholder='{"status":"blocked","difficulty":"hard"}'
                  className={cn(textareaClassName, 'font-mono text-[13px]')}
                />
              </LabeledField>
              {formError && <p className="text-sm text-rose-300">{formError}</p>}
              <div className="flex gap-2">
                <Button
                  type="submit"
                  icon={Plus}
                  disabled={createMutation.isPending || !newView.name.trim()}
                >
                  {createMutation.isPending ? 'Saving...' : 'Save View'}
                </Button>
                <Button type="button" onClick={() => setShowCreateForm(false)} tone="secondary">
                  Cancel
                </Button>
              </div>
            </form>
          </CardBody>
        </Surface>
      )}

      <div className="space-y-3 mc-stagger">
        {viewList.map((view) => (
          <Card key={view.id} as="article" interactive>
            <div className="flex items-center justify-between gap-4 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-blue-200">
                  <Eye className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-slate-100">{view.name}</h3>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge tone={view.surface === 'quests' ? 'blue' : 'green'}>
                      {view.surface}
                    </Badge>
                    {view.filters && Object.keys(view.filters).length > 0 && (
                      <span className="text-xs text-slate-500">
                        {Object.keys(view.filters).length} filter{Object.keys(view.filters).length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <IconButton
                onClick={() => deleteMutation.mutate(view.id)}
                icon={Trash2}
                tone="danger"
                aria-label="Delete view"
              />
            </div>
          </Card>
        ))}

        {viewList.length === 0 && (
          <EmptyState
            icon={Eye}
            title="No saved views"
            description="Save a filter set to quickly return to a specific slice of quests or reports."
            action={
              !showCreateForm ? (
                <Button icon={Plus} onClick={() => setShowCreateForm(true)}>
                  Create view
                </Button>
              ) : undefined
            }
          />
        )}
      </div>
    </PageContainer>
  );
}
