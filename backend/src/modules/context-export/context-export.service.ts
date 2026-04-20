import { Injectable } from "@nestjs/common";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ProjectPathsService } from "../../infra/project-paths.service";

export type ContextFocusType =
  | "workspace"
  | "quest_focus"
  | "doc_focus"
  | "graph_focus";

export type ContextTier = "summary" | "overview" | "full";

const VALID_FOCUS_TYPES = new Set<ContextFocusType>([
  "workspace",
  "quest_focus",
  "doc_focus",
  "graph_focus",
]);

const VALID_TIERS = new Set<ContextTier>(["summary", "overview", "full"]);

type ContextPackLite = {
  timestamp: string;
  tier: ContextTier;
  project: {
    id: string;
    name: string;
    relativePath: string;
    category: "root" | "studyspace" | "projects" | "archive" | "tools";
  };
  scope: {
    type: ContextFocusType;
    label: string;
    id?: string;
  };
  objective: string;
  suggestedAction: string;
  successCriteria: string[];
  contextFiles: Array<{
    label: string;
    path: string;
    purpose: string;
  }>;
  handoff: {
    summary: string;
    nextStep: string;
    verificationCommands: string[];
    changedFiles: Array<{ status: string; path: string }>;
    recentCommits: Array<{ hash: string; date: string; subject: string }>;
  };
  readiness: {
    score: number;
    status: "seed" | "partial" | "ready";
    summary: string;
  };
};

function inferCategory(relativePath: string): ContextPackLite["project"]["category"] {
  const normalized = relativePath.replace(/\\/g, "/").toLowerCase();
  if (!normalized || normalized === "." || normalized === "mc-operator") {
    return "root";
  }
  if (normalized.startsWith("studyspace")) return "studyspace";
  if (normalized.startsWith("venturespace/projects")) return "projects";
  if (normalized.includes("archive")) return "archive";
  if (normalized.includes("tool")) return "tools";
  return "projects";
}

