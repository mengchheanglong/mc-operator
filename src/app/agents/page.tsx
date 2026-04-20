'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agents } from '@/features/agents/api';
import { useState } from 'react';
import { Bot, Play, Pause, RefreshCw, Terminal } from 'lucide-react';

export default function AgentsPage() {
  const queryClient = useQueryClient();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [task, setTask] = useState('Review the current project state and report the next concrete step.');

  const { data, isLoading, error } = useQuery({
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
    },
  });

  const killMutation = useMutation({
    mutationFn: (agentId: string) => agents.kill(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['agent-status'] });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (agentId: string) => agents.restore(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['agent-status'] });
    },
  });

  const handleDispatch = (agentId: string) => {
    dispatchMutation.mutate({ agentId });
  };

  const selectedAgentRecord =
    data?.agents?.find((agent: any) => agent.id === selectedAgent) ?? null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 animate-pulse">Loading agents...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-red-800 font-semibold mb-2">Failed to load agents</h3>
        <p className="text-red-600 text-sm">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Agent Catalog</h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage configured agents, inspect runtime session status, and dispatch bounded tasks.
          </p>
        </div>

        <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Dispatch task
          </label>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            placeholder="Describe the task to dispatch to the selected agent"
          />
          <p className="text-xs text-gray-500 mt-2">
            Dispatch sends `task` to the backend. The old placeholder `command: &quot;run&quot;` shape has been removed.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.agents?.map((agent: any) => (
            <div
              key={agent.id}
              className={`p-4 border-2 rounded-lg transition-all cursor-pointer ${
                selectedAgent === agent.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setSelectedAgent(agent.id)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Bot className="w-6 h-6 text-purple-600" />
                </div>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    agent.status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {agent.status || 'inactive'}
                </span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{agent.name}</h3>
              <p className="text-sm text-gray-600 mb-3">{agent.description || 'No description'}</p>
              <div className="space-y-1 text-xs text-gray-500 mb-3">
                <p>Role: {agent.role}</p>
                <p>Executor: {agent.executor}</p>
                <p>Backend: {agent.backend}</p>
                {agent.model && <p>Model: {agent.model}</p>}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDispatch(agent.id);
                  }}
                  disabled={dispatchMutation.isPending || !task.trim()}
                  className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  <Play className="w-3 h-3" />
                  Run
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (agent.sessionId) {
                      killMutation.mutate(agent.id);
                    } else {
                      restoreMutation.mutate(agent.id);
                    }
                  }}
                  disabled={killMutation.isPending || restoreMutation.isPending}
                  className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded text-sm hover:bg-slate-300 disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  <Pause className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    queryClient.invalidateQueries({ queryKey: ['agents'] });
                    queryClient.invalidateQueries({ queryKey: ['agent-status'] });
                  }}
                  className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 flex items-center justify-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {data?.agents?.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No agents available.
          </div>
        )}

        {selectedAgentRecord && (
          <div className="mt-8 p-4 border border-gray-200 rounded-lg bg-gray-50">
            <div className="flex items-center gap-2 mb-3">
              <Terminal className="w-5 h-5 text-gray-600" />
              <h3 className="font-semibold text-gray-900">Selected Agent Runtime</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500 mb-1">Agent</p>
                <p className="text-gray-900 font-medium">{selectedAgentRecord.name}</p>
              </div>
              <div>
                <p className="text-gray-500 mb-1">Session ID</p>
                <p className="text-gray-900 font-mono break-all">
                  {selectedAgentRecord.sessionId || 'No active session'}
                </p>
              </div>
              <div>
                <p className="text-gray-500 mb-1">Last Run</p>
                <p className="text-gray-900">
                  {selectedAgentRecord.lastRunStatus || 'No recorded runs'}
                </p>
              </div>
              <div>
                <p className="text-gray-500 mb-1">Status Probe</p>
                <p className="text-gray-900 break-all">
                  {selectedStatus?.status?.body || 'No runtime probe loaded'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
