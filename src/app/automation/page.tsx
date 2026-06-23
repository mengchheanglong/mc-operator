'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { automation } from '@/features/automation/api';
import { useState } from 'react';
import { Activity, Cpu, Play, Plus, Trash2, Wrench } from 'lucide-react';
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
  Modal,
  PageContainer,
  PageHeader,
  SectionHeading,
  Select,
  StatusBadge,
  Surface,
  Tabs,
  Timestamp,
  cn,
  inputClassName,
  textareaClassName,
  type Tone,
} from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';

const EMPTY_TEMPLATE_FORM = {
  id: '',
  name: '',
  prompt: '',
  executor: 'codex',
  executionEnv: 'worktree',
  status: 'active',
  area: '',
  topics: '',
  webhookPath: '',
};

interface Template {
  id: string;
  name: string;
  prompt?: string;
  executor?: string;
  executionEnv?: string;
  status?: string;
  area?: string;
  topics?: string[];
  webhookPath?: string;
  lastRunSummary?: string;
}

interface Run {
  id: string;
  branch?: string;
  status?: string;
  createdAt?: string;
  closedAt?: string | null;
  worktreePath?: string;
  metadata?: { closeReason?: string };
}

interface TemplateRunEntry {
  id: string;
  mode?: string;
  status?: string;
  createdAt?: string;
  summary?: string;
  errorMessage?: string;
}

type Tab = 'templates' | 'runs';

const statusTone = (status: string): Tone => {
  if (status === 'active') return 'blue';
  if (status === 'archived') return 'purple';
  if (status === 'closed' || status === 'completed') return 'slate';
  if (status === 'error' || status === 'failed') return 'red';
  return 'amber';
};