function runGit(projectRoot: string, args: string[]) {
  try {
    return execFileSync("git", ["-C", projectRoot, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

@Injectable()
export class ContextExportService {
  constructor(private readonly projectPaths: ProjectPathsService) {}

  private toFocusType(value: unknown): ContextFocusType {
    const normalized = String(value || "").trim() as ContextFocusType;
    return VALID_FOCUS_TYPES.has(normalized) ? normalized : "workspace";
  }

  private toTier(value: unknown): ContextTier {
    const normalized = String(value || "").trim() as ContextTier;
    return VALID_TIERS.has(normalized) ? normalized : "overview";
  }

  private focusLabel(focusType: ContextFocusType) {
    switch (focusType) {
      case "doc_focus":
        return "Document Focus";
      case "quest_focus":
        return "Quest Focus";
      case "graph_focus":
        return "Graph Focus";
      default:
        return "Workspace";
    }
  }

  private readVerificationCommands(projectRoot: string) {
    const packageJsonPath = path.join(projectRoot, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
      return [] as string[];
    }

    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
        scripts?: Record<string, string>;
      };
      const scripts = pkg.scripts || {};
      const preferred = ["typecheck", "lint", "test", "build"];
      return preferred
        .filter((name) => Boolean(scripts[name]))
        .map((name) => `npm run ${name}`);
    } catch {
      return [];
    }
  }

  private readChangedFiles(projectRoot: string) {
    const status = runGit(projectRoot, ["status", "--short"]);
    if (!status) return [] as Array<{ status: string; path: string }>;
    return status
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .slice(0, 12)
      .map((line) => ({
        status: line.slice(0, 2).trim() || "??",
        path: line.slice(3).trim(),
      }));
  }

  private readRecentCommits(projectRoot: string) {
    const raw = runGit(projectRoot, ["log", "--pretty=format:%h%x09%cs%x09%s", "-n", "5"]);
    if (!raw) return [] as Array<{ hash: string; date: string; subject: string }>;
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [hash, date, ...subjectParts] = line.split("\t");
        return {
          hash: String(hash || "").trim(),
          date: String(date || "").trim(),
          subject: subjectParts.join("\t").trim(),
        };
      })
      .filter((item) => item.hash);
  }

  private buildContextFiles(focusType: ContextFocusType) {
    const basePath = ".openclaw/context";
    const files = [
      {
        label: "Project Context",
        path: `${basePath}/PROJECT_CONTEXT.md`,
        purpose: "Project-level contract and intent.",
      },
      {
        label: "Collaboration Guide",
        path: `${basePath}/COLLABORATION_GUIDE.md`,
        purpose: "How Docs, Quests, Reports, and Prompt Pack should be maintained together.",
      },
      {
        label: "Repo Map",
        path: `${basePath}/REPO_MAP.md`,
        purpose: "Stack, routes, scripts, and key files.",
      },
      {
        label: "Active Context",
        path: `${basePath}/ACTIVE_CONTEXT.md`,
        purpose: "Current working brief for the active project.",
      },
      {
        label: "Prompt Pack",
        path: `${basePath}/PROMPT_PACK.md`,
        purpose: "Focused implementation brief for the active session.",
      },
      {
        label: "Session Handoff",
        path: `${basePath}/SESSION_HANDOFF.md`,
        purpose: "Compact summary and next step for the next session.",
      },
    ];

    if (focusType === "doc_focus") {
      files.push({
        label: "Doc Focus",
        path: `${basePath}/DOC_FOCUS.md`,
        purpose: "Doc-focused context.",
      });
    } else if (focusType === "quest_focus") {
      files.push({
        label: "Quest Focus",
        path: `${basePath}/QUEST_FOCUS.md`,
        purpose: "Quest-focused context.",
      });
    } else if (focusType === "graph_focus") {
      files.push({
        label: "Graph Focus",
        path: `${basePath}/GRAPH_FOCUS.md`,
        purpose: "Graph-cluster context.",
      });
    }

    return files;
  }

  buildContextPack(input: {
    projectId?: unknown;
    focusType?: unknown;
    focusId?: unknown;
    tier?: unknown;
  }) {
    const projectId = this.projectPaths.resolveProjectId(input.projectId);
    const projectRoot = this.projectPaths.resolveProjectRoot(projectId);
    const projectName = path.basename(projectRoot) || projectId;
    const relativePath = this.projectPaths.resolveProjectRelativePath(projectRoot) || projectId;
    const focusType = this.toFocusType(input.focusType);
    const focusId = String(input.focusId || "").trim() || undefined;
    const tier = this.toTier(input.tier);

    const verificationCommands = this.readVerificationCommands(projectRoot);
    const changedFiles = this.readChangedFiles(projectRoot);
    const recentCommits = this.readRecentCommits(projectRoot);
    const contextFiles = this.buildContextFiles(focusType);

    const readinessScore = Math.max(
      35,
      Math.min(
        95,
        45 +
          (verificationCommands.length > 0 ? 20 : 0) +
          (recentCommits.length > 0 ? 10 : 0) +
          (contextFiles.length >= 6 ? 10 : 0),
      ),
    );
    const readinessStatus =
      readinessScore >= 80 ? "ready" : readinessScore >= 50 ? "partial" : "seed";

    const pack: ContextPackLite = {
      timestamp: new Date().toISOString(),
      tier,
      project: {
        id: projectId,
        name: projectName,
        relativePath,
        category: inferCategory(relativePath),
      },
      scope: {
        type: focusType,
        label: this.focusLabel(focusType),
        id: focusId,
      },
      objective:
        focusType === "workspace"
          ? `Resume implementation in ${projectName} using current project context and active verification gates.`
          : `Resume ${this.focusLabel(focusType).toLowerCase()} work in ${projectName} with a bounded implementation step.`,
      suggestedAction:
        verificationCommands.length > 0
          ? `Implement one bounded change, then run: ${verificationCommands.slice(0, 2).join(" then ")}.`
          : "Implement one bounded change, then run the smallest available project checks.",
      successCriteria: [
        "Change is implemented with bounded scope.",
        "Relevant checks are executed and outcomes recorded.",
        "Session handoff includes next concrete step.",
      ],
      contextFiles,
      handoff: {
        summary: `${projectName} context pack generated for ${this.focusLabel(focusType).toLowerCase()}.`,
        nextStep:
          changedFiles.length > 0
            ? "Stabilize current changed files and run verification before adding new scope."
            : "Start the next bounded implementation slice, then verify and record outcomes.",
        verificationCommands,
        changedFiles,
        recentCommits,
      },
      readiness: {
        score: readinessScore,
        status: readinessStatus,
        summary:
          readinessStatus === "ready"
            ? "Project has sufficient context and verification hooks for efficient execution."
            : readinessStatus === "partial"
              ? "Project is usable, but some context or verification inputs are still thin."
              : "Project context exists, but requires setup before reliable long-session execution.",
      },
    };

    return pack;
  }

  renderContextPackMarkdown(pack: ContextPackLite) {
    const lines = [
      `# ${pack.scope.label}`,
      `Generated: ${pack.timestamp}`,
      `Tier: ${pack.tier}`,
      "",
      "## Project",
      `- ${pack.project.name}`,
      `- Path: ${pack.project.relativePath}`,
      "",
      "## Objective",
      pack.objective,
      "",
      "## Suggested Action",
      pack.suggestedAction,
      "",
      "## Success Criteria",
      ...pack.successCriteria.map((item) => `- ${item}`),
      "",
      "## Readiness",
      `- Score: ${pack.readiness.score}/100 (${pack.readiness.status})`,
      `- ${pack.readiness.summary}`,
      "",
      "## Verification Commands",
      ...(pack.handoff.verificationCommands.length
        ? pack.handoff.verificationCommands.map((command) => `- ${command}`)
        : ["- None detected"]),
      "",
      "## Changed Files",
      ...(pack.handoff.changedFiles.length
        ? pack.handoff.changedFiles.map((item) => `- ${item.status}: ${item.path}`)
        : ["- None detected"]),
      "",
      "## Context Files",
      ...pack.contextFiles.map((file) => `- ${file.path}: ${file.purpose}`),
    ];
    return `${lines.join("\n").trim()}\n`;
  }

  renderSessionHandoffMarkdown(pack: ContextPackLite) {
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
        ? pack.handoff.changedFiles.map((item) => `- ${item.status}: ${item.path}`)
        : ["- None detected"]),
      "",
      "## Recent Commits",
      ...(pack.handoff.recentCommits.length
        ? pack.handoff.recentCommits.map(
            (commit) => `- ${commit.hash} ${commit.date}: ${commit.subject}`,
          )
        : ["- None detected"]),
    ];
    return `${lines.join("\n").trim()}\n`;
  }
}
