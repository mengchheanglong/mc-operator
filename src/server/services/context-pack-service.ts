import { extractLinks, normalizeDocumentTitle } from "@/lib/parser/extractLinks";
import { listDocs } from "@/server/repositories/docs-repo";
import { listNotes } from "@/server/repositories/notes-repo";
import { listQuests } from "@/server/repositories/quests-repo";
import { listReports } from "@/server/repositories/reports-repo";
import {
  buildCollaborationGuide,
  buildRepoSnapshot,
  buildWorkspaceReadiness,
} from "@/server/services/workspace-intel-service";
import type { WorkspaceProject } from "@/server/projects/workspace-projects";
import type {
  ContextFocusType,
  ContextPack,
  ContextSource,
  GraphNeighbor,
} from "@/types/context-pack";

type DocRecord = ReturnType<typeof listDocs>[number];
type QuestRecord = ReturnType<typeof listQuests>[number];
type NoteRecord = ReturnType<typeof listNotes>[number];
type ReportRecord = ReturnType<typeof listReports>[number];

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

function scoreDocumentAgainstQuery(doc: DocRecord, query: string) {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return 0;
  }

  const haystack = `${doc.title} ${doc.tags.join(" ")} ${doc.content.slice(0, 1200)}`.toLowerCase();
  let score = 0;

  for (const token of tokens) {
    if (doc.title.toLowerCase().includes(token)) {
      score += 5;
    }
    if (doc.tags.some((tag) => tag.toLowerCase().includes(token))) {
      score += 3;
    }
    if (haystack.includes(token)) {
      score += 1;
    }
  }

  return score;
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
    },
  };
}

function buildGraphData(docs: DocRecord[]) {
  const docsByNormalizedTitle = new Map(
    docs.map((doc) => [normalizeDocumentTitle(doc.title), doc]),
  );
  const incomingMap = new Map<string, Set<string>>();
  const outgoingMap = new Map<string, Set<string>>();
  const unresolvedMap = new Map<string, string[]>();

  for (const doc of docs) {
    const outgoing = new Set<string>();
    const unresolved: string[] = [];

    for (const link of extractLinks(doc.content)) {
      const normalizedLink = normalizeDocumentTitle(link);
      const target = docsByNormalizedTitle.get(normalizedLink);

      if (!normalizedLink || normalizedLink === normalizeDocumentTitle(doc.title)) {
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
) {
  if (!focusDoc) {
    return undefined;
  }

  const neighbors: GraphNeighbor[] = [];
  const outgoing = outgoingMap.get(focusDoc.id) || new Set<string>();
  const incoming = incomingMap.get(focusDoc.id) || new Set<string>();

  for (const targetId of outgoing) {
    const target = docsById.get(targetId);
    if (target) {
      neighbors.push({ id: target.id, title: target.title, relation: "outgoing" });
    }
  }

  for (const sourceId of incoming) {
    const source = docsById.get(sourceId);
    if (source) {
      neighbors.push({ id: source.id, title: source.title, relation: "incoming" });
    }
  }

  neighbors.sort((left, right) => left.title.localeCompare(right.title));

  return {
    focalNode: {
      id: focusDoc.id,
      title: focusDoc.title,
      tags: focusDoc.tags,
    },
    neighbors,
    unresolvedLinks: unresolvedMap.get(focusDoc.id) || [],
  };
}

function rankRelatedDocs(
  docs: DocRecord[],
  query: string,
  limit: number,
  excludedIds = new Set<string>(),
) {
  return docs
    .map((doc) => ({ doc, score: scoreDocumentAgainstQuery(doc, query) }))
    .filter((entry) => entry.score > 0 && !excludedIds.has(entry.doc.id))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return (
        new Date(right.doc.updatedAt).getTime() -
        new Date(left.doc.updatedAt).getTime()
      );
    })
    .slice(0, limit)
    .map((entry) => entry.doc);
}

function buildRecentActivity(reports: ReportRecord[]) {
  return reports.slice(0, 6).map((report) => ({
    action: report.category,
    title: report.title,
    date: report.date,
  }));
}

function buildNoteSources(notes: NoteRecord[]) {
  return notes.slice(0, 3).map((note) => ({
    id: note.id,
    type: "note" as const,
    title: note.completed ? "Completed note" : "Pending note",
    excerpt: trimText(note.content, 140),
    href: "/dashboard/notes",
    metadata: {
      status: note.completed ? "completed" : "pending",
      updatedAt: note.updatedAt,
    },
  }));
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
            `- ${doc.title}${doc.metadata?.relation ? ` (${doc.metadata.relation})` : ""}`,
        )
      : ["- None"]),
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

