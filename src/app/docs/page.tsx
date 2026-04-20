'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { docs } from '@/features/docs/api';
import { useState } from 'react';
import { FileText, Search, Tag, Plus, Trash2 } from 'lucide-react';

export default function DocsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const [fileType, setFileType] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newDoc, setNewDoc] = useState({
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
    mutationFn: (data: any) => docs.create(data),
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
      tags: newDoc.tags.split(',').map(t => t.trim()).filter(Boolean),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 animate-pulse">Loading documents...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-red-800 font-semibold mb-2">Failed to load documents</h3>
        <p className="text-red-600 text-sm">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Documents</h2>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Document
          </button>
        </div>

        {/* Search & Filter */}
        <div className="flex gap-3 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="relative">
            <Tag className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Filter by tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <select
            value={fileType}
            onChange={(e) => setFileType(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All file types</option>
            <option value=".md">Markdown</option>
          </select>
        </div>

        {/* Create Form */}
        {showCreateForm && (
          <form onSubmit={handleSubmit} className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Document title"
                value={newDoc.title}
                onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
              <select
                value={newDoc.fileType}
                onChange={(e) => setNewDoc({ ...newDoc, fileType: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value=".md">Markdown (.md)</option>
              </select>
              <select
                value={newDoc.scope}
                onChange={(e) => setNewDoc({ ...newDoc, scope: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="project">Project scope</option>
                <option value="shared">Shared scope</option>
              </select>
              <input
                type="text"
                placeholder="Tags (comma-separated)"
                value={newDoc.tags}
                onChange={(e) => setNewDoc({ ...newDoc, tags: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <textarea
                placeholder="Document content (markdown supported)"
                value={newDoc.content}
                onChange={(e) => setNewDoc({ ...newDoc, content: e.target.value })}
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Document'}
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

        {/* Documents List */}
        <div className="space-y-4">
          {data?.docs?.map((doc: any) => (
            <div
              key={doc.id}
              className="p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <h3 className="font-semibold text-gray-900">{doc.title}</h3>
                </div>
                <button
                  onClick={() => deleteMutation.mutate(doc.id)}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-2 mb-2">
                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                  {doc.fileType || '.md'}
                </span>
                <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                  {doc.scope || 'project'}
                </span>
                {doc.tags?.map((tag: string) => (
                  <span key={tag} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                    {tag}
                  </span>
                ))}
              </div>
              <p className="text-sm text-gray-600 line-clamp-2">{doc.content}</p>
            </div>
          ))}

          {data?.docs?.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No documents found. Create one to get started!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
