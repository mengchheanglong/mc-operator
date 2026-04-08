import fs from "fs";
import path from "path";
import type { WorkspaceProject } from "@/server/projects/workspace-projects";
import { runWithReliabilityGate, AdapterReliabilityError } from "@/server/adapters/reliability-gate";
import { validateCodegraphInput, validateCodegraphOutput } from "@/server/adapters/contracts";

function toEstimatedTokens(value: string) {
  return Math.ceil((value || "").length / 4);
}

function envFlag(name: string, defaultValue: boolean) {
  const value = (process.env[name] || "").trim().toLowerCase();
  if (!value) return defaultValue;
  return value === "1" || value === "true" || value === "yes";
}

function envInt(name: string, defaultValue: number) {
  const raw = (process.env[name] || "").trim();
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export interface BoundedCodegraphSummary {
  markdown: string;
  compact: {
    status: string;
    repoPath: string;
    indexed: boolean;
    indexedRepositoryCount: number;
    statsPreview: string[];
    insights: string[];
    usedCommands: Array<{ command: string; ok: boolean }>;
    metadata: {
      generatedAt: string;
      sourceMode: "full" | "refresh" | "fallback";
      qualityState: "fresh" | "stale" | "degraded";
      failureReason: string;
      indexAgeMinutes: number;
    };
    sections: {
      changeImpact: string[];
      callChains: string[];
      hotspots: string[];
      verificationTargets: string[];
    };
  };
  budget: {
    maxChars: number;
    maxTokens: number;
    deltaTokensBudget: number;
    chars: number;
    tokensEstimated: number;
    deltaTokensEstimated: number;
  };
  diagnostics?: {
    injected: boolean;
    reasonCode: string;
    strictGateMode: boolean;
  };
}

function resolveSummaryJsonPath(project: WorkspaceProject) {
  const explicit = process.env.OPENCLAW_CODEGRAPH_SUMMARY_JSON?.trim();
  if (explicit) return path.resolve(explicit);
  return path.join(project.rootPath, ".openclaw", "context", "codegraph-summary.json");
}

function readSummaryJson(project: WorkspaceProject): {
  summaryPath: string;
  parsed?: any;
  reason?: string;
  reasonCode?: string;
} {
  const summaryPath = resolveSummaryJsonPath(project);
  try {
    return {
      summaryPath,
      parsed: JSON.parse(fs.readFileSync(summaryPath, "utf8")),
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") {
      return { summaryPath, reason: `summary file missing: ${summaryPath}`, reasonCode: "summary_missing" };
    }
    return { summaryPath, reason: "summary file is not valid JSON", reasonCode: "summary_invalid_json" };
  }
}

export function isCodegraphSpikeBoundedModeEnabled() {
  const legacy = envFlag("MISSION_CONTROL_CODEGRAPH_SPIKE_BOUNDED", false);
  return envFlag("MISSION_CONTROL_CODEGRAPH_BOUNDED_MODE", legacy || true);
}

export function isCodegraphStrictGateModeEnabled() {
  return envFlag("MISSION_CONTROL_CODEGRAPH_STRICT_GATE_MODE", true);
}

export function isCodegraphFallbackModeEnabled() {
  return envFlag("MISSION_CONTROL_CODEGRAPH_FALLBACK_MODE", true);
}

export function isCodegraphDiagnosticsModeEnabled() {
  return envFlag("MISSION_CONTROL_CODEGRAPH_DIAGNOSTICS_MODE", false);
}

export function collectBoundedCodegraphSummary(
  project: WorkspaceProject,
  options?: {
    maxChars?: number;
    maxTokens?: number;
    maxStatsLines?: number;
    maxInsights?: number;
    deltaTokenBudget?: number;
    allowStale?: boolean;
  },
): {
  block?: BoundedCodegraphSummary;
  reason?: string;
  reasonCode?: string;
} {
  const maxChars = options?.maxChars ?? 900;
  const maxTokens = options?.maxTokens ?? 240;
  const maxStatsLines = options?.maxStatsLines ?? 6;
  const maxInsights = options?.maxInsights ?? 3;
  const strictGateMode = isCodegraphStrictGateModeEnabled();
  const diagnosticsMode = isCodegraphDiagnosticsModeEnabled();
  const fallbackMode = isCodegraphFallbackModeEnabled();
  const deltaTokenBudget = options?.deltaTokenBudget ?? envInt("MISSION_CONTROL_CODEGRAPH_TOKEN_DELTA_BUDGET", 225);
  const allowStale = options?.allowStale ?? envFlag("MISSION_CONTROL_CODEGRAPH_ALLOW_STALE", true);
  const summary = readSummaryJson(project);
  if (!summary.parsed) {
    return {
      reason: summary.reason || "summary file is not valid JSON",
      reasonCode: summary.reasonCode || "summary_invalid_json",
    };
  }
  const parsed = summary.parsed;

  const metadata = {
    generatedAt: String(parsed?.metadata?.generatedAt || parsed?.generatedAt || ""),
    sourceMode: String(parsed?.metadata?.sourceMode || "refresh") as "full" | "refresh" | "fallback",
    qualityState: String(parsed?.metadata?.qualityState || "degraded") as "fresh" | "stale" | "degraded",
    failureReason: String(parsed?.metadata?.failureReason || ""),
    indexAgeMinutes: Number(parsed?.metadata?.indexAgeMinutes || 0),
  };

  if (!fallbackMode && metadata.sourceMode === "fallback") {
    return { reason: "fallback mode disabled", reasonCode: "fallback_disabled" };
  }

  const markdown = String(parsed.markdown || "").trim();
  if (!markdown) {
    return { reason: "summary file markdown is empty", reasonCode: "summary_empty" };
  }

  const sections = {
    changeImpact: Array.isArray(parsed?.sections?.changeImpact)
      ? parsed.sections.changeImpact.slice(0, maxInsights).map((line: unknown) => String(line))
      : [],
    callChains: Array.isArray(parsed?.sections?.callChains)
      ? parsed.sections.callChains.slice(0, maxInsights).map((line: unknown) => String(line))
      : [],
    hotspots: Array.isArray(parsed?.sections?.hotspots)
      ? parsed.sections.hotspots.slice(0, maxInsights).map((line: unknown) => String(line))
      : [],
    verificationTargets: Array.isArray(parsed?.sections?.verificationTargets)
      ? parsed.sections.verificationTargets.slice(0, maxInsights).map((line: unknown) => String(line))
      : [],
  };

  const hasSignal = Object.values(sections).some((section) => section.length > 0);
  if (!hasSignal) {
    return { reason: "high-signal sections are empty", reasonCode: "no_signal_sections" };
  }

  const chars = markdown.length;
  const tokensEstimated = toEstimatedTokens(markdown);
  const deltaTokensEstimated = tokensEstimated;

  if (chars > maxChars || tokensEstimated > maxTokens) {
    return {
      reason: `summary over budget (chars=${chars}/${maxChars}, tokens~=${tokensEstimated}/${maxTokens})`,
      reasonCode: "summary_over_budget",
    };
  }

  if (deltaTokensEstimated > deltaTokenBudget) {
    return {
      reason: `token delta over budget (delta~=${deltaTokensEstimated}/${deltaTokenBudget})`,
      reasonCode: "delta_over_budget",
    };
  }

  const qualityAllowed = metadata.qualityState === "fresh" || (allowStale && metadata.qualityState === "stale");
  if (!qualityAllowed) {
    return {
      reason: `quality state blocked (${metadata.qualityState})`,
      reasonCode: "quality_blocked",
    };
  }

  const block: BoundedCodegraphSummary = {
    markdown,
    compact: {
      status: String(parsed.status || "unknown"),
      repoPath: String(parsed.repoPath || project.rootPath),
      indexed: Boolean(parsed.indexed),
      indexedRepositoryCount: Number(parsed.indexedRepositoryCount || 0),
      statsPreview: Array.isArray(parsed.statsPreview)
        ? parsed.statsPreview.slice(0, maxStatsLines).map((line: unknown) => String(line))
        : [],
      insights: Array.isArray(parsed.insights)
        ? parsed.insights.slice(0, maxInsights).map((line: unknown) => String(line))
        : [],
      usedCommands: Array.isArray(parsed.usedCommands)
        ? parsed.usedCommands.slice(0, 6).map((item: any) => ({ command: String(item.command || ""), ok: Boolean(item.ok) }))
        : [],
      metadata,
      sections,
    },
    budget: {
      maxChars,
      maxTokens,
      deltaTokensBudget: deltaTokenBudget,
      chars,
      tokensEstimated,
      deltaTokensEstimated,
    },
    diagnostics: diagnosticsMode
      ? {
          injected: true,
          reasonCode: strictGateMode ? "gate_pass_strict" : "gate_pass_relaxed",
          strictGateMode,
        }
      : undefined,
  };

  return { block, reasonCode: "gate_pass" };
}

export async function collectBoundedCodegraphSummaryWithGate(
  project: WorkspaceProject,
  options?: {
    maxChars?: number;
    maxTokens?: number;
    maxStatsLines?: number;
    maxInsights?: number;
    deltaTokenBudget?: number;
    allowStale?: boolean;
  },
) {
  try {
    return await runWithReliabilityGate(
      { projectRootPath: project.rootPath },
      {
        adapter: "codegraph-summary",
        source: "context-pack",
        timeoutMs: 8_000,
        retries: 1,
        validateInput: validateCodegraphInput,
        validateOutput: validateCodegraphOutput,
        run: async () => collectBoundedCodegraphSummary(project, options),
      },
    );
  } catch (error) {
    if (error instanceof AdapterReliabilityError) {
      return {
        reason: error.details.reason,
        reasonCode: error.details.code,
      };
    }
    return {
      reason: String((error as Error)?.message || "codegraph adapter failed"),
      reasonCode: "execution_failed",
    };
  }
}
