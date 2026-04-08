import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { Injectable } from "@nestjs/common";
import { AgentsCatalogService } from "../agents-catalog/agents-catalog.service";
import {
  getForgeImportSourcePolicyEntryFromBackendCwd,
  getForgeSourcePackCatalogEntryFromBackendCwd,
  listForgeImportSourcePolicyEntriesFromBackendCwd,
  resolveArscontextaSourceRootFromBackendCwd,
  resolveCeltrixRootFromBackendCwd,
  resolveDesignPhilosophySkillRootFromBackendCwd,
  resolveImpeccableRootFromBackendCwd,
  resolveAgencyAgentsSourceRootFromBackendCwd,
  resolveAgentOrchestratorRootFromBackendCwd,
  resolveSkillsManagerRootFromBackendCwd,
  resolveSuperpowersRootFromBackendCwd,
} from "../../infra/paths/directive-source-packs";

const PACK_SOURCES = [
  "agency-agents",
  "arscontexta",
  "agent-orchestrator",
  "superpowers",
  "software-design-philosophy-skill",
  "skills-manager",
  "impeccable",
  "celtrix",
] as const;

type PackSource = (typeof PACK_SOURCES)[number];

const AGENCY_PREFERRED_PATHS = ["README.md", "engineering", "testing", "specialized", "strategy"];
const ARS_PREFERRED_PATHS = ["README.md", "methodology", "reference", "skills", "skill-sources"];
const AO_PREFERRED_PATHS = ["README.md", "ARCHITECTURE.md", "examples", "docs", "packages/cli/src/commands"];
const SUPERPOWERS_PREFERRED_PATHS = ["README.md", "skills", "commands", "docs", "agents"];
const DESIGN_SKILL_PREFERRED_PATHS = ["README.md", "SKILL.md"];
const SKILLS_MANAGER_PREFERRED_PATHS = ["README.md", "scripts", "src", "assets"];
const IMPECCABLE_PREFERRED_PATHS = ["README.md", "AGENTS.md", "DEVELOP.md", "source", "scripts"];
const CELTRIX_PREFERRED_PATHS = ["WORKFLOWS.md", "commands", "templates", "scripts", "FAQ.md"];

const PACK_SOURCE_SET = new Set<string>(PACK_SOURCES);

export class AgentsImportPacksError extends Error {
  reason: string;
  status: number;
  details: Record<string, unknown>;

  constructor(input: {
    message: string;
    reason: string;
    status: number;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.reason = input.reason;
    this.status = input.status;
    this.details = input.details || {};
  }
}

@Injectable()
export class AgentsImportPacksService {
  constructor(private readonly agentsCatalogService: AgentsCatalogService) {}

  private listSupportedSourcePolicyEntries() {
    return listForgeImportSourcePolicyEntriesFromBackendCwd().filter((entry) =>
      PACK_SOURCE_SET.has(entry.id),
    );
  }

  private listDefaultSources(): PackSource[] {
    return this.listSupportedSourcePolicyEntries()
      .filter((entry) => entry.availability === "default_import")
      .map((entry) => entry.id as PackSource);
  }

  private listImportableSources(): PackSource[] {
    return this.listSupportedSourcePolicyEntries()
      .filter((entry) => entry.availability !== "blocked")
      .map((entry) => entry.id as PackSource);
  }

  private describeImportableSources() {
    return this.listImportableSources().join(", ");
  }

