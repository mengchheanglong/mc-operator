'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { docs } from '@/features/docs/api';
import type { CreateDocPayload, DocScope } from '@/features/docs/api';
import { useState } from 'react';
import { FileText, FolderOpen, Plus, Search, Tag, Trash2 } from 'lucide-react';
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
  iconInputClassName,
  inputClassName,
  textareaClassName,
} from '@/components/ui/primitives';

type NewDocForm = Omit<CreateDocPayload, 'tags'> & {
  fileType: string;
  scope: DocScope;
  tags: string;
};

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function DocsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const [fileType, setFileType] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newDoc, setNewDoc] = useState<NewDocForm>({
    title: '',
    content: '',
    fileType: '.md',
    scope: 'project',
    tags: '',
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['docs', search, tag, fileType],
    queryFn: () =>
      docs.list({
        ...(search ? { search } : {}),
        ...(tag ? { tag } : {}),
        ...(fileType ? { fileType } : {}),
      }),
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateDocPayload) => docs.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docs'] });
      setShowCreateForm(false);
      setNewDoc({ title: '', content: '', fileType: '.md', scope: 'project', tags: '' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => docs.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docs'] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDoc.title.trim() || !newDoc.content.trim()) return;
    createMutation.mutate({
      title: newDoc.title,
      content: newDoc.content,
      fileType: newDoc.fileType,
      scope: newDoc.scope,
      tags: newDoc.tags.split(',').map((t) => t.trim()).filter(Boolean),
    });
  };

  if (isLoading) {
    return <LoadingState label="Loading documents..." />;
  }

  if (error) {
    return <ErrorState title="Failed to load documents" message={error.message} />;
  }

  const docList = data?.docs ?? [];
  const sharedCount = docList.filter((doc) => doc.scope === 'shared').length;
  const projectCount = docList.length - sharedCount;
  const activeFilters = [search, tag, fileType].filter(Boolean).length;

  return (
    <div className="space-y-5">
      <Surface>
        <div className="px-5 py-5">
          <PageHeader
            eyebrow="Knowledge"
            title="Documents"
            description="Workspace notes, source material, and shared operational context."
            actions={
              <Button
                icon={Plus}
                onClick={() => setShowCreateForm((visible) => !visible)}
                tone={showCreateForm ? 'secondary' : 'primary'}
              >
                {showCreateForm ? 'Close' : 'New Document'}
              </Button>
            }
          />

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              ['Visible docs', docList.length],
              ['Project scope', projectCount],
              ['Shared scope', sharedCount],
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

        <Toolbar>
          <Field icon={Search} className="lg:flex-1">
            <input
              type="text"
              placeholder="Search documents"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={iconInputClassName}
            />
          </Field>
          <Field icon={Tag} className="lg:w-56">
            <input
              type="text"
              placeholder="Filter by tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              className={iconInputClassName}
            />
          </Field>
          <select
            value={fileType}
            onChange={(e) => setFileType(e.target.value)}
            className={cn(inputClassName, 'lg:w-48')}
          >
            <option value="">All file types</option>
            <option value=".md">Markdown</option>
          </select>
          {activeFilters > 0 && <Badge tone="blue">{activeFilters} active</Badge>}
        </Toolbar>

        {showCreateForm && (
          <form onSubmit={handleSubmit} className="border-b border-white/8 px-5 py-4">
            <div className="grid gap-3 lg:grid-cols-[1fr_170px_170px]">
              <input
                type="text"
                placeholder="Document title"
                value={newDoc.title}
                onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })}
                className={cn(inputClassName, 'lg:col-span-3')}
                required
              />
              <select
                value={newDoc.fileType}
                onChange={(e) => setNewDoc({ ...newDoc, fileType: e.target.value })}
                className={inputClassName}
              >
                <option value=".md">Markdown (.md)</option>
              </select>
              <select
                value={newDoc.scope}
                onChange={(e) => setNewDoc({ ...newDoc, scope: e.target.value as DocScope })}
                className={inputClassName}
              >
                <option value="project">Project scope</option>
                <option value="shared">Shared scope</option>
              </select>
              <input
                type="text"
                placeholder="Tags (comma-separated)"
                value={newDoc.tags}
                onChange={(e) => setNewDoc({ ...newDoc, tags: e.target.value })}
                className={inputClassName}
              />
              <textarea
                placeholder="Document content (markdown supported)"
                value={newDoc.content}
                onChange={(e) => setNewDoc({ ...newDoc, content: e.target.value })}
                rows={6}
                className={cn(textareaClassName, 'lg:col-span-3')}
                required
              />
              <div className="flex gap-2 lg:col-span-3">
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  icon={Plus}
                  className="flex-1"
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
            </div>
          </form>
        )}

        <div className="space-y-2 px-5 py-5">
          {docList.map((doc) => (
            <article
              key={doc.id}
              className="group rounded-lg border border-white/8 bg-white/[0.035] px-4 py-3 transition hover:-translate-y-0.5 hover:border-blue-300/22 hover:bg-white/[0.055]"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-300/15 bg-blue-400/10 text-blue-100">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-words text-sm font-semibold leading-6 text-slate-100">
                      {doc.title}
                    </h3>
                    <Badge tone={doc.scope === 'shared' ? 'purple' : 'blue'}>{doc.scope}</Badge>
                    <Badge tone="slate">{doc.fileType || '.md'}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-400">{doc.content}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge tone="slate">Updated {formatUpdatedAt(doc.updatedAt)}</Badge>
                    {doc.tags?.map((docTag) => (
                      <Badge key={docTag} tone="green">
                        {docTag}
                      </Badge>
                    ))}
                  </div>
                </div>
                <IconButton
                  onClick={() => deleteMutation.mutate(doc.id)}
                  icon={Trash2}
                  tone="danger"
                  title="Delete"
                />
              </div>
            </article>
          ))}

          {docList.length === 0 && (
            <EmptyState
              icon={FolderOpen}
              title="No documents found"
              description="Adjust filters or add a document to this workspace."
            />
          )}
        </div>
      </Surface>
    </div>
  );
}
