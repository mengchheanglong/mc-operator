import { apiRequest } from '@/features/shared/api-client';

export type QuestDifficulty = 'easy' | 'normal' | 'hard' | 'nightmare' | 'hell';
export type QuestStatus = 'open' | 'in_progress' | 'blocked' | 'done';

export interface Quest {
  id: string;
  _id: string;
  userId: string;
  projectId: string;
  goal: string;
  difficulty: QuestDifficulty;
  status: QuestStatus;
  area: string | null;
  topics: string[];
  completed: boolean;
  date: string;
  completedDate: string | null;
}

export interface QuestListMeta {
  total: number;
  loaded: number;
  hasMore: boolean;
  completed?: boolean;
  status?: QuestStatus;
  area?: string;
  statusCounts?: Partial<Record<QuestStatus, number>>;
}

export interface QuestListResponse {
  quests: Quest[];
  meta?: QuestListMeta;
}

export interface QuestMutationResponse {
  msg: string;
  quest: Quest;
}

export interface QuestTransitionResponse extends QuestMutationResponse {
  transition?: {
    from: QuestStatus;
    to: QuestStatus;
  };
  verificationEvidence?: {
    summary: string;
    commands: Array<{
      command: string;
      output: string;
      status?: 'success' | 'warning' | 'error';
    }>;
  } | null;
}

export interface CreateQuestPayload {
  goal: string;
  difficulty?: QuestDifficulty;
  status?: QuestStatus;
  area?: string;
  topics?: string[];
}

export type UpdateQuestPayload = Partial<CreateQuestPayload> & {
  verificationSummary?: string;
  verificationEvidence?: QuestTransitionResponse['verificationEvidence'];
};

export interface CompleteQuestPayload {
  verificationSummary?: string;
  verificationEvidence?: QuestTransitionResponse['verificationEvidence'];
}

export interface MessageResponse {
  msg: string;
}

export const quests = {
  list: (filters?: Record<string, string>) => {
    const params = new URLSearchParams({
      ...(filters || {}),
      withMeta: '1',
    });
    return apiRequest<QuestListResponse>(`quests?${params.toString()}`);
  },
  get: (id: string) => apiRequest<{ quest: Quest }>(`quests/${id}`),
  create: (data: CreateQuestPayload) =>
    apiRequest<QuestMutationResponse>('quests', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: UpdateQuestPayload) =>
    apiRequest<QuestTransitionResponse>(`quests/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  complete: (id: string, data?: CompleteQuestPayload) =>
    apiRequest<QuestTransitionResponse>(`quests/${id}/complete`, {
      method: 'PUT',
      body: JSON.stringify(data || {}),
    }),
  delete: (id: string) =>
    apiRequest<MessageResponse>(`quests/${id}`, { method: 'DELETE' }),
};