  private ensureSourceImportAllowed(source: PackSource, explicitRequest: boolean) {
    const policyEntry = getForgeImportSourcePolicyEntryFromBackendCwd(source);
    if (!policyEntry) {
      throw new AgentsImportPacksError({
        message: `No Forge import-source policy entry exists for ${source}.`,
        reason: "source_policy_invalid",
        status: 500,
        details: { source },
      });
    }

    const catalogEntry = getForgeSourcePackCatalogEntryFromBackendCwd([source]);
    if (!catalogEntry) {
      throw new AgentsImportPacksError({
        message: `No Forge source-pack catalog entry exists for ${source}.`,
        reason: "source_policy_invalid",
        status: 500,
        details: { source },
      });
    }

    const importModeAllowed = explicitRequest
      ? policyEntry.availability !== "blocked"
      : policyEntry.availability === "default_import";

    if (!importModeAllowed) {
      throw new AgentsImportPacksError({
        message: `${source} is blocked for the current import mode.`,
        reason: "source_blocked",
        status: 409,
        details: {
          source,
          availability: policyEntry.availability,
          explicitRequest,
        },
      });
    }

    if (
      catalogEntry.classification !== policyEntry.requiredClassification ||
      catalogEntry.activationMode !== policyEntry.requiredActivationMode
    ) {
      throw new AgentsImportPacksError({
        message: `${source} does not match the active Forge import-source policy.`,
        reason: "source_policy_invalid",
        status: 409,
        details: {
          source,
          catalogClassification: catalogEntry.classification,
          catalogActivationMode: catalogEntry.activationMode,
          requiredClassification: policyEntry.requiredClassification,
          requiredActivationMode: policyEntry.requiredActivationMode,
        },
      });
    }
  }

  private async ensureSourceRootAvailable(source: PackSource, root: string) {
    try {
      const info = await stat(root);
      if (!info.isDirectory()) {
        throw new Error("not_directory");
      }
    } catch {
      throw new AgentsImportPacksError({
        message: `${source} pack root is not available for import.`,
        reason: "source_unavailable",
        status: 409,
        details: { source, root },
      });
    }
  }

  private resolvePackRoot(source: Exclude<PackSource, "agent-orchestrator">) {
    if (source === "agency-agents") {
      return resolveAgencyAgentsSourceRootFromBackendCwd();
    }
    return resolveArscontextaSourceRootFromBackendCwd();
  }

  private resolveAgentOrchestratorRoot() {
    return resolveAgentOrchestratorRootFromBackendCwd();
  }

  private resolvePromotePackRoot(
    source: "superpowers" | "software-design-philosophy-skill" | "skills-manager" | "impeccable" | "celtrix",
  ) {
    if (source === "superpowers") return resolveSuperpowersRootFromBackendCwd();
    if (source === "software-design-philosophy-skill") {
      return resolveDesignPhilosophySkillRootFromBackendCwd();
    }
    if (source === "skills-manager") return resolveSkillsManagerRootFromBackendCwd();
    if (source === "impeccable") return resolveImpeccableRootFromBackendCwd();
    return resolveCeltrixRootFromBackendCwd();
  }

  private async collectPackAssets(root: string, preferredPaths: string[] = []) {
    const assets: Array<{ label: string; path: string; kind: "file" | "directory" }> = [];

    for (const relPath of preferredPaths) {
      const fullPath = path.join(root, relPath);
      try {
        const info = await stat(fullPath);
        assets.push({
          label: relPath,
          path: fullPath,
          kind: info.isDirectory() ? "directory" : "file",
        });
      } catch {}
    }

    if (assets.length > 0) return assets;

    try {
      const entries = await readdir(root, { withFileTypes: true });
      return entries.slice(0, 8).map((entry) => ({
        label: entry.name,
        path: path.join(root, entry.name),
        kind: entry.isDirectory() ? ("directory" as const) : ("file" as const),
      }));
    } catch {
      return [];
    }
  }

  private ensureUniqueName(name: string, existing: Set<string>) {
    if (!existing.has(name.toLowerCase())) return name;
    let index = 2;
    while (existing.has(`${name} ${index}`.toLowerCase())) index += 1;
    return `${name} ${index}`;
  }

  private async buildAgencySeeds() {
    const root = this.resolvePackRoot("agency-agents");
    await this.ensureSourceRootAvailable("agency-agents", root);
    let entries: Array<{ isDirectory: () => boolean; name: string }> = [];

    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      return [];
    }

