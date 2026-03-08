export type ContextFocusType =
  | "workspace"
  | "quest_focus"
  | "doc_focus"
  | "graph_focus";

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

export interface RepoCodeIntelToolView {
  language: string;
  server: string;
  status: "ready" | "partial" | "missing";
  source: "auto" | "override";
  configSignals: string[];
  runtimeSignals: string[];
  detail: string;
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
}

export interface WorkspaceProjectView {
  id: string;
  name: string;
  relativePath: string;
  category: "root" | "projects" | "archive";
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

export interface ContextPack {
  timestamp: string;
  project: WorkspaceProjectView;
  scope: {
    type: ContextFocusType;
    label: string;
    id?: string;
  };
  objective: string;
  suggestedAction: string;
  successCriteria: string[];
  recentActivity: Array<{ action: string; title: string; date: string }>;
  activeQuests: ContextSource[];
  relevantDocs: ContextSource[];
  relatedNotes: ContextSource[];
  repoSnapshot: RepoSnapshotView;
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
