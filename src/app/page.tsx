'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useAppState } from '@/state/app-store';
import { health } from '@/features/health/api';
import { quests as questsApi } from '@/features/quests/api';
import { reports as reportsApi } from '@/features/reports/api';
import { agents as agentsApi } from '@/features/agents/api';
import { ops as opsApi } from '@/features/ops/api';
import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  Cpu,
  FileText,
  Gauge,
  Network,
  ScrollText,
  Settings,
  Sparkles,
  Workflow,
} from 'lucide-react';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  ErrorState,
  KeyValue,
  LoadingGrid,
  PageContainer,
  PageHeader,
  SectionHeading,
  Spinner,
  StatCard,
  StatusBadge,
  StatusDot,
  Timestamp,
  cn,
  type Tone,
} from '@/components/ui/primitives';

type QuestStatus = 'open' | 'in_progress' | 'blocked' | 'done';

const questStatusTone: Record<QuestStatus, Tone> = {
  open: 'blue',
  in_progress: 'purple',
  blocked: 'amber',
  done: 'green',
};

const questStatusLabel: Record<QuestStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};

interface QuickAction {
  href: string;
  label: string;
  description: string;
  icon: typeof ScrollText;
  tone: Tone;
}

const quickActions: QuickAction[] = [
  { href: '/quests', label: 'Quests', description: 'Active work & delivery', icon: ScrollText, tone: 'blue' },
  { href: '/reports', label: 'Reports', description: 'Operational log', icon: FileText, tone: 'green' },
  { href: '/agents', label: 'Agents', description: 'Runtime & dispatch', icon: Bot, tone: 'purple' },
  { href: '/automation', label: 'Automation', description: 'Templates & runs', icon: Cpu, tone: 'amber' },
  { href: '/directive', label: 'Directive', description: 'Capability intake', icon: Workflow, tone: 'cyan' },
  { href: '/ops', label: 'Ops', description: 'Health & nightly', icon: Settings, tone: 'red' },
  { href: '/code-graph', label: 'Code Graph', description: 'Knowledge topology', icon: Network, tone: 'slate' },
  { href: '/docs', label: 'Docs', description: 'Project knowledge', icon: FileText, tone: 'blue' },
];

const toneText: Record<Tone, string> = {
  blue: 'text-blue-200',
  slate: 'text-slate-300',
  green: 'text-emerald-200',
  amber: 'text-amber-200',
  red: 'text-rose-200',
  purple: 'text-violet-200',
  cyan: 'text-cyan-200',
};

