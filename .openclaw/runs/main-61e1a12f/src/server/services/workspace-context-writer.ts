import fs from "fs";
import path from "path";
import { buildContextPack } from "@/server/services/context-pack-service";
import {
  buildCollaborationGuide,
  buildRepoSnapshot,
  buildWorkspaceReadiness,
  renderCollaborationGuideMarkdown,
  renderIdeAgentSetupMarkdown,
  renderRepoSnapshotMarkdown,
} from "@/server/services/workspace-intel-service";
import type { WorkspaceProject } from "@/server/projects/workspace-projects";
import type {
  ContextFileReference,
  ContextFocusType,
  ContextPack,
  ContextTier,
} from "@/types/context-pack";

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function getContextDir(project: WorkspaceProject) {
  const dir = path.join(project.rootPath, ".openclaw", "context");
  ensureDir(dir);
  return dir;
}

function toRepoRelativePath(project: WorkspaceProject, absolutePath: string) {
  return path.relative(project.rootPath, absolutePath).replace(/\\/g, "/");
}

function getFocusFileName(focusType: ContextFocusType) {
  switch (focusType) {
    case "doc_focus":
      return "DOC_FOCUS.md";
    case "quest_focus":
      return "QUEST_FOCUS.md";
    case "graph_focus":
      return "GRAPH_FOCUS.md";
    default:
      return "ACTIVE_CONTEXT.md";
  }
}

export function getContextFileReferences(
  project: WorkspaceProject,
  focusType: ContextFocusType,
): ContextFileReference[] {
  const dir = getContextDir(project);
  const files = [
    {
      label: "Project Context",
      fileName: "PROJECT_CONTEXT.md",
      purpose: "Explains how Mission Control exposes live project context to the IDE.",
    },
    {
      label: "Collaboration Guide",
      fileName: "COLLABORATION_GUIDE.md",
      purpose: "Defines how Docs, Quests, Prompt Pack, and Reports should be maintained together.",
    },
    {
      label: "Repo Map",
      fileName: "REPO_MAP.md",
      purpose: "Summarizes stack, routes, scripts, git state, and key files in the repo.",
    },
    {
      label: "IDE Agent Setup",
      fileName: "IDE_AGENT_SETUP.md",
      purpose: "Explains how Codex, Claude, or Cursor should work in this repo, including verification and semantic tooling.",
    },
    {
      label: "Active Context",
      fileName: "ACTIVE_CONTEXT.md",
      purpose: "Project-wide view of active quests, recent activity, and next work to resume.",
    },
    {
      label: "Active Context Summary",
      fileName: "ACTIVE_CONTEXT_SUMMARY.md",
      purpose: "Smallest startup brief when cost or context budget matters most.",
    },
    {
      label: "Active Context Full",
      fileName: "ACTIVE_CONTEXT_FULL.md",
      purpose: "Expanded context with more supporting details and history.",
    },
    {
      label: "Memory Brief",
      fileName: "MEMORY_BRIEF.md",
      purpose: "Durable rules and recent highlights promoted from docs and daily work logs.",
    },
    {
      label: "Promotion Candidates",
      fileName: "PROMOTION_CANDIDATES.md",
      purpose: "Repeated work patterns that should probably become durable docs or maps.",
    },
    {
      label: "Prompt Pack",
      fileName: "PROMPT_PACK.md",
      purpose: "The latest generated task brief tailored for the selected focus.",
    },
    {
      label: "Session Handoff",
      fileName: "SESSION_HANDOFF.md",
      purpose: "A compact handoff brief with next step, verification commands, and changed files.",
    },
  ];

  if (focusType !== "workspace") {
    files.push({
      label: "Focused Context",
      fileName: getFocusFileName(focusType),
      purpose: "Detailed context for the selected quest, document, or graph node.",
    });
  }

  return files.map((entry) => ({
    label: entry.label,
    path: toRepoRelativePath(project, path.join(dir, entry.fileName)),
    purpose: entry.purpose,
  }));
}

