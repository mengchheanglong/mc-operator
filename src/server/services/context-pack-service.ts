import { extractLinks, normalizeDocumentTitle } from "@/lib/parser/extractLinks";
import {
  analyzeDocGraph,
  type DocGraphNodeMetrics,
} from "@/lib/graph/analyzeDocGraph";
import { listDocs } from "@/server/repositories/docs-repo";
import { listNotes } from "@/server/repositories/notes-repo";
import { listQuests } from "@/server/repositories/quests-repo";
import { listReports } from "@/server/repositories/reports-repo";
import { listDailyReportLogs } from "@/server/services/daily-report-log-service";
import { buildPromotionCandidateSnapshot } from "@/server/services/promotion-candidate-service";
import {
  buildCollaborationGuide,
  buildRepoSnapshot,
  buildWorkspaceReadiness,
} from "@/server/services/workspace-intel-service";
import {
  collectBoundedCodegraphSummaryWithGate,
  isCodegraphSpikeBoundedModeEnabled,
} from "@/server/services/codegraph-summary-service";
import { buildN8nAutomationSnapshot } from "@/server/services/n8n-service";
import type { WorkspaceProject } from "@/server/projects/workspace-projects";
import type {
  ContextFocusType,
  ContextDocGraphHealth,
  ContextPack,
  ContextTier,
  ContextMemoryBrief,
  ContextProvenanceItem,
  ContextSource,
  GraphClusterGap,
  GraphNeighbor,
} from "@/types/context-pack";

type DocRecord = ReturnType<typeof listDocs>[number];
type QuestRecord = ReturnType<typeof listQuests>[number];
type NoteRecord = ReturnType<typeof listNotes>[number];
type ReportRecord = ReturnType<typeof listReports>[number];

type ContextPackLimits = ReturnType<typeof getTierLimits>;
type DocSearchIndexEntry = {
  doc: DocRecord;
  titleLower: string;
  tagLowers: string[];
  haystackLower: string;
  updatedAtMs: number;
};
type FocusResolution = {
  label: string;
  objective: string;
  suggestedAction: string;
  successCriteria: string[];
  relevantDocs: ContextSource[];
  graphContext: ContextPack["graphContext"];
};
type ContextPackGraphData = ReturnType<typeof buildGraphData>;
type DocDerivedContext = {
  docsById: Map<string, DocRecord>;
  docSearchIndex: DocSearchIndexEntry[];
  docLinksById: Map<string, string[]>;
  graphData: ContextPackGraphData;
  docAnalysis: ReturnType<typeof analyzeDocGraph>;
};

const DOC_DERIVED_CONTEXT_CACHE_TTL_MS = 10000;
const docDerivedContextCache = new Map<
  string,
  {
    expiresAt: number;
    signature: string;
    derived: DocDerivedContext;
  }
>();

function trimText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function buildDocExcerpt(doc: Pick<DocRecord, "content">) {
  const content = trimText(doc.content || "", 340);
  return content || "No content yet.";
}

function tokenize(value: string) {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((token) => token.length > 2),
    ),
  );
}

function buildDocSearchIndex(docs: DocRecord[]): DocSearchIndexEntry[] {
  return docs.map((doc) => ({
    doc,
    titleLower: doc.title.toLowerCase(),
    tagLowers: doc.tags.map((tag) => tag.toLowerCase()),
    haystackLower: `${doc.title} ${doc.tags.join(" ")} ${doc.content.slice(0, 1200)}`.toLowerCase(),
    updatedAtMs: new Date(doc.updatedAt).getTime() || 0,
  }));
}

function scoreIndexedDocumentAgainstTokens(
  entry: DocSearchIndexEntry,
  tokens: string[],
) {
  let score = 0;

  for (const token of tokens) {
    if (entry.titleLower.includes(token)) {
      score += 5;
    }
    if (entry.tagLowers.some((tag) => tag.includes(token))) {
      score += 3;
    }
    if (entry.haystackLower.includes(token)) {
      score += 1;
    }
  }

  return score;
}

function compareRankedDocEntries(
  left: { score: number; updatedAtMs: number; docId: string },
  right: { score: number; updatedAtMs: number; docId: string },
) {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  if (right.updatedAtMs !== left.updatedAtMs) {
    return right.updatedAtMs - left.updatedAtMs;
  }
  return left.docId.localeCompare(right.docId);
}

function insertRankedDocResult<T extends { score: number; updatedAtMs: number; docId: string }>(
  entries: T[],
  candidate: T,
  limit: number,
) {
  let insertAt = entries.findIndex((entry) => compareRankedDocEntries(candidate, entry) < 0);
  if (insertAt === -1) {
    insertAt = entries.length;
  }

  entries.splice(insertAt, 0, candidate);
  if (entries.length > limit) {
    entries.length = limit;
  }
}

function buildContextFileReferences(focusType: ContextFocusType) {
  const basePath = ".openclaw/context";
  const files = [
    {
      label: "Project Context",
      path: `${basePath}/PROJECT_CONTEXT.md`,
      purpose: "Project-level description for IDE assistants.",
    },
    {
      label: "Collaboration Guide",
      path: `${basePath}/COLLABORATION_GUIDE.md`,
      purpose: "Operating rules for how Docs, Quests, Prompt Pack, and Reports should work together.",
    },
    {
      label: "Repo Map",
      path: `${basePath}/REPO_MAP.md`,
      purpose: "A concise map of stack, scripts, git state, and key files.",
    },
    {
      label: "IDE Agent Setup",
      path: `${basePath}/IDE_AGENT_SETUP.md`,
      purpose: "Project-specific setup for Codex, Claude, or Cursor, including verification and semantic tooling.",
    },
    {
      label: "Active Context",
      path: `${basePath}/ACTIVE_CONTEXT.md`,
      purpose: "Live snapshot of open quests, recent activity, and next work to resume.",
    },
    {
      label: "Active Context Summary",
      path: `${basePath}/ACTIVE_CONTEXT_SUMMARY.md`,
      purpose: "Shortest project brief for low-cost agent startup.",
    },
    {
      label: "Active Context Full",
      path: `${basePath}/ACTIVE_CONTEXT_FULL.md`,
      purpose: "Expanded project brief with deeper history and supporting context.",
    },
    {
      label: "Memory Brief",
      path: `${basePath}/MEMORY_BRIEF.md`,
      purpose: "Durable facts and recent highlights promoted from docs and daily work logs.",
    },
    {
      label: "Promotion Candidates",
      path: `${basePath}/PROMOTION_CANDIDATES.md`,
      purpose: "Repeated work patterns that should be promoted into durable docs or map notes.",
    },
    {
      label: "Prompt Pack",
      path: `${basePath}/PROMPT_PACK.md`,
      purpose: "Latest generated task brief for the chosen focus.",
    },
    {
      label: "Session Handoff",
      path: `${basePath}/SESSION_HANDOFF.md`,
      purpose: "A compact handoff brief with next step, verification commands, and changed files.",
    },
  ];

  if (focusType === "doc_focus") {
    files.push({
      label: "Document Focus",
      path: `${basePath}/DOC_FOCUS.md`,
      purpose: "Detailed context for the selected document and linked notes.",
    });
  } else if (focusType === "quest_focus") {
    files.push({
      label: "Quest Focus",
      path: `${basePath}/QUEST_FOCUS.md`,
      purpose: "Detailed context for the selected quest and related docs.",
    });
  } else if (focusType === "graph_focus") {
    files.push({
      label: "Graph Focus",
      path: `${basePath}/GRAPH_FOCUS.md`,
      purpose: "Local graph cluster for the selected note.",
    });
  }

  return files;
}

