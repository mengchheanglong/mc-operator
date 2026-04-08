"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

type SubmissionShape = "queue_only" | "fast_path" | "split_case";
type RoutingAssessment = {
  recommended_track?: "discovery" | "architecture" | "forge";
  recommended_record_shape?: SubmissionShape;
  mission_priority_score?: number;
  confidence?: "high" | "medium" | "low";
  matched_gap_id?: string | null;
  matched_gap_rank?: number | null;
  explicit_route_destination?: "discovery" | "architecture" | "forge" | null;
  route_conflict?: boolean;
  needs_human_review?: boolean;
  score_breakdown?: {
    mission_fit?: number;
    gap_alignment?: number;
    track_scores?: Partial<Record<"discovery" | "architecture" | "forge", number>>;
    transformation_signal?: number;
    runtime_signal?: number;
    ambiguity_penalty?: number;
    total?: number;
  };
  rationale?: string[];
};
type SubmissionResult = {
  mode?: string;
  record_shape?: string;
  candidate_id?: string;
  status?: string;
  appliedStages?: string[];
  createdPaths?: Record<string, string | null>;
  assessment?: RoutingAssessment;
  engine?: {
    ok?: boolean;
    processed?: boolean;
    reason?: string;
    error?: string;
    relativePath?: string;
    reportRelativePath?: string;
    record?: {
      runId?: string;
      candidate?: {
        usefulnessLevel?: string;
      };
      selectedLane?: {
        laneId?: string;
      };
      decision?: {
        decisionState?: string;
      };
      analysis?: {
        usefulnessRationale?: string;
      };
    };
  };
};

type PayloadBuildState = {
  payload: Record<string, unknown> | null;
  issue: string | null;
};

const SOURCE_TYPE_OPTIONS = [
  "internal-signal",
  "github-repo",
  "paper",
  "product-doc",
  "theory",
  "technical-essay",
  "workflow-writeup",
  "external-system",
] as const;

const ROUTE_DESTINATION_OPTIONS = [
  "forge",
  "architecture",
  "monitor",
  "defer",
  "reject",
  "reference",
] as const;

const DECISION_STATE_OPTIONS = ["adopt", "defer", "monitor", "reject"] as const;

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatAssessmentLabel(value: string | number | null | undefined) {
  if (value == null || value === "") return "n/a";
  return String(value);
}

function isTrackRouteable(
  value: RoutingAssessment["recommended_track"],
): value is "architecture" | "forge" {
  return value === "architecture" || value === "forge";
}

