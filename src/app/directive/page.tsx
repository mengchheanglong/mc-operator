'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { directive } from '@/features/directive/api';
import { useState } from 'react';
import { Workflow, Plus, Link2, Compass } from 'lucide-react';

const SOURCE_TYPES = [
  'github-repo',
  'paper',
  'product-doc',
  'theory',
  'technical-essay',
  'workflow-writeup',
  'external-system',
  'internal-signal',
] as const;

function statusClassName(status: string) {
  if (status === 'integrated') return 'bg-green-100 text-green-700';
  if (status === 'decided') return 'bg-blue-100 text-blue-700';
  if (status === 'evaluated') return 'bg-purple-100 text-purple-700';
  if (status === 'experimenting') return 'bg-amber-100 text-amber-700';
  if (status === 'analyzed') return 'bg-sky-100 text-sky-700';
  return 'bg-gray-100 text-gray-700';
}

function runtimeClassName(status: string) {
  if (status === 'callable') return 'bg-emerald-100 text-emerald-700';
  if (status === 'planned') return 'bg-blue-100 text-blue-700';
  if (status === 'parked') return 'bg-amber-100 text-amber-700';
  if (status === 'removed') return 'bg-red-100 text-red-700';
  return 'bg-gray-100 text-gray-700';
}