function createDocSource(
  doc: DocRecord,
  relation: NonNullable<ContextSource["metadata"]>["relation"] = "related",
  provenance: string[] = [],
): ContextSource {
  return {
    id: doc.id,
    type: "doc",
    title: doc.title,
    excerpt: buildDocExcerpt(doc),
    href: `/dashboard/docs?doc=${encodeURIComponent(doc.id)}`,
    metadata: {
      tags: doc.tags,
      updatedAt: doc.updatedAt,
      relation,
      provenance,
    },
  };
}

function scoreGraphCodeTarget(text: string, tokens: string[]) {
  const normalized = text.toLowerCase();
  let score = 0;

  for (const token of tokens) {
    if (normalized.includes(token)) {
      score += token.length >= 7 ? 4 : token.length >= 5 ? 3 : 2;
    }
  }

  return score;
}

function buildGraphCodeTargets({
  focusDoc,
  neighborTitles,
  unresolvedLinks,
  repoSnapshot,
}: {
  focusDoc: DocRecord;
  neighborTitles: string[];
  unresolvedLinks: string[];
  repoSnapshot: Pick<ContextPack["repoSnapshot"], "hotspots" | "keyFiles" | "git">;
}) {
  const tokens = tokenize(
    [
      focusDoc.title,
      ...focusDoc.tags,
      ...neighborTitles,
      ...unresolvedLinks,
    ].join(" "),
  );

  const rankedCandidates: Array<{
    path: string;
    reason: string;
    source: "hotspot" | "key_file" | "git_change";
    score: number;
  }> = [];

  for (const hotspot of repoSnapshot.hotspots) {
    const score = scoreGraphCodeTarget(
      `${hotspot.path} ${hotspot.reason}`,
      tokens,
    );
    if (score > 0) {
      rankedCandidates.push({
        path: hotspot.path,
        reason: hotspot.reason,
        source: "hotspot",
        score: score + 2,
      });
    }
  }

  for (const keyFile of repoSnapshot.keyFiles) {
    const score = scoreGraphCodeTarget(
      `${keyFile.path} ${keyFile.label} ${keyFile.detail}`,
      tokens,
    );
    if (score > 0) {
      rankedCandidates.push({
        path: keyFile.path,
        reason: `${keyFile.label}: ${keyFile.detail}`,
        source: "key_file",
        score,
      });
    }
  }

  for (const changedFile of repoSnapshot.git.changedFiles) {
    const score = scoreGraphCodeTarget(changedFile.path, tokens);
    if (score > 0) {
      rankedCandidates.push({
        path: changedFile.path,
        reason: `${changedFile.status} file in current git changes`,
        source: "git_change",
        score: score + 1,
      });
    }
  }

  rankedCandidates.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.path.localeCompare(right.path);
  });

  const seenPaths = new Set<string>();
  const selected = rankedCandidates
    .filter((candidate) => {
      if (seenPaths.has(candidate.path)) {
        return false;
      }
      seenPaths.add(candidate.path);
      return true;
    })
    .slice(0, 6)
    .map((candidate) => ({
      path: candidate.path,
      reason: candidate.reason,
      source: candidate.source,
    }));

  if (selected.length > 0) {
    return selected;
  }

  return repoSnapshot.hotspots.slice(0, 3).map((hotspot) => ({
    path: hotspot.path,
    reason: hotspot.reason,
    source: "hotspot" as const,
  }));
}

function buildDocLinkMap(docs: DocRecord[]) {
  return new Map(docs.map((doc) => [doc.id, extractLinks(doc.content)]));
}

function buildDocDerivedSignature(docs: DocRecord[]) {
  return docs
    .map((doc) => `${doc.id}:${doc.updatedAt}:${doc.title}`)
    .join("|");
}

function createDocDerivedContext(docs: DocRecord[]): DocDerivedContext {
  const docsById = new Map(docs.map((doc) => [doc.id, doc]));
  const docSearchIndex = buildDocSearchIndex(docs);
  const docLinksById = buildDocLinkMap(docs);
  const graphData = buildGraphData(docs, docLinksById);
  const docAnalysis = analyzeDocGraph(
    docs.map((doc) => ({
      id: doc.id,
      title: doc.title,
      links: docLinksById.get(doc.id) || [],
      tags: doc.tags,
    })),
  );

  return {
    docsById,
    docSearchIndex,
    docLinksById,
    graphData,
    docAnalysis,
  };
}

export function collectDocDerivedContext(
  userId: string,
  projectId: string,
  docs: DocRecord[],
): DocDerivedContext {
  const cacheKey = `${userId}:${projectId}`;
  const signature = buildDocDerivedSignature(docs);
  const cached = docDerivedContextCache.get(cacheKey);
  if (
    cached &&
    cached.expiresAt > Date.now() &&
    cached.signature === signature
  ) {
    return cached.derived;
  }

  const derived = createDocDerivedContext(docs);
  docDerivedContextCache.set(cacheKey, {
    expiresAt: Date.now() + DOC_DERIVED_CONTEXT_CACHE_TTL_MS,
    signature,
    derived,
  });

  return derived;
}

export function clearDocDerivedContextCache(userId?: string, projectId?: string) {
  if (!userId || !projectId) {
    docDerivedContextCache.clear();
    return;
  }

  docDerivedContextCache.delete(`${userId}:${projectId}`);
}

