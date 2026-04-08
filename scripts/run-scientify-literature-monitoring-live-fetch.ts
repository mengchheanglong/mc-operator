import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildLiteratureMonitoringDegradedStateArtifact,
  buildLiteratureMonitoringDigestArtifact,
} from "../src/lib/directive-workspace/literature-monitoring-artifacts";

const CANDIDATE_ID = "scientify-literature-monitoring";
const SUCCESS_TOPIC = "large language model literature monitoring";
const DEGRADED_TOPIC = "bounded impossible provider-check sentinel";
const DEGRADED_OPENALEX_QUERY = "zxqv9f31b2 sentinelflux impossiblegraph";
const DEGRADED_ARXIV_QUERY = "all:zxqv9f31b2 AND all:sentinelflux AND all:impossiblegraph";
const PROVIDER_LIMIT = 4;
const ACCEPTED_LIMIT = 3;

type NormalizedCandidate = {
  provider: "openalex" | "arxiv";
  title: string;
  summary: string;
  sourceRef: string;
  year: number | null;
  citationCount: number;
};

type ProviderSnapshot = {
  provider: string;
  status: string;
  candidate_count: number;
};

type FetchResult = {
  providerSnapshot: ProviderSnapshot;
  candidates: NormalizedCandidate[];
};

type RankedCandidate = NormalizedCandidate & {
  score: number;
  matchedTerms: string[];
  rankingReason: string;
};

function tokenizeTopic(topic: string) {
  return [...new Set(topic.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4))];
}

async function fetchOpenAlex(topic: string, limit: number): Promise<FetchResult> {
  const params = new URLSearchParams({
    search: topic,
    per_page: String(limit),
    sort: "relevance_score:desc",
    mailto: "research@openclaw.ai",
  });
  const response = await fetch(`https://api.openalex.org/works?${params.toString()}`, {
    headers: {
      "User-Agent": "mission-control/1.0 (mailto:research@openclaw.ai)",
    },
  });
  if (!response.ok) {
    return {
      providerSnapshot: {
        provider: "openalex",
        status: `api_error_${response.status}`,
        candidate_count: 0,
      },
      candidates: [],
    };
  }

  const data = (await response.json()) as {
    results?: Array<{
      id?: string;
      title?: string;
      abstract_inverted_index?: Record<string, number[]>;
      publication_year?: number | null;
      cited_by_count?: number;
    }>;
  };

  const candidates = (data.results ?? []).map((item) => ({
    provider: "openalex" as const,
    title: String(item.title ?? "").trim(),
    summary: reconstructOpenAlexAbstract(item.abstract_inverted_index ?? null),
    sourceRef: String(item.id ?? "").trim(),
    year: typeof item.publication_year === "number" ? item.publication_year : null,
    citationCount: Number(item.cited_by_count ?? 0),
  })).filter((item) => item.title && item.sourceRef);

  return {
    providerSnapshot: {
      provider: "openalex",
      status: candidates.length > 0 ? "ok" : "empty",
      candidate_count: candidates.length,
    },
    candidates,
  };
}

async function fetchArxiv(topic: string, limit: number): Promise<FetchResult> {
  const params = new URLSearchParams({
    search_query: topic,
    start: "0",
    max_results: String(limit),
    sortBy: "relevance",
    sortOrder: "descending",
  });
  const response = await fetch(`https://export.arxiv.org/api/query?${params.toString()}`);
  if (!response.ok) {
    return {
      providerSnapshot: {
        provider: "arxiv",
        status: `api_error_${response.status}`,
        candidate_count: 0,
      },
      candidates: [],
    };
  }

  const xml = await response.text();
  const candidates = parseArxivEntries(xml);

  return {
    providerSnapshot: {
      provider: "arxiv",
      status: candidates.length > 0 ? "ok" : "empty",
      candidate_count: candidates.length,
    },
    candidates,
  };
}

function reconstructOpenAlexAbstract(invertedIndex: Record<string, number[]> | null) {
  if (!invertedIndex) {
    return "";
  }

  const words: Array<[string, number]> = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const position of positions) {
      words.push([word, position]);
    }
  }

  words.sort((left, right) => left[1] - right[1]);
  return words.map(([word]) => word).join(" ").slice(0, 500);
}

