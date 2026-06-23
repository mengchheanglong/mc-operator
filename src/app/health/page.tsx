'use client';

import { useQuery } from '@tanstack/react-query';
import { health } from '@/features/health/api';
import { useAppState } from '@/state/app-store';
import { useEffect } from 'react';
import { Activity, CheckCircle2, Clock, Database, XCircle } from 'lucide-react';
import {
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  ErrorState,
  KeyValue,
  LoadingState,
  PageContainer,
  PageHeader,
  StatusBadge,
  Timestamp,
} from '@/components/ui/primitives';

export default function HealthPage() {
  const { setBackendConnected } = useAppState();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['health'],
    queryFn: health.check,
    refetchInterval: 10000,
  });

  useEffect(() => {
    setBackendConnected(!error);
  }, [error, setBackendConnected]);

  if (isLoading) {
    return (
      <PageContainer>
        <LoadingState label="Checking backend health..." />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <Card className="border-rose-400/20">
          <CardHeader
            title="Backend Unreachable"
            icon={XCircle}
            eyebrow="System"
            description="The backend server is not running or did not respond."
          />
          <CardBody className="space-y-4">
            <StatusBadge tone="red" pulse>
              Offline
            </StatusBadge>
            <p className="text-sm text-slate-400">
              Start it with:{' '}
              <code className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-[13px] text-slate-200">
                npm run backend:dev
              </code>
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="text-sm font-semibold text-blue-300 transition hover:text-blue-200"
            >
              Retry connection
            </button>
          </CardBody>
        </Card>
      </PageContainer>
    );
  }

  const healthy = Boolean(data?.ok);

  return (
    <PageContainer width="narrow">
      <PageHeader
        eyebrow="System"
        title="Backend Health"
        description="Live health check for the Mission Control backend. Refreshes every 10 seconds."
        actions={
          <StatusBadge tone={healthy ? 'green' : 'red'} pulse={healthy}>
            {healthy ? 'Healthy' : 'Unhealthy'}
          </StatusBadge>
        }
      />

      <Card>
        <CardHeader
          title={healthy ? 'All systems nominal' : 'Degraded'}
          icon={Activity}
          description="Backend service status"
        />
        <CardBody>
          <DescriptionList>
            <KeyValue label="Status">
              <span
                className={
                  healthy
                    ? 'inline-flex items-center gap-1.5 text-emerald-300'
                    : 'inline-flex items-center gap-1.5 text-rose-300'
                }
              >
                {healthy ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Healthy
                  </>
                ) : (
                  <>
                    <XCircle className="h-3.5 w-3.5" /> Unhealthy
                  </>
                )}
              </span>
            </KeyValue>
            <KeyValue label="Users" mono>
              {Number(data?.users ?? 0)}
            </KeyValue>
            <KeyValue label="Database path">
              <span className="break-all font-mono text-[12px] text-slate-400">
                {String(data?.dbPath ?? '—')}
              </span>
            </KeyValue>
            <KeyValue label="Last checked">
              <Timestamp
                value={String(data?.timestamp ?? '')}
                format="datetime"
                className="text-xs text-slate-400"
              />
            </KeyValue>
          </DescriptionList>
        </CardBody>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card padding="md">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Service
              </p>
              <p className="text-lg font-semibold tracking-tight text-white">
                {healthy ? 'Responsive' : 'Down'}
              </p>
            </div>
          </div>
        </Card>
        <Card padding="md">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-blue-300">
              <Database className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Database
              </p>
              <p className="text-lg font-semibold tracking-tight text-white">
                {data?.dbPath ? 'Connected' : 'Unknown'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-slate-600">
        <Clock className="h-3.5 w-3.5" />
        Auto-refreshing every 10 seconds
      </p>
    </PageContainer>
  );
}