function buildGraphData(
  docs: DocRecord[],
  docLinksById?: Map<string, string[]>,
) {
  const docsByNormalizedTitle = new Map(
    docs.map((doc) => [normalizeDocumentTitle(doc.title), doc]),
  );
  const incomingMap = new Map<string, Set<string>>();
  const outgoingMap = new Map<string, Set<string>>();
  const unresolvedMap = new Map<string, string[]>();

  for (const doc of docs) {
    const outgoing = new Set<string>();
    const unresolved: string[] = [];
    const normalizedDocTitle = normalizeDocumentTitle(doc.title);
    const links = docLinksById?.get(doc.id) || extractLinks(doc.content);

    for (const link of links) {
      const normalizedLink = normalizeDocumentTitle(link);
      const target = docsByNormalizedTitle.get(normalizedLink);

      if (!normalizedLink || normalizedLink === normalizedDocTitle) {
        continue;
      }

      if (target && target.id !== doc.id) {
        outgoing.add(target.id);
        const incoming = incomingMap.get(target.id) || new Set<string>();
        incoming.add(doc.id);
        incomingMap.set(target.id, incoming);
      } else {
        unresolved.push(link);
      }
    }

    outgoingMap.set(doc.id, outgoing);
    unresolvedMap.set(doc.id, unresolved);
  }

  return { incomingMap, outgoingMap, unresolvedMap };
}

function createGraphContext(
  focusDoc: DocRecord | undefined,
  docsById: Map<string, DocRecord>,
  incomingMap: Map<string, Set<string>>,
  outgoingMap: Map<string, Set<string>>,
  unresolvedMap: Map<string, string[]>,
  nodeMetrics: Map<string, DocGraphNodeMetrics>,
  repoSnapshot: Pick<ContextPack["repoSnapshot"], "hotspots" | "keyFiles" | "git">,
) {
  if (!focusDoc) {
    return undefined;
  }

  const neighbors: GraphNeighbor[] = [];
  const secondHopNeighbors: GraphNeighbor[] = [];
  const outgoing = outgoingMap.get(focusDoc.id) || new Set<string>();
  const incoming = incomingMap.get(focusDoc.id) || new Set<string>();
  const directNeighborIds = new Set<string>();
  const clusterDocIds = new Set<string>([focusDoc.id]);
  const unresolvedLinks = unresolvedMap.get(focusDoc.id) || [];
  const gapCandidates: GraphClusterGap[] = [];
  const focusMetrics = nodeMetrics.get(focusDoc.id);

  for (const targetId of outgoing) {
    const target = docsById.get(targetId);
    if (target) {
      neighbors.push({ id: target.id, title: target.title, relation: "outgoing" });
      directNeighborIds.add(target.id);
      clusterDocIds.add(target.id);
    }
  }

  for (const sourceId of incoming) {
    const source = docsById.get(sourceId);
    if (source) {
      neighbors.push({ id: source.id, title: source.title, relation: "incoming" });
      directNeighborIds.add(source.id);
      clusterDocIds.add(source.id);
    }
  }

  neighbors.sort((left, right) => left.title.localeCompare(right.title));

  for (const directNeighborId of directNeighborIds) {
    const secondHopIds = new Set<string>([
      ...(incomingMap.get(directNeighborId) || []),
      ...(outgoingMap.get(directNeighborId) || []),
    ]);

    for (const secondHopId of secondHopIds) {
      if (
        secondHopId === focusDoc.id ||
        directNeighborIds.has(secondHopId) ||
        clusterDocIds.has(secondHopId)
      ) {
        continue;
      }

      const secondHopDoc = docsById.get(secondHopId);
      if (!secondHopDoc) {
        continue;
      }

      clusterDocIds.add(secondHopId);
      secondHopNeighbors.push({
        id: secondHopDoc.id,
        title: secondHopDoc.title,
        relation: "outgoing",
      });
    }
  }

  secondHopNeighbors.sort((left, right) => left.title.localeCompare(right.title));

  for (const unresolvedLink of unresolvedLinks.slice(0, 3)) {
    gapCandidates.push({
      kind: "unresolved_link",
      label: unresolvedLink,
      detail: `${focusDoc.title} references this note, but no matching document exists yet.`,
    });
  }

  const role: NonNullable<NonNullable<ContextPack["graphContext"]>["focalNode"]>["role"] =
    focusMetrics?.isHub
      ? "hub"
      : focusMetrics?.isBridge
        ? "bridge"
        : focusMetrics?.isOrphan
          ? "orphan"
          : "normal";

  if (role === "orphan") {
    gapCandidates.push({
      kind: "orphan_doc",
      label: focusDoc.title,
      detail: "This note is isolated and likely needs an explicit link into the working document set.",
    });
  } else if (role === "bridge") {
    gapCandidates.push({
      kind: "bridge_doc",
      label: focusDoc.title,
      detail: "This note connects separate parts of the graph, so changes here need broader context review.",
    });
  } else if (role === "hub") {
    gapCandidates.push({
      kind: "hub_doc",
      label: focusDoc.title,
      detail: "This note behaves like a hub and is a strong anchor for cluster-level task planning.",
    });
  }

  const clusterSummary = [
    `${focusDoc.title} has ${neighbors.length} direct neighbor${neighbors.length === 1 ? "" : "s"}`,
    `${secondHopNeighbors.length} second-hop note${secondHopNeighbors.length === 1 ? "" : "s"}`,
    `${unresolvedLinks.length} unresolved link${unresolvedLinks.length === 1 ? "" : "s"}`,
  ].join(", ");
  const codeTargets = buildGraphCodeTargets({
    focusDoc,
    neighborTitles: [
      ...neighbors.map((neighbor) => neighbor.title),
      ...secondHopNeighbors.map((neighbor) => neighbor.title),
    ],
    unresolvedLinks,
    repoSnapshot,
  });

  return {
    focalNode: {
      id: focusDoc.id,
      title: focusDoc.title,
      tags: focusDoc.tags,
      degree: focusMetrics?.degree || 0,
      incomingCount: focusMetrics?.incomingCount || 0,
      outgoingCount: focusMetrics?.outgoingCount || 0,
      role,
    },
    clusterSummary: `${clusterSummary} in the local graph cluster.`,
    clusterDocTitles: Array.from(clusterDocIds)
      .map((docId) => docsById.get(docId)?.title || "")
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right))
      .slice(0, 12),
    neighbors,
    secondHopNeighbors,
    unresolvedLinks,
    gapCandidates,
    codeTargets,
  };
}

function rankRelatedDocs(
  searchIndex: DocSearchIndexEntry[],
  query: string,
  limit: number,
  excludedIds = new Set<string>(),
) {
  const tokens = tokenize(query);
  if (tokens.length === 0 || limit <= 0) {
    return [];
  }

  const topEntries: Array<{
    doc: DocRecord;
    docId: string;
    score: number;
    updatedAtMs: number;
  }> = [];

  for (const entry of searchIndex) {
    if (excludedIds.has(entry.doc.id)) {
      continue;
    }
    const score = scoreIndexedDocumentAgainstTokens(entry, tokens);
    if (score <= 0) {
      continue;
    }
    insertRankedDocResult(
      topEntries,
      {
        doc: entry.doc,
        docId: entry.doc.id,
        score,
        updatedAtMs: entry.updatedAtMs,
      },
      limit,
    );
  }

  return topEntries.map((entry) => entry.doc);
}

