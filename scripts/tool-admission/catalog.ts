import type { ToolAdmissionInput } from "./rubric.ts";

export const TOOL_ADMISSION_CATALOG: ToolAdmissionInput[] = [
  {
    tool: "agent-orchestrator",
    repoPath: "directive-workspace/forge/source-packs/agent-orchestrator",
    criteria: {
      workflowFit: { score: 9.2, evidence: "Directly maps to Mission Control multi-agent orchestration loops." },
      integrationComplexity: { score: 7.1, evidence: "Adapters mostly align; moderate glue code needed." },
      runtimeReliability: { score: 8.6, evidence: "Stable run behavior in recent bounded spikes." },
      maintenanceBurden: { score: 7.4, evidence: "Contained dependency surface and active upkeep." },
      costTokenImpact: { score: 7.9, evidence: "Net token savings from better routing and context control." },
      productivityGain: { score: 9, evidence: "Significant cycle-time reduction in supervised execution." },
    },
  },
  {
    tool: "agency-agents",
    repoPath: "directive-workspace/forge/source-packs/agency-agents",
    criteria: {
      workflowFit: { score: 8.8, evidence: "Specialist personas fit existing prompt-pack workflows." },
      integrationComplexity: { score: 8.1, evidence: "Low integration friction; mostly profile ingestion." },
      runtimeReliability: { score: 8, evidence: "Deterministic outputs when contracts are constrained." },
      maintenanceBurden: { score: 7.2, evidence: "Main work is periodic profile hygiene." },
      costTokenImpact: { score: 7.4, evidence: "Small token overhead; net positive from better first-pass quality." },
      productivityGain: { score: 8.6, evidence: "Reduces setup time for repeated specialist tasks." },
    },
  },
  {
    tool: "arscontexta",
    repoPath: "directive-workspace/forge/source-packs/arscontexta",
    criteria: {
      workflowFit: { score: 8.2, evidence: "Context modeling patterns transfer well to long-lived missions." },
      integrationComplexity: { score: 6.1, evidence: "Requires careful schema mapping into current memory lanes." },
      runtimeReliability: { score: 7.6, evidence: "Reliable when context windows are bounded." },
      maintenanceBurden: { score: 6.4, evidence: "Ongoing curation effort for taxonomy drift." },
      costTokenImpact: { score: 7.1, evidence: "Improves retrieval precision, reducing wasted tokens." },
      productivityGain: { score: 7.9, evidence: "Faster context recall during deep tasks." },
    },
  },
  {
    tool: "promptfoo",
    repoPath: "directive-workspace/forge/source-packs/promptfoo",
    criteria: {
      workflowFit: { score: 8.9, evidence: "Native fit for eval/regression guardrails." },
      integrationComplexity: { score: 7.8, evidence: "Already partially integrated; extension is straightforward." },
      runtimeReliability: { score: 8.4, evidence: "Predictable CI behavior and mature runners." },
      maintenanceBurden: { score: 7.7, evidence: "Stable upstream; low churn in configs." },
      costTokenImpact: { score: 6.9, evidence: "Eval runs cost tokens but prevent expensive regressions." },
      productivityGain: { score: 8.5, evidence: "Accelerates release confidence." },
    },
  },
  {
    tool: "puppeteer",
    repoPath: "directive-workspace/forge/source-packs/puppeteer",
    criteria: {
      workflowFit: { score: 8.5, evidence: "Critical for real-browser automation validation." },
      integrationComplexity: { score: 7.2, evidence: "Infra hooks mostly present in current stack." },
      runtimeReliability: { score: 7.5, evidence: "Occasional flake but manageable with retries." },
      maintenanceBurden: { score: 6.6, evidence: "Browser/runtime version drift requires periodic updates." },
      costTokenImpact: { score: 8.2, evidence: "Shifts some checks from token-heavy LLM loops to browser assertions." },
      productivityGain: { score: 8.4, evidence: "Automates repetitive UI validation." },
    },
  },
  {
    tool: "software-design-philosophy-skill",
    repoPath: "directive-workspace/forge/source-packs/software-design-philosophy-skill",
    criteria: {
      workflowFit: { score: 8.1, evidence: "Supports coding-review and architecture critique tasks." },
      integrationComplexity: { score: 8.4, evidence: "Skill packaging already aligned to OpenClaw format." },
      runtimeReliability: { score: 8.2, evidence: "Prompt behavior consistent across checkpoints." },
      maintenanceBurden: { score: 8, evidence: "Low upkeep; mostly static guidance content." },
      costTokenImpact: { score: 7.5, evidence: "Small cost for better first-pass design quality." },
      productivityGain: { score: 8, evidence: "Improves design decisions earlier in cycle." },
    },
  },
  {
    tool: "superpowers",
    repoPath: "directive-workspace/forge/source-packs/superpowers",
    criteria: {
      workflowFit: { score: 8.3, evidence: "Reusable planning and verification playbooks map directly." },
      integrationComplexity: { score: 7.8, evidence: "Mostly docs-pattern ingestion with minor script hooks." },
      runtimeReliability: { score: 7.8, evidence: "Reliable outcomes in repetitive ops tasks." },
      maintenanceBurden: { score: 7.6, evidence: "Moderate maintenance as patterns evolve." },
      costTokenImpact: { score: 7.8, evidence: "Better structured runs reduce correction churn." },
      productivityGain: { score: 8.4, evidence: "Improves execution consistency and speed." },
    },
  },
  {
    tool: "scripts",
    repoPath: "directive-workspace/forge/source-packs/scripts",
    criteria: {
      workflowFit: { score: 8.4, evidence: "Direct utility support for inventory and curation loops." },
      integrationComplexity: { score: 8.7, evidence: "Drop-in script usage with minimal adapters." },
      runtimeReliability: { score: 8.1, evidence: "Simple deterministic CLI utilities." },
      maintenanceBurden: { score: 7.9, evidence: "Low complexity and clear ownership." },
      costTokenImpact: { score: 8.3, evidence: "Automation replaces manual token-expensive reasoning." },
      productivityGain: { score: 8.5, evidence: "Fastens repetitive maintenance tasks." },
    },
  },
  {
    tool: "skills-manager",
    repoPath: "directive-workspace/forge/source-packs/skills-manager",
    criteria: {
      workflowFit: { score: 7.6, evidence: "Directly supports multi-tool skill lifecycle management for OpenClaw-centric workflows." },
      integrationComplexity: { score: 7.0, evidence: "Sync boundaries are now clearer with policy-safe export paths and bounded checks." },
      runtimeReliability: { score: 7.8, evidence: "Core app behavior is stable with improved guardrails around sync semantics." },
      maintenanceBurden: { score: 6.8, evidence: "Moderate upkeep due to upstream UI/runtime updates and tool-compatibility drift." },
      costTokenImpact: { score: 7.5, evidence: "Reduces repeated prompt/context setup by making reusable skills easier to maintain." },
      productivityGain: { score: 8.3, evidence: "High operator leverage for managing shared skills across IDE/OpenClaw surfaces." },
    },
  },
  {
    tool: "hermes-agent",
    repoPath:
      "directive-workspace/architecture/03-adopted/2026-03-21-hermes-wave-02-adopted.md",
    criteria: {
      workflowFit: { score: 7.1, evidence: "Useful overlaps, but broad platform exceeds current need." },
      integrationComplexity: { score: 4.6, evidence: "Heavy dependency surface and integration blast radius." },
      runtimeReliability: { score: 6.2, evidence: "Core flows work but stack is expensive to stabilize." },
      maintenanceBurden: { score: 4.3, evidence: "High upkeep due to overlapping framework concerns." },
      costTokenImpact: { score: 5.2, evidence: "Limited token gains after extraction of key patterns." },
      productivityGain: { score: 6.1, evidence: "Some leverage, but high overhead reduces net gain." },
    },
  },
  {
    tool: "autoresearch",
    repoPath:
      "directive-workspace/forge/follow-up/2026-03-20-autoresearch-cutover-closure.md",
    criteria: {
      workflowFit: { score: 6.6, evidence: "Great for bounded experiments, weaker for daily workflows." },
      integrationComplexity: { score: 5.5, evidence: "Extra orchestration layer needed for safe adoption." },
      runtimeReliability: { score: 6.4, evidence: "Acceptable with strict run bounds." },
      maintenanceBurden: { score: 5.9, evidence: "Research stack drifts quickly without frequent curation." },
      costTokenImpact: { score: 6.1, evidence: "Can save tokens in discovery, but overhead is variable." },
      productivityGain: { score: 6.7, evidence: "Useful for exploratory spikes only." },
    },
  },
  {
    tool: "CLI-Anything",
    repoPath:
      "directive-workspace/forge/follow-up/2026-03-20-cli-anything-forge-follow-up-record.md",
    criteria: {
      workflowFit: { score: 5.6, evidence: "Concept fit is good but governance model is immature." },
      integrationComplexity: { score: 4.8, evidence: "Needs robust command mediation and policy controls." },
      runtimeReliability: { score: 5.1, evidence: "Insufficient deterministic behavior under broad command sets." },
      maintenanceBurden: { score: 4.9, evidence: "High policy and adapter maintenance load." },
      costTokenImpact: { score: 6.8, evidence: "Could reduce tokens via direct CLI execution." },
      productivityGain: { score: 6.3, evidence: "Potentially high but blocked by safety hardening." },
    },
  },
  {
    tool: "CodeGraphContext",
    repoPath:
      "directive-workspace/architecture/03-adopted/2026-03-21-codegraphcontext-wave-02-adopted.md",
    criteria: {
      workflowFit: { score: 6.4, evidence: "Strong for deep code intelligence, not core for all tasks." },
      integrationComplexity: { score: 3.9, evidence: "Storage/indexing requirements exceed current budget." },
      runtimeReliability: { score: 4.4, evidence: "Experimental runtime profile in current environment." },
      maintenanceBurden: { score: 4.2, evidence: "Index lifecycle and infra tuning add sustained burden." },
      costTokenImpact: { score: 5.6, evidence: "Possible token wins offset by infra operating cost." },
      productivityGain: { score: 6.5, evidence: "High upside for specific codebase analysis tasks." },
    },
  },
  {
    tool: "desloppify",
    repoPath: "directive-workspace/forge/source-packs/desloppify",
    criteria: {
      workflowFit: { score: 5.8, evidence: "Quality loop idea is useful but not yet pipeline-native." },
      integrationComplexity: { score: 5.1, evidence: "Needs command-level integration strategy." },
      runtimeReliability: { score: 5.7, evidence: "Promising but insufficient run data for promotion." },
      maintenanceBurden: { score: 5.6, evidence: "Moderate maintenance due to evolving rule packs." },
      costTokenImpact: { score: 6.2, evidence: "Can reduce rework tokens on messy outputs." },
      productivityGain: { score: 6, evidence: "Incremental gains without mature embedding." },
    },
  },
  {
    tool: "Celtrix",
    repoPath: "directive-workspace/forge/source-packs/celtrix",
    criteria: {
      workflowFit: { score: 6.4, evidence: "Useful for fast agent-first project bootstrapping before feature work." },
      integrationComplexity: { score: 6.7, evidence: "Pack-style integration is straightforward and bounded." },
      runtimeReliability: { score: 6.3, evidence: "Scaffolding utility is stable for bounded setup usage." },
      maintenanceBurden: { score: 6.2, evidence: "Moderate upkeep as template ecosystem evolves." },
      costTokenImpact: { score: 6.9, evidence: "Reduces setup-token churn by standardizing bootstrap outputs." },
      productivityGain: { score: 7.2, evidence: "Improves startup speed for new project prototypes." },
    },
  },
];
