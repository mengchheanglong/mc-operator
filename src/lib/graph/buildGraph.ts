import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type { Edge, XYPosition } from "@xyflow/react";
import { normalizeDocumentTitle } from "@/lib/parser/extractLinks";
import type {
  GraphBuildResult,
  GraphDocumentNode,
  KnowledgeDocument,
} from "@/types/document";

interface LayoutNode extends SimulationNodeDatum {
  id: string;
  degree: number;
  layoutRadius: number;
  visualRadius: number;
}

interface LayoutLink extends SimulationLinkDatum<LayoutNode> {
  source: string | LayoutNode;
  target: string | LayoutNode;
}

function createSeedPositions(count: number): XYPosition[] {
  if (count <= 0) {
    return [];
  }

  if (count === 1) {
    return [{ x: 0, y: 0 }];
  }

  const radius = Math.max(88, Math.ceil(count / 8) * 46);

  return Array.from({ length: count }, (_, index) => {
    const angle = index * 2.399963229728653;
    const ringRadius = radius * Math.sqrt((index + 1) / count);

    return {
      x: Math.cos(angle) * ringRadius,
      y: Math.sin(angle) * ringRadius,
    };
  });
}

function buildEdgeId(source: string, target: string) {
  return `${source}::${target}`;
}

function getNodeRadius(degree: number) {
  return Math.max(2.8, Math.min(5.8, 3 + degree * 0.38));
}

function getLayoutRadius(title: string, degree: number) {
  const labelWidth = Math.max(22, title.length * 4.3 + 6);
  return Math.max(14, Math.min(36, 9 + labelWidth * 0.28 + degree * 0.75));
}

export function buildGraph(documents: KnowledgeDocument[]): GraphBuildResult {
  const orderedDocuments = [...documents].sort((left, right) =>
    left.title.localeCompare(right.title),
  );

  const positions = createSeedPositions(orderedDocuments.length);
  const documentsByTitle = new Map(
    orderedDocuments.map((document) => [
      normalizeDocumentTitle(document.title),
      document,
    ]),
  );

  const incomingCounts = new Map<string, number>();
  const outgoingCounts = new Map<string, number>();
  const edges: Edge[] = [];
  const seenEdges = new Set<string>();

  for (const document of orderedDocuments) {
    incomingCounts.set(document.id, 0);
    outgoingCounts.set(document.id, 0);
  }

  for (const document of orderedDocuments) {
    for (const link of document.links) {
      const target = documentsByTitle.get(normalizeDocumentTitle(link));
      if (!target || target.id === document.id) {
        continue;
      }

      const edgeId = buildEdgeId(document.id, target.id);
      if (seenEdges.has(edgeId)) {
        continue;
      }

      seenEdges.add(edgeId);
      outgoingCounts.set(document.id, (outgoingCounts.get(document.id) || 0) + 1);
      incomingCounts.set(target.id, (incomingCounts.get(target.id) || 0) + 1);

      edges.push({
        id: edgeId,
        source: document.id,
        target: target.id,
        type: "straight",
      });
    }
  }

  const layoutNodes: LayoutNode[] = orderedDocuments.map((document, index) => {
    const degree =
      (incomingCounts.get(document.id) || 0) + (outgoingCounts.get(document.id) || 0);

    return {
      id: document.id,
      degree,
      visualRadius: getNodeRadius(degree),
      layoutRadius: getLayoutRadius(document.title, degree),
      x: positions[index]?.x ?? 0,
      y: positions[index]?.y ?? 0,
    };
  });

  const layoutLinks: LayoutLink[] = edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
  }));

  const simulation = forceSimulation(layoutNodes)
    .force(
      "charge",
      forceManyBody<LayoutNode>().strength((node) => -31 - node.degree * 7),
    )
    .force(
      "link",
      forceLink<LayoutNode, LayoutLink>(layoutLinks)
        .id((node) => node.id)
        .distance((link) => {
          const source =
            typeof link.source === "string" ? null : (link.source as LayoutNode);
          const target =
            typeof link.target === "string" ? null : (link.target as LayoutNode);
          const sourceDegree = source?.degree ?? 0;
          const targetDegree = target?.degree ?? 0;

          return Math.max(28, 46 - Math.min(sourceDegree + targetDegree, 8) * 1.05);
        })
        .strength(0.4),
    )
    .force("center", forceCenter(0, 0))
    .force(
      "collide",
      forceCollide<LayoutNode>()
        .radius((node) => node.layoutRadius)
        .iterations(2),
    )
    .force(
      "radial",
      forceRadial<LayoutNode>(
        (node) => (node.degree === 0 ? 108 : Math.max(22, 66 - node.degree * 4)),
        0,
        0,
      ).strength(0.022),
    );

  for (let index = 0; index < 280; index += 1) {
    simulation.tick();
  }

  simulation.stop();

  const nodes: GraphDocumentNode[] = orderedDocuments.map((document, index) => ({
    id: document.id,
    type: "document",
    position: {
      x: layoutNodes[index]?.x ?? positions[index]?.x ?? 0,
      y: layoutNodes[index]?.y ?? positions[index]?.y ?? 0,
    },
    draggable: true,
    data: {
      title: document.title,
      linkCount: document.links.length,
      incomingCount: incomingCounts.get(document.id) || 0,
      outgoingCount: outgoingCounts.get(document.id) || 0,
      degree:
        (incomingCounts.get(document.id) || 0) + (outgoingCounts.get(document.id) || 0),
      radius: layoutNodes[index]?.visualRadius ?? getNodeRadius(0),
      isActive: false,
      isConnected: false,
    },
  }));

  return {
    nodes,
    edges,
  };
}