function buildRecentActivity(reports: ReportRecord[], limit: number) {
  return reports.slice(0, limit).map((report) => ({
    action: report.category,
    title: report.title,
    date: report.date,
    reason: `Recent ${report.category} report from ${report.source}.`,
  }));
}

function buildNoteSources(notes: NoteRecord[], limit: number) {
  return notes.slice(0, limit).map((note) => ({
    id: note.id,
    type: "note" as const,
    title: note.completed ? "Completed note" : "Pending note",
    excerpt: trimText(note.content, 140),
    href: "/dashboard/notes",
    metadata: {
      status: note.completed ? "completed" : "pending",
      updatedAt: note.updatedAt,
      provenance: [
        note.completed
          ? "Pulled from the recent completed notes stack."
          : "Pulled from the current active notes stack.",
      ],
    },
  }));
}

function getTierLimits(tier: ContextTier) {
  switch (tier) {
    case "summary":
      return {
        questLimit: 3,
        docLimit: 3,
        noteLimit: 2,
        activityLimit: 3,
        dailyLogLimit: 2,
      };
    case "full":
      return {
        questLimit: 8,
        docLimit: 8,
        noteLimit: 5,
        activityLimit: 10,
        dailyLogLimit: 5,
      };
    default:
      return {
        questLimit: 5,
        docLimit: 5,
        noteLimit: 3,
        activityLimit: 6,
        dailyLogLimit: 3,
      };
  }
}

function titleOrTagsMatch(
  title: string,
  tags: string[],
  keywords: string[],
) {
  const haystack = `${title} ${tags.join(" ")}`.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function buildMemoryBrief(
  project: WorkspaceProject,
  docs: DocRecord[],
  dailyLogs: ReturnType<typeof listDailyReportLogs>,
  dailyLogLimit: number,
): ContextMemoryBrief {
  const durableDocs = docs
    .filter((doc) =>
      titleOrTagsMatch(doc.title, doc.tags, [
        "charter",
        "workflow",
        "definition of done",
        "architecture",
        "system",
        "context",
        "guide",
      ]),
    )
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    )
    .slice(0, 4);

  const recentLogs = dailyLogs.slice(0, dailyLogLimit);
  const durableNotes = durableDocs.map(
    (doc) => `${doc.title}: ${trimText(doc.content, 140)}`,
  );
  const recentHighlights = recentLogs.map((log) => {
    return `${log.dayKey}: ${trimText(log.preview || `${log.entryCount} logged updates.`, 160)}`;
  });

  const sources = [
    ...durableDocs.map((doc) => ({
      label: doc.title,
      type: "doc" as const,
      reason: "Durable doc matched charter, workflow, architecture, or setup keywords.",
      href: `/dashboard/docs?doc=${encodeURIComponent(doc.id)}`,
      path: `${project.relativePath}/.openclaw/knowledge`,
    })),
    ...recentLogs.map((log) => ({
      label: log.title,
      type: "daily_report" as const,
      reason: "Recent daily work log promoted into the reusable memory layer.",
      href: "/dashboard/report",
      path: `.openclaw/context/daily-reports/${log.dayKey}.md`,
    })),
  ];

  const summaryParts = [
    durableDocs.length > 0
      ? `${durableDocs.length} durable docs anchor the project rules`
      : "No durable docs are anchoring project rules yet",
    recentLogs.length > 0
      ? `${recentLogs.length} recent daily logs capture execution memory`
      : "No recent daily logs are available yet",
  ];

  return {
    summary: `${summaryParts.join("; ")}.`,
    durableNotes,
    recentHighlights,
    sources,
  };
}

function buildDocGraphHealth(
  docs: DocRecord[],
  analysis?: ReturnType<typeof analyzeDocGraph>,
): ContextDocGraphHealth {
  const resolvedAnalysis = analysis || analyzeDocGraph(
    docs.map((doc) => ({
      id: doc.id,
      title: doc.title,
      links: extractLinks(doc.content),
      tags: doc.tags,
    })),
  );

  const hubDocs: string[] = [];
  const bridgeDocs: string[] = [];
  const orphanDocs: string[] = [];

  for (const doc of docs) {
    const metrics = resolvedAnalysis.nodeMetrics.get(doc.id);
    if (!metrics) {
      continue;
    }

    if (metrics.isHub && hubDocs.length < 5) {
      hubDocs.push(doc.title);
    }
    if (metrics.isBridge && bridgeDocs.length < 5) {
      bridgeDocs.push(doc.title);
    }
    if (metrics.isOrphan && orphanDocs.length < 5) {
      orphanDocs.push(doc.title);
    }
  }

  return {
    summary: resolvedAnalysis.health.summary,
    hubDocs,
    bridgeDocs,
    orphanDocs,
  };
}

function createNeighborDocSource(
  doc: DocRecord,
  relation: NonNullable<ContextSource["metadata"]>["relation"],
  provenance: string,
) {
  return createDocSource(doc, relation, [provenance]);
}

function buildDefaultFocusResolution(
  projectName: string,
  firstOpenQuest: QuestRecord | undefined,
): FocusResolution {
  return {
    label: "Workspace",
    objective: `Resume the highest-value IDE work for ${projectName} using the current project state.`,
    suggestedAction: firstOpenQuest
      ? `Start with the next open quest: ${firstOpenQuest.goal}.`
      : "Choose the most relevant document cluster and define the next concrete implementation task.",
    successCriteria: [
      "Read the generated context files before editing code.",
      "Implement or refine one concrete task in the active repo.",
      "Update the workspace context artifacts after the IDE work session.",
    ],
    relevantDocs: [],
    graphContext: undefined,
  };
}

function buildFallbackRelevantDocs(
  docs: DocRecord[],
  limit: number,
) {
  return docs
    .slice(0, limit)
    .map((doc, index) =>
      createDocSource(doc, index === 0 ? "focus" : "related", [
        index === 0
          ? "Most recent durable document for general project startup."
          : "Fallback project context document for general startup.",
      ]),
    );
}

function buildActiveQuestSources(
  openQuests: QuestRecord[],
  limit: number,
): ContextPack["activeQuests"] {
  return openQuests.slice(0, limit).map((quest) => ({
    id: quest.id,
    type: "quest",
    title: quest.goal,
    href: "/dashboard/quests",
    metadata: {
      difficulty: quest.difficulty,
      date: quest.date,
      tags: quest.topics,
      status: quest.completed ? "completed" : "open",
      provenance: ["Open quest promoted into the current execution context."],
    },
  }));
}

