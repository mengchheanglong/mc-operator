"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  type NodeTypes,
} from "@xyflow/react";
import Link from "next/link";
import { ExternalLink, Network, Copy, Pin, MousePointer2 } from "lucide-react";
import { buildGraph } from "@/lib/graph/buildGraph";
import { buildPromptPackHref } from "@/lib/context-pack/href";
import type {
  GraphDocumentNode as GraphDocumentNodeType,
  KnowledgeGraphEntity,
  KnowledgeGraphModel,
} from "@/types/document";
import GraphDocumentNode from "@/components/graph/GraphDocumentNode";

export interface GraphNodeLink {
  id: string;
  label: string;
  href: string;
  external?: boolean;
}

interface GraphViewProps {
  model: KnowledgeGraphModel;
  resolveNodeLinks: (node: KnowledgeGraphEntity) => GraphNodeLink[];
  onBuildPromptPack: (documentId?: string) => void;
  focusedDocumentId?: string | null;
}

const nodeTypes: NodeTypes = {
  document: GraphDocumentNode,
};

const GRAPH_CENTER_OFFSET_X = 140;

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
    const relationKind = String(edge.data?.kind || "reference");
    const baseOpacity =
      relationKind === "reference" ? 0.26 : relationKind === "topic" ? 0.46 : 0.58;

    return {
      ...edge,
      animated: false,
      style: {
        stroke:
          relationKind === "reference"
            ? isConnected
              ? "rgba(184, 188, 197, 0.8)"
              : "rgba(110, 114, 123, 0.2)"
            : relationKind === "topic"
              ? isConnected
                ? "rgba(219, 196, 143, 0.92)"
                : "rgba(167, 145, 92, 0.34)"
              : isConnected
                ? "rgba(226, 229, 235, 0.9)"
                : "rgba(145, 150, 160, 0.28)",
        strokeWidth:
          isConnected ? (relationKind === "project" ? 1.8 : 1.4) : relationKind === "reference" ? 0.8 : 1,
        opacity: activeNodeId ? (isConnected ? 0.98 : baseOpacity * 0.36) : baseOpacity,
      },
    };
  });
}

function buildFallbackSummary(entity: KnowledgeGraphEntity | null) {
  if (!entity) {
    return "Hover a node for a quick preview. Click a node to pin it while you inspect the map.";
  }

  if (entity.metadata?.summary) {
    return entity.metadata.summary;
  }

  if (entity.kind === "project") {
    const topicCount = entity.metadata?.topicCount ?? 0;
    const documentCount = entity.metadata?.documentCount ?? 0;
    const workspaceProjectCount = entity.metadata?.workspaceProjectCount ?? 0;
    const baseSummary = workspaceProjectCount > 0
      ? `${topicCount} topics, ${documentCount} docs, and ${workspaceProjectCount} workspace projects in the current map.`
      : `${topicCount} topics and ${documentCount} docs in the current project map.`;
    return entity.metadata?.graphHealthSummary
      ? `${baseSummary} ${entity.metadata.graphHealthSummary}`
      : baseSummary;
  }

  if (entity.kind === "workspace-project") {
    return (
      entity.metadata?.summary ||
      `${entity.metadata?.relativePath || entity.title} is available as another workspace project.`
    );
  }

  if (entity.kind === "topic") {
    const documentCount = entity.metadata?.documentCount ?? 0;
    const questCount = entity.metadata?.questCount ?? 0;
    const reportCount = entity.metadata?.reportCount ?? 0;
    return `${documentCount} docs, ${questCount} quests, and ${reportCount} reports currently map into this topic.`;
  }

  if (entity.metadata?.isHubDoc) {
    return `${entity.metadata?.graphHealthSummary || "High-connectivity doc."} This document behaves like a map or hub for related knowledge.`;
  }

  if (entity.metadata?.isBridgeDoc) {
    return `${entity.metadata?.graphHealthSummary || "Bridge doc."} This document connects parts of the graph that would otherwise drift apart.`;
  }

  if (entity.metadata?.isOrphanDoc) {
    return `${entity.metadata?.graphHealthSummary || "Orphan doc."} This document is currently isolated and may need linking or a better home.`;
  }

  const tags = entity.metadata?.tags ?? [];
  if (tags.length > 0) {
    return `Tagged ${tags.join(", ")}.`;
  }

  return "Document node in the project map.";
}