function slugifyCandidateId(value: string) {
  return (value || "candidate")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function suggestAdoptionTarget(track: RoutingAssessment["recommended_track"]) {
  if (track === "architecture") {
    return "reusable internal operating logic";
  }
  if (track === "forge") {
    return "reusable runtime capability";
  }
  return null;
}

function suggestNextArtifactPath(
  track: RoutingAssessment["recommended_track"],
  candidateId: string,
) {
  const slug = slugifyCandidateId(candidateId);
  const today = getTodayKey();
  if (track === "architecture") {
    return `architecture/02-experiments/${today}-${slug}.md`;
  }
  if (track === "forge") {
    return `forge/records/${today}-${slug}-record.md`;
  }
  return null;
}

function suggestNeedBoundedProof(track: RoutingAssessment["recommended_track"]) {
  if (track === "architecture") {
    return "Bounded Discovery/Architecture proof with record generation, queue sync, and contract/check validation.";
  }
  if (track === "forge") {
    return "Bounded Forge proof with behavior, metric, rollback, and host-validation evidence before runtime promotion.";
  }
  return "Keep this in Discovery until routing evidence is strong enough for a narrower bounded proof.";
}

function buildSuggestedWhyThisRoute(assessment: RoutingAssessment | null) {
  if (!assessment?.recommended_track) return null;
  const gapClause = assessment.matched_gap_id
    ? ` It also aligns with open gap ${assessment.matched_gap_id}${
        assessment.matched_gap_rank != null ? ` (#${assessment.matched_gap_rank})` : ""
      }.`
    : "";
  if (assessment.recommended_track === "architecture") {
    return `This should route to Architecture because the primary value is reusable internal operating logic rather than immediate runtime behavior.${gapClause}`;
  }
  if (assessment.recommended_track === "forge") {
    return `This should route to Forge because the primary value is reusable runtime usefulness or bounded transformation work rather than internal framework structure.${gapClause}`;
  }
  return `This should stay in Discovery because the route is still not narrow enough for Architecture or Forge without more evidence.${gapClause}`;
}

function buildSuggestedWhyNotAlternatives(assessment: RoutingAssessment | null) {
  if (!assessment?.score_breakdown?.track_scores || !assessment.recommended_track) return null;
  const entries = Object.entries(assessment.score_breakdown.track_scores)
    .filter(([track]) => track !== assessment.recommended_track)
    .sort((left, right) => (right[1] ?? 0) - (left[1] ?? 0))
    .map(([track, score]) => `${track} (${score ?? 0})`);
  if (entries.length === 0) return null;
  return `The alternatives are weaker under the current mission-scoring pass: ${entries.join(", ")}. This recommendation should still be reviewed by a human if the strategic intent differs from the computed route.`;
}

function buildSplitCaseTemplate(candidateId: string, candidateName: string, sourceType: string) {
  const today = new Date().toISOString().slice(0, 10);
  const slug = (candidateId || "candidate")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return JSON.stringify(
    {
      intake: {
        intake_date: today,
        source_type: sourceType || "internal-signal",
        source_reference: "https://example.com/source",
        submitted_by: "mission-control-operator",
        why_it_entered_the_system:
          "Mission-relevant candidate that needs full intake and triage treatment.",
        claimed_value:
          "Potentially improves a real mission lane and needs structured review.",
        initial_relevance_to_workspace:
          "Relevant to the active mission and current Directive Workspace priorities.",
        suspected_adoption_target: "forge",
      },
      triage: {
        triage_date: today,
        first_pass_summary: "Short first-pass summary.",
        problem_it_appears_to_solve: "What problem this appears to solve.",
        extractable_value_hypothesis: "What value we believe can be extracted.",
        routing_recommendation: "Why this should route the way it does.",
        proposed_adoption_target: "forge",
        stack_shape_summary: "Key stack/runtime shape if known.",
        boilerplate_vs_product_boundary:
          "What looks like reusable mechanism vs upstream baggage.",
        suggested_decision_state: "adopt",
        fit_to_current_direction: "Why this fits the current objective.",
        reusability_across_surfaces: "Where else this could matter.",
        operational_risk: "Main risks.",
        integration_cost: "Expected cost/complexity.",
        can_current_gates_validate_safely: "yes",
        immediate_risks: "Immediate risks or unknowns.",
        missing_evidence: "What evidence is still missing.",
        next_action: "Next bounded action.",
      },
      routing: {
        route_date: today,
        source_type: sourceType || "internal-signal",
        decision_state: "adopt",
        adoption_target: "forge",
        route_destination: "forge",
        why_this_route: "Why this route is correct.",
        why_not_alternatives: "Why alternatives are weaker.",
        receiving_track_owner: "directive-workspace",
        required_next_artifact: `forge/records/${today}-${slug}-record.md`,
      },
    },
    null,
    2,
  );
}

export default function DiscoverySubmissionPanel({
  onSubmitted,
}: {
  onSubmitted?: () => void;
}) {
  const [recordShape, setRecordShape] = useState<SubmissionShape>("fast_path");
  const [candidateId, setCandidateId] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [sourceType, setSourceType] =
    useState<(typeof SOURCE_TYPE_OPTIONS)[number]>("internal-signal");
  const [sourceReference, setSourceReference] = useState("");
  const [missionAlignment, setMissionAlignment] = useState("");
  const [capabilityGapId, setCapabilityGapId] = useState("");
  const [notes, setNotes] = useState("");

  const [claimedValue, setClaimedValue] = useState("");
  const [firstPassSummary, setFirstPassSummary] = useState("");
  const [adoptionTarget, setAdoptionTarget] = useState("forge");
  const [decisionState, setDecisionState] =
    useState<(typeof DECISION_STATE_OPTIONS)[number]>("adopt");
  const [routeDestination, setRouteDestination] =
    useState<(typeof ROUTE_DESTINATION_OPTIONS)[number]>("forge");
  const [whyThisRoute, setWhyThisRoute] = useState("");
  const [whyNotAlternatives, setWhyNotAlternatives] = useState("");
  const [needBoundedProof, setNeedBoundedProof] = useState("");
  const [nextArtifact, setNextArtifact] = useState("");
  const [caseRecordJson, setCaseRecordJson] = useState("");
  const [processWithEngine, setProcessWithEngine] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [liveAdvisoryIssue, setLiveAdvisoryIssue] = useState<string | null>(null);
  const [liveAssessing, setLiveAssessing] = useState(false);
  const [livePreview, setLivePreview] = useState<SubmissionResult | null>(null);
  const [preview, setPreview] = useState<SubmissionResult | null>(null);
  const [result, setResult] = useState<SubmissionResult | null>(null);

  function buildSubmissionPayloadState(options?: { advisory?: boolean }): PayloadBuildState {
    const advisory = options?.advisory === true;
    if (!candidateId.trim() || !candidateName.trim() || !sourceReference.trim()) {
      return {
        payload: null,
        issue: "Fill candidate id, candidate name, and source reference to get a live route.",
      };
    }

    const payload: Record<string, unknown> = {
      candidate_id: candidateId.trim(),
      candidate_name: candidateName.trim(),
      source_type: sourceType,
      source_reference: sourceReference.trim(),
      mission_alignment: emptyToNull(missionAlignment),
      capability_gap_id: emptyToNull(capabilityGapId),
      notes: emptyToNull(notes),
      record_shape: recordShape,
    };

    if (recordShape === "fast_path") {
      if (
        !advisory &&
        (!claimedValue.trim() ||
          !firstPassSummary.trim() ||
          !adoptionTarget.trim() ||
          !whyThisRoute.trim() ||
          !whyNotAlternatives.trim() ||
          !needBoundedProof.trim() ||
          !nextArtifact.trim())
      ) {
        return {
          payload: null,
          issue:
            "Fill the fast-path fields to get a live route for the current submission shape.",
        };
      }
      payload.fast_path = {
        record_date: new Date().toISOString().slice(0, 10),
        claimed_value: claimedValue.trim() || "Pending operator value statement.",
        first_pass_summary: firstPassSummary.trim() || "Pending operator summary.",
        adoption_target: adoptionTarget.trim() || "reusable internal operating logic",
        decision_state: decisionState,
        route_destination: routeDestination,
        why_this_route: whyThisRoute.trim() || "Pending route rationale draft.",
        why_not_alternatives:
          whyNotAlternatives.trim() || "Pending alternative-route rationale draft.",
        need_bounded_proof:
          needBoundedProof.trim() || "Pending bounded proof requirement draft.",
        next_artifact:
          nextArtifact.trim() ||
          `architecture/02-experiments/${getTodayKey()}-${slugifyCandidateId(candidateId)}.md`,
      };
    }

    if (recordShape === "split_case") {
      if (!caseRecordJson.trim()) {
        return {
          payload: null,
          issue: "Provide valid split-case JSON to get a live route for split-case mode.",
        };
      }
      try {
        payload.case_record = JSON.parse(caseRecordJson);
      } catch {
        return {
          payload: null,
          issue: "Split-case JSON must be valid before the live route can run.",
        };
      }
    }

    return { payload, issue: null };
  }

  function buildSubmissionPayload() {
    const state = buildSubmissionPayloadState({ advisory: false });
    if (!state.payload) {
      throw new Error(state.issue || "Discovery submission payload is incomplete.");
    }
    return state.payload;
  }

  async function runSubmission(dryRun: boolean) {
    if (dryRun) {
      setPreviewing(true);
      setPreviewError(null);
    } else {
      setSubmitting(true);
    }
    setError(null);

    try {
      const searchParams = new URLSearchParams();
      if (dryRun) {
        searchParams.set("dry_run", "1");
      }
      if (!dryRun && processWithEngine) {
        searchParams.set("process_with_engine", "1");
      }
      const response = await fetch(
        `/api/directive-workspace/discovery/submissions${
          searchParams.size > 0 ? `?${searchParams.toString()}` : ""
        }`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildSubmissionPayload()),
        },
      );
      const responsePayload = (await response.json()) as SubmissionResult & {
        msg?: string;
      };

      if (!response.ok) {
        throw new Error(responsePayload.msg || "Failed to submit discovery entry.");
      }

      if (dryRun) {
        setPreview(responsePayload);
      } else {
        setResult(responsePayload);
        setPreview(responsePayload);
        onSubmitted?.();
      }
    } catch (submissionError) {
      const message =
        submissionError instanceof Error
          ? submissionError.message
          : "Unknown discovery submission error.";
      if (dryRun) {
        setPreviewError(message);
      } else {
        setError(message);
      }
    } finally {
      if (dryRun) {
        setPreviewing(false);
      } else {
        setSubmitting(false);
      }
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    await runSubmission(false);
  }

  useEffect(() => {
    const state = buildSubmissionPayloadState({ advisory: true });
    if (!state.payload) {
      setLivePreview(null);
      setLiveAdvisoryIssue(state.issue);
      setLiveAssessing(false);
      return;
    }

    setLiveAdvisoryIssue(null);
    setLiveAssessing(true);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(
          "/api/directive-workspace/discovery/submissions?dry_run=1",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(state.payload),
            signal: controller.signal,
          },
        );
        const responsePayload = (await response.json()) as SubmissionResult & {
          msg?: string;
        };

        if (!response.ok) {
          throw new Error(responsePayload.msg || "Failed to compute live discovery route.");
        }

        setLivePreview(responsePayload);
        setLiveAdvisoryIssue(null);
      } catch (liveError) {
        if (controller.signal.aborted) {
          return;
        }
        setLivePreview(null);
        setLiveAdvisoryIssue(
          liveError instanceof Error
            ? liveError.message
            : "Unknown live discovery routing error.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLiveAssessing(false);
        }
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [
    recordShape,
    candidateId,
    candidateName,
    sourceType,
    sourceReference,
    missionAlignment,
    capabilityGapId,
    notes,
    claimedValue,
    firstPassSummary,
    adoptionTarget,
    decisionState,
    routeDestination,
    whyThisRoute,
    whyNotAlternatives,
    needBoundedProof,
    nextArtifact,
    caseRecordJson,
  ]);

  const advisoryResult = livePreview || preview || result;
  const assessment = advisoryResult?.assessment || null;
  const trackScores = assessment?.score_breakdown?.track_scores;
  const shapeMismatch =
    assessment?.recommended_record_shape && recordShape !== assessment.recommended_record_shape
      ? {
          current: recordShape,
          recommended: assessment.recommended_record_shape,
        }
      : null;
  const routeMismatch =
    recordShape === "fast_path" &&
    assessment &&
    isTrackRouteable(assessment.recommended_track) &&
    routeDestination !== assessment.recommended_track
      ? {
          current: routeDestination,
          recommended: assessment.recommended_track,
        }
      : null;
  const gapMismatch =
    assessment?.matched_gap_id &&
    capabilityGapId.trim() !== assessment.matched_gap_id
      ? assessment.matched_gap_id
      : null;
  const recommendedAdoptionTarget = suggestAdoptionTarget(assessment?.recommended_track);
  const recommendedNextArtifact =
    recordShape === "fast_path"
      ? suggestNextArtifactPath(assessment?.recommended_track, candidateId)
      : null;
  const recommendedNeedBoundedProof =
    recordShape === "fast_path" ? suggestNeedBoundedProof(assessment?.recommended_track) : null;
  const suggestedWhyThisRoute = buildSuggestedWhyThisRoute(assessment);
  const suggestedWhyNotAlternatives = buildSuggestedWhyNotAlternatives(assessment);
  const adoptionTargetMismatch =
    recordShape === "fast_path" &&
    recommendedAdoptionTarget &&
    adoptionTarget.trim() !== recommendedAdoptionTarget
      ? {
          current: adoptionTarget.trim() || "none",
          recommended: recommendedAdoptionTarget,
        }
      : null;
  const nextArtifactMismatch =
    recordShape === "fast_path" &&
    recommendedNextArtifact &&
    nextArtifact.trim() !== recommendedNextArtifact
      ? {
          current: nextArtifact.trim() || "none",
          recommended: recommendedNextArtifact,
        }
      : null;
  const needBoundedProofMismatch =
    recordShape === "fast_path" &&
    recommendedNeedBoundedProof &&
    needBoundedProof.trim() !== recommendedNeedBoundedProof
      ? {
          current: needBoundedProof.trim() || "none",
          recommended: recommendedNeedBoundedProof,
        }
      : null;
  const mismatchCount = [
    shapeMismatch,
    routeMismatch,
    gapMismatch,
    adoptionTargetMismatch,
    nextArtifactMismatch,
    needBoundedProofMismatch,
  ].filter(Boolean).length;
  const isCanonicallyAligned =
    Boolean(assessment) && !liveAssessing && !liveAdvisoryIssue && mismatchCount === 0;

  return (
    <section className="matte-panel p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="matte-panel-heading">Submit discovery entry</h3>
          <div className="mt-2 max-w-3xl text-xs text-text-secondary">
            Use the canonical Discovery front door instead of hand-writing queue or
            routing artifacts. This panel posts to the unified submission API and
            supports queue-only intake, fast-path routing, or a full split-case handoff.
          </div>
        </div>
        <div className="rounded-lg border border-border bg-bg-panel px-3 py-2 text-[11px] text-text-muted">
          API: <span className="font-mono">POST /api/directive-workspace/discovery/submissions</span>
        </div>
      </div>

      <form className="mt-5 space-y-5" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1 text-xs text-text-secondary">
            <span className="text-text-muted">submission shape</span>
            <select
              className="w-full rounded-lg border border-border bg-bg-panel px-3 py-2 text-sm text-white outline-none"
              value={recordShape}
              onChange={(event) => setRecordShape(event.target.value as SubmissionShape)}
            >
              <option value="queue_only">queue_only</option>
              <option value="fast_path">fast_path</option>
              <option value="split_case">split_case</option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-text-secondary">
            <span className="text-text-muted">candidate id</span>
            <input
              className="w-full rounded-lg border border-border bg-bg-panel px-3 py-2 text-sm text-white outline-none"
              value={candidateId}
              onChange={(event) => setCandidateId(event.target.value)}
              placeholder="dw-example-capability"
              required
            />
          </label>
          <label className="space-y-1 text-xs text-text-secondary">
            <span className="text-text-muted">candidate name</span>
            <input
              className="w-full rounded-lg border border-border bg-bg-panel px-3 py-2 text-sm text-white outline-none"
              value={candidateName}
              onChange={(event) => setCandidateName(event.target.value)}
              placeholder="Example capability"
              required
            />
          </label>
          <label className="space-y-1 text-xs text-text-secondary">
            <span className="text-text-muted">source type</span>
            <select
              className="w-full rounded-lg border border-border bg-bg-panel px-3 py-2 text-sm text-white outline-none"
              value={sourceType}
              onChange={(event) =>
                setSourceType(event.target.value as (typeof SOURCE_TYPE_OPTIONS)[number])
              }
            >
              {SOURCE_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-xs text-text-secondary">
            <span className="text-text-muted">source reference</span>
            <input
              className="w-full rounded-lg border border-border bg-bg-panel px-3 py-2 text-sm text-white outline-none"
              value={sourceReference}
              onChange={(event) => setSourceReference(event.target.value)}
              placeholder="https://example.com/source or internal signal ref"
              required
            />
          </label>
          <label className="space-y-1 text-xs text-text-secondary">
            <span className="text-text-muted">capability gap id</span>
            <input
              className="w-full rounded-lg border border-border bg-bg-panel px-3 py-2 text-sm text-white outline-none"
              value={capabilityGapId}
              onChange={(event) => setCapabilityGapId(event.target.value)}
              placeholder="optional unresolved gap id"
            />
          </label>
          <label className="space-y-1 text-xs text-text-secondary md:col-span-2">
            <span className="text-text-muted">mission alignment</span>
            <textarea
              className="min-h-[72px] w-full rounded-lg border border-border bg-bg-panel px-3 py-2 text-sm text-white outline-none"
              value={missionAlignment}
              onChange={(event) => setMissionAlignment(event.target.value)}
              placeholder="Which active mission objective does this serve?"
            />
          </label>
          <label className="space-y-1 text-xs text-text-secondary md:col-span-2">
            <span className="text-text-muted">notes</span>
            <textarea
              className="min-h-[72px] w-full rounded-lg border border-border bg-bg-panel px-3 py-2 text-sm text-white outline-none"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Operator notes, caveats, or context."
            />
          </label>
        </div>

        {recordShape === "fast_path" && (
          <div className="rounded-xl border border-border bg-bg-panel/40 p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
              Fast-path routing
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-xs text-text-secondary">
                <span className="text-text-muted">claimed value</span>
                <textarea
                  className="min-h-[72px] w-full rounded-lg border border-border bg-bg-panel px-3 py-2 text-sm text-white outline-none"
                  value={claimedValue}
                  onChange={(event) => setClaimedValue(event.target.value)}
                  required={recordShape === "fast_path"}
                />
              </label>
              <label className="space-y-1 text-xs text-text-secondary">
                <span className="text-text-muted">first-pass summary</span>
                <textarea
                  className="min-h-[72px] w-full rounded-lg border border-border bg-bg-panel px-3 py-2 text-sm text-white outline-none"
                  value={firstPassSummary}
                  onChange={(event) => setFirstPassSummary(event.target.value)}
                  required={recordShape === "fast_path"}
                />
              </label>
              <label className="space-y-1 text-xs text-text-secondary">
                <span className="text-text-muted">adoption target</span>
                <input
                  className="w-full rounded-lg border border-border bg-bg-panel px-3 py-2 text-sm text-white outline-none"
                  value={adoptionTarget}
                  onChange={(event) => setAdoptionTarget(event.target.value)}
                  required={recordShape === "fast_path"}
                />
              </label>
              <label className="space-y-1 text-xs text-text-secondary">
                <span className="text-text-muted">decision state</span>
                <select
                  className="w-full rounded-lg border border-border bg-bg-panel px-3 py-2 text-sm text-white outline-none"
                  value={decisionState}
                  onChange={(event) =>
                    setDecisionState(
                      event.target.value as (typeof DECISION_STATE_OPTIONS)[number],
                    )
                  }
                >
                  {DECISION_STATE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs text-text-secondary">
                <span className="text-text-muted">route destination</span>
                <select
                  className="w-full rounded-lg border border-border bg-bg-panel px-3 py-2 text-sm text-white outline-none"
                  value={routeDestination}
                  onChange={(event) =>
                    setRouteDestination(
                      event.target.value as (typeof ROUTE_DESTINATION_OPTIONS)[number],
                    )
                  }
                >
                  {ROUTE_DESTINATION_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs text-text-secondary">
                <span className="text-text-muted">next artifact</span>
                <input
                  className="w-full rounded-lg border border-border bg-bg-panel px-3 py-2 text-sm text-white outline-none"
                  value={nextArtifact}
                  onChange={(event) => setNextArtifact(event.target.value)}
                  placeholder="architecture/02-experiments/... or forge/records/..."
                  required={recordShape === "fast_path"}
                />
              </label>
              <label className="space-y-1 text-xs text-text-secondary md:col-span-2">
                <span className="text-text-muted">why this route</span>
                <textarea
                  className="min-h-[72px] w-full rounded-lg border border-border bg-bg-panel px-3 py-2 text-sm text-white outline-none"
                  value={whyThisRoute}
                  onChange={(event) => setWhyThisRoute(event.target.value)}
                  required={recordShape === "fast_path"}
                />
              </label>
              <label className="space-y-1 text-xs text-text-secondary md:col-span-2">
                <span className="text-text-muted">why not the alternatives</span>
                <textarea
                  className="min-h-[72px] w-full rounded-lg border border-border bg-bg-panel px-3 py-2 text-sm text-white outline-none"
                  value={whyNotAlternatives}
                  onChange={(event) => setWhyNotAlternatives(event.target.value)}
                  required={recordShape === "fast_path"}
                />
              </label>
              <label className="space-y-1 text-xs text-text-secondary md:col-span-2">
                <span className="text-text-muted">need bounded proof</span>
                <textarea
                  className="min-h-[72px] w-full rounded-lg border border-border bg-bg-panel px-3 py-2 text-sm text-white outline-none"
                  value={needBoundedProof}
                  onChange={(event) => setNeedBoundedProof(event.target.value)}
                  required={recordShape === "fast_path"}
                />
              </label>
            </div>
          </div>
        )}

        {recordShape === "split_case" && (
          <div className="rounded-xl border border-border bg-bg-panel/40 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Split-case payload
                </div>
                <div className="mt-1 text-xs text-text-secondary">
                  Use this when the candidate needs explicit intake, triage, routing, and
                  optional completion records in one submission.
                </div>
              </div>
              <button
                type="button"
                className="rounded-lg border border-border bg-bg-panel px-3 py-1.5 text-xs text-text-secondary transition hover:text-white"
                onClick={() =>
                  setCaseRecordJson(
                    buildSplitCaseTemplate(candidateId, candidateName, sourceType),
                  )
                }
              >
                Insert template
              </button>
            </div>
            <textarea
              className="min-h-[420px] w-full rounded-lg border border-border bg-bg-panel px-3 py-2 font-mono text-xs text-white outline-none"
              value={caseRecordJson}
              onChange={(event) => setCaseRecordJson(event.target.value)}
              placeholder='{"intake": {...}, "triage": {...}, "routing": {...}}'
              required={recordShape === "split_case"}
            />
          </div>
        )}

        <div className="rounded-xl border border-border bg-bg-panel/40 px-4 py-3">
          <label className="flex items-start gap-3 text-sm text-text-secondary">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border border-border bg-bg-panel"
              checked={processWithEngine}
              onChange={(event) => setProcessWithEngine(event.target.checked)}
            />
            <span>
              <span className="font-medium text-white">Also process with Directive Engine</span>
              <span className="mt-1 block text-xs text-text-muted">
                Submit still enters through Discovery first. When enabled, Mission Control
                also persists a canonical Engine run record and paired Markdown report under
                <span className="font-mono"> runtime/standalone-host/engine-runs/</span>.
              </span>
            </span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={previewing || submitting}
            onClick={() => void runSubmission(true)}
            className="rounded-xl border border-border bg-bg-panel px-4 py-2 text-sm text-text-secondary transition hover:bg-bg-card hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {previewing ? "Previewing..." : "Preview route"}
          </button>
          <button
            type="submit"
            disabled={submitting || previewing}
            className="rounded-xl border border-border bg-bg-elevated px-4 py-2 text-sm text-white transition hover:bg-bg-card disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Submitting..." : "Submit discovery entry"}
          </button>
          <div className="text-xs text-text-muted">
            Preview runs the canonical routing engine without mutating the queue. Submit
            writes through the same path
            {processWithEngine ? " and also records a canonical Engine run." : "."}
          </div>
        </div>

        {previewError && (
          <div className="rounded-xl border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-sm text-status-warning">
            {previewError}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-status-error/40 bg-status-error/10 px-3 py-2 text-sm text-status-error">
            {error}
          </div>
        )}

        {assessment && (
          <div className="rounded-xl border border-border bg-bg-panel/45 px-4 py-4 text-sm text-text-secondary">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-white">Mission routing advisory</div>
                <div className="mt-1 text-xs text-text-muted">
                  Canonical Discovery assessment from the product-owned routing engine.
                </div>
              </div>
              <div className="rounded-full border border-border px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-text-muted">
                {liveAssessing
                  ? "live updating"
                  : advisoryResult === livePreview
                    ? "live advisory"
                    : preview?.mode === "dry_run"
                      ? "preview"
                      : "latest submission"}
              </div>
            </div>
            {isCanonicallyAligned && (
              <div className="mt-3 rounded-lg border border-status-success/40 bg-status-success/10 px-3 py-2 text-xs text-status-success">
                Current form is aligned with the canonical Discovery recommendation.
              </div>
            )}
            {liveAdvisoryIssue && (
              <div className="mt-3 rounded-lg border border-border bg-bg-panel px-3 py-2 text-xs text-text-muted">
                {liveAdvisoryIssue}
              </div>
            )}
            <div className="mt-3 grid gap-3 text-xs md:grid-cols-2 xl:grid-cols-4">
              <div>
                <div className="text-text-muted">recommended track</div>
                <div className="mt-1 text-white">
                  {formatAssessmentLabel(assessment.recommended_track)}
                </div>
              </div>
              <div>
                <div className="text-text-muted">recommended shape</div>
                <div className="mt-1 text-white">
                  {formatAssessmentLabel(assessment.recommended_record_shape)}
                </div>
              </div>
              <div>
                <div className="text-text-muted">mission priority</div>
                <div className="mt-1 text-white">
                  {formatAssessmentLabel(assessment.mission_priority_score)}
                </div>
              </div>
              <div>
                <div className="text-text-muted">confidence</div>
                <div className="mt-1 text-white">
                  {formatAssessmentLabel(assessment.confidence)}
                </div>
              </div>
              <div>
                <div className="text-text-muted">matched gap</div>
                <div className="mt-1 text-white">
                  {assessment.matched_gap_id
                    ? `${assessment.matched_gap_id}${
                        assessment.matched_gap_rank != null
                          ? ` (#${assessment.matched_gap_rank})`
                          : ""
                      }`
                    : "n/a"}
                </div>
              </div>
              <div>
                <div className="text-text-muted">human review</div>
                <div className="mt-1 text-white">
                  {assessment.needs_human_review ? "required" : "not required"}
                </div>
              </div>
              <div>
                <div className="text-text-muted">explicit route</div>
                <div className="mt-1 text-white">
                  {formatAssessmentLabel(assessment.explicit_route_destination)}
                </div>
              </div>
              <div>
                <div className="text-text-muted">route conflict</div>
                <div className="mt-1 text-white">
                  {assessment.route_conflict ? "yes" : "no"}
                </div>
              </div>
            </div>
            {mismatchCount > 0 && (
              <div className="mt-3 rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-3 text-xs text-status-warning">
                <div className="font-semibold text-white">Current form differs from the canonical recommendation</div>
                <div className="mt-2 space-y-1">
                  {shapeMismatch && (
                    <div>
                      shape mismatch: current `{shapeMismatch.current}` vs recommended `{shapeMismatch.recommended}`
                    </div>
                  )}
                  {routeMismatch && (
                    <div>
                      route mismatch: current `{routeMismatch.current}` vs recommended `{routeMismatch.recommended}`
                    </div>
                  )}
                  {gapMismatch && (
                    <div>
                      gap mismatch: current `{capabilityGapId.trim() || "none"}` vs matched `{gapMismatch}`
                    </div>
                  )}
                  {adoptionTargetMismatch && (
                    <div>
                      adoption target mismatch: current `{adoptionTargetMismatch.current}` vs recommended `{adoptionTargetMismatch.recommended}`
                    </div>
                  )}
                  {nextArtifactMismatch && (
                    <div>
                      next artifact mismatch: current `{nextArtifactMismatch.current}` vs recommended `{nextArtifactMismatch.recommended}`
                    </div>
                  )}
                  {needBoundedProofMismatch && (
                    <div>
                      bounded proof mismatch: current `{needBoundedProofMismatch.current}` vs recommended `{needBoundedProofMismatch.recommended}`
                    </div>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {shapeMismatch && (
                    <button
                      type="button"
                      className="rounded-lg border border-border bg-bg-panel px-3 py-1.5 text-xs text-text-secondary transition hover:bg-bg-card hover:text-white"
                      onClick={() => setRecordShape(shapeMismatch.recommended)}
                    >
                      Use recommended shape
                    </button>
                  )}
                  {routeMismatch && (
                    <button
                      type="button"
                      className="rounded-lg border border-border bg-bg-panel px-3 py-1.5 text-xs text-text-secondary transition hover:bg-bg-card hover:text-white"
                      onClick={() => setRouteDestination(routeMismatch.recommended)}
                    >
                      Use recommended route
                    </button>
                  )}
                  {gapMismatch && (
                    <button
                      type="button"
                      className="rounded-lg border border-border bg-bg-panel px-3 py-1.5 text-xs text-text-secondary transition hover:bg-bg-card hover:text-white"
                      onClick={() => setCapabilityGapId(gapMismatch)}
                    >
                      Use matched gap
                    </button>
                  )}
                  {adoptionTargetMismatch && (
                    <button
                      type="button"
                      className="rounded-lg border border-border bg-bg-panel px-3 py-1.5 text-xs text-text-secondary transition hover:bg-bg-card hover:text-white"
                      onClick={() => setAdoptionTarget(adoptionTargetMismatch.recommended)}
                    >
                      Use recommended target
                    </button>
                  )}
                  {nextArtifactMismatch && (
                    <button
                      type="button"
                      className="rounded-lg border border-border bg-bg-panel px-3 py-1.5 text-xs text-text-secondary transition hover:bg-bg-card hover:text-white"
                      onClick={() => setNextArtifact(nextArtifactMismatch.recommended)}
                    >
                      Use recommended artifact
                    </button>
                  )}
                  {needBoundedProofMismatch && (
                    <button
                      type="button"
                      className="rounded-lg border border-border bg-bg-panel px-3 py-1.5 text-xs text-text-secondary transition hover:bg-bg-card hover:text-white"
                      onClick={() => setNeedBoundedProof(needBoundedProofMismatch.recommended)}
                    >
                      Use recommended proof
                    </button>
                  )}
                </div>
              </div>
            )}
            {recordShape === "fast_path" && (suggestedWhyThisRoute || suggestedWhyNotAlternatives) && (
              <div className="mt-3 rounded-lg border border-border bg-bg-panel px-3 py-3 text-xs text-text-secondary">
                <div className="font-semibold text-white">Suggested route text</div>
                <div className="mt-2 space-y-3">
                  {suggestedWhyThisRoute && (
                    <div>
                      <div className="text-text-muted">why this route</div>
                      <div className="mt-1 text-white">{suggestedWhyThisRoute}</div>
                      <button
                        type="button"
                        className="mt-2 rounded-lg border border-border bg-bg-panel px-3 py-1.5 text-xs text-text-secondary transition hover:bg-bg-card hover:text-white"
                        onClick={() => setWhyThisRoute(suggestedWhyThisRoute)}
                      >
                        Use route rationale
                      </button>
                    </div>
                  )}
                  {suggestedWhyNotAlternatives && (
                    <div>
                      <div className="text-text-muted">why not alternatives</div>
                      <div className="mt-1 text-white">{suggestedWhyNotAlternatives}</div>
                      <button
                        type="button"
                        className="mt-2 rounded-lg border border-border bg-bg-panel px-3 py-1.5 text-xs text-text-secondary transition hover:bg-bg-card hover:text-white"
                        onClick={() => setWhyNotAlternatives(suggestedWhyNotAlternatives)}
                      >
                        Use alternatives rationale
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
            {trackScores && (
              <div className="mt-3 grid gap-3 text-xs md:grid-cols-3">
                <div className="rounded-lg border border-border bg-bg-panel px-3 py-2">
                  <div className="text-text-muted">discovery score</div>
                  <div className="mt-1 text-white">
                    {formatAssessmentLabel(trackScores.discovery)}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-bg-panel px-3 py-2">
                  <div className="text-text-muted">architecture score</div>
                  <div className="mt-1 text-white">
                    {formatAssessmentLabel(trackScores.architecture)}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-bg-panel px-3 py-2">
                  <div className="text-text-muted">forge score</div>
                  <div className="mt-1 text-white">
                    {formatAssessmentLabel(trackScores.forge)}
                  </div>
                </div>
              </div>
            )}
            {assessment.rationale && assessment.rationale.length > 0 && (
              <div className="mt-3">
                <div className="text-xs text-text-muted">rationale</div>
                <div className="mt-1 space-y-1 text-xs text-white">
                  {assessment.rationale.map((line, index) => (
                    <div key={`${index}-${line}`}>{line}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {result && (
          <div className="rounded-xl border border-status-success/30 bg-status-success/10 px-3 py-3 text-sm text-text-secondary">
            <div className="font-semibold text-white">Discovery submission complete</div>
            <div className="mt-2 grid gap-2 text-xs md:grid-cols-2 xl:grid-cols-4">
              <div>
                <span className="text-text-muted">candidate</span>
                <div className="mt-0.5 font-mono text-[11px] text-white">
                  {result.candidate_id || "n/a"}
                </div>
              </div>
              <div>
                <span className="text-text-muted">shape</span>
                <div className="mt-0.5 text-white">{result.record_shape || "n/a"}</div>
              </div>
              <div>
                <span className="text-text-muted">status</span>
                <div className="mt-0.5 text-white">{result.status || "n/a"}</div>
              </div>
              <div>
                <span className="text-text-muted">mode</span>
                <div className="mt-0.5 text-white">{result.mode || "n/a"}</div>
              </div>
            </div>
            {result.appliedStages && result.appliedStages.length > 0 && (
              <div className="mt-3 text-xs">
                <span className="text-text-muted">applied stages</span>
                <div className="mt-1 text-white">{result.appliedStages.join(" -> ")}</div>
              </div>
            )}
            {result.createdPaths && Object.keys(result.createdPaths).length > 0 && (
              <div className="mt-3">
                <div className="text-xs text-text-muted">created paths</div>
                <div className="mt-1 space-y-1 font-mono text-[11px] text-white">
                  {Object.entries(result.createdPaths).map(([key, value]) => (
                    <div key={key}>
                      {key}: {value || "n/a"}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {result.engine && (
              <div className="mt-3 rounded-lg border border-border bg-bg-panel/60 px-3 py-3 text-xs">
                <div className="font-semibold text-white">Directive Engine result</div>
                <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <span className="text-text-muted">status</span>
                    <div className="mt-0.5 text-white">
                      {result.engine.ok
                        ? result.engine.processed
                          ? "processed"
                          : result.engine.reason || "not processed"
                        : "error"}
                    </div>
                  </div>
                  <div>
                    <span className="text-text-muted">lane</span>
                    <div className="mt-0.5 text-white">
                      {result.engine.record?.selectedLane?.laneId || "n/a"}
                    </div>
                  </div>
                  <div>
                    <span className="text-text-muted">usefulness</span>
                    <div className="mt-0.5 text-white">
                      {result.engine.record?.candidate?.usefulnessLevel || "n/a"}
                    </div>
                  </div>
                  <div>
                    <span className="text-text-muted">decision</span>
                    <div className="mt-0.5 text-white">
                      {result.engine.record?.decision?.decisionState || "n/a"}
                    </div>
                  </div>
                </div>
                {result.engine.record?.runId && (
                  <div className="mt-3">
                    <span className="text-text-muted">run id</span>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <div className="font-mono text-[11px] text-white">
                        {result.engine.record.runId}
                      </div>
                      {result.engine.ok
                      && result.engine.processed
                      && result.engine.record.runId && (
                        <Link
                          href={`/dashboard/directive-workspace/engine-runs/${encodeURIComponent(result.engine.record.runId)}`}
                          className="rounded-lg border border-border px-2.5 py-1 text-[11px] text-text-secondary transition hover:bg-bg-card hover:text-white"
                        >
                          Open detail
                        </Link>
                      )}
                    </div>
                  </div>
                )}
                {result.engine.record?.analysis?.usefulnessRationale && (
                  <div className="mt-3">
                    <span className="text-text-muted">usefulness rationale</span>
                    <div className="mt-1 text-white">
                      {result.engine.record.analysis.usefulnessRationale}
                    </div>
                  </div>
                )}
                {(result.engine.relativePath || result.engine.reportRelativePath) && (
                  <div className="mt-3">
                    <div className="text-text-muted">engine artifacts</div>
                    <div className="mt-1 space-y-1 font-mono text-[11px] text-white">
                      {result.engine.relativePath && (
                        <div>run record: {result.engine.relativePath}</div>
                      )}
                      {result.engine.reportRelativePath && (
                        <div>run report: {result.engine.reportRelativePath}</div>
                      )}
                    </div>
                  </div>
                )}
                {!result.engine.ok && result.engine.error && (
                  <div className="mt-3 text-status-warning">{result.engine.error}</div>
                )}
              </div>
            )}
          </div>
        )}
      </form>
    </section>
  );
}