function createFocusGraphContext({
  focusDoc,
  docsById,
  incomingMap,
  outgoingMap,
  unresolvedMap,
  nodeMetrics,
  repoSnapshot,
}: {
  focusDoc: DocRecord | undefined;
  docsById: Map<string, DocRecord>;
  incomingMap: Map<string, Set<string>>;
  outgoingMap: Map<string, Set<string>>;
  unresolvedMap: Map<string, string[]>;
  nodeMetrics: Map<string, DocGraphNodeMetrics>;
  repoSnapshot: Pick<ContextPack["repoSnapshot"], "hotspots" | "keyFiles" | "git">;
}) {
  return createGraphContext(
    focusDoc,
    docsById,
    incomingMap,
    outgoingMap,
    unresolvedMap,
    nodeMetrics,
    repoSnapshot,
  );
}

function resolveQuestFocus({
  focusId,
  quests,
  docSearchIndex,
  limits,
  docsById,
  incomingMap,
  outgoingMap,
  unresolvedMap,
  nodeMetrics,
  repoSnapshot,
}: {
  focusId: string | undefined;
  quests: QuestRecord[];
  docSearchIndex: DocSearchIndexEntry[];
  limits: ContextPackLimits;
  docsById: Map<string, DocRecord>;
  incomingMap: Map<string, Set<string>>;
  outgoingMap: Map<string, Set<string>>;
  unresolvedMap: Map<string, string[]>;
  nodeMetrics: Map<string, DocGraphNodeMetrics>;
  repoSnapshot: Pick<ContextPack["repoSnapshot"], "hotspots" | "keyFiles" | "git">;
}): FocusResolution | null {
  if (!focusId) return null;
  const focusQuest = quests.find((quest) => quest.id === focusId);
  if (!focusQuest) return null;

  const relatedDocs = rankRelatedDocs(docSearchIndex, focusQuest.goal, limits.docLimit);
  return {
    label: focusQuest.goal,
    objective: `Advance the quest: ${focusQuest.goal}`,
    suggestedAction:
      "Translate the quest into one concrete code change or document update, then execute it in the IDE.",
    successCriteria: [
      "Complete or materially progress the selected quest.",
      "Touch the code or docs directly related to the quest objective.",
      "Capture the outcome back in the workspace context.",
    ],
    relevantDocs: relatedDocs.map((doc) =>
      createDocSource(doc, "related", [
        "Matched the quest goal against document title, tags, or body text.",
      ]),
    ),
    graphContext: createFocusGraphContext({
      focusDoc: relatedDocs[0],
      docsById,
      incomingMap,
      outgoingMap,
      unresolvedMap,
      nodeMetrics,
      repoSnapshot,
    }),
  };
}

function resolveDocFocus({
  focusId,
  limits,
  docsById,
  incomingMap,
  outgoingMap,
  unresolvedMap,
  nodeMetrics,
  repoSnapshot,
}: {
  focusId: string | undefined;
  limits: ContextPackLimits;
  docsById: Map<string, DocRecord>;
  incomingMap: Map<string, Set<string>>;
  outgoingMap: Map<string, Set<string>>;
  unresolvedMap: Map<string, string[]>;
  nodeMetrics: Map<string, DocGraphNodeMetrics>;
  repoSnapshot: Pick<ContextPack["repoSnapshot"], "hotspots" | "keyFiles" | "git">;
}): FocusResolution | null {
  if (!focusId) return null;
  const focusDoc = docsById.get(focusId);
  if (!focusDoc) return null;

  const seen = new Set<string>([focusDoc.id]);
  const relevantDocs: ContextSource[] = [
    createDocSource(focusDoc, "focus", [
      "Directly selected as the focused document.",
    ]),
  ];

  for (const targetId of outgoingMap.get(focusDoc.id) || []) {
    const target = docsById.get(targetId);
    if (target && !seen.has(target.id)) {
      seen.add(target.id);
      relevantDocs.push(
        createDocSource(target, "outgoing_link", [
          `Linked out from ${focusDoc.title}.`,
        ]),
      );
    }
  }

  for (const sourceId of incomingMap.get(focusDoc.id) || []) {
    const source = docsById.get(sourceId);
    if (source && !seen.has(source.id)) {
      seen.add(source.id);
      relevantDocs.push(
        createDocSource(source, "incoming_link", [
          `Links into ${focusDoc.title}.`,
        ]),
      );
    }
  }

  return {
    label: focusDoc.title,
    objective: `Work from the document: ${focusDoc.title}`,
    suggestedAction:
      "Use the focal note and its linked neighbors to drive the next implementation or writing step.",
    successCriteria: [
      "Use the focused document as the main source of truth.",
      "Check linked notes before changing implementation details.",
      "Keep the document network consistent if titles or links change.",
    ],
    relevantDocs: relevantDocs.slice(0, limits.docLimit),
    graphContext: createFocusGraphContext({
      focusDoc,
      docsById,
      incomingMap,
      outgoingMap,
      unresolvedMap,
      nodeMetrics,
      repoSnapshot,
    }),
  };
}

function resolveGraphFocus({
  focusId,
  limits,
  docsById,
  incomingMap,
  outgoingMap,
  unresolvedMap,
  nodeMetrics,
  repoSnapshot,
}: {
  focusId: string | undefined;
  limits: ContextPackLimits;
  docsById: Map<string, DocRecord>;
  incomingMap: Map<string, Set<string>>;
  outgoingMap: Map<string, Set<string>>;
  unresolvedMap: Map<string, string[]>;
  nodeMetrics: Map<string, DocGraphNodeMetrics>;
  repoSnapshot: Pick<ContextPack["repoSnapshot"], "hotspots" | "keyFiles" | "git">;
}): FocusResolution | null {
  if (!focusId) return null;
  const focusDoc = docsById.get(focusId);
  if (!focusDoc) return null;

  const graphContext = createFocusGraphContext({
    focusDoc,
    docsById,
    incomingMap,
    outgoingMap,
    unresolvedMap,
    nodeMetrics,
    repoSnapshot,
  });
  const relevantDocs: ContextSource[] = [
    createDocSource(focusDoc, "focus", [
      "Selected as the graph focal node.",
    ]),
  ];
  const seen = new Set<string>([focusDoc.id]);

  for (const neighbor of graphContext?.neighbors || []) {
    const doc = docsById.get(neighbor.id);
    if (doc && !seen.has(doc.id)) {
      seen.add(doc.id);
      relevantDocs.push(
        createNeighborDocSource(
          doc,
          neighbor.relation === "incoming" ? "incoming_link" : "outgoing_link",
          neighbor.relation === "incoming"
            ? `Direct inbound neighbor of ${focusDoc.title}.`
            : `Direct outbound neighbor of ${focusDoc.title}.`,
        ),
      );
    }
  }

  for (const neighbor of graphContext?.secondHopNeighbors || []) {
    const doc = docsById.get(neighbor.id);
    if (doc && !seen.has(doc.id)) {
      seen.add(doc.id);
      relevantDocs.push(
        createNeighborDocSource(
          doc,
          "related",
          `Two hops away from ${focusDoc.title} in the local graph cluster.`,
        ),
      );
    }
  }

  return {
    label: `${focusDoc.title} cluster`,
    objective: `Inspect and work from the graph cluster around ${focusDoc.title}`,
    suggestedAction:
      "Use the local graph neighborhood to identify the next missing link, implementation target, or knowledge gap.",
    successCriteria: [
      "Review the focal node and its direct neighbors before coding.",
      "Address one concrete gap in the local graph cluster.",
      "Keep the graph cleaner after the work session than before it.",
    ],
    relevantDocs: relevantDocs.slice(0, limits.docLimit),
    graphContext,
  };
}

