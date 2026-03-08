import type { Edge, Node } from "@xyflow/react";

export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  links: string[];
}

export interface StoredDocument extends KnowledgeDocument {
  fileType: string;
  createdAt: string;
  updatedAt: string;
}

export type GraphDocumentNodeData = Record<string, unknown> & {
  title: string;
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
