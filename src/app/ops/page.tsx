'use client';

import { useQuery } from '@tanstack/react-query';
import { ops } from '@/features/ops/api';
import { Activity, AlertTriangle, Clock, Shield } from 'lucide-react';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingGrid,
  PageContainer,
  PageHeader,
  StatCard,
  StatusBadge,
  StatusDot,
  Timestamp,
  cn,
  type Tone,
} from '@/components/ui/primitives';

interface NightlyItem {
  key: string;
  label?: string;
  detail?: string;
  available?: boolean;
  ok?: boolean;
  stale?: boolean;
  generatedAt?: string;
}

interface Guard {
  name?: string;
  description?: string;
}

function itemTone(item: NightlyItem): Tone {
  if (item.available && item.ok === true && item.stale === false) return 'green';
  if (item.available) return 'amber';
  return 'red';
}

function itemStatus(item: NightlyItem): string {
  if (!item.available) return 'Missing';
  if (item.ok === true && item.stale === false) return 'Healthy';
  return 'Needs attention';
}

export default function OpsPage() {
  const { data: healthData, isLoading: healthLoading, error: healthError, refetch: refetchHealth } = useQuery({
    queryKey: ['ops-health'],
    queryFn: ops.health,
    staleTime: 1 * 60 * 1000,
  });

  const { data: guardsData, isLoading: guardsLoading } = useQuery({
    queryKey: ['workflow-guards'],
    queryFn: () => ops.workflowGuards(),
    staleTime: 2 * 60 * 1000,
  });

  const { data: nightlyData, isLoading: nightlyLoading } = useQuery({
    queryKey: ['ops-nightly'],
    queryFn: () => ops.listNightly(),
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = healthLoading || guardsLoading || nightlyLoading;
  const nightlyItems = nightlyData?.items ? (Object.values(nightlyData.items) as NightlyItem[]) : [];
  const guards = (guardsData?.guards ?? []) as Guard[];

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="System"
        title="Operations Dashboard"
        description="Nightly health, workflow guardrails, and artifact readiness for the current workspace."
        actions={
          !isLoading && (
            <StatusBadge tone={healthData?.ok ? 'green' : 'red'} pulse={healthData?.ok}>
              {healthData?.ok ? 'Operational' : 'Degraded'}
            </StatusBadge>
          )
        }
      />

      {isLoading ? (
        <LoadingGrid count={3} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3 mc-stagger">
            <StatCard
              label="System Health"
              value={healthData?.ok ? 'Operational' : 'Degraded'}
              icon={Activity}
              tone={healthData?.ok ? 'green' : 'red'}
              hint={healthData?.overallOk === true ? 'All snapshots current' : 'Snapshots stale or failing'}
            />
            <StatCard
              label="Nightly"
              value={nightlyData?.overallOk === true ? 'Healthy' : 'Attention'}
              icon={Clock}
              tone={nightlyData?.overallOk === true ? 'green' : 'amber'}
              hint={
                nightlyData?.generatedAt ? (
                  <Timestamp value={nightlyData.generatedAt} format="datetime" />
                ) : (
                  'No snapshot available'
                )
              }
            />
            <StatCard
              label="Guardrails"
              value={`${guards.length} Enabled`}
              icon={Shield}
              tone="purple"
              hint="Agent-scoped workflow guards"
            />
          </div>

          {healthError && (
            <ErrorState
              title="Health check failed"
              message={healthError.message}
              onRetry={() => refetchHealth()}
            />
          )}

          {nightlyItems.length > 0 && (
            <div className="space-y-3">
              <CardHeader title="Nightly snapshot items" icon={Clock} eyebrow="Artifacts" />
              <div className="grid gap-4 sm:grid-cols-2 mc-stagger">
                {nightlyItems.map((item) => (
                  <Card key={item.key} as="article" padding="md">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold tracking-tight text-slate-100">
                          {item.label || item.key}
                        </h3>
                        {item.detail && (
                          <p className="mt-1.5 text-xs text-slate-500">{item.detail}</p>
                        )}
                        <p className="mt-2 text-xs text-slate-600">
                          {item.generatedAt ? (
                            <>
                              Generated{' '}
                              <Timestamp value={item.generatedAt} format="relative" className="text-slate-500" />
                            </>
                          ) : (
                            'Not generated'
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <StatusDot
                          tone={itemTone(item)}
                          pulse={itemTone(item) === 'green'}
                          size="sm"
                        />
                        <Badge tone={itemTone(item)}>{itemStatus(item)}</Badge>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <CardHeader title="Active guards" icon={Shield} eyebrow="Guardrails" />
            {guards.length > 0 ? (
              <div className="space-y-2 mc-stagger">
                {guards.map((guard, idx) => (
                  <Card key={idx} as="article" padding="md">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-slate-100">
                          {guard.name || `Guard ${idx + 1}`}
                        </h3>
                        {guard.description && (
                          <p className="mt-1 text-xs text-slate-500">{guard.description}</p>
                        )}
                      </div>
                      <StatusBadge tone="green" pulse>
                        Active
                      </StatusBadge>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-amber-400/20 bg-amber-400/6">
                <CardBody>
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                    <div>
                      <h3 className="text-sm font-semibold text-amber-100">No active guards</h3>
                      <p className="mt-1 text-xs text-amber-200/80">
                        No workflow guards were returned for the current agent-scoped query.
                      </p>
                    </div>
                  </div>
                </CardBody>
              </Card>
            )}
          </div>
        </>
      )}
    </PageContainer>
  );
}