function resolveFocus({
  projectName,
  focusType,
  focusId,
  openQuests,
  quests,
  docSearchIndex,
  limits,
  docsById,
  incomingMap,
  outgoingMap,
  unresolvedMap,
  nodeMetrics,
  repoSnapshot,
}: {
  projectName: string;
  focusType: ContextFocusType;
  focusId: string | undefined;
  openQuests: QuestRecord[];
  quests: QuestRecord[];
  docSearchIndex: DocSearchIndexEntry[];
  limits: ContextPackLimits;
  docsById: Map<string, DocRecord>;
  incomingMap: Map<string, Set<string>>;
  outgoingMap: Map<string, Set<string>>;
  unresolvedMap: Map<string, string[]>;
  nodeMetrics: Map<string, DocGraphNodeMetrics>;
  repoSnapshot: Pick<ContextPack["repoSnapshot"], "hotspots" | "keyFiles" | "git">;
}): FocusResolution {
  const fallback = buildDefaultFocusResolution(projectName, openQuests[0]);

  if (focusType === "quest_focus") {
    return (
      resolveQuestFocus({
        focusId,
        quests,
        docSearchIndex,
        limits,
        docsById,
        incomingMap,
        outgoingMap,
        unresolvedMap,
        nodeMetrics,
        repoSnapshot,
      }) || fallback
    );
  }

  if (focusType === "doc_focus") {
    return (
      resolveDocFocus({
        focusId,
        limits,
        docsById,
        incomingMap,
        outgoingMap,
        unresolvedMap,
        nodeMetrics,
        repoSnapshot,
      }) || fallback
    );
  }

  if (focusType === "graph_focus") {
    return (
      resolveGraphFocus({
        focusId,
        limits,
        docsById,
        incomingMap,
        outgoingMap,
        unresolvedMap,
        nodeMetrics,
        repoSnapshot,
      }) || fallback
    );
  }

  return fallback;
}

function buildProvenance(
  docs: ContextSource[],
  memoryBrief: ContextMemoryBrief,
  recentActivity: ContextPack["recentActivity"],
  activeQuests: ContextSource[],
  contextFiles: ReturnType<typeof buildContextFileReferences>,
): ContextProvenanceItem[] {
  return [
    ...docs.map((doc) => ({
      section: "docs" as const,
      label: doc.title,
      reason:
        doc.metadata?.provenance?.join(" ") ||
        "Included as relevant reference material for the current focus.",
      href: doc.href,
    })),
    ...memoryBrief.sources.map((source) => ({
      section: "memory" as const,
      label: source.label,
      reason: source.reason,
      href: source.href,
      path: source.path,
    })),
    ...recentActivity.map((item) => ({
      section: "activity" as const,
      label: item.title,
      reason: item.reason || "Included as recent activity that may affect the next task.",
    })),
    ...activeQuests.map((quest) => ({
      section: "quests" as const,
      label: quest.title,
      reason: "Included because the quest is still open and can drive the next concrete step.",
      href: quest.href,
    })),
    ...contextFiles.map((file) => ({
      section: "context_files" as const,
      label: file.label,
      reason: file.purpose,
      path: file.path,
    })),
  ];
}

