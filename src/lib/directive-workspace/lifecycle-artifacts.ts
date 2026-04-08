// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/lifecycle-artifacts.ts.
// Mission Control keeps a host-local mirror until standalone shared-lib
// consumption is stable in production builds.
import {
  parseArrayFallback,
  parseObjectFallback,
  parseStringListFallback,
} from "./structured-output-fallback";

export type DirectiveAnalysisEvidenceArtifact = {
  capability_id: string;
  evidence_items: Array<{
    source_ref: string;
    content: string;
  }>;
  collection_status: "complete" | "partial" | "empty";
  errors: string[];
};

export type DirectiveCitationSetArtifact = {
  capability_id: string;
  citations: Array<{
    url: string;
    title?: string;
  }>;
  reference_section_markdown: string;
  coverage_status: "complete" | "partial" | "missing";
};

export type DirectiveEvaluationSupportArtifact = {
  capability_id: string;
  source_urls: string[];
  visited_urls: string[];
  research_costs: {
    total_usd: number;
    provider_breakdown?: Record<string, number>;
  };
  quality_signals: Record<string, unknown>;
};

export type DirectiveLifecycleArtifacts = {
  analysisEvidence: DirectiveAnalysisEvidenceArtifact;
  citationSet: DirectiveCitationSetArtifact;
  evaluationSupport: DirectiveEvaluationSupportArtifact;
};