function buildWhereFoundRows(entity: KnowledgeGraphEntity | null) {
  if (!entity) {
    return [];
  }

  if (entity.kind === "project") {
    return [
      {
        label: "Topics",
        value: String(entity.metadata?.topicCount ?? 0),
        detail: "Stable map categories under this project",
      },
      {
        label: "Docs",
        value: String(entity.metadata?.documentCount ?? 0),
        detail: "Document nodes connected to the project",
      },
      {
        label: "Activity",
        value: String(entity.metadata?.activityCount ?? 0),
        detail: "Tracked quests, reports, and workflows",
      },
      {
        label: "Projects",
        value: String(entity.metadata?.workspaceProjectCount ?? 0),
        detail: "Other workspace repos linked into the control-plane map",
      },
      {
        label: "Health",
        value: `${entity.metadata?.hubCount ?? 0}/${entity.metadata?.bridgeCount ?? 0}/${entity.metadata?.orphanCount ?? 0}`,
        detail: "Hub docs / bridge docs / orphan docs",
      },
    ];
  }

  if (entity.kind === "workspace-project") {
    return [
      {
        label: "Path",
        value: entity.metadata?.relativePath || "Unknown",
        detail: "Workspace-relative project path",
      },
      {
        label: "Category",
        value: String(entity.metadata?.category || "projects"),
        detail: "Where this repo or tool lives in the workspace layout",
      },
      {
        label: "Setup",
        value:
          entity.metadata?.hasGit && entity.metadata?.hasPackageJson
            ? "git + package"
            : entity.metadata?.hasGit
              ? "git"
              : entity.metadata?.hasPackageJson
                ? "package"
                : "basic",
        detail: "Quick signal for repo/tooling readiness",
      },
    ];
  }

  if (entity.kind === "topic") {
    return [
      {
        label: "Docs",
        value: String(entity.metadata?.documentCount ?? 0),
        detail:
          entity.metadata?.docTitles?.slice(0, 2).join(", ") || "No tagged docs yet",
      },
      {
        label: "Quests",
        value: String(entity.metadata?.questCount ?? 0),
        detail:
          entity.metadata?.questTitles?.slice(0, 2).join(", ") || "No quest matches yet",
      },
      {
        label: "Reports",
        value: String(entity.metadata?.reportCount ?? 0),
        detail:
          entity.metadata?.reportTitles?.slice(0, 2).join(", ") || "No report matches yet",
      },
      {
        label: "Workflows",
        value: String(entity.metadata?.workflowCount ?? 0),
        detail:
          entity.metadata?.workflowTitles?.slice(0, 2).join(", ") || "No workflow tags yet",
      },
    ];
  }

  return [
    {
      label: "Tags",
      value: String(entity.metadata?.tags?.length ?? 0),
      detail:
        entity.metadata?.tags?.slice(0, 3).join(", ") || "No tags assigned",
    },
    {
      label: "Links",
      value: String(entity.links.length),
      detail:
        entity.links.slice(0, 2).join(", ") || "No explicit doc links",
    },
    {
      label: "Updated",
      value: entity.metadata?.date ? new Date(entity.metadata.date).toLocaleDateString() : "Unknown",
      detail: "Most recent document timestamp",
    },
    {
      label: "Role",
      value: entity.metadata?.isHubDoc
        ? "hub"
        : entity.metadata?.isBridgeDoc
          ? "bridge"
          : entity.metadata?.isOrphanDoc
            ? "orphan"
            : "normal",
      detail:
        entity.metadata?.graphHealthSummary ||
        "Graph role inferred from document links and structure.",
    },
  ];
}

function InspectorLink({
  link,
}: {
  link: GraphNodeLink;
}) {
  if (link.external) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold text-text-primary transition hover:border-text-muted hover:text-white"
      >
        {link.label}
        <ExternalLink className="h-3 w-3" />
      </a>
    );
  }

  return (
    <Link
      href={link.href}
      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold text-text-primary transition hover:border-text-muted hover:text-white"
    >
      {link.label}
    </Link>
  );
}

