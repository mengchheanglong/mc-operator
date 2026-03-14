export type ContextFocusType =
  | "workspace"
  | "quest_focus"
  | "doc_focus"
  | "graph_focus";

export type ContextTier = "summary" | "overview" | "full";

export interface ContextSource {
  id: string;
  type: "doc" | "quest" | "graph_cluster" | "dashboard" | "report" | "note";
  title: string;
  content?: string;
  excerpt?: string;
  href?: string;
  metadata?: {
    difficulty?: string;
    date?: string;
    updatedAt?: string;
    tags?: string[];
    relation?: "focus" | "incoming_link" | "outgoing_link" | "related";
    status?: string;
    source?: string;
    provenance?: string[];
  };
}

export interface ContextFileReference {
  label: string;
  path: string;
  purpose: string;
}

export interface RepoFileReference {
  label: string;
  path: string;
  detail: string;
}

export interface RepoScriptReference {
  name: string;
  command: string;
}

export interface RepoVerificationPresetView {
  kind: "lint" | "typecheck" | "test" | "build" | "dev" | "custom";
  label: string;
  command: string;
}

export interface GitFileChangeView {
  path: string;
  status: string;
}

export interface GitCommitSummaryView {
  hash: string;
  subject: string;
  date: string;
}

export interface GitSnapshotView {
  available: boolean;
  branch: string | null;
  summary: string;
  isDirty: boolean;
  changedFiles: GitFileChangeView[];
  stagedCount: number;
  modifiedCount: number;
  untrackedCount: number;
  recentCommits: GitCommitSummaryView[];
  aheadCount: number;
  behindCount: number;
}

export interface RepoHotspotView {
  path: string;
  reason: string;
}

export interface AutomationWorkflowView {
  id: string;
  name: string;
  active: boolean;
  updatedAt?: string;
  tags: string[];
}

export interface AutomationSnapshotView {
  provider: "n8n";
  status: "missing" | "configured" | "connected" | "error";
  summary: string;
  baseUrl: string | null;
  webhookBaseUrl: string | null;
  hasApiKey: boolean;
  healthcheckOk: boolean;
  workflowApiOk: boolean;
  activeWorkflowCount: number | null;
  workflows: AutomationWorkflowView[];
  suggestions: string[];
  error: string | null;
  missionControl: {
    baseUrl: string | null;
    sessionBriefUrl: string;
    reportUrl: string;
    statusUrl: string;
    tokenHeader: string;
    projectId: string;
  };
}

export interface RepoCodeIntelToolView {
  language: string;
  server: string;
  status: "ready" | "partial" | "missing";
  source: "auto" | "override";
  configSignals: string[];
  runtimeSignals: string[];
  detail: string;
}

export interface RepoCodeGraphContextCommandView {
  label: string;
  command: string;
}

export interface RepoCodeGraphContextSnapshotView {
  status: "missing" | "available" | "configured";
  source: "cli" | "local_repo" | "none";
  summary: string;
  localRepoPath: string | null;
  projectConfigPath: string | null;
  installHint: string | null;
  notes: string[];
  suggestedCommands: RepoCodeGraphContextCommandView[];
  queryPresets: RepoCodeGraphContextCommandView[];
  supportedCapabilities: string[];
  indexed: boolean;
  indexedRepositoryCount: number | null;
  statsPreview: string[];
  lastError: string | null;
}

export interface RepoCodeIntelSnapshotView {
  overallStatus: "ready" | "partial" | "missing";
  summary: string;
  tools: RepoCodeIntelToolView[];
  suggestions: string[];
  notes: string[];
  overrideFilePath: string;
  hasOverrides: boolean;
  overrideError: string | null;
  codeGraphContext: RepoCodeGraphContextSnapshotView;
}

export interface WorkspaceProjectView {
  id: string;
    name: string;
    relativePath: string;
    category: "root" | "studyspace" | "projects" | "archive" | "tools";
  }

export interface RepoSnapshotView {
  project: WorkspaceProjectView;
  summary: string;
  stack: string[];
  scripts: RepoScriptReference[];
  verificationPresets: RepoVerificationPresetView[];
  dashboardSurfaces: string[];
  apiRoutes: string[];
  workspaceAreas: string[];
  keyFiles: RepoFileReference[];
  hotspots: RepoHotspotView[];
  codeIntel: RepoCodeIntelSnapshotView;
  git: GitSnapshotView;
}

export interface CollaborationGuideView {
  workflow: string[];
  updateRules: string[];
  nextInputs: string[];
}

export interface WorkspaceReadinessView {
  score: number;
  status: "seed" | "partial" | "ready";
  summary: string;
  checks: Array<{
    id: string;
    label: string;
    ready: boolean;
    detail: string;
    href: string;
  }>;
}

export interface GraphNeighbor {
  id: string;
  title: string;
  relation: "incoming" | "outgoing";
}

export interface ContextMemorySource {
  label: string;
  type: "doc" | "daily_report";
  reason: string;
  href?: string;
  path?: string;
}

export interface ContextMemoryBrief {
  summary: string;
  durableNotes: string[];
  recentHighlights: string[];
  sources: ContextMemorySource[];
}

export interface ContextDocGraphHealth {
  summary: string;
  hubDocs: string[];
  bridgeDocs: string[];
  orphanDocs: string[];
}

export interface ContextPromotionCandidate {
  id: string;
  kind: "topic" | "area" | "hub_doc";
  label: string;
  reason: string;
  suggestedDocTitle: string;
  sourceDays: string[];
}

export interface ContextPromotionSnapshot {
  summary: string;
  candidates: ContextPromotionCandidate[];
}

export interface ContextProvenanceItem {
  section: "docs" | "memory" | "activity" | "quests" | "context_files";
  label: string;
  reason: string;
  href?: string;
  path?: string;
}

export interface ContextPack {
  timestamp: string;
  tier: ContextTier;
  project: WorkspaceProjectView;
  scope: {
    type: ContextFocusType;
    label: string;
    id?: string;
  };
  objective: string;
  suggestedAction: string;
  successCriteria: string[];
  recentActivity: Array<{
    action: string;
    title: string;
    date: string;
    reason?: string;
  }>;
  activeQuests: ContextSource[];
  relevantDocs: ContextSource[];
  relatedNotes: ContextSource[];
  memoryBrief: ContextMemoryBrief;
  docGraphHealth: ContextDocGraphHealth;
  promotionCandidates: ContextPromotionSnapshot;
  provenance: ContextProvenanceItem[];
  repoSnapshot: RepoSnapshotView;
  automation: AutomationSnapshotView;
  collaborationGuide: CollaborationGuideView;
  readiness: WorkspaceReadinessView;
  handoff: {
    summary: string;
    nextStep: string;
    verificationCommands: string[];
    changedFiles: GitFileChangeView[];
    recentCommits: GitCommitSummaryView[];
  };
  graphContext?: {
    focalNode?: { id: string; title: string; tags: string[] };
    neighbors: GraphNeighbor[];
    unresolvedLinks: string[];
  };
  contextFiles: ContextFileReference[];
  suggestedPrompts: {
    codex: string;
  };
}