export default function DashboardPage() {
  const { activeProject } = useAppState();

  const healthQ = useQuery({
    queryKey: ['health'],
    queryFn: health.check,
    refetchInterval: 30000,
  });
  const questsQ = useQuery({
    queryKey: ['quests', 'dashboard'],
    queryFn: () => questsApi.list({ status: 'open', completed: 'false' }),
    staleTime: 60 * 1000,
  });
  const reportsQ = useQuery({
    queryKey: ['reports', 'dashboard'],
    queryFn: () => reportsApi.list({}),
    staleTime: 60 * 1000,
  });
  const agentsQ = useQuery({
    queryKey: ['agents', 'dashboard'],
    queryFn: agentsApi.list,
    staleTime: 60 * 1000,
  });
  const opsQ = useQuery({
    queryKey: ['ops-health', 'dashboard'],
    queryFn: opsApi.health,
    staleTime: 60 * 1000,
    retry: false,
  });

  const questList = (questsQ.data?.quests ?? []).slice(0, 5);
  const reportList = (reportsQ.data?.reports ?? []).slice(0, 4);
  const agentList = agentsQ.data?.agents ?? [];
  const runningAgents = agentList.filter(
    (a: Record<string, unknown>) => String(a.status ?? '').toLowerCase() === 'running',
  ).length;
  const meta = questsQ.data?.meta;
  const openCount = meta?.statusCounts?.open ?? questList.length;
  const doneCount = meta?.statusCounts?.done ?? 0;
  const reportCount = reportsQ.data?.meta?.total ?? reportList.length;
  const healthy = Boolean(healthQ.data?.ok) && !healthQ.error;

  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <PageContainer width="wide" className="space-y-6">
      <PageHeader
        eyebrow="Operation Layer"
        title="Mission Control"
        description="Live overview of quests, reports, agents, automation, and system health across this workspace."
        actions={
          <StatusBadge tone={healthy ? 'green' : 'red'} pulse={healthy}>
            {healthy ? 'All systems nominal' : 'Backend offline'}
          </StatusBadge>
        }
      />

      <div className="flex flex-col gap-2 mc-animate-fade-in-up">
        <p className="text-sm text-slate-400">
          {greeting}. Workspace <span className="font-semibold text-slate-200">{activeProject}</span>{' '}
          has <span className="font-semibold text-blue-200 tabular-nums">{openCount}</span> active
          quest{openCount === 1 ? '' : 's'} and{' '}
          <span className="font-semibold text-violet-200 tabular-nums">{runningAgents}</span> running
          agent{runningAgents === 1 ? '' : 's'}.
        </p>
      </div>

      {questsQ.isLoading ? (
        <LoadingGrid count={5} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5 mc-stagger">
          <StatCard
            label="Active Quests"
            value={openCount}
            icon={ScrollText}
            tone="blue"
            hint={doneCount > 0 ? `${doneCount} completed` : 'No completions yet'}
          />
          <StatCard
            label="Reports"
            value={reportCount}
            icon={FileText}
            tone="green"
            hint="Operational log"
          />
          <StatCard
            label="Running Agents"
            value={runningAgents}
            icon={Bot}
            tone="purple"
            hint={`${agentList.length} total registered`}
          />
          <StatCard
            label="Backend"
            value={healthy ? 'Healthy' : 'Offline'}
            icon={Activity}
            tone={healthy ? 'green' : 'red'}
            hint={healthy ? 'Responding' : 'Start with npm run backend:dev'}
          />
          <StatCard
            label="Ops Health"
            value={opsQ.isLoading ? '—' : opsQ.error ? 'N/A' : 'Stable'}
            icon={Gauge}
            tone={opsQ.error ? 'amber' : 'cyan'}
            hint={opsQ.data ? 'Nightly OK' : 'No data'}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 mc-animate-fade-in-up">
          <CardHeader
            title="Recent Quests"
            icon={ScrollText}
            eyebrow="Work"
            description="Latest open work items"
            action={
              <Link
                href="/quests"
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-300 transition hover:text-blue-200"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            }
          />
          <CardBody className="p-0">
            {questsQ.isLoading ? (
              <div className="flex items-center gap-2 px-5 py-10 text-sm text-slate-500">
                <Spinner size="sm" /> Loading quests...
              </div>
            ) : questsQ.error ? (
              <div className="px-5 py-6">
                <ErrorState
                  title="Failed to load quests"
                  message={(questsQ.error as Error).message}
                  onRetry={() => questsQ.refetch()}
                />
              </div>
            ) : questList.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">
                No open quests. The workspace is clear.
              </div>
            ) : (
              <ul className="divide-y divide-white/6">
                {questList.map((quest) => {
                  const q = quest as unknown as Record<string, unknown>;
                  const status = String(q.status ?? 'open') as QuestStatus;
                  return (
                    <li key={String(q.id ?? q._id)}>
                      <Link
                        href="/quests"
                        className="group flex items-start gap-3 px-5 py-3 transition hover:bg-white/[0.03]"
                      >
                        <StatusDot tone={questStatusTone[status]} className="mt-1.5" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-100 group-hover:text-white">
                            {String(q.goal ?? '')}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <Badge tone={questStatusTone[status]}>{questStatusLabel[status]}</Badge>
                            {q.area ? <Badge tone="purple">{String(q.area)}</Badge> : null}
                            {q.date ? (
                              <Timestamp
                                value={String(q.date)}
                                format="relative"
                                className="text-xs text-slate-500"
                              />
                            ) : null}
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card className="mc-animate-fade-in-up">
          <CardHeader
            title="System Health"
            icon={Activity}
            eyebrow="Status"
            action={
              <Link
                href="/health"
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-300 transition hover:text-blue-200"
              >
                Details <ArrowRight className="h-3 w-3" />
              </Link>
            }
          />
          <CardBody className="space-y-4">
            {healthQ.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Spinner size="sm" /> Checking backend...
              </div>
            ) : healthQ.error ? (
              <div className="space-y-3">
                <StatusBadge tone="red" pulse>
                  Backend offline
                </StatusBadge>
                <p className="text-xs text-slate-500">
                  Start it with{' '}
                  <code className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-[11px] text-slate-300">
                    npm run backend:dev
                  </code>
                </p>
              </div>
            ) : (
              <DescriptionList>
                <KeyValue label="Status">
                  <span className="inline-flex items-center gap-1.5 text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Healthy
                  </span>
                </KeyValue>
                <KeyValue label="Users" mono>
                  {Number(healthQ.data?.users ?? 0)}
                </KeyValue>
                <KeyValue label="Database">
                  <span className="block max-w-full truncate font-mono text-[12px] text-slate-400">
                    {String(healthQ.data?.dbPath ?? '—')}
                  </span>
                </KeyValue>
                <KeyValue label="Checked">
                  <Timestamp
                    value={String(healthQ.data?.timestamp ?? '')}
                    format="datetime"
                    className="text-xs text-slate-400"
                  />
                </KeyValue>
              </DescriptionList>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 mc-animate-fade-in-up">
          <CardHeader
            title="Recent Reports"
            icon={FileText}
            eyebrow="Log"
            description="Latest operational entries"
            action={
              <Link
                href="/reports"
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-300 transition hover:text-blue-200"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            }
          />
          <CardBody className="p-0">
            {reportsQ.isLoading ? (
              <div className="flex items-center gap-2 px-5 py-10 text-sm text-slate-500">
                <Spinner size="sm" /> Loading reports...
              </div>
            ) : reportsQ.error ? (
              <div className="px-5 py-6">
                <ErrorState
                  title="Failed to load reports"
                  message={(reportsQ.error as Error).message}
                  onRetry={() => reportsQ.refetch()}
                />
              </div>
            ) : reportList.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">
                No reports recorded yet.
              </div>
            ) : (
              <ul className="divide-y divide-white/6">
                {reportList.map((report: Record<string, unknown>) => {
                  const r = report;
                  return (
                    <li key={String(r.id)}>
                      <Link
                        href="/reports"
                        className="group flex items-start gap-3 px-5 py-3 transition hover:bg-white/[0.03]"
                      >
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-600 group-hover:text-slate-400" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-100 group-hover:text-white">
                            {String(r.title ?? 'Untitled')}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            {r.category ? <Badge tone="blue">{String(r.category)}</Badge> : null}
                            {r.status ? <Badge tone="slate">{String(r.status)}</Badge> : null}
                            {r.date ? (
                              <Timestamp
                                value={String(r.date)}
                                format="relative"
                                className="text-xs text-slate-500"
                              />
                            ) : null}
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card className="mc-animate-fade-in-up">
          <CardHeader
            title="Agents"
            icon={Bot}
            eyebrow="Automation"
            description="Registered runtimes"
            action={
              <Link
                href="/agents"
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-300 transition hover:text-blue-200"
              >
                Manage <ArrowRight className="h-3 w-3" />
              </Link>
            }
          />
          <CardBody className="space-y-2">
            {agentsQ.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Spinner size="sm" /> Loading agents...
              </div>
            ) : agentsQ.error ? (
              <p className="text-sm text-slate-500">Unable to load agents.</p>
            ) : agentList.length === 0 ? (
              <p className="text-sm text-slate-500">No agents registered.</p>
            ) : (
              agentList.slice(0, 6).map((agent: Record<string, unknown>) => {
                const a = agent;
                const status = String(a.status ?? '').toLowerCase();
                const tone: Tone =
                  status === 'running' ? 'green' : status === 'stopped' || status === 'killed' ? 'red' : 'slate';
                return (
                  <div
                    key={String(a.id ?? a.name)}
                    className="flex items-center justify-between gap-2 rounded-lg border border-white/6 bg-white/[0.02] px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Bot className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                      <span className="truncate text-sm text-slate-200">{String(a.name ?? 'Agent')}</span>
                    </div>
                    <StatusDot tone={tone} pulse={tone === 'green'} size="sm" />
                  </div>
                );
              })
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mc-animate-fade-in-up">
        <SectionHeading
          title="Navigate"
          icon={Sparkles}
          description="Jump to any operational surface"
          className="mb-3"
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group mc-card mc-card-interactive p-4"
            >
              <div className="flex items-start justify-between">
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05]',
                    toneText[action.tone],
                  )}
                >
                  <action.icon className="h-4 w-4" />
                </span>
                <ArrowRight className="h-4 w-4 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-slate-300" />
              </div>
              <h3 className="mt-3 text-sm font-semibold tracking-tight text-slate-100 group-hover:text-white">
                {action.label}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">{action.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