export async function buildContextPack(
  userId: string,
  project: WorkspaceProject,
  options: {
    focusType: ContextFocusType;
    focusId?: string;
  },
): Promise<ContextPack> {
  const focusType = options.focusType || "workspace";
  const focusId = options.focusId;
  const timestamp = new Date().toISOString();

  const quests = listQuests(userId, project.id, { limit: 16 });
  const openQuests = quests.filter((quest) => !quest.completed);
  const reports = listReports(userId, project.id, { limit: 6 });
  const docs = listDocs(userId, project.id);
  const notes = listNotes(userId, project.id);
  const docsById = new Map(docs.map((doc) => [doc.id, doc]));
  const { incomingMap, outgoingMap, unresolvedMap } = buildGraphData(docs);
  const repoSnapshot = buildRepoSnapshot(project);
  const readiness = buildWorkspaceReadiness(userId, project, {
    assumeContextFiles: true,
  });
  const collaborationGuide = buildCollaborationGuide(readiness, project);

  let label = "Workspace";
  let objective = `Resume the highest-value IDE work for ${project.name} using the current project state.`;
  let suggestedAction = openQuests.length > 0
    ? `Start with the next open quest: ${openQuests[0].goal}.`
    : "Choose the most relevant document cluster and define the next concrete implementation task.";
  let successCriteria = [
    "Read the generated context files before editing code.",
    "Implement or refine one concrete task in the active repo.",
    "Update the workspace context artifacts after the IDE work session.",
  ];
  let relevantDocs: ContextSource[] = [];
  let graphContext = undefined as ContextPack["graphContext"];

  if (focusType === "quest_focus" && focusId) {
    const focusQuest = quests.find((quest) => quest.id === focusId);
    if (focusQuest) {
      label = focusQuest.goal;
      objective = `Advance the quest: ${focusQuest.goal}`;
      suggestedAction =
        "Translate the quest into one concrete code change or document update, then execute it in the IDE.";
      successCriteria = [
        "Complete or materially progress the selected quest.",
        "Touch the code or docs directly related to the quest objective.",
        "Capture the outcome back in the workspace context.",
      ];

      const relatedDocs = rankRelatedDocs(docs, focusQuest.goal, 4);
      relevantDocs = relatedDocs.map((doc) => createDocSource(doc));
      graphContext = createGraphContext(
        relatedDocs[0],
        docsById,
        incomingMap,
        outgoingMap,
        unresolvedMap,
      );
    }
  } else if (focusType === "doc_focus" && focusId) {
    const focusDoc = docsById.get(focusId);
    if (focusDoc) {
      label = focusDoc.title;
      objective = `Work from the document: ${focusDoc.title}`;
      suggestedAction =
        "Use the focal note and its linked neighbors to drive the next implementation or writing step.";
      successCriteria = [
        "Use the focused document as the main source of truth.",
        "Check linked notes before changing implementation details.",
        "Keep the document network consistent if titles or links change.",
      ];

      const seen = new Set<string>([focusDoc.id]);
      const focusedSources: ContextSource[] = [createDocSource(focusDoc, "focus")];

      for (const targetId of outgoingMap.get(focusDoc.id) || []) {
        const target = docsById.get(targetId);
        if (target && !seen.has(target.id)) {
          seen.add(target.id);
          focusedSources.push(createDocSource(target, "outgoing_link"));
        }
      }

      for (const sourceId of incomingMap.get(focusDoc.id) || []) {
        const source = docsById.get(sourceId);
        if (source && !seen.has(source.id)) {
          seen.add(source.id);
          focusedSources.push(createDocSource(source, "incoming_link"));
        }
      }

      relevantDocs = focusedSources.slice(0, 6);
      graphContext = createGraphContext(
        focusDoc,
        docsById,
        incomingMap,
        outgoingMap,
        unresolvedMap,
      );
    }
  } else if (focusType === "graph_focus" && focusId) {
    const focusDoc = docsById.get(focusId);
    if (focusDoc) {
      label = `${focusDoc.title} cluster`;
      objective = `Inspect and work from the graph cluster around ${focusDoc.title}`;
      suggestedAction =
        "Use the local graph neighborhood to identify the next missing link, implementation target, or knowledge gap.";
      successCriteria = [
        "Review the focal node and its direct neighbors before coding.",
        "Address one concrete gap in the local graph cluster.",
        "Keep the graph cleaner after the work session than before it.",
      ];

      const graphPackDocs: ContextSource[] = [createDocSource(focusDoc, "focus")];
      const graphContextData = createGraphContext(
        focusDoc,
        docsById,
        incomingMap,
        outgoingMap,
        unresolvedMap,
      );
      graphContext = graphContextData;

      const seen = new Set<string>([focusDoc.id]);
      for (const neighbor of graphContextData?.neighbors || []) {
        const doc = docsById.get(neighbor.id);
        if (doc && !seen.has(doc.id)) {
          seen.add(doc.id);
          graphPackDocs.push(
            createDocSource(
              doc,
              neighbor.relation === "incoming" ? "incoming_link" : "outgoing_link",
            ),
          );
        }
      }

      relevantDocs = graphPackDocs.slice(0, 6);
    }
  }

  if (relevantDocs.length === 0) {
    relevantDocs = docs
      .slice(0, 4)
      .map((doc, index) => createDocSource(doc, index === 0 ? "focus" : "related"));
  }

  const relatedNotes = buildNoteSources(notes);
  const contextFiles = buildContextFileReferences(focusType);

  const partialPack: Omit<ContextPack, "handoff"> = {
    timestamp,
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
    recentActivity: buildRecentActivity(reports),
    activeQuests: openQuests.slice(0, 5).map((quest: QuestRecord) => ({
      id: quest.id,
      type: "quest",
      title: quest.goal,
      href: "/dashboard/quests",
      metadata: {
        difficulty: quest.difficulty,
        date: quest.date,
        status: quest.completed ? "completed" : "open",
      },
    })),
    relevantDocs,
    relatedNotes,
    repoSnapshot,
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

  pack.suggestedPrompts.codex = buildPrompt({
    objective,
    suggestedAction,
    successCriteria,
    contextFiles,
    pack,
  });

  return pack;
}
