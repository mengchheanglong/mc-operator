'use client';

import { useQuery } from '@tanstack/react-query';
import { ops } from '@/features/ops/api';
import { Activity, AlertTriangle, Clock, Shield } from 'lucide-react';

function metricTone(kind: 'health' | 'nightly' | 'guards') {
  if (kind === 'health') {
    return {
      panel: 'bg-emerald-500/10 ring-1 ring-emerald-400/16',
      icon: 'text-emerald-300',
      label: 'text-emerald-200',
      value: 'text-emerald-100',
      copy: 'text-emerald-200/80',
    };
  }

  if (kind === 'nightly') {
    return {
      panel: 'bg-amber-500/10 ring-1 ring-amber-300/16',
      icon: 'text-amber-300',
      label: 'text-amber-200',
      value: 'text-amber-100',
      copy: 'text-amber-200/80',
    };
  }

  return {
    panel: 'bg-violet-500/10 ring-1 ring-violet-300/16',
    icon: 'text-violet-300',
    label: 'text-violet-200',
    value: 'text-violet-100',
    copy: 'text-violet-200/80',
  };
}

function itemTone(item: { available?: boolean; ok?: boolean; stale?: boolean }) {
  if (item.available && item.ok === true && item.stale === false) {
    return {
      panel: 'bg-emerald-500/6 ring-1 ring-emerald-400/12',
      badge: 'bg-emerald-400/16 text-emerald-200',
    };
  }

  if (item.available) {
    return {
      panel: 'bg-amber-500/6 ring-1 ring-amber-300/12',
      badge: 'bg-amber-300/16 text-amber-200',
    };
  }

  return {
    panel: 'bg-rose-500/6 ring-1 ring-rose-400/12',
    badge: 'bg-rose-400/16 text-rose-200',
  };
}

export default function OpsPage() {
  const { data: healthData, isLoading: healthLoading, error: healthError } = useQuery({
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

  if (healthLoading || guardsLoading || nightlyLoading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-[28px] bg-[#11151d] ring-1 ring-white/8">
        <div className="text-sm tracking-wide text-slate-400 animate-pulse">Loading ops dashboard...</div>
      </div>
    );
  }

  const healthTone = metricTone('health');
  const nightlyTone = metricTone('nightly');
  const guardsTone = metricTone('guards');

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[30px] bg-[#12161f]/92 p-7 shadow-[0_28px_60px_rgba(0,0,0,0.32)] ring-1 ring-white/8">
        <div className="mb-7 flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.24em] text-slate-500">Operations</p>
            <h2 className="text-3xl font-semibold tracking-tight text-white">Operations Dashboard</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Nightly health, workflow guardrails, and artifact readiness for the current workspace.
            </p>
          </div>
        </div>

        <div className="mb-7 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className={`rounded-3xl p-5 ${healthTone.panel}`}>
            <div className="mb-3 flex items-center gap-2">
              <Activity className={`h-5 w-5 ${healthTone.icon}`} />
              <span className={`text-sm font-medium ${healthTone.label}`}>System Health</span>
            </div>
            <div className={`text-2xl font-semibold ${healthTone.value}`}>
              {healthData?.ok ? 'Operational' : 'Degraded'}
            </div>
            <p className={`mt-3 text-sm ${healthTone.copy}`}>
              {healthData?.overallOk === true
                ? 'All monitored snapshots are current.'
                : 'One or more monitored snapshots are stale or failing.'}
            </p>
          </div>

          <div className={`rounded-3xl p-5 ${nightlyTone.panel}`}>
            <div className="mb-3 flex items-center gap-2">
              <Clock className={`h-5 w-5 ${nightlyTone.icon}`} />
              <span className={`text-sm font-medium ${nightlyTone.label}`}>Nightly</span>
            </div>
            <div className={`text-2xl font-semibold ${nightlyTone.value}`}>
              {nightlyData?.overallOk === true ? 'Healthy' : 'Attention'}
            </div>
            <p className={`mt-3 text-sm ${nightlyTone.copy}`}>
              {nightlyData?.generatedAt
                ? `Snapshot generated ${new Date(nightlyData.generatedAt).toLocaleString()}`
                : 'No nightly snapshot available.'}
            </p>
          </div>

          <div className={`rounded-3xl p-5 ${guardsTone.panel}`}>
            <div className="mb-3 flex items-center gap-2">
              <Shield className={`h-5 w-5 ${guardsTone.icon}`} />
              <span className={`text-sm font-medium ${guardsTone.label}`}>Guardrails</span>
            </div>
            <div className={`text-2xl font-semibold ${guardsTone.value}`}>
              {guardsData?.guards?.length || 0} Enabled
            </div>
            <p className={`mt-3 text-sm ${guardsTone.copy}`}>
              Current query is showing agent-scoped workflow guards.
            </p>
          </div>
        </div>

        {nightlyData?.items && (
          <div className="mb-7">
            <h3 className="mb-4 text-lg font-semibold text-white">Nightly Snapshot Items</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {Object.values(nightlyData.items).map((item: any) => {
                const tone = itemTone(item);
                const status =
                  item.available
                    ? item.ok === true && item.stale === false
                      ? 'Healthy'
                      : 'Needs attention'
                    : 'Missing';

                return (
                  <div key={item.key} className={`rounded-3xl p-4 ${tone.panel}`}>
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-white">{item.label}</div>
                        <div className="mt-2 text-sm text-slate-300">{item.detail}</div>
                      </div>
                      <span className={`rounded-xl px-3 py-1 text-xs font-medium ${tone.badge}`}>{status}</span>
                    </div>

                    <p className="text-xs text-slate-500">
                      {item.generatedAt
                        ? `Generated ${new Date(item.generatedAt).toLocaleString()}`
                        : 'Not generated'}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {guardsData?.guards && guardsData.guards.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">Active Guards</h3>
            {guardsData.guards.map((guard: any, idx: number) => (
              <div
                key={idx}
                className="rounded-3xl bg-[#0f141d] p-4 ring-1 ring-white/8"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-base font-semibold text-white">{guard.name || `Guard ${idx + 1}`}</span>
                  <span className="rounded-xl bg-emerald-400/14 px-3 py-1 text-xs font-medium text-emerald-200">
                    Active
                  </span>
                </div>
                {guard.description && <p className="mt-2 text-sm text-slate-400">{guard.description}</p>}
              </div>
            ))}
          </div>
        )}

        {!guardsData?.guards?.length && (
          <div className="flex items-start gap-3 rounded-3xl bg-amber-500/10 p-4 ring-1 ring-amber-300/16">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-300" />
            <div>
              <h3 className="font-semibold text-amber-100">No Active Guards</h3>
              <p className="mt-1 text-sm text-amber-200/80">
                No workflow guards were returned for the current agent-scoped query.
              </p>
            </div>
          </div>
        )}

        {healthError && (
          <div className="mt-6 rounded-3xl bg-rose-500/10 p-4 ring-1 ring-rose-400/16">
            <h3 className="font-semibold text-rose-100">Health Check Failed</h3>
            <p className="mt-2 text-sm text-rose-200/80">{healthError.message}</p>
          </div>
        )}
      </section>
    </div>
  );
}