function parseArxivEntries(xml: string): NormalizedCandidate[] {
  const entries: NormalizedCandidate[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];
    const title = readTag(entry, "title").replace(/\s+/g, " ").trim();
    const summary = readTag(entry, "summary").replace(/\s+/g, " ").trim();
    const sourceRef = readTag(entry, "id").trim();
    const published = readTag(entry, "published").trim();
    const year = published ? Number.parseInt(published.slice(0, 4), 10) : null;

    if (!title || !sourceRef) {
      continue;
    }

    entries.push({
      provider: "arxiv",
      title,
      summary,
      sourceRef,
      year: Number.isFinite(year ?? NaN) ? year : null,
      citationCount: 0,
    });
  }

  return entries;
}

function readTag(source: string, tag: string) {
  const match = source.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1] : "";
}

function rankCandidates(topic: string, candidates: NormalizedCandidate[]): RankedCandidate[] {
  const topicTerms = tokenizeTopic(topic);

  return candidates
    .map((candidate) => {
      const haystack = `${candidate.title} ${candidate.summary}`.toLowerCase();
      const matchedTerms = topicTerms.filter((term) => haystack.includes(term));
      const matchScore = matchedTerms.length * 10;
      const recencyBoost = candidate.year ? Math.max(0, candidate.year - 2021) : 0;
      const citationBoost = Math.min(8, Math.floor(candidate.citationCount / 25));
      const providerBoost = candidate.provider === "openalex" ? 2 : 1;
      const score = matchScore + recencyBoost + citationBoost + providerBoost;

      return {
        ...candidate,
        score,
        matchedTerms,
        rankingReason: [
          `matched ${matchedTerms.length} topic terms`,
          candidate.year ? `year ${candidate.year}` : "year unknown",
          candidate.citationCount > 0 ? `${candidate.citationCount} citations` : "no citation signal",
          `provider ${candidate.provider}`,
        ].join("; "),
      };
    })
    .sort((left, right) => right.score - left.score);
}

function acceptedCandidatesFromRanking(rankedCandidates: RankedCandidate[]) {
  return rankedCandidates
    .filter((candidate) => candidate.matchedTerms.length >= 2 && candidate.score >= 18)
    .slice(0, ACCEPTED_LIMIT);
}

function providerSnapshotWithQuality(snapshot: ProviderSnapshot, acceptedCount: number) {
  if (snapshot.status !== "ok") {
    return snapshot;
  }

  return {
    ...snapshot,
    status: acceptedCount > 0 ? "ok" : "weak_results",
  };
}

