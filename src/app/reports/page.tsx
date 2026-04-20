'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reports } from '@/features/reports/api';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { FileText, Trash2 } from 'lucide-react';

export default function ReportsPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    category: '',
    status: '',
    area: '',
  });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newReport, setNewReport] = useState({
    title: '',
    content: '',
    category: 'system',
    status: 'info',
    source: 'manual',
    area: '',
    topics: '',
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['reports', filters],
    queryFn: () => reports.list(filters),
    staleTime: 3 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => reports.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      setShowCreateForm(false);
      setNewReport({
        title: '',
        content: '',
        category: 'system',
        status: 'info',
        source: 'manual',
        area: '',
        topics: '',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => reports.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReport.title.trim() || !newReport.content.trim()) return;
    createMutation.mutate({
      ...newReport,
      area: newReport.area || undefined,
      topics: newReport.topics
        .split(',')
        .map((topic) => topic.trim())
        .filter(Boolean),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 animate-pulse">Loading reports...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-red-800 font-semibold mb-2">Failed to load reports</h3>
        <p className="text-red-600 text-sm">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Reports</h2>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            New Report
          </button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <select
            value={filters.category}
            onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Categories</option>
            <option value="system">System</option>
            <option value="task">Task</option>
            <option value="chat">Chat</option>
            <option value="file">File</option>
            <option value="research">Research</option>
            <option value="error">Error</option>
            <option value="maintenance">Maintenance</option>
          </select>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="info">Info</option>
            <option value="success">Success</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>
          <select
            value={filters.area}
            onChange={(e) => setFilters({ ...filters, area: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Areas</option>
            <option value="automation">Automation</option>
            <option value="context">Context</option>
            <option value="graph">Graph</option>
            <option value="ui">UI</option>
          </select>
        </div>

        {/* Create Form */}
        {showCreateForm && (
          <form onSubmit={handleSubmit} className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Report title"
                value={newReport.title}
                onChange={(e) => setNewReport({ ...newReport, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={newReport.category}
                  onChange={(e) => setNewReport({ ...newReport, category: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="system">System</option>
                  <option value="task">Task</option>
                  <option value="chat">Chat</option>
                  <option value="file">File</option>
                  <option value="research">Research</option>
                  <option value="error">Error</option>
                  <option value="maintenance">Maintenance</option>
                </select>
                <select
                  value={newReport.status}
                  onChange={(e) => setNewReport({ ...newReport, status: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="info">Info</option>
                  <option value="success">Success</option>
                  <option value="warning">Warning</option>
                  <option value="error">Error</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={newReport.area}
                  onChange={(e) => setNewReport({ ...newReport, area: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">No area</option>
                  <option value="automation">Automation</option>
                  <option value="context">Context</option>
                  <option value="graph">Graph</option>
                  <option value="ui">UI</option>
                </select>
                <input
                  type="text"
                  placeholder="Topics (comma-separated)"
                  value={newReport.topics}
                  onChange={(e) => setNewReport({ ...newReport, topics: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <textarea
                placeholder="Report content (markdown supported)"
                value={newReport.content}
                onChange={(e) => setNewReport({ ...newReport, content: e.target.value })}
                rows={8}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Report'}
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

        <div className="space-y-4">
          {data?.reports?.map((report: any) => (
            <div
              key={report.id}
              className="p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <h3 className="font-semibold text-gray-900">{report.title}</h3>
                </div>
                <button
                  onClick={() => deleteMutation.mutate(report.id)}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-2 mb-3">
                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                  {report.category}
                </span>
                <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                  {report.status}
                </span>
                <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                  {report.source}
                </span>
                {report.area && (
                  <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs font-medium">
                    {report.area}
                  </span>
                )}
              </div>
              {report.topics?.length > 0 && (
                <div className="flex gap-2 mb-3 flex-wrap">
                  {report.topics.map((topic: string) => (
                    <span
                      key={topic}
                      className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              )}
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown>{report.content}</ReactMarkdown>
              </div>
              <p className="text-xs text-gray-500 mt-3">
                {report.date ? new Date(report.date).toLocaleString() : 'No timestamp'}
              </p>
            </div>
          ))}

          {data?.reports?.length === 0 && (
            <div className="text-center py-8 text-gray-500">No reports found.</div>
          )}
        </div>

        {data?.meta && (
          <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
            {data.meta.total} total reports. Loaded {data.meta.loaded}. More available: {data.meta.hasMore ? 'yes' : 'no'}.
          </div>
        )}
      </div>
    </div>
  );
}