type NormalizedCitationsResult = {
  citations: Array<{
    url: string;
    title?: string;
  }>;
  usedFallback: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function normalizeStringArray(value: unknown) {
  return [...new Set(parseStringListFallback(value))];
}

function normalizeCitationUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function dedupeNormalizedUrls(urls: Array<string | null>) {
  const deduped = new Map<string, string>();
  for (const url of urls) {
    if (!url) continue;
    const key = url.toLowerCase();
    if (!deduped.has(key)) deduped.set(key, url);
  }
  return [...deduped.values()];
}

function normalizeCitations(
  value: unknown,
  fallbackUrls: string[],
): NormalizedCitationsResult {
  const parsedArray = parseArrayFallback(value);
  const parsedObject = parseObjectFallback(value);

  const rawItems: unknown[] = (() => {
    if (parsedArray) return parsedArray;
    if (parsedObject && Array.isArray(parsedObject.citations)) {
      return parsedObject.citations;
    }
    if (parsedObject) return [parsedObject];
    const urlLike = parseStringListFallback(value);
    return urlLike;
  })();

  const dedupedByUrl = new Map<
    string,
    {
      url: string;
      title?: string;
    }
  >();

  for (const item of rawItems) {
    let parsed: {
      url: string;
      title?: string;
    } | null = null;

    if (typeof item === "string") {
      const url = normalizeCitationUrl(item);
      parsed = url ? { url } : null;
    } else {
      const record = asRecord(item);
      if (record) {
        const normalizedUrl = normalizeCitationUrl(
          record.url ??
            record.source_ref ??
            record.sourceRef ??
            record.link ??
            "",
        );
        const title = String(record.title ?? record.name ?? "").trim() || undefined;
        parsed = normalizedUrl ? (title ? { url: normalizedUrl, title } : { url: normalizedUrl }) : null;
      }
    }

    if (!parsed) continue;
    const key = parsed.url.toLowerCase();
    const existing = dedupedByUrl.get(key);
    if (!existing) {
      dedupedByUrl.set(key, parsed);
      continue;
    }
    if (!existing.title && parsed.title) {
      dedupedByUrl.set(key, parsed);
    }
  }

  if (dedupedByUrl.size === 0 && fallbackUrls.length > 0) {
    return {
      citations: fallbackUrls.map((url) => ({ url })),
      usedFallback: true,
    };
  }

  return {
    citations: [...dedupedByUrl.values()],
    usedFallback: false,
  };
}

export function isDirectiveLifecycleArtifacts(
  value: unknown,
): value is DirectiveLifecycleArtifacts {
  const root = asRecord(value);
  if (!root) return false;

  const analysisEvidence = asRecord(root.analysisEvidence);
  const citationSet = asRecord(root.citationSet);
  const evaluationSupport = asRecord(root.evaluationSupport);
  if (!analysisEvidence || !citationSet || !evaluationSupport) return false;

  const capabilityIdA = String(analysisEvidence.capability_id || "").trim();
  const evidenceItems = analysisEvidence.evidence_items;
  const collectionStatus = String(analysisEvidence.collection_status || "").trim();
  const errors = analysisEvidence.errors;
  const analysisValid =
    capabilityIdA.length > 0 &&
    Array.isArray(evidenceItems) &&
    Array.isArray(errors) &&
    ["complete", "partial", "empty"].includes(collectionStatus);
  if (!analysisValid) return false;

  const capabilityIdC = String(citationSet.capability_id || "").trim();
  const citations = citationSet.citations;
  const referenceSectionMarkdown = String(
    citationSet.reference_section_markdown || "",
  ).trim();
  const coverageStatus = String(citationSet.coverage_status || "").trim();
  const citationValid =
    capabilityIdC.length > 0 &&
    Array.isArray(citations) &&
    referenceSectionMarkdown.length > 0 &&
    ["complete", "partial", "missing"].includes(coverageStatus);
  if (!citationValid) return false;

  const capabilityIdE = String(evaluationSupport.capability_id || "").trim();
  const sourceUrls = evaluationSupport.source_urls;
  const visitedUrls = evaluationSupport.visited_urls;
  const researchCosts = asRecord(evaluationSupport.research_costs);
  const qualitySignals = asRecord(evaluationSupport.quality_signals);
  const totalUsd =
    researchCosts && Number.isFinite(Number(researchCosts.total_usd))
      ? Number(researchCosts.total_usd)
      : NaN;
  const evaluationValid =
    capabilityIdE.length > 0 &&
    Array.isArray(sourceUrls) &&
    Array.isArray(visitedUrls) &&
    Boolean(researchCosts) &&
    !Number.isNaN(totalUsd) &&
    totalUsd >= 0 &&
    Boolean(qualitySignals);

  return evaluationValid;
}

export function buildDirectiveLifecycleArtifacts(input: {
  capabilityId: string;
  sourceRef: string;
  evidenceSummary: string;
  metadata?: Record<string, unknown>;
}): DirectiveLifecycleArtifacts {
  const metadata = input.metadata || {};
  const existing = (metadata as Record<string, unknown>).lifecycleArtifacts;
  if (isDirectiveLifecycleArtifacts(existing)) {
    return existing;
  }

  const sourceUrls =
    normalizeStringArray(
      (metadata as Record<string, unknown>).source_urls ??
        (metadata as Record<string, unknown>).sourceUrls,
    ) || [];
  const visitedUrls =
    normalizeStringArray(
      (metadata as Record<string, unknown>).visited_urls ??
        (metadata as Record<string, unknown>).visitedUrls,
    ) || [];
  const normalizedSourceUrlCandidates = dedupeNormalizedUrls(
    sourceUrls.map((item) => normalizeCitationUrl(item)),
  );
  const normalizedVisitedUrlCandidates = dedupeNormalizedUrls(
    visitedUrls.map((item) => normalizeCitationUrl(item)),
  );

  const normalizedSourceUrls =
    sourceUrls.length > 0 ? sourceUrls : [input.sourceRef].filter(Boolean);
  const normalizedVisitedUrls =
    visitedUrls.length > 0 ? visitedUrls : normalizedSourceUrls;
  const citationFallbackUrls =
    normalizedVisitedUrlCandidates.length > 0
      ? normalizedVisitedUrlCandidates
      : normalizedSourceUrlCandidates;
  const citationResult = normalizeCitations(
    (metadata as Record<string, unknown>).citations,
    citationFallbackUrls,
  );
  const referenceUrls =
    normalizedVisitedUrlCandidates.length > 0
      ? normalizedVisitedUrlCandidates
      : citationResult.citations.map((citation) => citation.url);

  const evidenceItems = input.evidenceSummary
    ? [
        {
          source_ref: input.sourceRef,
          content: input.evidenceSummary,
        },
      ]
    : [];

  const analysisEvidence: DirectiveAnalysisEvidenceArtifact = {
    capability_id: input.capabilityId,
    evidence_items: evidenceItems,
    collection_status:
      evidenceItems.length > 0 ? "complete" : normalizedSourceUrls.length > 0 ? "partial" : "empty",
    errors: normalizeStringArray((metadata as Record<string, unknown>).errors),
  };

  const referenceSectionMarkdown =
    String(
      (metadata as Record<string, unknown>).reference_section_markdown ??
        (metadata as Record<string, unknown>).referenceSectionMarkdown ??
        "",
    ).trim() ||
    [
      "## References",
      ...referenceUrls.map((url) => `- [${url}](${url})`),
    ].join("\n");

  const citationSet: DirectiveCitationSetArtifact = {
    capability_id: input.capabilityId,
    citations: citationResult.citations,
    reference_section_markdown: referenceSectionMarkdown,
    coverage_status:
      citationResult.citations.length === 0 && referenceUrls.length === 0
        ? "missing"
        : citationResult.usedFallback
          ? "partial"
          : "complete",
  };

  const researchCostsRaw = parseObjectFallback(
    (metadata as Record<string, unknown>).research_costs ??
      (metadata as Record<string, unknown>).researchCosts,
  );
  const providerBreakdownRaw = asRecord(
    researchCostsRaw?.provider_breakdown ?? researchCostsRaw?.providerBreakdown,
  );
  const providerBreakdown = providerBreakdownRaw
    ? Object.fromEntries(
        Object.entries(providerBreakdownRaw).flatMap(([key, value]) => {
          const numericValue = Number(value);
          if (!Number.isFinite(numericValue) || numericValue < 0) return [];
          return [[key, numericValue] as const];
        }),
      )
    : undefined;
  const totalUsd = Number(researchCostsRaw?.total_usd ?? researchCostsRaw?.totalUsd ?? 0);

  const evaluationSupport: DirectiveEvaluationSupportArtifact = {
    capability_id: input.capabilityId,
    source_urls: normalizedSourceUrls,
    visited_urls: normalizedVisitedUrls,
    research_costs: {
      total_usd: Number.isFinite(totalUsd) && totalUsd >= 0 ? totalUsd : 0,
      ...(providerBreakdown ? { provider_breakdown: providerBreakdown } : {}),
    },
    quality_signals: parseObjectFallback(
      (metadata as Record<string, unknown>).quality_signals ??
        (metadata as Record<string, unknown>).qualitySignals ??
        {},
    ) || {},
  };

  return {
    analysisEvidence,
    citationSet,
    evaluationSupport,
  };
}