export function renderContextPackMarkdown(pack: ContextPack) {
  const lines: string[] = [
    `# ${pack.scope.label || "Workspace Prompt Pack"}`,
    `Generated: ${pack.timestamp}`,
    `Tier: ${pack.tier}`,
    "",
    "## Active Project",
    `- ${pack.project.name}`,
    `- Path: ${pack.project.relativePath}`,
    "",
    "## Objective",
    pack.objective,
    "",
    "## Suggested Action",
    pack.suggestedAction,
    "",
    "## Workspace Readiness",
    `${pack.readiness.score}/100 (${pack.readiness.status})`,
    pack.readiness.summary,
    "",
    "## Collaboration Guide",
    ...pack.collaborationGuide.workflow.map((item) => `- ${item}`),
    "",
    "## Update Rules",
    ...pack.collaborationGuide.updateRules.map((item) => `- ${item}`),
    "",
    "## Missing Inputs To Add Next",
    ...(pack.collaborationGuide.nextInputs.length
      ? pack.collaborationGuide.nextInputs.map((item) => `- ${item}`)
      : ["- None"]),
    "",
    "## Repo Snapshot",
    pack.repoSnapshot.summary,
    ...pack.repoSnapshot.stack.map((item) => `- ${item}`),
    "",
    "### Verification Commands",
    ...(pack.repoSnapshot.verificationPresets.length
      ? pack.repoSnapshot.verificationPresets.map(
          (preset) => `- ${preset.label}: ${preset.command}`,
        )
      : ["- None"]),
    "",
    "### Code Intelligence",
    `- ${pack.repoSnapshot.codeIntel.summary}`,
    `- Override file: ${pack.repoSnapshot.codeIntel.overrideFilePath}`,
    ...(pack.repoSnapshot.codeIntel.overrideError
      ? [`- Override error: ${pack.repoSnapshot.codeIntel.overrideError}`]
      : []),
    ...(pack.repoSnapshot.codeIntel.tools.length
      ? pack.repoSnapshot.codeIntel.tools.map(
          (tool) =>
            `- ${tool.language}: ${tool.status} via ${tool.server} (${tool.source})`,
        )
      : ["- None detected"]),
    ...(pack.repoSnapshot.codeIntel.notes.length
      ? ["", "### Override Notes", ...pack.repoSnapshot.codeIntel.notes.map((item) => `- ${item}`)]
      : []),
    ...(pack.repoSnapshot.codeIntel.suggestions.length
      ? ["", "### Suggested Setup", ...pack.repoSnapshot.codeIntel.suggestions.map((item) => `- ${item}`)]
      : []),
    "",
    "### CodeGraphContext",
    `- ${pack.repoSnapshot.codeIntel.codeGraphContext.summary}`,
    `- Source: ${pack.repoSnapshot.codeIntel.codeGraphContext.source}`,
    `- Indexed: ${pack.repoSnapshot.codeIntel.codeGraphContext.indexed ? "yes" : "no"}`,
    ...(pack.repoSnapshot.codeIntel.codeGraphContext.localRepoPath
      ? [`- Local repo: ${pack.repoSnapshot.codeIntel.codeGraphContext.localRepoPath}`]
      : []),
    ...(pack.repoSnapshot.codeIntel.codeGraphContext.projectConfigPath
      ? [`- Project config: ${pack.repoSnapshot.codeIntel.codeGraphContext.projectConfigPath}`]
      : []),
    ...(pack.repoSnapshot.codeIntel.codeGraphContext.installHint
      ? [`- Install hint: ${pack.repoSnapshot.codeIntel.codeGraphContext.installHint}`]
      : []),
    ...(pack.repoSnapshot.codeIntel.codeGraphContext.supportedCapabilities.length
      ? [
          "  Capabilities:",
          ...pack.repoSnapshot.codeIntel.codeGraphContext.supportedCapabilities.map(
            (item) => `  - ${item}`,
          ),
        ]
      : []),
    ...(pack.repoSnapshot.codeIntel.codeGraphContext.statsPreview.length
      ? [
          "  Stats preview:",
          ...pack.repoSnapshot.codeIntel.codeGraphContext.statsPreview.map(
            (item) => `  - ${item}`,
          ),
        ]
      : []),
    ...(pack.repoSnapshot.codeIntel.codeGraphContext.notes.length
      ? pack.repoSnapshot.codeIntel.codeGraphContext.notes.map((item) => `- ${item}`)
      : []),
    ...(pack.repoSnapshot.codeIntel.codeGraphContext.suggestedCommands.length
      ? [
          "  Suggested commands:",
          ...pack.repoSnapshot.codeIntel.codeGraphContext.suggestedCommands.map(
            (item) => `  - ${item.label}: ${item.command}`,
          ),
        ]
      : []),
    ...(pack.repoSnapshot.codeIntel.codeGraphContext.queryPresets.length
      ? [
          "  Query presets:",
          ...pack.repoSnapshot.codeIntel.codeGraphContext.queryPresets.map(
            (item) => `  - ${item.label}: ${item.command}`,
          ),
        ]
      : []),
    "",
    "### Git",
    `- ${pack.repoSnapshot.git.summary}`,
    ...(pack.repoSnapshot.git.changedFiles.length
      ? pack.repoSnapshot.git.changedFiles.map(
          (change) => `- ${change.status}: ${change.path}`,
        )
      : ["- No changed files detected"]),
    "",
    "### Key Files",
    ...(pack.repoSnapshot.keyFiles.length
      ? pack.repoSnapshot.keyFiles.map(
          (file) => `- \`${file.path}\`: ${file.detail}`,
        )
      : ["- None"]),
    "",
    "### Automation Layer",
    `- ${pack.automation.summary}`,
    `- n8n status: ${pack.automation.status}`,
    ...(pack.automation.baseUrl ? [`- n8n base URL: ${pack.automation.baseUrl}`] : []),
    ...(pack.automation.webhookBaseUrl
      ? [`- n8n webhook base URL: ${pack.automation.webhookBaseUrl}`]
      : []),
    `- Mission Control session brief URL: ${pack.automation.missionControl.sessionBriefUrl}`,
    `- Mission Control report URL: ${pack.automation.missionControl.reportUrl}`,
    ...(pack.automation.workflows.length
      ? pack.automation.workflows.map(
          (workflow) =>
            `- Workflow: ${workflow.name}${workflow.active ? " (active)" : ""}`,
        )
      : ["- No active workflows were discovered from Mission Control."]),
    ...(pack.automation.suggestions.length
      ? [
          "",
          "### Automation Suggestions",
          ...pack.automation.suggestions.map((item) => `- ${item}`),
        ]
      : []),
    "",
    "## Success Criteria",
    ...pack.successCriteria.map((item) => `- ${item}`),
    "",
    "## Memory Brief",
    pack.memoryBrief.summary,
    "",
    "### Durable Notes",
    ...(pack.memoryBrief.durableNotes.length
      ? pack.memoryBrief.durableNotes.map((item) => `- ${item}`)
      : ["- None yet"]),
    "",
    "### Recent Highlights",
    ...(pack.memoryBrief.recentHighlights.length
      ? pack.memoryBrief.recentHighlights.map((item) => `- ${item}`)
      : ["- None yet"]),
    "",
    "### Memory Sources",
    ...(pack.memoryBrief.sources.length
      ? pack.memoryBrief.sources.map(
          (source) =>
            `- ${source.label}: ${source.reason}${source.path ? ` (${source.path})` : ""}`,
        )
      : ["- None"]),
    "",
    "## Doc Graph Health",
    pack.docGraphHealth.summary,
    ...(pack.docGraphHealth.hubDocs.length
      ? ["", "### Hub Docs", ...pack.docGraphHealth.hubDocs.map((item) => `- ${item}`)]
      : []),
    ...(pack.docGraphHealth.bridgeDocs.length
      ? ["", "### Bridge Docs", ...pack.docGraphHealth.bridgeDocs.map((item) => `- ${item}`)]
      : []),
    ...(pack.docGraphHealth.orphanDocs.length
      ? ["", "### Orphan Docs", ...pack.docGraphHealth.orphanDocs.map((item) => `- ${item}`)]
      : []),
    "",
    "## Promotion Candidates",
    pack.promotionCandidates.summary,
    ...(pack.promotionCandidates.candidates.length
      ? pack.promotionCandidates.candidates.map(
          (candidate) =>
            `- ${candidate.suggestedDocTitle} (${candidate.kind}): ${candidate.reason} Source days: ${candidate.sourceDays.join(", ")}`,
        )
      : ["- None right now"]),
    "",
    "## Active Quests",
    ...(pack.activeQuests.length
      ? pack.activeQuests.map(
          (quest) =>
            `- ${quest.title}${quest.metadata?.difficulty ? ` (${quest.metadata.difficulty})` : ""}`,
        )
      : ["- None"]),
    "",
    "## Relevant Docs",
  ];

  if (pack.relevantDocs.length === 0) {
    lines.push("- None");
  } else {
    for (const doc of pack.relevantDocs) {
      lines.push(`### ${doc.title}`);
      if (doc.metadata?.relation) {
        lines.push(`Relation: ${doc.metadata.relation}`);
      }
      lines.push(doc.excerpt || doc.content || "");
      lines.push("");
    }
  }

  lines.push("## Related Notes");
  lines.push(
    ...(pack.relatedNotes.length
      ? pack.relatedNotes.map((note) => `- ${note.excerpt || note.title}`)
      : ["- None"]),
  );
  lines.push("");
  lines.push("## Recent Activity");
  lines.push(
    ...(pack.recentActivity.length
      ? pack.recentActivity.map((item) => `- [${item.date}] ${item.action}: ${item.title}`)
      : ["- None"]),
  );

  if (pack.graphContext?.focalNode) {
    lines.push("");
    lines.push("## Graph Context");
    lines.push(`Focal node: ${pack.graphContext.focalNode.title}`);
    lines.push(
      ...(pack.graphContext.neighbors.length
        ? pack.graphContext.neighbors.map(
            (neighbor) => `- ${neighbor.relation}: ${neighbor.title}`,
          )
        : ["- No connected neighbors"]),
    );

    if (pack.graphContext.unresolvedLinks.length > 0) {
      lines.push("");
      lines.push("Unresolved links:");
      lines.push(...pack.graphContext.unresolvedLinks.map((item) => `- ${item}`));
    }
  }

  lines.push("");
  lines.push("## Provenance");
  lines.push(
    ...(pack.provenance.length
      ? pack.provenance.map(
          (item) =>
            `- [${item.section}] ${item.label}: ${item.reason}${item.path ? ` (${item.path})` : ""}`,
        )
      : ["- None"]),
  );

  return `${lines.join("\n").trim()}\n`;
}

