'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agents } from '@/features/agents/api';
import { useState } from 'react';
import { Bot, Play, Pause, RefreshCw, Send, Terminal } from 'lucide-react';
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
  StatusBadge,
  StatusDot,
  cn,
  inputClassName,
  textareaClassName,
  type Tone,
} from '@/components/ui/primitives';
import { toast } from '@/components/ui/toast';

interface Agent {
  id: string;
  name: string;
  description?: string;
  status?: string;
  role?: string;
  executor?: string;
  backend?: string;
  model?: string;
  sessionId?: string;
  lastRunStatus?: string;
}

export default function AgentsPage() {
  const queryClient = useQueryClient();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [task, setTask] = useState(
    'Review the current project state and report the next concrete step.',
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agents.list(),
    staleTime: 2 * 60 * 1000,
  });

  const { data: selectedStatus } = useQuery({
    queryKey: ['agent-status', selectedAgent],
    queryFn: () => agents.status(selectedAgent!),
    enabled: Boolean(selectedAgent),
    staleTime: 30 * 1000,
  });

  const dispatchMutation = useMutation({
    mutationFn: ({ agentId }: { agentId: string }) =>
      agents.dispatch(agentId, { task, deepMode: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['agent-status'] });
      toast.success('Task dispatched');
    },
    onError: () => toast.error('Failed to dispatch task'),
  });

  const killMutation = useMutation({
    mutationFn: (agentId: string) => agents.kill(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['agent-status'] });
      toast.success('Agent stopped');
    },
    onError: () => toast.error('Failed to stop agent'),
  });

  const restoreMutation = useMutation({
    mutationFn: (agentId: string) => agents.restore(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['agent-status'] });
      toast.success('Agent restored');
    },
    onError: () => toast.error('Failed to restore agent'),
  });

  const agentList = (data?.agents ?? []) as Agent[];
  const selectedAgentRecord = agentList.find((a) => a.id === selectedAgent) ?? null;

  const statusTone = (status: string | undefined): Tone => {
    const s = String(status ?? '').toLowerCase();
    if (s === 'running' || s === 'active') return 'green';
    if (s === 'stopped' || s === 'killed' || s === 'error') return 'red';
    return 'slate';
  };

  if (isLoading) {
    return (
      <PageContainer>
        <LoadingState label="Loading agents..." />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <ErrorState
          title="Failed to load agents"
          message={error.message}
          onRetry={() => refetch()}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Automation"
        title="Agent Catalog"
        description="Manage configured agents, inspect runtime session status, and dispatch bounded tasks."
        actions={
          <StatusBadge tone="purple">
            {agentList.length} agent{agentList.length === 1 ? '' : 's'}
          </StatusBadge>
        }
      />

      <Card>
        <CardHeader
          title="Dispatch task"
          icon={Send}
          description="Send a bounded task to a selected agent. Deep mode is off by default."
        />
        <CardBody>
          <LabeledField label="Task" htmlFor="dispatch-task" hint="Dispatches to the agent you click Run on.">
            <textarea
              id="dispatch-task"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              rows={3}
              placeholder="Describe the task to dispatch..."
              className={textareaClassName}
            />
          </LabeledField>
        </CardBody>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 mc-stagger">
        {agentList.map((agent) => {
          const isSelected = selectedAgent === agent.id;
          const running = String(agent.status ?? '').toLowerCase() === 'running' ||
            String(agent.status ?? '').toLowerCase() === 'active';
          return (
            <Card
              key={agent.id}
              as="article"
              interactive
              className={cn(
                'cursor-pointer',
                isSelected && 'border-blue-300/30 ring-1 ring-blue-400/20',
              )}
            >
              <button
                type="button"
                onClick={() => setSelectedAgent(agent.id)}
                className="w-full p-4 text-left outline-none focus-visible:ring-4 focus-visible:ring-blue-400/20"
              >
                <div className="flex items-start justify-between">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-violet-200">
                    <Bot className="h-5 w-5" />
                  </span>
                  <StatusDot
                    tone={statusTone(agent.status)}
                    pulse={running}
                    label={agent.status || 'inactive'}
                  />
                </div>
                <h3 className="mt-3 text-sm font-semibold tracking-tight text-slate-100">
                  {agent.name}
                </h3>
                <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                  {agent.description || 'No description'}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {agent.role && <Badge tone="slate">{agent.role}</Badge>}
                  {agent.executor && <Badge tone="blue">{agent.executor}</Badge>}
                  {agent.model && <Badge tone="purple">{agent.model}</Badge>}
                </div>
              </button>
              <div className="flex gap-2 border-t border-white/8 px-4 py-3">
                <Button
                  icon={Play}
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatchMutation.mutate({ agentId: agent.id });
                  }}
                  disabled={dispatchMutation.isPending || !task.trim()}
                  className="flex-1"
                >
                  Run
                </Button>
                <IconButton
                  icon={Pause}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (agent.sessionId) killMutation.mutate(agent.id);
                    else restoreMutation.mutate(agent.id);
                  }}
                  disabled={killMutation.isPending || restoreMutation.isPending}
                  tone="secondary"
                  aria-label={agent.sessionId ? 'Stop agent' : 'Restore agent'}
                />
                <IconButton
                  icon={RefreshCw}
                  onClick={(e) => {
                    e.stopPropagation();
                    queryClient.invalidateQueries({ queryKey: ['agents'] });
                    queryClient.invalidateQueries({ queryKey: ['agent-status'] });
                  }}
                  tone="ghost"
                  aria-label="Refresh agents"
                />
              </div>
            </Card>
          );
        })}

        {agentList.length === 0 && (
          <div className="col-span-full">
            <EmptyState
              icon={Bot}
              title="No agents available"
              description="Register or import an agent pack to get started."
            />
          </div>
        )}
      </div>

      {selectedAgentRecord && (
        <Card>
          <CardHeader
            title="Selected Agent Runtime"
            icon={Terminal}
            eyebrow="Detail"
            description={selectedAgentRecord.name}
          />
          <CardBody>
            <DescriptionList>
              <KeyValue label="Agent">
                {selectedAgentRecord.name}
              </KeyValue>
              <KeyValue label="Session ID" mono>
                {selectedAgentRecord.sessionId || 'No active session'}
              </KeyValue>
              <KeyValue label="Last run">
                {selectedAgentRecord.lastRunStatus || 'No recorded runs'}
              </KeyValue>
              <KeyValue label="Status probe">
                <span className="break-all text-xs text-slate-400">
                  {selectedStatus?.status?.body || 'No runtime probe loaded'}
                </span>
              </KeyValue>
            </DescriptionList>
          </CardBody>
        </Card>
      )}
    </PageContainer>
  );
}