function buildPrompt({
  objective,
  suggestedAction,
  successCriteria,
  contextFiles,
  pack,
}: {
  objective: string;
  suggestedAction: string;
  successCriteria: string[];
  contextFiles: ReturnType<typeof buildContextFileReferences>;
  pack: ContextPack;
}) {
  return [
    `Use Codex as the coding layer for ${pack.project.name}.`,
    `Context tier: ${pack.tier}`,
    `Project path: ${pack.project.relativePath}`,
    `Objective: ${objective}`,
    "",
    "Read these project context files first:",
    ...contextFiles.map((file) => `- ${file.path}`),
    "",
    "Collaboration protocol:",
    ...pack.collaborationGuide.workflow.map((item) => `- ${item}`),
    "",
    "Update rules:",
    ...pack.collaborationGuide.updateRules.map((item) => `- ${item}`),
    "",
    `Workspace readiness: ${pack.readiness.score}/100 (${pack.readiness.status})`,
    ...(pack.collaborationGuide.nextInputs.length > 0
      ? [
          "Missing inputs to fill when relevant:",
          ...pack.collaborationGuide.nextInputs.map((item) => `- ${item}`),
          "",
        ]
      : []),
    "Repo snapshot:",
    `- Summary: ${pack.repoSnapshot.summary}`,
    ...pack.repoSnapshot.stack.map((item) => `- Stack: ${item}`),
    ...pack.repoSnapshot.verificationPresets.map(
      (preset) => `- Verify with ${preset.label}: ${preset.command}`,
    ),
    ...(pack.repoSnapshot.codeIntel.tools.length > 0
      ? [
          `- Code intelligence: ${pack.repoSnapshot.codeIntel.summary}`,
          `- Override file: ${pack.repoSnapshot.codeIntel.overrideFilePath}`,
          ...pack.repoSnapshot.codeIntel.tools.map(
            (tool) =>
              `- ${tool.language}: ${tool.status} via ${tool.server} (${tool.source})`,
          ),
          ...pack.repoSnapshot.codeIntel.notes.map((note) => `- Note: ${note}`),
        ]
      : []),
    `- CodeGraphContext: ${pack.repoSnapshot.codeIntel.codeGraphContext.summary}`,
    `- CodeGraphContext source: ${pack.repoSnapshot.codeIntel.codeGraphContext.source}`,
    ...(pack.repoSnapshot.codeIntel.codeGraphContext.localRepoPath
      ? [
          `- CodeGraphContext repo: ${pack.repoSnapshot.codeIntel.codeGraphContext.localRepoPath}`,
        ]
      : []),
    `- CodeGraphContext indexed: ${pack.repoSnapshot.codeIntel.codeGraphContext.indexed ? "yes" : "no"}`,
    ...(pack.repoSnapshot.codeIntel.codeGraphContext.statsPreview.length > 0
      ? [
          "- CodeGraphContext stats preview:",
          ...pack.repoSnapshot.codeIntel.codeGraphContext.statsPreview.map(
            (item) => `  - ${item}`,
          ),
        ]
      : []),
    ...(pack.repoSnapshot.codeIntel.codeGraphContext.queryPresets.length > 0
      ? [
          "- CodeGraphContext query presets:",
          ...pack.repoSnapshot.codeIntel.codeGraphContext.queryPresets.map(
            (item) => `  - ${item.label}: ${item.command}`,
          ),
        ]
      : []),
    ...pack.repoSnapshot.codeIntel.codeGraphContext.suggestedCommands.map(
      (item) => `- CodeGraphContext ${item.label}: ${item.command}`,
    ),
    ...(pack.codegraph_summary
      ? [
          "",
          "codegraph_summary (bounded):",
          ...pack.codegraph_summary.markdown.split("\n").map((line) => `- ${line}`),
          `- Budget: ${pack.codegraph_summary.budget.chars}/${pack.codegraph_summary.budget.maxChars} chars, ~${pack.codegraph_summary.budget.tokensEstimated}/${pack.codegraph_summary.budget.maxTokens} tokens`,
        ]
      : []),
    ...(pack.repoSnapshot.git.available
      ? [
          `- Git: ${pack.repoSnapshot.git.summary}`,
          ...pack.repoSnapshot.git.changedFiles.map(
            (change) => `- Changed file ${change.status}: ${change.path}`,
          ),
        ]
      : []),
    "",
    `Next action: ${suggestedAction}`,
    "",
    "Success criteria:",
    ...successCriteria.map((item) => `- ${item}`),
    "",
    "Relevant docs:",
    ...(pack.relevantDocs.length
      ? pack.relevantDocs.map(
          (doc) =>
            `- ${doc.title}${doc.metadata?.relation ? ` (${doc.metadata.relation})` : ""}${doc.metadata?.provenance?.[0] ? ` - ${doc.metadata.provenance[0]}` : ""}`,
        )
      : ["- None"]),
    ...(pack.graphContext?.focalNode
      ? [
          "",
          "Graph cluster:",
          `- Summary: ${pack.graphContext.clusterSummary}`,
          `- Focal role: ${pack.graphContext.focalNode.role}`,
          `- Degree: ${pack.graphContext.focalNode.degree} (${pack.graphContext.focalNode.incomingCount} in / ${pack.graphContext.focalNode.outgoingCount} out)`,
          ...(pack.graphContext.neighbors.length > 0
            ? [
                `- Direct neighbors: ${pack.graphContext.neighbors
                  .map((neighbor) => `${neighbor.title} [${neighbor.relation}]`)
                  .join(", ")}`,
              ]
            : ["- Direct neighbors: none"]),
          ...(pack.graphContext.secondHopNeighbors.length > 0
            ? [
                `- Second-hop notes: ${pack.graphContext.secondHopNeighbors
                  .map((neighbor) => neighbor.title)
                  .join(", ")}`,
              ]
            : []),
          ...(pack.graphContext.unresolvedLinks.length > 0
            ? [`- Unresolved links: ${pack.graphContext.unresolvedLinks.join(", ")}`]
            : []),
          ...(pack.graphContext.gapCandidates.length > 0
            ? [
                "- Cluster gaps:",
                ...pack.graphContext.gapCandidates.map(
                  (item) => `  - ${item.label}: ${item.detail}`,
                ),
              ]
            : []),
          ...(pack.graphContext.codeTargets.length > 0
            ? [
                "- Suggested code targets:",
                ...pack.graphContext.codeTargets.map(
                  (item) => `  - ${item.path} [${item.source}]: ${item.reason}`,
                ),
              ]
            : []),
        ]
      : []),
    "",
    "Memory brief:",
    `- ${pack.memoryBrief.summary}`,
    ...pack.memoryBrief.durableNotes.slice(0, 3).map((item) => `- Durable note: ${item}`),
    ...pack.memoryBrief.recentHighlights.slice(0, 3).map((item) => `- Recent highlight: ${item}`),
    "",
    "Doc graph health:",
    `- ${pack.docGraphHealth.summary}`,
    ...(pack.docGraphHealth.hubDocs.length
      ? [`- Hub docs: ${pack.docGraphHealth.hubDocs.join(", ")}`]
      : []),
    ...(pack.docGraphHealth.bridgeDocs.length
      ? [`- Bridge docs: ${pack.docGraphHealth.bridgeDocs.join(", ")}`]
      : []),
    ...(pack.docGraphHealth.orphanDocs.length
      ? [`- Orphan docs: ${pack.docGraphHealth.orphanDocs.join(", ")}`]
      : []),
    "",
    "Promotion candidates:",
    `- ${pack.promotionCandidates.summary}`,
    ...pack.promotionCandidates.candidates.slice(0, 3).map(
      (candidate) =>
        `- ${candidate.suggestedDocTitle}: ${candidate.reason} Source days: ${candidate.sourceDays.join(", ")}`,
    ),
    "",
    "Session handoff:",
    `- ${pack.handoff.summary}`,
    `- Next step: ${pack.handoff.nextStep}`,
    ...pack.handoff.verificationCommands.map((command) => `- Verify: ${command}`),
    "",
    "Implement directly in the repo and keep the solution practical.",
  ].join("\n");
}

function buildHandoff(pack: Omit<ContextPack, "handoff">) {
  return {
    summary: `${pack.project.name}: ${pack.scope.label} - ${pack.suggestedAction}`,
    nextStep: pack.suggestedAction,
    verificationCommands: pack.repoSnapshot.verificationPresets.map(
      (preset) => preset.command,
    ),
    changedFiles: pack.repoSnapshot.git.changedFiles.slice(0, 6),
    recentCommits: pack.repoSnapshot.git.recentCommits.slice(0, 3),
  };
}

async function collectAsyncContextPackSurfaces(project: WorkspaceProject) {
  return Promise.all([
    isCodegraphSpikeBoundedModeEnabled()
      ? collectBoundedCodegraphSummaryWithGate(project)
      : Promise.resolve({
          block: undefined,
          reason: "bounded mode disabled",
          reasonCode: "bounded_disabled",
        }),
    buildN8nAutomationSnapshot(project),
  ]);
}

export type ContextPackPreloadedData = {
  quests: QuestRecord[];
  readinessQuests: QuestRecord[];
  reports: ReportRecord[];
  docs: DocRecord[];
  notes: NoteRecord[];
  dailyLogs: ReturnType<typeof listDailyReportLogs>;
  docsById: Map<string, DocRecord>;
  docSearchIndex: DocSearchIndexEntry[];
  docLinksById: Map<string, string[]>;
  graphData: ContextPackGraphData;
  docAnalysis: ReturnType<typeof analyzeDocGraph>;
  repoSnapshot: ReturnType<typeof buildRepoSnapshot>;
  codegraphSummaryResult: Awaited<ReturnType<typeof collectAsyncContextPackSurfaces>>[0];
  automation: Awaited<ReturnType<typeof collectAsyncContextPackSurfaces>>[1];
};

