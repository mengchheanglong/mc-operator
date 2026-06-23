'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { directive } from '@/features/directive/api';
import { useState } from 'react';
import { Compass, Link2, Plus, Workflow } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  EmptyState,
  ErrorState,
  IconButton,
  KeyValue,
  LabeledField,
  LoadingState,
  PageContainer,
  PageHeader,
  SectionHeading,
  Select,
  StatCard,
  StatusBadge,
  Surface,
  Timestamp,
  cn,
  inputClassName,
  textareaClassName,
  type Tone,
} from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';

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

function statusTone(status: string): Tone {
  if (status === 'integrated') return 'green';
  if (status === 'decided') return 'blue';
  if (status === 'evaluated') return 'purple';
  if (status === 'experimenting') return 'amber';
  if (status === 'analyzed') return 'cyan';
  return 'slate';
}

function runtimeTone(status: string): Tone {
  if (status === 'callable') return 'green';
  if (status === 'planned') return 'blue';
  if (status === 'parked') return 'amber';
  if (status === 'removed') return 'red';
  return 'slate';
}

function formatLabel(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function CountSummary({ counts }: { counts: Record<string, unknown> | undefined }) {
  if (!counts) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {Object.entries(counts).map(([key, value]) => (
        <Badge key={key} tone="slate">
          {formatLabel(key)}: {String(value)}
        </Badge>
      ))}
    </div>
  );
}

interface Capability {
  id: string;
  title: string;
  sourceRef?: string;
  sourceType?: string;
  status?: string;
  runtimeStatus?: string;
  frameworkStatus?: string;
  recommendation?: string;
  userIntent?: string;
  analysisSummary?: string;
  category?: string;
  workflowFamily?: string;
  updatedAt?: string;
  notes?: string[];
}

interface RegistryEntry {
  capability: Capability;
  experiments?: unknown[];
  evaluations?: unknown[];
  decisions?: unknown[];
  integrations?: unknown[];
  decisionLeadTimeHours?: number | null;
  latestDecision?: { decision?: string; rationale?: string };
}

interface LifecycleData {
  decisionLeadTimeHours?: number | null;
  adoptToCallableLeadTimeHours?: number | null;
  experiments?: Array<{ id: string; status?: string; hypothesis?: string; plan?: string }>;
  evaluations?: Array<{ id: string; outcome?: string; evidenceSummary?: string }>;
  decisions?: Array<{ id: string; decision?: string; rationale?: string }>;
  integrations?: Array<{
    id: string;
    status?: string;
    integrationMode?: string;
    integrationSurface?: string;
    proofArtifactPath?: string;
  }>;
}