export function renderMemoryBriefMarkdown(pack: ContextPack) {
  const lines = [
    "# Memory Brief",
    `Generated: ${pack.timestamp}`,
    `Project: ${pack.project.name}`,
    `Tier: ${pack.tier}`,
    "",
    "## Summary",
    pack.memoryBrief.summary,
    "",
    "## Durable Notes",
    ...(pack.memoryBrief.durableNotes.length
      ? pack.memoryBrief.durableNotes.map((item) => `- ${item}`)
      : ["- None yet"]),
    "",
    "## Recent Highlights",
    ...(pack.memoryBrief.recentHighlights.length
      ? pack.memoryBrief.recentHighlights.map((item) => `- ${item}`)
      : ["- None yet"]),
    "",
    "## Sources",
    ...(pack.memoryBrief.sources.length
      ? pack.memoryBrief.sources.map(
          (source) =>
            `- ${source.label}: ${source.reason}${source.path ? ` (${source.path})` : ""}`,
        )
      : ["- None"]),
  ];

  return `${lines.join("\n").trim()}\n`;
}

export function renderPromotionCandidatesMarkdown(pack: ContextPack) {
  const lines = [
    "# Promotion Candidates",
    `Generated: ${pack.timestamp}`,
    `Project: ${pack.project.name}`,
    "",
    "## Summary",
    pack.promotionCandidates.summary,
    "",
    "## Candidates",
    ...(pack.promotionCandidates.candidates.length
      ? pack.promotionCandidates.candidates.flatMap((candidate) => [
          `### ${candidate.suggestedDocTitle}`,
          `- Kind: ${candidate.kind}`,
          `- Label: ${candidate.label}`,
          `- Reason: ${candidate.reason}`,
          `- Source days: ${candidate.sourceDays.join(", ") || "none"}`,
          "",
        ])
      : ["- None right now"]),
  ];

  return `${lines.join("\n").trim()}\n`;
}

