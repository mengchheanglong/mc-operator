import path from "path";
import { readdir, stat } from "fs/promises";
import { NextResponse } from "next/server";
import { resolveProjectFromRequest } from "@/server/context/project-context";
import { resolveUserContext } from "@/server/context/user-context";
import { badRequest, serverError } from "@/server/http/api-response";
import { getWorkspaceRootPath } from "@/server/projects/workspace-projects";
import { createAgent, listAgents, updateAgent } from "@/server/repositories/agents-repo";

export const dynamic = "force-dynamic";

type PackSource = "agency-agents" | "arscontexta";

const AGENCY_PREFERRED_PATHS = ["README.md", "playbooks", "workflows", "prompts", "agents", "checklists"];
const ARS_PREFERRED_PATHS = ["README.md", "methodology", "reference", "skills", "skill-sources", "checklists"];

function skillsRootPath() {
  return path.join(getWorkspaceRootPath(), "logs", "skills");
}

async function collectPackAssets(root: string, preferredPaths: string[] = []) {
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
      kind: entry.isDirectory() ? "directory" : "file",
    }));
  } catch {
    return [];
  }
}

function ensureUniqueName(name: string, existing: Set<string>) {
  if (!existing.has(name.toLowerCase())) return name;
  let index = 2;
  while (existing.has(`${name} ${index}`.toLowerCase())) index += 1;
  return `${name} ${index}`;
}

async function buildAgencySeeds() {
  const root = path.join(skillsRootPath(), "agency-agents-curated");
  let entries: Array<{ isDirectory: () => boolean; name: string }> = [];

  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  return Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const label = entry.name.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
        const area = entry.name.replace(/[-_]+/g, " ");
        const packRoot = path.join(root, entry.name);
        const packAssets = await collectPackAssets(packRoot, AGENCY_PREFERRED_PATHS);

        return {
          name: `Agency ${label}`,
          role: "custom" as const,
          description: `Curated agency-agents pack for ${area} workflows and operator playbooks.`,
          executor: "openclaw" as const,
          status: "active" as const,
          area,
          topics: ["agency-agents", "workflow", entry.name],
          sourcePack: "agency-agents" as const,
          sourceRef: `agency-agents/${entry.name}`,
          workflowProfile: {
            mode: "execution" as const,
            objectives: ["Execute role-specific workflow from curated agency pack", "Keep scope constrained to task intent"],
            constraints: ["Prefer verifiable outputs over generic commentary", "Do not change unrelated subsystems"],
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

async function buildArscontextaSeeds() {
  const root = path.join(skillsRootPath(), "arscontexta-curated");
  const sharedAssets = await collectPackAssets(root, ARS_PREFERRED_PATHS);

  return [
    {
      name: "Ars Context Architect",
      role: "planner" as const,
      description: "Converts vague goals into clear context-rich execution plans using arscontexta methodology.",
      executor: "openclaw" as const,
      status: "active" as const,
      area: "planning",
      topics: ["arscontexta", "planning", "context"],
      sourcePack: "arscontexta" as const,
      sourceRef: "arscontexta/context-architect",
      workflowProfile: {
        mode: "planning" as const,
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
      role: "builder" as const,
      description: "Applies arscontexta skill patterns to execute implementation with disciplined scope.",
      executor: "openclaw" as const,
      status: "active" as const,
      area: "implementation",
      topics: ["arscontexta", "implementation", "skills"],
      sourcePack: "arscontexta" as const,
      sourceRef: "arscontexta/delivery-builder",
      workflowProfile: {
        mode: "execution" as const,
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
      role: "reviewer" as const,
      description: "Uses arscontexta quality patterns to review risk, regressions, and verification coverage.",
      executor: "openclaw" as const,
      status: "active" as const,
      area: "quality",
      topics: ["arscontexta", "review", "quality"],
      sourcePack: "arscontexta" as const,
      sourceRef: "arscontexta/quality-reviewer",
      workflowProfile: {
        mode: "review" as const,
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

export async function POST(req: Request) {
  try {
    const user = await resolveUserContext();
    const project = resolveProjectFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const sourcesRaw = Array.isArray(body?.sources) ? body.sources : ["agency-agents", "arscontexta"];
    const sources = sourcesRaw.filter((value: unknown): value is PackSource => value === "agency-agents" || value === "arscontexta");
    const syncExisting = Boolean(body?.syncExisting);

    if (sources.length === 0) {
      return badRequest("At least one pack source is required (agency-agents, arscontexta).");
    }

    const existing = listAgents(user.id, project.id);
    const existingNames = new Set(existing.map((agent) => agent.name.toLowerCase()));

    const seeds: Array<Parameters<typeof createAgent>[2]> = [];

    if (sources.includes("agency-agents")) {
      const agencySeeds = await buildAgencySeeds();
      seeds.push(...agencySeeds);
    }

    if (sources.includes("arscontexta")) {
      seeds.push(...(await buildArscontextaSeeds()));
    }

    const imported: ReturnType<typeof listAgents> = [];
    let updatedCount = 0;

    for (const seed of seeds) {
      const existingAgent = existing.find((agent) =>
        seed.sourceRef
          ? agent.sourceRef === seed.sourceRef
          : agent.name.toLowerCase() === seed.name.toLowerCase(),
      );

      if (existingAgent && syncExisting) {
        const updated = updateAgent(user.id, project.id, existingAgent.id, seed);
        if (updated) {
          imported.push(updated);
          updatedCount += 1;
        }
        continue;
      }

      const name = existingAgent ? ensureUniqueName(seed.name, existingNames) : seed.name;
      existingNames.add(name.toLowerCase());
      imported.push(createAgent(user.id, project.id, { ...seed, name }));
    }

    return NextResponse.json({
      msg: `Imported ${imported.length} agents from ${sources.join(", ")}${syncExisting ? ` (updated ${updatedCount} existing)` : ""}.`,
      agents: imported,
      updatedCount,
    });
  } catch (error) {
    return serverError(error, "Import agent packs error", "Failed to import agent packs.");
  }
}
