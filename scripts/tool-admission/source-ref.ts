const LEGACY_AGENT_LAB_EXTRACTION_PREFIX =
  "directive-workspace/discovery/agent-lab-extraction/";

function buildLegacyAdmissionSourceRef(relativePath: string) {
  return `${LEGACY_AGENT_LAB_EXTRACTION_PREFIX}${relativePath}`;
}

const LEGACY_SOURCE_REF_ALIASES: Record<string, string[]> = {
  "directive-workspace/forge/source-packs/agency-agents": [
    buildLegacyAdmissionSourceRef("tooling/agency-agents"),
  ],
  "directive-workspace/forge/source-packs/agent-orchestrator": [
    buildLegacyAdmissionSourceRef("tooling/agent-orchestrator"),
  ],
  "directive-workspace/forge/source-packs/arscontexta": [
    buildLegacyAdmissionSourceRef("tooling/arscontexta"),
  ],
  "directive-workspace/forge/source-packs/promptfoo": [
    buildLegacyAdmissionSourceRef("tooling/promptfoo"),
  ],
  "directive-workspace/forge/source-packs/puppeteer": [
    buildLegacyAdmissionSourceRef("tooling/puppeteer"),
  ],
  "directive-workspace/forge/source-packs/software-design-philosophy-skill": [
    buildLegacyAdmissionSourceRef("tooling/software-design-philosophy-skill"),
  ],
  "directive-workspace/forge/source-packs/superpowers": [
    buildLegacyAdmissionSourceRef("tooling/superpowers"),
  ],
  "directive-workspace/forge/source-packs/scripts": [
    buildLegacyAdmissionSourceRef("tooling/scripts"),
  ],
  "directive-workspace/forge/source-packs/skills-manager": [
    buildLegacyAdmissionSourceRef("tooling/skills-manager"),
  ],
  "directive-workspace/forge/source-packs/desloppify": [
    buildLegacyAdmissionSourceRef("tooling-parked/desloppify"),
  ],
  "directive-workspace/forge/source-packs/celtrix": [
    buildLegacyAdmissionSourceRef("tooling-parked/Celtrix"),
  ],
  "directive-workspace/architecture/03-adopted/2026-03-21-hermes-wave-02-adopted.md":
    [buildLegacyAdmissionSourceRef("tooling-parked/hermes-agent")],
  "directive-workspace/forge/follow-up/2026-03-20-autoresearch-cutover-closure.md":
    [buildLegacyAdmissionSourceRef("tooling-parked/autoresearch")],
  "directive-workspace/forge/follow-up/2026-03-20-cli-anything-forge-follow-up-record.md":
    [buildLegacyAdmissionSourceRef("tooling-parked/CLI-Anything")],
  "directive-workspace/architecture/03-adopted/2026-03-21-codegraphcontext-wave-02-adopted.md":
    [buildLegacyAdmissionSourceRef("tooling-parked/CodeGraphContext")],
};

function normalizeRepoPath(repoPath: string) {
  const normalized = String(repoPath || "").trim().replace(/^[/\\]+/, "");
  if (normalized.startsWith("directive-workspace/")) {
    return normalized;
  }
  if (normalized.startsWith("agent-lab/")) {
    return normalized.slice("agent-lab/".length);
  }
  return normalized;
}

export function buildDirectiveWorkspaceAdmissionSourceRef(repoPath: string) {
  const normalized = normalizeRepoPath(repoPath);
  if (normalized.startsWith("directive-workspace/")) {
    return normalized;
  }
  return buildLegacyAdmissionSourceRef(normalized);
}

export function buildCompatibleAdmissionSourceRefs(repoPath: string) {
  const canonical = buildDirectiveWorkspaceAdmissionSourceRef(repoPath);
  return [...new Set([canonical, ...(LEGACY_SOURCE_REF_ALIASES[canonical] || [])])];
}