function getActiveContextFileName(tier: ContextTier) {
  switch (tier) {
    case "summary":
      return "ACTIVE_CONTEXT_SUMMARY.md";
    case "full":
      return "ACTIVE_CONTEXT_FULL.md";
    default:
      return "ACTIVE_CONTEXT.md";
  }
}

export function renderSessionHandoffMarkdown(pack: ContextPack) {
  const lines = [
    "# Session Handoff",
    `Generated: ${pack.timestamp}`,
    "",
    `Project: ${pack.project.name}`,
    `Path: ${pack.project.relativePath}`,
    "",
    "## Summary",
    pack.handoff.summary,
    "",
    "## Next Step",
    pack.handoff.nextStep,
    "",
    "## Verification Commands",
    ...(pack.handoff.verificationCommands.length
      ? pack.handoff.verificationCommands.map((command) => `- ${command}`)
      : ["- None detected"]),
    "",
    "## Changed Files",
    ...(pack.handoff.changedFiles.length
      ? pack.handoff.changedFiles.map((change) => `- ${change.status}: ${change.path}`)
      : ["- No changed files detected"]),
    "",
    "## Recent Commits",
    ...(pack.handoff.recentCommits.length
      ? pack.handoff.recentCommits.map(
          (commit) => `- ${commit.hash} ${commit.date}: ${commit.subject}`,
        )
      : ["- No recent commits detected"]),
  ];

  return `${lines.join("\n").trim()}\n`;
}

