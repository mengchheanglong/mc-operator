import type { Edge, Node } from "@xyflow/react";

export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  links: string[];
}

export type KnowledgeGraphEntityKind =
  | "project"
  | "workspace-project"
  | "topic"
  | "document";

export type KnowledgeGraphRelationKind = "project" | "topic" | "reference";

export interface KnowledgeGraphEntity {
  id: string;
  kind: KnowledgeGraphEntityKind;
  title: string;
  content: string;
  links: string[];
  metadata?: {
    summary?: string;
    tags?: string[];
    topicKey?: string;
    topicTag?: string;
    searchQuery?: string;
    documentCount?: number;
    topicCount?: number;
    questCount?: number;
    reportCount?: number;
    workflowCount?: number;
    workspaceProjectCount?: number;
    activityCount?: number;
    docTitles?: string[];
    questTitles?: string[];
    reportTitles?: string[];
    workflowTitles?: string[];
    relativePath?: string;
    category?: string;
    projectId?: string;
    hasGit?: boolean;
    hasPackageJson?: boolean;
    isControlPlane?: boolean;
    date?: string;
    graphHealthSummary?: string;
    hubCount?: number;
    bridgeCount?: number;
    orphanCount?: number;
    connectedComponentCount?: number;
    isHubDoc?: boolean;
    isBridgeDoc?: boolean;
    isOrphanDoc?: boolean;
  };
}

export interface KnowledgeGraphRelation {
  source: string;
  target: string;
  kind: KnowledgeGraphRelationKind;
}

export interface StoredDocument extends KnowledgeDocument {
  fileType: string;
  createdAt: string;
  updatedAt: string;
}

export type GraphDocumentNodeData = Record<string, unknown> & {
  title: string;
  displayTitle?: string;
  kind: KnowledgeGraphEntityKind;
  linkCount: number;
  incomingCount: number;
  outgoingCount: number;
  degree: number;
  radius: number;
  isActive: boolean;
  isConnected: boolean;
};

export type GraphDocumentNode = Node<GraphDocumentNodeData, "document">;

export interface GraphBuildResult {
  nodes: GraphDocumentNode[];
  edges: Edge[];
}

export interface KnowledgeGraphModel {
  entities: KnowledgeGraphEntity[];
  relations: KnowledgeGraphRelation[];
}
