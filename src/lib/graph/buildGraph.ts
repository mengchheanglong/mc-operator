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
import type {
  GraphBuildResult,
  GraphDocumentNode,
  KnowledgeGraphEntity,
  KnowledgeGraphModel,
  KnowledgeGraphRelation,
} from "@/types/document";

interface LayoutNode extends SimulationNodeDatum {
  id: string;
  kind: KnowledgeGraphEntity["kind"];
  degree: number;
  layoutRadius: number;
  visualRadius: number;
  fx?: number;
  fy?: number;
}

interface LayoutLink extends SimulationLinkDatum<LayoutNode> {
  source: string | LayoutNode;
  target: string | LayoutNode;
  kind: KnowledgeGraphRelation["kind"];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatGraphLabel(title: string, kind: KnowledgeGraphEntity["kind"]) {
  const cleaned = title.trim();
  const maxLength =
    kind === "project"
      ? 24
      : kind === "workspace-project"
        ? 20
        : kind === "topic"
          ? 18
          : 16;

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  const words = cleaned.split(/\s+/);
  if (words.length > 1) {
    const fitted: string[] = [];
    let current = "";

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= maxLength) {
        current = candidate;
        continue;
      }

      if (current) {
        fitted.push(current);
        current = word;
      } else {
        fitted.push(word.slice(0, maxLength - 1).trim());
        current = "";
      }

      if (fitted.length >= 2) {
        break;
      }
    }

    if (current && fitted.length < 2) {
      fitted.push(current);
    }

    const joined = fitted.join("\n").trim();
    if (joined) {
      return joined.length >= cleaned.length ? joined : `${joined}...`;
    }
  }

  return `${cleaned.slice(0, maxLength - 1).trim()}...`;
}