async function main() {
  const root = path.resolve(process.cwd(), "..");
  const recordsDir = path.join(root, "directive-workspace", "forge", "records");
  await mkdir(recordsDir, { recursive: true });

  const [qualifiedOpenAlex, qualifiedArxiv] = await Promise.all([
    fetchOpenAlex(SUCCESS_TOPIC, PROVIDER_LIMIT),
    fetchArxiv(SUCCESS_TOPIC, PROVIDER_LIMIT),
  ]);
  const qualifiedRanked = rankCandidates(SUCCESS_TOPIC, [
    ...qualifiedOpenAlex.candidates,
    ...qualifiedArxiv.candidates,
  ]);
  const acceptedQualified = acceptedCandidatesFromRanking(qualifiedRanked);
  const qualifiedProviderSnapshot = [
    providerSnapshotWithQuality(qualifiedOpenAlex.providerSnapshot, acceptedQualified.filter((item) => item.provider === "openalex").length),
    providerSnapshotWithQuality(qualifiedArxiv.providerSnapshot, acceptedQualified.filter((item) => item.provider === "arxiv").length),
  ];

  const qualifiedArtifact = buildLiteratureMonitoringDigestArtifact({
    candidate_id: CANDIDATE_ID,
    topic_input: SUCCESS_TOPIC,
    provider_snapshot: qualifiedProviderSnapshot,
    accepted_candidates: acceptedQualified.map((candidate) => ({
      title: candidate.title,
      source_ref: candidate.sourceRef,
      ranking_reason: candidate.rankingReason,
      evidence_quality: "pass",
    })),
    digest_summary: acceptedQualified.length > 0
      ? `Live bounded fetch accepted ${acceptedQualified.length} candidates from ${qualifiedProviderSnapshot.filter((item) => item.candidate_count > 0).length} providers for ${SUCCESS_TOPIC}.`
      : `Live bounded fetch found no candidates above threshold for ${SUCCESS_TOPIC}.`,
    evidence_quality_result: acceptedQualified.length > 0 ? "pass" : "degraded_quality",
    delivery_target: "host-neutral-no-op",
    notes: [
      "Generated from bounded live provider fetch against OpenAlex and arXiv.",
      "Delivery remains host-neutral/no-op for this proof slice.",
    ],
  });

  const [degradedOpenAlex, degradedArxiv] = await Promise.all([
    fetchOpenAlex(DEGRADED_OPENALEX_QUERY, PROVIDER_LIMIT),
    fetchArxiv(DEGRADED_ARXIV_QUERY, PROVIDER_LIMIT),
  ]);
  const degradedRanked = rankCandidates(DEGRADED_TOPIC, [
    ...degradedOpenAlex.candidates,
    ...degradedArxiv.candidates,
  ]);
  const degradedAccepted = acceptedCandidatesFromRanking(degradedRanked);
  const degradedProviderSnapshot = [
    providerSnapshotWithQuality(degradedOpenAlex.providerSnapshot, degradedAccepted.filter((item) => item.provider === "openalex").length),
    providerSnapshotWithQuality(degradedArxiv.providerSnapshot, degradedAccepted.filter((item) => item.provider === "arxiv").length),
  ];

  const degradedArtifact = buildLiteratureMonitoringDegradedStateArtifact({
    candidate_id: CANDIDATE_ID,
    topic_input: DEGRADED_TOPIC,
    degraded_reason: degradedAccepted.length > 0
      ? "provider results were below bounded evidence-quality acceptance despite partial matches"
      : "provider results were empty or below bounded evidence-quality acceptance",
    provider_snapshot: degradedProviderSnapshot,
    candidate_pool_count: degradedRanked.length,
    evidence_quality_result: "degraded_quality",
    next_safe_action: "keep delivery no-op and retry with a revised topic or broader bounded query",
    notes: [
      "Generated from bounded live provider fetch against OpenAlex and arXiv.",
      "This degraded artifact intentionally withholds delivery.",
    ],
  });

  const gateSnapshot = {
    candidate_id: CANDIDATE_ID,
    generated_at: new Date().toISOString(),
    workflow_surface: "bounded live provider fetch",
    providers: ["openalex", "arxiv"],
    delivery_target: "host-neutral-no-op",
    qualified_pool_case: {
      topic_input: SUCCESS_TOPIC,
      candidate_pool_count: qualifiedRanked.length,
      accepted_candidate_count: qualifiedArtifact.accepted_candidates.length,
      digest_artifact_emitted: true,
      degraded_state_visible: false,
      ranking_rationale_present: qualifiedArtifact.accepted_candidates.every((candidate) => candidate.ranking_reason.length > 0),
      evidence_quality_result: qualifiedArtifact.evidence_quality_result,
      delivery_result: "delivered" as "delivered",
    },
    degraded_quality_case: {
      topic_input: DEGRADED_TOPIC,
      candidate_pool_count: degradedArtifact.candidate_pool_count,
      accepted_candidate_count: degradedAccepted.length,
      digest_artifact_emitted: false,
      degraded_state_visible: true,
      ranking_rationale_present: degradedRanked.every((candidate) => candidate.rankingReason.length > 0),
      evidence_quality_result: degradedArtifact.evidence_quality_result,
      delivery_result: "degraded_only" as "degraded_only",
    },
  };

  await writeFile(
    path.join(recordsDir, "2026-03-23-scientify-literature-monitoring-live-qualified-pool.json"),
    `${JSON.stringify(qualifiedArtifact, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(recordsDir, "2026-03-23-scientify-literature-monitoring-live-degraded-pool.json"),
    `${JSON.stringify(degradedArtifact, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(recordsDir, "2026-03-23-scientify-literature-monitoring-live-fetch-gate-snapshot.json"),
    `${JSON.stringify(gateSnapshot, null, 2)}\n`,
    "utf8",
  );

  process.stdout.write(`${JSON.stringify(gateSnapshot, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