    return Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .slice(0, 16)
        .map(async (entry) => {
          const label = entry.name.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
          const area = entry.name.replace(/[-_]+/g, " ");
          const packRoot = path.join(root, entry.name);
          const packAssets = await this.collectPackAssets(packRoot, AGENCY_PREFERRED_PATHS);

          return {
            name: `Agency ${label}`,
            role: "custom",
            description: `Curated agency-agents pack for ${area} workflows and operator playbooks.`,
            executor: "openclaw",
            status: "active",
            area,
            topics: ["agency-agents", "workflow", entry.name],
            sourcePack: "agency-agents",
            sourceRef: `agency-agents/${entry.name}`,
            workflowProfile: {
              mode: "execution",
              objectives: [
                "Execute role-specific workflow from curated agency pack",
                "Keep scope constrained to task intent",
              ],
              constraints: [
                "Prefer verifiable outputs over generic commentary",
                "Do not change unrelated subsystems",
              ],
              deliverables: ["Changed files summary", "Verification evidence", "Follow-up actions"],
            },
            packAssets,
            systemPrompt: [
              `You are the Agency ${label} operator for Mission Control.`,
              `Use the curated pack under ${packRoot} as style and workflow guidance.`,
              "Keep work scoped, verifiable, and report changed files plus follow-up.",
            ].join("\n"),
          };
        }),
    );
  }

  private async buildArscontextaSeeds() {
    const root = this.resolvePackRoot("arscontexta");
    await this.ensureSourceRootAvailable("arscontexta", root);
    const sharedAssets = await this.collectPackAssets(root, ARS_PREFERRED_PATHS);

    return [
      {
        name: "Ars Context Architect",
        role: "planner",
        description: "Converts vague goals into clear context-rich execution plans using arscontexta methodology.",
        executor: "openclaw",
        status: "active",
        area: "planning",
        topics: ["arscontexta", "planning", "context"],
        sourcePack: "arscontexta",
        sourceRef: "arscontexta/context-architect",
        workflowProfile: {
          mode: "planning",
          objectives: ["Clarify scope and constraints before implementation", "Produce checkable plan with acceptance criteria"],
          constraints: ["Avoid speculative architecture drift", "Surface assumptions explicitly"],
          deliverables: ["Task breakdown", "Acceptance criteria", "Risk notes"],
        },
        packAssets: sharedAssets,
        systemPrompt: [
          "You are the Ars Context Architect.",
          `Use curated references from ${root} to structure context before implementation starts.`,
          "Always return scope, assumptions, acceptance criteria, and concrete next actions.",
        ].join("\n"),
      },
      {
        name: "Ars Delivery Builder",
        role: "builder",
        description: "Applies arscontexta skill patterns to execute implementation with disciplined scope.",
        executor: "openclaw",
        status: "active",
        area: "implementation",
        topics: ["arscontexta", "implementation", "skills"],
        sourcePack: "arscontexta",
        sourceRef: "arscontexta/delivery-builder",
        workflowProfile: {
          mode: "execution",
          objectives: ["Implement scoped change with minimal blast radius", "Verify behavior before reporting"],
          constraints: ["No broad refactors unless explicitly requested", "Prefer root-cause fixes"],
          deliverables: ["Changed files", "Validation performed", "Follow-up risks"],
        },
        packAssets: sharedAssets,
        systemPrompt: [
          "You are the Ars Delivery Builder.",
          `Follow curated skills and references under ${root} when executing changes.`,
          "Prefer minimal-impact fixes, verify behavior, and summarize changed files + checks.",
        ].join("\n"),
      },
      {
        name: "Ars Quality Reviewer",
        role: "reviewer",
        description: "Uses arscontexta quality patterns to review risk, regressions, and verification coverage.",
        executor: "openclaw",
        status: "active",
        area: "quality",
        topics: ["arscontexta", "review", "quality"],
        sourcePack: "arscontexta",
        sourceRef: "arscontexta/quality-reviewer",
        workflowProfile: {
          mode: "review",
          objectives: ["Find regressions and missing verification", "Prioritize high-impact defects"],
          constraints: ["Avoid style-only feedback", "Tie findings to observable behavior"],
          deliverables: ["Risk-ranked findings", "Evidence and repro notes", "Recommended fixes"],
        },
        packAssets: sharedAssets,
        systemPrompt: [
          "You are the Ars Quality Reviewer.",
          `Use curated methodology under ${root} to evaluate risk and verification completeness.`,
          "Prioritize defects, regressions, and missing checks over stylistic suggestions.",
        ].join("\n"),
      },
    ];
  }

  private async buildAgentOrchestratorSeeds() {
    let root: string;
    try {
      root = this.resolveAgentOrchestratorRoot();
    } catch (error) {
      throw new AgentsImportPacksError({
        message: "agent-orchestrator is blocked for import until the Forge-owned pack is runtime-live.",
        reason: "source_blocked",
        status: 409,
        details: {
          source: "agent-orchestrator",
          error: String((error as Error)?.message || "directive_source_pack_inactive"),
        },
      });
    }
    await this.ensureSourceRootAvailable("agent-orchestrator", root);
    const sharedAssets = await this.collectPackAssets(root, AO_PREFERRED_PATHS);

    return [
      {
        name: "AO Parallel Builder",
        role: "builder",
        description: "Spawns and supervises agent-orchestrator sessions for parallel implementation work.",
        executor: "openclaw",
        backend: "agent-orchestrator",
        status: "active",
        area: "parallel execution",
        topics: ["agent-orchestrator", "parallelism", "handoff"],
        sourcePack: "native",
        sourceRef: "agent-orchestrator/parallel-builder",
        workflowProfile: {
          mode: "execution",
          objectives: ["Parallelize independent work safely", "Preserve branch/session traceability"],
          constraints: ["Do not mix unrelated work in one run", "Report session IDs and branch outcomes"],
          deliverables: ["Session snapshot", "Completed scope", "Escalations requiring human decision"],
        },
        packAssets: sharedAssets,
        systemPrompt: [
          "You are the AO Parallel Builder.",
          `Use references under ${root} to run task execution via agent-orchestrator with clear observability.`,
          "Always include session status, progress checkpoints, and concise next actions.",
        ].join("\n"),
      },
    ];
  }

  private async buildSuperpowersSeeds() {
    const root = this.resolvePromotePackRoot("superpowers");
    await this.ensureSourceRootAvailable("superpowers", root);
    const packAssets = await this.collectPackAssets(root, SUPERPOWERS_PREFERRED_PATHS);

    return [
      {
        name: "Superpowers Workflow Operator",
        role: "builder",
        description: "Runs disciplined, skill-driven implementation workflows sourced from the superpowers pack.",
        executor: "openclaw",
        status: "active",
        area: "workflow execution",
        topics: ["superpowers", "workflow", "tdd", "review"],
        sourcePack: "superpowers",
        sourceRef: "superpowers/workflow-operator",
        workflowProfile: {
          mode: "execution",
          objectives: ["Keep execution bounded and test-backed", "Follow explicit workflow checkpoints before completion"],
          constraints: ["No unverified completion claims", "Prioritize minimal, reversible changes"],
          deliverables: ["Changed files", "Verification outputs", "Open risks and next action"],
        },
        packAssets,
        systemPrompt: [
          "You are the Superpowers Workflow Operator.",
          `Use the curated superpowers material under ${root} for planning, execution, review, and verification cadence.`,
          "Apply strict verify-before-complete behavior and provide concrete evidence for each completed step.",
        ].join("\n"),
      },
    ];
  }

  private async buildDesignPhilosophySeeds() {
    const root = this.resolvePromotePackRoot("software-design-philosophy-skill");
    await this.ensureSourceRootAvailable("software-design-philosophy-skill", root);
    const packAssets = await this.collectPackAssets(root, DESIGN_SKILL_PREFERRED_PATHS);

    return [
      {
        name: "Design Philosophy Reviewer",
        role: "reviewer",
        description: "Applies software design philosophy principles for API/module quality and maintainability reviews.",
        executor: "openclaw",
        status: "active",
        area: "design quality",
        topics: ["software-design-philosophy", "review", "architecture"],
        sourcePack: "software-design-philosophy-skill",
        sourceRef: "software-design-philosophy-skill/reviewer",
        workflowProfile: {
          mode: "review",
          objectives: ["Reduce design complexity and ambiguity", "Identify maintainability risks early"],
          constraints: ["Avoid style-only commentary", "Tie findings to concrete behavior or API shape"],
          deliverables: ["Risk-ranked findings", "Suggested design deltas", "Verification guidance"],
        },
        packAssets,
        systemPrompt: [
          "You are the Design Philosophy Reviewer.",
          `Use guidance from ${root} to evaluate module boundaries, API clarity, naming, comments, and complexity.`,
          "Focus on high-impact design defects and actionable fixes.",
        ].join("\n"),
      },
    ];
  }

  private async buildSkillsManagerSeeds() {
    const root = this.resolvePromotePackRoot("skills-manager");
    await this.ensureSourceRootAvailable("skills-manager", root);
    const packAssets = await this.collectPackAssets(root, SKILLS_MANAGER_PREFERRED_PATHS);

    return [
      {
        name: "Skills Lifecycle Operator",
        role: "builder",
        description: "Manages skill inventory and sync workflows across tool surfaces using skills-manager conventions.",
        executor: "openclaw",
        status: "active",
        area: "tooling ops",
        topics: ["skills-manager", "skills", "sync", "governance"],
        sourcePack: "skills-manager",
        sourceRef: "skills-manager/lifecycle-operator",
        workflowProfile: {
          mode: "execution",
          objectives: [
            "Keep project skills deterministic across tools",
            "Preserve policy-safe root precedence and sync behavior",
          ],
          constraints: ["Do not mutate unrelated project files", "Verify root selection and sync outcomes before reporting"],
          deliverables: ["Skill inventory delta", "Sync evidence", "Rollback guidance"],
        },
        packAssets,
        systemPrompt: [
          "You are the Skills Lifecycle Operator.",
          `Use the skills-manager references under ${root} to guide safe skills import/sync and root-selection decisions.`,
          "Report exact operations performed, verification evidence, and any root-conflict warnings.",
        ].join("\n"),
      },
    ];
  }

  private async buildImpeccableSeeds() {
    const root = this.resolvePromotePackRoot("impeccable");
    await this.ensureSourceRootAvailable("impeccable", root);
    const packAssets = await this.collectPackAssets(root, IMPECCABLE_PREFERRED_PATHS);

    return [
      {
        name: "Impeccable UI Builder",
        role: "builder",
        description: "Executes UI-focused implementation with explicit UX structure and verification discipline.",
        executor: "openclaw",
        status: "active",
        area: "ui quality",
        topics: ["impeccable", "ui", "frontend", "verification"],
        profileId: "impeccable-ui",
        sourcePack: "impeccable",
        sourceRef: "impeccable/ui-builder",
        workflowProfile: {
          mode: "execution",
          objectives: ["Deliver UI improvements with clear UX rationale", "Keep changes bounded and reversible"],
          constraints: [
            "No unverified UI claims",
            "Include responsive/accessibility/visual checks in verification",
          ],
          deliverables: ["UX issue summary", "Concrete change plan", "Verification checklist and changed files"],
        },
        packAssets,
        systemPrompt: [
          "You are the Impeccable UI Builder.",
          `Use curated guidance under ${root} to execute high-signal frontend and interaction improvements.`,
          "Provide concise UX issue summary, concrete plan, and verification evidence for responsive, accessibility, and visual regression checks.",
        ].join("\n"),
      },
    ];
  }

  private async buildCeltrixSeeds() {
    const root = this.resolvePromotePackRoot("celtrix");
    await this.ensureSourceRootAvailable("celtrix", root);
    const packAssets = await this.collectPackAssets(root, CELTRIX_PREFERRED_PATHS);

    return [
      {
        name: "Celtrix Prototype Operator",
        role: "builder",
        description: "Runs short agent-prototype bootstrapping sprints to initialize project structure, scripts, and delivery gates.",
        executor: "openclaw",
        status: "active",
        area: "prototype bootstrapping",
        topics: ["celtrix", "bootstrap", "prototype", "setup"],
        sourcePack: "celtrix",
        sourceRef: "celtrix/prototype-operator",
        workflowProfile: {
          mode: "execution",
          objectives: ["Prepare a minimal execution system before feature work", "Lock setup with hard exit criteria and start building immediately"],
          constraints: [
            "Keep setup sprint to essential items only",
            "Avoid over-planning and broad architecture expansion",
          ],
          deliverables: ["Bootstrap checklist", "Generated structure/scripts summary", "Gate results and immediate next build task"],
        },
        packAssets,
        systemPrompt: [
          "You are the Celtrix Prototype Operator.",
          `Use Celtrix references under ${root} to accelerate project setup for agent-first execution.`,
          "Treat setup as a short prototype sprint with strict exit criteria: structure, scripts, verification gates, and first runnable workflow.",
          "Do not over-engineer setup; stop when bootstrap gates pass and hand off to feature execution.",
        ].join("\n"),
      },
    ];
  }

  private parseSources(value: unknown): PackSource[] {
    const rows = Array.isArray(value) ? value : this.listDefaultSources();
    const output = rows.filter(
      (row): row is PackSource => typeof row === "string" && PACK_SOURCE_SET.has(row),
    );
    return output;
  }

  async importPacks(input: { projectId?: unknown; body: Record<string, unknown> }) {
    const sources = this.parseSources(input.body.sources);
    const syncExisting = Boolean(input.body.syncExisting);
    const explicitRequest = Array.isArray(input.body.sources);

    if (!sources.length) {
      throw new AgentsImportPacksError({
        message:
          `At least one importable pack source is required (${this.describeImportableSources()}).`,
        reason: "missing_sources",
        status: 400,
      });
    }

    for (const source of sources) {
      this.ensureSourceImportAllowed(source, explicitRequest);
    }

    const current = await this.agentsCatalogService.list({ projectId: input.projectId });
    const existing = current.agents;
    const existingNames = new Set(existing.map((agent) => agent.name.toLowerCase()));

    const seeds: Array<Record<string, unknown>> = [];

    if (sources.includes("agency-agents")) {
      seeds.push(...(await this.buildAgencySeeds()));
    }
    if (sources.includes("arscontexta")) {
      seeds.push(...(await this.buildArscontextaSeeds()));
    }
    if (sources.includes("agent-orchestrator")) {
      seeds.push(...(await this.buildAgentOrchestratorSeeds()));
    }
    if (sources.includes("superpowers")) {
      seeds.push(...(await this.buildSuperpowersSeeds()));
    }
    if (sources.includes("software-design-philosophy-skill")) {
      seeds.push(...(await this.buildDesignPhilosophySeeds()));
    }
    if (sources.includes("skills-manager")) {
      seeds.push(...(await this.buildSkillsManagerSeeds()));
    }
    if (sources.includes("impeccable")) {
      seeds.push(...(await this.buildImpeccableSeeds()));
    }
    if (sources.includes("celtrix")) {
      seeds.push(...(await this.buildCeltrixSeeds()));
    }

    const imported: Array<Record<string, unknown>> = [];
    let updatedCount = 0;

    for (const seed of seeds) {
      const sourceRef = typeof seed.sourceRef === "string" ? seed.sourceRef : "";
      const name = typeof seed.name === "string" ? seed.name : "";
      const existingAgent = existing.find((agent) =>
        sourceRef ? agent.sourceRef === sourceRef : agent.name.toLowerCase() === name.toLowerCase(),
      );

      if (existingAgent && syncExisting) {
        const updated = await this.agentsCatalogService.update({
          projectId: input.projectId,
          agentId: existingAgent.id,
          body: seed,
        });
        if (updated.agent) {
          imported.push(updated.agent as unknown as Record<string, unknown>);
          updatedCount += 1;
        }
        continue;
      }

      const uniqueName = existingAgent ? this.ensureUniqueName(name, existingNames) : name;
      existingNames.add(uniqueName.toLowerCase());
      const created = await this.agentsCatalogService.create({
        projectId: input.projectId,
        body: { ...seed, name: uniqueName },
      });
      if (created.agent) {
        imported.push(created.agent as unknown as Record<string, unknown>);
      }
    }

    return {
      msg: `Imported ${imported.length} agents from ${sources.join(", ")}${syncExisting ? ` (updated ${updatedCount} existing)` : ""}.`,
      agents: imported,
      updatedCount,
    };
  }
}