export async function writeDashboardContextFiles(
  userId: string,
  project: WorkspaceProject,
) {
  try {
    const dir = getContextDir(project);
    const summaryPack = await buildContextPack(userId, project, {
      focusType: "workspace",
      tier: "summary",
    });
    const workspacePack = await buildContextPack(userId, project, {
      focusType: "workspace",
      tier: "overview",
    });
    const fullPack = await buildContextPack(userId, project, {
      focusType: "workspace",
      tier: "full",
    });
    const readiness = buildWorkspaceReadiness(userId, project, {
      assumeContextFiles: true,
    });
    const collaborationGuide = buildCollaborationGuide(readiness, project);
    const repoSnapshot = buildRepoSnapshot(project);

    const activeContext = [
      "# Active Context",
      `Generated: ${workspacePack.timestamp}`,
      "",
      "## Active Project",
      `- ${project.name}`,
      `- Path: ${project.relativePath}`,
      "",
      "## Objective",
      workspacePack.objective,
      "",
      "## Suggested Action",
      workspacePack.suggestedAction,
      "",
      "## Active Quests",
      ...(workspacePack.activeQuests.length
        ? workspacePack.activeQuests.map((quest) => `- ${quest.title}`)
        : ["- None"]),
      "",
      "## Recent Activity",
      ...(workspacePack.recentActivity.length
        ? workspacePack.recentActivity.map(
            (item) => `- [${item.date}] ${item.action}: ${item.title}`,
          )
        : ["- None"]),
      "",
      "## Readiness",
      `${readiness.score}/100 (${readiness.status})`,
      readiness.summary,
    ].join("\n");

    const projectContext = [
      "# Project Context",
      `${project.name} is the active project for Mission Control.`,
      "Use the generated files in `.openclaw/context/` before starting work in the IDE.",
      "- `COLLABORATION_GUIDE.md` defines how project artifacts should stay current.",
      "- `REPO_MAP.md` summarizes stack, routes, scripts, git state, and key files.",
      "- `IDE_AGENT_SETUP.md` explains verification, code-intelligence setup, and handoff expectations for IDE agents.",
      "- `ACTIVE_CONTEXT.md` gives the current project state.",
      "- `ACTIVE_CONTEXT_SUMMARY.md` gives the cheapest startup brief.",
      "- `ACTIVE_CONTEXT_FULL.md` gives the expanded context view.",
      "- `MEMORY_BRIEF.md` captures durable docs plus recent daily-log memory.",
      "- `PROMPT_PACK.md` gives the latest generated work brief.",
      "- `SESSION_HANDOFF.md` gives a short next-step summary for handoffs.",
      `Generated: ${new Date().toISOString()}`,
    ].join("\n");

    fs.writeFileSync(
      path.join(dir, getActiveContextFileName("summary")),
      renderContextPackMarkdown(summaryPack),
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, getActiveContextFileName("overview")),
      `${activeContext}\n`,
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, getActiveContextFileName("full")),
      renderContextPackMarkdown(fullPack),
      "utf8",
    );
    fs.writeFileSync(path.join(dir, "PROJECT_CONTEXT.md"), `${projectContext}\n`, "utf8");
    fs.writeFileSync(
      path.join(dir, "COLLABORATION_GUIDE.md"),
      renderCollaborationGuideMarkdown(collaborationGuide),
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "REPO_MAP.md"),
      renderRepoSnapshotMarkdown(repoSnapshot),
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "IDE_AGENT_SETUP.md"),
      renderIdeAgentSetupMarkdown({
        snapshot: repoSnapshot,
        guide: collaborationGuide,
        readiness,
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "MEMORY_BRIEF.md"),
      renderMemoryBriefMarkdown(workspacePack),
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "PROMOTION_CANDIDATES.md"),
      renderPromotionCandidatesMarkdown(workspacePack),
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "SESSION_HANDOFF.md"),
      renderSessionHandoffMarkdown(workspacePack),
      "utf8",
    );
  } catch (error) {
    console.error("Failed to write workspace context files:", error);
  }
}