function getLabelMetrics(kind: KnowledgeGraphEntity["kind"], title: string) {
  const displayTitle = formatGraphLabel(title, kind);
  const lines = displayTitle.split("\n");
  const widestLine = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const widthFactor =
    kind === "project"
      ? 6.4
      : kind === "workspace-project"
        ? 6
        : kind === "topic"
          ? 5.8
          : 5.2;
  const width = clamp(18 + widestLine * widthFactor, 56, kind === "project" ? 168 : 136);
  const lineHeight = kind === "project" ? 15 : 13;
  const height = lines.length * lineHeight;

  return {
    displayTitle,
    lines,
    width,
    height,
  };
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

function buildEdgeId(source: string, target: string, relation = "related") {
  return `${source}::${target}::${relation}`;
}

function getNodeRadius(kind: KnowledgeGraphEntity["kind"], degree: number) {
  if (kind === "project") {
    return 7.4;
  }

  if (kind === "workspace-project") {
    return Math.max(5.2, Math.min(7.2, 5.8 + degree * 0.16));
  }

  if (kind === "topic") {
    return Math.max(5.4, Math.min(8.8, 6.2 + degree * 0.22));
  }

  return Math.max(2.8, Math.min(5.4, 3 + degree * 0.34));
}

function getLayoutRadius(kind: KnowledgeGraphEntity["kind"], title: string, degree: number) {
  const metrics = getLabelMetrics(kind, title);
  const labelWidth = metrics.width;
  const labelHeight = metrics.height;

  if (kind === "project") {
    return clamp(26 + labelWidth * 0.22 + labelHeight * 0.24, 36, 62);
  }

  if (kind === "workspace-project") {
    return clamp(18 + labelWidth * 0.22 + labelHeight * 0.22 + degree * 0.42, 28, 56);
  }

  if (kind === "topic") {
    return clamp(18 + labelWidth * 0.24 + labelHeight * 0.26 + degree * 0.54, 28, 54);
  }

  return clamp(14 + labelWidth * 0.22 + labelHeight * 0.24 + degree * 0.68, 24, 44);
}

function getRadialDistance(kind: KnowledgeGraphEntity["kind"], degree: number) {
  if (kind === "project") {
    return 0;
  }

  if (kind === "workspace-project") {
    return Math.max(108, 138 - degree * 1.6);
  }

  if (kind === "topic") {
    return Math.max(82, 108 - degree * 2.2);
  }

  return Math.max(132, 176 - degree * 3.1);
}

function getKindOrder(kind: KnowledgeGraphEntity["kind"]) {
  if (kind === "project") {
    return 0;
  }

  if (kind === "workspace-project") {
    return 1;
  }

  if (kind === "topic") {
    return 2;
  }

  return 3;
}

export function buildGraph(model: KnowledgeGraphModel): GraphBuildResult {
  const entityMap = new Map(model.entities.map((entity) => [entity.id, entity]));
  const orderedEntities = [...model.entities].sort((left, right) => {
    const kindOrder = getKindOrder(left.kind) - getKindOrder(right.kind);
    if (kindOrder !== 0) {
      return kindOrder;
    }

    return left.title.localeCompare(right.title);
  });
  const positions = createSeedPositions(orderedEntities.length);
  const incomingCounts = new Map<string, number>();
  const outgoingCounts = new Map<string, number>();
  const edges: Edge[] = [];
  const seenEdges = new Set<string>();

  for (const entity of orderedEntities) {
    incomingCounts.set(entity.id, 0);
    outgoingCounts.set(entity.id, 0);
  }

  for (const relation of model.relations) {
    const source = entityMap.get(relation.source);
    const target = entityMap.get(relation.target);
    if (!source || !target || source.id === target.id) {
      continue;
    }

    const edgeId = buildEdgeId(source.id, target.id, relation.kind);
    if (seenEdges.has(edgeId)) {
      continue;
    }

    seenEdges.add(edgeId);
    outgoingCounts.set(source.id, (outgoingCounts.get(source.id) || 0) + 1);
    incomingCounts.set(target.id, (incomingCounts.get(target.id) || 0) + 1);

    edges.push({
      id: edgeId,
      source: source.id,
      target: target.id,
      type: "straight",
      data: {
        kind: relation.kind,
      },
    });
  }

  const layoutNodes: LayoutNode[] = orderedEntities.map((entity, index) => {
    const degree =
      (incomingCounts.get(entity.id) || 0) + (outgoingCounts.get(entity.id) || 0);
    const kind = entity.kind;

    return {
      id: entity.id,
      kind,
      degree,
      visualRadius: getNodeRadius(kind, degree),
      layoutRadius: getLayoutRadius(kind, entity.title, degree),
      x: kind === "project" ? 0 : positions[index]?.x ?? 0,
      y: kind === "project" ? 0 : positions[index]?.y ?? 0,
      fx: kind === "project" ? 0 : undefined,
      fy: kind === "project" ? 0 : undefined,
    };
  });

  const layoutLinks: LayoutLink[] = edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    kind: String(edge.data?.kind || "reference") as KnowledgeGraphRelation["kind"],
  }));

  const simulation = forceSimulation(layoutNodes)
    .force(
      "charge",
      forceManyBody<LayoutNode>().strength((node) => {
        if (node.kind === "project") {
          return -22;
        }

        if (node.kind === "workspace-project") {
          return -86 - node.degree * 4;
        }

        if (node.kind === "topic") {
          return -104 - node.degree * 5;
        }

        return -52 - node.degree * 6;
      }),
    )
    .force(
      "link",
      forceLink<LayoutNode, LayoutLink>(layoutLinks)
        .id((node) => node.id)
        .distance((link) => {
          if (link.kind === "project") {
            const targetKind =
              typeof link.target === "string" ? null : link.target.kind;
            return targetKind === "workspace-project" ? 104 : 86;
          }

          if (link.kind === "topic") {
            return 66;
          }

          return 54;
        })
        .strength((link) => {
          if (link.kind === "project") {
            return 0.82;
          }

          if (link.kind === "topic") {
            return 0.56;
          }

          return 0.24;
        }),
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
        (node) => getRadialDistance(node.kind, node.degree),
        0,
        0,
      ).strength((node) =>
        node.kind === "project"
          ? 1
          : node.kind === "workspace-project"
            ? 0.18
            : node.kind === "topic"
              ? 0.14
              : 0.1,
      ),
    );

  for (let index = 0; index < 420; index += 1) {
    simulation.tick();
  }

  simulation.stop();

  const nodes: GraphDocumentNode[] = orderedEntities.map((entity, index) => {
    const labelMetrics = getLabelMetrics(entity.kind, entity.title);

    return {
      id: entity.id,
      type: "document",
      position: {
        x: layoutNodes[index]?.x ?? positions[index]?.x ?? 0,
        y: layoutNodes[index]?.y ?? positions[index]?.y ?? 0,
      },
      draggable: true,
      data: {
        title: entity.title,
        displayTitle: labelMetrics.displayTitle,
        kind: entity.kind,
        linkCount: entity.links.length,
        incomingCount: incomingCounts.get(entity.id) || 0,
        outgoingCount: outgoingCounts.get(entity.id) || 0,
        degree:
          (incomingCounts.get(entity.id) || 0) + (outgoingCounts.get(entity.id) || 0),
        radius: layoutNodes[index]?.visualRadius ?? getNodeRadius(entity.kind, 0),
        isActive: false,
        isConnected: false,
      },
    };
  });

  return {
    nodes,
    edges,
  };
}