function formatLabel(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function renderCountSummary(counts: Record<string, unknown> | undefined) {
  if (!counts) return null;

  return (
    <div className="flex gap-2 flex-wrap mt-3">
      {Object.entries(counts).map(([key, value]) => (
        <span
          key={key}
          className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium"
        >
          {formatLabel(key)}: {String(value)}
        </span>
      ))}
    </div>
  );
}

export default function DirectivePage() {
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedCapabilityId, setSelectedCapabilityId] = useState('');
  const [newCapability, setNewCapability] = useState({
    sourceType: 'internal-signal',
    sourceRef: '',
    title: '',
    userIntent: '',
  });

  const { data: registryData, isLoading, error } = useQuery({
    queryKey: ['directive-registry'],
    queryFn: () => directive.listRegistry(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: workspaceData } = useQuery({
    queryKey: ['directive-workspace-overview'],
    queryFn: () => directive.workspaceOverview(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: discoveryData } = useQuery({
    queryKey: ['directive-discovery-overview'],
    queryFn: () => directive.discoveryOverview(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: architectureData } = useQuery({
    queryKey: ['directive-architecture-overview'],
    queryFn: () => directive.architectureOverview(),
    staleTime: 5 * 60 * 1000,
  });

  const registry = registryData?.registry ?? [];
  const resolvedSelectedCapabilityId =
    registry.some((entry: any) => entry.capability.id === selectedCapabilityId)
      ? selectedCapabilityId
      : registry[0]?.capability?.id || '';

  const { data: lifecycleData, isLoading: lifecycleLoading } = useQuery({
    queryKey: ['directive-lifecycle', resolvedSelectedCapabilityId],
    queryFn: () => directive.getLifecycle(resolvedSelectedCapabilityId),
    enabled: Boolean(resolvedSelectedCapabilityId),
    staleTime: 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: (capability: any) => directive.createCapability(capability),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directive-registry'] });
      queryClient.invalidateQueries({ queryKey: ['directive-workspace-overview'] });
      queryClient.invalidateQueries({ queryKey: ['directive-discovery-overview'] });
      queryClient.invalidateQueries({ queryKey: ['directive-architecture-overview'] });
      setShowCreateForm(false);
      setNewCapability({
        sourceType: 'internal-signal',
        sourceRef: '',
        title: '',
        userIntent: '',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCapability.sourceRef.trim()) return;
    createMutation.mutate({
      sourceType: newCapability.sourceType,
      sourceRef: newCapability.sourceRef,
      title: newCapability.title,
      userIntent: newCapability.userIntent,
    });
  };

  const statusCounts = registry.reduce((acc: Record<string, number>, entry: any) => {
    const status = String(entry?.capability?.status || 'unknown');
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const selectedRegistryEntry =
    registry.find((entry: any) => entry.capability.id === resolvedSelectedCapabilityId) || null;
  const workspace = workspaceData?.workspace;
  const discovery = discoveryData?.discovery;
  const architecture = architectureData?.architecture;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 animate-pulse">Loading directive workspace...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-red-800 font-semibold mb-2">Failed to load directive workspace</h3>
        <p className="text-red-600 text-sm">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Directive Workspace</h2>
            <p className="text-sm text-gray-600 mt-1">
              Intake, analyze, evaluate, and integrate external capabilities into Mission Control.
            </p>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Intake
          </button>
        </div>

        {showCreateForm && (
          <form
            onSubmit={handleSubmit}
            className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50"
          >
            <div className="space-y-3">
              <select
                value={newCapability.sourceType}
                onChange={(e) =>
                  setNewCapability({ ...newCapability, sourceType: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                {SOURCE_TYPES.map((sourceType) => (
                  <option key={sourceType} value={sourceType}>
                    {sourceType}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Source reference (repo URL, doc URL, note key, paper link)"
                value={newCapability.sourceRef}
                onChange={(e) =>
                  setNewCapability({ ...newCapability, sourceRef: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
              <input
                type="text"
                placeholder="Title (optional, inferred from source reference if omitted)"
                value={newCapability.title}
                onChange={(e) =>
                  setNewCapability({ ...newCapability, title: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <textarea
                placeholder="User intent (what problem this should solve here)"
                value={newCapability.userIntent}
                onChange={(e) =>
                  setNewCapability({ ...newCapability, userIntent: e.target.value })
                }
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Capability'}
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

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
          <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
              Capability Registry
            </p>
            <p className="text-2xl font-bold text-gray-900">{registry.length}</p>
            <p className="text-sm text-gray-600 mt-2">
              Current directive capabilities grouped by backend lifecycle status.
            </p>
            {renderCountSummary(statusCounts)}
          </div>

          <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
              Discovery Overview
            </p>
            <p className="text-sm font-medium text-gray-900">
              {discovery?.workflow?.currentFocus || 'Discovery overview unavailable'}
            </p>
            {renderCountSummary(discovery?.counts)}
          </div>

          <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
              Architecture Overview
            </p>
            <p className="text-sm font-medium text-gray-900">
              {architecture?.workflow?.currentFocus || 'Architecture overview unavailable'}
            </p>
            {renderCountSummary(architecture?.stageCounts || architecture?.counts)}
            {renderCountSummary(architecture?.decisionCounts)}
          </div>

          <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
              Workspace Forge
            </p>
            <p className="text-sm font-medium text-gray-900">
              {workspace?.forge?.workflow?.currentFocus || 'Workspace overview unavailable'}
            </p>
            {renderCountSummary(workspace?.forge?.counts)}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.7fr,1fr] gap-6">
          <div className="space-y-3">
          {registry.map((entry: any) => {
            const capability = entry.capability;
            return (
            <div
              key={capability.id}
              className={`p-4 border rounded-lg transition-colors cursor-pointer ${
                resolvedSelectedCapabilityId === capability.id
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setSelectedCapabilityId(capability.id)}
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Workflow className="w-5 h-5 text-blue-600" />
                    <h3 className="font-semibold text-gray-900">{capability.title}</h3>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-sm text-gray-600 break-all">
                    <Link2 className="w-4 h-4" />
                    <span>{capability.sourceRef}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${statusClassName(capability.status || '')}`}
                  >
                    {capability.status}
                  </span>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${runtimeClassName(
                      capability.runtimeStatus || '',
                    )}`}
                  >
                    runtime: {capability.runtimeStatus}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap mb-3">
                <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium">
                  {capability.sourceType}
                </span>
                <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
                  framework: {capability.frameworkStatus}
                </span>
                {capability.recommendation && (
                  <span className="px-2 py-1 bg-violet-100 text-violet-700 rounded text-xs font-medium">
                    recommendation: {capability.recommendation}
                  </span>
                )}
              </div>

              {capability.userIntent && (
                <div className="mb-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                    User Intent
                  </p>
                  <p className="text-sm text-gray-700">{capability.userIntent}</p>
                </div>
              )}

              {capability.analysisSummary && (
                <div className="mb-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                    Analysis Summary
                  </p>
                  <p className="text-sm text-gray-700">{capability.analysisSummary}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Category</p>
                  <p className="text-gray-700">{capability.category || 'Unclassified'}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                    Workflow Family
                  </p>
                  <p className="text-gray-700">{capability.workflowFamily}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">Updated</p>
                  <p className="text-gray-700">
                    {new Date(capability.updatedAt).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm mt-3">
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                    Experiments
                  </p>
                  <p className="text-gray-700">{entry.experiments?.length ?? 0}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                    Evaluations
                  </p>
                  <p className="text-gray-700">{entry.evaluations?.length ?? 0}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                    Decisions
                  </p>
                  <p className="text-gray-700">{entry.decisions?.length ?? 0}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                    Integrations
                  </p>
                  <p className="text-gray-700">{entry.integrations?.length ?? 0}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                    Decision Lead Time
                  </p>
                  <p className="text-gray-700">
                    {entry.decisionLeadTimeHours != null
                      ? `${entry.decisionLeadTimeHours}h`
                      : 'Pending'}
                  </p>
                </div>
              </div>

              {entry.latestDecision && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs uppercase tracking-wide text-blue-700 mb-1">
                    Latest Decision
                  </p>
                  <p className="text-sm text-blue-900">
                    {entry.latestDecision.decision}: {entry.latestDecision.rationale}
                  </p>
                </div>
              )}

              {Array.isArray(capability.notes) && capability.notes.length > 0 && (
                <div className="mt-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Compass className="w-4 h-4 text-gray-500" />
                    <p className="text-xs uppercase tracking-wide text-gray-500">Notes</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {capability.notes.map((note: string, index: number) => (
                      <span
                        key={`${capability.id}-note-${index}`}
                        className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs"
                      >
                        {note}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            );
          })}

          {registry.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No directive capabilities yet. Add an intake item to start the lifecycle.
            </div>
          )}
          </div>

          <div className="p-4 border border-gray-200 rounded-lg bg-gray-50 h-fit">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Lifecycle Detail</h3>
            {!selectedRegistryEntry && (
              <p className="text-sm text-gray-500">
                Select a capability to inspect its experiment, evaluation, decision, and integration history.
              </p>
            )}
            {selectedRegistryEntry && (
              <div className="space-y-4">
                <div>
                  <p className="font-semibold text-gray-900">
                    {selectedRegistryEntry.capability.title}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {selectedRegistryEntry.capability.status} / runtime{' '}
                    {selectedRegistryEntry.capability.runtimeStatus}
                  </p>
                </div>

                {lifecycleLoading && (
                  <p className="text-sm text-gray-500">Loading lifecycle...</p>
                )}

                {lifecycleData && (
                  <>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="p-3 bg-white border border-gray-200 rounded-lg">
                        <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                          Decision Lead Time
                        </p>
                        <p className="text-gray-700">
                          {lifecycleData.decisionLeadTimeHours != null
                            ? `${lifecycleData.decisionLeadTimeHours}h`
                            : 'Pending'}
                        </p>
                      </div>
                      <div className="p-3 bg-white border border-gray-200 rounded-lg">
                        <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                          Adopt To Callable
                        </p>
                        <p className="text-gray-700">
                          {lifecycleData.adoptToCallableLeadTimeHours != null
                            ? `${lifecycleData.adoptToCallableLeadTimeHours}h`
                            : 'Pending'}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="p-3 bg-white border border-gray-200 rounded-lg">
                        <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">
                          Experiments
                        </p>
                        {(lifecycleData.experiments ?? []).map((experiment: any) => (
                          <div key={experiment.id} className="mb-3 last:mb-0">
                            <p className="text-sm font-medium text-gray-900">
                              {experiment.status}: {experiment.hypothesis}
                            </p>
                            <p className="text-sm text-gray-600 mt-1">{experiment.plan}</p>
                          </div>
                        ))}
                        {(lifecycleData.experiments ?? []).length === 0 && (
                          <p className="text-sm text-gray-500">No experiments recorded.</p>
                        )}
                      </div>

                      <div className="p-3 bg-white border border-gray-200 rounded-lg">
                        <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">
                          Evaluations
                        </p>
                        {(lifecycleData.evaluations ?? []).map((evaluation: any) => (
                          <div key={evaluation.id} className="mb-3 last:mb-0">
                            <p className="text-sm font-medium text-gray-900">
                              {evaluation.outcome}
                            </p>
                            <p className="text-sm text-gray-600 mt-1">
                              {evaluation.evidenceSummary}
                            </p>
                          </div>
                        ))}
                        {(lifecycleData.evaluations ?? []).length === 0 && (
                          <p className="text-sm text-gray-500">No evaluations recorded.</p>
                        )}
                      </div>

                      <div className="p-3 bg-white border border-gray-200 rounded-lg">
                        <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">
                          Decisions
                        </p>
                        {(lifecycleData.decisions ?? []).map((decision: any) => (
                          <div key={decision.id} className="mb-3 last:mb-0">
                            <p className="text-sm font-medium text-gray-900">
                              {decision.decision}
                            </p>
                            <p className="text-sm text-gray-600 mt-1">
                              {decision.rationale}
                            </p>
                          </div>
                        ))}
                        {(lifecycleData.decisions ?? []).length === 0 && (
                          <p className="text-sm text-gray-500">No decisions recorded.</p>
                        )}
                      </div>

                      <div className="p-3 bg-white border border-gray-200 rounded-lg">
                        <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">
                          Integrations
                        </p>
                        {(lifecycleData.integrations ?? []).map((integration: any) => (
                          <div key={integration.id} className="mb-3 last:mb-0">
                            <p className="text-sm font-medium text-gray-900">
                              {integration.status} / {integration.integrationMode}
                            </p>
                            <p className="text-sm text-gray-600 mt-1">
                              {integration.integrationSurface}
                            </p>
                            {integration.proofArtifactPath && (
                              <p className="text-xs text-gray-500 font-mono break-all mt-2">
                                {integration.proofArtifactPath}
                              </p>
                            )}
                          </div>
                        ))}
                        {(lifecycleData.integrations ?? []).length === 0 && (
                          <p className="text-sm text-gray-500">No integrations recorded.</p>
                        )}
                      </div>
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
