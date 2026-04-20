'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { automation } from '@/features/automation/api';
import { useState } from 'react';
import { Cpu, Play, Activity, Plus, Trash2 } from 'lucide-react';

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

export default function AutomationPage() {
  const queryClient = useQueryClient();
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [showRunForm, setShowRunForm] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedRunId, setSelectedRunId] = useState('');
  const [templateForm, setTemplateForm] = useState(EMPTY_TEMPLATE_FORM);
  const [runBranch, setRunBranch] = useState('');
  const [executeOptions, setExecuteOptions] = useState({
    deepMode: false,
  });

  const { data: runsData, isLoading: runsLoading, error: runsError } = useQuery({
    queryKey: ['automation-runs'],
    queryFn: () => automation.listRuns(),
    staleTime: 2 * 60 * 1000,
  });

  const {
    data: templatesData,
    isLoading: templatesLoading,
    error: templatesError,
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
    onSuccess: (result) => {
      invalidateAutomationQueries();
      setShowTemplateForm(false);
      setTemplateForm(EMPTY_TEMPLATE_FORM);
      if (result?.template?.id) {
        setSelectedTemplateId(result.template.id);
      }
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => automation.deleteTemplate(id),
    onSuccess: () => {
      invalidateAutomationQueries();
      setSelectedTemplateId((current) =>
        current === selectedTemplateId ? '' : current,
      );
    },
  });

  const checkTemplateMutation = useMutation({
    mutationFn: (id: string) => automation.checkTemplate(id),
    onSuccess: (result) => {
      invalidateAutomationQueries();
      setSelectedTemplateId(result?.template?.id || selectedTemplateId);
    },
  });

  const prepareTemplateMutation = useMutation({
    mutationFn: (id: string) => automation.runTemplate(id),
    onSuccess: (result) => {
      invalidateAutomationQueries();
      setSelectedTemplateId(result?.template?.id || selectedTemplateId);
    },
  });

  const executeMutation = useMutation({
    mutationFn: ({ templateId, deepMode }: { templateId: string; deepMode: boolean }) =>
      automation.executeTemplate(templateId, { deepMode }),
    onSuccess: (result) => {
      invalidateAutomationQueries();
      setSelectedTemplateId(result?.template?.id || selectedTemplateId);
    },
  });

  const createRunMutation = useMutation({
    mutationFn: (branch: string) => automation.createRun({ branch }),
    onSuccess: (result) => {
      invalidateAutomationQueries();
      setShowRunForm(false);
      setRunBranch('');
      if (result?.run?.id) {
        setSelectedRunId(result.run.id);
      }
    },
  });

  const closeRunMutation = useMutation({
    mutationFn: (id: string) => automation.closeRun(id, 'manual'),
    onSuccess: (result) => {
      invalidateAutomationQueries();
      if (result?.run?.id) {
        setSelectedRunId(result.run.id);
      }
    },
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

  const beginEditTemplate = (template: any) => {
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

  const selectedTemplate = templatesData?.templates?.find(
    (template: any) => template.id === selectedTemplateId,
  );
  const selectedRun = runsData?.runs?.find((run: any) => run.id === selectedRunId);

  const runTemplateAction = (templateId: string, deepMode = false) => {
    executeMutation.mutate({ templateId, deepMode });
  };

  const runs = runsData?.runs ?? [];
  const staleRuns = new Set<string>(runsData?.staleRuns ?? []);
  const templates = templatesData?.templates ?? [];

  if (runsLoading || templatesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 animate-pulse">Loading automation workspace...</div>
      </div>
    );
  }

  if (runsError || templatesError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-red-800 font-semibold mb-2">Failed to load automation</h3>
        <p className="text-red-600 text-sm">
          {(runsError || templatesError)?.message}
        </p>
      </div>
    );
  }

  const statusClassName = (status: string) => {
    if (status === 'active') return 'bg-blue-100 text-blue-700';
    if (status === 'archived') return 'bg-purple-100 text-purple-700';
    if (status === 'closed') return 'bg-gray-100 text-gray-700';
    if (status === 'error') return 'bg-red-100 text-red-700';
    return 'bg-yellow-100 text-yellow-700';
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Automation Workspace</h2>
            <p className="text-sm text-gray-600 mt-1">
              Manage template catalog entries, validate reusable prompts, and inspect workspace run state.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowTemplateForm((value) => !value);
                setTemplateForm(EMPTY_TEMPLATE_FORM);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Template
            </button>
            <button
              onClick={() => setShowRunForm((value) => !value)}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-black transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Run
            </button>
          </div>
        </div>

        {showTemplateForm && (
          <form
            onSubmit={handleSaveTemplate}
            className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-3"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Template name"
                value={templateForm.name}
                onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
              <input
                type="text"
                placeholder="Area (optional)"
                value={templateForm.area}
                onChange={(e) => setTemplateForm({ ...templateForm, area: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <select
                value={templateForm.executor}
                onChange={(e) => setTemplateForm({ ...templateForm, executor: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="codex">Codex</option>
                <option value="openclaw">OpenClaw</option>
                <option value="n8n">n8n</option>
              </select>
              <select
                value={templateForm.executionEnv}
                onChange={(e) =>
                  setTemplateForm({ ...templateForm, executionEnv: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="worktree">Worktree</option>
                <option value="local">Local</option>
              </select>
              <select
                value={templateForm.status}
                onChange={(e) => setTemplateForm({ ...templateForm, status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
              <input
                type="text"
                placeholder="Topics (comma-separated)"
                value={templateForm.topics}
                onChange={(e) => setTemplateForm({ ...templateForm, topics: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <input
              type="text"
              placeholder="Webhook path (optional; used by n8n)"
              value={templateForm.webhookPath}
              onChange={(e) =>
                setTemplateForm({ ...templateForm, webhookPath: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <textarea
              placeholder="Reusable automation prompt"
              value={templateForm.prompt}
              onChange={(e) => setTemplateForm({ ...templateForm, prompt: e.target.value })}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              required
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saveTemplateMutation.isPending}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saveTemplateMutation.isPending
                  ? 'Saving...'
                  : templateForm.id
                    ? 'Update Template'
                    : 'Create Template'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowTemplateForm(false);
                  setTemplateForm(EMPTY_TEMPLATE_FORM);
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {showRunForm && (
          <form
            onSubmit={handleCreateRun}
            className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-3"
          >
            <input
              type="text"
              placeholder="Git branch for the workspace run"
              value={runBranch}
              onChange={(e) => setRunBranch(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              required
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createRunMutation.isPending}
                className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-black disabled:opacity-50"
              >
                {createRunMutation.isPending ? 'Creating...' : 'Create Workspace Run'}
              </button>
              <button
                type="button"
                onClick={() => setShowRunForm(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[1.8fr,1fr] gap-6 mb-8">
          <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Templates</h3>
          <div className="space-y-3">
            {templates.map((template: any) => (
              <div
                key={template.id}
                className={`p-4 border rounded-lg transition-colors cursor-pointer ${
                  selectedTemplateId === template.id
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedTemplateId(template.id)}
              >
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Cpu className="w-5 h-5 text-blue-600" />
                      <h4 className="font-semibold text-gray-900">{template.name}</h4>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      Executor: {template.executor} | Env: {template.executionEnv} | Status:{' '}
                      {template.status}
                    </p>
                    {template.lastRunSummary && (
                      <p className="text-sm text-gray-600 mt-1">{template.lastRunSummary}</p>
                    )}
                    {Array.isArray(template.topics) && template.topics.length > 0 && (
                      <div className="flex gap-2 flex-wrap mt-2">
                        {template.topics.map((topic: string) => (
                          <span
                            key={`${template.id}-${topic}`}
                            className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700"
                          >
                            {topic}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap justify-end">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        beginEditTemplate(template);
                      }}
                      className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        checkTemplateMutation.mutate(template.id);
                      }}
                      className="px-3 py-2 bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 transition-colors"
                    >
                      Check
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        prepareTemplateMutation.mutate(template.id);
                      }}
                      className="px-3 py-2 bg-slate-100 text-slate-800 rounded-lg hover:bg-slate-200 transition-colors"
                    >
                      Prepare
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        runTemplateAction(template.id, executeOptions.deepMode);
                      }}
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                    >
                      <Play className="w-4 h-4" />
                      Execute
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (
                          window.confirm(`Delete template "${template.name}"?`)
                        ) {
                          deleteTemplateMutation.mutate(template.id);
                        }
                      }}
                      className="px-3 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-500 font-mono break-all">{template.id}</p>
              </div>
            ))}

            {templates.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No automation templates yet.
              </div>
            )}
          </div>
          </div>

          <div className="p-4 border border-gray-200 rounded-lg bg-gray-50 h-fit">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Template Detail</h3>
            {!selectedTemplate && (
              <p className="text-sm text-gray-500">
                Select a template to inspect its history and use the prepare/check/execute flows.
              </p>
            )}
            {selectedTemplate && (
              <div className="space-y-4">
                <div>
                  <p className="font-semibold text-gray-900">{selectedTemplate.name}</p>
                  <p className="text-sm text-gray-600 mt-1">
                    {selectedTemplate.executor} via {selectedTemplate.executionEnv}
                  </p>
                  <label className="flex items-center gap-2 text-sm text-gray-700 mt-3">
                    <input
                      type="checkbox"
                      checked={executeOptions.deepMode}
                      onChange={(e) =>
                        setExecuteOptions({ deepMode: e.target.checked })
                      }
                      className="rounded border-gray-300"
                    />
                    Execute in deep mode
                  </label>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">
                    Recent Template Runs
                  </p>
                  {templateHistoryLoading && (
                    <p className="text-sm text-gray-500">Loading run history...</p>
                  )}
                  <div className="space-y-2">
                    {(templateHistoryData?.runs ?? []).map((entry: any) => (
                      <div
                        key={entry.id}
                        className="p-3 bg-white border border-gray-200 rounded-lg"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-gray-900">
                            {entry.mode} / {entry.status}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(entry.createdAt).toLocaleString()}
                          </span>
                        </div>
                        {entry.summary && (
                          <p className="text-sm text-gray-600 mt-1">{entry.summary}</p>
                        )}
                        {entry.errorMessage && (
                          <p className="text-sm text-red-600 mt-1">{entry.errorMessage}</p>
                        )}
                      </div>
                    ))}
                    {selectedTemplateId && (templateHistoryData?.runs ?? []).length === 0 && (
                      <p className="text-sm text-gray-500">No template history yet.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.8fr,1fr] gap-6">
          <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Workspace Runs</h3>
          <div className="space-y-3">
            {runs.map((run: any) => (
              <div
                key={run.id}
                className={`p-4 border rounded-lg transition-colors cursor-pointer ${
                  selectedRunId === run.id
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedRunId(run.id)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-blue-600" />
                    <h4 className="font-semibold text-gray-900">{run.branch || 'Unnamed Run'}</h4>
                    {staleRuns.has(run.id) && (
                      <span className="px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-700">
                        Stale
                      </span>
                    )}
                  </div>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${statusClassName(run.status || '')}`}
                  >
                    {run.status || 'unknown'}
                  </span>
                </div>
                {run.metadata?.closeReason && (
                  <p className="text-sm text-gray-600 mb-1">
                    Close reason: {String(run.metadata.closeReason)}
                  </p>
                )}
                <p className="text-sm text-gray-600 mb-1">
                  Created: {new Date(run.createdAt).toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 font-mono mb-1 break-all">
                  {run.worktreePath}
                </p>
                {run.closedAt && (
                  <p className="text-sm text-gray-600">
                    Closed: {new Date(run.closedAt).toLocaleString()}
                  </p>
                )}
                {run.status === 'active' && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (
                          window.confirm(`Close workspace run "${run.branch}"?`)
                        ) {
                          closeRunMutation.mutate(run.id);
                        }
                      }}
                      className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                    >
                      Close Run
                    </button>
                  </div>
                )}
              </div>
            ))}

            {runs.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No automation runs yet.
              </div>
            )}
          </div>
          </div>

          <div className="p-4 border border-gray-200 rounded-lg bg-gray-50 h-fit">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Run Detail</h3>
            {!selectedRun && (
              <p className="text-sm text-gray-500">
                Select a workspace run to inspect last dispatch and verification artifacts.
              </p>
            )}
            {selectedRun && (
              <div className="space-y-4">
                <div>
                  <p className="font-semibold text-gray-900">
                    {selectedRun.branch || 'Unnamed Run'}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {selectedRun.status} at {selectedRun.worktreePath}
                  </p>
                </div>
                {runSummaryLoading && (
                  <p className="text-sm text-gray-500">Loading run summary...</p>
                )}
                {runSummaryData?.summary && (
                  <>
                    <div className="p-3 bg-white border border-gray-200 rounded-lg">
                      <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                        Last Dispatch
                      </p>
                      {runSummaryData.summary.lastDispatch ? (
                        <>
                          <p className="text-sm text-gray-700">
                            Status: {runSummaryData.summary.lastDispatch.status}
                          </p>
                          {runSummaryData.summary.lastDispatch.agentId && (
                            <p className="text-sm text-gray-700">
                              Agent: {runSummaryData.summary.lastDispatch.agentId}
                            </p>
                          )}
                          {runSummaryData.summary.lastDispatch.command && (
                            <p className="text-xs text-gray-500 font-mono break-all mt-2">
                              {runSummaryData.summary.lastDispatch.command}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-gray-500">No dispatch has been recorded yet.</p>
                      )}
                    </div>

                    <div className="p-3 bg-white border border-gray-200 rounded-lg">
                      <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                        Verification Artifacts
                      </p>
                      <p className="text-sm text-gray-700">
                        Report ID:{' '}
                        {runSummaryData.summary.verificationArtifacts.reportId || 'None'}
                      </p>
                      <p className="text-sm text-gray-700">
                        Command Status:{' '}
                        {runSummaryData.summary.verificationArtifacts.lastCommandStatus || 'None'}
                      </p>
                      <p className="text-xs text-gray-500 font-mono break-all mt-2">
                        {runSummaryData.summary.verificationArtifacts.artifactPath ||
                          'No artifact path recorded.'}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
