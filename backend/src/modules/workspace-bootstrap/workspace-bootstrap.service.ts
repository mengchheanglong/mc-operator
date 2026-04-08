import { Injectable } from "@nestjs/common";
import fs from "node:fs";
import path from "node:path";
import { DocsService } from "../docs/docs.service";
import { QuestsService } from "../quests/quests.service";
import { ProjectPathsService } from "../../infra/project-paths.service";

type BootstrapTemplate = {
  title: string;
  tags: string[];
  matchKeywords: string[];
  content: string;
};

type DocRecord = {
  id: string;
  title: string;
  tags: string[];
};

function docMatchesTemplate(doc: DocRecord, template: BootstrapTemplate) {
  const haystack = `${doc.title} ${doc.tags.join(" ")}`.toLowerCase();
  return template.matchKeywords.some((keyword) => haystack.includes(keyword));
}

function readStackLine(projectRoot: string) {
  const packageJsonPath = path.join(projectRoot, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return "Fill in the current stack";
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
    };
    const stack: string[] = [];
    if (deps.next) stack.push("Next.js");
    if (deps.react) stack.push("React");
    if (deps.typescript || fs.existsSync(path.join(projectRoot, "tsconfig.json"))) {
      stack.push("TypeScript");
    }
    if (deps["@nestjs/core"]) stack.push("NestJS");
    if (deps["better-sqlite3"]) stack.push("SQLite");
    if (stack.length === 0) return "Fill in the current stack";
    return stack.join(", ");
  } catch {
    return "Fill in the current stack";
  }
}

function buildTemplates(stackLine: string): BootstrapTemplate[] {
  return [
    {
      title: "Workspace Charter",
      tags: ["foundation", "context"],
      matchKeywords: ["charter", "context", "mission", "brief"],
      content: [
        "# Workspace Charter",
        "",
        "## Mission",
        "Describe what this project should achieve.",
        "",
        "## Product Direction",
        "Define how this workspace should support human + agent execution.",
        "",
        "## Constraints",
        "- Technical constraints",
        "- Product constraints",
        "- Workflow constraints",
      ].join("\n"),
    },
    {
      title: "Architecture Map",
      tags: ["architecture", "system"],
      matchKeywords: ["architecture", "system", "overview", "map"],
      content: [
        "# Architecture Map",
        "",
        "## Current Stack",
        `- ${stackLine}`,
        "",
        "## Main Components",
        "- Backend services",
        "- UI surfaces",
        "- Data storage",
        "",
        "## Decisions",
        "- Record durable architecture decisions here.",
      ].join("\n"),
    },
    {
      title: "Delivery Workflow",
      tags: ["workflow", "process"],
      matchKeywords: ["workflow", "process", "operating model"],
      content: [
        "# Delivery Workflow",
        "",
        "1. Intake requirement",
        "2. Build bounded slice",
        "3. Verify with checks",
        "4. Record outcome",
      ].join("\n"),
    },
    {
      title: "Definition of Done",
      tags: ["quality", "workflow"],
      matchKeywords: ["definition of done", "quality", "ship"],
      content: [
        "# Definition of Done",
        "",
        "A task is done when:",
        "- behavior is implemented",
        "- checks pass",
        "- docs are updated if needed",
        "- follow-up is explicit",
      ].join("\n"),
    },
    {
      title: "Decision Log",
      tags: ["decision", "adr"],
      matchKeywords: ["decision", "adr", "architecture decision"],
      content: [
        "# Decision Log",
        "",
        "## Entry Template",
        "- Date:",
        "- Decision:",
        "- Context:",
        "- Consequences:",
      ].join("\n"),
    },
    {
      title: "IDE Agent Setup",
      tags: ["workflow", "ide", "assistant"],
      matchKeywords: ["ide agent", "codex", "cursor", "assistant setup"],
      content: [
        "# IDE Agent Setup",
        "",
        "## Agents",
        "- Codex",
        "- OpenClaw",
        "- Claude",
        "",
        "## Verification Commands",
        "- npm run typecheck",
        "- npm run lint",
        "- npm run build",
      ].join("\n"),
    },
  ];
}

@Injectable()
export class WorkspaceBootstrapService {
  constructor(
    private readonly docsService: DocsService,
    private readonly questsService: QuestsService,
    private readonly projectPaths: ProjectPathsService,
  ) {}

  private ensureCodeIntelOverride(projectRoot: string) {
    const overridePath = path.join(projectRoot, ".openclaw", "project-intel.json");
    if (fs.existsSync(overridePath)) {
      return;
    }
    fs.mkdirSync(path.dirname(overridePath), { recursive: true });
    fs.writeFileSync(
      overridePath,
      `${JSON.stringify(
        {
          codeIntel: {
            notes: [
              "Use this file for project-specific semantic tooling overrides.",
            ],
            suggestions: [],
            tools: [],
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  bootstrap(projectIdRaw?: unknown) {
    const projectId = this.projectPaths.resolveProjectId(projectIdRaw);
    const projectRoot = this.projectPaths.resolveProjectRoot(projectId);
    const templates = buildTemplates(readStackLine(projectRoot));

    const existingDocs = this.docsService.list({
      projectId,
      limit: 500,
    }) as Array<DocRecord>;

    const createdDocs: Array<{ id: string; title: string }> = [];
    for (const template of templates) {
      const alreadyCovered = existingDocs.some((doc) =>
        docMatchesTemplate(doc, template),
      );
      if (alreadyCovered) {
        continue;
      }

      const createdDoc = this.docsService.create({
        projectId,
        title: template.title,
        content: template.content,
        tags: template.tags,
        fileType: ".md",
      }) as { id: string; title: string };

      createdDocs.push({ id: createdDoc.id, title: createdDoc.title });
      existingDocs.push({
        id: createdDoc.id,
        title: createdDoc.title,
        tags: template.tags,
      });
    }

    let createdQuest: { id: string; goal: string } | null = null;
    const openQuests = this.questsService.list({
      projectId,
      status: "open",
      limit: 50,
    }) as Array<{ id?: string; goal?: string }>;
    if (openQuests.length === 0 && createdDocs.length > 0) {
      const quest = this.questsService.create({
        projectId,
        goal: "Customize the collaboration starter docs for this project",
        difficulty: "easy",
        status: "open",
        area: "automation",
        topics: ["workflow", "docs", "bootstrap"],
      }) as { id: string; goal: string };
      createdQuest = { id: quest.id, goal: quest.goal };
    }

    this.ensureCodeIntelOverride(projectRoot);

    if (createdDocs.length === 0 && !createdQuest) {
      return {
        msg: "The workspace already has the core collaboration scaffold.",
        createdDocs: [],
        createdQuest: null,
        firstDocId: null,
      };
    }

    return {
      msg: "Workspace bootstrap complete.",
      createdDocs,
      createdQuest,
      firstDocId: createdDocs[0]?.id || null,
    };
  }
}
