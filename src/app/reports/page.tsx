'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reports } from '@/features/reports/api';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  FileText,
  Trash2,
  Plus,
  Filter,
  Target,
  Search,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  LabeledField,
  LoadingState,
  PageContainer,
  PageHeader,
  Select,
  Surface,
  Timestamp,
  Toolbar,
  cn,
  inputClassName,
  textareaClassName,
  type Tone,
} from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';

interface CreateReportPayload {
  title: string;
  content: string;
  category: string;
  status: string;
  source: string;
  area?: string;
  topics?: string[];
}

interface Report {
  id: string;
  title: string;
  content: string;
  category: string;
  status: string;
  source: string;
  area: string | null;
  topics: string[];
  date: string;
}

const categoryTones: Record<string, Tone> = {
  system: 'slate',
  task: 'blue',
  chat: 'purple',
  file: 'cyan',
  research: 'green',
  error: 'red',
  maintenance: 'amber',
};

const statusTones: Record<string, Tone> = {
  info: 'blue',
  success: 'green',
  warning: 'amber',
  error: 'red',
};

const areaTones: Record<string, Tone> = {
  automation: 'cyan',
  context: 'purple',
  graph: 'green',
  ui: 'blue',
};

export default function ReportsPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    category: '',
    status: '',
    area: '',
  });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newReport, setNewReport] = useState<CreateReportPayload>({
    title: '',
    content: '',
    category: 'system',
    status: 'info',
    source: 'manual',
    area: '',
    topics: '',
  } as CreateReportPayload & { topics: string });

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['reports', filters],
    queryFn: () => reports.list(filters),
    staleTime: 3 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: (payload: {
      title: string;
      content: string;
      category: string;
      status: string;
      source: string;
      area?: string;
      topics?: string[];
    }) => reports.create(payload),
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
      } as CreateReportPayload & { topics: string });
      toast.success('Report created', 'The report has been added.');
    },
    onError: () => {
      toast.error('Failed to create report', 'Please try again.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => reports.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      toast.success('Report deleted');
    },
    onError: () => {
      toast.error('Failed to delete report', 'Please try again.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReport.title.trim() || !newReport.content.trim()) return;
    createMutation.mutate({
      ...newReport,
      area: newReport.area || undefined,
      topics: (newReport as unknown as { topics: string }).topics
        .split(',')
        .map((topic: string) => topic.trim())
        .filter(Boolean),
    });
  };

  if (isLoading) {
    return (
      <PageContainer>
        <LoadingState label="Loading reports..." />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <ErrorState
          title="Failed to load reports"
          message={error.message}
          onRetry={() => refetch()}
        />
      </PageContainer>
    );
  }

  const activeFilters = [filters.category, filters.status, filters.area].filter(Boolean).length;

  return (
    <PageContainer>
      <Surface>
        <div className="px-5 py-5">
          <PageHeader
            title="Reports"
            description="System reports, logs, and operational messages."
            actions={
              <Button
                icon={Plus}
                onClick={() => setShowCreateForm((v) => !v)}
                tone={showCreateForm ? 'secondary' : 'primary'}
              >
                {showCreateForm ? 'Close' : 'New Report'}
              </Button>
            }
          />

          {/* Filters */}
          <Toolbar>
            <div className="flex items-center gap-2 text-sm font-medium text-slate-400 lg:w-28">
              <Filter className="h-4 w-4 text-blue-200" />
              Filters
              {activeFilters > 0 && <Badge tone="blue">{activeFilters}</Badge>}
            </div>
            <Select
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            >
              <option value="">All Categories</option>
              <option value="system">System</option>
              <option value="task">Task</option>
              <option value="chat">Chat</option>
              <option value="file">File</option>
              <option value="research">Research</option>
              <option value="error">Error</option>
              <option value="maintenance">Maintenance</option>
            </Select>
            <Select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <option value="">All Statuses</option>
              <option value="info">Info</option>
              <option value="success">Success</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
            </Select>
            <Select
              value={filters.area}
              onChange={(e) => setFilters({ ...filters, area: e.target.value })}
            >
              <option value="">All Areas</option>
              <option value="automation">Automation</option>
              <option value="context">Context</option>
              <option value="graph">Graph</option>
              <option value="ui">UI</option>
            </Select>
          </Toolbar>
        </div>

        {/* Create Form */}
        {showCreateForm && (
          <form onSubmit={handleSubmit} className="border-t border-white/8 px-5 py-4">
            <div className="space-y-4">
              <LabeledField label="Title" required htmlFor="report-title">
                <Field icon={Target}>
                  <input
                    id="report-title"
                    type="text"
                    value={newReport.title}
                    onChange={(e) => setNewReport({ ...newReport, title: e.target.value })}
                    placeholder="Report title"
                    className={cn(inputClassName, 'pl-9')}
                    required
                  />
                </Field>
              </LabeledField>
              <div className="grid gap-4 sm:grid-cols-2">
                <LabeledField label="Category" htmlFor="report-category">
                  <Select
                    id="report-category"
                    value={newReport.category}
                    onChange={(e) => setNewReport({ ...newReport, category: e.target.value })}
                  >
                    <option value="system">System</option>
                    <option value="task">Task</option>
                    <option value="chat">Chat</option>
                    <option value="file">File</option>
                    <option value="research">Research</option>
                    <option value="error">Error</option>
                    <option value="maintenance">Maintenance</option>
                  </Select>
                </LabeledField>
                <LabeledField label="Status" htmlFor="report-status">
                  <Select
                    id="report-status"
                    value={newReport.status}
                    onChange={(e) => setNewReport({ ...newReport, status: e.target.value })}
                  >
                    <option value="info">Info</option>
                    <option value="success">Success</option>
                    <option value="warning">Warning</option>
                    <option value="error">Error</option>
                  </Select>
                </LabeledField>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <LabeledField label="Area" htmlFor="report-area">
                  <Select
                    id="report-area"
                    value={newReport.area}
                    onChange={(e) => setNewReport({ ...newReport, area: e.target.value })}
                  >
                    <option value="">No area</option>
                    <option value="automation">Automation</option>
                    <option value="context">Context</option>
                    <option value="graph">Graph</option>
                    <option value="ui">UI</option>
                  </Select>
                </LabeledField>
                <LabeledField label="Topics (comma-separated)" htmlFor="report-topics">
                  <input
                    id="report-topics"
                    type="text"
                    placeholder="Topics (comma-separated)"
                    value={(newReport as unknown as { topics: string }).topics}
                    onChange={(e) =>
                      setNewReport({ ...newReport, topics: e.target.value } as CreateReportPayload & { topics: string })
                    }
                    className={inputClassName}
                  />
                </LabeledField>
              </div>
              <LabeledField label="Content (markdown)" required htmlFor="report-content">
                <textarea
                  id="report-content"
                  placeholder="Report content (markdown supported)"
                  value={newReport.content}
                  onChange={(e) => setNewReport({ ...newReport, content: e.target.value })}
                  rows={8}
                  className={textareaClassName}
                  required
                />
              </LabeledField>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  icon={Plus}
                  disabled={createMutation.isPending || !newReport.title.trim() || !newReport.content.trim()}
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Report'}
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

        {/* Reports List */}
        <div className="space-y-2 px-5 py-5">
          {data?.reports?.map((report: Report) => (
            <Card key={report.id} as="article" padding="md">
              <CardHeader
                title={report.title}
                icon={FileText}
                action={
                  <IconButton
                    onClick={() => deleteMutation.mutate(report.id)}
                    icon={Trash2}
                    tone="danger"
                    aria-label="Delete report"
                  />
                }
              />
              <CardBody>
                <div className="mb-3 flex flex-wrap gap-2">
                  <Badge tone={categoryTones[report.category] ?? 'slate'}>
                    {report.category}
                  </Badge>
                  <Badge tone={statusTones[report.status] ?? 'slate'}>
                    {report.status}
                  </Badge>
                  <Badge tone="purple">{report.source}</Badge>
                  {report.area && (
                    <Badge tone={areaTones[report.area] ?? 'amber'}>
                      {report.area}
                    </Badge>
                  )}
                </div>
                {report.topics?.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {report.topics.map((topic: string) => (
                      <Badge key={topic} tone="slate">
                        {topic}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="prose prose-sm max-w-none text-slate-200">
                  <ReactMarkdown>{report.content}</ReactMarkdown>
                </div>
              </CardBody>
              <div className="border-t border-white/8 px-5 py-3">
                <Timestamp
                  value={report.date}
                  format="datetime"
                  className="text-xs text-slate-500"
                />
              </div>
            </Card>
          ))}

          {(!data?.reports || data.reports.length === 0) && (
            <EmptyState
              icon={FileText}
              title="No reports found"
              description="Adjust filters or create a new report."
            />
          )}
        </div>

        {data?.meta && (
          <div className="border-t border-white/8 px-5 py-3">
            <p className="text-sm text-slate-500">
              {data.meta.total} total reports. Loaded {data.meta.loaded}. More available:{' '}
              {data.meta.hasMore ? 'yes' : 'no'}.
            </p>
          </div>
        )}
      </Surface>
    </PageContainer>
  );
}