export default function DirectivePage() {
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedCapabilityId, setSelectedCapabilityId] = useState('');
  const [newCapability, setNewCapability] = useState({
    sourceType: 'internal-signal' as (typeof SOURCE_TYPES)[number],
    sourceRef: '',
    title: '',
    userIntent: '',
  });

  const { data: registryData, isLoading, error, refetch } = useQuery({
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

  const registry = (registryData?.registry ?? []) as RegistryEntry[];
  const resolvedSelectedCapabilityId =
    registry.some((entry) => entry.capability.id === selectedCapabilityId)
      ? selectedCapabilityId
      : registry[0]?.capability?.id || '';

  const { data: lifecycleData, isLoading: lifecycleLoading } = useQuery({
    queryKey: ['directive-lifecycle', resolvedSelectedCapabilityId],
    queryFn: () => directive.getLifecycle(resolvedSelectedCapabilityId),
    enabled: Boolean(resolvedSelectedCapabilityId),
    staleTime: 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: (capability: {
      sourceType: string;
      sourceRef: string;
      title?: string;
      userIntent?: string;
    }) => directive.createCapability(capability),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directive-registry'] });
      queryClient.invalidateQueries({ queryKey: ['directive-workspace-overview'] });
      queryClient.invalidateQueries({ queryKey: ['directive-discovery-overview'] });
      queryClient.invalidateQueries({ queryKey: ['directive-architecture-overview'] });
      setShowCreateForm(false);
      setNewCapability({ sourceType: 'internal-signal', sourceRef: '', title: '', userIntent: '' });
      toast.success('Capability intake created');
    },
    onError: () => toast.error('Failed to create capability'),
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

  const statusCounts = registry.reduce((acc: Record<string, number>, entry) => {
    const status = String(entry?.capability?.status || 'unknown');
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const selectedRegistryEntry =
    registry.find((entry) => entry.capability.id === resolvedSelectedCapabilityId) || null;
  const workspace = workspaceData?.workspace as Record<string, unknown> | undefined;
  const discovery = discoveryData?.discovery as Record<string, unknown> | undefined;
  const architecture = architectureData?.architecture as Record<string, unknown> | undefined;

  if (isLoading) {
    return (
      <PageContainer>
        <LoadingState label="Loading directive workspace..." />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <ErrorState
          title="Failed to load directive workspace"
          message={error.message}
          onRetry={() => refetch()}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Automation"
        title="Directive Workspace"
        description="Intake, analyze, evaluate, and integrate external capabilities into Mission Control."
        actions={
          <Button
            icon={Plus}
            onClick={() => setShowCreateForm((v) => !v)}
            tone={showCreateForm ? 'secondary' : 'primary'}
          >
            {showCreateForm ? 'Close' : 'New Intake'}
          </Button>
        }
      />

      {showCreateForm && (
        <Surface>
          <CardHeader title="New capability intake" icon={Plus} />
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <LabeledField label="Source type" htmlFor="cap-source-type">
                  <Select
                    id="cap-source-type"
                    value={newCapability.sourceType}
                    onChange={(e) =>
                      setNewCapability({ ...newCapability, sourceType: e.target.value as (typeof SOURCE_TYPES)[number] })
                    }
                  >
                    {SOURCE_TYPES.map((sourceType) => (
                      <option key={sourceType} value={sourceType}>
                        {sourceType}
                      </option>
                    ))}
                  </Select>
                </LabeledField>
                <LabeledField label="Source reference" required htmlFor="cap-source-ref">
                  <input
                    id="cap-source-ref"
                    type="text"
                    value={newCapability.sourceRef}
                    onChange={(e) => setNewCapability({ ...newCapability, sourceRef: e.target.value })}
                    placeholder="Repo URL, doc URL, note key, paper link"
                    className={inputClassName}
                    required
                  />
                </LabeledField>
              </div>
              <LabeledField label="Title" htmlFor="cap-title" hint="Optional — inferred from source if omitted">
                <input
                  id="cap-title"
                  type="text"
                  value={newCapability.title}
                  onChange={(e) => setNewCapability({ ...newCapability, title: e.target.value })}
                  placeholder="Title (optional)"
                  className={inputClassName}
                />
              </LabeledField>
              <LabeledField label="User intent" htmlFor="cap-intent" hint="What problem should this solve here?">
                <textarea
                  id="cap-intent"
                  value={newCapability.userIntent}
                  onChange={(e) => setNewCapability({ ...newCapability, userIntent: e.target.value })}
                  rows={3}
                  placeholder="Describe the problem this capability should solve..."
                  className={textareaClassName}
                />
              </LabeledField>
              <div className="flex gap-2">
                <Button type="submit" icon={Plus} disabled={createMutation.isPending || !newCapability.sourceRef.trim()}>
                  {createMutation.isPending ? 'Creating...' : 'Create Capability'}
                </Button>
                <Button type="button" onClick={() => setShowCreateForm(false)} tone="secondary">
                  Cancel
                </Button>
              </div>
            </form>
          </CardBody>
        </Surface>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mc-stagger">
        <StatCard label="Registry" value={registry.length} icon={Workflow} tone="blue" hint="Capabilities by lifecycle status" />
        <StatCard
          label="Discovery"
          value={discovery ? (discovery.workflow as { currentFocus?: string })?.currentFocus ?? '—' : '—'}
          icon={Compass}
          tone="cyan"
          hint="Current focus"
        />
        <StatCard
          label="Architecture"
          value={architecture ? (architecture.workflow as { currentFocus?: string })?.currentFocus ?? '—' : '—'}
          icon={Workflow}
          tone="purple"
          hint="Current focus"
        />
        <StatCard
          label="Workspace Forge"
          value={workspace ? (workspace.forge as { workflow?: { currentFocus?: string } })?.workflow?.currentFocus ?? '—' : '—'}
          icon={Workflow}
          tone="green"
          hint="Current focus"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card padding="md">
          <SectionHeading title="Discovery overview" icon={Compass} />
          <CountSummary counts={discovery?.counts as Record<string, unknown> | undefined} />
        </Card>
        <Card padding="md">
          <SectionHeading title="Architecture overview" icon={Workflow} />
          <CountSummary counts={(architecture?.stageCounts || architecture?.counts) as Record<string, unknown> | undefined} />
          <CountSummary counts={architecture?.decisionCounts as Record<string, unknown> | undefined} />
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.7fr,1fr]">
        <div className="space-y-3 mc-stagger">
          {registry.map((entry) => {
            const capability = entry.capability;
            return (
              <Card
                key={capability.id}
                as="article"
                interactive
                className={cn(
                  'cursor-pointer',
                  resolvedSelectedCapabilityId === capability.id && 'border-blue-300/30 ring-1 ring-blue-400/20',
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelectedCapabilityId(capability.id)}
                  className="w-full p-4 text-left outline-none focus-visible:ring-4 focus-visible:ring-blue-400/20"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-blue-200">
                          <Workflow className="h-4 w-4" />
                        </span>
                        <h3 className="truncate text-sm font-semibold text-slate-100">{capability.title}</h3>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5 break-all text-xs text-slate-500">
                        <Link2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{capability.sourceRef}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                      <StatusBadge tone={statusTone(capability.status ?? '')}>
                        {capability.status}
                      </StatusBadge>
                      <Badge tone={runtimeTone(capability.runtimeStatus ?? '')}>
                        runtime: {capability.runtimeStatus}
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge tone="slate">{capability.sourceType}</Badge>
                    <Badge tone="purple">framework: {capability.frameworkStatus}</Badge>
                    {capability.recommendation && (
                      <Badge tone="amber">{capability.recommendation}</Badge>
                    )}
                  </div>

                  {capability.userIntent && (
                    <div className="mt-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">User intent</p>
                      <p className="mt-1 text-sm text-slate-300">{capability.userIntent}</p>
                    </div>
                  )}
                  {capability.analysisSummary && (
                    <div className="mt-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">Analysis</p>
                      <p className="mt-1 text-sm text-slate-300">{capability.analysisSummary}</p>
                    </div>
                  )}

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Category</p>
                      <p className="mt-0.5 text-sm text-slate-300">{capability.category || 'Unclassified'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Workflow family</p>
                      <p className="mt-0.5 text-sm text-slate-300">{capability.workflowFamily}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Updated</p>
                      <p className="mt-0.5 text-sm text-slate-400">
                        <Timestamp value={capability.updatedAt ?? ''} format="datetime" className="text-xs" />
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {[
                      ['Experiments', entry.experiments?.length ?? 0],
                      ['Evaluations', entry.evaluations?.length ?? 0],
                      ['Decisions', entry.decisions?.length ?? 0],
                      ['Integrations', entry.integrations?.length ?? 0],
                      ['Lead time', entry.decisionLeadTimeHours != null ? `${entry.decisionLeadTimeHours}h` : 'Pending'],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-600">{label}</p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-200">{value}</p>
                      </div>
                    ))}
                  </div>

                  {entry.latestDecision && (
                    <div className="mt-3 rounded-lg border border-blue-400/20 bg-blue-400/8 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-300">Latest decision</p>
                      <p className="mt-0.5 text-sm text-slate-200">
                        {entry.latestDecision.decision}: {entry.latestDecision.rationale}
                      </p>
                    </div>
                  )}

                  {Array.isArray(capability.notes) && capability.notes.length > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center gap-1.5">
                        <Compass className="h-3.5 w-3.5 text-slate-600" />
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">Notes</p>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {capability.notes.map((note, index) => (
                          <Badge key={`${capability.id}-note-${index}`} tone="slate">
                            {note}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </button>
              </Card>
            );
          })}

          {registry.length === 0 && (
            <EmptyState
              icon={Workflow}
              title="No directive capabilities"
              description="Add an intake item to start the capability lifecycle."
              action={
                !showCreateForm ? (
                  <Button icon={Plus} onClick={() => setShowCreateForm(true)}>
                    New intake
                  </Button>
                ) : undefined
              }
            />
          )}
        </div>

        <Card className="h-fit">
          <CardHeader title="Lifecycle detail" icon={Compass} eyebrow="Inspector" />
          <CardBody>
            {!selectedRegistryEntry ? (
              <p className="text-sm text-slate-500">
                Select a capability to inspect its experiment, evaluation, decision, and integration history.
              </p>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="font-semibold text-slate-100">
                    {selectedRegistryEntry.capability.title}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedRegistryEntry.capability.status} / runtime{' '}
                    {selectedRegistryEntry.capability.runtimeStatus}
                  </p>
                </div>

                {lifecycleLoading && <p className="text-sm text-slate-500">Loading lifecycle...</p>}

                {lifecycleData && (
                  <LifecycleDetail data={lifecycleData as LifecycleData} />
                )}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </PageContainer>
  );
}

function LifecycleDetail({ data }: { data: LifecycleData }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Decision lead time</p>
          <p className="mt-1 text-sm font-semibold text-slate-200">
            {data.decisionLeadTimeHours != null ? `${data.decisionLeadTimeHours}h` : 'Pending'}
          </p>
        </div>
        <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">Adopt to callable</p>
          <p className="mt-1 text-sm font-semibold text-slate-200">
            {data.adoptToCallableLeadTimeHours != null ? `${data.adoptToCallableLeadTimeHours}h` : 'Pending'}
          </p>
        </div>
      </div>

      <LifecycleSection title="Experiments" empty="No experiments recorded.">
        {(data.experiments ?? []).map((experiment) => (
          <div key={experiment.id} className="mb-3 last:mb-0">
            <p className="text-sm font-medium text-slate-100">
              {experiment.status}: {experiment.hypothesis}
            </p>
            <p className="mt-1 text-xs text-slate-500">{experiment.plan}</p>
          </div>
        ))}
      </LifecycleSection>

      <LifecycleSection title="Evaluations" empty="No evaluations recorded.">
        {(data.evaluations ?? []).map((evaluation) => (
          <div key={evaluation.id} className="mb-3 last:mb-0">
            <p className="text-sm font-medium text-slate-100">{evaluation.outcome}</p>
            <p className="mt-1 text-xs text-slate-500">{evaluation.evidenceSummary}</p>
          </div>
        ))}
      </LifecycleSection>

      <LifecycleSection title="Decisions" empty="No decisions recorded.">
        {(data.decisions ?? []).map((decision) => (
          <div key={decision.id} className="mb-3 last:mb-0">
            <p className="text-sm font-medium text-slate-100">{decision.decision}</p>
            <p className="mt-1 text-xs text-slate-500">{decision.rationale}</p>
          </div>
        ))}
      </LifecycleSection>

      <LifecycleSection title="Integrations" empty="No integrations recorded.">
        {(data.integrations ?? []).map((integration) => (
          <div key={integration.id} className="mb-3 last:mb-0">
            <p className="text-sm font-medium text-slate-100">
              {integration.status} / {integration.integrationMode}
            </p>
            <p className="mt-1 text-xs text-slate-500">{integration.integrationSurface}</p>
            {integration.proofArtifactPath && (
              <p className="mt-1.5 break-all font-mono text-[11px] text-slate-600">
                {integration.proofArtifactPath}
              </p>
            )}
          </div>
        ))}
      </LifecycleSection>
    </>
  );
}

function LifecycleSection({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children : [children];
  const hasContent = items.filter(Boolean).length > 0;
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">{title}</p>
      {hasContent ? children : <p className="text-sm text-slate-500">{empty}</p>}
    </div>
  );
}
