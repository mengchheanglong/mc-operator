"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  ReactFlow,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import Link from "next/link";
import { Network, Copy } from "lucide-react";
import { buildGraph } from "@/lib/graph/buildGraph";
import { buildPromptPackHref } from "@/lib/context-pack/href";
import type {
  GraphDocumentNode as GraphDocumentNodeType,
  KnowledgeDocument,
} from "@/types/document";
import GraphDocumentNode from "@/components/graph/GraphDocumentNode";

interface GraphViewProps {
  documents: KnowledgeDocument[];
  onOpenDocument: (documentId: string) => void;
  onBuildPromptPack: (documentId?: string) => void;
  focusedDocumentId?: string | null;
}

const nodeTypes: NodeTypes = {
  document: GraphDocumentNode,
};

function mergeNodePositions(
  nextNodes: GraphDocumentNodeType[],
  currentNodes: GraphDocumentNodeType[],
) {
  const positionsById = new Map(
    currentNodes.map((node) => [node.id, node.position]),
  );

  return nextNodes.map((node) => ({
    ...node,
    position: positionsById.get(node.id) || node.position,
  }));
}

function getConnectedNodeIds(edges: Edge[], selectedNodeId: string | null) {
  const connected = new Set<string>();

  if (!selectedNodeId) {
    return connected;
  }

  for (const edge of edges) {
    if (edge.source === selectedNodeId) {
      connected.add(edge.target);
    }

    if (edge.target === selectedNodeId) {
      connected.add(edge.source);
    }
  }

  return connected;
}

function decorateNodes(
  nodes: GraphDocumentNodeType[],
  edges: Edge[],
  activeNodeId: string | null,
) {
  const connectedNodeIds = getConnectedNodeIds(edges, activeNodeId);

  return nodes.map((node) => ({
    ...node,
    selected: node.id === activeNodeId,
    zIndex: node.id === activeNodeId ? 30 : connectedNodeIds.has(node.id) ? 20 : 1,
    data: {
      ...node.data,
      isActive: node.id === activeNodeId,
      isConnected: connectedNodeIds.has(node.id),
    },
  }));
}

function decorateEdges(edges: Edge[], activeNodeId: string | null) {
  return edges.map((edge) => {
    const isConnected =
      activeNodeId !== null &&
      (edge.source === activeNodeId || edge.target === activeNodeId);

    return {
      ...edge,
      animated: false,
      style: {
        stroke: isConnected
          ? "rgba(226, 229, 235, 0.9)"
          : "rgba(123, 128, 139, 0.24)",
        strokeWidth: isConnected ? 1.5 : 0.8,
        opacity: activeNodeId ? (isConnected ? 0.96 : 0.1) : 0.5,
      },
    };
  });
}

export default function GraphView({
  documents,
  onOpenDocument,
  onBuildPromptPack,
  focusedDocumentId = null,
}: GraphViewProps) {
  const hasAutoFitViewport = useRef(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [pinnedNodeId, setPinnedNodeId] = useState<string | null>(focusedDocumentId);
  const [flowInstance, setFlowInstance] =
    useState<ReactFlowInstance<Node, Edge> | null>(null);
  const graph = useMemo(() => buildGraph(documents), [documents]);
  const documentIdSet = useMemo(
    () => new Set(documents.map((document) => document.id)),
    [documents],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<GraphDocumentNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const effectiveHoveredNodeId =
    hoveredNodeId && documentIdSet.has(hoveredNodeId) ? hoveredNodeId : null;
  const effectivePinnedNodeId =
    focusedDocumentId && documentIdSet.has(focusedDocumentId)
      ? focusedDocumentId
      : pinnedNodeId && documentIdSet.has(pinnedNodeId)
        ? pinnedNodeId
        : null;
  const activeNodeId = effectiveHoveredNodeId || effectivePinnedNodeId;

  useEffect(() => {
    hasAutoFitViewport.current = false;
  }, [documents]);

  useEffect(() => {
    setNodes((currentNodes) =>
      decorateNodes(
        mergeNodePositions(graph.nodes, currentNodes),
        graph.edges,
        activeNodeId,
      ),
    );
    setEdges(decorateEdges(graph.edges, activeNodeId));
  }, [activeNodeId, graph, setEdges, setNodes]);

  useEffect(() => {
    if (!flowInstance || nodes.length === 0 || effectivePinnedNodeId || hasAutoFitViewport.current) {
      return;
    }

    window.requestAnimationFrame(() => {
      flowInstance.fitView({
        padding: 0.14,
        maxZoom: 1.85,
        duration: 0,
      });
      hasAutoFitViewport.current = true;
    });
  }, [effectivePinnedNodeId, flowInstance, nodes]);

  useEffect(() => {
    if (!flowInstance || !effectivePinnedNodeId || nodes.length === 0) {
      return;
    }

    const targetNode = nodes.find((node) => node.id === effectivePinnedNodeId);
    if (!targetNode) {
      return;
    }

    window.requestAnimationFrame(() => {
      flowInstance.setCenter(targetNode.position.x, targetNode.position.y, {
        zoom: 1.05,
        duration: 320,
      });
    });
  }, [effectivePinnedNodeId, flowInstance, nodes]);

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange as any}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        minZoom={0.05}
        maxZoom={4.5}
        panOnScroll={false}
        zoomOnScroll
        zoomOnPinch
        selectionOnDrag={false}
        className="knowledge-graph-flow"
        proOptions={{ hideAttribution: true }}
        onInit={setFlowInstance}
        onPaneClick={() => setPinnedNodeId(null)}
        onNodeMouseEnter={(_event, node) => {
          setHoveredNodeId(node.id);
        }}
        onNodeMouseLeave={() => {
          setHoveredNodeId(null);
        }}
        onNodeClick={(_event, node) => {
          setPinnedNodeId(node.id);
          onOpenDocument(node.id);
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={0.9}
          color="rgba(118, 121, 130, 0.12)"
        />
        <Controls showInteractive={false} position="bottom-right" />

        <Panel position="top-left">
          <div className="rounded-xl border border-border/80 bg-black/34 px-4 py-3 shadow-lg backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-bg-panel text-text-primary">
                <Network className="h-5 w-5" />
              </div>
              <div>
                <p className="matte-panel-heading">Knowledge Graph</p>
                <p className="matte-panel-copy">
                  {documents.length} notes | {edges.length} wiki links
                </p>
                <p className="mt-1 text-[11px] text-text-muted">
                  Hover to trace a cluster. Click to open the note.
                </p>
                  <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onBuildPromptPack(effectivePinnedNodeId || undefined)}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-text-primary transition hover:text-white"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {effectivePinnedNodeId ? "Build node pack" : "Build Prompt Pack"}
                  </button>
                  <Link
                    href={buildPromptPackHref("workspace")}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-text-secondary transition hover:text-white"
                  >
                    Workspace pack
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
