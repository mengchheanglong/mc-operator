import { normalizeDocumentTitle } from "@/lib/parser/extractLinks";
import { analyzeDocGraph } from "@/lib/graph/analyzeDocGraph";
import { normalizeTopics } from "@/lib/topics";
import type { KnowledgeGraphEntity, KnowledgeGraphModel } from "@/types/document";

export interface TopicGraphDocumentRecord {
  id: string;
  title: string;
  content: string;
  links: string[];
  tags: string[];
  updatedAt?: string;
  createdAt?: string;
}

export interface TopicGraphQuestRecord {
  id: string;
  goal: string;
  topics: string[];
  completed: boolean;
  date?: string;
}

export interface TopicGraphReportRecord {
  id: string;
  title: string;
  content: string;
  topics: string[];
  category?: string;
  status?: string;
  source?: string;
  date?: string;
}

export interface TopicGraphWorkflowRecord {
  id: string;
  name: string;
  tags: string[];
  active: boolean;
}

export interface TopicGraphWorkspaceProjectRecord {
  id: string;
  name: string;
  relativePath: string;
  category: "root" | "studyspace" | "projects" | "archive" | "tools";
  hasGit: boolean;
  hasPackageJson: boolean;
  isControlPlane: boolean;
}

interface TopicCandidate {
  key: string;
  label: string;
  patterns: string[];
  docIds: Set<string>;
  questCount: number;
  reportCount: number;
  workflowCount: number;
  score: number;
  docTitles: string[];
  questTitles: string[];
  reportTitles: string[];
  workflowTitles: string[];
  topicTag?: string;
}

const IGNORED_TOPIC_KEYS = new Set([
  "other",
  "foundation",
  "context",
  "process",
  "system",
]);

const CURATED_TOPICS = [
  { key: "n8n", label: "n8n", patterns: ["n8n"] },
  { key: "openclaw", label: "openclaw", patterns: ["openclaw"] },
  { key: "codex", label: "codex", patterns: ["codex"] },
  { key: "prompt-pack", label: "prompt pack", patterns: ["prompt pack", "prompt-pack"] },
  { key: "graph", label: "graph", patterns: ["graph", "knowledge graph"] },
  { key: "automation", label: "automation", patterns: ["automation", "automations"] },
  { key: "workflow", label: "workflow", patterns: ["workflow", "workflows"] },
  { key: "security", label: "security", patterns: ["security"] },
  { key: "dashboard", label: "dashboard", patterns: ["dashboard"] },
  { key: "docs", label: "docs", patterns: ["docs", "documentation"] },
  { key: "quests", label: "quests", patterns: ["quest", "quests"] },
  { key: "reports", label: "reports", patterns: ["report", "reports"] },
  { key: "ui", label: "ui", patterns: ["ui", "interface"] },
  { key: "api", label: "api", patterns: ["api", "apis"] },
  { key: "sqlite", label: "sqlite", patterns: ["sqlite"] },
  { key: "git", label: "git", patterns: ["git"] },
  { key: "mcp", label: "mcp", patterns: ["mcp"] },
  { key: "inbox", label: "inbox", patterns: ["inbox"] },
  { key: "architecture", label: "architecture", patterns: ["architecture"] },
  { key: "quality", label: "quality", patterns: ["quality"] },
  { key: "ide", label: "ide", patterns: ["ide"] },
];

function normalizeTopicKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function humanizeTopicLabel(value: string) {
  const normalized = normalizeTopicKey(value);
  if (!normalized) {
    return "";
  }

  if (normalized === "ui" || normalized === "api" || normalized === "mcp") {
    return normalized;
  }

  return normalized.replace(/-/g, " ");
}