export async function writeFocusedContextFile(
  userId: string,
  project: WorkspaceProject,
  focusType: ContextFocusType,
  focusId?: string,
  tier: ContextTier = "overview",
) {
  const dir = getContextDir(project);
  const pack = await buildContextPack(userId, project, { focusType, focusId, tier });
  const fileName = getFocusFileName(focusType);

  fs.writeFileSync(
    path.join(dir, "PROMPT_PACK.md"),
    renderContextPackMarkdown(pack),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "SESSION_HANDOFF.md"),
    renderSessionHandoffMarkdown(pack),
    "utf8",
  );

  if (focusType !== "workspace") {
    fs.writeFileSync(
      path.join(dir, fileName),
      renderContextPackMarkdown(pack),
      "utf8",
    );
  }

  return pack;
}

export async function writeDocContextFile(
  userId: string,
  project: WorkspaceProject,
  docId: string,
) {
  return writeFocusedContextFile(userId, project, "doc_focus", docId);
}

export async function writeQuestContextFile(
  userId: string,
  project: WorkspaceProject,
  questId: string,
) {
  return writeFocusedContextFile(userId, project, "quest_focus", questId);
}

export async function writeGraphContextFile(
  userId: string,
  project: WorkspaceProject,
  docId: string,
) {
  return writeFocusedContextFile(userId, project, "graph_focus", docId);
}