export default function GraphView({
  model,
  resolveNodeLinks,
  onBuildPromptPack,
  focusedDocumentId = null,
}: GraphViewProps) {
  const hasAutoFitViewport = useRef(false);
  const graphContainerRef = useRef<HTMLDivElement | null>(null);
  const graphResizeFrameRef = useRef<number | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [pinnedNodeId, setPinnedNodeId] = useState<string | null>(focusedDocumentId);
  const [flowInstance, setFlowInstance] =
    useState<ReactFlowInstance<GraphDocumentNodeType, Edge> | null>(null);
  const graph = useMemo(() => buildGraph(model), [model]);
  const entityById = useMemo(
    () => new Map(model.entities.map((entity) => [entity.id, entity])),
    [model.entities],
  );
  const nodeIdSet = useMemo(
    () => new Set(model.entities.map((entity) => entity.id)),
    [model.entities],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<GraphDocumentNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const defaultCenterNodeId = useMemo(() => {
    const projectNode = model.entities.find((entity) => entity.kind === "project");
    return projectNode?.id || model.entities[0]?.id || null;
  }, [model.entities]);
  const graphProjectKey = useMemo(() => {
    const projectNode = model.entities.find((entity) => entity.kind === "project");
    return projectNode?.title || defaultCenterNodeId || "graph";
  }, [defaultCenterNodeId, model.entities]);

  const effectiveHoveredNodeId =
    hoveredNodeId && nodeIdSet.has(hoveredNodeId) ? hoveredNodeId : null;
  const effectivePinnedNodeId =
    focusedDocumentId && nodeIdSet.has(focusedDocumentId)
      ? focusedDocumentId
      : pinnedNodeId && nodeIdSet.has(pinnedNodeId)
        ? pinnedNodeId
        : null;
  const activeNodeId = effectiveHoveredNodeId || effectivePinnedNodeId;
  const activeEntity =
    activeNodeId && entityById.has(activeNodeId)
      ? entityById.get(activeNodeId) ?? null
      : null;
  const activeLinks = activeEntity ? resolveNodeLinks(activeEntity) : [];
  const whereFoundRows = buildWhereFoundRows(activeEntity);
  const inspectorMode = effectiveHoveredNodeId
    ? effectivePinnedNodeId === effectiveHoveredNodeId
      ? "Pinned"
      : "Hover preview"
    : effectivePinnedNodeId
      ? "Pinned"
      : "Overview";

  const applyDefaultViewport = useCallback(
    (duration = 0) => {
      if (!flowInstance || nodes.length === 0 || !graphContainerRef.current) {
        return;
      }

      flowInstance.fitView({
        padding: 0.16,
        maxZoom: 1.8,
        duration: 0,
      });

      const targetNodeId = defaultCenterNodeId;
      if (!targetNodeId) {
        return;
      }

      const targetNode = nodes.find((node) => node.id === targetNodeId);
      if (!targetNode) {
        return;
      }

      const targetZoom = Math.min(flowInstance.getZoom() || 0.94, 0.94);
      flowInstance.setCenter(targetNode.position.x, targetNode.position.y, {
        zoom: targetZoom,
        duration,
      });

      const containerWidth = graphContainerRef.current.getBoundingClientRect().width;
      const viewport = flowInstance.getViewport();
      flowInstance.setViewport(
        {
          x: containerWidth / 2 - GRAPH_CENTER_OFFSET_X - targetNode.position.x * viewport.zoom,
          y: viewport.y,
          zoom: viewport.zoom,
        },
        { duration },
      );
    },
    [defaultCenterNodeId, flowInstance, nodes],
  );

  useEffect(() => {
    hasAutoFitViewport.current = false;
  }, [graphProjectKey]);

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
      applyDefaultViewport(0);
      hasAutoFitViewport.current = true;
    });
  }, [applyDefaultViewport, effectivePinnedNodeId, flowInstance, nodes.length]);

  useEffect(() => {
    return () => {
      if (graphResizeFrameRef.current) {
        window.cancelAnimationFrame(graphResizeFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!flowInstance || nodes.length === 0 || !graphContainerRef.current) {
      return;
    }

    let timeoutId = 0;
    const container = graphContainerRef.current;

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries[0] || effectivePinnedNodeId || !hasAutoFitViewport.current) {
        return;
      }

      if (graphResizeFrameRef.current) {
        window.cancelAnimationFrame(graphResizeFrameRef.current);
      }

      graphResizeFrameRef.current = window.requestAnimationFrame(() => {
        const targetNodeId = defaultCenterNodeId;
        if (!targetNodeId) {
          return;
        }

        const targetNode = nodes.find((node) => node.id === targetNodeId);
        if (!targetNode) {
          return;
        }

        const viewport = flowInstance.getViewport();
        flowInstance.setViewport({
          x:
            entries[0].contentRect.width / 2 -
            GRAPH_CENTER_OFFSET_X -
            targetNode.position.x * viewport.zoom,
          y: viewport.y,
          zoom: viewport.zoom,
        });
      });
    });

    resizeObserver.observe(container);

    const recenterForWindow = () => {
      if (effectivePinnedNodeId) {
        return;
      }

      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }

      timeoutId = window.setTimeout(() => {
        applyDefaultViewport(0);
      }, 80);
    };

    window.addEventListener("resize", recenterForWindow);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", recenterForWindow);
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      if (graphResizeFrameRef.current) {
        window.cancelAnimationFrame(graphResizeFrameRef.current);
      }
    };
  }, [applyDefaultViewport, defaultCenterNodeId, effectivePinnedNodeId, flowInstance, nodes]);

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
        zoom: activeEntity?.kind === "document" ? 1.05 : 1,
        duration: 320,
      });
    });
  }, [activeEntity?.kind, effectivePinnedNodeId, flowInstance, nodes]);

  return (
    <div ref={graphContainerRef} className="h-full w-full">
      <ReactFlow<GraphDocumentNodeType, Edge>
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
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
          setPinnedNodeId((current) => (current === node.id ? null : node.id));
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
                <p className="matte-panel-heading">Project Map</p>
                <p className="matte-panel-copy">
                  {model.entities.length} nodes | {edges.length} connections
                </p>
                <p className="mt-1 text-[11px] text-text-muted">
                  Hover for preview. Click to pin a node and inspect its links.
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      onBuildPromptPack(activeEntity?.kind === "document" ? activeEntity.id : undefined)
                    }
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-text-primary transition hover:text-white"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {activeEntity?.kind === "document" ? "Generate cluster task" : "Generate Task"}
                  </button>
                  <Link
                    href={buildPromptPackHref("workspace")}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-text-secondary transition hover:text-white"
                  >
                    Task recipes
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </Panel>

        <Panel position="top-right">
          <div className="w-[320px] rounded-xl border border-border/80 bg-black/34 px-4 py-3 shadow-lg backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="matte-panel-heading">
                  {activeEntity ? activeEntity.title : "Node Inspector"}
                </p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.28em] text-text-muted">
                  {activeEntity ? `${inspectorMode} - ${activeEntity.kind}` : inspectorMode}
                </p>
              </div>
              {effectivePinnedNodeId ? (
                <button
                  type="button"
                  onClick={() => setPinnedNodeId(null)}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-text-secondary transition hover:text-white"
                >
                  <Pin className="h-3 w-3" />
                  Clear pin
                </button>
              ) : (
                <div className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-text-secondary">
                  <MousePointer2 className="h-3 w-3" />
                  Live preview
                </div>
              )}
            </div>

            <p className="mt-3 text-sm leading-relaxed text-text-secondary">
              {buildFallbackSummary(activeEntity)}
            </p>

            {activeEntity?.kind === "document" ? (
              <p className="mt-3 text-xs leading-relaxed text-text-muted">
                Cluster task uses the pinned note, its direct neighbors, second-hop notes, and unresolved links to build a Codex-ready local graph brief.
              </p>
            ) : null}

            {whereFoundRows.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-text-muted">
                  Where Found
                </p>
                <div className="space-y-2">
                  {whereFoundRows.map((row) => (
                    <div
                      key={row.label}
                      className="rounded-lg border border-border/70 bg-bg-panel/35 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                          {row.label}
                        </span>
                        <span className="text-xs font-semibold text-text-primary">
                          {row.value}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                        {row.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeLinks.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-text-muted">
                  Open
                </p>
                <div className="flex flex-wrap gap-2">
                  {activeLinks.map((link) => (
                    <InspectorLink key={link.id} link={link} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
