// Canonical Directive shared lib lives in
// directive-workspace/shared/lib/literature-monitoring-artifacts.ts.
// Mission Control keeps a host-local mirror until standalone shared-lib
// consumption is stable in production builds.
export type LiteratureMonitoringProviderSnapshot = {
  provider: string;
  status: string;
  candidate_count: number;
};

export type LiteratureMonitoringAcceptedCandidate = {
  title: string;
  source_ref: string;
  ranking_reason: string;
  evidence_quality: "pass" | "degraded_quality";
};

export type LiteratureMonitoringDigestArtifact = {
  artifact_type: "literature_monitoring_digest";
  candidate_id: string;
  generated_at: string;
  topic_input: string;
  degraded: false;
  provider_snapshot: LiteratureMonitoringProviderSnapshot[];
  accepted_candidates: LiteratureMonitoringAcceptedCandidate[];
  digest_summary: string;
  evidence_quality_result: "pass" | "degraded_quality";
  delivery_target: string;
  notes?: string[];
};

export type LiteratureMonitoringDegradedStateArtifact = {
  artifact_type: "literature_monitoring_degraded_state";
  candidate_id: string;
  generated_at: string;
  topic_input: string;
  degraded: true;
  degraded_reason: string;
  provider_snapshot: LiteratureMonitoringProviderSnapshot[];
  candidate_pool_count: number;
  evidence_quality_result: "degraded_quality" | "fail";
  withheld_delivery: true;
  next_safe_action: string;
  notes?: string[];
};

function requiredString(value: unknown, fieldName: string) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`invalid_input: ${fieldName} is required`);
  }
  return normalized;
}

function normalizeCount(value: unknown, fieldName: string) {
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0) {
    throw new Error(`invalid_input: ${fieldName} must be a non-negative number`);
  }
  return Math.round(count);
}

function normalizeNotes(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const notes = value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return notes.length > 0 ? notes : undefined;
}

function normalizeGeneratedAt(value: unknown) {
  const raw = String(value || "").trim() || new Date().toISOString();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("invalid_input: generated_at must be a valid ISO timestamp");
  }
  return parsed.toISOString();
}

function normalizeProviderSnapshot(
  value: unknown,
): LiteratureMonitoringProviderSnapshot[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("invalid_input: provider_snapshot must be a non-empty array");
  }

  return value.map((item, index) => {
    const record =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : null;
    if (!record) {
      throw new Error(
        `invalid_input: provider_snapshot[${index}] must be an object`,
      );
    }

    return {
      provider: requiredString(record.provider, `provider_snapshot[${index}].provider`),
      status: requiredString(record.status, `provider_snapshot[${index}].status`),
      candidate_count: normalizeCount(
        record.candidate_count,
        `provider_snapshot[${index}].candidate_count`,
      ),
    };
  });
}

function normalizeAcceptedCandidates(
  value: unknown,
): LiteratureMonitoringAcceptedCandidate[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("invalid_input: accepted_candidates must be a non-empty array");
  }

  return value.map((item, index) => {
    const record =
      item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : null;
    if (!record) {
      throw new Error(
        `invalid_input: accepted_candidates[${index}] must be an object`,
      );
    }

    const evidenceQuality = requiredString(
      record.evidence_quality,
      `accepted_candidates[${index}].evidence_quality`,
    );
    if (evidenceQuality !== "pass" && evidenceQuality !== "degraded_quality") {
      throw new Error(
        `invalid_input: accepted_candidates[${index}].evidence_quality must be pass or degraded_quality`,
      );
    }

    return {
      title: requiredString(record.title, `accepted_candidates[${index}].title`),
      source_ref: requiredString(
        record.source_ref,
        `accepted_candidates[${index}].source_ref`,
      ),
      ranking_reason: requiredString(
        record.ranking_reason,
        `accepted_candidates[${index}].ranking_reason`,
      ),
      evidence_quality: evidenceQuality,
    };
  });
}

export function buildLiteratureMonitoringDigestArtifact(input: {
  candidate_id: unknown;
  generated_at?: unknown;
  topic_input: unknown;
  provider_snapshot: unknown;
  accepted_candidates: unknown;
  digest_summary: unknown;
  evidence_quality_result?: unknown;
  delivery_target: unknown;
  notes?: unknown;
}): LiteratureMonitoringDigestArtifact {
  const evidenceQualityResult =
    String(input.evidence_quality_result || "pass").trim() || "pass";
  if (
    evidenceQualityResult !== "pass" &&
    evidenceQualityResult !== "degraded_quality"
  ) {
    throw new Error(
      "invalid_input: evidence_quality_result must be pass or degraded_quality",
    );
  }

  return {
    artifact_type: "literature_monitoring_digest",
    candidate_id: requiredString(input.candidate_id, "candidate_id"),
    generated_at: normalizeGeneratedAt(input.generated_at),
    topic_input: requiredString(input.topic_input, "topic_input"),
    degraded: false,
    provider_snapshot: normalizeProviderSnapshot(input.provider_snapshot),
    accepted_candidates: normalizeAcceptedCandidates(input.accepted_candidates),
    digest_summary: requiredString(input.digest_summary, "digest_summary"),
    evidence_quality_result: evidenceQualityResult,
    delivery_target: requiredString(input.delivery_target, "delivery_target"),
    notes: normalizeNotes(input.notes),
  };
}

export function buildLiteratureMonitoringDegradedStateArtifact(input: {
  candidate_id: unknown;
  generated_at?: unknown;
  topic_input: unknown;
  degraded_reason: unknown;
  provider_snapshot: unknown;
  candidate_pool_count: unknown;
  evidence_quality_result?: unknown;
  next_safe_action: unknown;
  notes?: unknown;
}): LiteratureMonitoringDegradedStateArtifact {
  const evidenceQualityResult =
    String(input.evidence_quality_result || "degraded_quality").trim() ||
    "degraded_quality";
  if (
    evidenceQualityResult !== "degraded_quality" &&
    evidenceQualityResult !== "fail"
  ) {
    throw new Error(
      "invalid_input: evidence_quality_result must be degraded_quality or fail",
    );
  }

  return {
    artifact_type: "literature_monitoring_degraded_state",
    candidate_id: requiredString(input.candidate_id, "candidate_id"),
    generated_at: normalizeGeneratedAt(input.generated_at),
    topic_input: requiredString(input.topic_input, "topic_input"),
    degraded: true,
    degraded_reason: requiredString(input.degraded_reason, "degraded_reason"),
    provider_snapshot: normalizeProviderSnapshot(input.provider_snapshot),
    candidate_pool_count: normalizeCount(
      input.candidate_pool_count,
      "candidate_pool_count",
    ),
    evidence_quality_result: evidenceQualityResult,
    withheld_delivery: true,
    next_safe_action: requiredString(input.next_safe_action, "next_safe_action"),
    notes: normalizeNotes(input.notes),
  };
}
