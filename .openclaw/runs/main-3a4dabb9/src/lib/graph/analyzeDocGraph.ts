import { normalizeDocumentTitle } from "@/lib/parser/extractLinks";

export interface DocGraphAnalysisInput {
  id: string;
  title: string;
  links: string[];
  tags?: string[];
}

export interface DocGraphNodeMetrics {
  incomingCount: number;
  outgoingCount: number;
  degree: number;
  isHub: boolean;
  isBridge: boolean;
  isOrphan: boolean;
}

export interface DocGraphAnalysis {
  nodeMetrics: Map<string, DocGraphNodeMetrics>;
  unresolvedLinks: Map<string, string[]>;
  health: {
    docCount: number;
    referenceCount: number;
    hubCount: number;
    bridgeCount: number;
    orphanCount: number;
    connectedComponentCount: number;
    summary: string;
  };
}

const HUB_KEYWORDS = [
  "moc",
  "hub",
  "map",
  "index",
  "charter",
  "workflow",
  "architecture",
  "guide",
];

function matchesHubSignal(title: string, tags: string[]) {
  const haystack = `${title} ${tags.join(" ")}`.toLowerCase();
  return HUB_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

export function analyzeDocGraph(input: DocGraphAnalysisInput[]): DocGraphAnalysis {
  const byNormalizedTitle = new Map(
    input.map((doc) => [normalizeDocumentTitle(doc.title), doc]),
  );
  const adjacency = new Map<string, Set<string>>();
  const incomingCounts = new Map<string, number>();
  const outgoingCounts = new Map<string, number>();
  const unresolvedLinks = new Map<string, string[]>();
  let referenceCount = 0;

  for (const doc of input) {
    adjacency.set(doc.id, new Set<string>());
    incomingCounts.set(doc.id, 0);
    outgoingCounts.set(doc.id, 0);
    unresolvedLinks.set(doc.id, []);
  }

  for (const doc of input) {
    const docNeighbors = adjacency.get(doc.id)!;
    const unresolved = unresolvedLinks.get(doc.id)!;

    for (const rawLink of doc.links) {
      const normalized = normalizeDocumentTitle(rawLink);
      if (!normalized || normalized === normalizeDocumentTitle(doc.title)) {
        continue;
      }

      const target = byNormalizedTitle.get(normalized);
      if (!target || target.id === doc.id) {
        unresolved.push(rawLink);
        continue;
      }

      if (!docNeighbors.has(target.id)) {
        docNeighbors.add(target.id);
        adjacency.get(target.id)?.add(doc.id);
        outgoingCounts.set(doc.id, (outgoingCounts.get(doc.id) || 0) + 1);
        incomingCounts.set(target.id, (incomingCounts.get(target.id) || 0) + 1);
        referenceCount += 1;
      }
    }
  }

  const visited = new Set<string>();
  let connectedComponentCount = 0;

  for (const doc of input) {
    if (visited.has(doc.id)) {
      continue;
    }

    connectedComponentCount += 1;
    const stack = [doc.id];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);
      for (const next of adjacency.get(current) || []) {
        if (!visited.has(next)) {
          stack.push(next);
        }
      }
    }
  }

  const discovery = new Map<string, number>();
  const low = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const bridgeIds = new Set<string>();
  let time = 0;

  const dfs = (nodeId: string) => {
    discovery.set(nodeId, time);
    low.set(nodeId, time);
    time += 1;
    let childCount = 0;
    let isArticulation = false;

    for (const neighborId of adjacency.get(nodeId) || []) {
      if (!discovery.has(neighborId)) {
        parent.set(neighborId, nodeId);
        childCount += 1;
        dfs(neighborId);
        low.set(nodeId, Math.min(low.get(nodeId)!, low.get(neighborId)!));

        if (parent.get(nodeId) !== null && low.get(neighborId)! >= discovery.get(nodeId)!) {
          isArticulation = true;
        }
      } else if (neighborId !== parent.get(nodeId)) {
        low.set(nodeId, Math.min(low.get(nodeId)!, discovery.get(neighborId)!));
      }
    }

    if ((parent.get(nodeId) === null && childCount > 1) || isArticulation) {
      bridgeIds.add(nodeId);
    }
  };

  for (const doc of input) {
    if (!discovery.has(doc.id)) {
      parent.set(doc.id, null);
      dfs(doc.id);
    }
  }

  const nodeMetrics = new Map<string, DocGraphNodeMetrics>();
  let hubCount = 0;
  let orphanCount = 0;

  for (const doc of input) {
    const incomingCount = incomingCounts.get(doc.id) || 0;
    const outgoingCount = outgoingCounts.get(doc.id) || 0;
    const degree = (adjacency.get(doc.id) || new Set()).size;
    const keywordHub = matchesHubSignal(doc.title, doc.tags || []);
    const isHub = keywordHub || outgoingCount >= 3 || degree >= 5;
    const isBridge = bridgeIds.has(doc.id);
    const isOrphan = degree === 0;

    if (isHub) {
      hubCount += 1;
    }
    if (isOrphan) {
      orphanCount += 1;
    }

    nodeMetrics.set(doc.id, {
      incomingCount,
      outgoingCount,
      degree,
      isHub,
      isBridge,
      isOrphan,
    });
  }

  const bridgeCount = bridgeIds.size;
  const summary = `${hubCount} hubs, ${bridgeCount} bridge docs, ${orphanCount} orphans across ${connectedComponentCount} graph groups.`;

  return {
    nodeMetrics,
    unresolvedLinks,
    health: {
      docCount: input.length,
      referenceCount,
      hubCount,
      bridgeCount,
      orphanCount,
      connectedComponentCount,
      summary,
    },
  };
}