export default function AutomationPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('templates');
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [showRunForm, setShowRunForm] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedRunId, setSelectedRunId] = useState('');
  const [templateForm, setTemplateForm] = useState(EMPTY_TEMPLATE_FORM);
  const [runBranch, setRunBranch] = useState('');
  const [executeOptions, setExecuteOptions] = useState({ deepMode: false });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState<string | null>(null);

  const { data: runsData, isLoading: runsLoading, error: runsError, refetch: refetchRuns } = useQuery({
    queryKey: ['automation-runs'],
    queryFn: () => automation.listRuns(),
    staleTime: 2 * 60 * 1000,
  });

  const {
    data: templatesData,
    isLoading: templatesLoading,
    error: templatesError,
    refetch: refetchTemplates,
  } = useQuery({
    queryKey: ['automation-templates'],
    queryFn: () => automation.listTemplates(),
    staleTime: 2 * 60 * 1000,
  });

  const { data: templateHistoryData, isLoading: templateHistoryLoading } = useQuery({
    queryKey: ['automation-template-runs', selectedTemplateId],
    queryFn: () => automation.listTemplateRuns(selectedTemplateId),
    enabled: Boolean(selectedTemplateId),
    staleTime: 60 * 1000,
  });

  const { data: runSummaryData, isLoading: runSummaryLoading } = useQuery({
    queryKey: ['automation-run-summary', selectedRunId],
    queryFn: () => automation.getRunSummary(selectedRunId),
    enabled: Boolean(selectedRunId),
    staleTime: 60 * 1000,
  });

  const invalidateAutomationQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['automation-runs'] });
    queryClient.invalidateQueries({ queryKey: ['automation-templates'] });
    queryClient.invalidateQueries({ queryKey: ['automation-template-runs'] });
    queryClient.invalidateQueries({ queryKey: ['automation-run-summary'] });
  };

  const saveTemplateMutation = useMutation({
    mutationFn: (payload: typeof EMPTY_TEMPLATE_FORM) => {
      const data = {
        name: payload.name,
        prompt: payload.prompt,
        executor: payload.executor,
        executionEnv: payload.executionEnv,
        status: payload.status,
        area: payload.area || undefined,
        topics: payload.topics
          .split(',')
          .map((topic) => topic.trim())
          .filter(Boolean),
        webhookPath: payload.webhookPath || undefined,
      };
      return payload.id
        ? automation.updateTemplate(payload.id, data)
        : automation.createTemplate(data);
    },
    onSuccess: (result: { template?: { id?: string } }) => {
      invalidateAutomationQueries();
      setShowTemplateForm(false);
      setTemplateForm(EMPTY_TEMPLATE_FORM);
      if (result?.template?.id) setSelectedTemplateId(result.template.id);
      toast.success('Template saved');
    },
    onError: () => toast.error('Failed to save template'),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => automation.deleteTemplate(id),
    onSuccess: () => {
      invalidateAutomationQueries();
      setSelectedTemplateId((current) => (current === selectedTemplateId ? '' : current));
      setConfirmDelete(null);
      toast.success('Template deleted');
    },
    onError: () => toast.error('Failed to delete template'),
  });

  const checkTemplateMutation = useMutation({
    mutationFn: (id: string) => automation.checkTemplate(id),
    onSuccess: (result: { template?: { id?: string } }) => {
      invalidateAutomationQueries();
      setSelectedTemplateId(result?.template?.id || selectedTemplateId);
      toast.success('Template checked');
    },
    onError: () => toast.error('Template check failed'),
  });

  const prepareTemplateMutation = useMutation({
    mutationFn: (id: string) => automation.runTemplate(id),
    onSuccess: (result: { template?: { id?: string } }) => {
      invalidateAutomationQueries();
      setSelectedTemplateId(result?.template?.id || selectedTemplateId);
      toast.success('Template prepared');
    },
    onError: () => toast.error('Prepare failed'),
  });

  const executeMutation = useMutation({
    mutationFn: ({ templateId, deepMode }: { templateId: string; deepMode: boolean }) =>
      automation.executeTemplate(templateId, { deepMode }),
    onSuccess: (result: { template?: { id?: string } }) => {
      invalidateAutomationQueries();
      setSelectedTemplateId(result?.template?.id || selectedTemplateId);
      toast.success('Template executed');
    },
    onError: () => toast.error('Execution failed'),
  });

  const createRunMutation = useMutation({
    mutationFn: (branch: string) => automation.createRun({ branch }),
    onSuccess: (result: { run?: { id?: string } }) => {
      invalidateAutomationQueries();
      setShowRunForm(false);
      setRunBranch('');
      if (result?.run?.id) setSelectedRunId(result.run.id);
      toast.success('Workspace run created');
    },
    onError: () => toast.error('Failed to create run'),
  });

  const closeRunMutation = useMutation({
    mutationFn: (id: string) => automation.closeRun(id, 'manual'),
    onSuccess: (result: { run?: { id?: string } }) => {
      invalidateAutomationQueries();
      if (result?.run?.id) setSelectedRunId(result.run.id);
      setConfirmClose(null);
      toast.success('Run closed');
    },
    onError: () => toast.error('Failed to close run'),
  });

  const handleSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateForm.name.trim() || !templateForm.prompt.trim()) return;
    saveTemplateMutation.mutate(templateForm);
  };

  const handleCreateRun = (e: React.FormEvent) => {
    e.preventDefault();
    if (!runBranch.trim()) return;
    createRunMutation.mutate(runBranch.trim());
  };

  const beginEditTemplate = (template: Template) => {
    setTemplateForm({
      id: template.id,
      name: template.name || '',
      prompt: template.prompt || '',
      executor: template.executor || 'codex',
      executionEnv: template.executionEnv || 'worktree',
      status: template.status || 'active',
      area: template.area || '',
      topics: Array.isArray(template.topics) ? template.topics.join(', ') : '',
      webhookPath: template.webhookPath || '',
    });
    setShowTemplateForm(true);
    setSelectedTemplateId(template.id);
  };

  const selectedTemplate = (templatesData?.templates ?? []).find(
    (t: Template) => t.id === selectedTemplateId,
  ) as Template | undefined;
  const selectedRun = (runsData?.runs ?? []).find((r: Run) => r.id === selectedRunId) as Run | undefined;

  const runs = (runsData?.runs ?? []) as Run[];
  const staleRuns = new Set<string>(runsData?.staleRuns ?? []);
  const templates = (templatesData?.templates ?? []) as Template[];

  if (runsLoading || templatesLoading) {
    return (
      <PageContainer>
        <LoadingState label="Loading automation workspace..." />
      </PageContainer>
    );
  }

  if (runsError || templatesError) {
    return (
      <PageContainer>
        <ErrorState
          title="Failed to load automation"
          message={(runsError || templatesError)?.message ?? 'Unknown error'}
          onRetry={() => {
            refetchRuns();
            refetchTemplates();
          }}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Automation"
        title="Automation Workspace"
        description="Manage template catalog entries, validate reusable prompts, and inspect workspace run state."
        actions={
          <div className="flex gap-2">
            <Button
              icon={Plus}
              onClick={() => {
                setShowTemplateForm((v) => !v);
                setTemplateForm(EMPTY_TEMPLATE_FORM);
              }}
              tone={showTemplateForm ? 'secondary' : 'primary'}
            >
              {showTemplateForm ? 'Close' : 'New Template'}
            </Button>
            <Button
              icon={Plus}
              onClick={() => setShowRunForm((v) => !v)}
              tone={showRunForm ? 'secondary' : 'secondary'}
            >
              {showRunForm ? 'Close' : 'New Run'}
            </Button>
          </div>
        }
      />

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'templates', label: 'Templates', icon: Cpu, count: templates.length },
          { value: 'runs', label: 'Runs', icon: Activity, count: runs.length },
        ]}
      />

      {showTemplateForm && (
        <Surface>
          <CardHeader
            title={templateForm.id ? 'Edit template' : 'New template'}
            icon={Plus}
            description="Define a reusable automation prompt and execution profile."
          />
          <CardBody>
            <form onSubmit={handleSaveTemplate} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <LabeledField label="Name" required htmlFor="tpl-name">
                  <input
                    id="tpl-name"
                    type="text"
                    value={templateForm.name}
                    onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                    placeholder="Template name"
                    className={inputClassName}
                    required
                  />
                </LabeledField>
                <LabeledField label="Area" htmlFor="tpl-area">
                  <input
                    id="tpl-area"
                    type="text"
                    value={templateForm.area}
                    onChange={(e) => setTemplateForm({ ...templateForm, area: e.target.value })}
                    placeholder="Area (optional)"
                    className={inputClassName}
                  />
                </LabeledField>
                <LabeledField label="Executor" htmlFor="tpl-executor">
                  <Select
                    id="tpl-executor"
                    value={templateForm.executor}
                    onChange={(e) => setTemplateForm({ ...templateForm, executor: e.target.value })}
                  >
                    <option value="codex">Codex</option>
                    <option value="openclaw">OpenClaw</option>
                    <option value="n8n">n8n</option>
                  </Select>
                </LabeledField>
                <LabeledField label="Execution env" htmlFor="tpl-env">
                  <Select
                    id="tpl-env"
                    value={templateForm.executionEnv}
                    onChange={(e) => setTemplateForm({ ...templateForm, executionEnv: e.target.value })}
                  >
                    <option value="worktree">Worktree</option>
                    <option value="local">Local</option>
                  </Select>
                </LabeledField>
                <LabeledField label="Status" htmlFor="tpl-status">
                  <Select
                    id="tpl-status"
                    value={templateForm.status}
                    onChange={(e) => setTemplateForm({ ...templateForm, status: e.target.value })}
                  >
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                  </Select>
                </LabeledField>
                <LabeledField label="Topics" htmlFor="tpl-topics" hint="Comma-separated">
                  <input
                    id="tpl-topics"
                    type="text"
                    value={templateForm.topics}
                    onChange={(e) => setTemplateForm({ ...templateForm, topics: e.target.value })}
                    placeholder="Topics (comma-separated)"
                    className={inputClassName}
                  />
                </LabeledField>
              </div>
              <LabeledField label="Webhook path" htmlFor="tpl-webhook" hint="Used by n8n integration">
                <input
                  id="tpl-webhook"
                  type="text"
                  value={templateForm.webhookPath}
                  onChange={(e) => setTemplateForm({ ...templateForm, webhookPath: e.target.value })}
                  placeholder="Webhook path (optional)"
                  className={inputClassName}
                />
              </LabeledField>
              <LabeledField label="Prompt" required htmlFor="tpl-prompt">
                <textarea
                  id="tpl-prompt"
                  value={templateForm.prompt}
                  onChange={(e) => setTemplateForm({ ...templateForm, prompt: e.target.value })}
                  rows={6}
                  placeholder="Reusable automation prompt"
                  className={textareaClassName}
                  required
                />
              </LabeledField>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  icon={Plus}
                  disabled={saveTemplateMutation.isPending || !templateForm.name.trim() || !templateForm.prompt.trim()}
                >
                  {saveTemplateMutation.isPending
                    ? 'Saving...'
                    : templateForm.id
                      ? 'Update Template'
                      : 'Create Template'}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setShowTemplateForm(false);
                    setTemplateForm(EMPTY_TEMPLATE_FORM);
                  }}
                  tone="secondary"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardBody>
        </Surface>
      )}

      {showRunForm && (
        <Surface>
          <CardHeader title="New workspace run" icon={Plus} />
          <CardBody>
            <form onSubmit={handleCreateRun} className="space-y-4">
              <LabeledField label="Git branch" required htmlFor="run-branch">
                <input
                  id="run-branch"
                  type="text"
                  value={runBranch}
                  onChange={(e) => setRunBranch(e.target.value)}
                  placeholder="feature/my-branch"
                  className={inputClassName}
                  required
                />
              </LabeledField>
              <div className="flex gap-2">
                <Button type="submit" icon={Plus} disabled={createRunMutation.isPending || !runBranch.trim()}>
                  {createRunMutation.isPending ? 'Creating...' : 'Create Workspace Run'}
                </Button>
                <Button type="button" onClick={() => setShowRunForm(false)} tone="secondary">
                  Cancel
                </Button>
              </div>
            </form>
          </CardBody>
        </Surface>
      )}

      {tab === 'templates' && (
        <div className="grid gap-6 xl:grid-cols-[1.8fr,1fr]">
          <div className="space-y-3 mc-stagger">
            {templates.map((template) => (
              <Card
                key={template.id}
                as="article"
                interactive
                className={cn(
                  'cursor-pointer',
                  selectedTemplateId === template.id && 'border-blue-300/30 ring-1 ring-blue-400/20',
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelectedTemplateId(template.id)}
                  className="w-full p-4 text-left outline-none focus-visible:ring-4 focus-visible:ring-blue-400/20"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-blue-200">
                        <Cpu className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-semibold text-slate-100">{template.name}</h4>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {template.executor} · {template.executionEnv} ·{' '}
                          <span className="text-slate-400">{template.status}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                  {template.lastRunSummary && (
                    <p className="mt-2 text-xs text-slate-500">{template.lastRunSummary}</p>
                  )}
                  {Array.isArray(template.topics) && template.topics.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {template.topics.map((topic) => (
                        <Badge key={`${template.id}-${topic}`} tone="slate">
                          {topic}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <p className="mt-2 break-all font-mono text-[11px] text-slate-600">{template.id}</p>
                </button>
                <div className="flex flex-wrap gap-2 border-t border-white/8 px-4 py-3">
                  <Button
                    onClick={(e) => { e.stopPropagation(); beginEditTemplate(template); }}
                    tone="secondary"
                    className="h-8 px-2.5 text-xs"
                  >
                    Edit
                  </Button>
                  <Button
                    onClick={(e) => { e.stopPropagation(); checkTemplateMutation.mutate(template.id); }}
                    tone="secondary"
                    className="h-8 px-2.5 text-xs"
                    disabled={checkTemplateMutation.isPending}
                  >
                    Check
                  </Button>
                  <Button
                    onClick={(e) => { e.stopPropagation(); prepareTemplateMutation.mutate(template.id); }}
                    tone="secondary"
                    className="h-8 px-2.5 text-xs"
                    disabled={prepareTemplateMutation.isPending}
                  >
                    Prepare
                  </Button>
                  <Button
                    icon={Play}
                    onClick={(e) => { e.stopPropagation(); executeMutation.mutate({ templateId: template.id, deepMode: executeOptions.deepMode }); }}
                    className="h-8 px-2.5 text-xs"
                    disabled={executeMutation.isPending}
                  >
                    Execute
                  </Button>
                  <IconButton
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(template.id); }}
                    icon={Trash2}
                    tone="danger"
                    aria-label="Delete template"
                  />
                </div>
              </Card>
            ))}

            {templates.length === 0 && (
              <EmptyState
                icon={Cpu}
                title="No automation templates"
                description="Create a template to define a reusable automation prompt."
                action={
                  !showTemplateForm ? (
                    <Button icon={Plus} onClick={() => setShowTemplateForm(true)}>
                      New template
                    </Button>
                  ) : undefined
                }
              />
            )}
          </div>

          <Card className="h-fit">
            <CardHeader title="Template detail" icon={Wrench} eyebrow="Inspector" />
            <CardBody>
              {!selectedTemplate ? (
                <p className="text-sm text-slate-500">
                  Select a template to inspect its history and use the prepare/check/execute flows.
                </p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="font-semibold text-slate-100">{selectedTemplate.name}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {selectedTemplate.executor} via {selectedTemplate.executionEnv}
                    </p>
                    <label className="mt-3 flex items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={executeOptions.deepMode}
                        onChange={(e) => setExecuteOptions({ deepMode: e.target.checked })}
                        className="rounded border-white/20 bg-black/30"
                      />
                      Execute in deep mode
                    </label>
                  </div>
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                      Recent runs
                    </p>
                    {templateHistoryLoading && (
                      <p className="text-sm text-slate-500">Loading run history...</p>
                    )}
                    <div className="space-y-2">
                      {(templateHistoryData?.runs ?? []).map((entry: TemplateRunEntry) => (
                        <div
                          key={entry.id}
                          className="rounded-lg border border-white/8 bg-white/[0.02] p-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-slate-200">
                              {entry.mode} / {entry.status}
                            </span>
                            <Timestamp value={entry.createdAt ?? ''} format="datetime" className="text-xs text-slate-500" />
                          </div>
                          {entry.summary && <p className="mt-1 text-xs text-slate-500">{entry.summary}</p>}
                          {entry.errorMessage && <p className="mt-1 text-xs text-rose-300">{entry.errorMessage}</p>}
                        </div>
                      ))}
                      {selectedTemplateId && (templateHistoryData?.runs ?? []).length === 0 && (
                        <p className="text-sm text-slate-500">No template history yet.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'runs' && (
        <div className="grid gap-6 xl:grid-cols-[1.8fr,1fr]">
          <div className="space-y-3 mc-stagger">
            {runs.map((run) => {
              const isActive = run.status === 'active';
              return (
                <Card
                  key={run.id}
                  as="article"
                  interactive
                  className={cn(
                    'cursor-pointer',
                    selectedRunId === run.id && 'border-blue-300/30 ring-1 ring-blue-400/20',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedRunId(run.id)}
                    className="w-full p-4 text-left outline-none focus-visible:ring-4 focus-visible:ring-blue-400/20"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-blue-200">
                          <Activity className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <h4 className="truncate text-sm font-semibold text-slate-100">
                            {run.branch || 'Unnamed Run'}
                          </h4>
                          {run.createdAt && (
                            <Timestamp value={run.createdAt} format="datetime" className="text-xs text-slate-500" />
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {staleRuns.has(run.id) && <Badge tone="amber">Stale</Badge>}
                        <StatusBadge tone={statusTone(run.status ?? '')} pulse={isActive}>
                          {run.status || 'unknown'}
                        </StatusBadge>
                      </div>
                    </div>
                    {run.worktreePath && (
                      <p className="mt-2 break-all font-mono text-[11px] text-slate-600">
                        {run.worktreePath}
                      </p>
                    )}
                    {run.metadata?.closeReason && (
                      <p className="mt-1 text-xs text-slate-500">
                        Close reason: {String(run.metadata.closeReason)}
                      </p>
                    )}
                    {run.closedAt && (
                      <p className="mt-1 text-xs text-slate-500">
                        Closed <Timestamp value={run.closedAt} format="relative" />
                      </p>
                    )}
                  </button>
                  {isActive && (
                    <div className="border-t border-white/8 px-4 py-3">
                      <Button
                        onClick={(e) => { e.stopPropagation(); setConfirmClose(run.id); }}
                        tone="secondary"
                        className="h-8 px-2.5 text-xs"
                      >
                        Close run
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}

            {runs.length === 0 && (
              <EmptyState
                icon={Activity}
                title="No automation runs"
                description="Create a workspace run to track an automation execution."
                action={
                  !showRunForm ? (
                    <Button icon={Plus} onClick={() => setShowRunForm(true)}>
                      New run
                    </Button>
                  ) : undefined
                }
              />
            )}
          </div>

          <Card className="h-fit">
            <CardHeader title="Run detail" icon={Wrench} eyebrow="Inspector" />
            <CardBody>
              {!selectedRun ? (
                <p className="text-sm text-slate-500">
                  Select a workspace run to inspect last dispatch and verification artifacts.
                </p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="font-semibold text-slate-100">
                      {selectedRun.branch || 'Unnamed Run'}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {selectedRun.status} · {selectedRun.worktreePath}
                    </p>
                  </div>
                  {runSummaryLoading && (
                    <p className="text-sm text-slate-500">Loading run summary...</p>
                  )}
                  {runSummaryData?.summary && (
                    <>
                      <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                          Last dispatch
                        </p>
                        {runSummaryData.summary.lastDispatch ? (
                          <div className="space-y-1 text-sm text-slate-300">
                            <p>Status: {runSummaryData.summary.lastDispatch.status}</p>
                            {runSummaryData.summary.lastDispatch.agentId && (
                              <p>Agent: {runSummaryData.summary.lastDispatch.agentId}</p>
                            )}
                            {runSummaryData.summary.lastDispatch.command && (
                              <p className="break-all font-mono text-[11px] text-slate-500">
                                {runSummaryData.summary.lastDispatch.command}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500">No dispatch recorded.</p>
                        )}
                      </div>
                      <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                          Verification artifacts
                        </p>
                        <div className="space-y-1 text-sm text-slate-300">
                          <p>Report: {runSummaryData.summary.verificationArtifacts.reportId || 'None'}</p>
                          <p>Command: {runSummaryData.summary.verificationArtifacts.lastCommandStatus || 'None'}</p>
                          <p className="break-all font-mono text-[11px] text-slate-500">
                            {runSummaryData.summary.verificationArtifacts.artifactPath || 'No artifact path recorded.'}
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && deleteTemplateMutation.mutate(confirmDelete)}
        title="Delete template?"
        message="This will permanently remove the template. This action cannot be undone."
        confirmLabel="Delete"
      />
      <ConfirmDialog
        open={confirmClose !== null}
        onClose={() => setConfirmClose(null)}
        onConfirm={() => confirmClose && closeRunMutation.mutate(confirmClose)}
        title="Close workspace run?"
        message="This will mark the run as closed with reason 'manual'."
        confirmLabel="Close run"
      />
    </PageContainer>
  );
}

function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel: string;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={message}
      footer={
        <>
          <Button tone="secondary" onClick={onClose}>Cancel</Button>
          <Button tone="danger" onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="text-sm text-slate-400">{message}</p>
    </Modal>
  );
}