function summarizeText(value: string, maxLength = 160) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  const sentenceBreak = normalized.search(/[.!?](\s|$)/);
  if (sentenceBreak > 0 && sentenceBreak + 1 <= maxLength) {
    return normalized.slice(0, sentenceBreak + 1).trim();
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsPattern(text: string, pattern: string) {
  const normalizedText = normalizeDocumentTitle(text);
  const normalizedPattern = normalizeDocumentTitle(pattern);

  if (!normalizedText || !normalizedPattern) {
    return false;
  }

  if (normalizedPattern.length <= 3) {
    return new RegExp(`(^|\\b)${escapeRegExp(normalizedPattern)}(\\b|$)`, "i").test(normalizedText);
  }

  return normalizedText.includes(normalizedPattern);
}

function ensureCandidate(
  candidates: Map<string, TopicCandidate>,
  key: string,
  label: string,
  patterns: string[],
  topicTag?: string,
) {
  const normalizedKey = normalizeTopicKey(key);
  if (!normalizedKey || IGNORED_TOPIC_KEYS.has(normalizedKey)) {
    return null;
  }

  const existing = candidates.get(normalizedKey);
  if (existing) {
    existing.patterns = Array.from(new Set([...existing.patterns, ...patterns]));
    if (!existing.topicTag && topicTag) {
      existing.topicTag = topicTag;
    }
    return existing;
  }

  const candidate: TopicCandidate = {
    key: normalizedKey,
    label: label || humanizeTopicLabel(normalizedKey),
    patterns: Array.from(new Set([normalizedKey, label, ...patterns].filter(Boolean))),
    docIds: new Set<string>(),
    questCount: 0,
    reportCount: 0,
    workflowCount: 0,
    score: 0,
    docTitles: [],
    questTitles: [],
    reportTitles: [],
    workflowTitles: [],
    topicTag,
  };
  candidates.set(normalizedKey, candidate);
  return candidate;
}

function addSampleTitle(values: string[], nextValue: string) {
  const normalized = nextValue.trim();
  if (!normalized || values.includes(normalized) || values.length >= 3) {
    return;
  }

  values.push(normalized);
}

function matchTopics(
  text: string,
  candidates: Map<string, TopicCandidate>,
  matches: Set<string>,
) {
  for (const candidate of candidates.values()) {
    if (candidate.patterns.some((pattern) => containsPattern(text, pattern))) {
      matches.add(candidate.key);
    }
  }
}

function buildTopicSearchQuery(candidate: TopicCandidate) {
  return candidate.topicTag || candidate.label;
}

function addExplicitTopicMatches(
  values: string[],
  candidates: Map<string, TopicCandidate>,
  matches: Set<string>,
) {
  for (const value of normalizeTopics(values)) {
    const normalizedKey = normalizeTopicKey(value);
    if (!normalizedKey || IGNORED_TOPIC_KEYS.has(normalizedKey)) {
      continue;
    }

    ensureCandidate(candidates, normalizedKey, humanizeTopicLabel(value), [value], value);
    matches.add(normalizedKey);
  }
}

function buildEdgeId(source: string, target: string, kind: string) {
  return `${source}::${target}::${kind}`;
}

export function deriveTopicGraphModel(input: {
  projectTitle: string;
  docs: TopicGraphDocumentRecord[];
  quests: TopicGraphQuestRecord[];
  reports: TopicGraphReportRecord[];
  workflows?: TopicGraphWorkflowRecord[];
  workspaceProjects?: TopicGraphWorkspaceProjectRecord[];
}): KnowledgeGraphModel {
  const docGraph = analyzeDocGraph(
    input.docs.map((doc) => ({
      id: doc.id,
      title: doc.title,
      links: doc.links,
      tags: doc.tags,
    })),
  );
  const candidates = new Map<string, TopicCandidate>();

  for (const topic of CURATED_TOPICS) {
    ensureCandidate(candidates, topic.key, topic.label, topic.patterns);
  }

  for (const doc of input.docs) {
    for (const tag of doc.tags) {
      const normalizedTag = normalizeTopicKey(tag);
      if (!normalizedTag || IGNORED_TOPIC_KEYS.has(normalizedTag)) {
        continue;
      }

      const candidate = ensureCandidate(
        candidates,
        normalizedTag,
        humanizeTopicLabel(tag),
        [tag],
        tag,
      );
      if (candidate) {
        candidate.docIds.add(doc.id);
        candidate.score += 4;
        addSampleTitle(candidate.docTitles, doc.title);
      }
    }
  }

  const docTopicMatches = new Map<string, Set<string>>();
  for (const doc of input.docs) {
    const matches = new Set<string>();
    addExplicitTopicMatches(doc.tags, candidates, matches);
    matchTopics(`${doc.title}\n${doc.content.slice(0, 2400)}`, candidates, matches);

    for (const key of matches) {
      const candidate = candidates.get(key);
      if (!candidate) {
        continue;
      }

      candidate.docIds.add(doc.id);
      candidate.score += 2;
      addSampleTitle(candidate.docTitles, doc.title);
    }

    docTopicMatches.set(doc.id, matches);
  }

  for (const quest of input.quests) {
    const matches = new Set<string>();
    addExplicitTopicMatches(quest.topics, candidates, matches);

    if (matches.size === 0) {
      matchTopics(quest.goal, candidates, matches);
    }

    for (const key of matches) {
      const candidate = candidates.get(key);
      if (!candidate) {
        continue;
      }

      candidate.questCount += 1;
      candidate.score += quest.completed ? 1 : 2;
      addSampleTitle(candidate.questTitles, quest.goal);
    }
  }

  for (const report of input.reports) {
    const matches = new Set<string>();
    addExplicitTopicMatches(report.topics, candidates, matches);

    if (matches.size === 0) {
      matchTopics(`${report.title}\n${report.content.slice(0, 1600)}`, candidates, matches);
    }

    for (const key of matches) {
      const candidate = candidates.get(key);
      if (!candidate) {
        continue;
      }

      candidate.reportCount += 1;
      candidate.score += 2;
      addSampleTitle(candidate.reportTitles, report.title);
    }
  }

  for (const workflow of input.workflows || []) {
    const matches = new Set<string>();
    addExplicitTopicMatches(workflow.tags, candidates, matches);

    if (matches.size === 0) {
      matchTopics(workflow.name, candidates, matches);
    }

    for (const key of matches) {
      const candidate = candidates.get(key);
      if (!candidate) {
        continue;
      }

      candidate.workflowCount += 1;
      candidate.score += workflow.active ? 2 : 1;
      addSampleTitle(candidate.workflowTitles, workflow.name);
    }
  }

  let topicCandidates = Array.from(candidates.values())
    .filter(
      (candidate) =>
        candidate.docIds.size > 0 ||
        candidate.questCount > 0 ||
        candidate.reportCount > 0 ||
        candidate.workflowCount > 0,
    )
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      const rightActivity = right.questCount + right.reportCount + right.workflowCount;
      const leftActivity = left.questCount + left.reportCount + left.workflowCount;
      if (rightActivity !== leftActivity) {
        return rightActivity - leftActivity;
      }

      return left.label.localeCompare(right.label);
    })
    .slice(0, 10);

  if (topicCandidates.length === 0) {
    topicCandidates = [
      {
        key: "workspace",
        label: "workspace",
        patterns: ["workspace"],
        docIds: new Set(input.docs.map((doc) => doc.id)),
        questCount: input.quests.length,
        reportCount: input.reports.length,
        workflowCount: (input.workflows || []).filter((workflow) => workflow.active).length,
        score: 1,
        docTitles: input.docs.slice(0, 3).map((doc) => doc.title),
        questTitles: input.quests.slice(0, 3).map((quest) => quest.goal),
        reportTitles: input.reports.slice(0, 3).map((report) => report.title),
        workflowTitles: (input.workflows || []).slice(0, 3).map((workflow) => workflow.name),
      },
    ];
  }

  const topicIds = new Set(topicCandidates.map((candidate) => candidate.key));
  const projectId = `project:${normalizeTopicKey(input.projectTitle) || "workspace"}`;
  const entities: KnowledgeGraphEntity[] = [
    {
      id: projectId,
      kind: "project",
      title: input.projectTitle,
      content: "",
      links: [],
      metadata: {
        summary: `${input.projectTitle} map covering ${topicCandidates.length} topics, ${input.docs.length} docs, and the current tracked work.`,
        topicCount: topicCandidates.length,
        documentCount: input.docs.length,
        questCount: input.quests.length,
        reportCount: input.reports.length,
        workflowCount: (input.workflows || []).filter((workflow) => workflow.active).length,
        workspaceProjectCount: input.workspaceProjects?.length ?? 0,
        activityCount:
          input.quests.length +
          input.reports.length +
          (input.workflows || []).filter((workflow) => workflow.active).length,
        graphHealthSummary: docGraph.health.summary,
        hubCount: docGraph.health.hubCount,
        bridgeCount: docGraph.health.bridgeCount,
        orphanCount: docGraph.health.orphanCount,
        connectedComponentCount: docGraph.health.connectedComponentCount,
      },
    },
  ];

  const relations: KnowledgeGraphModel["relations"] = [];
  const seenEdges = new Set<string>();

  for (const candidate of topicCandidates) {
    const topicId = `topic:${candidate.key}`;
    entities.push({
      id: topicId,
      kind: "topic",
      title: candidate.label,
      content: "",
      links: [],
      metadata: {
        summary: [
          candidate.docTitles.length > 0
            ? `Anchored by ${candidate.docTitles.join(", ")}.`
            : `Stable topic for ${candidate.label}.`,
          `${candidate.questCount} quests, ${candidate.reportCount} reports, ${candidate.workflowCount} workflows.`,
        ].join(" "),
        topicKey: candidate.key,
        topicTag: candidate.topicTag,
        searchQuery: buildTopicSearchQuery(candidate),
        documentCount: candidate.docIds.size,
        questCount: candidate.questCount,
        reportCount: candidate.reportCount,
        workflowCount: candidate.workflowCount,
        activityCount: candidate.questCount + candidate.reportCount + candidate.workflowCount,
        docTitles: candidate.docTitles,
        questTitles: candidate.questTitles,
        reportTitles: candidate.reportTitles,
        workflowTitles: candidate.workflowTitles,
      },
    });

    const edgeId = buildEdgeId(projectId, topicId, "project");
    seenEdges.add(edgeId);
    relations.push({
      source: projectId,
      target: topicId,
      kind: "project",
    });
  }

  for (const workspaceProject of input.workspaceProjects || []) {
    const workspaceProjectId = `workspace-project:${workspaceProject.id}`;
    entities.push({
      id: workspaceProjectId,
      kind: "workspace-project",
      title: workspaceProject.name,
      content: "",
      links: [],
      metadata: {
        summary: `${workspaceProject.relativePath} - ${workspaceProject.category}${workspaceProject.hasGit ? " - git" : ""}${workspaceProject.hasPackageJson ? " - package.json" : ""}`,
        relativePath: workspaceProject.relativePath,
        category: workspaceProject.category,
        projectId: workspaceProject.id,
        hasGit: workspaceProject.hasGit,
        hasPackageJson: workspaceProject.hasPackageJson,
        isControlPlane: workspaceProject.isControlPlane,
      },
    });

    const edgeId = buildEdgeId(projectId, workspaceProjectId, "project");
    if (!seenEdges.has(edgeId)) {
      seenEdges.add(edgeId);
      relations.push({
        source: projectId,
        target: workspaceProjectId,
        kind: "project",
      });
    }
  }

  for (const doc of input.docs) {
    const metrics = docGraph.nodeMetrics.get(doc.id);
    entities.push({
      id: doc.id,
      kind: "document",
      title: doc.title,
      content: doc.content,
      links: doc.links,
      metadata: {
        summary: summarizeText(doc.content),
        tags: doc.tags,
        date: doc.updatedAt || doc.createdAt || "",
        isHubDoc: metrics?.isHub || false,
        isBridgeDoc: metrics?.isBridge || false,
        isOrphanDoc: metrics?.isOrphan || false,
        graphHealthSummary: metrics
          ? `${metrics.incomingCount} incoming, ${metrics.outgoingCount} outgoing, degree ${metrics.degree}.`
          : undefined,
      },
    });

    const matches = docTopicMatches.get(doc.id) ?? new Set<string>();
    let attachedToTopic = false;
    for (const key of matches) {
      if (!topicIds.has(key)) {
        continue;
      }

      const edgeId = buildEdgeId(`topic:${key}`, doc.id, "topic");
      if (seenEdges.has(edgeId)) {
        continue;
      }

      seenEdges.add(edgeId);
      relations.push({
        source: `topic:${key}`,
        target: doc.id,
        kind: "topic",
      });
      attachedToTopic = true;
    }

    if (!attachedToTopic) {
      const edgeId = buildEdgeId(projectId, doc.id, "project");
      if (!seenEdges.has(edgeId)) {
        seenEdges.add(edgeId);
        relations.push({
          source: projectId,
          target: doc.id,
          kind: "project",
        });
      }
    }
  }

  const docsByTitle = new Map(
    input.docs.map((doc) => [normalizeDocumentTitle(doc.title), doc]),
  );

  for (const doc of input.docs) {
    for (const link of doc.links) {
      const target = docsByTitle.get(normalizeDocumentTitle(link));
      if (!target || target.id === doc.id) {
        continue;
      }

      const edgeId = buildEdgeId(doc.id, target.id, "reference");
      if (seenEdges.has(edgeId)) {
        continue;
      }

      seenEdges.add(edgeId);
      relations.push({
        source: doc.id,
        target: target.id,
        kind: "reference",
      });
    }
  }

  return {
    entities,
    relations,
  };
}