export async function loadContextPackPreloadedData(
  userId: string,
  project: WorkspaceProject,
  options: {
    questLimit?: number;
    reportLimit?: number;
    dailyLogsIncludeContent?: boolean;
    dailyLogsMaterializeFiles?: boolean;
  } = {},
): Promise<ContextPackPreloadedData> {
  const quests = listQuests(userId, project.id, {
    limit: options.questLimit ?? 16,
  });
  const readinessQuests = listQuests(userId, project.id);
  const reports = listReports(userId, project.id, {
    limit:
      options.reportLimit ??
      Math.max(getTierLimits("full").activityLimit, 12),
  });
  const docs = listDocs(userId, project.id);
  const notes = listNotes(userId, project.id);
  const dailyLogs = listDailyReportLogs(userId, project.id, {
    materializeFiles: options.dailyLogsMaterializeFiles ?? false,
    includeContent: options.dailyLogsIncludeContent ?? false,
  });
  const {
    docsById,
    docSearchIndex,
    docLinksById,
    graphData,
    docAnalysis,
  } = collectDocDerivedContext(userId, project.id, docs);
  const repoSnapshot = buildRepoSnapshot(project);
  const [codegraphSummaryResult, automation] =
    await collectAsyncContextPackSurfaces(project);

  return {
    quests,
    readinessQuests,
    reports,
    docs,
    notes,
    dailyLogs,
    docsById,
    docSearchIndex,
    docLinksById,
    graphData,
    docAnalysis,
    repoSnapshot,
    codegraphSummaryResult,
    automation,
  };
}

export async function buildContextPack(
  userId: string,
  project: WorkspaceProject,
  options: {
    focusType: ContextFocusType;
    focusId?: string;
    tier?: ContextTier;
    preloaded?: ContextPackPreloadedData;
  },
): Promise<ContextPack> {
  const focusType = options.focusType || "workspace";
  const focusId = options.focusId;
  const tier = options.tier || "overview";
  const timestamp = new Date().toISOString();
  const limits = getTierLimits(tier);

  const quests = options.preloaded?.quests || listQuests(userId, project.id, { limit: 16 });
  const openQuests = quests.filter((quest) => !quest.completed);
  const reports =
    options.preloaded?.reports?.slice(0, limits.activityLimit) ||
    listReports(userId, project.id, { limit: limits.activityLimit });
  const docs = options.preloaded?.docs || listDocs(userId, project.id);
  const notes = options.preloaded?.notes || listNotes(userId, project.id);
  const dailyLogs =
    options.preloaded?.dailyLogs ||
    listDailyReportLogs(userId, project.id, {
      materializeFiles: false,
      includeContent: false,
    });
  const derivedDocContext = options.preloaded
    ? {
        docsById: options.preloaded.docsById,
        docSearchIndex: options.preloaded.docSearchIndex,
        docLinksById: options.preloaded.docLinksById,
        graphData: options.preloaded.graphData,
        docAnalysis: options.preloaded.docAnalysis,
      }
    : collectDocDerivedContext(userId, project.id, docs);
  const { docsById, docSearchIndex, docLinksById, graphData, docAnalysis } =
    derivedDocContext;
  const { incomingMap, outgoingMap, unresolvedMap } = graphData;
  const repoSnapshot = options.preloaded?.repoSnapshot || buildRepoSnapshot(project);
  const [codegraphSummaryResult, automation] = options.preloaded
    ? [options.preloaded.codegraphSummaryResult, options.preloaded.automation]
    : await collectAsyncContextPackSurfaces(project);
  const readiness = buildWorkspaceReadiness(userId, project, {
    assumeContextFiles: true,
    preloaded: {
      docs,
      quests,
      reports,
      repoSnapshot,
    },
  });
  const collaborationGuide = buildCollaborationGuide(readiness, project);
  const focus = resolveFocus({
    projectName: project.name,
    focusType,
    focusId,
      openQuests,
      quests,
      docSearchIndex,
      limits,
    docsById,
    incomingMap,
    outgoingMap,
    unresolvedMap,
    nodeMetrics: docAnalysis.nodeMetrics,
    repoSnapshot,
  });
  const label = focus.label;
  const objective = focus.objective;
  const suggestedAction = focus.suggestedAction;
  const successCriteria = focus.successCriteria;
  const relevantDocs =
    focus.relevantDocs.length > 0
      ? focus.relevantDocs
      : buildFallbackRelevantDocs(docs, limits.docLimit);
  const graphContext = focus.graphContext;

  const relatedNotes = buildNoteSources(notes, limits.noteLimit);
  const contextFiles = buildContextFileReferences(focusType);
  const recentActivity = buildRecentActivity(reports, limits.activityLimit);
  const memoryBrief = buildMemoryBrief(project, docs, dailyLogs, limits.dailyLogLimit);
  const docGraphHealth = buildDocGraphHealth(docs, docAnalysis);
  const promotionCandidates = buildPromotionCandidateSnapshot(docs, dailyLogs);

  const partialPack: Omit<ContextPack, "handoff"> = {
    timestamp,
    tier,
    project: {
      id: project.id,
      name: project.name,
      relativePath: project.relativePath,
      category: project.category,
    },
    scope: {
      type: focusType,
      label,
      id: focusId,
    },
    objective,
    suggestedAction,
    successCriteria,
    recentActivity,
    activeQuests: buildActiveQuestSources(openQuests, limits.questLimit),
    relevantDocs,
    relatedNotes,
    memoryBrief,
    docGraphHealth,
    promotionCandidates,
    provenance: [],
    repoSnapshot,
    codegraph_summary: codegraphSummaryResult.block,
    codegraph_summary_diagnostics: {
      injected: Boolean(codegraphSummaryResult.block),
      reason: codegraphSummaryResult.reason,
      reasonCode: codegraphSummaryResult.reasonCode,
    },
    automation,
    collaborationGuide,
    readiness,
    graphContext,
    contextFiles,
    suggestedPrompts: {
      codex: "",
    },
  };

  const pack: ContextPack = {
    ...partialPack,
    handoff: buildHandoff(partialPack),
  };

  pack.provenance = buildProvenance(
    pack.relevantDocs,
    pack.memoryBrief,
    pack.recentActivity,
    pack.activeQuests,
    contextFiles,
  );

  pack.suggestedPrompts.codex = buildPrompt({
    objective,
    suggestedAction,
    successCriteria,
    contextFiles,
    pack,
  });

  return pack;
}
